import { describe, expect, test } from "vitest";
import type { DimensionWeights } from "@/lib/ai/onboarding-analysis";
import {
  buildCandidateEvidence,
  buildComparisonGrid,
  type ComparisonGrid,
} from "./evidence-index";
import { extractEvidence } from "./evidence-extractors";
import {
  evidenceToEmailLines,
  evidenceToHtml,
  evidenceToMarkdown,
} from "./comparison-export";

const WEIGHTS: DimensionWeights = {
  technical: 9,
  domain: 8,
  leadership: 4,
  regulatory: 10,
  transformation: 2,
};

/** One evidenced candidate, one who has never been assessed on anything. */
function grid(): ComparisonGrid {
  const evidenced = buildCandidateEvidence(
    {
      candidate_id: "c1",
      full_name: "Dana Reed",
      items: extractEvidence({
        scores: {
          technical_score: 8,
          domain_score: null,
          leadership_score: null,
          regulatory_score: 9,
          transformation_score: null,
        },
      }),
    },
    WEIGHTS
  );
  const unknown = buildCandidateEvidence(
    { candidate_id: "c2", full_name: "Sam Vale", items: [] },
    WEIGHTS
  );
  return buildComparisonGrid([evidenced, unknown], WEIGHTS);
}

describe("evidenceToMarkdown", () => {
  test("states what nobody was assessed on", () => {
    // The disclosure that keeps an exported comparison honest once it leaves
    // the recruiter's screen.
    const md = evidenceToMarkdown(grid()).join("\n");
    expect(md).toContain("Nobody has been assessed on");
    expect(md).toContain("domain");
  });

  test("renders coverage words, never scores", () => {
    const md = evidenceToMarkdown(grid()).join("\n");
    expect(md).toContain("Evidenced");
    expect(md).toContain("Not assessed");
    // A number in this table would be read as a score for the person.
    expect(md).not.toMatch(/\| *[0-9]+(\.[0-9]+)? *\|/);
  });

  test("names each candidate's critical gaps", () => {
    const md = evidenceToMarkdown(grid()).join("\n");
    expect(md).toContain("**Sam Vale** — still unknown on");
  });

  test("emits nothing at all when there is no grid", () => {
    // An empty section in an exported document reads as "nothing was found",
    // which is a different and wrong claim from "this export has no grid".
    expect(evidenceToMarkdown(null)).toEqual([]);
    expect(
      evidenceToMarkdown(buildComparisonGrid([], WEIGHTS))
    ).toEqual([]);
  });
});

describe("evidenceToHtml", () => {
  test("includes the table and the blind-spot warning", () => {
    const html = evidenceToHtml(grid());
    expect(html).toContain("Evidence &amp; gaps");
    expect(html).toContain("Nobody has been assessed on");
    expect(html).toContain("state-absent");
  });

  test("escapes candidate names", () => {
    const injected = buildComparisonGrid(
      [
        buildCandidateEvidence(
          { candidate_id: "x", full_name: '<script>alert("x")</script>', items: [] },
          WEIGHTS
        ),
      ],
      WEIGHTS
    );
    const html = evidenceToHtml(injected);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  test("is empty without a grid", () => {
    expect(evidenceToHtml(null)).toBe("");
  });
});

describe("evidenceToEmailLines", () => {
  test("is gaps-only — what survives being skimmed", () => {
    const lines = evidenceToEmailLines(grid());
    const text = lines.join("\n");
    expect(text).toContain("EVIDENCE GAPS");
    expect(text).toContain("Nobody assessed on");
    expect(text).toContain("Sam Vale: unknown on");
    // The full grid would be scrolled past; coverage words for every cell
    // have no place in an email digest.
    expect(text).not.toContain("Evidenced");
  });

  test("says so explicitly when there are no gaps", () => {
    // Silence here would read as "the section failed to render".
    const complete = buildComparisonGrid(
      [
        buildCandidateEvidence(
          {
            candidate_id: "c1",
            full_name: "Dana Reed",
            items: extractEvidence({
              scores: {
                technical_score: 8,
                domain_score: 8,
                leadership_score: 8,
                regulatory_score: 8,
                transformation_score: 8,
              },
            }),
          },
          WEIGHTS
        ),
      ],
      WEIGHTS
    );
    expect(evidenceToEmailLines(complete).join("\n")).toContain(
      "None — every weighted dimension has evidence."
    );
  });

  test("is empty without a grid", () => {
    expect(evidenceToEmailLines(null)).toEqual([]);
  });
});
