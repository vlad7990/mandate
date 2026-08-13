import { describe, expect, test } from "vitest";
import {
  COVERAGE_ANALYSIS_SCHEMA,
  COVERAGE_ANALYSIS_SYSTEM_PROMPT,
  MAX_FINDINGS,
  normalizeCoverageAnalysis,
} from "./coverage-analysis-agent";

const GOOD_FINDING = {
  dimension: "companies",
  finding: "All eight employers are bulge-bracket banks.",
  suggested_change: "Add asset managers and market infrastructure operators.",
};

describe("the schema is the first line of the dimension guarantee", () => {
  test("dimension is a closed enum containing only structural facets", () => {
    const dimension =
      COVERAGE_ANALYSIS_SCHEMA.properties.coverage_findings.items.properties
        .dimension;
    expect([...dimension.enum]).toEqual([
      "titles",
      "companies",
      "industries",
      "geography",
      "seniority",
      "exclusions",
    ]);
  });

  test("the schema offers no field a demographic reading could occupy", () => {
    // Word-boundary matching, not substring: "coverage_findings" legitimately
    // contains "age", and a naive scan flags the schema for its own field name.
    const serialised = JSON.stringify(COVERAGE_ANALYSIS_SCHEMA).toLowerCase();
    for (const banned of [
      /\bgender\b/,
      /\bethnic/,
      /\brace\b/,
      /\bdiversity\b/,
      /\bdemographic/,
      /\bage\b/,
      /\bdisabilit/,
      /\breligion\b/,
    ]) {
      expect(serialised).not.toMatch(banned);
    }
  });

  test("findings are capped, so the output stays actionable", () => {
    expect(
      COVERAGE_ANALYSIS_SCHEMA.properties.coverage_findings.maxItems
    ).toBe(MAX_FINDINGS);
  });

  test("suggested_next_version is nullable — a wide search should say so", () => {
    expect([
      ...COVERAGE_ANALYSIS_SCHEMA.properties.suggested_next_version.type,
    ]).toContain("null");
  });
});

describe("the prompt states the boundary explicitly", () => {
  test("names the legal basis rather than just forbidding the behaviour", () => {
    // A model told "don't" without "why" generalises the rule badly. The
    // prompt cites Art. 9 and Title VII so the boundary survives paraphrase.
    expect(COVERAGE_ANALYSIS_SYSTEM_PROMPT).toContain("Art. 9");
    expect(COVERAGE_ANALYSIS_SYSTEM_PROMPT).toContain("Title VII");
  });

  test("closes the proxy loophole, not just the direct one", () => {
    // Forbidding "ethnicity" while permitting "schools as a proxy" would be a
    // guardrail in name only.
    expect(COVERAGE_ANALYSIS_SYSTEM_PROMPT).toContain("proxy");
  });
});

describe("normalizeCoverageAnalysis is the last line", () => {
  test("keeps well-formed findings", () => {
    const result = normalizeCoverageAnalysis({
      coverage_findings: [GOOD_FINDING],
      suggested_next_version: {
        label: "Adjacent institutions",
        changes: ["Add buy-side and exchange operators"],
      },
    });
    expect(result.coverage_findings).toHaveLength(1);
    expect(result.coverage_findings[0].dimension).toBe("companies");
    expect(result.suggested_next_version?.label).toBe("Adjacent institutions");
  });

  test("DROPS a finding on a dimension outside the enum", () => {
    // The scenario this exists for: a model, a drifted schema, or a
    // hand-edited database row producing a demographic reading. It is dropped
    // rather than rendered, and the surrounding valid findings survive.
    const result = normalizeCoverageAnalysis({
      coverage_findings: [
        GOOD_FINDING,
        {
          dimension: "gender",
          finding: "The pool skews male.",
          suggested_change: "Broaden outreach.",
        },
        {
          dimension: "ethnicity",
          finding: "Limited ethnic diversity.",
          suggested_change: "Add diverse sources.",
        },
      ],
      suggested_next_version: null,
    });

    expect(result.coverage_findings).toHaveLength(1);
    expect(result.coverage_findings[0].dimension).toBe("companies");
    expect(JSON.stringify(result)).not.toMatch(/skews male|ethnic/i);
  });

  test("drops a finding with no text, however valid its dimension", () => {
    const result = normalizeCoverageAnalysis({
      coverage_findings: [
        { dimension: "titles", finding: "   ", suggested_change: "x" },
      ],
    });
    expect(result.coverage_findings).toEqual([]);
  });

  test("dedupes repeated findings", () => {
    const result = normalizeCoverageAnalysis({
      coverage_findings: [GOOD_FINDING, { ...GOOD_FINDING }],
    });
    expect(result.coverage_findings).toHaveLength(1);
  });

  test("enforces the cap even when the model ignores it", () => {
    const result = normalizeCoverageAnalysis({
      coverage_findings: Array.from({ length: 20 }, (_, i) => ({
        ...GOOD_FINDING,
        finding: `Finding number ${i}.`,
      })),
    });
    expect(result.coverage_findings).toHaveLength(MAX_FINDINGS);
  });

  test("rejects a suggestion with a label but no changes", () => {
    // "Try something else" with no edits is not a suggestion; rendering it
    // would put a button in front of a recruiter that does nothing.
    const result = normalizeCoverageAnalysis({
      coverage_findings: [GOOD_FINDING],
      suggested_next_version: { label: "Wider", changes: [] },
    });
    expect(result.suggested_next_version).toBeNull();
  });

  test("rejects a suggestion with changes but no label", () => {
    const result = normalizeCoverageAnalysis({
      suggested_next_version: { label: "  ", changes: ["Add buy-side"] },
    });
    expect(result.suggested_next_version).toBeNull();
  });

  test("survives junk from the database boundary", () => {
    expect(normalizeCoverageAnalysis(null).coverage_findings).toEqual([]);
    expect(normalizeCoverageAnalysis("nope").coverage_findings).toEqual([]);
    expect(normalizeCoverageAnalysis({}).suggested_next_version).toBeNull();
    expect(
      normalizeCoverageAnalysis({ coverage_findings: "not an array" })
        .coverage_findings
    ).toEqual([]);
    expect(
      normalizeCoverageAnalysis({ coverage_findings: [null, 7, "x"] })
        .coverage_findings
    ).toEqual([]);
  });

  test("round-trips provenance stamped by the runner", () => {
    const result = normalizeCoverageAnalysis({
      coverage_findings: [GOOD_FINDING],
      prompt_version: "sourcing-coverage-v1",
      model_version: "claude-sonnet-4-6",
      analysed_at: "2026-08-13T00:00:00.000Z",
    });
    expect(result.prompt_version).toBe("sourcing-coverage-v1");
    expect(result.model_version).toBe("claude-sonnet-4-6");
    expect(result.analysed_at).toBe("2026-08-13T00:00:00.000Z");
  });
});
