import "server-only";
import { signInCvParser } from "@/lib/agents/session";
import { parseCv } from "@/lib/ai/parse-cv";
import type { CandidateProfile } from "@/lib/ai/cv-parsing";
import type { CalibrationModel, CompanyContext } from "@/lib/ai/role-analysis";
import { captureSeamError } from "@/lib/observability/sentry";
import { resolveParsedIdentity, type DeclaredIdentity } from "./identity";

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
  /**
   * The identity the SUBJECT declared about themselves — G.1, ruled in
   * the QA gate after §192 found the overwrite.
   *
   * Present only on the apply door, where a person typed their own name
   * and address and was shown the Art.13 notice against those exact
   * details. When present it WINS: the CV may not overwrite it. Absent
   * for a recruiter upload, where there is no declared identity to
   * defend and the CV is the only identity there is.
   *
   * The CV's claim is never discarded — it stays in `cv_structured`
   * verbatim (G.2), and a disagreement is recorded on the trail rather
   * than silently resolved.
   */
  declaredIdentity?: DeclaredIdentity | null;
}): Promise<CvParseRunResult> {
  const session = await signInCvParser();
  if (!session.ok) {
    console.error(
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
      // A zero-row write is a FAILURE, not a success: RLS filters silently,
      // so the caller must fall back to its own session (§128 F-1).
      const { error: failErr, count: failCount } = await session.client
        .from("candidates")
        .update(
          {
            cv_processing: false,
            cv_parse_error: message,
            updated_at: new Date().toISOString(),
          },
          { count: "exact" }
        )
        .eq("id", args.candidateId);
      if (failErr || (failCount ?? 0) === 0) {
        captureSeamError(
          "[cv-parser] failed to persist the parse-failure state",
          args.candidateId,
          failErr ?? new Error("zero rows written")
        );
      }
      return { ok: false, kind: "parse_failed", reason: message };
    }

    // G.1/G.2 — whose answer wins about who this person is. The rule and
    // its reasoning live in ./identity, where a test can reach them.
    const identity = resolveParsedIdentity({
      parsedName: parsed.full_name,
      parsedEmail: parsed.email,
      priorName: args.priorName,
      declared: args.declaredIdentity,
    });

    const { error: updateError, count: updateCount } = await session.client
      .from("candidates")
      .update(
        {
          cv_url: args.cvPath,
          full_name: identity.fullName,
          email: identity.email,
          linkedin_url: parsed.linkedin_url,
          current_title: parsed.current_title,
          current_company: parsed.current_company,
          archetype: parsed.archetype,
          cv_structured: parsed,
          cv_processing: false,
          cv_parse_error: null,
          updated_at: new Date().toISOString(),
        },
        { count: "exact" }
      )
      .eq("id", args.candidateId);

    if (updateError) {
      return {
        ok: false,
        kind: "parse_failed",
        reason: `Failed to persist parsed profile: ${updateError.message}`,
      };
    }
    if ((updateCount ?? 0) === 0) {
      // RLS filtered the write to zero rows and PostgREST calls that
      // success — the 0fa stall (§128 F-1). Refuse loudly so the caller
      // persists the honest failure under its own session.
      return {
        ok: false,
        kind: "parse_failed",
        reason:
          "The CV Parsing Agent could not persist the profile: the write matched no row the agent may update.",
      };
    }

    const { error: eventErr } = await session.client.rpc("record_agent_event", {
      p_event_type: "candidate_parsed",
      p_project_id: args.projectId,
      p_candidate_id: args.candidateId,
      p_detail: {
        agent_kind: "cv_parser",
        trigger: args.trigger,
        identity_changed: identity.identityChanged,
        // G.2: honest on the trail. `identity_conflict` says the file
        // disagreed with the person about who they are, and that the
        // person's own answer was the one kept.
        identity_declared: identity.identityDeclared,
        identity_conflict: identity.identityConflict,
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
