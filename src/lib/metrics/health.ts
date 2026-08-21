import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import type {
  HealthAlert,
  HealthStatus,
  ProjectHealthSummary,
} from "./types";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;
const LOW_PIPELINE_THRESHOLD = 5;
const POOR_QUALITY_THRESHOLD = 5; // overall_score is on a 0–10 scale

type CandidateRow = {
  id: string;
  pipeline_stage: string | null;
  source: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type FeedbackRow = {
  id: string;
  created_at: string | null;
};

type ScoreRow = {
  candidate_id: string;
  overall_score: number | null;
  rank_position: number | null;
  previous_rank: number | null;
  updated_at: string | null;
};

/**
 * Compute the project's health status + the metrics that drive the
 * weekly summary card and the metrics page. One round-trip per table —
 * Supabase has no cheap way to roll these up server-side without an RPC,
 * and the volume per project is small enough that filtering in app code
 * is cleaner than a stored procedure.
 */
export async function computeProjectHealth(
  projectId: string,
  client?: SupabaseClient
): Promise<ProjectHealthSummary> {
  // The optional client lets the Search Health Agent compute health
  // under its OWN session (the skillClient pattern applied to
  // metrics); the cookie client stays the default for every human
  // surface.
  const supabase = client ?? (await createServerSupabaseClient());
  const now = Date.now();
  const sevenDaysAgo = new Date(now - SEVEN_DAYS_MS).toISOString();
  const fourteenDaysAgo = new Date(now - FOURTEEN_DAYS_MS).toISOString();

  const [candidatesQ, feedbackQ, scoresQ] = await Promise.all([
    supabase
      .from("candidates")
      .select("id, pipeline_stage, source, created_at, updated_at")
      .eq("project_id", projectId),
    supabase
      .from("feedback")
      .select("id, created_at")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("candidate_scores")
      .select(
        "candidate_id, overall_score, rank_position, previous_rank, updated_at"
      )
      .eq("project_id", projectId),
  ]);

  const candidates = (candidatesQ.data ?? []) as CandidateRow[];
  const feedback = (feedbackQ.data ?? []) as FeedbackRow[];
  const scores = (scoresQ.data ?? []) as ScoreRow[];

  const totalCandidates = candidates.length;

  const candidatesThisWeek = candidates.filter(
    (c) => c.created_at && c.created_at >= sevenDaysAgo
  ).length;

  const feedbackThisWeek = feedback.filter(
    (f) => f.created_at && f.created_at >= sevenDaysAgo
  ).length;

  const rankingChangesThisWeek = scores.filter(
    (s) =>
      s.updated_at &&
      s.updated_at >= sevenDaysAgo &&
      s.previous_rank != null &&
      s.rank_position != null &&
      s.previous_rank !== s.rank_position
  ).length;

  // Average score — only include candidates that have actually been scored.
  const scoreValues = scores
    .map((s) => s.overall_score)
    .filter((v): v is number => typeof v === "number");
  const avgOverallScore =
    scoreValues.length > 0
      ? round2(
          scoreValues.reduce((acc, v) => acc + v, 0) / scoreValues.length
        )
      : null;

  // Last activity = max(candidate.updated_at, feedback.created_at, score.updated_at).
  const lastActivityAt = newestIso([
    ...candidates.map((c) => c.updated_at),
    ...candidates.map((c) => c.created_at),
    ...feedback.map((f) => f.created_at),
    ...scores.map((s) => s.updated_at),
  ]);

  const alerts: HealthAlert[] = [];

  if (
    totalCandidates > 0 &&
    (!lastActivityAt || lastActivityAt < sevenDaysAgo)
  ) {
    alerts.push({
      code: "no_activity_7d",
      severity: "critical",
      label: "Stalled",
      detail: lastActivityAt
        ? `No activity since ${formatRelative(lastActivityAt)}.`
        : "No activity recorded yet.",
    });
  }

  if (totalCandidates < LOW_PIPELINE_THRESHOLD) {
    alerts.push({
      code: "low_pipeline",
      severity: totalCandidates === 0 ? "critical" : "warn",
      label: "Low pipeline",
      detail: `${totalCandidates} candidate${totalCandidates === 1 ? "" : "s"} (target ≥ ${LOW_PIPELINE_THRESHOLD}).`,
    });
  }

  const latestFeedbackAt = newestIso(feedback.map((f) => f.created_at));
  if (totalCandidates > 0) {
    if (!latestFeedbackAt) {
      alerts.push({
        code: "no_feedback_14d",
        severity: "warn",
        label: "No feedback",
        detail: "No feedback submitted yet.",
      });
    } else if (latestFeedbackAt < fourteenDaysAgo) {
      alerts.push({
        code: "no_feedback_14d",
        severity: "warn",
        label: "No feedback",
        detail: `Last feedback ${formatRelative(latestFeedbackAt)}.`,
      });
    }
  }

  if (
    avgOverallScore != null &&
    scoreValues.length >= 3 &&
    avgOverallScore < POOR_QUALITY_THRESHOLD
  ) {
    alerts.push({
      code: "poor_quality",
      severity: "warn",
      label: "Poor quality",
      detail: `Avg score ${avgOverallScore.toFixed(1)} / 10 across ${scoreValues.length} scored candidates.`,
    });
  }

  const status: HealthStatus = computeStatus(alerts);

  return {
    status,
    alerts,
    candidatesThisWeek,
    feedbackThisWeek,
    rankingChangesThisWeek,
    totalCandidates,
    avgOverallScore,
    lastActivityAt,
  };
}

function computeStatus(alerts: HealthAlert[]): HealthStatus {
  if (alerts.some((a) => a.severity === "critical")) return "at_risk";
  if (alerts.length === 0) return "healthy";
  if (alerts.length >= 2) return "at_risk";
  return "stalled";
}

function newestIso(values: Array<string | null | undefined>): string | null {
  let max: string | null = null;
  for (const v of values) {
    if (v && (!max || v > max)) max = v;
  }
  return max;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function formatRelative(iso: string): string {
  const t = new Date(iso).getTime();
  const diffMs = Date.now() - t;
  const min = Math.round(diffMs / 60_000);
  if (min < 60) return `${min}m ago`;
  const hrs = Math.round(min / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}
