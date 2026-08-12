import { describe, expect, test } from "vitest";
import type { OperationalWeight } from "./assessment-scoring";
import {
  HIGH_WEIGHT_FRACTION,
  computeRiskSignals,
  computeSeveritySummary,
  type RiskAssessmentSections,
  type RiskProfileSections,
  type RiskSignal,
} from "./risk-signals";
import type { CompetencyAssessment, EvidenceRating } from "./types";

const WEIGHTS: OperationalWeight[] = [
  { competency_key: "engineering_excellence", label: "Engineering Excellence", weight: 90 },
  { competency_key: "technology_strategy", label: "Technology Strategy", weight: 80 },
  { competency_key: "board_engagement", label: "Board Engagement", weight: 40 },
];

const EMPTY_PROFILE: RiskProfileSections = {
  non_negotiable_gaps: [],
  potential_derailers: [],
  required_leadership_capabilities: [],
  required_functional_capabilities: [],
  required_operating_experience: [],
};

function profile(overrides: Partial<RiskProfileSections>): RiskProfileSections {
  return { ...EMPTY_PROFILE, ...overrides };
}

function rated(
  key: string,
  rating: EvidenceRating,
  evidence = ""
): CompetencyAssessment {
  return { competency_key: key, rating, evidence, source_stages: [] };
}

function assessment(
  ...entries: CompetencyAssessment[]
): RiskAssessmentSections {
  return { competency_assessments: entries };
}

/** Every competency strongly evidenced — the "nothing should fire" baseline. */
const ALL_STRONG = assessment(
  ...WEIGHTS.map((w) => rated(w.competency_key, "strong", "Detailed evidence."))
);

function only(signals: RiskSignal[]): RiskSignal {
  expect(signals).toHaveLength(1);
  return signals[0];
}

describe("non-negotiable gaps", () => {
  test("weak evidence on the mapped competency is critical", () => {
    for (const rating of ["none", "limited"] as const) {
      const signals = computeRiskSignals(
        profile({ non_negotiable_gaps: ["No demonstrated engineering excellence at scale"] }),
        assessment(rated("engineering_excellence", rating)),
        WEIGHTS
      );
      const signal = signals.find((s) => s.category === "non_negotiable");
      expect(signal).toMatchObject({
        severity: "critical",
        source_competency_key: "engineering_excellence",
        match_basis: "competency",
        observed_rating: rating,
      });
    }
  });

  test("an unmatched non-negotiable is still surfaced, and still critical", () => {
    const signal = only(
      computeRiskSignals(
        profile({ non_negotiable_gaps: ["Has never shipped safety-critical embedded firmware"] }),
        ALL_STRONG,
        WEIGHTS
      )
    );
    expect(signal).toMatchObject({
      category: "non_negotiable",
      severity: "critical",
      match_basis: "unmatched",
      source_competency_key: null,
      observed_rating: null,
    });
    expect(signal.source_text).toContain("safety-critical embedded firmware");
  });

  test("drops to low when the mapped competency is well evidenced", () => {
    const signal = only(
      computeRiskSignals(
        profile({ non_negotiable_gaps: ["Engineering excellence in regulated estates"] }),
        ALL_STRONG,
        WEIGHTS
      )
    );
    expect(signal).toMatchObject({ severity: "low", source_competency_key: "engineering_excellence" });
  });

  test("a competency with no recorded rating counts as no evidence", () => {
    const signal = only(
      computeRiskSignals(
        profile({ non_negotiable_gaps: ["Board engagement at plc level"] }),
        assessment(),
        [WEIGHTS[2]]
      )
    );
    expect(signal).toMatchObject({
      severity: "critical",
      source_competency_key: "board_engagement",
      observed_rating: null,
    });
  });
});

