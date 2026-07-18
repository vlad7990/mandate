// Assessment scoring — pure functions, no I/O.
//
// The evidence rollup and weighted strength are the ONLY numbers the assessment
// surfaces, and they are computed here from the operational competency weights
// (executive_search_competencies) so the client can never forge them. The
// output is an "evidence strength" summary — how much evidence was observed
// against each weighted competency — never a score of the person or a decision.

import type {
  CompetencyAssessment,
  EvidenceRating,
  EvidenceRollupEntry,
} from "./types";

/** The evidence scale, mapped to a 0..1 strength. Ratings are evidence
 * gradations, so the mapping is linear and coarse by design — false precision
 * would misrepresent a human judgment. */
export const RATING_SCORES: Record<EvidenceRating, number> = {
  strong: 1,
  moderate: 0.66,
  limited: 0.33,
  none: 0,
};

/** Minimal shape of an operational competency weight (from
 * executive_search_competencies joined to the competency library for its label). */
export type OperationalWeight = {
  competency_key: string;
  label: string;
  weight: number;
};

/**
 * One rollup entry per operational competency, in the given weight order. A
 * competency with no recorded assessment (or an unknown rating) counts as
 * "none" — absence of evidence is scored as no evidence, not skipped, so the
 * weighted strength cannot be inflated by leaving competencies blank.
 */
export function computeEvidenceRollup(
  weights: readonly OperationalWeight[],
  assessments: readonly CompetencyAssessment[]
): EvidenceRollupEntry[] {
  const byKey = new Map<string, CompetencyAssessment>();
  for (const a of assessments) {
    if (!byKey.has(a.competency_key)) byKey.set(a.competency_key, a);
  }

  return weights.map((w) => {
    const match = byKey.get(w.competency_key);
    const rating: EvidenceRating =
      match && match.rating in RATING_SCORES ? match.rating : "none";
    return {
      competency_key: w.competency_key,
      label: w.label,
      weight: w.weight,
      rating,
      evidence_score: RATING_SCORES[rating],
    };
  });
}

/**
 * Weighted evidence strength in 0..1: sum(weight * score) / sum(weight). Returns
 * 0 when there are no weights (nothing to score against). Non-positive weights
 * are ignored so a stray 0/negative weight cannot distort the denominator.
 */
export function computeWeightedEvidenceStrength(
  rollup: readonly EvidenceRollupEntry[]
): number {
  let weightSum = 0;
  let weightedScore = 0;
  for (const entry of rollup) {
    if (entry.weight <= 0) continue;
    weightSum += entry.weight;
    weightedScore += entry.weight * entry.evidence_score;
  }
  if (weightSum === 0) return 0;
  return weightedScore / weightSum;
}
