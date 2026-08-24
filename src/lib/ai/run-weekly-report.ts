import "server-only";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAnthropic } from "@/lib/anthropic";
import {
  WEEKLY_REPORT_SCHEMA,
  WEEKLY_REPORT_SYSTEM_PROMPT,
  type WeeklyReport,
} from "./weekly-report-agent";
import { applySkillsToPrompt } from "@/lib/skills/skill-injector";
import type { CandidateProfile } from "@/lib/ai/cv-parsing";
import { signInSearchHealthAgent } from "@/lib/agents/session";
import { captureSeamError } from "@/lib/observability/sentry";

const WEEKLY_REPORT_MODEL = "claude-sonnet-4-6";

export type WeeklyReportInput = {
  week_starting: string;
  project: {
    title: string;
    company_name: string;
    calibration: unknown;
    company_context: unknown;
  };
  candidates_sourced: Array<{
    id: string;
    name: string;
    current_title: string | null;
    current_company: string | null;
    archetype: string | null;
  }>;
  pipeline_moves: Array<{
    candidate_id: string;
    name: string;
    from_stage: string;
    to_stage: string;
    moved_at: string;
  }>;
  rank_moves: Array<{
    candidate_id: string;
    name: string;
    current_rank: number;
    previous_rank: number;
  }>;
  top_candidates: Array<{
    id: string;
    name: string;
    current_title: string | null;
    current_company: string | null;
    archetype: string | null;
    overall_score: number | null;
    tier: string | null;
    headline: string | null;
  }>;
  feedback: Array<{
    feedback_type: string;
    content: string;
    candidate_id: string | null;
    summary: string | null;
    created_at: string;
  }>;
};

export type RunWeeklyReportContext = {
  projectId: string;
  organizationId: string | null;
  /** Read recruiter-authored skills under this client — the agent's
   * own session when the seam runs; defaults to the request session. */
  skillClient?: SupabaseClient;
};

