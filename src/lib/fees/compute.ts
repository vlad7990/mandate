/**
 * Turning an agreement and a package into money.
 *
 * Everything here is a pure function over plain values so it can be tested
 * without a database, and so the same arithmetic runs in the action that
 * writes the fee and in the panel that previews it before you commit. The
 * failure this avoids is the classic one: a preview that computes the fee
 * one way and a server action that computes it another, differing by a
 * rounding step nobody notices until a client queries an invoice.
 *
 * See `supabase/migrations/050_placements_and_fees.sql` for why the shapes
 * are as they are, and `./types` for the vocabularies.
 */

import {
  DEFAULT_RETAINER_PLAN,
  parseInstalmentPlan,
  type FeeBasis,
  type FeeModel,
  type FeeTermsRow,
  type FeeLineRow,
  type InstalmentStage,
  type PlacementRow,
} from "./types";

/**
 * Round to cents, half away from zero.
 *
 * `Math.round` breaks ties towards positive infinity, so -0.005 rounds to
 * -0.00 and 0.005 to 0.01 — a reversal and the instalment it reverses
 * would not cancel. Reversals are negative in this schema, so this is not
 * hypothetical.
 */
export function roundMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;

  // `1.005 * 100` is 100.49999999999999, so rounding it directly gives
  // 1.00 and loses a cent on exactly the values a person would check by
  // hand. `toPrecision(15)` discards the representation noise first — 15
  // significant digits is the most a double carries reliably, so this
  // recovers the decimal the arithmetic meant without pretending to be
  // arbitrary-precision. Adding an epsilon does not work here:
  // `Number.EPSILON` is absolute and the error at this scale is two
  // orders of magnitude larger than it.
  const scaled = Number((Math.abs(value) * 100).toPrecision(15));
  const rounded = Math.round(scaled) / 100;

  return value < 0 ? -rounded : rounded;
}

/** The package components a fee can be computed from, in the fee's currency. */
export type Package = {
  base_salary: number | null;
  guaranteed_bonus: number | null;
  other_cash: number | null;
};

/**
 * What the percentage applies to.
 *
 * `total_first_year_cash` is base plus guaranteed bonus plus other cash —
 * guaranteed, not target. A target bonus is not first-year cash and
 * billing on it is how a fee gets disputed.
 */
export function feeBasisAmount(pkg: Package, basis: FeeBasis): number {
  const base = pkg.base_salary ?? 0;
  if (basis === "base_salary") return roundMoney(base);
  return roundMoney(base + (pkg.guaranteed_bonus ?? 0) + (pkg.other_cash ?? 0));
}

/** The terms a placement's fee is computed from, once resolved. */
export type ResolvedTerms = {
  fee_model: FeeModel;
  fee_percentage: number | null;
  fixed_fee_amount: number | null;
  fee_basis: FeeBasis;
  currency: string;
  guarantee_days: number;
  payment_terms_days: number;
  instalment_plan: InstalmentStage[];
  /** Which agreement this came from. Null when there is no agreement on file. */
  source: "client" | "mandate" | null;
  fee_terms_id: string | null;
};

/**
 * The terms in force for a mandate: its own override, else the client's
 * standard agreement, else nothing.
 *
 * "Nothing" is a legitimate answer, not an error. The first thing a
 * recruiter does with a new product is record the placement they just
 * made, not fill in a client agreement screen first — so the caller falls
 * back to `manual` and types the numbers.
 */
export function resolveTerms(
  clientTerms: FeeTermsRow | null,
  mandateTerms: FeeTermsRow | null
): ResolvedTerms | null {
  const row = mandateTerms ?? clientTerms;
  if (!row) return null;

  return {
    fee_model: row.fee_model,
    fee_percentage: row.fee_percentage,
    fixed_fee_amount: row.fixed_fee_amount,
    fee_basis: row.fee_basis,
    currency: row.currency,
    guarantee_days: row.guarantee_days,
    payment_terms_days: row.payment_terms_days,
    instalment_plan: parseInstalmentPlan(row.instalment_plan),
    source: mandateTerms ? "mandate" : "client",
    fee_terms_id: row.id,
  };
}

