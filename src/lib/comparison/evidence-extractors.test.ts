import { describe, expect, test } from "vitest";
import { buildCandidateEvidence } from "./evidence-index";
import {
  CANDIDATE_LEVEL_ASSETS,
  extractEvidence,
  fromCandidateScores,
  fromCvProfile,
  fromFitDimensions,
  polarityForScore,
} from "./evidence-extractors";

describe("score polarity", () => {
  test("a high score supports, a low score contradicts", () => {
    expect(polarityForScore(9)).toBe("supports");
    expect(polarityForScore(7)).toBe("supports");
    expect(polarityForScore(1)).toBe("contradicts");
    expect(polarityForScore(3)).toBe("contradicts");
  });

  test("the middle band argues for nothing", () => {
    // A 5 says the assessment happened and landed in the middle. That is
    // information, but it is not an argument either way.
    expect(polarityForScore(5)).toBe("neutral");
    expect(polarityForScore(4)).toBe("neutral");
    expect(polarityForScore(6)).toBe("neutral");
  });
});

describe("fromCandidateScores", () => {
  test("emits measured evidence per scored dimension", () => {
    const items = fromCandidateScores({
      technical_score: 8,
      domain_score: 2,
      leadership_score: null,
      regulatory_score: null,
      transformation_score: null,
    });

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      dimension: "technical",
      basis: "measured",
      polarity: "supports",
    });
    expect(items[1]).toMatchObject({
      dimension: "domain",
      polarity: "contradicts",
    });
  });

  test("a null column is silence, NOT a zero", () => {
    // The engine leaves a dimension null when it had nothing to score.
    // Reading that as 0 would manufacture a contradicting signal out of a gap —
    // the exact confusion the evidence index exists to prevent.
    const items = fromCandidateScores({
      technical_score: null,
      domain_score: null,
      leadership_score: null,
      regulatory_score: null,
      transformation_score: null,
    });
    expect(items).toEqual([]);

    const zeroed = fromCandidateScores({
      technical_score: 0,
      domain_score: null,
      leadership_score: null,
      regulatory_score: null,
      transformation_score: null,
    });
    // An actual 0 IS a claim, and a contradicting one.
    expect(zeroed).toHaveLength(1);
    expect(zeroed[0].polarity).toBe("contradicts");
  });

  test("survives a missing row", () => {
    expect(fromCandidateScores(null)).toEqual([]);
    expect(fromCandidateScores(undefined)).toEqual([]);
  });
});

describe("fromFitDimensions", () => {
  test("is ai_inferred, ranked below the scoring engine", () => {
    // A model's reading of one document, inheriting whatever that document
    // chose to mention. When both exist and disagree, the index surfaces
    // `conflicted` rather than averaging them.
    const items = fromFitDimensions({
      technical: 9,
      domain: 9,
      leadership: 9,
      regulatory: 9,
      transformation: 9,
    });
    expect(items).toHaveLength(5);
    expect(items.every((i) => i.basis === "ai_inferred")).toBe(true);
  });

  test("a measured score and a CV read that disagree become conflicted", () => {
    const evidence = buildCandidateEvidence(
      {
        candidate_id: "c1",
        full_name: "Dana Reed",
        items: [
          ...fromCandidateScores({
            technical_score: 2,
            domain_score: null,
            leadership_score: null,
            regulatory_score: null,
            transformation_score: null,
          }),
          ...fromFitDimensions({
            technical: 9,
            domain: 0,
            leadership: 0,
            regulatory: 0,
            transformation: 0,
          }),
        ],
      },
      null
    );
    expect(evidence.dimensions.technical.state).toBe("conflicted");
  });

  test("survives junk", () => {
    expect(fromFitDimensions(null)).toEqual([]);
    expect(fromFitDimensions(undefined)).toEqual([]);
  });
});

describe("fromCvProfile", () => {
  test("maps parser fields to the one dimension each speaks to", () => {
    const items = fromCvProfile({
      tech_exposure: ["Kubernetes", "Kafka"],
      transformation_experience: ["Post-merger integration"],
      domain: "capital markets",
      scale: "400 FTE, $100MM budget",
    });

    const byDimension = Object.fromEntries(items.map((i) => [i.dimension, i]));
    expect(Object.keys(byDimension).sort()).toEqual([
      "domain",
      "leadership",
      "technical",
      "transformation",
    ]);
    expect(items.every((i) => i.basis === "self_reported")).toBe(true);
  });

  test("never claims regulatory exposure", () => {
    // Nothing the parser extracts is a claim about regulation. Inventing a
    // mapping for completeness would put self-reported evidence under the
    // dimension most likely to matter and least likely to be corroborated.
    const items = fromCvProfile({
      tech_exposure: ["Kubernetes"],
      domain: "banking regulation and compliance",
      scale: "big",
      transformation_experience: ["regulatory remediation programme"],
    });
    expect(items.some((i) => i.dimension === "regulatory")).toBe(false);
  });

  test("emits nothing for empty or missing fields", () => {
    expect(fromCvProfile({})).toEqual([]);
    expect(fromCvProfile(null)).toEqual([]);
    expect(
      fromCvProfile({ tech_exposure: [], domain: "   ", scale: "" })
    ).toEqual([]);
  });
});

describe("what is deliberately NOT extracted", () => {
  test("candidate-level assets are named rather than silently dropped", () => {
    // The recruiter assessment, psychology profile, culture match,
    // triangulation and risk review speak about the person, not about
    // `technical` or `regulatory`. Keyword-matching them into dimensions would
    // manufacture dimension-level evidence at recruiter provenance — the grid
    // would read as best-evidenced exactly where it was guessing.
    expect([...CANDIDATE_LEVEL_ASSETS]).toEqual([
      "recruiter_assessment",
      "psychology_profile",
      "culture_match",
      "triangulation",
      "risk_review",
    ]);
  });
});

describe("extractEvidence", () => {
  test("combines every dimension-keyed asset", () => {
    const items = extractEvidence({
      scores: {
        technical_score: 8,
        domain_score: null,
        leadership_score: null,
        regulatory_score: 6,
        transformation_score: null,
      },
      cv: {
        fit_dimensions: {
          technical: 7,
          domain: 5,
          leadership: 5,
          regulatory: 5,
          transformation: 5,
        },
        tech_exposure: ["Kafka"],
        domain: "capital markets",
      },
    });

    // measured first, so a truncating UI shows the best-founded item.
    expect(items[0].basis).toBe("measured");
    expect(items.some((i) => i.basis === "ai_inferred")).toBe(true);
    expect(items.some((i) => i.basis === "self_reported")).toBe(true);
  });

  test("a candidate with no assets yields an all-gaps index, not an error", () => {
    const evidence = buildCandidateEvidence(
      { candidate_id: "c1", full_name: "Nobody", items: extractEvidence({}) },
      { technical: 9, domain: 9, leadership: 9, regulatory: 9, transformation: 9 }
    );
    expect(evidence.critical_gaps).toHaveLength(5);
    expect(evidence.dimensions.technical.state).toBe("absent");
  });
});
