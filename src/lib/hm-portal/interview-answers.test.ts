import { describe, expect, it } from "vitest";
import {
  composeClientInterviewContent,
  parseAnswersBody,
} from "./interview-answers-core";
import type { ClientInterviewQuestion } from "@/lib/ai/client-interview-agent";

const INTERVIEW_ID = "3b241101-e2bb-4255-8caf-4136c566a962";

const QUESTIONS: ClientInterviewQuestion[] = [
  {
    id: "q01",
    question: "What is the compensation range?",
    why_it_matters: "Anchors offers.",
    gap_id: "missing_info:1",
    gap_label: "Compensation range",
  },
  {
    id: "q02",
    question: "Who does the role report to?",
    why_it_matters: "Shapes seniority.",
    gap_id: "missing_info:2",
    gap_label: "Reporting line",
  },
];

describe("parseAnswersBody", () => {
  it("refuses non-objects and malformed interview ids", () => {
    expect(parseAnswersBody(null).ok).toBe(false);
    expect(parseAnswersBody("x").ok).toBe(false);
    expect(
      parseAnswersBody({ interview_id: "not-a-uuid", answers: {} }).ok
    ).toBe(false);
  });

  it("keeps only app-shaped question ids with non-empty string answers", () => {
    const parsed = parseAnswersBody({
      interview_id: INTERVIEW_ID,
      answers: {
        q01: "  £180–210k  ",
        q02: "",
        q999: "also fine",
        "'; DROP TABLE": "nope",
        q0: "too short",
        q03: 42,
      },
      hm_label: "Jane",
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.answers).toEqual({
      q01: "£180–210k",
      q999: "also fine",
    });
    expect(parsed.value.hm_label).toBe("Jane");
  });

  it("refuses a non-object answers field", () => {
    expect(
      parseAnswersBody({ interview_id: INTERVIEW_ID, answers: ["a"] }).ok
    ).toBe(false);
  });
});

describe("composeClientInterviewContent", () => {
  it("composes answered questions only, in the set's order", () => {
    const content = composeClientInterviewContent(
      QUESTIONS,
      { q02: "The CFO.", q01: "£180–210k" },
      "Jane Smith @ Acme",
      3
    );
    expect(content).toBe(
      [
        "CLIENT INTERVIEW — answers to question set v3",
        "From: Jane Smith @ Acme",
        "",
        "Q: What is the compensation range?",
        "A: £180–210k",
        "",
        "Q: Who does the role report to?",
        "A: The CFO.",
      ].join("\n")
    );
  });

  it("omits the From line when the label is empty", () => {
    const content = composeClientInterviewContent(
      QUESTIONS,
      { q01: "Yes" },
      "",
      1
    );
    expect(content.startsWith("CLIENT INTERVIEW — answers to question set v1\n\nQ:")).toBe(
      true
    );
  });

  it("ignores answers for unknown question ids", () => {
    const content = composeClientInterviewContent(
      QUESTIONS,
      { q77: "Orphan" },
      "",
      1
    );
    expect(content).not.toContain("Orphan");
  });
});
