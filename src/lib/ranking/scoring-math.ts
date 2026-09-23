// Pure scoring helpers — safe to import from both server and client
// modules. The server-side persistence path (computeAndStoreScores)
// lives in scoring-engine.ts which carries `import "server-only"`;
// this module deliberately doesn't, so the client perspective
// leaderboard can recompute scores locally without dragging the
// Supabase server client into the browser bundle.

import type { CalibrationModel } from "@/lib/ai/role-analysis";
import type { FitDimensions } from "@/lib/ai/cv-parsing";
import type { Tier } from "./tiers";

type CalibrationWeights = NonNullable<CalibrationModel["dimension_weights"]>;

/** Map a 0–10 overall score to a tier band per the user-spec'd cutoffs. */
export function tierForScore(overall: number): Tier {
  if (overall >= 8) return "tier_1";
  if (overall >= 6) return "tier_2";
  if (overall >= 4) return "tier_3";
  return "tier_4";
}

/**
 * §196 — an approved custom dimension, paired with this candidate's
 * score on it. `score` is null when the candidate has not been assessed
 * on the axis: parsed before the dimension was approved, or parsed while
 * it was still only proposed.
 */
export type CustomDimensionScore = {
  key: string;
  weight: number;
  score: number | null;
};

/**
 * Weighted average of per-dimension scores using the project's
 * calibration_model.dimension_weights. Falls back to a flat average when
 * weights are missing or all-zero so candidates always get a score.
 *
 * §196 — `custom` carries approved custom dimensions. They enter the
 * same weighted average as the core five; there is no separate score and
 * no second ranking. An axis a recruiter approved is an axis that counts.
 *
 * UNASSESSED DIMENSIONS ARE EXCLUDED, NOT ZEROED. A candidate uploaded
 * before the dimension existed has no score on it, and scoring that as 0
 * would punish them for the timing of their upload — the system
 * asserting a deficit it has no evidence for. Excluding the dimension
 * from BOTH sides of the fraction scores them on what was actually
 * assessed, which is the honest answer. The cost is real and worth
 * naming: two candidates can then be ranked against each other on
 * different bases, so the leaderboard has to say which candidates are
 * missing an axis rather than let the number imply they were measured.
 */
export function weightedOverall(
  fit: FitDimensions,
  weights: CalibrationWeights | null | undefined,
  custom: readonly CustomDimensionScore[] = []
): number {
  const dims: Array<keyof FitDimensions> = [
    "technical",
    "domain",
    "leadership",
    "regulatory",
    "transformation",
  ];

  // Only assessed dimensions carry weight — see the note above.
  const scoredCustom = custom.filter(
    (c) => typeof c.score === "number" && Number.isFinite(c.score)
  );

  const flatAverage = () => {
    const coreSum = dims.reduce((acc, d) => acc + clamp10(fit[d]), 0);
    const customSum = scoredCustom.reduce(
      (acc, c) => acc + clamp10(c.score),
      0
    );
    return round2(
      (coreSum + customSum) / (dims.length + scoredCustom.length)
    );
  };

  if (!weights) return flatAverage();

  let weightedSum = 0;
  let weightTotal = 0;
  for (const d of dims) {
    const score = clamp10(fit[d]);
    const weight = clamp10(weights[d] ?? 0);
    weightedSum += score * weight;
    weightTotal += weight;
  }
  for (const c of scoredCustom) {
    const weight = clamp10(c.weight);
    weightedSum += clamp10(c.score) * weight;
    weightTotal += weight;
  }
  if (weightTotal === 0) return flatAverage();
  return round2(weightedSum / weightTotal);
}

export function clamp10(v: unknown): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(10, Math.round(v)));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