/**
 * The headline fee.
 *
 * A fixed-fee agreement ignores the package entirely; the other two
 * multiply. Returns null when the terms cannot produce a number — a
 * contingent agreement with no percentage, or a percentage with no
 * salary — because a fee of zero and a fee that cannot be computed are
 * different things, and only one of them should be written to the ledger.
 */
export function totalFee(
  terms: Pick<ResolvedTerms, "fee_model" | "fee_percentage" | "fixed_fee_amount" | "fee_basis">,
  pkg: Package
): number | null {
  if (terms.fee_model === "fixed") {
    return terms.fixed_fee_amount == null ? null : roundMoney(terms.fixed_fee_amount);
  }

  if (terms.fee_percentage == null) return null;

  const basis = feeBasisAmount(pkg, terms.fee_basis);
  if (basis <= 0) return null;

  return roundMoney((basis * terms.fee_percentage) / 100);
}

/** One ledger line, before it has an id or an organisation. */
export type DraftFeeLine = {
  kind: "instalment";
  label: string;
  sequence: number;
  trigger: InstalmentStage["trigger"];
  amount: number;
  status: "pending";
};

/**
 * Expand a fee into the lines that will bill it.
 *
 * A contingent or fixed fee is one line earned on the start date; a
 * retained fee is its plan. The last instalment absorbs the rounding
 * remainder, so three thirds of 100,000 come to exactly 100,000 rather
 * than 99,999.99 — a shortfall that is invisible per placement and
 * embarrassing in an annual total.
 */
export function expandFeeLines(
  terms: Pick<ResolvedTerms, "fee_model" | "instalment_plan">,
  total: number
): DraftFeeLine[] {
  const plan = terms.fee_model === "retained" ? terms.instalment_plan : [];

  if (plan.length === 0) {
    return [
      {
        kind: "instalment",
        label: "Placement fee",
        sequence: 1,
        trigger: "start_date",
        amount: roundMoney(total),
        status: "pending",
      },
    ];
  }

  const target = roundMoney(total);
  let allocated = 0;

  return plan.map((stage, index) => {
    const isLast = index === plan.length - 1;
    const amount = isLast
      ? roundMoney(target - allocated)
      : roundMoney((target * stage.percent_of_fee) / 100);

    allocated = roundMoney(allocated + amount);

    return {
      kind: "instalment" as const,
      label: stage.label,
      sequence: index + 1,
      trigger: stage.trigger,
      amount,
      status: "pending" as const,
    };
  });
}

/**
 * Where a placement stands against its guarantee.
 *
 * Derived rather than stored — see the note on `PlacementRow`. `today` is
 * a parameter rather than a `new Date()` so this is testable and so a
 * server component and the client that hydrates it cannot disagree about
 * what day it is across a midnight boundary.
 */
export type GuaranteeState = "none" | "running" | "cleared" | "broken";

export function guaranteeState(
  placement: Pick<PlacementRow, "status" | "guarantee_ends_on">,
  today: string
): GuaranteeState {
  if (placement.status === "fell_through") return "broken";
  if (placement.status !== "started") return "none";
  if (!placement.guarantee_ends_on) return "none";
  return placement.guarantee_ends_on <= today ? "cleared" : "running";
}

export const GUARANTEE_STATE_LABELS: Record<GuaranteeState, string> = {
  none: "—",
  running: "In guarantee",
  cleared: "Guarantee cleared",
  broken: "Fell through",
};

/**
 * The due date for an instalment earned on `earnedOn`.
 *
 * Kept apart from the earned date because an instalment earned on 28
 * March with net-30 terms is Q1 revenue and Q2 cash. Conflating them is
 * how a recruiting product ends up disagreeing with its own accounts.
 *
 * Date arithmetic in UTC on purpose: these are calendar dates with no
 * time, and constructing them in local time makes 1 March in London and 1
 * March in New York different days.
 */
export function dueDate(earnedOn: string, paymentTermsDays: number): string {
  const [y, m, d] = earnedOn.split("-").map(Number);
  const base = Date.UTC(y, m - 1, d);
  const due = new Date(base + paymentTermsDays * 86_400_000);
  return due.toISOString().slice(0, 10);
}

