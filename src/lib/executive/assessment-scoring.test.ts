import { describe, expect, test } from "vitest";
import {
  RATING_SCORES,
  computeEvidenceRollup,
  computeWeightedEvidenceStrength,
  type OperationalWeight,
} from "./assessment-scoring";
import type { CompetencyAssessment } from "./types";

const WEIGHTS: OperationalWeight[] = [
  { competency_key: "eng_excellence", label: "Engineering Excellence", weight: 90 },
  { competency_key: "tech_strategy", label: "Technology Strategy", weight: 60 },
  { competency_key: "org_design", label: "Organizational Design", weight: 50 },
];

function assessment(
  key: string,
  rating: CompetencyAssessment["rating"]
): CompetencyAssessment {
  return { competency_key: key, rating, evidence: "", source_stages: [] };
}

describe("computeEvidenceRollup", () => {
  test("emits one entry per operational weight, in weight order", () => {
    const rollup = computeEvidenceRollup(WEIGHTS, []);
    expect(rollup.map((r) => r.competency_key)).toEqual([
      "eng_excellence",
      "tech_strategy",
      "org_design",
    ]);
  });

  test("maps recorded ratings to their evidence scores", () => {
    const rollup = computeEvidenceRollup(WEIGHTS, [
      assessment("eng_excellence", "strong"),
      assessment("tech_strategy", "limited"),
    ]);
    expect(rollup[0]).toMatchObject({ rating: "strong", evidence_score: 1 });
    expect(rollup[1]).toMatchObject({
      rating: "limited",
      evidence_score: RATING_SCORES.limited,
    });
  });

  test("scores a competency with no recorded assessment as 'none'", () => {
    const rollup = computeEvidenceRollup(WEIGHTS, [assessment("eng_excellence", "strong")]);
    expect(rollup[2]).toMatchObject({ rating: "none", evidence_score: 0 });
  });

  test("ignores assessments for keys not in the operational weights", () => {
    const rollup = computeEvidenceRollup(WEIGHTS, [assessment("hallucinated_key", "strong")]);
    expect(rollup.every((r) => r.competency_key !== "hallucinated_key")).toBe(true);
    expect(rollup.every((r) => r.rating === "none")).toBe(true);
  });

  test("uses the first entry when a competency is duplicated", () => {
    const rollup = computeEvidenceRollup(WEIGHTS, [
      assessment("eng_excellence", "strong"),
      assessment("eng_excellence", "none"),
    ]);
    expect(rollup[0].rating).toBe("strong");
  });
});

describe("computeWeightedEvidenceStrength", () => {
  test("returns 0 when there are no weights", () => {
    expect(computeWeightedEvidenceStrength([])).toBe(0);
  });

  test("returns 0 when no evidence is recorded (all 'none')", () => {
    const rollup = computeEvidenceRollup(WEIGHTS, []);
    expect(computeWeightedEvidenceStrength(rollup)).toBe(0);
  });

  test("returns 1 when every competency has strong evidence", () => {
    const rollup = computeEvidenceRollup(
      WEIGHTS,
      WEIGHTS.map((w) => assessment(w.competency_key, "strong"))
    );
    expect(computeWeightedEvidenceStrength(rollup)).toBe(1);
  });

  test("weights higher-weighted competencies more heavily", () => {
    // strong on the 90-weight, none elsewhere → 90 / 200 = 0.45
    const rollup = computeEvidenceRollup(WEIGHTS, [assessment("eng_excellence", "strong")]);
    expect(computeWeightedEvidenceStrength(rollup)).toBeCloseTo(90 / 200, 5);
  });

  test("ignores non-positive weights in the denominator", () => {
    const weights: OperationalWeight[] = [
      { competency_key: "a", label: "A", weight: 100 },
      { competency_key: "b", label: "B", weight: 0 },
    ];
    const rollup = computeEvidenceRollup(weights, [assessment("a", "strong")]);
    expect(computeWeightedEvidenceStrength(rollup)).toBe(1);
  });
});
