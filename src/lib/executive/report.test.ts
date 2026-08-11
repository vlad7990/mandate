import { describe, expect, test } from "vitest";
import { compileExecutiveReport, type CompileReportInput } from "./report";
import type { OperationalWeight } from "./assessment-scoring";
import type { AssessmentContent, CompetencyAssessment } from "./types";

const WEIGHTS: OperationalWeight[] = [
  { competency_key: "scale_ops", label: "Scaling operations", weight: 50 },
  { competency_key: "regulatory", label: "Regulatory environment", weight: 30 },
  { competency_key: "tech_judgment", label: "Technology judgment", weight: 20 },
];

function recorded(
  key: string,
  rating: CompetencyAssessment["rating"],
  evidence = "",
  source_stages: string[] = []
): CompetencyAssessment {
  return { competency_key: key, rating, evidence, source_stages };
}

function content(
  assessments: CompetencyAssessment[],
  overrides: Partial<AssessmentContent> = {}
): AssessmentContent {
  return {
    overall_summary: "Summary of what was observed.",
    competency_assessments: assessments,
    evidence_rollup: [],
    weighted_evidence_strength: 0,
    ...overrides,
  };
}

function input(overrides: Partial<CompileReportInput> = {}): CompileReportInput {
  return {
    candidateName: "Daniel Okonjo",
    roleTitle: "Chief Operating Officer",
    companyName: "Northvale Capital",
    profile: {
      version: 3,
      approvedAt: "2026-07-01T10:00:00Z",
      approverName: "E. Marchetti",
      roleMission: "Industrialise a firm that doubled AUM on founder-era process.",
      strategicMandate: "Without slowing origination.",
    },
    plan: {
      version: 2,
      approvedAt: "2026-07-10T10:00:00Z",
      approverName: "E. Marchetti",
      stageNames: ["Operating deep-dive", "Control environment"],
    },
    assessment: {
      version: 1,
      approvedAt: "2026-07-20T10:00:00Z",
      approverName: "E. Marchetti",
      content: content([
        recorded("scale_ops", "strong", "Took shared services 40 → 190.", [
          "Operating deep-dive",
        ]),
        recorded("regulatory", "strong", "Carried remediation to sign-off.", [
          "Control environment",
        ]),
        recorded("tech_judgment", "limited", "Answered at vendor level.", [
          "Operating deep-dive",
        ]),
      ]),
    },
    weights: WEIGHTS,
    ...overrides,
  };
}

describe("compileExecutiveReport — coverage", () => {
  test("recomputes coverage from the weights, not from the stored rollup", () => {
    // A stored rollup claiming everything is strong must not reach the page.
    const forged = content(
      [recorded("scale_ops", "limited", "Thin.", ["Operating deep-dive"])],
      {
        evidence_rollup: WEIGHTS.map((w) => ({
          competency_key: w.competency_key,
          label: w.label,
          weight: w.weight,
          rating: "strong" as const,
          evidence_score: 1,
        })),
        weighted_evidence_strength: 1,
      }
    );
    const report = compileExecutiveReport(
      input({
        assessment: {
          version: 1,
          approvedAt: "2026-07-20T10:00:00Z",
          approverName: "E. Marchetti",
          content: forged,
        },
      })
    );
    expect(report.coverage.map((c) => c.rating)).toEqual(["limited", "none", "none"]);
    expect(report.coveredCount).toBe(1);
    expect(report.weightedStrengthPercent).toBe(17); // 0.33 × 50 / 100
  });

  test("normalises weights to a share of the search's total", () => {
    const report = compileExecutiveReport(
      input({
        weights: [
          { competency_key: "scale_ops", label: "Scaling operations", weight: 6 },
          { competency_key: "regulatory", label: "Regulatory environment", weight: 2 },
          { competency_key: "tech_judgment", label: "Technology judgment", weight: 2 },
        ],
      })
    );
    expect(report.coverage.map((c) => c.weightShare)).toEqual([60, 20, 20]);
  });

  test("covered weight percent counts only competencies with evidence", () => {
    const report = compileExecutiveReport(
      input({
        assessment: {
          version: 1,
          approvedAt: null,
          approverName: null,
          content: content([recorded("scale_ops", "strong", "Detail.")]),
        },
      })
    );
    expect(report.coveredWeightPercent).toBe(50);
    expect(report.coveredCount).toBe(1);
    expect(report.competencyCount).toBe(3);
  });

  test("bar fill is the evidence score, never a quality ramp", () => {
    const report = compileExecutiveReport(input());
    expect(report.coverage.map((c) => c.fill)).toEqual([100, 100, 33]);
  });
});