/** A reporting period, as half-open `[from, to)` ISO dates. */
export type Period = { from: string; to: string; label: string };

/**
 * The quarter containing `date`, and its neighbours.
 *
 * Half-open so a line earned on the last day of March lands in Q1 and a
 * line earned on 1 April lands in Q2, with no date belonging to both —
 * the bug that makes two quarters sum to more than the year.
 */
export function quarterOf(date: string): Period {
  const [y, m] = date.split("-").map(Number);
  const q = Math.floor((m - 1) / 3) + 1;
  const startMonth = (q - 1) * 3 + 1;
  const endYear = q === 4 ? y + 1 : y;
  const endMonth = q === 4 ? 1 : startMonth + 3;

  return {
    from: `${y}-${String(startMonth).padStart(2, "0")}-01`,
    to: `${endYear}-${String(endMonth).padStart(2, "0")}-01`,
    label: `Q${q} ${y}`,
  };
}

/** The `n` quarters ending with the one containing `date`, oldest first. */
export function recentQuarters(date: string, n: number): Period[] {
  const periods: Period[] = [];
  let cursor = date;

  for (let i = 0; i < n; i++) {
    const q = quarterOf(cursor);
    periods.unshift(q);
    // One day before this quarter starts is the last day of the previous.
    const [y, m] = q.from.split("-").map(Number);
    const prev = new Date(Date.UTC(y, m - 1, 1) - 86_400_000);
    cursor = prev.toISOString().slice(0, 10);
  }

  return periods;
}

/**
 * The acceptance test, in one function: what did we bill in this period.
 *
 * Sums `base_amount`, which is already in the org's base currency at the
 * rate fixed when the fee was booked, so the answer does not move when
 * exchange rates do. Instalments are positive and reversals negative, so
 * a clawback is subtracted by the same SUM that added the fee — and it is
 * subtracted from the period it happened in, not the one it was booked
 * in, which is what keeps a report run in March from changing in June.
 *
 * Only `earned` lines count. A pending instalment is work not yet billed,
 * and a cancelled one never will be.
 */
export function billedInPeriod(lines: readonly FeeLineRow[], period: Period): number {
  return roundMoney(
    lines
      .filter(
        (l) =>
          l.status === "earned" &&
          l.earned_on != null &&
          l.earned_on >= period.from &&
          l.earned_on < period.to
      )
      .reduce((sum, l) => sum + l.base_amount, 0)
  );
}

/** Earned but not yet billed — pending lines, whatever their date. */
export function pipelineValue(lines: readonly FeeLineRow[]): number {
  return roundMoney(
    lines.filter((l) => l.status === "pending").reduce((sum, l) => sum + l.base_amount, 0)
  );
}

/**
 * Format an amount for display.
 *
 * `Intl.NumberFormat` with the currency style rather than a hand-rolled
 * symbol table, so JPY shows no decimals and CHF shows its own separator
 * without this file knowing anything about either. `en-GB` is pinned
 * rather than taken from the browser because a server-rendered figure and
 * its client-side rehydration must produce the same string — a locale
 * read from the request would flip thousands separators on hydration and
 * React would warn about it on every money value in the product.
 *
 * ## Cents appear only when there are cents
 *
 * Rounding everything to whole units reads better on a headline and lies
 * on a ledger. A retainer of 90,000 split 33.333 / 33.333 / 33.334 is
 * 29,999.70 / 29,999.70 / 30,000.60, and rounding those three to
 * 30,000 / 30,000 / 30,001 puts a column on screen that sums to 90,001
 * against a total of 90,000 — which reads as an arithmetic bug to the one
 * person most likely to check, the recruiter reconciling an invoice. So
 * whole amounts print whole and fractional ones print their cents.
 */
export function formatMoney(amount: number, currency: string): string {
  const fractionDigits = Number.isInteger(amount) ? 0 : 2;

  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency,
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    }).format(amount);
  } catch {
    // An unrecognised ISO code should print the number, not blow up a page.
    return `${currency} ${amount.toLocaleString("en-GB", {
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    })}`;
  }
}

/** The retainer plan a client is offered when first put on retained terms. */
export { DEFAULT_RETAINER_PLAN };
