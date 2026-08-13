// Turning the app's existing assets into evidence items.
//
// Layer 2 of candidate analysis: evidence-index.ts defines the shape, this
// decides what each stored asset is actually entitled to claim.
//
// ── The constraint that shaped this file ──
//
// Only three of the product's assets are dimension-keyed. Everything else the
// app generates about a person — the recruiter assessment, psychology profile,
// culture match, triangulation, risk review — speaks about the CANDIDATE, not
// about `technical` or `regulatory` in particular.
//
// The tempting move is to keyword-match those into dimensions: scan a
// recruiter's fit_notes for "regulatory" and file it under regulatory. That
// manufactures dimension-level evidence out of a sentence that was never making
// a dimension-level claim, and it does so at `recruiter` provenance — the
// strongest basis short of measured. A grid built that way would read as
// well-evidenced precisely where it is guessing.
//
// So those assets are NOT extracted here. They belong beside the grid as
// candidate-level context, and if dimensional recruiter judgement is wanted,
// the assessment form should ask for it rather than the parser inferring it.
// See CANDIDATE_LEVEL_ASSETS below.

import type { DimensionKey } from "@/lib/ai/onboarding-analysis";
import type { CandidateProfile, FitDimensions } from "@/lib/ai/cv-parsing";
import {
  DIMENSION_VERDICT_LABELS,
  type DimensionNotes,
  type DimensionVerdict,
} from "@/lib/recruiter-assessment";
import type { EvidenceItem, EvidencePolarity } from "./evidence-index";

/**
 * Assets that describe the whole person and cannot honestly be split across
 * dimensions. Listed so the UI can show them as context rather than silently
 * omitting them, and so the omission is a decision on the record.
 *
 * The recruiter assessment used to be on this list. It came off not by being
 * inferred more cleverly, but by the form ASKING for per-dimension judgement —
 * which is the only honest way to make prose comparable.
 */
export const CANDIDATE_LEVEL_ASSETS = [
  "psychology_profile",
  "culture_match",
  "triangulation",
  "risk_review",
] as const;

/**
 * Score bands on the 0–10 scale used throughout scoring-math.
 *
 * A high score is evidence the candidate meets the dimension; a low score is
 * evidence they do not — genuinely a contradicting signal, not an absence. The
 * middle band is deliberately neutral: a 5 says the assessment happened and
 * landed in the middle, which is information, but it argues for nothing.
 */
export const SUPPORTS_AT_OR_ABOVE = 7;
export const CONTRADICTS_AT_OR_BELOW = 3;

export function polarityForScore(score: number): EvidencePolarity {
  if (score >= SUPPORTS_AT_OR_ABOVE) return "supports";
  if (score <= CONTRADICTS_AT_OR_BELOW) return "contradicts";
  return "neutral";
}

const DIMENSION_LABEL: Record<DimensionKey, string> = {
  technical: "Technical depth",
  domain: "Domain expertise",
  leadership: "Leadership scale",
  regulatory: "Regulatory exposure",
  transformation: "Transformation record",
};

// ---------------------------------------------------------------------------
// candidate_scores — the measured basis
// ---------------------------------------------------------------------------

export type CandidateScoreRow = {
  technical_score: number | null;
  domain_score: number | null;
  leadership_score: number | null;
  regulatory_score: number | null;
  transformation_score: number | null;
};

const SCORE_COLUMN: Record<DimensionKey, keyof CandidateScoreRow> = {
  technical: "technical_score",
  domain: "domain_score",
  leadership: "leadership_score",
  regulatory: "regulatory_score",
  transformation: "transformation_score",
};

/**
 * The scoring engine's output — the only `measured` evidence in the system.
 *
 * A null column is skipped rather than read as zero. The engine leaves a
 * dimension null when it had nothing to score, and turning that into a 0 would
 * manufacture a contradicting signal out of silence — the exact confusion the
 * evidence index exists to prevent.
 */
export function fromCandidateScores(
  row: CandidateScoreRow | null | undefined
): EvidenceItem[] {
  if (!row) return [];
  const items: EvidenceItem[] = [];

  for (const [dimension, column] of Object.entries(SCORE_COLUMN) as Array<
    [DimensionKey, keyof CandidateScoreRow]
  >) {
    const score = row[column];
    if (typeof score !== "number" || !Number.isFinite(score)) continue;

    items.push({
      dimension,
      basis: "measured",
      polarity: polarityForScore(score),
      source_label: "Scoring engine",
      summary: `${DIMENSION_LABEL[dimension]} scored ${score}/10.`,
    });
  }

  return items;
}

// ---------------------------------------------------------------------------
// cv_structured.fit_dimensions — the agent's read of the CV
// ---------------------------------------------------------------------------

/**
 * The review agent's fit analysis.
 *
 * `ai_inferred` rather than `measured`: it is a model's reading of one
 * document, and it inherits whatever that document chose to mention. Ranking it
 * below the scoring engine is the point — when both exist they can disagree,
 * and the index will surface that as `conflicted` rather than averaging it away.
 */
