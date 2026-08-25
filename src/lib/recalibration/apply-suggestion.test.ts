import { describe, expect, it } from "vitest";
import { bridgeCalibrationSuggestion } from "./apply-suggestion";
import type { DimensionWeights } from "@/lib/ai/onboarding-analysis";

const WEIGHTS: DimensionWeights = {
  technical: 7,
  domain: 5,
  leadership: 4,
  regulatory: 6,
  transformation: 8,
};

function suggestion(over: Record<string, unknown> = {}) {
  return {
    category: "calibration" as const,
    applicable_dimension: "regulatory" as const,
    applicable_payload: { delta: 2 },
    ...over,
  };
}

describe("bridgeCalibrationSuggestion", () => {
  it("applies a bounded delta and returns before/after", () => {
    const b = bridgeCalibrationSuggestion(suggestion(), WEIGHTS);
    expect(b.dimension).toBe("regulatory");
    expect(b.delta).toBe(2);
    expect(b.before.regulatory).toBe(6);
    expect(b.after.regulatory).toBe(8);
    // Nothing else moves.
    expect(b.after.technical).toBe(7);
  });

  it("clamps at the [0,10] bound and reports the EFFECTIVE delta", () => {
    const b = bridgeCalibrationSuggestion(
      suggestion({ applicable_payload: { delta: 3 } }),
      { ...WEIGHTS, regulatory: 9 }
    );
    expect(b.after.regulatory).toBe(10);
    expect(b.delta).toBe(1);
  });

  it("refuses a non-calibration category", () => {
    expect(() =>
      bridgeCalibrationSuggestion(suggestion({ category: "sourcing" }), WEIGHTS)
    ).toThrow(/only calibration/i);
  });

  it("refuses a missing or unknown dimension", () => {
    expect(() =>
      bridgeCalibrationSuggestion(
        suggestion({ applicable_dimension: undefined }),
        WEIGHTS
      )
    ).toThrow(/names no scoring dimension/i);
    expect(() =>
      bridgeCalibrationSuggestion(
        suggestion({ applicable_dimension: "charisma" }),
        WEIGHTS
      )
    ).toThrow(/names no scoring dimension/i);
  });

  it("refuses a zero, missing, or non-numeric delta", () => {
    expect(() =>
      bridgeCalibrationSuggestion(
        suggestion({ applicable_payload: { delta: 0 } }),
        WEIGHTS
      )
    ).toThrow(/zero/i);
    expect(() =>
      bridgeCalibrationSuggestion(
        suggestion({ applicable_payload: null }),
        WEIGHTS
      )
    ).toThrow(/no usable weight delta/i);
    expect(() =>
      bridgeCalibrationSuggestion(
        suggestion({ applicable_payload: { delta: "big" } }),
        WEIGHTS
      )
    ).toThrow(/no usable weight delta/i);
  });

  it("refuses a delta outside the ±3 band rather than clamping it", () => {
    expect(() =>
      bridgeCalibrationSuggestion(
        suggestion({ applicable_payload: { delta: 5 } }),
        WEIGHTS
      )
    ).toThrow(/outside the ±3 band/i);
  });

  it("refuses when no baseline weights exist (mirrors applyRecalibration's skip)", () => {
    expect(() => bridgeCalibrationSuggestion(suggestion(), null)).toThrow(
      /no calibration weights exist/i
    );
  });

  it("refuses a no-op at the bound instead of pretending to apply", () => {
    expect(() =>
      bridgeCalibrationSuggestion(
        suggestion({ applicable_payload: { delta: 2 } }),
        { ...WEIGHTS, regulatory: 10 }
      )
    ).toThrow(/changes nothing/i);
  });
});
