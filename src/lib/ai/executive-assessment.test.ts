import { describe, expect, test } from "vitest";
import {
  EMPTY_ASSESSMENT,
  applyRollup,
  buildAssessmentSkeleton,
  normalizeAssessment,
} from "./executive-assessment";
import type { OperationalWeight } from "@/lib/executive/assessment-scoring";

const WEIGHTS: OperationalWeight[] = [
  { competency_key: "eng_excellence", label: "Engineering Excellence", weight: 90 },
  { competency_key: "tech_strategy", label: "Technology Strategy", weight: 60 },
];

describe("normalizeAssessment", () => {
  test("returns the empty shape for non-object input", () => {
    expect(normalizeAssessment(null)).toEqual(EMPTY_ASSESSMENT);
    expect(normalizeAssessment("nope")).toEqual(EMPTY_ASSESSMENT);
  });

  test("coerces missing fields to safe defaults", () => {
    const result = normalizeAssessment({ overall_summary: 42 });
    expect(result.overall_summary).toBe("");
    expect(result.competency_assessments).toEqual([]);
    expect(result.weighted_evidence_strength).toBe(0);
  });

  test("clamps unknown ratings to 'none'", () => {
    const result = normalizeAssessment({
      competency_assessments: [
        { competency_key: "eng_excellence", rating: "amazing", evidence: "x" },
      ],
    });
    expect(result.competency_assessments[0].rating).toBe("none");
  });

  test("drops blank keys and de-duplicates competencies, keeping the first", () => {
    const result = normalizeAssessment({
      competency_assessments: [
        { competency_key: "", rating: "strong", evidence: "blank" },
        { competency_key: "eng_excellence", rating: "strong", evidence: "first" },
        { competency_key: "eng_excellence", rating: "none", evidence: "dup" },
      ],
    });
    expect(result.competency_assessments).toHaveLength(1);
    expect(result.competency_assessments[0].evidence).toBe("first");
  });

  test("rejects an out-of-range client-supplied strength", () => {
    expect(normalizeAssessment({ weighted_evidence_strength: 5 }).weighted_evidence_strength).toBe(0);
    expect(normalizeAssessment({ weighted_evidence_strength: -1 }).weighted_evidence_strength).toBe(0);
    expect(normalizeAssessment({ weighted_evidence_strength: 0.5 }).weighted_evidence_strength).toBe(0.5);
  });
});

describe("applyRollup", () => {
  test("recomputes rollup + strength from weights, ignoring stale client values", () => {
    const content = normalizeAssessment({
      competency_assessments: [
        { competency_key: "eng_excellence", rating: "strong", evidence: "x" },
      ],
      weighted_evidence_strength: 0.99, // stale/forged
    });
    const scored = applyRollup(content, WEIGHTS);
    expect(scored.evidence_rollup).toHaveLength(2);
    expect(scored.weighted_evidence_strength).toBeCloseTo(90 / 150, 5);
  });
});

describe("buildAssessmentSkeleton", () => {
  const PLAN = {
    stages: [
      { stage_name: "Technical Deep-Dive", assigned_competencies: ["eng_excellence"] },
      {
        stage_name: "Strategy Session",
        assigned_competencies: ["tech_strategy", "eng_excellence"],
      },
    ],
  };

  test("creates one row per operational weight, in weight order, defaulted to 'none'", () => {
    const skeleton = buildAssessmentSkeleton(WEIGHTS, PLAN);
    expect(skeleton.competency_assessments.map((c) => c.competency_key)).toEqual([
      "eng_excellence",
      "tech_strategy",
    ]);
    expect(skeleton.competency_assessments.every((c) => c.rating === "none")).toBe(true);
    expect(skeleton.weighted_evidence_strength).toBe(0);
  });

  test("pre-fills source_stages from the plan's assigned competencies", () => {
    const skeleton = buildAssessmentSkeleton(WEIGHTS, PLAN);
    expect(skeleton.competency_assessments[0].source_stages).toEqual([
      "Technical Deep-Dive",
      "Strategy Session",
    ]);
    expect(skeleton.competency_assessments[1].source_stages).toEqual(["Strategy Session"]);
  });

  test("tolerates a missing/blank plan", () => {
    const skeleton = buildAssessmentSkeleton(WEIGHTS, null);
    expect(skeleton.competency_assessments).toHaveLength(2);
    expect(skeleton.competency_assessments[0].source_stages).toEqual([]);
  });
});
