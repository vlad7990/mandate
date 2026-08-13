import { describe, expect, test } from "vitest";
import {
  EMPTY_RISK_REVIEW,
  EMPTY_SEVERITY_SUMMARY,
  applyRiskComputation,
  normalizeRiskReview,
  normalizeRiskSignals,
} from "./executive-risk-synthesis-agent";
import type { RiskSignal } from "@/lib/executive/risk-signals";

function signal(overrides: Partial<RiskSignal> & { id: string }): RiskSignal {
  return {
    category: "non_negotiable",
    severity: "critical",
    source_text: "No evidence of regulated-estate ownership",
    source_competency_key: "regulatory_compliance",
    source_competency_label: "Regulatory Navigation",
    match_basis: "competency",
    observed_rating: "limited",
    observed_evidence: "Referred to a compliance team; no examination described.",
    competency_weight: 80,
    rationale: 'Mapped to Regulatory Navigation (weight 80), where the assessment recorded "Limited evidence".',
    ...overrides,
  };
}

const SIGNALS: RiskSignal[] = [
  signal({ id: "sig-1" }),
  signal({
    id: "sig-2",
    category: "derailer",
    severity: "elevated",
    source_text: "Leaders who delegate technology strategy entirely stall here",
    source_competency_key: "technology_strategy",
    source_competency_label: "Technology Strategy",
  }),
  signal({
    id: "sig-3",
    category: "uncovered_competency",
    severity: "watch",
    source_text: "Board Engagement",
    source_competency_key: "board_engagement",
    source_competency_label: "Board Engagement",
    observed_rating: null,
    observed_evidence: "",
  }),
];

function item(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    title: `Worded title for ${id}`,
    evidence_basis: `Worded evidence for ${id}`,
    suggested_diligence: `Worded diligence for ${id}`,
    ...extra,
  };
}

describe("normalizeRiskReview", () => {
  test("returns an empty review, keyed to no signals, for null input", () => {
    expect(normalizeRiskReview(null, [])).toEqual(EMPTY_RISK_REVIEW);
    expect(normalizeRiskReview("nope", [])).toEqual(EMPTY_RISK_REVIEW);
    expect(normalizeRiskReview(undefined, [])).toEqual(EMPTY_RISK_REVIEW);
  });

  test("keeps the model's wording for a recognised signal", () => {
    const result = normalizeRiskReview(
      { overview: "Two areas need further diligence.", risk_items: [item("sig-1")] },
      [SIGNALS[0]]
    );
    expect(result.overview).toBe("Two areas need further diligence.");
    expect(result.risk_items).toEqual([
      {
        id: "sig-1",
        title: "Worded title for sig-1",
        category: "non_negotiable",
        severity: "critical",
        source_competency_key: "regulatory_compliance",
        evidence_basis: "Worded evidence for sig-1",
        suggested_diligence: "Worded diligence for sig-1",
      },
    ]);
  });

  test("drops a risk item whose id is not an app-computed signal", () => {
    const result = normalizeRiskReview(
      { risk_items: [item("sig-1"), item("sig-99"), item("")] },
      [SIGNALS[0]]
    );
    expect(result.risk_items.map((i) => i.id)).toEqual(["sig-1"]);
  });

  test("overwrites severity and category with the app's values", () => {
    const result = normalizeRiskReview(
      {
        risk_items: [
          item("sig-2", {
            severity: "low",
            category: "capability_gap",
            source_competency_key: "invented_key",
          }),
        ],
      },
      [SIGNALS[1]]
    );
    expect(result.risk_items[0]).toMatchObject({
      severity: "elevated",
      category: "derailer",
      source_competency_key: "technology_strategy",
      title: "Worded title for sig-2",
    });
  });

  test("back-fills an item for every signal the model left out", () => {
    const result = normalizeRiskReview({ risk_items: [item("sig-2")] }, SIGNALS);
    expect(result.risk_items.map((i) => i.id)).toEqual(["sig-1", "sig-2", "sig-3"]);

    const filled = result.risk_items[0];
    expect(filled.title).toBe(SIGNALS[0].source_text);
    expect(filled.severity).toBe("critical");
    expect(filled.evidence_basis).toContain(SIGNALS[0].rationale);
    expect(filled.evidence_basis).toContain(SIGNALS[0].observed_evidence);
    // Only a human or the agent can propose diligence honestly.
    expect(filled.suggested_diligence).toBe("");
  });

  test("back-fills from the rationale alone when no evidence was recorded", () => {
    const result = normalizeRiskReview({}, [SIGNALS[2]]);
    expect(result.risk_items[0].evidence_basis).toBe(SIGNALS[2].rationale);
  });

  test("returns items in signal order, not the order the model emitted them", () => {
    const result = normalizeRiskReview(
      { risk_items: [item("sig-3"), item("sig-1"), item("sig-2")] },
      SIGNALS
    );
    expect(result.risk_items.map((i) => i.id)).toEqual(["sig-1", "sig-2", "sig-3"]);
  });

  test("collapses duplicate ids to the first occurrence", () => {
    const result = normalizeRiskReview(
      {
        risk_items: [
          item("sig-1", { title: "First wording" }),
          item("sig-1", { title: "Second wording" }),
        ],
      },
      [SIGNALS[0]]
    );
    expect(result.risk_items).toHaveLength(1);
    expect(result.risk_items[0].title).toBe("First wording");
  });

  test("falls back to app wording for blank or non-string fields", () => {
    const result = normalizeRiskReview(
      { overview: 42, risk_items: [{ id: "sig-1", title: "", evidence_basis: null, suggested_diligence: 7 }] },
      [SIGNALS[0]]
    );
    expect(result.overview).toBe("");
    expect(result.risk_items[0].title).toBe(SIGNALS[0].source_text);
    expect(result.risk_items[0].evidence_basis).toContain(SIGNALS[0].rationale);
    expect(result.risk_items[0].suggested_diligence).toBe("");
  });

  test("survives malformed risk_items without throwing", () => {
    const result = normalizeRiskReview(
      { risk_items: ["garbage", null, 5, {}] },
      [SIGNALS[0]]
    );
    expect(result.risk_items.map((i) => i.id)).toEqual(["sig-1"]);
    expect(result.risk_items[0].title).toBe(SIGNALS[0].source_text);
  });

  test("does not treat a stored severity_summary as authoritative", () => {
    const result = normalizeRiskReview(
      { severity_summary: { critical: 99, elevated: -3, watch: "many", low: 1.6 } },
      []
    );
    // Coerced to safe counts here; applyRiskComputation replaces them outright.
    expect(result.severity_summary).toEqual({
      critical: 99,
      elevated: 0,
      watch: 0,
      low: 2,
    });
  });
});

