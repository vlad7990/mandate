// Client-safe shape + helpers for the recruiter-override layer on a
// candidate. The server action that writes this lives in the candidate
// page's actions.ts; the panel that renders + edits it lives next to
// the page; the ranking / shortlist views read from it via this type.

import type { Tier } from "@/lib/ranking/tiers";

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
  updated_by: string | null;
  updated_at: string | null;
};

export const EMPTY_RECRUITER_ASSESSMENT: RecruiterAssessment = {
  tier: null,
  fit_notes: "",
  strengths: [],
  would_present: null,
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
    updated_by: typeof obj.updated_by === "string" ? obj.updated_by : null,
    updated_at: typeof obj.updated_at === "string" ? obj.updated_at : null,
  };
}

/** True when the recruiter has filled in any field beyond defaults. */
export function hasRecruiterAssessment(a: RecruiterAssessment): boolean {
  return (
    a.tier != null ||
    a.fit_notes.trim().length > 0 ||
    a.strengths.length > 0 ||
    a.would_present != null
  );
}