describe("compileExecutiveReport — evidence", () => {
  test("renders only competencies the assessor wrote about", () => {
    const report = compileExecutiveReport(
      input({
        assessment: {
          version: 1,
          approvedAt: null,
          approverName: null,
          content: content([
            recorded("scale_ops", "strong", "Written up."),
            recorded("regulatory", "strong", "   "), // rating with no reason
          ]),
        },
      })
    );
    expect(report.evidence.map((e) => e.competencyKey)).toEqual(["scale_ops"]);
    // …but the rating still appears in the coverage table.
    expect(report.coverage[1].rating).toBe("strong");
  });

  test("drops stage citations that are not on the approved plan", () => {
    const report = compileExecutiveReport(
      input({
        assessment: {
          version: 1,
          approvedAt: null,
          approverName: null,
          content: content([
            recorded("scale_ops", "strong", "Written up.", [
              "Operating deep-dive",
              "A stage renamed after approval",
            ]),
          ]),
        },
      })
    );
    expect(report.evidence[0].sourceStages).toEqual(["Operating deep-dive"]);
  });
});

describe("compileExecutiveReport — where evidence is thin", () => {
  test("names every non-strong competency with its weight", () => {
    const [paragraph] = compileExecutiveReport(input()).thinParagraphs;
    expect(paragraph).toContain("Technology judgment carries 20%");
    expect(paragraph).toContain("limited evidence");
    expect(paragraph).toContain("will not close them by inference");
  });

  test("says so when a competency has no evidence at all", () => {
    const [paragraph] = compileExecutiveReport(
      input({
        assessment: {
          version: 1,
          approvedAt: null,
          approverName: null,
          content: content([recorded("scale_ops", "strong", "Written up.")]),
        },
      })
    ).thinParagraphs;
    expect(paragraph).toContain("Regulatory environment carries 30%");
    expect(paragraph).toContain("no recorded evidence");
  });

  test("still runs the section when nothing is thin", () => {
    const [paragraph] = compileExecutiveReport(
      input({
        assessment: {
          version: 1,
          approvedAt: null,
          approverName: null,
          content: content(
            WEIGHTS.map((w) => recorded(w.competency_key, "strong", "Written up."))
          ),
        },
      })
    ).thinParagraphs;
    expect(paragraph).toContain("not about the person");
  });
});

describe("compileExecutiveReport — provenance and drift", () => {
  test("states versions, approvers and the as-at date from the records", () => {
    const report = compileExecutiveReport(input());
    expect(report.provenance).toContain("Success profile v3 · approved · E. Marchetti");
    expect(report.provenance).toContain("Interview plan v2 · approved · E. Marchetti");
    expect(report.provenance).toContain("As at 2026-07-20");
  });

  test("does not invent an approver when none was recorded", () => {
    const report = compileExecutiveReport(
      input({
        profile: {
          version: 3,
          approvedAt: null,
          approverName: null,
          roleMission: "Mission.",
          strategicMandate: "",
        },
      })
    );
    expect(report.provenance[0]).toBe("Success profile v3 · approved · approver not recorded");
    expect(report.mandateParagraphs).toEqual(["Mission."]);
  });

  test("flags weights that changed after the assessment was approved", () => {
    const approvedAgainst = content(
      [recorded("scale_ops", "strong", "Written up.")],
      {
        evidence_rollup: [
          {
            competency_key: "scale_ops",
            label: "Scaling operations",
            weight: 50,
            rating: "strong",
            evidence_score: 1,
          },
          {
            competency_key: "regulatory",
            label: "Regulatory environment",
            weight: 30,
            rating: "none",
            evidence_score: 0,
          },
          {
            competency_key: "tech_judgment",
            label: "Technology judgment",
            weight: 20,
            rating: "none",
            evidence_score: 0,
          },
        ],
      }
    );
    const unchanged = compileExecutiveReport(
      input({
        assessment: {
          version: 1,
          approvedAt: null,
          approverName: null,
          content: approvedAgainst,
        },
      })
    );
    expect(unchanged.weightsDrifted).toBe(false);

    const reweighted = compileExecutiveReport(
      input({
        assessment: {
          version: 1,
          approvedAt: null,
          approverName: null,
          content: approvedAgainst,
        },
        weights: [
          { competency_key: "scale_ops", label: "Scaling operations", weight: 70 },
          { competency_key: "regulatory", label: "Regulatory environment", weight: 30 },
          { competency_key: "tech_judgment", label: "Technology judgment", weight: 20 },
        ],
      })
    );
    expect(reweighted.weightsDrifted).toBe(true);
  });

  test("does not claim drift when the assessment has no stored rollup", () => {
    expect(compileExecutiveReport(input()).weightsDrifted).toBe(false);
  });
});