export async function runWeeklyReport(
  input: WeeklyReportInput,
  ctx: RunWeeklyReportContext
): Promise<{ report: WeeklyReport; model: string }> {
  const anthropic = getAnthropic();
  const userPrompt = JSON.stringify(input, null, 2);
  const system = await applySkillsToPrompt(WEEKLY_REPORT_SYSTEM_PROMPT, {
    projectId: ctx.projectId,
    organizationId: ctx.organizationId,
    client: ctx.skillClient,
  });

  const response = await anthropic.messages.create({
    model: WEEKLY_REPORT_MODEL,
    max_tokens: 3000,
    system,
    messages: [{ role: "user", content: userPrompt }],
    output_config: {
      format: {
        type: "json_schema",
        schema: WEEKLY_REPORT_SCHEMA,
      },
    },
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Weekly-report response contained no text block");
  }

  const partial = JSON.parse(textBlock.text) as Omit<
    WeeklyReport,
    "week_starting"
  >;
  return {
    report: { ...partial, week_starting: input.week_starting },
    model: WEEKLY_REPORT_MODEL,
  };
}

// ────────────────────────────────────────────────────────────────────────
// The seam (087): the SEARCH HEALTH AGENT's second judgment — the
// weekly report. Every read is lawfully the agent's own under the
// pool (projects, candidates, candidate_scores, the week's feedback);
// the week's assembly (Monday-of, sourced/moves/rank-moves) is
// deterministic code over those reads. The one write is the slice's
// one new door: project_reports INSERT under a generated_by-pinned,
// no-SELECT grant — so the seam MINTS THE ROW's ID ITSELF and inserts
// BLIND (082's RETURNING doctrine applied constructively), stamps
// generated_by with its own identity, records the event with a date
// and counts, and signs out persisting nothing. Landed reports are
// the recruiter's records: the agent holds no UPDATE and no DELETE.
// ────────────────────────────────────────────────────────────────────────

export type WeeklyReportRunResult =
  | { status: "ready"; id: string }
  /** Not eligible: project missing or outside the agent's org-bound
   * reach. */
  | { status: "unavailable" }
  /** The Search Health Agent refused to sign in — suspended from /ops
   * or credentials absent. Nothing was generated and NOTHING WAS
   * DESTROYED (D5): the report table only ever gains rows, and it
   * gained none. */
  | { status: "agent_unavailable"; reason: string }
  /** Generation or persistence failed; logged. */
  | { status: "failed" };

export async function runWeeklyReportAndPersist(
  projectId: string
): Promise<WeeklyReportRunResult> {
  const session = await signInSearchHealthAgent();
  if (!session.ok) {
    console.error(
      `[weekly-report] report skipped: ${session.reason}. ` +
        "The previous reports stand; the archive keeps rendering them."
    );
    return { status: "agent_unavailable", reason: session.reason };
  }

  try {
    return await runReportUnderAgentSession(
      session.client,
      session.userId,
      projectId
    );
  } finally {
    // Persist nothing (D3): revoke the run's session from GoTrue's ledger.
    await session.signOut();
  }
}

async function runReportUnderAgentSession(
  supabase: SupabaseClient,
  agentUserId: string,
  projectId: string
): Promise<WeeklyReportRunResult> {
  const { data: project, error } = await supabase
    .from("projects")
    .select(
      "id, title, company_name, organization_id, calibration_model, company_context"
    )
    .eq("id", projectId)
    .single<{
      id: string;
      title: string;
      company_name: string;
      organization_id: string | null;
      calibration_model: unknown;
      company_context: unknown;
    }>();
  if (error || !project || !project.organization_id) {
    return { status: "unavailable" };
  }

  const weekStart = mondayOf(new Date());
  const weekStartIso = weekStart.toISOString().slice(0, 10);
  const weekStartTs = weekStart.toISOString();

  const [candidatesQ, scoresQ, feedbackQ] = await Promise.all([
    supabase
      .from("candidates")
      .select(
        "id, full_name, current_title, current_company, archetype, pipeline_stage, cv_structured, created_at, updated_at"
      )
      .eq("project_id", projectId),
    supabase
      .from("candidate_scores")
      .select("candidate_id, rank_position, previous_rank, overall_score, tier")
      .eq("project_id", projectId),
    supabase
      .from("feedback")
      .select("feedback_type, content, candidate_id, interpreted, created_at")
      .eq("project_id", projectId)
      .gte("created_at", weekStartTs)
      .order("created_at", { ascending: false }),
  ]);

  type CandRow = {
    id: string;
    full_name: string;
    current_title: string | null;
    current_company: string | null;
    archetype: string | null;
    pipeline_stage: string | null;
    cv_structured: unknown;
    created_at: string;
    updated_at: string;
  };
  const candidates = (candidatesQ.data ?? []) as CandRow[];
  type ScoreRow = {
    candidate_id: string;
    rank_position: number | null;
    previous_rank: number | null;
    overall_score: number | null;
    tier: string | null;
  };
  const scores = (scoresQ.data ?? []) as ScoreRow[];
  const scoreById = new Map<string, ScoreRow>();
  for (const s of scores) scoreById.set(s.candidate_id, s);

  // Sourced this week — created_at after weekStart.
  const sourced = candidates
    .filter((c) => new Date(c.created_at) >= weekStart)
    .map((c) => ({
      id: c.id,
      name: c.full_name,
      current_title: c.current_title,
      current_company: c.current_company,
      archetype: c.archetype,
    }));

  // Pipeline moves — proxy: candidates whose updated_at falls in this
  // week and whose pipeline_stage is past "found". The actual move
  // history isn't tracked in a separate audit table today, so this is
  // a coarse approximation — improves automatically once we add a
  // pipeline_events table.
  const pipelineMoves = candidates
    .filter(
      (c) =>
        new Date(c.updated_at) >= weekStart &&
        c.pipeline_stage &&
        c.pipeline_stage !== "found"
    )
    .map((c) => ({
      candidate_id: c.id,
      name: c.full_name,
      // Without a from_stage history we mark the previous stage as
      // unknown; the agent treats this gracefully.
      from_stage: "previous_unknown",
      to_stage: c.pipeline_stage ?? "unknown",
      moved_at: c.updated_at,
    }));

  // Rank moves — anyone whose previous_rank differs from current.
  const rankMoves = candidates
    .map((c) => {
      const score = scoreById.get(c.id);
      if (
        !score ||
        score.rank_position == null ||
        score.previous_rank == null ||
        score.rank_position === score.previous_rank
      ) {
        return null;
      }
      return {
        candidate_id: c.id,
        name: c.full_name,
        current_rank: score.rank_position,
        previous_rank: score.previous_rank,
      };
    })
    .filter((m): m is NonNullable<typeof m> => m != null);

  // Top 3 by current rank.
  const topCandidates = candidates
    .map((c) => {
      const score = scoreById.get(c.id);
      const profile = (c.cv_structured ?? {}) as Partial<CandidateProfile>;
      return { c, score, profile };
    })
    .filter(({ score }) => score?.rank_position != null)
    .sort(
      (a, b) => (a.score?.rank_position ?? 999) - (b.score?.rank_position ?? 999)
    )
    .slice(0, 3)
    .map(({ c, score, profile }) => ({
      id: c.id,
      name: c.full_name,
      current_title: c.current_title,
      current_company: c.current_company,
      archetype: c.archetype,
      overall_score: score?.overall_score ?? null,
      tier: score?.tier ?? null,
      headline: profile.summary?.split(/(?<=[.!?])\s+/)[0]?.trim() ?? null,
    }));

  type FbRow = {
    feedback_type: string;
    content: string;
    candidate_id: string | null;
    interpreted: { summary?: string } | null;
    created_at: string;
  };
  const feedback = ((feedbackQ.data ?? []) as FbRow[]).map((f) => ({
    feedback_type: f.feedback_type,
    content: f.content,
    candidate_id: f.candidate_id,
    summary: f.interpreted?.summary ?? null,
    created_at: f.created_at,
  }));

  const input: WeeklyReportInput = {
    week_starting: weekStartIso,
    project: {
      title: project.title,
      company_name: project.company_name,
      calibration: project.calibration_model ?? {},
      company_context: project.company_context ?? {},
    },
    candidates_sourced: sourced,
    pipeline_moves: pipelineMoves,
    rank_moves: rankMoves,
    top_candidates: topCandidates,
    feedback,
  };

  let report: WeeklyReport;
  let model: string;
  try {
    ({ report, model } = await runWeeklyReport(input, {
      projectId,
      organizationId: project.organization_id,
      skillClient: supabase,
    }));
  } catch (err) {
    captureSeamError("[weekly-report] agent judgment failed", err);
    return { status: "failed" };
  }

  // The BLIND insert: the grant has no SELECT, so INSERT..RETURNING
  // would be refused (the 082 discovery) — the seam mints the id
  // itself and hands it back. generated_by is the agent's own
  // identity; the policy's WITH CHECK refuses anything else.
  const reportId = randomUUID();
  const { error: insertErr } = await supabase.from("project_reports").insert({
    id: reportId,
    project_id: projectId,
    organization_id: project.organization_id,
    week_starting: weekStartIso,
    content: report,
    generated_by: agentUserId,
    ai_model: model,
  });
  if (insertErr) {
    captureSeamError("[weekly-report] failed to persist the report", insertErr);
    return { status: "failed" };
  }

  // The trail (D4): a date and counts — never names or report text.
  // Trigger `on_demand` today; `scheduled` is RESERVED for the future
  // cron sweep, which will be this same principal (D7).
  const { error: eventErr } = await supabase.rpc("record_agent_event", {
    p_event_type: "weekly_report_generated",
    p_project_id: projectId,
    p_detail: {
      agent_kind: "search_health",
      trigger: "on_demand",
      week_starting: weekStartIso,
      candidates_count: candidates.length,
      feedback_count: feedback.length,
    },
  });
  if (eventErr) {
    captureSeamError("[weekly-report] failed to record the event", eventErr);
  }

  return { status: "ready", id: reportId };
}

function mondayOf(date: Date): Date {
  // Treat Monday as the start of the ISO week. JS getDay returns
  // 0 (Sun) — 6 (Sat); convert to 0 (Mon) — 6 (Sun).
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  const day = d.getUTCDay();
  const diff = (day + 6) % 7;
  d.setUTCDate(d.getUTCDate() - diff);
  return d;
}
