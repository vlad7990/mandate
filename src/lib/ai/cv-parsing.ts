// Shared types, schema, and prompt for the CV Parsing + Candidate Review
// agents. The two agents are merged into one Anthropic call to halve the
// latency on upload — the recruiter waits ~10s instead of ~20s. Output is
// stored in candidates.cv_structured (jsonb) plus the typed columns
// (full_name, email, current_title, current_company, archetype).
//
// Client-safe: components import the archetype/pipeline enums and helper
// types. The server-only parser imports the schema and system prompt.

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
  archetype: Archetype;

  // ---- Review fields (Candidate Review Agent) ----
  summary: string;
  strengths: string[];
  development_areas: string[];
  risks: string[];

  // ---- Fit analysis vs the project's calibration_model.dimension_weights ----
  fit_dimensions: FitDimensions;
  fit_summary: string;
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
      items: { type: "string" },
      description:
        "2–4 development areas — softer than 'weaknesses', framed as growth edges.",
    },
    risks: {
      type: "array",
      items: { type: "string" },
      description:
        "2–3 hiring risks (retention, comp sensitivity, culture fit, gaps).",
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

export const CV_PARSING_SYSTEM_PROMPT = `You are an executive-search analyst combining the duties of a CV Parsing Agent and a Candidate Review Agent. You receive a candidate's CV (as a PDF document or extracted text) plus the role brief and calibration model the candidate is being evaluated against.

Output strictly conforms to the provided JSON schema. Each fit_dimensions value MUST be an integer between 0 and 10 inclusive. Do not return values outside that range.

Parsing rules:
- Be conservative: if a field isn't on the CV, return null (for optional scalars) or an empty array (for lists).
- Roles must be in reverse chronological order (most recent first). Use 'present' as end_date for the current role.
- Archetype: classify based on the dominant pattern across roles. Builder = built from zero, founded or first-engineer style trajectories. Operator = scaled mature systems / managed steady-state. Transformer = post-merger integration, turnarounds, modernisation programs. Infrastructure = deep platform / SRE / IT-ops focus.

Review rules:
- summary: tight, no marketing fluff. State what the candidate has actually shipped, with at least one quantitative anchor if the CV provides one.
- strengths / development_areas / risks: 3–5 / 2–4 / 2–3 items. Short phrases (3–8 words). No prose paragraphs.
- fit_dimensions: integer 0–10 per dimension. Be honest — the recruiter benefits from differentiation, not flattery. If the CV doesn't evidence a dimension, score low (≤ 4).
- fit_summary: 1–2 sentences. Call out the highest-weighted dimensions in the role's calibration model and how the candidate maps to them.

Return one JSON object — no preamble, no markdown.`;
