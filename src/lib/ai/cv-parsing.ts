// Shared types, schema, and prompt for the CV Parsing + Candidate Review
// agents. The two agents are merged into one Anthropic call to halve the
// latency on upload — the recruiter waits ~10s instead of ~20s. Output is
// stored in candidates.cv_structured (jsonb) plus the typed columns
// (full_name, email, current_title, current_company, archetype).
//
// Client-safe: components import the archetype/pipeline enums and helper
// types. The server-only parser imports the schema and system prompt.

import {
  gradedClaimItemSchema,
  type MaybeGraded,
} from "./evidence-grades";

export const ARCHETYPES = [
  "Builder",
  "Operator",
  "Transformer",
  "Infrastructure",
] as const;
export type Archetype = (typeof ARCHETYPES)[number];

export const PIPELINE_STAGES = [
  "found",
  "reviewed",
  "matched",
  "shortlisted",
  "submitted",
  "interviewed",
  "passed_rounds",
  "finalist",
  "offer",
  "hired",
  "rejected",
  // Set by the candidate's own hand through the token portal (073) —
  // a withdrawal recorded as a rejection would be a lie. Mirrored in
  // the candidates_pipeline_stage_check constraint; change both.
  "withdrawn",
] as const;
export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export const PIPELINE_LABELS: Record<PipelineStage, string> = {
  found: "Found",
  reviewed: "Reviewed",
  matched: "Matched",
  shortlisted: "Shortlisted",
  submitted: "Submitted",
  interviewed: "Interviewed",
  passed_rounds: "Passed Rounds",
  finalist: "Finalist",
  offer: "Offer",
  hired: "Hired",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
};

export type CandidateRole = {
  title: string;
  company: string;
  start_date: string;
  end_date: string;
  summary: string;
};

/**
 * §180 (F-H). Objects rather than strings because the INSTITUTION is
 * what a hiring manager asks about — "MBA, Finance — Kharkiv State
 * University of Food & Trade Technology" loses its point if flattened.
 * Every field but the degree is nullable: CVs routinely omit the year,
 * and a required year is an invitation to invent one.
 */
export type EducationEntry = {
  degree: string;
  field: string | null;
  institution: string | null;
  year: string | null;
};

export type FitDimensions = {
  technical: number;
  domain: number;
  leadership: number;
  regulatory: number;
  transformation: number;
};

export type CandidateProfile = {
  // ---- Parser fields ----
  full_name: string;
  email: string | null;
  linkedin_url: string | null;
  current_title: string | null;
  current_company: string | null;
  location: string | null;
  years_experience: number | null;
  roles: CandidateRole[];
  domain: string;
  scale: string;
  tech_exposure: string[];
  transformation_experience: string[];
  /** §180 (F-H). Empty array when the CV states none — never absent. */
  education: EducationEntry[];
  certifications: string[];
  archetype: Archetype;

  // ---- Review fields (Candidate Review Agent) ----
  summary: string;
  strengths: string[];
  /** §176 — machine-authored negative claims carry their evidence grade.
   * Strings still appear here: pre-§176 rows, and recruiter edits (a
   * manual edit re-authors the list; a human's judgment wears no
   * machine grade). Read through normalizeClaims/claimText. */
  development_areas: MaybeGraded[];
  risks: MaybeGraded[];

  // ---- Fit analysis vs the project's calibration_model.dimension_weights ----
  fit_dimensions: FitDimensions;
  fit_summary: string;
  /**
   * §196 — scores for the mandate's APPROVED custom dimensions, keyed by
   * slug. Absent on every profile parsed before this slice, and absent
   * on any mandate carrying no approved custom dimensions — which is the
   * normal case. Never read this directly; the scoring engine reconciles
   * it against the mandate's current approved list, because a profile
   * can carry a score for a dimension that has since been removed.
   */
  custom_fit_dimensions?: Record<string, number>;
};

export const EMPTY_PROFILE: Partial<CandidateProfile> = {};

