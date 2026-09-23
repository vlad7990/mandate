import { describe, expect, it } from "vitest";
import {
  buildDimensionRows,
  hasCustomDimensions,
  shortLabelFor,
  unassessedRows,
  unassessedSentence,
} from "./dimension-rows";
import type {
  CustomDimension,
  DimensionWeights,
} from "@/lib/ai/onboarding-analysis";

const WEIGHTS: DimensionWeights = {
  technical: 7,
  domain: 5,
  leadership: 4,
  regulatory: 6,
  transformation: 8,
};

const CORE = {
  technical_score: 8,
  domain_score: 6,
  leadership_score: 4,
  regulatory_score: 2,
  transformation_score: 10,
};

function dim(over: Partial<CustomDimension> = {}): CustomDimension {
  return {
    key: "fx_options",
    label: "FX options market-making depth",
    definition: "A 10 has run an options book.",
    rationale: "internal",
    weight: 7,
    status: "approved",
    origin: "agent",
    ...over,
  };
}

describe("buildDimensionRows", () => {
  it("returns the five core axes in their established order", () => {
    const rows = buildDimensionRows({ calibration: null, core: CORE });
    expect(rows.map((r) => r.key)).toEqual([
      "technical",
      "domain",
      "leadership",
      "regulatory",
      "transformation",
    ]);
    expect(rows.every((r) => r.isCustom === false)).toBe(true);
  });

  it("appends approved custom axes after the five", () => {
    const rows = buildDimensionRows({
      calibration: {
        dimension_weights: WEIGHTS,
        custom_dimensions: [dim()],
      },
      core: CORE,
      customScores: { fx_options: 9 },
    });
    expect(rows).toHaveLength(6);
    expect(rows[5]).toMatchObject({
      key: "fx_options",
      score: 9,
      weight: 7,
      isCustom: true,
    });
  });

  it("NEVER surfaces a proposed axis — the approval gate holds here too", () => {
    const rows = buildDimensionRows({
      calibration: {
        custom_dimensions: [
          dim({ key: "approved_one", status: "approved" }),
          dim({ key: "proposed_one", status: "proposed" }),
        ],
      },
      core: CORE,
      customScores: { approved_one: 5, proposed_one: 9 },
    });
    expect(rows.map((r) => r.key)).not.toContain("proposed_one");
    expect(rows.map((r) => r.key)).toContain("approved_one");
  });

  it("an unassessed custom axis is null, NOT zero", () => {
    const rows = buildDimensionRows({
      calibration: { custom_dimensions: [dim()] },
      core: CORE,
      customScores: {},
    });
    expect(rows[5].score).toBeNull();
    // The distinction is the whole point: a real zero stays a zero.
    const zeroed = buildDimensionRows({
      calibration: { custom_dimensions: [dim()] },
      core: CORE,
      customScores: { fx_options: 0 },
    });
    expect(zeroed[5].score).toBe(0);
  });

  it("treats an unreadable stored score as unassessed rather than zero", () => {
    for (const bad of ["7", null, undefined, NaN, {}]) {
      const rows = buildDimensionRows({
        calibration: { custom_dimensions: [dim()] },
        core: CORE,
        customScores: { fx_options: bad },
      });
      expect(rows[5].score).toBeNull();
    }
  });

  it("carries weights, and null weights when the mandate has none", () => {
    const withW = buildDimensionRows({
      calibration: { dimension_weights: WEIGHTS },
      core: CORE,
    });
    expect(withW[0].weight).toBe(7);
    const withoutW = buildDimensionRows({ calibration: {}, core: CORE });
    expect(withoutW.every((r) => r.weight === null)).toBe(true);
  });

  it("survives a calibration written before this slice", () => {
    const rows = buildDimensionRows({ calibration: undefined, core: CORE });
    expect(rows).toHaveLength(5);
    expect(rows[0].score).toBe(8);
  });

  it("clamps a core score out of range", () => {
    const rows = buildDimensionRows({
      calibration: null,
      core: { ...CORE, technical_score: 99 },
    });
    expect(rows[0].score).toBe(10);
  });

  it("yields null scores when there is no score row at all", () => {
    const rows = buildDimensionRows({ calibration: null, core: null });
    expect(rows.every((r) => r.score === null)).toBe(true);
  });
});