export function fromFitDimensions(
  fit: FitDimensions | null | undefined
): EvidenceItem[] {
  if (!fit || typeof fit !== "object") return [];
  const items: EvidenceItem[] = [];

  for (const dimension of Object.keys(DIMENSION_LABEL) as DimensionKey[]) {
    const score = fit[dimension];
    if (typeof score !== "number" || !Number.isFinite(score)) continue;

    items.push({
      dimension,
      basis: "ai_inferred",
      polarity: polarityForScore(score),
      source_label: "CV review",
      summary: `${DIMENSION_LABEL[dimension]} read as ${score}/10 from the CV.`,
    });
  }

  return items;
}

// ---------------------------------------------------------------------------
// The CV itself — the candidate's own account
// ---------------------------------------------------------------------------

/**
 * Parser fields that speak to exactly one dimension.
 *
 * `regulatory` is deliberately absent: nothing the parser extracts is a claim
 * about regulatory exposure, and inventing a mapping for completeness would put
 * self-reported evidence under the dimension most likely to matter and least
 * likely to be corroborated. Its silence in the grid is accurate.
 */
export function fromCvProfile(
  profile: Partial<CandidateProfile> | null | undefined
): EvidenceItem[] {
  if (!profile || typeof profile !== "object") return [];
  const items: EvidenceItem[] = [];

  const tech = Array.isArray(profile.tech_exposure)
    ? profile.tech_exposure.filter((t) => typeof t === "string" && t.trim())
    : [];
  if (tech.length > 0) {
    items.push({
      dimension: "technical",
      basis: "self_reported",
      polarity: "supports",
      source_label: "CV",
      summary: `Lists ${tech.slice(0, 4).join(", ")}${tech.length > 4 ? ` and ${tech.length - 4} more` : ""}.`,
    });
  }

  const transformation = Array.isArray(profile.transformation_experience)
    ? profile.transformation_experience.filter(
        (t) => typeof t === "string" && t.trim()
      )
    : [];
  if (transformation.length > 0) {
    items.push({
      dimension: "transformation",
      basis: "self_reported",
      polarity: "supports",
      source_label: "CV",
      summary: `Describes ${transformation.slice(0, 3).join("; ")}.`,
    });
  }

  if (typeof profile.domain === "string" && profile.domain.trim()) {
    items.push({
      dimension: "domain",
      basis: "self_reported",
      polarity: "supports",
      source_label: "CV",
      summary: `States a background in ${profile.domain.trim()}.`,
    });
  }

  if (typeof profile.scale === "string" && profile.scale.trim()) {
    items.push({
      dimension: "leadership",
      basis: "self_reported",
      polarity: "supports",
      source_label: "CV",
      summary: `States operating scale: ${profile.scale.trim()}.`,
    });
  }

  return items;
}

// ---------------------------------------------------------------------------
// Recruiter judgement — the only human basis
// ---------------------------------------------------------------------------

const VERDICT_POLARITY: Record<DimensionVerdict, EvidencePolarity | null> = {
  strong: "supports",
  adequate: "supports",
  gap: "contradicts",
  // Not a judgement about the candidate. A recruiter who could not assess a
  // dimension has told us about the process, not about the person, so it
  // produces no evidence and the cell stays honestly empty.
  unknown: null,
};

/**
 * Per-dimension recruiter notes.
 *
 * `recruiter` basis — outranked only by the scoring engine, because a
 * professional judgement made against a specific dimension is the strongest
 * signal the product has short of a computed one, and unlike the CV it is not
 * the candidate's own account.
 *
 * A verdict with no note still counts. Making the note mandatory would push
 * recruiters to write something rather than nothing, and a filler sentence is
 * worse evidence than a clean verdict.
 */
export function fromRecruiterDimensionNotes(
  notes: DimensionNotes | null | undefined
): EvidenceItem[] {
  if (!notes || typeof notes !== "object") return [];
  const items: EvidenceItem[] = [];

  for (const dimension of Object.keys(DIMENSION_LABEL) as DimensionKey[]) {
    const entry = notes[dimension];
    if (!entry) continue;

    const polarity = VERDICT_POLARITY[entry.verdict];
    if (polarity === null) continue;

    const note = entry.note?.trim();
    items.push({
      dimension,
      basis: "recruiter",
      polarity,
      source_label: "Recruiter assessment",
      summary: note
        ? note
        : `Recruiter assessed ${DIMENSION_LABEL[dimension].toLowerCase()} as ${DIMENSION_VERDICT_LABELS[entry.verdict].toLowerCase()}.`,
    });
  }

  return items;
}

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

export type CandidateAssets = {
  scores?: CandidateScoreRow | null;
  cv?: Partial<CandidateProfile> | null;
  recruiter?: DimensionNotes | null;
};

/**
 * Every dimension-keyed asset for one candidate, in one list.
 *
 * Ordering does not matter to the index — coverage is computed from the
 * strongest basis present, not from position — but measured evidence is
 * emitted first so a UI that truncates shows the best-founded item.
 */
export function extractEvidence(assets: CandidateAssets): EvidenceItem[] {
  return [
    ...fromCandidateScores(assets.scores),
    ...fromRecruiterDimensionNotes(assets.recruiter),
    ...fromFitDimensions(assets.cv?.fit_dimensions),
    ...fromCvProfile(assets.cv),
  ];
}
