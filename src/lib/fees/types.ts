/**
 * The placement and fee record — see `supabase/migrations/050_placements_and_fees.sql`.
 *
 * Before 050 the only trace that a search had ended was
 * `candidates.pipeline_stage = 'hired'`. There was no money column
 * anywhere in the schema, so the product could say who you placed and not
 * what you earned.
 *
 * ## Why the money is in different types from the placement
 *
 * `PlacementRow` holds the event — dates, status, who is credited — and
 * every active role may read it. `PlacementFeeRow` and `FeeLineRow` hold
 * every number and are behind `fees:read`. That is not tidiness: RLS is
 * row-level, so "sees that a placement happened but not what it paid"
 * cannot be written as a policy on a table holding both. The compensation
 * package is on the fee side for the same reason — a percentage applied
 * to a salary is a fee.
 *
 * Amounts are `number` on the way in and out of these types even though
 * Postgres stores `numeric`. supabase-js hands back a JS number for
 * `numeric`, and a fee is bounded by six or seven figures, well inside
 * the 2^53 where that is exact to the cent. Where arithmetic happens it
 * is rounded explicitly — see `roundMoney` in `./compute`.
 */

export const FEE_MODELS = ["contingent", "retained", "fixed"] as const;
export type FeeModel = (typeof FEE_MODELS)[number];

export const FEE_MODEL_LABELS: Record<FeeModel, string> = {
  contingent: "Contingent",
  retained: "Retained",
  fixed: "Fixed fee",
};

/**
 * What the percentage applies to.
 *
 * Executive search usually quotes on total first-year cash; contingent
 * tech recruiting usually quotes on base. It is stored rather than
 * assumed because getting it wrong is a mis-billing, not a display bug.
 */
export const FEE_BASES = ["base_salary", "total_first_year_cash"] as const;
export type FeeBasis = (typeof FEE_BASES)[number];

export const FEE_BASIS_LABELS: Record<FeeBasis, string> = {
  base_salary: "Base salary",
  total_first_year_cash: "Total first-year cash",
};

/**
 * What makes an instalment earnable.
 *
 * The first two only occur on retained searches, and they are the reason
 * a fee is a ledger rather than a column: an engagement fee is earned
 * before there is a candidate, let alone a placement.
 */
export const FEE_TRIGGERS = [
  "engagement",
  "shortlist",
  "offer_accepted",
  "start_date",
  "guarantee_passed",
] as const;
export type FeeTrigger = (typeof FEE_TRIGGERS)[number];

export const FEE_TRIGGER_LABELS: Record<FeeTrigger, string> = {
  engagement: "On engagement",
  shortlist: "On shortlist delivery",
  offer_accepted: "On offer accepted",
  start_date: "On start date",
  guarantee_passed: "On guarantee expiry",
};

/**
 * One stage of a retained fee, as stored in `fee_terms.instalment_plan`.
 *
 * `percent_of_fee` is a string because it comes out of jsonb that way and
 * because thirds of a retainer are quoted as 33.333 — parsing it once, at
 * the edge, is better than a number that has already been through a
 * float. `parseInstalmentPlan` is that edge.
 */
export type InstalmentStage = {
  label: string;
  trigger: FeeTrigger;
  percent_of_fee: number;
};