export const CANDIDATE_PROFILE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "full_name",
    "email",
    "linkedin_url",
    "current_title",
    "current_company",
    "location",
    "years_experience",
    "roles",
    "domain",
    "scale",
    "tech_exposure",
    "transformation_experience",
    // §180 (F-H): REQUIRED, not optional. An optional field lets the
    // model skip the question; a required empty array is the
    // honest-absence shape the rest of this schema already uses.
    "education",
    "certifications",
    "archetype",
    "summary",
    "strengths",
    "development_areas",
    "risks",
    "fit_dimensions",
    "fit_summary",
  ],
  properties: {
    full_name: {
      type: "string",
      description: "Candidate's full legal name as it appears on the CV.",
    },
    email: {
      type: ["string", "null"],
      description: "Primary email if the CV lists one. Null otherwise.",
    },
    linkedin_url: {
      type: ["string", "null"],
      description:
        "LinkedIn profile URL if listed. Normalise to https://linkedin.com/in/<handle>. Null if absent.",
    },
    current_title: {
      type: ["string", "null"],
      description: "Current role title.",
    },
    current_company: {
      type: ["string", "null"],
      description: "Current employer name.",
    },
    location: {
      type: ["string", "null"],
      description: "City, country (e.g. 'London, UK').",
    },
    years_experience: {
      type: ["number", "null"],
      description: "Total years of professional experience as a single number.",
    },
    roles: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "company", "start_date", "end_date", "summary"],
        properties: {
          title: { type: "string" },
          company: { type: "string" },
          start_date: {
            type: "string",
            description: "Start date as 'YYYY-MM' or 'YYYY' if month not given.",
          },
          end_date: {
            type: "string",
            description: "'YYYY-MM' / 'YYYY' or 'present' for the current role.",
          },
          summary: {
            type: "string",
            description:
              "1–2 sentence summary of impact in this role. No bullet points.",
          },
        },
      },
      description:
        "Past + current roles in reverse chronological order. Most-recent first.",
    },
    domain: {
      type: "string",
      description:
        "Industry / sector summary (e.g. 'B2B SaaS · Fintech · Payments').",
    },
    scale: {
      type: "string",
      description:
        "Scale of operations the candidate has been responsible for, in plain prose (e.g. '120 reports, $40M opex').",
    },
    tech_exposure: {
      type: "array",
      items: { type: "string" },
      description:
        "Concrete technologies the candidate has worked with (frameworks, cloud platforms, languages).",
    },
    transformation_experience: {
      type: "array",
      items: { type: "string" },
      description:
        "Specific change-management / transformation experiences (M&A integrations, turnarounds, rebuilds).",
    },
    education: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["degree", "field", "institution", "year"],
        properties: {
          degree: {
            type: "string",
            description: "The qualification as written (e.g. 'MBA', 'BSc', 'PhD').",
          },
          field: {
            type: ["string", "null"],
            description: "Subject, if stated (e.g. 'Finance'). Null otherwise.",
          },
          institution: {
            type: ["string", "null"],
            description:
              "Awarding institution exactly as written on the CV. Null if not stated. Never abbreviate or normalise it.",
          },
          year: {
            type: ["string", "null"],
            description:
              "Year of award as written. Null if the CV does not state one — do NOT infer it from anything else.",
          },
        },
      },
      description:
        "Degrees and academic qualifications, most senior first. Empty array if the CV lists none.",
    },
    certifications: {
      type: "array",
      items: { type: "string" },
      description:
        "Professional certifications exactly as written (e.g. 'PMI – IPMA – Level A Certified', 'Certified Scrum Master'). Keep the issuer inside the string as the CV presents it — do not split it out. Empty array if the CV lists none.",
    },
    archetype: {
      type: "string",
      enum: [...ARCHETYPES],
      description:
        "Builder = built from zero. Operator = scaled established systems. Transformer = post-merger / turnaround. Infrastructure = deep platform / SRE.",
    },
    summary: {
      type: "string",
      description:
        "2–3 sentence executive synthesis of who this candidate is and what they've shipped.",
    },
    strengths: {
      type: "array",
      items: { type: "string" },
      description: "3–5 short strengths (3–6 words each).",
    },
    development_areas: {
      type: "array",
      items: gradedClaimItemSchema(
        "One development area — softer than a 'weakness', framed as a growth edge."
      ),
      description: "2–4 development areas, each carrying its evidence grade.",
    },
    risks: {
      type: "array",
      items: gradedClaimItemSchema(
        "One hiring risk (retention, comp sensitivity, culture fit, gaps). State what the CV supports; a gap in the DOCUMENT is phrased as what the CV does not state, never as a deficit of the person."
      ),
      description: "2–3 hiring risks, each carrying its evidence grade.",
    },
    fit_dimensions: {
      type: "object",
      additionalProperties: false,
      required: [
        "technical",
        "domain",
        "leadership",
        "regulatory",
        "transformation",
      ],
      properties: {
        technical: { type: "integer" },
        domain: { type: "integer" },
        leadership: { type: "integer" },
        regulatory: { type: "integer" },
        transformation: { type: "integer" },
      },
      description:
        "Per-dimension fit score, integer 0–10. These mirror the project's calibration_model.dimension_weights so the recruiter can compute a weighted overall score.",
    },
    fit_summary: {
      type: "string",
      description:
        "1–2 sentence narrative on overall fit vs the role brief. Reference the highest-weighted dimensions explicitly.",
    },
  },
} as const;

