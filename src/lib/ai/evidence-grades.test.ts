import { describe, expect, it } from "vitest";
import {
  EVIDENCE_GRADES,
  claimGrade,
  claimText,
  normalizeClaims,
} from "./evidence-grades";
import { CANDIDATE_PROFILE_SCHEMA, CV_PARSING_SYSTEM_PROMPT } from "./cv-parsing";
import {
  CANDIDATE_EVALUATION_SCHEMA,
  CANDIDATE_EVALUATION_SYSTEM_PROMPT,
} from "./candidate-evaluation";
import { PSYCHOLOGY_SCHEMA, PSYCHOLOGY_SYSTEM_PROMPT } from "./psychology-agent";
import { POSITIONING_SYSTEM_PROMPT } from "./positioning-agent";
import { VERIFY_EVALUATION_SYSTEM_PROMPT } from "./verify-evaluation";

/**
 * §176 — the evidence-grade slice, pinned.
 *
 * The defect class: "unattributed / undated / unquantified" became
 * "no evidence of" and "significantly below" — flat assertions about a
 * named person, in text that reaches clients. And elapsed time was
 * computed against the model's training clock: three runs produced
 * seven, then eight, for an interval the run date makes nine.
 *
 * Two enforcement layers, both pinned here. The SCHEMAS make an
 * ungraded machine claim impossible to emit (additionalProperties:
 * false + required). The PROMPTS carry the rules a schema cannot hold:
 * the comparative prohibition on not_stated claims, and the run-date
 * anchor. Prompt pins assert on the EXPORTED STRINGS — runtime values,
 * not file text — so a refactor that moves a file cannot silently
 * un-guard a rule, only deleting the rule can, and that fails here.
 */

type ItemSchema = {
  items: {
    required: readonly string[];
    additionalProperties: boolean;
    properties: { evidence_grade: { enum: readonly string[] } };
  };
};

describe("the graded schemas (§176)", () => {
  it("grades profile risks and development_areas", () => {
    const props = CANDIDATE_PROFILE_SCHEMA.properties as unknown as Record<string, ItemSchema>;
    for (const family of ["risks", "development_areas"] as const) {
      const items = props[family].items;
      expect(items.required, family).toContain("evidence_grade");
      expect(items.additionalProperties, family).toBe(false);
      expect(items.properties.evidence_grade.enum, family).toEqual([
        ...EVIDENCE_GRADES,
      ]);
    }
  });

  it("grades evaluation gaps", () => {
    const gaps = (
      CANDIDATE_EVALUATION_SCHEMA.properties as unknown as Record<string, ItemSchema>
    ).gaps;
    expect(gaps.items.required).toContain("evidence_grade");
    expect(gaps.items.properties.evidence_grade.enum).toEqual([
      ...EVIDENCE_GRADES,
    ]);
  });

  it("grades psychology watch_outs", () => {
    const watchOuts = (
      PSYCHOLOGY_SCHEMA.properties as unknown as Record<string, ItemSchema>
    ).watch_outs;
    expect(watchOuts.items.required).toContain("evidence_grade");
    expect(watchOuts.items.properties.evidence_grade.enum).toEqual([
      ...EVIDENCE_GRADES,
    ]);
  });
});

describe("the prompt rules a schema cannot hold (§176)", () => {
  it("forbids comparatives on not_stated claims where text reaches a client", () => {
    // D.2, the ruling that mattered most: silence about the document
    // never becomes a deficit of the person in client-facing language.
    expect(CANDIDATE_EVALUATION_SYSTEM_PROMPT).toMatch(
      /must NEVER be phrased as a comparative/
    );
    expect(POSITIONING_SYSTEM_PROMPT).toMatch(
      /NEVER as a comparative about the person/
    );
  });

  it("anchors elapsed time on run_date in every seam that computes it", () => {
    // F-C. Three sightings (seven, eight — never the correct nine)
    // across parse, evaluation and the refuter bought these four lines.
    for (const [name, prompt] of [
      ["parse", CV_PARSING_SYSTEM_PROMPT],
      ["evaluation", CANDIDATE_EVALUATION_SYSTEM_PROMPT],
      ["psychology", PSYCHOLOGY_SYSTEM_PROMPT],
      ["refuter", VERIFY_EVALUATION_SYSTEM_PROMPT],
    ] as const) {
      expect(prompt, name).toMatch(/run_date/);
      expect(prompt, name).toMatch(/never against your own sense of today/);
    }
  });

  it("words not_stated as a fact about the document in the grading seams", () => {
    expect(CV_PARSING_SYSTEM_PROMPT).toMatch(
      /never as a fact about the person/
    );
    expect(PSYCHOLOGY_SYSTEM_PROMPT).toMatch(
      /never as a fact about the person/
    );
  });
});

describe("the normaliser (three authors, one reader)", () => {
  it("reads strings, graded objects, and mixed arrays", () => {
    expect(
      normalizeClaims([
        "old row string",
        { claim: "graded claim", evidence_grade: "not_stated" },
      ])
    ).toEqual([
      { claim: "old row string", grade: null },
      { claim: "graded claim", grade: "not_stated" },
    ]);
  });

  it("drops junk instead of rendering [object Object]", () => {
    expect(
      normalizeClaims([42, null, {}, { claim: "" }, { claim: "  " }, "", "ok"])
    ).toEqual([{ claim: "ok", grade: null }]);
    expect(normalizeClaims(undefined)).toEqual([]);
    expect(normalizeClaims("not an array")).toEqual([]);
  });

  it("treats an unknown grade as ungraded rather than trusting it", () => {
    expect(
      claimGrade({ claim: "x", evidence_grade: "vibes" as never })
    ).toBeNull();
    expect(claimText({ claim: "x", evidence_grade: "not_stated" })).toBe("x");
    expect(claimText("plain")).toBe("plain");
  });
});
