// Client-safe shape + helpers for the recruiter-override layer on a
// candidate. The server action that writes this lives in the candidate
// page's actions.ts; the panel that renders + edits it lives next to
// the page; the ranking / shortlist views read from it via this type.

import type { Tier } from "@/lib/ranking/tiers";
import { DIMENSION_KEYS, type DimensionKey } from "@/lib/ai/onboarding-analysis";

/**
 * A recruiter's read on one calibration dimension.
 *
 * This exists because the recruiter assessment was the richest human input in
 * the system and the least comparable: one `fit_notes` box that speaks about
 * the whole person. The comparison grid could not use it without inferring
 * dimensions from prose, which would manufacture dimension-level judgement out
 * of a sentence that never made one. Asking is honest; inferring is not.
 */
export const DIMENSION_VERDICTS = [
  /** Clear evidence, above what the role needs. */
  "strong",
  /** Meets the bar. */
  "adequate",
  /** Looked, and it is not there. */
  "gap",
  /** Not assessed. The default, and not a judgement. */
  "unknown",
] as const;

export type DimensionVerdict = (typeof DIMENSION_VERDICTS)[number];

export const DIMENSION_VERDICT_LABELS: Record<DimensionVerdict, string> = {
  strong: "Strong",
  adequate: "Adequate",
  gap: "Gap",
  unknown: "Not assessed",
};

export type DimensionNote = {
  verdict: DimensionVerdict;
  note: string;
};

export type DimensionNotes = Partial<Record<DimensionKey, DimensionNote>>;

export const RECRUITER_TIERS = [
  "tier_1",
  "tier_2",
  "tier_3",
  "tier_4",
] as const;

export const PRESENT_DECISIONS = ["yes", "maybe", "no"] as const;
export type PresentDecision = (typeof PRESENT_DECISIONS)[number];

export const PRESENT_DECISION_LABELS: Record<PresentDecision, string> = {
  yes: "Yes — present",
  maybe: "Maybe",
  no: "No — do not present",
};

export type RecruiterAssessment = {
  tier: Tier | null;
  fit_notes: string;
  strengths: string[];
  would_present: PresentDecision | null;
  /** Per-dimension judgement. Absent on every record written before this. */
  dimension_notes: DimensionNotes;
  updated_by: string | null;
  updated_at: string | null;
};

export const EMPTY_RECRUITER_ASSESSMENT: RecruiterAssessment = {
  tier: null,
  fit_notes: "",
  strengths: [],
  would_present: null,
  dimension_notes: {},
  updated_by: null,
  updated_at: null,
};

/**
 * Coerce an unknown JSONB blob from the database into a fully-shaped
 * RecruiterAssessment. Missing fields fall back to the empty value.
 * Tolerant of legacy / partial blobs.
 */
export function normaliseRecruiterAssessment(
  raw: unknown
): RecruiterAssessment {
  if (!raw || typeof raw !== "object") return EMPTY_RECRUITER_ASSESSMENT;
  const obj = raw as Partial<RecruiterAssessment>;

  const tier =
    typeof obj.tier === "string" &&
    (RECRUITER_TIERS as readonly string[]).includes(obj.tier)
      ? (obj.tier as Tier)
      : null;

  const would_present =
    typeof obj.would_present === "string" &&
    (PRESENT_DECISIONS as readonly string[]).includes(obj.would_present)
      ? (obj.would_present as PresentDecision)
      : null;

  const strengths = Array.isArray(obj.strengths)
    ? obj.strengths.filter((s): s is string => typeof s === "string")
    : [];

  return {
    tier,
    fit_notes: typeof obj.fit_notes === "string" ? obj.fit_notes : "",
    strengths,
    would_present,
    dimension_notes: normaliseDimensionNotes(obj.dimension_notes),
    updated_by: typeof obj.updated_by === "string" ? obj.updated_by : null,
    updated_at: typeof obj.updated_at === "string" ? obj.updated_at : null,
  };
}

/**
 * Coerce stored per-dimension notes.
 *
 * A `unknown` verdict with no note is dropped rather than stored: it is the
 * default state of an untouched form, and keeping it would make every
 * candidate look assessed on every dimension.
 */
export function normaliseDimensionNotes(raw: unknown): DimensionNotes {
  if (!raw || typeof raw !== "object") return {};
  const source = raw as Record<string, unknown>;
  const out: DimensionNotes = {};

  for (const key of DIMENSION_KEYS) {
    const value = source[key];
    if (!value || typeof value !== "object") continue;
    const entry = value as Partial<DimensionNote>;

    const verdict =
      typeof entry.verdict === "string" &&
      (DIMENSION_VERDICTS as readonly string[]).includes(entry.verdict)
        ? (entry.verdict as DimensionVerdict)
        : "unknown";
    const note = typeof entry.note === "string" ? entry.note.trim() : "";

    if (verdict === "unknown" && !note) continue;
    out[key] = { verdict, note };
  }

  return out;
}

/** True when the recruiter has filled in any field beyond defaults. */
export function hasRecruiterAssessment(a: RecruiterAssessment): boolean {
  return (
    a.tier != null ||
    a.fit_notes.trim().length > 0 ||
    a.strengths.length > 0 ||
    a.would_present != null ||
    Object.keys(a.dimension_notes).length > 0
  );
}
