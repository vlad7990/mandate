import "server-only";
import { getAnthropic } from "@/lib/anthropic";
import {
  SHORTLIST_REPORT_SCHEMA,
  SHORTLIST_REPORT_SYSTEM_PROMPT,
  type ShortlistReport,
} from "./shortlist-report";
import type { CalibrationModel, CompanyContext } from "./role-analysis";
import type { CandidateProfile } from "./cv-parsing";
import { signInShortlistAgent } from "@/lib/agents/session";
import { applySkillsToPrompt } from "@/lib/skills/skill-injector";
import { captureSeamError } from "@/lib/observability/sentry";

const SHORTLIST_MODEL = "claude-sonnet-4-6";

export type ShortlistGenerationInput = {
  role_context: {
    title: string;
    role_title: string | null;
    inferred_scope: string | null;
    role_structure: CalibrationModel["role_structure"] | null;
  };
  company_context: Partial<CompanyContext>;
  calibration: Partial<CalibrationModel>;
  recruiter_narrative: string | null;
  slate: Array<{
    candidate_id: string;
    full_name: string;
    rank: number | null;
    overall_score: number | null;
    profile: Partial<CandidateProfile>;
    fit_dimensions: CandidateProfile["fit_dimensions"] | null;
  }>;
};

/**
 * Generate the submission-ready shortlist report. Synchronous —
 * the recruiter waits ~5–10s for the Anthropic round-trip while
 * the form button shows a pending state.
 */