describe("normalizeRiskSignals", () => {
  test("round-trips computed signals unchanged", () => {
    expect(normalizeRiskSignals(SIGNALS)).toEqual(SIGNALS);
  });

  test("returns nothing for non-array input", () => {
    expect(normalizeRiskSignals(null)).toEqual([]);
    expect(normalizeRiskSignals({ id: "sig-1" })).toEqual([]);
  });

  test("drops entries with no id, and duplicate ids", () => {
    expect(
      normalizeRiskSignals([
        { id: "sig-1" },
        { id: "sig-1" },
        { id: "" },
        null,
        "garbage",
      ])
    ).toHaveLength(1);
  });

  test("clamps unknown enum values to safe defaults", () => {
    const [s] = normalizeRiskSignals([
      {
        id: "sig-1",
        category: "made_up",
        severity: "catastrophic",
        match_basis: "vibes",
        observed_rating: "excellent",
        competency_weight: "heavy",
      },
    ]);
    expect(s).toMatchObject({
      category: "capability_gap",
      severity: "watch",
      match_basis: "unmatched",
      observed_rating: null,
      competency_weight: null,
    });
  });
});

describe("applyRiskComputation", () => {
  test("re-stamps the signals and their counts, discarding what was stored", () => {
    const stored = {
      ...EMPTY_RISK_REVIEW,
      overview: "Kept.",
      risk_signals: [signal({ id: "sig-stale" })],
      severity_summary: { critical: 9, elevated: 9, watch: 9, low: 9 },
    };
    const result = applyRiskComputation(stored, SIGNALS);
    expect(result.overview).toBe("Kept.");
    expect(result.risk_signals).toEqual(SIGNALS);
    expect(result.severity_summary).toEqual({
      critical: 1,
      elevated: 1,
      watch: 1,
      low: 0,
    });
  });

  test("zeroes the summary when there are no signals", () => {
    const result = applyRiskComputation({ ...EMPTY_RISK_REVIEW }, []);
    expect(result.severity_summary).toEqual(EMPTY_SEVERITY_SUMMARY);
    expect(result.risk_signals).toEqual([]);
  });

  test("copies the signals rather than aliasing the caller's array", () => {
    const signals = [...SIGNALS];
    const result = applyRiskComputation({ ...EMPTY_RISK_REVIEW }, signals);
    signals.pop();
    expect(result.risk_signals).toHaveLength(3);
  });
});