describe("derailers", () => {
  test("weak evidence on the mapped competency is elevated", () => {
    const signal = only(
      computeRiskSignals(
        profile({ potential_derailers: ["Leaders who defer technology strategy to vendors stall here"] }),
        assessment(rated("technology_strategy", "limited")),
        [WEIGHTS[1]]
      )
    );
    expect(signal).toMatchObject({
      category: "derailer",
      severity: "elevated",
      source_competency_key: "technology_strategy",
    });
  });

  test("weak evidence text corroborates a derailer that maps to no competency name", () => {
    const signal = only(
      computeRiskSignals(
        profile({
          potential_derailers: [
            "Executives accustomed to outsourced delivery partners stall at this stage",
          ],
        }),
        assessment(
          rated(
            "engineering_excellence",
            "limited",
            "Described outsourced delivery to partners; could not describe in-house practice."
          )
        ),
        [WEIGHTS[0]]
      )
    );
    expect(signal).toMatchObject({
      category: "derailer",
      severity: "elevated",
      match_basis: "evidence_text",
      source_competency_key: "engineering_excellence",
    });
  });

  test("strongly evidenced text is never used to corroborate a derailer", () => {
    const signal = only(
      computeRiskSignals(
        profile({
          potential_derailers: [
            "Executives accustomed to outsourced delivery partners stall at this stage",
          ],
        }),
        assessment(
          rated(
            "engineering_excellence",
            "strong",
            "Described outsourced delivery to partners, then rebuilt in-house."
          )
        ),
        [WEIGHTS[0]]
      )
    );
    expect(signal).toMatchObject({ match_basis: "unmatched", severity: "elevated" });
  });

  test("drops to low when the mapped competency is well evidenced", () => {
    const signal = only(
      computeRiskSignals(
        profile({ potential_derailers: ["Weak technology strategy under regulatory load"] }),
        ALL_STRONG,
        WEIGHTS
      )
    );
    expect(signal).toMatchObject({ category: "derailer", severity: "low" });
  });
});

describe("capability gaps", () => {
  const capability = "Has owned technology strategy through a regulatory examination";

  test.each([
    ["none", "elevated"],
    ["limited", "watch"],
    ["moderate", "watch"],
    ["strong", "low"],
  ] as const)("%s evidence ⇒ %s", (rating, severity) => {
    const signal = only(
      computeRiskSignals(
        profile({ required_functional_capabilities: [capability] }),
        assessment(rated("technology_strategy", rating)),
        [WEIGHTS[1]]
      )
    );
    expect(signal).toMatchObject({ category: "capability_gap", severity });
  });

  test("reads leadership, functional, and operating sections alike", () => {
    const signals = computeRiskSignals(
      profile({
        required_leadership_capabilities: ["Leadership requirement"],
        required_functional_capabilities: ["Functional requirement"],
        required_operating_experience: ["Operating requirement"],
      }),
      ALL_STRONG,
      WEIGHTS
    );
    expect(signals).toHaveLength(3);
    expect(signals.every((s) => s.category === "capability_gap")).toBe(true);
  });

  test("an unmatched capability is surfaced at the no-evidence severity", () => {
    const signal = only(
      computeRiskSignals(
        profile({ required_operating_experience: ["Has operated a franchised dealer network"] }),
        ALL_STRONG,
        WEIGHTS
      )
    );
    expect(signal).toMatchObject({
      category: "capability_gap",
      severity: "elevated",
      match_basis: "unmatched",
    });
  });
});

describe("uncovered high-weight competencies", () => {
  test("a high-weight competency with no evidence is a watch signal", () => {
    const signal = only(computeRiskSignals(EMPTY_PROFILE, assessment(), [WEIGHTS[0]]));
    expect(signal).toMatchObject({
      category: "uncovered_competency",
      severity: "watch",
      source_competency_key: "engineering_excellence",
      source_text: "Engineering Excellence",
    });
  });

  test("a low-weight competency with no evidence does not fire", () => {
    const signals = computeRiskSignals(
      EMPTY_PROFILE,
      assessment(rated("engineering_excellence", "strong"), rated("technology_strategy", "strong")),
      WEIGHTS
    );
    // board_engagement (40) sits below 75% of the 90 top weight.
    expect(WEIGHTS[2].weight).toBeLessThan(WEIGHTS[0].weight * HIGH_WEIGHT_FRACTION);
    expect(signals).toHaveLength(0);
  });

  test("any recorded evidence, even limited, clears the uncovered signal", () => {
    const signals = computeRiskSignals(
      EMPTY_PROFILE,
      assessment(rated("engineering_excellence", "limited"), rated("technology_strategy", "limited")),
      WEIGHTS
    );
    expect(signals).toHaveLength(0);
  });

  test("does not repeat a competency that another signal already names", () => {
    const signals = computeRiskSignals(
      profile({ non_negotiable_gaps: ["No evidence of engineering excellence"] }),
      assessment(rated("technology_strategy", "strong")),
      [WEIGHTS[0], WEIGHTS[1]]
    );
    expect(signals).toHaveLength(1);
    expect(signals[0].category).toBe("non_negotiable");
  });

  test("ignores non-positive weights", () => {
    const signals = computeRiskSignals(EMPTY_PROFILE, assessment(), [
      { competency_key: "a", label: "Alpha", weight: 0 },
      { competency_key: "b", label: "Beta", weight: -10 },
    ]);
    expect(signals).toHaveLength(0);
  });
});

