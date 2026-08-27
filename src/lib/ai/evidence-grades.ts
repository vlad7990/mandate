// §176 — the evidence-grade vocabulary.
//
// The defect class (§175 F-D, F-G; third sighting drive 120): the system
// converts "unattributed / undated / unquantified" into "no evidence of"
// and "significantly below" — flat negative assertions about a NAMED
// PERSON, in documents that go to clients. The scoring table gets it
// right ("cannot substantiate") and the risks arrays, gap headlines and
// pitches then restate it as settled fact.
//
// The fix is structural, the sibling of "illustrative data carries a
// visible label at the point of display": every machine-authored
// negative claim carries its evidence grade, the schema REQUIRES it
// (additionalProperties: false makes an ungraded claim impossible to
// emit), and the render shows it.
//
// Client-safe: renders import the labels and the normaliser.

export const EVIDENCE_GRADES = [
  /** The CV claims it, dated and tied to an employer. */
  "evidenced",
  /** The CV claims it, but undated or tied to no employer. */
  "unattributed",
  /** The CV is silent. NOT the same as "the candidate lacks it". */
  "not_stated",
] as const;
export type EvidenceGrade = (typeof EVIDENCE_GRADES)[number];

export const EVIDENCE_GRADE_LABELS: Record<EvidenceGrade, string> = {
  evidenced: "Evidenced",
  unattributed: "Unattributed",
  not_stated: "Not stated on CV",
};

/** A machine-authored claim with its grade. */
export type GradedClaim = {
  claim: string;
  evidence_grade: EvidenceGrade;
};

/**
 * What storage actually holds. Three authors share these arrays:
 * pre-§176 parses wrote plain strings; §176 parses write GradedClaim
 * objects; and a recruiter editing the list writes plain strings again —
 * deliberately. A manual edit re-authors the list as recruiter-curated,
 * and a human's own judgment does not wear a machine grade (D.3's
 * philosophy: no grade means no machine judgment, which is exactly true
 * of both old rows and human edits).
 */
export type MaybeGraded = string | GradedClaim;

/** The claim's text, whichever author wrote it. */
export function claimText(item: MaybeGraded): string {
  return typeof item === "string" ? item : item.claim;
}

/** The claim's grade, or null for human-authored / pre-§176 items. */
export function claimGrade(item: MaybeGraded): EvidenceGrade | null {
  if (typeof item === "string") return null;
  return (EVIDENCE_GRADES as readonly string[]).includes(item.evidence_grade)
    ? item.evidence_grade
    : null;
}

/**
 * Defensive read for JSONB that has lived through three authors and an
 * escalation retry. Junk entries drop rather than render as
 * "[object Object]".
 */
export function normalizeClaims(
  items: unknown
): { claim: string; grade: EvidenceGrade | null }[] {
  if (!Array.isArray(items)) return [];
  const out: { claim: string; grade: EvidenceGrade | null }[] = [];
  for (const item of items) {
    if (typeof item === "string") {
      if (item.trim()) out.push({ claim: item, grade: null });
      continue;
    }
    if (
      item &&
      typeof item === "object" &&
      typeof (item as GradedClaim).claim === "string" &&
      (item as GradedClaim).claim.trim()
    ) {
      out.push({
        claim: (item as GradedClaim).claim,
        grade: claimGrade(item as GradedClaim),
      });
    }
  }
  return out;
}

/**
 * The JSON-schema item shape for a graded-claim array — one definition,
 * used by every family the ruling names (profile risks and
 * development_areas, psychology watch_outs), so the four schemas cannot
 * drift apart on what a grade is.
 */
export function gradedClaimItemSchema(claimDescription: string) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["claim", "evidence_grade"],
    properties: {
      claim: { type: "string", description: claimDescription },
      evidence_grade: {
        type: "string",
        enum: [...EVIDENCE_GRADES],
        description:
          "evidenced = the CV states it, dated and attributed. unattributed = the CV states it but undated or tied to no employer. not_stated = the CV is silent — which is a fact about the DOCUMENT, never about the person.",
      },
    },
  } as const;
}
