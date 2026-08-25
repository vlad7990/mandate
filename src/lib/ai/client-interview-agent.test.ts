import { describe, expect, it } from "vitest";
import {
  computeMandateGaps,
  finalizeClientInterview,
  normalizeClientInterview,
  normalizeClientInterviewDraft,
} from "./client-interview-agent";

const FULL_WEIGHTS = {
  technical: 9,
  domain: 7,
  leadership: 5,
  regulatory: 2,
  transformation: 4,
};

const ONBOARDING = { must_haves: ["x"] };

describe("computeMandateGaps", () => {
  it("returns [] when the mandate has no calibration at all", () => {
    expect(computeMandateGaps(null, ONBOARDING)).toEqual([]);
    expect(computeMandateGaps(undefined, ONBOARDING)).toEqual([]);
  });

  it("turns each missing_information item into a gap, verbatim", () => {
    const gaps = computeMandateGaps(
      {
        missing_information: ["Compensation range", "Team size"],
        dimension_weights: FULL_WEIGHTS,
      },
      ONBOARDING
    );
    expect(gaps).toEqual([
      {
        id: "missing_info:1",
        label: "Compensation range",
        kind: "missing_info",
      },
      { id: "missing_info:2", label: "Team size", kind: "missing_info" },
    ]);
  });

  it("skips blank and non-string missing_information entries", () => {
    const gaps = computeMandateGaps(
      {
        missing_information: ["  ", "Real gap", 42] as unknown as string[],
        dimension_weights: FULL_WEIGHTS,
      },
      ONBOARDING
    );
    expect(gaps.map((g) => g.label)).toEqual(["Real gap"]);
  });

  it("flags an absent onboarding questionnaire", () => {
    const gaps = computeMandateGaps(
      { missing_information: [], dimension_weights: FULL_WEIGHTS },
      null
    );
    expect(gaps.map((g) => g.id)).toEqual(["onboarding:absent"]);
    expect(
      computeMandateGaps(
        { missing_information: [], dimension_weights: FULL_WEIGHTS },
        {}
      ).map((g) => g.id)
    ).toEqual(["onboarding:absent"]);
  });

  it("flags missing weights and flat weights as calibration gaps", () => {
    expect(
      computeMandateGaps({ missing_information: [] }, ONBOARDING).map(
        (g) => g.id
      )
    ).toEqual(["calibration:unweighted"]);

    const flat = {
      technical: 5,
      domain: 5,
      leadership: 6,
      regulatory: 5,
      transformation: 5,
    };
    expect(
      computeMandateGaps(
        { missing_information: [], dimension_weights: flat },
        ONBOARDING
      ).map((g) => g.id)
    ).toEqual(["calibration:undifferentiated"]);
  });

  it("returns [] for a fully-established mandate — the honest refusal", () => {
    expect(
      computeMandateGaps(
        { missing_information: [], dimension_weights: FULL_WEIGHTS },
        ONBOARDING
      )
    ).toEqual([]);
  });
});

describe("finalizeClientInterview", () => {
  const GAPS = [
    { id: "missing_info:1", label: "Compensation range", kind: "missing_info" as const },
    { id: "onboarding:absent", label: "Onboarding never completed", kind: "onboarding" as const },
  ];

  it("strips questions citing gaps the mandate does not have", () => {
    const out = finalizeClientInterview(
      {
        intro: "A word first.",
        questions: [
          { question: "What is the range?", why_it_matters: "Anchors offers.", gap_id: "missing_info:1" },
          { question: "Invented one?", why_it_matters: "", gap_id: "missing_info:99" },
        ],
      },
      GAPS
    );
    expect(out.questions).toHaveLength(1);
    expect(out.questions[0]).toMatchObject({
      id: "q01",
      gap_id: "missing_info:1",
      gap_label: "Compensation range",
    });
  });

  it("drops duplicate question text, keeping the first occurrence", () => {
    const out = finalizeClientInterview(
      {
        intro: "",
        questions: [
          { question: "What is the range?", why_it_matters: "", gap_id: "missing_info:1" },
          { question: "  what   is the RANGE? ", why_it_matters: "", gap_id: "onboarding:absent" },
        ],
      },
      GAPS
    );
    expect(out.questions).toHaveLength(1);
  });

  it("computes coverage over ALL gaps, uncovered included", () => {
    const out = finalizeClientInterview(
      {
        intro: "",
        questions: [
          { question: "What is the range?", why_it_matters: "", gap_id: "missing_info:1" },
        ],
      },
      GAPS
    );
    expect(out.gap_coverage).toEqual([
      {
        gap_id: "missing_info:1",
        gap_label: "Compensation range",
        kind: "missing_info",
        question_ids: ["q01"],
      },
      {
        gap_id: "onboarding:absent",
        gap_label: "Onboarding never completed",
        kind: "onboarding",
        question_ids: [],
      },
    ]);
  });

  it("assigns sequential zero-padded ids to survivors only", () => {
    const out = finalizeClientInterview(
      {
        intro: "",
        questions: [
          { question: "Ghost", why_it_matters: "", gap_id: "nope" },
          { question: "First real", why_it_matters: "", gap_id: "missing_info:1" },
          { question: "Second real", why_it_matters: "", gap_id: "onboarding:absent" },
        ],
      },
      GAPS
    );
    expect(out.questions.map((q) => q.id)).toEqual(["q01", "q02"]);
  });
});

describe("normalizeClientInterviewDraft", () => {
  it("coerces garbage to an empty draft", () => {
    expect(normalizeClientInterviewDraft(null)).toEqual({
      intro: "",
      questions: [],
    });
    expect(normalizeClientInterviewDraft("nope")).toEqual({
      intro: "",
      questions: [],
    });
  });

  it("drops entries without question text", () => {
    const out = normalizeClientInterviewDraft({
      intro: " hi ",
      questions: [
        { question: "", why_it_matters: "x", gap_id: "a" },
        { question: "Real?", why_it_matters: "y", gap_id: "b" },
        "garbage",
      ],
    });
    expect(out.intro).toBe("hi");
    expect(out.questions).toEqual([
      { question: "Real?", why_it_matters: "y", gap_id: "b" },
    ]);
  });
});

describe("normalizeClientInterview", () => {
  it("round-trips finalized content", () => {
    const finalized = finalizeClientInterview(
      {
        intro: "Intro.",
        questions: [
          { question: "Q?", why_it_matters: "W.", gap_id: "missing_info:1" },
        ],
      },
      [{ id: "missing_info:1", label: "Gap", kind: "missing_info" }]
    );
    expect(normalizeClientInterview(JSON.parse(JSON.stringify(finalized)))).toEqual(
      finalized
    );
  });

  it("requires ids on stored questions", () => {
    const out = normalizeClientInterview({
      intro: "",
      questions: [{ question: "No id" }],
      gap_coverage: [],
    });
    expect(out.questions).toEqual([]);
  });
});
