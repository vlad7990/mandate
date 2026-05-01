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
 * Weighted average of per-dimension scores using the project's
 * calibration_model.dimension_weights. Falls back to a flat average when
 * weights are missing or all-zero so candidates always get a score.
 */
export function weightedOverall(
  fit: FitDimensions,
  weights: CalibrationWeights | null | undefined
): number {
  const dims: Array<keyof FitDimensions> = [
    "technical",
    "domain",
    "leadership",
    "regulatory",
    "transformation",
  ];
  if (!weights) {
    const sum = dims.reduce((acc, d) => acc + clamp10(fit[d]), 0);
    return round2(sum / dims.length);
  }
  let weightedSum = 0;
  let weightTotal = 0;
  for (const d of dims) {
    const score = clamp10(fit[d]);
    const weight = clamp10(weights[d] ?? 0);
    weightedSum += score * weight;
    weightTotal += weight;
  }
  if (weightTotal === 0) {
    const sum = dims.reduce((acc, d) => acc + clamp10(fit[d]), 0);
    return round2(sum / dims.length);
  }
  return round2(weightedSum / weightTotal);
}

export function clamp10(v: unknown): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(10, Math.round(v)));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
