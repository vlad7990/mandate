// Executive Intelligence report — compilation. Pure functions, no I/O.
//
// The report is the artifact the diligence chain builds toward and the one
// that leaves the building, so every number in it is derived here from
// approved records rather than carried over from a client or a stored blob:
//
// - Coverage is recomputed from the approved assessment's ratings against the
//   search's current operational competency weights. A rollup stored in
//   content_json is never trusted for display; it is only compared, so drift
//   can be *stated* rather than silently resolved (see `weightsDrifted`).
// - The thin-evidence section is generated from the same rollup. It is
//   assembled from data, not written by a model — the report must not be able
//   to argue its own gaps away.
// - Nothing is inferred about the person. Ratings are evidence gradations and
//   are rendered as words; there is no grade, no percentile, no pass mark.

import {
  computeEvidenceRollup,
  computeWeightedEvidenceStrength,
  type OperationalWeight,
} from "./assessment-scoring";
import type {
  AssessmentContent,
  EvidenceRating,
  EvidenceRollupEntry,
} from "./types";

/** Short rating words used inside the document. The long
 * EVIDENCE_RATING_LABELS ("Strong evidence") read as a sentence in the editor
 * but as noise in a table, so the report uses the short form and states the
 * scale once, in full, under the coverage table. */
export const REPORT_RATING_WORDS: Record<EvidenceRating, string> = {
  strong: "Strong",
  moderate: "Moderate",
  limited: "Limited",
  none: "No evidence observed",
};

export type ReportCoverageRow = {
  competencyKey: string;
  label: string;
  /** Share of the search's total competency weight, as a percentage. */
  weightShare: number;
  rating: EvidenceRating;
  ratingWord: string;
  /** Bar width 0–100. Evidence recorded against weight — not a quality ramp. */
  fill: number;
  hasEvidence: boolean;
};

export type ReportEvidenceEntry = {
  competencyKey: string;
  label: string;
  ratingWord: string;
  sourceStages: string[];
  body: string;
};

export type ReportArtifact = {
  version: number;
  approvedAt: string | null;
  approverName: string | null;
};

export type CompileReportInput = {
  candidateName: string;
  roleTitle: string;
  companyName: string;
  /** Approved success profile — supplies section 01. */
  profile: ReportArtifact & { roleMission: string; strategicMandate: string };
  /** Approved interview plan — supplies stage names for evidence provenance. */
  plan: ReportArtifact & { stageNames: string[] };
  /** Approved, human-authored assessment. */
  assessment: ReportArtifact & { content: AssessmentContent };
  /** Current operational weights for the search, highest weight first. */
  weights: readonly OperationalWeight[];
};

export type CompiledReport = {
  candidateName: string;
  roleTitle: string;
  companyName: string;
  /** Section 01, one paragraph per non-empty profile field. */
  mandateParagraphs: string[];
  competencyCount: number;
  /** Section 02. */
  coverage: ReportCoverageRow[];
  coveredCount: number;
  /** Share of total weight carried by competencies that have evidence. */
  coveredWeightPercent: number;
  /** Weighted evidence strength 0–100, shown as a secondary figure. */
  weightedStrengthPercent: number;
  /** Section 03. */
  assessorSummary: string;
  /** Who approved the assessment — the voice section 03 speaks in. */
  recordedBy: string | null;
  evidence: ReportEvidenceEntry[];
  /** Section 04, assembled from the rollup. */
  thinParagraphs: string[];
  provenance: string[];
  /** True when the operational weights no longer match the set the approved
   * assessment was scored against. Surfaced in the document, never hidden. */
  weightsDrifted: boolean;
};

function pct(n: number): number {
  return Math.round(n * 100);
}

/** Weight shares as percentages of the search's total weight. Templates store
 * weights that already sum to 100, but nothing enforces that, so the report
 * normalises rather than printing a raw number with a % sign after it. */
function weightShares(rollup: readonly EvidenceRollupEntry[]): number[] {
  const total = rollup.reduce((sum, e) => sum + (e.weight > 0 ? e.weight : 0), 0);
  if (total <= 0) return rollup.map(() => 0);
  return rollup.map((e) => Math.round(((e.weight > 0 ? e.weight : 0) / total) * 100));
}

/** Did the current operational weights change after the assessment was
 * approved? Compares the stored rollup against the recomputed one on key and
 * weight — the two facts that move the numbers. */
function detectDrift(
  stored: readonly EvidenceRollupEntry[],
  fresh: readonly EvidenceRollupEntry[]
): boolean {
  if (stored.length === 0) return false; // nothing approved to compare against
  if (stored.length !== fresh.length) return true;
  const storedByKey = new Map(stored.map((e) => [e.competency_key, e.weight]));
  return fresh.some((e) => storedByKey.get(e.competency_key) !== e.weight);
}

