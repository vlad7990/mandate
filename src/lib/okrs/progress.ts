import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase-server";
import {
  elapsedFraction,
  measuredStatus,
  qualitativeStatus,
  type KeyResultRow,
  type KeyResultStatus,
  type ObjectiveRow,
} from "./types";

/**
 * Progress against an objective's key results, computed live.
 *
 * Nothing here is stored: the D-gate named a `current_value` snapshot
 * column and it was deliberately dropped — a stored copy of a
 * computable number is §13's same-thing-twice defect family, and the
 * metrics machinery (`computePortfolioMetrics` and siblings) already
 * settled the house answer: compute at read time, from the tables the
 * org already writes.
 *
 * Two honesty properties carry from those siblings:
 *
 * - Stage-derived metrics count `candidate_stage_changed` events —
 *   real recorded moves, where `computePipelineMetrics` documents its
 *   own snapshot approximation ("until a stage-history table exists").
 *   The history exists; this reads it.
 * - Financial metrics are summed from whatever fee lines RLS actually
 *   returned (the Placements-page doctrine). The financial KR row
 *   itself is already invisible to roles without `fees:read`, so a
 *   reader who can see the target can see the money behind it.
 */

type Supabase = Awaited<ReturnType<typeof createServerSupabaseClient>>;

export type KeyResultProgress = {
  keyResultId: string;
  /** Null for qualitative rows — their progress is the attestation. */
  current: number | null;
  status: KeyResultStatus;
};

/** The day after `date`, ISO — an exclusive upper bound for a DATE period. */
function dayAfter(date: string): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + 1);
  return parsed.toISOString().slice(0, 10);
}

