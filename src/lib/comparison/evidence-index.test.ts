import { describe, expect, test } from "vitest";
import type { DimensionKey, DimensionWeights } from "@/lib/ai/onboarding-analysis";
import {
  blindSpots,
  buildCandidateEvidence,
  buildComparisonGrid,
  coverageState,
  HIGH_WEIGHT_THRESHOLD,
  strongestBasis,
  type EvidenceBasis,
  type EvidenceItem,
  type EvidencePolarity,
} from "./evidence-index";

function item(
  dimension: DimensionKey,
  basis: EvidenceBasis,
  polarity: EvidencePolarity = "supports"
): EvidenceItem {
  return {
    dimension,
    basis,
    polarity,
    source_label: basis,
    summary: `${basis} evidence for ${dimension}`,
  };
}

const WEIGHTS: DimensionWeights = {
  technical: 9,
  domain: 8,
  leadership: 5,
  regulatory: 10,
  transformation: 2,
};

describe("coverage states", () => {
  test("no evidence is a gap, never a zero", () => {
    // The distinction the whole module exists for: "we did not look" and
    // "we looked and found nothing" are different claims, and a scores table
    // renders both as a low number.
    expect(coverageState([])).toBe("absent");
  });

  test("only the candidate's own account is thin, not evidenced", () => {
    expect(coverageState([item("technical", "self_reported")])).toBe("thin");
    expect(
      coverageState([
        item("technical", "self_reported"),
        item("technical", "self_reported"),
      ])
    ).toBe("thin");
  });

  test("corroboration by anything other than the candidate is evidenced", () => {
    for (const basis of ["measured", "recruiter", "ai_inferred"] as const) {
      expect(coverageState([item("technical", basis)])).toBe("evidenced");
    }
  });

  test("disagreement outranks everything", () => {
    // The most interesting cell on the grid. Folding it into "evidenced" would
    // hide the one row a recruiter most needs to open.
    const state = coverageState([
      item("domain", "recruiter", "supports"),
      item("domain", "ai_inferred", "contradicts"),
    ]);
    expect(state).toBe("conflicted");
  });

  test("a volume of weak claims does not become strong evidence", () => {
    // Five CV claims are still one person's account of themselves.
    const items = Array.from({ length: 5 }, () =>
      item("leadership", "self_reported")
    );
    expect(coverageState(items)).toBe("thin");
  });
});

describe("strongestBasis", () => {
  test("picks by provenance rank, not by order or count", () => {
    expect(
      strongestBasis([
        item("technical", "self_reported"),
        item("technical", "measured"),
        item("technical", "ai_inferred"),
      ])
    ).toBe("measured");

    expect(
      strongestBasis([
        item("technical", "ai_inferred"),
        item("technical", "recruiter"),
      ])
    ).toBe("recruiter");
  });

  test("is null with nothing to rank", () => {
    expect(strongestBasis([])).toBeNull();
  });
});

describe("buildCandidateEvidence", () => {
  test("returns every dimension, including the empty ones", () => {
    // A grid that omits rows with no evidence silently drops the gaps.
    const evidence = buildCandidateEvidence(
      { candidate_id: "c1", full_name: "Dana Reed", items: [item("technical", "measured")] },
      WEIGHTS
    );
    expect(Object.keys(evidence.dimensions).sort()).toEqual([
      "domain",
      "leadership",
      "regulatory",
      "technical",
      "transformation",
    ]);
    expect(evidence.dimensions.domain.state).toBe("absent");
  });

  test("escalates a silence only where the role actually weights it", () => {
    const evidence = buildCandidateEvidence(
      { candidate_id: "c1", full_name: "Dana Reed", items: [] },
      WEIGHTS
    );
    // regulatory 10, technical 9, domain 8 are all >= threshold and empty.
    expect(evidence.critical_gaps.sort()).toEqual([
      "domain",
      "regulatory",
      "technical",
    ]);
    // leadership 5 and transformation 2 are not what this role turns on.
    expect(evidence.critical_gaps).not.toContain("leadership");
    expect(evidence.critical_gaps).not.toContain("transformation");
  });

  test("a thin dimension is still a critical gap when the role turns on it", () => {
    const evidence = buildCandidateEvidence(
      {
        candidate_id: "c1",
        full_name: "Dana Reed",
        items: [item("regulatory", "self_reported")],
      },
      WEIGHTS
    );
    expect(evidence.dimensions.regulatory.state).toBe("thin");
    expect(evidence.critical_gaps).toContain("regulatory");
  });

  test("evidenced dimensions are not gaps", () => {
    const evidence = buildCandidateEvidence(
      {
        candidate_id: "c1",
        full_name: "Dana Reed",
        items: [item("regulatory", "recruiter")],
      },
      WEIGHTS
    );
    expect(evidence.critical_gaps).not.toContain("regulatory");
  });

  test("an uncalibrated role escalates nothing rather than everything", () => {
    // Without weights there is no basis for calling a silence critical, and
    // flagging all five would make the field meaningless on new searches.
    const evidence = buildCandidateEvidence(
      { candidate_id: "c1", full_name: "Dana Reed", items: [] },
      null
    );
    expect(evidence.critical_gaps).toEqual([]);
    expect(evidence.dimensions.technical.weight).toBeNull();
  });

  test("uses the documented threshold", () => {
    expect(HIGH_WEIGHT_THRESHOLD).toBe(7);
  });
});

