import "server-only";
import { signInCvParser } from "@/lib/agents/session";
import { parseCv } from "@/lib/ai/parse-cv";
import type { CandidateProfile } from "@/lib/ai/cv-parsing";
import type { CalibrationModel, CompanyContext } from "@/lib/ai/role-analysis";
import { captureSeamError } from "@/lib/observability/sentry";

/**
 * The CV Parsing Agent's one job, as a principal (076, slice three of
 * agents-as-principals).
 *
 * The seam splits at judgment (D2): the recruiter's acts — choosing
 * the file, the placeholder candidate row, every storage write — stay
 * the recruiter's, and the BYTES arrive here as an argument, which is
 * why the agent holds no storage grant at all. What runs under the
 * parser's session is the judgment: the model call and the persistence
 * of what it concluded — the structured profile, fit_dimensions, and
 * the identity columns it overwrites. When a profile says something
 * wrong about a person, the trail now says an agent concluded it.
 *
 * Fails soft per D5: a refused sign-in returns `agent_unavailable`
 * with the sentence the caller writes into cv_parse_error under its
 * own lawful session — the file always lands, the profile says why it
 * is empty, and there is no service-role fallback. A model/parse
 * failure returns `parse_failed` after the agent records the honest
 * failure state itself; a failed parse writes NO trail event (D4 —
 * a log line, not history).
 */

/** The D5 sentence, written into cv_parse_error when the agent cannot run. */
export const PARSER_UNAVAILABLE_MESSAGE =
  "The CV Parsing Agent could not run — an operator has suspended it or " +
  "its credentials are absent. The file is stored; retry when the agent " +
  "is restored.";

export type CvParseRunResult =
  | { ok: true; parsed: CandidateProfile }
  | { ok: false; kind: "agent_unavailable" | "parse_failed"; reason: string };

export async function runCvParseAndPersist(args: {
  candidateId: string;
  projectId: string;
  organizationId: string;
  fileBytes: Uint8Array;
  mimeType: string;
  /** Storage path the caller already uploaded the bytes to — recorded
   * on the row alongside the profile; never read by the agent. */
  cvPath: string;
  calibration: Partial<CalibrationModel>;
  company: Partial<CompanyContext>;
  trigger: "upload" | "network_copy" | "retry";
  /** The name the row carried before the parse (the filename fallback,
   * or the copied row's name) — for the identity_changed flag. */
  priorName?: string | null;
}): Promise<CvParseRunResult> {
  const session = await signInCvParser();
  if (!session.ok) {
    captureSeamError(
      `[cv-parser] parse skipped: ${session.reason}. ` +
        "The file and the candidate row stand; cv_parse_error carries the sentence."
    );
    return { ok: false, kind: "agent_unavailable", reason: session.reason };
  }

  try {
    let parsed: CandidateProfile;
    try {
      parsed = await parseCv(
        args.fileBytes,
        args.mimeType,
        {
          calibration: args.calibration,
          company: args.company,
          projectId: args.projectId,
          organizationId: args.organizationId,
        },
        // The agent's session carries the Skills Studio read — lawful
        // under skills_agent_select, and immune to the after() cookie
        // caveat the human-session path lived with.
        { skillClient: session.client }
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "CV parsing failed.";
      // The honest failure state, written by the agent that failed. No
      // trail event — a failed parse is a log line, not history (D4).
      const { error: failErr } = await session.client
        .from("candidates")
        .update({
          cv_processing: false,
          cv_parse_error: message,
          updated_at: new Date().toISOString(),
        })
        .eq("id", args.candidateId);
      if (failErr) {
        captureSeamError(
          "[cv-parser] failed to persist the parse-failure state",
          args.candidateId,
          failErr
        );
      }
      return { ok: false, kind: "parse_failed", reason: message };
    }

    const identityChanged =
      (parsed.full_name ?? null) !== (args.priorName ?? null);

    const { error: updateError } = await session.client
      .from("candidates")
      .update({
        cv_url: args.cvPath,
        full_name: parsed.full_name || args.priorName || "Untitled candidate",
        email: parsed.email,
        linkedin_url: parsed.linkedin_url,
        current_title: parsed.current_title,
        current_company: parsed.current_company,
        archetype: parsed.archetype,
        cv_structured: parsed,
        cv_processing: false,
        cv_parse_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", args.candidateId);

    if (updateError) {
      return {
        ok: false,
        kind: "parse_failed",
        reason: `Failed to persist parsed profile: ${updateError.message}`,
      };
    }

    const { error: eventErr } = await session.client.rpc("record_agent_event", {
      p_event_type: "candidate_parsed",
      p_project_id: args.projectId,
      p_candidate_id: args.candidateId,
      p_detail: {
        agent_kind: "cv_parser",
        trigger: args.trigger,
        identity_changed: identityChanged,
      },
    });
    if (eventErr) {
      captureSeamError(
        "[cv-parser] failed to record the parse event",
        args.candidateId,
        eventErr
      );
    }

    return { ok: true, parsed };
  } finally {
    // Persist nothing (D3): revoke the run's session from GoTrue's ledger.
    await session.signOut();
  }
}