describe("signal set", () => {
  test("orders most severe first and numbers ids in that order", () => {
    const signals = computeRiskSignals(
      profile({
        required_functional_capabilities: ["Has run a board engagement cadence"],
        non_negotiable_gaps: ["No engineering excellence at regulated scale"],
        potential_derailers: ["Leaders who delegate technology strategy entirely"],
      }),
      assessment(
        rated("engineering_excellence", "none"),
        rated("technology_strategy", "limited"),
        rated("board_engagement", "limited")
      ),
      WEIGHTS
    );
    expect(signals.map((s) => s.severity)).toEqual(["critical", "elevated", "watch"]);
    expect(signals.map((s) => s.id)).toEqual(["sig-1", "sig-2", "sig-3"]);
  });

  test("de-duplicates a requirement repeated within a section", () => {
    const signals = computeRiskSignals(
      profile({ non_negotiable_gaps: ["Missing scale", "  missing scale  ", "Missing scale"] }),
      ALL_STRONG,
      WEIGHTS
    );
    expect(signals).toHaveLength(1);
  });

  test("skips blank requirement lines", () => {
    const signals = computeRiskSignals(
      profile({ potential_derailers: ["", "   "] }),
      ALL_STRONG,
      WEIGHTS
    );
    expect(signals).toHaveLength(0);
  });

  test("carries the recorded evidence text for grounding", () => {
    const signal = only(
      computeRiskSignals(
        profile({ non_negotiable_gaps: ["Engineering excellence shortfall"] }),
        assessment(rated("engineering_excellence", "limited", "Could not describe a rollback.")),
        [WEIGHTS[0]]
      )
    );
    expect(signal.observed_evidence).toBe("Could not describe a rollback.");
    expect(signal.rationale).toContain("Limited evidence");
  });

  test("returns nothing when there is nothing to assess", () => {
    expect(computeRiskSignals(EMPTY_PROFILE, assessment(), [])).toEqual([]);
  });

  test("ignores ratings recorded against competencies the search does not weight", () => {
    const signal = only(
      computeRiskSignals(
        profile({ non_negotiable_gaps: ["Engineering excellence shortfall"] }),
        assessment(rated("hallucinated_key", "strong", "n/a")),
        [WEIGHTS[0]]
      )
    );
    expect(signal.severity).toBe("critical");
  });
});

describe("computeSeveritySummary", () => {
  test("counts every band, including the empty ones", () => {
    expect(computeSeveritySummary([])).toEqual({
      critical: 0,
      elevated: 0,
      watch: 0,
      low: 0,
    });
  });

  test("counts signals by band", () => {
    const signals = computeRiskSignals(
      profile({
        non_negotiable_gaps: ["No engineering excellence at scale"],
        potential_derailers: ["Leaders who delegate technology strategy entirely"],
        required_functional_capabilities: ["Has run a board engagement cadence"],
        required_leadership_capabilities: ["Unmappable leadership requirement"],
      }),
      assessment(
        rated("engineering_excellence", "none"),
        rated("technology_strategy", "limited"),
        rated("board_engagement", "limited")
      ),
      WEIGHTS
    );
    expect(computeSeveritySummary(signals)).toEqual({
      critical: 1,
      elevated: 2,
      watch: 1,
      low: 0,
    });
  });
});
