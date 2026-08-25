/**
 * The OKR domain (migration 107) — see the D-gate at
 * `docs/superpowers/specs/2026-08-25-okr-kpi-design.md`.
 *
 * An objective is a period-bound ambition owned by the person it
 * measures; key results are its commitments. Three kinds, three
 * guarantees: financial rows are fees-tier (RLS withholds them from
 * roles without `fees:read` — R1), quantitative rows are computed
 * from a CHECK'd metric vocabulary and never claimed by hand (D3),
 * qualitative rows are human-attested milestones with a signature
 * pin (D5). No kind can take a person as its subject: the table has
 * no candidate column (R2).
 *
 * This module is imported by client components; keep it free of
 * anything server-only. The computations live in `progress.ts`.
 */

export const OBJECTIVE_STATUSES = ["draft", "active", "closed", "abandoned"] as const;
export type ObjectiveStatus = (typeof OBJECTIVE_STATUSES)[number];

export const OBJECTIVE_STATUS_LABELS: Record<ObjectiveStatus, string> = {
  draft: "Draft",
  active: "Active",
  closed: "Closed",
  abandoned: "Abandoned",
};

export const KEY_RESULT_KINDS = ["financial", "quantitative", "qualitative"] as const;
export type KeyResultKind = (typeof KEY_RESULT_KINDS)[number];

export const KEY_RESULT_KIND_LABELS: Record<KeyResultKind, string> = {
  financial: "Financial",
  quantitative: "Quantitative",
  qualitative: "Qualitative",
};

/**
 * The quantitative vocabulary — mirrors the `okr_metric_matches_kind`
 * CHECK in 107. Every slug maps to one deterministic computation in
 * `progress.ts`; the list grows only by migration. The stage-derived
 * slugs count `candidate_stage_changed` events — real board moves,
 * not the current-stage snapshot `computePipelineMetrics` documents
 * as approximate.
 */
export const QUANTITATIVE_METRICS = [
  "candidates_added",
  "stage_moves",
  "submissions",
  "interviews",
  "offers",
  "hires",
  "placements_started",
  "feedback_captured",
  "weekly_velocity",
] as const;
export type QuantitativeMetric = (typeof QUANTITATIVE_METRICS)[number];

/** The financial vocabulary — the earned/forecast split 050 draws. */
export const FINANCIAL_METRICS = ["fees_earned", "fees_billed_forecast"] as const;
export type FinancialMetric = (typeof FINANCIAL_METRICS)[number];

export type MetricSource = QuantitativeMetric | FinancialMetric;

export const METRIC_LABELS: Record<MetricSource, string> = {
  candidates_added: "Candidates added",
  stage_moves: "Pipeline moves",
  submissions: "Submissions",
  interviews: "Interviews",
  offers: "Offers",
  hires: "Hires",
  placements_started: "Placements started",
  feedback_captured: "Feedback captured",
  weekly_velocity: "Weekly velocity",
  fees_earned: "Fees earned",
  fees_billed_forecast: "Fees due (forecast)",
};

export const KEY_RESULT_DIRECTIONS = ["at_least", "at_most"] as const;
export type KeyResultDirection = (typeof KEY_RESULT_DIRECTIONS)[number];

export type ObjectiveRow = {
  id: string;
  organization_id: string;
  project_id: string | null;
  owner_user_id: string;
  title: string;
  detail: string;
  period_start: string;
  period_end: string;
  status: ObjectiveStatus;
  created_by: string;
  closed_at: string | null;
  closed_by: string | null;
  created_at: string;
  updated_at: string;
};

export type KeyResultRow = {
  id: string;
  organization_id: string;
  objective_id: string;
  kind: KeyResultKind;
  label: string;
  metric_source: MetricSource | null;
  target_value: number | null;
  currency: string | null;
  direction: KeyResultDirection;
  attested_at: string | null;
  attested_by: string | null;
  created_at: string;
  updated_at: string;
};

export const OBJECTIVE_COLUMNS =
  "id, organization_id, project_id, owner_user_id, title, detail, period_start, period_end, status, created_by, closed_at, closed_by, created_at, updated_at";

export const KEY_RESULT_COLUMNS =
  "id, organization_id, objective_id, kind, label, metric_source, target_value, currency, direction, attested_at, attested_by, created_at, updated_at";

/**
 * The display verdict on a key result's progress — a badge, never a
 * control-flow gate (the HealthStatus doctrine: only run-search-health
 * ever branches on a status, and this one nothing branches on).
 */
export type KeyResultStatus = "on_track" | "behind" | "at_risk" | "met" | "pending";

export const KEY_RESULT_STATUS_LABELS: Record<KeyResultStatus, string> = {
  on_track: "On track",
  behind: "Behind",
  at_risk: "At risk",
  met: "Met",
  pending: "Pending",
};

/**
 * How far through the objective's period today falls, clamped to
 * [0, 1]. Pure so the threshold rules below are testable without a
 * clock.
 */
export function elapsedFraction(periodStart: string, periodEnd: string, today: string): number {
  const start = Date.parse(periodStart);
  const end = Date.parse(periodEnd);
  const now = Date.parse(today);
  if (!Number.isFinite(start) || !Number.isFinite(end) || !Number.isFinite(now)) return 0;
  if (end <= start) return 1;
  return Math.min(1, Math.max(0, (now - start) / (end - start)));
}

/**
 * The display status for a measured key result.
 *
 * `at_least` targets are judged against the pro-rata expectation —
 * target × elapsed — because "12 submissions by quarter-end" is on
 * track at 6 halfway through, not behind. On track means at or above
 * pro-rata; at risk means under half of it; behind is the gap between.
 * `at_most` targets are simpler: the ceiling either holds or it does
 * not, and pro-rating a limit would excuse blowing it early. Meeting
 * the full target reads "met" whatever the date.
 */
export function measuredStatus(
  current: number,
  target: number,
  direction: KeyResultDirection,
  elapsed: number
): KeyResultStatus {
  if (direction === "at_most") {
    return current <= target ? "on_track" : "behind";
  }
  if (target <= 0) return current >= target ? "met" : "behind";
  if (current >= target) return "met";
  const expected = target * elapsed;
  if (expected <= 0) return "on_track";
  if (current >= expected) return "on_track";
  return current < expected / 2 ? "at_risk" : "behind";
}

/**
 * The display status for a qualitative milestone: attested is met;
 * unattested is pending while the period runs and behind once it has
 * ended (an unclaimed milestone after the deadline is not "pending",
 * it is late).
 */
export function qualitativeStatus(attested: boolean, elapsed: number): KeyResultStatus {
  if (attested) return "met";
  return elapsed >= 1 ? "behind" : "pending";
}