export async function computeObjectiveProgress(
  objective: Pick<ObjectiveRow, "project_id" | "period_start" | "period_end" | "owner_user_id">,
  keyResults: KeyResultRow[],
  client?: Supabase
): Promise<KeyResultProgress[]> {
  const supabase = client ?? (await createServerSupabaseClient());

  const from = objective.period_start;
  const toExclusive = dayAfter(objective.period_end);
  const projectId = objective.project_id;

  const sources = new Set(keyResults.map((kr) => kr.metric_source).filter(Boolean));
  const wantsCandidates =
    sources.has("candidates_added") || sources.has("weekly_velocity");
  const wantsStageEvents =
    sources.has("stage_moves") ||
    sources.has("submissions") ||
    sources.has("interviews") ||
    sources.has("offers") ||
    sources.has("hires");
  const wantsFeedback = sources.has("feedback_captured");
  const wantsPlacements = sources.has("placements_started");
  const wantsSourced = sources.has("placements_sourced");
  const wantsFeeLines = sources.has("fees_earned") || sources.has("fees_billed_forecast");

  const candidatesQ = wantsCandidates
    ? (() => {
        let q = supabase
          .from("candidates")
          .select("id", { count: "exact", head: true })
          .gte("created_at", from)
          .lt("created_at", toExclusive);
        if (projectId) q = q.eq("project_id", projectId);
        return q;
      })()
    : Promise.resolve({ count: 0 });

  const stageEventsQ = wantsStageEvents
    ? (() => {
        let q = supabase
          .from("activity_events")
          .select("detail")
          .eq("event_type", "candidate_stage_changed")
          .gte("created_at", from)
          .lt("created_at", toExclusive);
        if (projectId) q = q.eq("project_id", projectId);
        return q;
      })()
    : Promise.resolve({ data: [] as Array<{ detail: Record<string, unknown> }> });

  const feedbackQ = wantsFeedback
    ? (() => {
        let q = supabase
          .from("feedback")
          .select("id", { count: "exact", head: true })
          .gte("created_at", from)
          .lt("created_at", toExclusive);
        if (projectId) q = q.eq("project_id", projectId);
        return q;
      })()
    : Promise.resolve({ count: 0 });

  const placementsQ = wantsPlacements
    ? (() => {
        let q = supabase
          .from("placements")
          .select("id", { count: "exact", head: true })
          .eq("status", "started")
          .gte("start_date", from)
          .lt("start_date", toExclusive);
        if (projectId) q = q.eq("project_id", projectId);
        return q;
      })()
    : Promise.resolve({ count: 0 });

  // 108, D4: the one owner-attributed metric — placements the
  // objective's OWNER sourced (050's sourced_by_user_id), started in
  // the period. A count, never an amount.
  const sourcedQ = wantsSourced
    ? (() => {
        let q = supabase
          .from("placements")
          .select("id", { count: "exact", head: true })
          .eq("sourced_by_user_id", objective.owner_user_id)
          .eq("status", "started")
          .gte("start_date", from)
          .lt("start_date", toExclusive);
        if (projectId) q = q.eq("project_id", projectId);
        return q;
      })()
    : Promise.resolve({ count: 0 });

  type FeeLineLite = {
    base_amount: number;
    status: string;
    earned_on: string | null;
    due_on: string | null;
  };
  const feeLinesQ = wantsFeeLines
    ? projectId
      ? supabase
          .from("placement_fee_lines")
          .select("base_amount, status, earned_on, due_on, placements!inner(project_id)")
          .eq("placements.project_id", projectId)
          .returns<FeeLineLite[]>()
      : supabase
          .from("placement_fee_lines")
          .select("base_amount, status, earned_on, due_on")
          .returns<FeeLineLite[]>()
    : Promise.resolve({ data: [] as FeeLineLite[] });

  const [candidatesR, stageEventsR, feedbackR, placementsR, sourcedR, feeLinesR] =
    await Promise.all([candidatesQ, stageEventsQ, feedbackQ, placementsQ, sourcedQ, feeLinesQ]);

  const candidatesAdded = ("count" in candidatesR ? candidatesR.count : 0) ?? 0;
  const feedbackCaptured = ("count" in feedbackR ? feedbackR.count : 0) ?? 0;
  const placementsStarted = ("count" in placementsR ? placementsR.count : 0) ?? 0;
  const placementsSourced = ("count" in sourcedR ? sourcedR.count : 0) ?? 0;

  const stageEvents = ("data" in stageEventsR ? stageEventsR.data : []) ?? [];
  const movesTo = new Map<string, number>();
  for (const event of stageEvents) {
    const to = typeof event.detail?.to === "string" ? event.detail.to : null;
    if (to) movesTo.set(to, (movesTo.get(to) ?? 0) + 1);
  }

  const feeLines = ("data" in feeLinesR ? feeLinesR.data : []) ?? [];
  const inPeriod = (date: string | null) => date !== null && date >= from && date < toExclusive;
  const feesEarned = feeLines
    .filter((line) => line.status === "earned" && inPeriod(line.earned_on))
    .reduce((sum, line) => sum + line.base_amount, 0);
  const feesForecast = feeLines
    .filter((line) => line.status === "pending" && inPeriod(line.due_on))
    .reduce((sum, line) => sum + line.base_amount, 0);

  const periodDays = Math.max(
    1,
    Math.round(
      (Date.parse(objective.period_end) - Date.parse(objective.period_start)) / 86_400_000
    ) + 1
  );
  const weeklyVelocity = Math.round((candidatesAdded / Math.max(1, periodDays / 7)) * 100) / 100;

  const today = new Date().toISOString().slice(0, 10);
  const elapsed = elapsedFraction(objective.period_start, objective.period_end, today);

  return keyResults.map((kr) => {
    if (kr.kind === "qualitative") {
      return {
        keyResultId: kr.id,
        current: null,
        status: qualitativeStatus(kr.attested_at !== null, elapsed),
      };
    }

    let current = 0;
    switch (kr.metric_source) {
      case "candidates_added":
        current = candidatesAdded;
        break;
      case "stage_moves":
        current = stageEvents.length;
        break;
      case "submissions":
        current = movesTo.get("submitted") ?? 0;
        break;
      case "interviews":
        current = movesTo.get("interviewed") ?? 0;
        break;
      case "offers":
        current = movesTo.get("offer") ?? 0;
        break;
      case "hires":
        current = movesTo.get("hired") ?? 0;
        break;
      case "placements_started":
        current = placementsStarted;
        break;
      case "placements_sourced":
        current = placementsSourced;
        break;
      case "feedback_captured":
        current = feedbackCaptured;
        break;
      case "weekly_velocity":
        current = weeklyVelocity;
        break;
      case "fees_earned":
        current = feesEarned;
        break;
      case "fees_billed_forecast":
        current = feesForecast;
        break;
      default:
        current = 0;
    }

    return {
      keyResultId: kr.id,
      current,
      status: measuredStatus(current, kr.target_value ?? 0, kr.direction, elapsed),
    };
  });
}