describe("unassessedSentence — what a displayed overall did not measure", () => {
  it("is null when every axis was assessed", () => {
    const rows = buildDimensionRows({
      calibration: { custom_dimensions: [dim()] },
      core: CORE,
      customScores: { fx_options: 4 },
    });
    expect(unassessedSentence(rows)).toBeNull();
  });

  it("names the axis and says it was excluded, not zeroed", () => {
    const rows = buildDimensionRows({
      calibration: { custom_dimensions: [dim()] },
      core: CORE,
      customScores: {},
    });
    const sentence = unassessedSentence(rows);
    expect(sentence).toContain("FX options market-making depth");
    expect(sentence).toContain("excluded");
    expect(sentence).toContain("rather than counted as zero");
  });

  it("is a claim about the ASSESSMENT, never about the person", () => {
    const rows = buildDimensionRows({
      calibration: { custom_dimensions: [dim()] },
      core: CORE,
      customScores: {},
    });
    const sentence = unassessedSentence(rows)!.toLowerCase();
    // The §175 defect class: "not assessed" must never become a deficit.
    for (const forbidden of [
      "lacks",
      "no evidence",
      "below",
      "short of",
      "weak",
      "fails",
    ]) {
      expect(sentence).not.toContain(forbidden);
    }
    expect(sentence).toContain("not assessed on");
  });

  it("lists several axes readably", () => {
    const rows = buildDimensionRows({
      calibration: {
        custom_dimensions: [
          // Two chars minimum — a single-letter key is refused by
          // `isValidCustomKey`, which is how the first draft of this
          // test silently produced zero rows.
          dim({ key: "ax", label: "Axis A" }),
          dim({ key: "bx", label: "Axis B" }),
        ],
      },
      core: CORE,
      customScores: {},
    });
    expect(unassessedSentence(rows)).toContain("Axis A and Axis B");
  });

  it("ignores core dimensions — an unscored core axis is a different problem", () => {
    const rows = buildDimensionRows({ calibration: null, core: null });
    expect(unassessedRows(rows)).toHaveLength(5);
    expect(unassessedSentence(rows)).toBeNull();
  });
});

describe("shortLabelFor", () => {
  it("reads off the label, not the truncated slug", () => {
    // The slug is cut at 36 chars and can stop mid-word — fine as an
    // identifier, poor as a column heading.
    expect(
      shortLabelFor({
        key: "lloyd_s_syndicate_underwriting_autho",
        label: "Lloyd's syndicate authority",
      })
    ).toBe("LLOYD S");
  });

  it("keeps a single long word whole up to the cap", () => {
    expect(shortLabelFor({ key: "k", label: "Underwriting" })).toBe("UNDERWRI");
  });

  it("pairs two short words", () => {
    expect(shortLabelFor({ key: "k", label: "FX options depth" })).toBe(
      "FX OPTIONS"
    );
  });

  it("falls back to the key when the label has no usable characters", () => {
    expect(shortLabelFor({ key: "fx_options", label: "——" })).toBe("FX_OPTIO");
  });
});

describe("hasCustomDimensions", () => {
  it("is false for a mandate on the five, whatever the shape", () => {
    expect(hasCustomDimensions(null)).toBe(false);
    expect(hasCustomDimensions({})).toBe(false);
    expect(hasCustomDimensions({ custom_dimensions: [] })).toBe(false);
  });

  it("is false when the only custom axis is still PROPOSED", () => {
    expect(
      hasCustomDimensions({ custom_dimensions: [dim({ status: "proposed" })] })
    ).toBe(false);
  });

  it("is true once one is approved and weighted", () => {
    expect(hasCustomDimensions({ custom_dimensions: [dim()] })).toBe(true);
  });
});