export async function generateShortlistReport(
  input: ShortlistGenerationInput,
  options?: { system?: string }
): Promise<ShortlistReport> {
  if (input.slate.length < 1) {
    throw new Error("Shortlist requires at least 1 candidate.");
  }
  if (input.slate.length > 10) {
    throw new Error("Shortlist capped at 10 candidates.");
  }

  const anthropic = getAnthropic();
  const userPrompt = JSON.stringify(input, null, 2);

  const response = await anthropic.messages.create({
    model: SHORTLIST_MODEL,
    max_tokens: 3000,
    system: options?.system ?? SHORTLIST_REPORT_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
    output_config: {
      format: {
        type: "json_schema",
        schema: SHORTLIST_REPORT_SCHEMA,
      },
    },
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Shortlist report response contained no text block");
  }

  return JSON.parse(textBlock.text) as ShortlistReport;
}

// ────────────────────────────────────────────────────────────────────────
// The seam (093): the SHORTLIST AGENT's session, signed in per run —
// the SEVENTEENTH principal, the read-shaped conversion. The split
// (D2): the slate, the narrative, and the slate size are the
// recruiter's editorial acts, persisted by their own actions before
// the agent is asked to think (D5 fail-soft — the builder even
// auto-saves a dirty narrative first). The agent reads the slate row
// and its context under ITS OWN session (093's SELECT plus the
// pool's candidates/scores/projects reads), judges with the org's
// skills in the prompt (D6 — the second of §73's six uninjected
// seams closed), merge-writes ONLY report_content + updated_at
// through 093's pinned door, records the event with COUNTS (never
// names, never the report's text), and signs out persisting nothing.
// Submission stays the recruiter's act: the pin refuses a submitted
// slate BOTH ways, and this seam refuses it honestly before burning
// a model call.
// ────────────────────────────────────────────────────────────────────────

type ShortlistRunResult =
  | { status: "ready" }
  /** Shortlist/project missing or outside the agent's org-bound reach. */
  | { status: "unavailable" }
  /** The slate was submitted — the submitted report is the record
   * (D3, confirmed): the agent can neither touch it nor re-author it. */
  | { status: "submitted" }
  /** The Shortlist Agent refused to sign in — suspended from /ops or
   * credentials absent. Nothing was generated and NOTHING WAS
   * DESTROYED (D5): the slate, narrative, and any prior report stand. */
  | { status: "agent_unavailable"; reason: string }
  /** Generation or persistence failed; logged. */
  | { status: "failed" };

type ShortlistRow = {
  id: string;
  organization_id: string | null;
  slate_size: number;
  candidate_ids: string[];
  narrative: string;
  report_content: Record<string, unknown> | null;
  submitted_at: string | null;
};

export async function runShortlistReportAndPersist(
  projectId: string,
  shortlistId: string
): Promise<ShortlistRunResult> {
  const session = await signInShortlistAgent();
  if (!session.ok) {
    console.error(
      `[shortlist-report] The Shortlist Agent could not run — an ` +
        `operator has suspended it or its credentials are absent. The ` +
        `slate and narrative are saved. (${session.reason})`
    );
    return { status: "agent_unavailable", reason: session.reason };
  }

  try {
    const supabase = session.client;

    const { data: sl, error: slError } = await supabase
      .from("shortlists")
      .select(
        "id, organization_id, slate_size, candidate_ids, narrative, report_content, submitted_at"
      )
      .eq("id", shortlistId)
      .maybeSingle<ShortlistRow>();
    if (slError || !sl) return { status: "unavailable" };

    // The pin, answered before the spend: a submitted slate's report
    // is the record. The USING face would land the merge on zero rows
    // anyway — this refusal is the same boundary, honest and free.
    if (sl.submitted_at != null) return { status: "submitted" };
    if (sl.candidate_ids.length === 0) return { status: "unavailable" };

    const [{ data: project }, { data: candidates }, { data: scores }] =
      await Promise.all([
        supabase
          .from("projects")
          .select("id, title, calibration_model, company_context")
          .eq("id", projectId)
          .maybeSingle<{
            id: string;
            title: string;
            calibration_model: Partial<CalibrationModel> | null;
            company_context: Partial<CompanyContext> | null;
          }>(),
        supabase
          .from("candidates")
          .select("id, full_name, cv_structured")
          .in("id", sl.candidate_ids),
        supabase
          .from("candidate_scores")
          .select("candidate_id, rank_position, overall_score")
          .eq("project_id", projectId)
          .in("candidate_id", sl.candidate_ids),
      ]);

    if (!project) return { status: "unavailable" };

    const candidateMap = new Map(
      (candidates ?? []).map((c) => [
        c.id as string,
        c as { id: string; full_name: string; cv_structured: unknown },
      ])
    );
    const scoreMap = new Map(
      (scores ?? []).map((s) => [
        s.candidate_id as string,
        s as {
          candidate_id: string;
          rank_position: number | null;
          overall_score: number | null;
        },
      ])
    );

    // The slate input in the recruiter's chosen order — their
    // composition, read as composed.
    const slate: ShortlistGenerationInput["slate"] = sl.candidate_ids
      .map((cid) => {
        const cand = candidateMap.get(cid);
        const score = scoreMap.get(cid);
        if (!cand) return null;
        const profile = (cand.cv_structured ?? {}) as Partial<CandidateProfile>;
        return {
          candidate_id: cid,
          full_name: cand.full_name,
          rank: score?.rank_position ?? null,
          overall_score: score?.overall_score ?? null,
          profile,
          fit_dimensions: profile.fit_dimensions ?? null,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x != null);

    if (slate.length === 0) return { status: "unavailable" };

    // The judgment carries the org's skills (D6). The agent's own
    // session is the client; skills_agent_select (074) makes the
    // read lawful.
    const system = await applySkillsToPrompt(SHORTLIST_REPORT_SYSTEM_PROMPT, {
      projectId,
      organizationId: sl.organization_id,
      client: supabase,
    });

    const hadReport =
      sl.report_content != null && Object.keys(sl.report_content).length > 0;

    let report: ShortlistReport;
    try {
      report = await generateShortlistReport(
        {
          role_context: {
            title: project.title,
            role_title: project.calibration_model?.role_title ?? null,
            inferred_scope: project.calibration_model?.inferred_scope ?? null,
            role_structure: project.calibration_model?.role_structure ?? null,
          },
          company_context: project.company_context ?? {},
          calibration: project.calibration_model ?? {},
          recruiter_narrative: sl.narrative.trim() || null,
          slate,
        },
        { system }
      );
    } catch (err) {
      captureSeamError("[shortlist-report] agent generation failed", err);
      return { status: "failed" };
    }

    // The agent's merge-write: ONLY the report changes, through 093's
    // pinned door. The .select() makes a zero-row landing loud — a
    // submit that raced past the read above lands the merge NOWHERE,
    // and silence here would dress that refusal up as success.
    const { data: updated, error: updateError } = await supabase
      .from("shortlists")
      .update({
        report_content: report,
        updated_at: new Date().toISOString(),
      })
      .eq("id", sl.id)
      .select("id");
    if (updateError) {
      captureSeamError(
        "[shortlist-report] failed to persist the report",
        updateError
      );
      return { status: "failed" };
    }
    if (!updated || updated.length === 0) return { status: "submitted" };

    // The trail (D4): the trigger and COUNTS — never a candidate's
    // name, never the report's text. Best-effort after the landing.
    const { error: eventErr } = await supabase.rpc("record_agent_event", {
      p_event_type: "shortlist_report_generated",
      p_project_id: projectId,
      p_detail: {
        agent_kind: "shortlist",
        trigger: hadReport ? "regenerate" : "initial",
        slate: slate.length,
        scenarios: report.scenarios.length,
      },
    });
    if (eventErr) {
      captureSeamError(
        "[shortlist-report] failed to record the report event",
        eventErr
      );
    }

    return { status: "ready" };
  } finally {
    // Persist nothing (D3): revoke the run's session from GoTrue's ledger.
    await session.signOut();
  }
}
