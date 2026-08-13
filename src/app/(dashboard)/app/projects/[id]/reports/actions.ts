"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { requireActionContext } from "@/lib/auth/access";
import {
  type WeeklyReportInput,
  runWeeklyReport,
} from "@/lib/ai/run-weekly-report";
import type { CandidateProfile } from "@/lib/ai/cv-parsing";
import {
  type CalibrationModel,
  type CompanyContext,
} from "@/lib/ai/role-analysis";

type AuthContext = {
  userId: string;
  organizationId: string;
};

async function requireActiveUser(): Promise<AuthContext> {
  return requireActionContext("clients:share");
}

/**
 * Generate a weekly report for the project covering the most recent
 * Monday-aligned ISO week. Persists to project_reports and returns
 * the new row's id so the page can navigate to it.
 */
export async function generateWeeklyReportAction(
  projectId: string
): Promise<{ id: string }> {
  if (!projectId) throw new Error("Missing projectId.");
  const auth = await requireActiveUser();
  const supabase = await createServerSupabaseClient();

  const { data: project, error: projectErr } = await supabase
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
      calibration_model: Partial<CalibrationModel> | null;
      company_context: Partial<CompanyContext> | null;
    }>();

  if (projectErr || !project) {
    throw new Error("Project not found.");
  }
  if (project.organization_id !== auth.organizationId) {
    throw new Error("Project belongs to a different organisation.");
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
      .select(
        "candidate_id, rank_position, previous_rank, overall_score, tier"
      )
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

  const { report, model } = await runWeeklyReport(input, {
    projectId,
    organizationId: auth.organizationId,
  });

  const { data: inserted, error: insertErr } = await supabase
    .from("project_reports")
    .insert({
      project_id: projectId,
      organization_id: auth.organizationId,
      week_starting: weekStartIso,
      content: report,
      generated_by: auth.userId,
      ai_model: model,
    })
    .select("id")
    .single<{ id: string }>();

  if (insertErr || !inserted) {
    throw new Error(
      `Failed to persist report: ${insertErr?.message ?? "no row"}`
    );
  }

  revalidatePath(`/app/projects/${projectId}/reports`);
  return { id: inserted.id };
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

// WeeklyReport / WeeklyReportInput live in the agent module —
// "use server" files only export async functions, so callers import
// types directly from @/lib/ai/weekly-report-agent.
