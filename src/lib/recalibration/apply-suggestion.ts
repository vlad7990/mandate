import {
  DIMENSION_KEYS,
  type DimensionKey,
  type DimensionWeights,
} from "@/lib/ai/onboarding-analysis";
import type { HealthSuggestion } from "@/lib/ai/search-health-agent";

/**
 * The bridge from a calibration-category health suggestion to a bounded
 * weight change — the one new judgment the Optimizer slice mints (§109
 * gate, D2). Pure: the caller owns persistence, re-scoring and the
 * history snapshot. Every refusal is a thrown sentence the panel can
 * show verbatim.
 *
 * The delta band mirrors feedback interpretation's contract (±3; ±5
 * reserved) — a suggestion asking for more than a recalibration could
 * apply is refused, not clamped, because silently shrinking an
 * oversized ask would misrepresent what was applied.
 */
export type CalibrationSuggestionBridge = {
  dimension: DimensionKey;
  /** The EFFECTIVE delta after the [0,10] clamp — what actually applies. */
  delta: number;
  before: DimensionWeights;
  after: DimensionWeights;
};

const MAX_DELTA = 3;

export function bridgeCalibrationSuggestion(
  suggestion: Pick<
    HealthSuggestion,
    "category" | "applicable_dimension" | "applicable_payload"
  >,
  before: DimensionWeights | null | undefined
): CalibrationSuggestionBridge {
  if (suggestion.category !== "calibration") {
    throw new Error("Only calibration suggestions can be applied here.");
  }
  const dimension = suggestion.applicable_dimension;
  if (!dimension || !DIMENSION_KEYS.includes(dimension)) {
    throw new Error("The suggestion names no scoring dimension.");
  }
  const raw = suggestion.applicable_payload?.delta;
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    throw new Error("The suggestion carries no usable weight delta.");
  }
  const delta = Math.round(raw);
  if (delta === 0) {
    throw new Error("The suggestion's delta is zero — nothing to apply.");
  }
  if (Math.abs(delta) > MAX_DELTA) {
    throw new Error(
      `The delta (${delta}) is outside the ±${MAX_DELTA} band a recalibration may apply.`
    );
  }
  if (!before) {
    throw new Error(
      "No calibration weights exist yet — finish calibration before applying weight suggestions."
    );
  }

  const current = before[dimension] ?? 0;
  const next = Math.max(0, Math.min(10, Math.round(current + delta)));
  if (next === current) {
    throw new Error(
      `${dimension} is already at ${current} — the delta changes nothing inside the [0,10] bounds.`
    );
  }

  return {
    dimension,
    delta: next - current,
    before,
    after: { ...before, [dimension]: next },
  };
}