describe("buildComparisonGrid", () => {
  const strong = buildCandidateEvidence(
    {
      candidate_id: "strong",
      full_name: "Evidenced Person",
      items: [item("regulatory", "recruiter"), item("technical", "measured")],
    },
    WEIGHTS
  );
  const unknown = buildCandidateEvidence(
    { candidate_id: "unknown", full_name: "Unknown Person", items: [] },
    WEIGHTS
  );

  test("orders rows by what the role weights, not alphabetically", () => {
    const grid = buildComparisonGrid([strong, unknown], WEIGHTS);
    expect(grid.rows.map((r) => r.dimension)).toEqual([
      "regulatory", // 10
      "technical", // 9
      "domain", // 8
      "leadership", // 5
      "transformation", // 2
    ]);
  });

  test("flags the rows where candidates actually differ", () => {
    const grid = buildComparisonGrid([strong, unknown], WEIGHTS);
    const regulatory = grid.rows.find((r) => r.dimension === "regulatory")!;
    expect(regulatory.differentiating).toBe(true);
    expect(regulatory.blind_spot).toBe(false);
  });

  test("a dimension nobody has evidence on is a blind spot, not a tie", () => {
    // This is a finding about the SEARCH, not about the people — and it is
    // invisible in a scores table, where everyone looks equally unproven.
    const grid = buildComparisonGrid([strong, unknown], WEIGHTS);
    const domain = grid.rows.find((r) => r.dimension === "domain")!;
    expect(domain.blind_spot).toBe(true);
    expect(domain.differentiating).toBe(false);
    expect(blindSpots(grid)).toContain("domain");
    expect(blindSpots(grid)).not.toContain("regulatory");
  });

  test("everyone evidenced is neither differentiating nor a blind spot", () => {
    const other = buildCandidateEvidence(
      {
        candidate_id: "other",
        full_name: "Also Evidenced",
        items: [item("regulatory", "measured")],
      },
      WEIGHTS
    );
    const grid = buildComparisonGrid([strong, other], WEIGHTS);
    const regulatory = grid.rows.find((r) => r.dimension === "regulatory")!;
    expect(regulatory.differentiating).toBe(false);
    expect(regulatory.blind_spot).toBe(false);
  });

  test("a conflicted cell counts as known, because we did look", () => {
    const conflicted = buildCandidateEvidence(
      {
        candidate_id: "conflicted",
        full_name: "Disputed Person",
        items: [
          item("regulatory", "recruiter", "supports"),
          item("regulatory", "ai_inferred", "contradicts"),
        ],
      },
      WEIGHTS
    );
    const grid = buildComparisonGrid([conflicted], WEIGHTS);
    const regulatory = grid.rows.find((r) => r.dimension === "regulatory")!;
    expect(regulatory.blind_spot).toBe(false);
  });

  test("produces no composite score for anyone", () => {
    // A settled product decision, and the honest shape: dimensions are
    // weighted differently per role, and collapsing them hides the trade-off
    // the recruiter is being paid to make.
    const grid = buildComparisonGrid([strong, unknown], WEIGHTS);
    const serialised = JSON.stringify(grid);
    expect(serialised).not.toMatch(/"overall_score"|"total_score"|"match_pct"/);
  });

  test("handles a single candidate and an empty set", () => {
    expect(buildComparisonGrid([], WEIGHTS).rows).toHaveLength(5);
    expect(buildComparisonGrid([], WEIGHTS).rows[0].blind_spot).toBe(false);
    expect(buildComparisonGrid([strong], WEIGHTS).candidates).toHaveLength(1);
  });
});
