import { describe, expect, it } from "vitest";
import {
  clamp10,
  tierForScore,
  weightedOverall,
  type CustomDimensionScore,
} from "./scoring-math";
import type { FitDimensions } from "@/lib/ai/cv-parsing";
import type { DimensionWeights } from "@/lib/ai/onboarding-analysis";

const FIT: FitDimensions = {
  technical: 8,
  domain: 6,
  leadership: 4,
  regulatory: 2,
  transformation: 10,
};

const FLAT: DimensionWeights = {
  technical: 5,
  domain: 5,
  leadership: 5,
  regulatory: 5,
  transformation: 5,
};

describe("weightedOverall — the core five (unchanged behaviour)", () => {
  it("flat weights give the flat average", () => {
    expect(weightedOverall(FIT, FLAT)).toBe(6);
  });

  it("no weights fall back to the flat average", () => {
    expect(weightedOverall(FIT, null)).toBe(6);
    expect(weightedOverall(FIT, undefined)).toBe(6);
  });

  it("all-zero weights fall back rather than divide by zero", () => {
    const zero = { ...FLAT };
    for (const k of Object.keys(zero) as (keyof DimensionWeights)[]) zero[k] = 0;
    expect(weightedOverall(FIT, zero)).toBe(6);
  });

  it("weights steer the result", () => {
    // Everything on regulatory, where the candidate scores 2.
    const reg: DimensionWeights = { ...FLAT };
    for (const k of Object.keys(reg) as (keyof DimensionWeights)[]) reg[k] = 0;
    reg.regulatory = 10;
    expect(weightedOverall(FIT, reg)).toBe(2);
  });

  it("omitting the custom argument is identical to passing none", () => {
    expect(weightedOverall(FIT, FLAT)).toBe(weightedOverall(FIT, FLAT, []));
  });
});

describe("weightedOverall — §196 custom dimensions", () => {
  it("an assessed custom dimension enters the same weighted average", () => {
    const custom: CustomDimensionScore[] = [
      { key: "fx_options", weight: 5, score: 0 },
    ];
    // Six axes at weight 5: (8+6+4+2+10+0)/6 = 5.
    expect(weightedOverall(FIT, FLAT, custom)).toBe(5);
  });

  it("a heavy custom dimension can move the ranking, which is the point", () => {
    const custom: CustomDimensionScore[] = [
      { key: "fx_options", weight: 10, score: 10 },
    ];
    // (8+6+4+2+10)*5 + 10*10 = 150 + 100 = 250 over 35 weight.
    expect(weightedOverall(FIT, FLAT, custom)).toBe(7.14);
  });

  it("UNASSESSED IS EXCLUDED, NOT ZEROED — the whole honest-absence rule", () => {
    const unassessed: CustomDimensionScore[] = [
      { key: "fx_options", weight: 10, score: null },
    ];
    // Identical to having no custom dimension at all...
    expect(weightedOverall(FIT, FLAT, unassessed)).toBe(6);
    // ...and strictly better than being scored zero for it, which is
    // what a candidate would suffer if timing of upload counted against
    // them.
    const zeroed: CustomDimensionScore[] = [
      { key: "fx_options", weight: 10, score: 0 },
    ];
    expect(weightedOverall(FIT, FLAT, zeroed)).toBeLessThan(
      weightedOverall(FIT, FLAT, unassessed)
    );
  });

  it("treats a non-finite stored score as unassessed, not as zero", () => {
    for (const bad of [NaN, Infinity, undefined as unknown as number]) {
      const custom: CustomDimensionScore[] = [
        { key: "fx_options", weight: 10, score: bad },
      ];
      expect(weightedOverall(FIT, FLAT, custom)).toBe(6);
    }
  });

  it("a zero-weight custom dimension moves nothing", () => {
    const custom: CustomDimensionScore[] = [
      { key: "fx_options", weight: 0, score: 10 },
    ];
    expect(weightedOverall(FIT, FLAT, custom)).toBe(6);
  });

  it("clamps an out-of-range stored score", () => {
    const custom: CustomDimensionScore[] = [
      { key: "fx_options", weight: 5, score: 99 },
    ];
    // Clamped to 10: (8+6+4+2+10+10)/6 = 6.67.
    expect(weightedOverall(FIT, FLAT, custom)).toBe(6.67);
  });

  it("the no-weights fallback counts assessed custom axes in the flat average", () => {
    const custom: CustomDimensionScore[] = [
      { key: "a", weight: 7, score: 0 },
      { key: "b", weight: 7, score: null },
    ];
    // Only the assessed one joins: (8+6+4+2+10+0)/6 = 5.
    expect(weightedOverall(FIT, null, custom)).toBe(5);
  });

  it("all-zero core weights with a weighted custom axis still scores on it", () => {
    const zero = { ...FLAT };
    for (const k of Object.keys(zero) as (keyof DimensionWeights)[]) zero[k] = 0;
    const custom: CustomDimensionScore[] = [
      { key: "fx_options", weight: 10, score: 10 },
    ];
    // Weight total is non-zero because the custom axis carries it, so
    // this is a real weighted average rather than the flat fallback.
    expect(weightedOverall(FIT, zero, custom)).toBe(10);
  });
});

describe("tierForScore + clamp10", () => {
  it("bands at the documented cutoffs", () => {
    expect(tierForScore(8)).toBe("tier_1");
    expect(tierForScore(7.99)).toBe("tier_2");
    expect(tierForScore(6)).toBe("tier_2");
    expect(tierForScore(4)).toBe("tier_3");
    expect(tierForScore(3.99)).toBe("tier_4");
  });

  it("clamps to 0-10 integers and treats non-numbers as 0", () => {
    expect(clamp10(11)).toBe(10);
    expect(clamp10(-1)).toBe(0);
    expect(clamp10(4.6)).toBe(5);
    expect(clamp10("7")).toBe(0);
    expect(clamp10(NaN)).toBe(0);
  });
});