// ────────────────────────────────────────────────────────────────────────
// §196 — the parse schema becomes a FUNCTION of the mandate.
//
// CANDIDATE_PROFILE_SCHEMA above is `additionalProperties: false` at
// every level, deliberately: it is what stops the model inventing fields
// (and, per the prompt, what stops a phone number being smuggled into
// the profile). That strictness is the reason custom dimensions cannot
// simply be appended to `fit_dimensions` — the model would be refused.
//
// So instead of loosening the schema for everyone, the schema is BUILT
// per call from the mandate's approved dimensions. The model is handed
// the exact keys it is permitted to score and no others, which keeps the
// closed-world guarantee intact while making the world mandate-shaped.
//
// When a mandate has no approved custom dimensions — the common case —
// the field is not merely empty, it is ABSENT. The model is never told
// the concept exists, and the returned schema is byte-identical to the
// constant above. Nothing changes for the mandates that don't need this.
// ────────────────────────────────────────────────────────────────────────

export type CustomDimensionForParse = {
  key: string;
  label: string;
  definition: string;
};

export function buildCandidateProfileSchema(
  customDimensions: readonly CustomDimensionForParse[] = []
): Record<string, unknown> {
  if (customDimensions.length === 0) {
    return CANDIDATE_PROFILE_SCHEMA as unknown as Record<string, unknown>;
  }

  const properties: Record<string, unknown> = {};
  for (const dim of customDimensions) {
    properties[dim.key] = {
      type: "integer",
      description: `${dim.label} — ${dim.definition}`,
    };
  }

  const base = CANDIDATE_PROFILE_SCHEMA as unknown as {
    required: readonly string[];
    properties: Record<string, unknown>;
  };

  return {
    ...CANDIDATE_PROFILE_SCHEMA,
    // Required, on the §180 (F-H) precedent: an optional field lets the
    // model skip the question, and a skipped custom dimension is a
    // candidate silently excluded from an axis the recruiter approved.
    required: [...base.required, "custom_fit_dimensions"],
    properties: {
      ...base.properties,
      custom_fit_dimensions: {
        type: "object",
        additionalProperties: false,
        required: customDimensions.map((d) => d.key),
        properties,
        description:
          "Role-specific scoring axes for THIS mandate, integer 0–10 each, scored against the definition given for each key. Score these exactly as honestly as fit_dimensions: if the CV does not evidence the axis, score low (≤ 4) rather than guessing generously.",
      },
    },
  };
}

export const CV_PARSING_SYSTEM_PROMPT = `You are an executive-search analyst combining the duties of a CV Parsing Agent and a Candidate Review Agent. You receive a candidate's CV (as a PDF document or extracted text) plus the role brief and calibration model the candidate is being evaluated against.

Output strictly conforms to the provided JSON schema. Each fit_dimensions value MUST be an integer between 0 and 10 inclusive. Do not return values outside that range.

Parsing rules:
- Be conservative: if a field isn't on the CV, return null (for optional scalars) or an empty array (for lists).
- The role context includes run_date — the date this parse is executing. ALL elapsed-time arithmetic ("N years of experience", "M years since X") MUST be computed against run_date, never against your own sense of today's date. If a role says "2017 - Present" and run_date is 2026, that is nine years, not whatever your training data suggests.
- Every risk and development_area is an object carrying an evidence_grade. Grade honestly: evidenced = the CV states it, dated and attributed; unattributed = stated but undated or tied to no employer; not_stated = the CV is silent. A not_stated claim must be WORDED as a fact about the document ("the CV does not state team size"), never as a fact about the person ("team size below requirements").
- Roles must be in reverse chronological order (most recent first). Use 'present' as end_date for the current role.
- education / certifications: transcribe what the CV states. Keep the institution exactly as written — never abbreviate, translate or "correct" it. If the CV gives no year, return null rather than inferring one from the surrounding dates. Return an empty array only when the CV genuinely lists none.
- NEVER return a telephone number, in any field. The candidate's phone is theirs to give, not ours to take from a document a recruiter may have uploaded without them. There is deliberately no field for it in this schema; do not smuggle one into location, summary or any other string.
- Archetype: classify based on the dominant pattern across roles. Builder = built from zero, founded or first-engineer style trajectories. Operator = scaled mature systems / managed steady-state. Transformer = post-merger integration, turnarounds, modernisation programs. Infrastructure = deep platform / SRE / IT-ops focus.

Review rules:
- summary: tight, no marketing fluff. State what the candidate has actually shipped, with at least one quantitative anchor if the CV provides one.
- strengths / development_areas / risks: 3–5 / 2–4 / 2–3 items. Short phrases (3–8 words). No prose paragraphs.
- fit_dimensions: integer 0–10 per dimension. Be honest — the recruiter benefits from differentiation, not flattery. If the CV doesn't evidence a dimension, score low (≤ 4).
- custom_fit_dimensions: present in the schema ONLY when this mandate carries role-specific scoring axes; when it is absent, there is nothing to do. When present, score each key against the definition supplied with it, on the same 0–10 scale and to the same standard as fit_dimensions. Score the definition you were given, not your own sense of what the label ought to mean. A CV silent on the axis scores low — never infer the experience from an adjacent one.
- fit_summary: 1–2 sentences. Call out the highest-weighted dimensions in the role's calibration model and how the candidate maps to them.

Return one JSON object — no preamble, no markdown.`;