function listSentence(items: string[]): string {
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/**
 * Section 04. Every competency that is not "strong" gets named with its
 * weight, in weight order, and the closing line refuses to close the gaps by
 * inference. When there is nothing thin the section still runs — it says the
 * set is covered and says what that does and does not mean.
 */
function buildThinParagraphs(
  coverage: readonly ReportCoverageRow[]
): string[] {
  const bare = coverage.filter((c) => c.rating === "none");
  const limited = coverage.filter((c) => c.rating === "limited");
  const moderate = coverage.filter((c) => c.rating === "moderate");

  if (bare.length === 0 && limited.length === 0 && moderate.length === 0) {
    return [
      "Every weighted competency holds strong evidence. That is a statement about the coverage of this assessment, not about the person, and it does not make the decision.",
    ];
  }

  const sentences: string[] = [];

  for (const c of bare) {
    sentences.push(
      `${c.label} carries ${c.weightShare}% of the weighted set and holds no recorded evidence.`
    );
  }
  for (const c of limited) {
    sentences.push(
      `${c.label} carries ${c.weightShare}% of the weighted set and holds limited evidence.`
    );
  }
  if (moderate.length > 0) {
    sentences.push(
      `${listSentence(moderate.map((c) => c.label))} ${
        moderate.length === 1 ? "is" : "are"
      } moderate.`
    );
  }
  sentences.push(
    "If those weigh on the decision, a further stage is the honest way to close them — this report will not close them by inference."
  );

  return [sentences.join(" ")];
}

function approvedLine(kind: string, artifact: ReportArtifact): string {
  const who = artifact.approverName?.trim() || "approver not recorded";
  return `${kind} v${artifact.version} · approved · ${who}`;
}

/** Latest of the three approval timestamps — the date the document is "as at". */
function latestApproval(input: CompileReportInput): string | null {
  const stamps = [
    input.profile.approvedAt,
    input.plan.approvedAt,
    input.assessment.approvedAt,
  ].filter((s): s is string => typeof s === "string" && s.length > 0);
  if (stamps.length === 0) return null;
  return stamps.reduce((a, b) => (a > b ? a : b));
}

export function compileExecutiveReport(
  input: CompileReportInput
): CompiledReport {
  const content = input.assessment.content;

  // Authoritative: ratings from the approved assessment, weights from the
  // search. Never the rollup as stored.
  const rollup = computeEvidenceRollup(input.weights, content.competency_assessments);
  const shares = weightShares(rollup);

  const coverage: ReportCoverageRow[] = rollup.map((entry, i) => ({
    competencyKey: entry.competency_key,
    label: entry.label,
    weightShare: shares[i],
    rating: entry.rating,
    ratingWord: REPORT_RATING_WORDS[entry.rating],
    fill: pct(entry.evidence_score),
    hasEvidence: entry.rating !== "none",
  }));

  const covered = coverage.filter((c) => c.hasEvidence);
  const coveredWeightPercent = covered.reduce((sum, c) => sum + c.weightShare, 0);

  // Section 03 renders only competencies the assessor actually wrote about,
  // in weight order. A rating without written evidence is a number without a
  // reason, so it stays in the coverage table and out of the narrative.
  const byKey = new Map(
    content.competency_assessments.map((a) => [a.competency_key, a])
  );
  const stageNames = new Set(input.plan.stageNames);
  const evidence: ReportEvidenceEntry[] = coverage.flatMap((c) => {
    const recorded = byKey.get(c.competencyKey);
    const body = recorded?.evidence.trim();
    if (!recorded || !body) return [];
    return [
      {
        competencyKey: c.competencyKey,
        label: c.label,
        ratingWord: c.ratingWord,
        // Only stages that exist on the approved plan are cited — a stage
        // renamed after approval must not appear as provenance.
        sourceStages: recorded.source_stages.filter((s) => stageNames.has(s)),
        body,
      },
    ];
  });

  const mandateParagraphs = [
    input.profile.roleMission.trim(),
    input.profile.strategicMandate.trim(),
  ].filter((p) => p.length > 0);

  const asAt = latestApproval(input);
  const provenance = [
    approvedLine("Success profile", input.profile),
    approvedLine("Interview plan", input.plan),
    approvedLine("Assessment", input.assessment),
    "Assessment authored by a human · no AI",
    "Coverage recomputed from the approved assessment",
    "Compiled from approved records only",
    // Its own line: appended to the one above it, the date wrapped mid-token
    // in the two-column footer.
    ...(asAt ? [`As at ${asAt.slice(0, 10)}`] : []),
  ];

  return {
    candidateName: input.candidateName,
    roleTitle: input.roleTitle,
    companyName: input.companyName,
    mandateParagraphs,
    competencyCount: coverage.length,
    coverage,
    coveredCount: covered.length,
    coveredWeightPercent,
    weightedStrengthPercent: pct(computeWeightedEvidenceStrength(rollup)),
    assessorSummary: content.overall_summary.trim(),
    recordedBy: input.assessment.approverName?.trim() || null,
    evidence,
    thinParagraphs: buildThinParagraphs(coverage),
    provenance,
    weightsDrifted: detectDrift(content.evidence_rollup, rollup),
  };
}
