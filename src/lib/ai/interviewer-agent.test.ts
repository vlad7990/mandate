import { describe, expect, it } from "vitest";
import {
  computeDimensionCoverage,
  normalizeMainstreamPlan,
} from "./interviewer-agent";

const WEIGHTS = {
  technical: 7,
  domain: 8,
  leadership: 6,
  regulatory: 9,
  transformation: 3,
};

const stage = (name: string, dims: string[], questions: string[] = []) => ({
  stage_name: name,
  objective: "obj",
  recommended_interviewer_role: "Hiring manager",
  duration_minutes: 60,
  assigned_dimensions: dims,
  core_questions: questions,
  follow_up_questions: [],
  candidate_specific_questions: [],
  evidence_to_listen_for: [],
  weak_answer_indicators: [],
  red_flags: [],
});

describe("computeDimensionCoverage", () => {
  it("reports coverage from stage assignments, sorted by weight", () => {
    const coverage = computeDimensionCoverage(WEIGHTS, [
      stage("Depth", ["regulatory", "domain"]),
      stage("Breadth", ["technical"]),
    ]);
    expect(coverage.map((c) => c.dimension_key)).toEqual([
      "regulatory",
      "domain",
      "technical",
      "leadership",
      "transformation",
    ]);
    expect(coverage[0].covered_by).toEqual(["Depth"]);
    expect(coverage.find((c) => c.dimension_key === "leadership")?.covered_by).toEqual([]);
  });

  it("ignores the agent's own coverage claims — only assignments count", () => {
    const plan = normalizeMainstreamPlan({
      overview: "x",
      stages: [stage("Only", ["technical"])],
      dimension_coverage: [
        { dimension_key: "leadership", dimension_name: "L", weight: 10, covered_by: ["Invented"] },
      ],
    });
    const coverage = computeDimensionCoverage(WEIGHTS, plan.stages);
    expect(
      coverage.find((c) => c.dimension_key === "leadership")?.covered_by
    ).toEqual([]);
  });

  it("clamps weights into 0–10", () => {
    const coverage = computeDimensionCoverage(
      { ...WEIGHTS, technical: 99 },
      []
    );
    expect(coverage.find((c) => c.dimension_key === "technical")?.weight).toBe(10);
  });
});

describe("normalizeMainstreamPlan", () => {
  it("returns the empty plan for garbage", () => {
    expect(normalizeMainstreamPlan(null).stages).toEqual([]);
    expect(normalizeMainstreamPlan("nonsense").overview).toBe("");
  });

  it("de-duplicates questions across stages, keeping the first", () => {
    const plan = normalizeMainstreamPlan({
      overview: "o",
      stages: [
        stage("A", [], ["Tell me about scale.", "Unique to A?"]),
        stage("B", [], ["tell me about SCALE.", "Unique to B?"]),
      ],
    });
    expect(plan.stages[0].core_questions).toEqual([
      "Tell me about scale.",
      "Unique to A?",
    ]);
    expect(plan.stages[1].core_questions).toEqual(["Unique to B?"]);
  });

  it("clamps durations and drops non-string list entries", () => {
    const plan = normalizeMainstreamPlan({
      overview: "o",
      stages: [
        {
          ...stage("A", ["technical"]),
          duration_minutes: 10_000,
          red_flags: ["real", 42, "", null],
        },
      ],
    });
    expect(plan.stages[0].duration_minutes).toBe(600);
    expect(plan.stages[0].red_flags).toEqual(["real"]);
  });
});