export type FeeTermsRow = {
  id: string;
  organization_id: string;
  /** Exactly one of these is set — the CHECK in 050 enforces it. */
  client_id: string | null;
  project_id: string | null;
  fee_model: FeeModel;
  fee_percentage: number | null;
  fixed_fee_amount: number | null;
  currency: string;
  fee_basis: FeeBasis;
  guarantee_days: number;
  payment_terms_days: number;
  instalment_plan: unknown;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export const FEE_TERMS_COLUMNS =
  "id, organization_id, client_id, project_id, fee_model, fee_percentage, fixed_fee_amount, currency, fee_basis, guarantee_days, payment_terms_days, instalment_plan, notes, created_by, created_at, updated_at";

export const PLACEMENT_STATUSES = [
  "offered",
  "declined",
  "accepted",
  "started",
  "fell_through",
] as const;
export type PlacementStatus = (typeof PLACEMENT_STATUSES)[number];

export const PLACEMENT_STATUS_LABELS: Record<PlacementStatus, string> = {
  offered: "Offer out",
  declined: "Offer declined",
  accepted: "Offer accepted",
  started: "Started",
  fell_through: "Fell through",
};

/**
 * There is deliberately no `guarantee_passed` status.
 *
 * It would be a value that becomes wrong by the passage of time, and
 * nothing is scheduled anywhere in this project — no cron, no `pg_cron`,
 * no `vercel.json` — to go and correct it. `guaranteeState` derives it
 * from the dates instead, which is right on every read without anything
 * having to run.
 */
export type PlacementRow = {
  id: string;
  organization_id: string;
  project_id: string;
  candidate_id: string;
  client_id: string | null;
  status: PlacementStatus;
  offer_date: string;
  declined_date: string | null;
  accepted_date: string | null;
  start_date: string | null;
  guarantee_days: number | null;
  /** `start_date + guarantee_days`, generated by Postgres. */
  guarantee_ends_on: string | null;
  fell_through_date: string | null;
  fell_through_reason: string | null;
  owner_user_id: string | null;
  sourced_by_user_id: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export const PLACEMENT_COLUMNS =
  "id, organization_id, project_id, candidate_id, client_id, status, offer_date, declined_date, accepted_date, start_date, guarantee_days, guarantee_ends_on, fell_through_date, fell_through_reason, owner_user_id, sourced_by_user_id, notes, created_by, created_at, updated_at";

/** Where a placement's terms came from, so a non-standard fee is explicable. */
export const TERMS_SOURCES = ["client", "mandate", "manual"] as const;
export type TermsSource = (typeof TERMS_SOURCES)[number];

export const TERMS_SOURCE_LABELS: Record<TermsSource, string> = {
  client: "Client agreement",
  mandate: "Mandate override",
  manual: "Entered manually",
};

export type PlacementFeeRow = {
  id: string;
  organization_id: string;
  placement_id: string;
  fee_model: FeeModel;
  fee_percentage: number | null;
  fee_basis: FeeBasis;
  payment_terms_days: number;
  terms_source: TermsSource;
  fee_terms_id: string | null;
  currency: string;
  base_salary: number | null;
  guaranteed_bonus: number | null;
  other_cash: number | null;
  fee_basis_amount: number | null;
  total_fee_amount: number;
  base_currency: string;
  fx_rate: number;
  fx_rate_fixed_on: string;
  /** `total_fee_amount * fx_rate`, generated by Postgres. */
  total_fee_base_amount: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export const PLACEMENT_FEE_COLUMNS =
  "id, organization_id, placement_id, fee_model, fee_percentage, fee_basis, payment_terms_days, terms_source, fee_terms_id, currency, base_salary, guaranteed_bonus, other_cash, fee_basis_amount, total_fee_amount, base_currency, fx_rate, fx_rate_fixed_on, total_fee_base_amount, created_by, created_at, updated_at";

export const FEE_LINE_KINDS = ["instalment", "reversal", "write_off"] as const;
export type FeeLineKind = (typeof FEE_LINE_KINDS)[number];

export const FEE_LINE_KIND_LABELS: Record<FeeLineKind, string> = {
  instalment: "Instalment",
  reversal: "Reversal",
  write_off: "Write-off",
};

export const FEE_LINE_STATUSES = ["pending", "earned", "cancelled"] as const;
export type FeeLineStatus = (typeof FEE_LINE_STATUSES)[number];

export const FEE_LINE_STATUS_LABELS: Record<FeeLineStatus, string> = {
  pending: "Pending",
  earned: "Earned",
  cancelled: "Cancelled",
};

/**
 * A line of the fee ledger.
 *
 * Instalments are positive and reversals negative, so a period's revenue
 * is one SUM over one table rather than a sum minus a sum — the form that
 * goes wrong when someone forgets the second half. The sign is a CHECK
 * constraint in 050, not a convention.
 */
export type FeeLineRow = {
  id: string;
  organization_id: string;
  placement_id: string;
  placement_fee_id: string;
  kind: FeeLineKind;
  label: string;
  sequence: number;
  trigger: FeeTrigger | null;
  amount: number;
  currency: string;
  base_currency: string;
  fx_rate: number;
  /** `amount * fx_rate`, generated by Postgres. Always in `base_currency`. */
  base_amount: number;
  status: FeeLineStatus;
  /** The date that decides the quarter. Distinct from `due_on`. */
  earned_on: string | null;
  due_on: string | null;
  reason: string | null;
  reverses_line_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export const FEE_LINE_COLUMNS =
  "id, organization_id, placement_id, placement_fee_id, kind, label, sequence, trigger, amount, currency, base_currency, fx_rate, base_amount, status, earned_on, due_on, reason, reverses_line_id, created_by, created_at, updated_at";

/**
 * Narrowing helpers for the untrusted text columns.
 *
 * Same reasoning as `parseRole` in `src/lib/auth/roles.ts`: the column is
 * `text` with a CHECK, and a value outside the vocabulary should lose
 * behaviour rather than gain it. Every one of these returns null on a
 * miss so the caller has to decide, rather than silently defaulting to
 * the first member — defaulting a fee model to `contingent` would invent
 * a percentage.
 */
function parseMember<T extends string>(
  vocabulary: readonly T[],
  value: unknown
): T | null {
  if (typeof value !== "string") return null;
  const normalised = value.trim().toLowerCase();
  return (vocabulary as readonly string[]).includes(normalised) ? (normalised as T) : null;
}

export const parseFeeModel = (v: unknown) => parseMember(FEE_MODELS, v);
export const parseFeeBasis = (v: unknown) => parseMember(FEE_BASES, v);
export const parseFeeTrigger = (v: unknown) => parseMember(FEE_TRIGGERS, v);
export const parsePlacementStatus = (v: unknown) => parseMember(PLACEMENT_STATUSES, v);
export const parseTermsSource = (v: unknown) => parseMember(TERMS_SOURCES, v);
export const parseFeeLineKind = (v: unknown) => parseMember(FEE_LINE_KINDS, v);
export const parseFeeLineStatus = (v: unknown) => parseMember(FEE_LINE_STATUSES, v);

/**
 * Read `fee_terms.instalment_plan` out of jsonb.
 *
 * This must agree with `public.fee_instalment_plan_is_valid` in migration
 * 050, which is a CHECK constraint and therefore the thing that actually
 * decides what can be stored. The same cases are walked on both sides:
 * here in `compute.test.ts`, and against Postgres in
 * `supabase/tests/placement_fee_invariants.sql`. Where they could differ,
 * this is the stricter of the two — a plan Postgres would accept and this
 * rejects shows up as an empty plan in the UI, which is visible; the
 * reverse would be a write that fails at the database with a constraint
 * name in the toast.
 *
 * Returns `[]` for anything malformed rather than throwing: an unparseable
 * plan on a client agreement should not take out the client screen.
 */
export function parseInstalmentPlan(value: unknown): InstalmentStage[] {
  if (!Array.isArray(value)) return [];

  const stages: InstalmentStage[] = [];

  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) return [];

    const row = entry as Record<string, unknown>;
    const label = typeof row.label === "string" ? row.label.trim() : "";
    const trigger = parseFeeTrigger(row.trigger);
    const percent = Number(row.percent_of_fee);

    if (!label || !trigger) return [];
    if (!Number.isFinite(percent) || percent <= 0) return [];

    stages.push({ label, trigger, percent_of_fee: percent });
  }

  if (stages.length === 0) return [];

  // Postgres rounds the sum to four decimals before comparing, because
  // 33.333 + 33.333 + 33.334 is exactly 100 only if you do not go through
  // a float. Same tolerance here for the same reason.
  const total = stages.reduce((sum, s) => sum + s.percent_of_fee, 0);
  if (Math.round(total * 1e4) / 1e4 !== 100) return [];

  return stages;
}

/** The default retainer split, offered when a client is first put on retained terms. */
export const DEFAULT_RETAINER_PLAN: InstalmentStage[] = [
  { label: "Engagement", trigger: "engagement", percent_of_fee: 33.333 },
  { label: "Shortlist", trigger: "shortlist", percent_of_fee: 33.333 },
  { label: "Completion", trigger: "start_date", percent_of_fee: 33.334 },
];
