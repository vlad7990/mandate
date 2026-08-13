// Per-lineage conversion — and the guard that stops it lying.
//
// Design: docs/superpowers/specs/2026-08-12-sourcing-runs-design.md
//
// A sourcing lineage now records what it produced, so the obvious next move is
// to divide hires by candidates and rank the strategies. That number is worse
// than useless on a small sample: two hires across four strategies is noise,
// and "Adjacent converts 3× better than Tier-1" is a confident wrong answer
// that a recruiter will act on — by pouring the next month into the strategy
// that got luckier. There is no way to present a ratio tentatively enough to
// undo that; the only safe move is to withhold it and say why.
//
// Below the threshold the caller gets counts and an explicit reason. Never a
// rate, never a rank, never a "trending" arrow.

import type { PipelineStage } from "@/lib/ai/cv-parsing";

/**
 * A lineage needs this many attributed candidates before any rate is shown.
 *
 * Suggested by the design doc and deliberately blunt — revisit it with real
 * data rather than intuition.
 */
export const MIN_LINKED_CANDIDATES = 20;

/** …and this many of them must have actually finished. */
export const MIN_TERMINAL_OUTCOMES = 3;

/**
 * The stages that END a candidate's journey.
 *
 * `offer` is NOT terminal: an offer can still be declined, and counting it as a
 * win inflates every strategy that is good at getting to offer and bad at
 * closing — which is exactly the distinction a sourcing lead needs to see.
 */
export const TERMINAL_STAGES: readonly PipelineStage[] = ["hired", "rejected"];

export function isTerminal(stage: PipelineStage): boolean {
  return TERMINAL_STAGES.includes(stage);
}

export type ConversionInput = {
  /** One entry per candidate attributed to the lineage (first touch). */
  candidates: ReadonlyArray<{ pipeline_stage: PipelineStage | null }>;
};

export type SuppressedReason = "too_few_linked" | "too_few_terminal";

export type LineageConversion = {
  /** Candidates this lineage is credited with, on first-touch attribution. */
  linked: number;
  /** Of those, how many have finished — hired or rejected. */
  terminal: number;
  hired: number;
  rejected: number;
  /** Still moving: linked minus terminal. Not failures, just undecided. */
  in_flight: number;
  /**
   * Hires as a share of FINISHED candidates, or null when withheld.
   *
   * The denominator is terminal outcomes, not linked candidates, because a
   * candidate still in the pipeline is censored data — not a loss. Dividing by
   * everyone linked would punish a young lineage for the sin of being young,
   * and would make any strategy look worse the more candidates it surfaced.
   */
  hire_rate: number | null;
  /** Why `hire_rate` is null. Null itself when a rate IS shown. */
  suppressed: SuppressedReason | null;
};

/**
 * Whether a sample is big enough to express as a rate at all.
 *
 * Both conditions, not either: 40 linked candidates with one decision is as
 * uninformative as 3 linked candidates with 3 decisions.
 */
export function canShowRate(linked: number, terminal: number): boolean {
  return linked >= MIN_LINKED_CANDIDATES && terminal >= MIN_TERMINAL_OUTCOMES;
}

export function computeLineageConversion(
  input: ConversionInput
): LineageConversion {
  let hired = 0;
  let rejected = 0;

  for (const c of input.candidates) {
    if (c.pipeline_stage === "hired") hired++;
    else if (c.pipeline_stage === "rejected") rejected++;
  }

  const linked = input.candidates.length;
  const terminal = hired + rejected;

  if (!canShowRate(linked, terminal)) {
    return {
      linked,
      terminal,
      hired,
      rejected,
      in_flight: linked - terminal,
      hire_rate: null,
      // Report the binding constraint. "Needs 20 candidates" and "needs 3
      // outcomes" are different waits and the recruiter can act on the
      // difference; a generic "not enough data" tells them nothing.
      suppressed:
        linked < MIN_LINKED_CANDIDATES ? "too_few_linked" : "too_few_terminal",
    };
  }

  return {
    linked,
    terminal,
    hired,
    rejected,
    in_flight: linked - terminal,
    hire_rate: hired / terminal,
    suppressed: null,
  };
}

/**
 * What to print where a rate would go.
 *
 * Always says what is missing and how much. The house rule is that provisional
 * figures carry a visible label at the point of display — an empty cell or a
 * dash reads as "zero", which is a different and equally wrong claim.
 */
export function suppressionLabel(conversion: LineageConversion): string | null {
  if (!conversion.suppressed) return null;
  if (conversion.suppressed === "too_few_linked") {
    const need = MIN_LINKED_CANDIDATES - conversion.linked;
    return `Too early to compare — ${need} more candidate${need === 1 ? "" : "s"} needed`;
  }
  const need = MIN_TERMINAL_OUTCOMES - conversion.terminal;
  return `Too early to compare — ${need} more outcome${need === 1 ? "" : "s"} needed`;
}

/** `0.4` → `"40%"`. Only ever called on an unsuppressed rate. */
export function formatRate(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}
