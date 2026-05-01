// Recruiter-owned overlay shapes for the Psychology + Culture
// intelligence modules. Stored alongside the AI-generated profiles in
// the same JSONB blobs (cv_structured for candidates, company_context
// for projects) so they survive regenerations and travel with the
// underlying entity.
//
// Convention: AI-generated values are READ-ONLY; everything in this
// module is recruiter-owned. The UI renders both side-by-side so a
// recruiter can see the AI read AND their disagreement.

export type Annotation = {
  /** Free-text observation. */
  note: string;
  /** ISO timestamp of last save. */
  updated_at: string;
};

export type AnnotationMap = Record<string, Annotation>;

export type ConfidenceOverride = {
  /** Recruiter's 0–100 read on the axis confidence. */
  value: number;
  updated_at: string;
};

export type ConfidenceOverrideMap = Record<string, ConfidenceOverride>;

/** Storage keys we use on candidates.cv_structured. */
export const PSYCHOLOGY_KEYS = {
  profile: "psychology",
  notes: "psychology_notes",
  flags: "psychology_flags",
  confidence_overrides: "psychology_confidence_overrides",
  context: "psychology_context",
} as const;

/** Storage keys we use on projects.company_context. */
export const CULTURE_KEYS = {
  profile: "culture_profile",
  notes: "culture_notes",
  flags: "culture_flags",
  context: "culture_context",
} as const;

export function normaliseAnnotationMap(raw: unknown): AnnotationMap {
  if (!raw || typeof raw !== "object") return {};
  const out: AnnotationMap = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!v || typeof v !== "object") continue;
    const obj = v as Partial<Annotation>;
    if (typeof obj.note === "string" && typeof obj.updated_at === "string") {
      out[k] = { note: obj.note, updated_at: obj.updated_at };
    }
  }
  return out;
}

export function normaliseFlagArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((v): v is string => typeof v === "string");
}

export function normaliseConfidenceOverrides(
  raw: unknown
): ConfidenceOverrideMap {
  if (!raw || typeof raw !== "object") return {};
  const out: ConfidenceOverrideMap = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!v || typeof v !== "object") continue;
    const obj = v as Partial<ConfidenceOverride>;
    if (
      typeof obj.value === "number" &&
      Number.isFinite(obj.value) &&
      typeof obj.updated_at === "string"
    ) {
      out[k] = {
        value: Math.max(0, Math.min(100, Math.round(obj.value))),
        updated_at: obj.updated_at,
      };
    }
  }
  return out;
}
