// Executive Assessment — normalization + skeleton building.
//
// NOTE: this is deliberately NOT an "-agent" module. Assessments are
// human-authored; there is no model call. This file only (a) coerces untrusted
// assessment content into a safe shape, and (b) pre-structures a blank
// assessment from the approved interview plan and the operational competency
// weights so the recruiter fills evidence rather than starting from nothing.

import {
  computeEvidenceRollup,
  computeWeightedEvidenceStrength,
  type OperationalWeight,
} from "@/lib/executive/assessment-scoring";
import {
  EVIDENCE_RATINGS,
  type AssessmentContent,
  type CompetencyAssessment,
  type EvidenceRating,
  type EvidenceRollupEntry,
} from "@/lib/executive/types";

export const EMPTY_ASSESSMENT: AssessmentContent = {
  overall_summary: "",
  competency_assessments: [],
  evidence_rollup: [],
  weighted_evidence_strength: 0,
};

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string" && v.length > 0);
}

function asRating(value: unknown): EvidenceRating {
  return typeof value === "string" && (EVIDENCE_RATINGS as string[]).includes(value)
    ? (value as EvidenceRating)
    : "none";
}

function normalizeCompetencyAssessments(value: unknown): CompetencyAssessment[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: CompetencyAssessment[] = [];
  for (const raw of value) {
    if (typeof raw !== "object" || raw === null) continue;
    const rec = raw as Record<string, unknown>;
    const key = asString(rec.competency_key);
    if (!key || seen.has(key)) continue; // drop blanks and cross-entry duplicates
    seen.add(key);
    out.push({
      competency_key: key,
      rating: asRating(rec.rating),
      evidence: asString(rec.evidence),
      source_stages: asStringArray(rec.source_stages),
    });
  }
  return out;
}

function normalizeRollup(value: unknown): EvidenceRollupEntry[] {
  if (!Array.isArray(value)) return [];
  const out: EvidenceRollupEntry[] = [];
  for (const raw of value) {
    if (typeof raw !== "object" || raw === null) continue;
    const rec = raw as Record<string, unknown>;
    const key = asString(rec.competency_key);
    if (!key) continue;
    out.push({
      competency_key: key,
      label: asString(rec.label),
      weight: typeof rec.weight === "number" ? rec.weight : 0,
      rating: asRating(rec.rating),
      evidence_score: typeof rec.evidence_score === "number" ? rec.evidence_score : 0,
    });
  }
  return out;
}

/**
 * Coerce untrusted content (from the DB or a client action) into a valid
 * AssessmentContent. Human fields are cleaned; the stored rollup is preserved
 * for display but is authoritative only after applyRollup() recomputes it from
 * the operational weights on save.
 */
export function normalizeAssessment(content: unknown): AssessmentContent {
  const rec =
    typeof content === "object" && content !== null
      ? (content as Record<string, unknown>)
      : {};
  const strength = rec.weighted_evidence_strength;
  return {
    overall_summary: asString(rec.overall_summary),
    competency_assessments: normalizeCompetencyAssessments(rec.competency_assessments),
    evidence_rollup: normalizeRollup(rec.evidence_rollup),
    weighted_evidence_strength:
      typeof strength === "number" && strength >= 0 && strength <= 1 ? strength : 0,
  };
}

/**
 * Recompute the evidence rollup + weighted strength from the operational
 * weights and stamp them onto the content. This is the authoritative scoring
 * step — call it on every save so the numbers always match the recorded
 * ratings and current weights, never a client-supplied value.
 */
export function applyRollup(
  content: AssessmentContent,
  weights: readonly OperationalWeight[]
): AssessmentContent {
  const rollup = computeEvidenceRollup(weights, content.competency_assessments);
  return {
    ...content,
    evidence_rollup: rollup,
    weighted_evidence_strength: computeWeightedEvidenceStrength(rollup),
  };
}

/** Minimal shape of an approved interview plan's content we read to derive
 * per-competency source stages. */
type PlanStage = {
  stage_name?: unknown;
  assigned_competencies?: unknown;
};

function planStages(planContent: unknown): PlanStage[] {
  if (typeof planContent !== "object" || planContent === null) return [];
  const stages = (planContent as Record<string, unknown>).stages;
  return Array.isArray(stages) ? (stages as PlanStage[]) : [];
}

/**
 * Pre-structure a blank assessment: one competency row per operational weight
 * (in weight order), rating defaulted to "none", evidence empty, and
 * source_stages pre-filled from the approved plan (the stages that assigned
 * that competency). The rollup is computed so the strength panel renders
 * immediately (it will read 0 until evidence is recorded).
 */
export function buildAssessmentSkeleton(
  weights: readonly OperationalWeight[],
  approvedPlanContent: unknown
): AssessmentContent {
  const stages = planStages(approvedPlanContent);
  const stagesForKey = (key: string): string[] =>
    stages
      .filter((s) => asStringArray(s.assigned_competencies).includes(key))
      .map((s) => asString(s.stage_name))
      .filter((name) => name.length > 0);

  const competency_assessments: CompetencyAssessment[] = weights.map((w) => ({
    competency_key: w.competency_key,
    rating: "none",
    evidence: "",
    source_stages: stagesForKey(w.competency_key),
  }));

  return applyRollup({ ...EMPTY_ASSESSMENT, competency_assessments }, weights);
}
