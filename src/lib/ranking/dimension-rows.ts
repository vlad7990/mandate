// §196 slice 2 — ONE place that answers "what is this candidate scored
// on, and what did they score?"
//
// Slice 1 let an approved custom dimension move `overall_score` and
// therefore rank and tier. Nine surfaces render that overall beside a
// breakdown of exactly five dimensions, hardcoded by name since
// migration 015. Left alone, every one of them would show a number
// computed from six axes next to five — a measurement the reader cannot
// see, which is the §175 defect class wearing a new hat.
//
// Client-safe (no `server-only`): the leaderboard recomputes in the
// browser, the PDFs render on the server, and both portals sit outside
// the dashboard. One builder, so a chip row and a printed table can
// never disagree about what counted.
//
// WHAT THIS DELIBERATELY DOES NOT DO: it produces no evidence. The
// evidence grid maps parsed CV facts to dimensions through hand-written
// extractors, and `fromCvProfile` already refuses to invent a mapping
// for `regulatory` on the grounds that fabricated coverage is worse
// than honest silence. There is no extractor for "FX options
// market-making depth" and there cannot be a generic one, so the grid
// stays on the five and says so at the point of display.

import {
  DIMENSION_KEYS,
  type CustomDimension,
  type DimensionKey,
  type DimensionWeights,
} from "@/lib/ai/onboarding-analysis";
import { approvedCustomDimensions } from "@/lib/calibration/custom-dimensions";

/** Mono short labels for the five, as the leaderboard has always shown them. */
const CORE_SHORT: Record<DimensionKey, string> = {
  technical: "TECH",
  domain: "DOMAIN",
  leadership: "LEAD",
  regulatory: "REGUL",
  transformation: "XFORM",
};

const CORE_LABEL: Record<DimensionKey, string> = {
  technical: "Technical depth",
  domain: "Domain expertise",
  leadership: "Leadership scale",
  regulatory: "Regulatory exposure",
  transformation: "Transformation",
};

export type DimensionRow = {
  key: string;
  /** Human-readable name for tables and prose. */
  label: string;
  /** Short uppercase label for chips and narrow columns. */
  short: string;
  /** 0–10 calibrated weight, or null when the mandate has no weights yet. */
  weight: number | null;
  /**
   * 0–10 score, or null when this candidate was NEVER ASSESSED on the
   * axis — parsed before it was approved, or while it was still only
   * proposed. Null is not zero and must never be rendered as zero.
   */
  score: number | null;
  isCustom: boolean;
};

export type CoreScoreRow = {
  technical_score: number | null;
  domain_score: number | null;
  leadership_score: number | null;
  regulatory_score: number | null;
  transformation_score: number | null;
};

const CORE_FIELD: Record<DimensionKey, keyof CoreScoreRow> = {
  technical: "technical_score",
  domain: "domain_score",
  leadership: "leadership_score",
  regulatory: "regulatory_score",
  transformation: "transformation_score",
};

function readScore(raw: unknown): number | null {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return null;
  return Math.max(0, Math.min(10, Math.round(raw)));
}

/**
 * Every axis this mandate scores on, in display order: the five core
 * dimensions first — they are the spine and their order is load-bearing
 * across six documents — then approved custom axes in their stored order.
 *
 * Proposed dimensions are absent by construction: this reads through
 * `approvedCustomDimensions`, the single gate. A surface that renders
 * what this returns cannot accidentally show an unapproved axis.
 */
export function buildDimensionRows(args: {
  calibration: { dimension_weights?: DimensionWeights; custom_dimensions?: unknown } | null | undefined;
  core: CoreScoreRow | null | undefined;
  /** `candidate_scores.custom_scores`, or a profile's custom_fit_dimensions. */
  customScores?: Record<string, unknown> | null;
}): DimensionRow[] {
  const weights = args.calibration?.dimension_weights ?? null;
  const rows: DimensionRow[] = DIMENSION_KEYS.map((key) => ({
    key,
    label: CORE_LABEL[key],
    short: CORE_SHORT[key],
    weight: weights ? readScore(weights[key]) : null,
    score: args.core ? readScore(args.core[CORE_FIELD[key]]) : null,
    isCustom: false,
  }));

  const custom = approvedCustomDimensions(args.calibration);
  const scores = args.customScores ?? {};
  for (const dim of custom) {
    rows.push({
      key: dim.key,
      label: dim.label,
      short: shortLabelFor(dim),
      weight: dim.weight,
      score: readScore(scores[dim.key]),
      isCustom: true,
    });
  }

  return rows;
}

/**
 * A chip-sized label for a custom axis. Derived from the first words of
 * the label rather than the slug, because the slug is truncated at 36
 * chars and can stop mid-word — fine as an identifier, poor as a column
 * heading a hiring manager reads.
 */
export function shortLabelFor(dim: Pick<CustomDimension, "key" | "label">): string {
  const words = dim.label
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return dim.key.slice(0, 8).toUpperCase();
  const first = words[0];
  if (first.length >= 6 || words.length === 1) return first.slice(0, 8);
  return `${first} ${words[1]}`.slice(0, 11);
}

/** The axes this candidate carries no score for. Drives the disclosure. */
export function unassessedRows(rows: readonly DimensionRow[]): DimensionRow[] {
  return rows.filter((r) => r.score === null);
}

/**
 * One sentence naming what a displayed overall score did NOT measure, or
 * null when it measured everything. Every surface that prints an overall
 * beside a breakdown uses this, so the disclosure is worded identically
 * on screen, on paper, in both portals and in an email.
 *
 * Worded as a fact about the ASSESSMENT, never about the person: "not
 * assessed on X" — never "lacks X", which is the claim the system is not
 * entitled to make.
 */
export function unassessedSentence(
  rows: readonly DimensionRow[]
): string | null {
  const missing = unassessedRows(rows).filter((r) => r.isCustom);
  if (missing.length === 0) return null;
  const names = missing.map((r) => r.label);
  const list =
    names.length === 1
      ? names[0]
      : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return `Not assessed on ${list} — this score is calculated from the remaining dimensions, and the unassessed ${
    missing.length === 1 ? "axis is" : "axes are"
  } excluded rather than counted as zero.`;
}

/**
 * True when the mandate scores on anything beyond the five. Surfaces use
 * it to decide whether a "core five only" caveat is worth printing —
 * on a mandate with no custom axes the caveat would be noise.
 */
export function hasCustomDimensions(
  calibration: { custom_dimensions?: unknown } | null | undefined
): boolean {
  return approvedCustomDimensions(calibration).length > 0;
}
