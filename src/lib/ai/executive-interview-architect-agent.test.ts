import { describe, expect, test } from "vitest";
import {
  EMPTY_INTERVIEW_PLAN,
  normalizeInterviewPlan,
} from "./executive-interview-architect-agent";

describe("normalizeInterviewPlan", () => {
  test("returns an empty plan for null/non-object input", () => {
    expect(normalizeInterviewPlan(null)).toEqual(EMPTY_INTERVIEW_PLAN);
    expect(normalizeInterviewPlan("nope")).toEqual(EMPTY_INTERVIEW_PLAN);
    expect(normalizeInterviewPlan(undefined)).toEqual(EMPTY_INTERVIEW_PLAN);
  });

  test("fills missing fields so the editor always renders", () => {
    const result = normalizeInterviewPlan({ overview: "Just an overview." });
    expect(result.overview).toBe("Just an overview.");
    expect(result.stages).toEqual([]);
    expect(result.competency_coverage).toEqual([]);
  });

  test("coerces a stage's fields and clamps duration", () => {
    const result = normalizeInterviewPlan({
      stages: [
        {
          stage_name: "Deep Dive",
          objective: "Assess scaling",
          recommended_interviewer_role: "Peer CTO",
          duration_minutes: 999,
          assigned_competencies: ["scaling_systems", 42, null],
          core_questions: ["Q1", "  ", 7],
          follow_up_questions: [],
          candidate_specific_questions: [],
          evidence_to_listen_for: ["Named a 3x inflection"],
          weak_answer_indicators: ["Vague on scale"],
          red_flags: [],
        },
      ],
    });
    const s = result.stages[0];
    expect(s.duration_minutes).toBe(600); // clamped to max
    expect(s.assigned_competencies).toEqual(["scaling_systems"]); // non-strings dropped
    expect(s.core_questions).toEqual(["Q1"]); // blank + non-string dropped
    expect(s.evidence_to_listen_for).toEqual(["Named a 3x inflection"]);
  });

  test("de-duplicates questions across ALL stages, keeping first occurrence", () => {
    const result = normalizeInterviewPlan({
      stages: [
        {
          stage_name: "Stage 1",
          core_questions: ["Tell me about scaling.", "Describe a hard call."],
          follow_up_questions: ["What broke?"],
          candidate_specific_questions: [],
          objective: "",
          recommended_interviewer_role: "",
          duration_minutes: 60,
          assigned_competencies: [],
          evidence_to_listen_for: [],
          weak_answer_indicators: [],
          red_flags: [],
        },
        {
          stage_name: "Stage 2",
          // "Tell me about scaling." duplicates stage 1 (case/space-insensitive);
          // "What broke?" duplicates a follow-up from stage 1.
          core_questions: ["tell me about   scaling.", "A fresh question."],
          follow_up_questions: ["what broke?"],
          candidate_specific_questions: ["Describe a hard call."],
          objective: "",
          recommended_interviewer_role: "",
          duration_minutes: 60,
          assigned_competencies: [],
          evidence_to_listen_for: [],
          weak_answer_indicators: [],
          red_flags: [],
        },
      ],
    });

    expect(result.stages[0].core_questions).toEqual([
      "Tell me about scaling.",
      "Describe a hard call.",
    ]);
    // Stage 2: the scaling dup is gone, the fresh one stays.
    expect(result.stages[1].core_questions).toEqual(["A fresh question."]);
    // Stage 2 follow-up dup of stage 1 is gone.
    expect(result.stages[1].follow_up_questions).toEqual([]);
    // Stage 2 candidate-specific dup of stage 1's core question is gone.
    expect(result.stages[1].candidate_specific_questions).toEqual([]);
  });

  test("drops malformed stages to safe empty values without throwing", () => {
    const result = normalizeInterviewPlan({
      stages: ["not an object", null, 5, {}],
    });
    expect(result.stages).toHaveLength(4);
    for (const s of result.stages) {
      expect(s.stage_name).toBe("");
      expect(s.core_questions).toEqual([]);
      expect(s.duration_minutes).toBe(0);
    }
  });

  test("normalizes and clamps competency_coverage weights", () => {
    const result = normalizeInterviewPlan({
      competency_coverage: [
        { competency_key: "a", competency_name: "A", weight: 150, covered_by: ["S1"] },
        { competency_key: "b", competency_name: "B", weight: "high", covered_by: [] },
        "garbage",
      ],
    });
    expect(result.competency_coverage).toEqual([
      { competency_key: "a", competency_name: "A", weight: 100, covered_by: ["S1"] },
      { competency_key: "b", competency_name: "B", weight: 0, covered_by: [] },
    ]);
  });
});
