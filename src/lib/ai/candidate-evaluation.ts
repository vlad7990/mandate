// Schema, types, and prompt for the Candidate Evaluation Agent.
//
// This is the second pass on a candidate — the first pass (CV Parsing +
// Candidate Review) extracts the structured profile and per-dimension fit
// scores. This pass synthesises an *executive evaluation report* —
// effectively the dossier a search firm would hand to a hiring manager:
// scoring with commentary, role-alignment test, gaps, comparison vs the
// rest of the project's slate, final verdict, and the exact language a
// recruiter can use to position the candidate to the client.
//
// Client-safe: components import the types and labels. The server-only
// runner (`src/lib/ai/generate-evaluation.ts`) imports the schema +
// system prompt for the Anthropic call. The result is persisted at
// `cv_structured.evaluation` (we add it to the existing JSONB column
// rather than a new table — a candidate has exactly one current
// evaluation, and the evaluation is a function of the candidate +
// project state at the time it was generated).

import {
  DIMENSION_KEYS,
  type DimensionKey,
} from "./onboarding-analysis";

// ────────────────────────────────────────────────────────────────────────
// Vocabularies
// ────────────────────────────────────────────────────────────────────────

export const ALIGNMENT_LIGHTS = ["green", "amber", "red"] as const;
export type AlignmentLight = (typeof ALIGNMENT_LIGHTS)[number];

export const ALIGNMENT_LIGHT_LABELS: Record<AlignmentLight, string> = {
  green: "Green",
  amber: "Amber",
  red: "Red",
};

export const VERDICT_TIERS = [
  "tier_1",
  "tier_2",
  "tier_3",
  "tier_4",
] as const;
export type VerdictTier = (typeof VERDICT_TIERS)[number];

export const VERDICT_TIER_LABELS: Record<VerdictTier, string> = {
  tier_1: "Tier 1 · Strong Fit",
  tier_2: "Tier 2 · Solid Fit",
  tier_3: "Tier 3 · Stretch Fit",
  tier_4: "Tier 4 · Off Profile",
};

export const RECOMMENDATIONS = [
  "primary",
  "secondary",
  "do_not_include",
] as const;
export type Recommendation = (typeof RECOMMENDATIONS)[number];

export const RECOMMENDATION_LABELS: Record<Recommendation, string> = {
  primary: "Primary",
  secondary: "Secondary",
  do_not_include: "Do Not Include",
};

// ────────────────────────────────────────────────────────────────────────
// Report shape
// ────────────────────────────────────────────────────────────────────────

export type DimensionRow = {
  dimension: DimensionKey;
  /** Integer 0–10 — copied from the candidate's fit_dimensions. */
  score: number;
  /** Integer 0–10 — copied from the project's calibration weights. */
  weight: number;
  /** 1–2 sentence AI commentary on this specific score. */
  commentary: string;
};

export type ProfileSummary = {
  /** 2–3 sentence executive synthesis. Reads like the top of a search firm's email. */
  executive_summary: string;
  /** 4–6 short factual bullets — "led X reports", "shipped Y", etc. No prose. */
  background_bullets: string[];
};

export type AlignmentTest = {
  /** Single sharp question the search committee would ask first. */
  question: string;
  /** Direct answer in candidate's voice / from CV evidence — 2–3 sentences. */
  answer: string;
  /** Red/Amber/Green RAG. */
  light: AlignmentLight;
  /** 1 sentence justifying the RAG colour. */
  justification: string;
};

export type StrengthBlock = {
  /** Short headline phrase — 4–8 words. */
  headline: string;
  /** 2–3 sentence elaboration with concrete evidence from the CV. */
  detail: string;
  /** 1 sentence on what this signals about likely on-the-job behaviour. */
  signal: string;
};

export type GapBlock = {
  /** Short headline — 4–8 words. */
  headline: string;
  /** 2–3 sentence explanation of the gap as observed in the CV. */
  detail: string;
  /** 1 sentence on how this mismatches the role's must-haves. */
  role_mismatch: string;
};

export type CompetitorRow = {
  /** Must match a candidate id from the project's slate. */
  candidate_id: string;
  full_name: string;
  /** Tier label string copied from the comparison input (e.g. "Tier 1"). */
  tier_label: string;
  /** This candidate vs the competitor — 1 sentence trade-off summary. */
  vs_summary: string;
  /** "ahead" / "behind" / "even" relative to the subject candidate. */
  direction: "ahead" | "behind" | "even";
};

export type ComparisonPanel = {
  /** 1–2 sentence framing of where this candidate sits in the slate. */
  positioning: string;
  /** Up to 3 competitor rows. Empty array when there is no slate to compare against. */
  competitors: CompetitorRow[];
};

export type FinalVerdict = {
  tier: VerdictTier;
  /** 2–3 sentence narrative tying the verdict back to weighted dimensions. */
  narrative: string;
};

export type Positioning = {
  /** The opening line for the recruiter's outreach to the client. */
  opener: string;
  /** 2–3 talking points the recruiter can hit verbatim. */
  talking_points: string[];
  /** 1 sentence on a likely client objection and how to handle it. */
  objection_handling: string;
};

export type CandidateEvaluation = {
  /** Schema version — bump when shape changes so older reports can be regenerated. */
  schema_version: 1;
  /** ISO timestamp the report was generated. */
  generated_at: string;
  /** Snapshot of the role title at generation time (for export contexts). */
  role_title: string;
  /** Snapshot of the company name at generation time. */
  company_name: string;
  scoring_table: DimensionRow[];
  profile_summary: ProfileSummary;
  alignment_test: AlignmentTest;
  /** 3–4 numbered strength blocks. */
  strengths: StrengthBlock[];
  /** 1–3 gap blocks. */
  gaps: GapBlock[];
  comparison: ComparisonPanel;
  final_verdict: FinalVerdict;
  positioning: Positioning;
  recommendation: Recommendation;
  /** 1 sentence justifying the recommendation. */
  recommendation_rationale: string;
};

// ────────────────────────────────────────────────────────────────────────
// JSON schema for Anthropic's structured-output mode
// ────────────────────────────────────────────────────────────────────────

const dimensionEnum = [...DIMENSION_KEYS] as string[];

export const CANDIDATE_EVALUATION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "scoring_table",
    "profile_summary",
    "alignment_test",
    "strengths",
    "gaps",
    "comparison",
    "final_verdict",
    "positioning",
    "recommendation",
    "recommendation_rationale",
  ],
  properties: {
    scoring_table: {
      type: "array",
      // Anthropic structured output rejects minItems > 1 AND maxItems
      // entirely. Counts (exactly 5 rows here) are enforced by the
      // system prompt's "Array length discipline" block.
      items: {
        type: "object",
        additionalProperties: false,
        required: ["dimension", "score", "weight", "commentary"],
        properties: {
          dimension: { type: "string", enum: dimensionEnum },
          // Anthropic structured output doesn't support `minimum` /
          // `maximum` on integer fields. The 0–10 bound is enforced by
          // the system prompt's "Numeric bounds" block.
          score: { type: "integer" },
          weight: { type: "integer" },
          commentary: { type: "string" },
        },
      },
      description:
        "One row per calibration dimension (technical, domain, leadership, regulatory, transformation). Use the candidate's existing fit_dimensions for `score` and the project's calibration_model.dimension_weights for `weight`. `commentary` is 1–2 sentences explaining the score using concrete CV evidence.",
    },
    profile_summary: {
      type: "object",
      additionalProperties: false,
      required: ["executive_summary", "background_bullets"],
      properties: {
        executive_summary: {
          type: "string",
          description:
            "2–3 sentences. Reads like the top of a search-firm email. State who the candidate is, what they ship, and the implicit ask.",
        },
        background_bullets: {
          type: "array",
          // Counts (3–6) enforced by the system prompt; schema can't
          // express minItems > 1 or maxItems.
          items: { type: "string" },
          description:
            "3–6 short factual bullets. Each bullet 6–14 words. Quote concrete numbers from the CV (scope, scale, tenure).",
        },
      },
    },
    alignment_test: {
      type: "object",
      additionalProperties: false,
      required: ["question", "answer", "light", "justification"],
      properties: {
        question: {
          type: "string",
          description:
            "The single sharpest question a hiring manager would ask first. Phrased as a question. References a specific must-have from the role.",
        },
        answer: {
          type: "string",
          description:
            "2–3 sentences answering the question using CV evidence. If evidence is thin, say so directly.",
        },
        light: { type: "string", enum: [...ALIGNMENT_LIGHTS] },
        justification: {
          type: "string",
          description:
            "1 sentence on why this RAG colour. Green = strong CV evidence, Amber = partial / adjacent, Red = absent or contradicted.",
        },
      },
    },
    strengths: {
      type: "array",
      // Counts (3–4) enforced by the system prompt; schema can't
      // express minItems > 1 or maxItems.
      items: {
        type: "object",
        additionalProperties: false,
        required: ["headline", "detail", "signal"],
        properties: {
          headline: { type: "string" },
          detail: { type: "string" },
          signal: {
            type: "string",
            description:
              "1 sentence on the on-the-job behaviour this strength predicts.",
          },
        },
      },
      description:
        "3–4 numbered strengths. Each strength has a 4–8 word headline, 2–3 sentence detail with CV evidence, and a 1-sentence signal/conclusion.",
    },
    gaps: {
      type: "array",
      // Counts (1–3) enforced by the system prompt only — Anthropic
      // structured output supports `minItems` of 0 or 1, but for
      // consistency every array constraint lives in the prompt.
      items: {
        type: "object",
        additionalProperties: false,
        required: ["headline", "detail", "role_mismatch"],
        properties: {
          headline: { type: "string" },
          detail: { type: "string" },
          role_mismatch: {
            type: "string",
            description:
              "1 sentence framing the gap relative to a specific role must-have.",
          },
        },
      },
      description:
        "1–3 critical gaps. If there are no real gaps, return one item that flags the most likely objection a hiring manager will raise.",
    },
    comparison: {
      type: "object",
      additionalProperties: false,
      required: ["positioning", "competitors"],
      properties: {
        positioning: {
          type: "string",
          description:
            "1–2 sentences on where this candidate sits in the slate. If the slate has no other ranked candidates, say so plainly.",
        },
        competitors: {
          type: "array",
          // maxItems (3) enforced by the system prompt only.
          items: {
            type: "object",
            additionalProperties: false,
            required: [
              "candidate_id",
              "full_name",
              "tier_label",
              "vs_summary",
              "direction",
            ],
            properties: {
              candidate_id: { type: "string" },
              full_name: { type: "string" },
              tier_label: { type: "string" },
              vs_summary: { type: "string" },
              direction: {
                type: "string",
                enum: ["ahead", "behind", "even"],
              },
            },
          },
          description:
            "Up to 3 competitor rows from the input slate. Use the candidate_id values as supplied. Empty array when no slate is provided.",
        },
      },
    },
    final_verdict: {
      type: "object",
      additionalProperties: false,
      required: ["tier", "narrative"],
      properties: {
        tier: { type: "string", enum: [...VERDICT_TIERS] },
        narrative: {
          type: "string",
          description:
            "2–3 sentences. Tie the verdict to the highest-weighted dimensions and the alignment test result. No hedging.",
        },
      },
    },
    positioning: {
      type: "object",
      additionalProperties: false,
      required: ["opener", "talking_points", "objection_handling"],
      properties: {
        opener: {
          type: "string",
          description:
            "The opening sentence the recruiter can paste into an email to the client. Plain prose, no greeting.",
        },
        talking_points: {
          type: "array",
          // Counts (2–3) enforced by the system prompt only.
          items: { type: "string" },
          description:
            "2–3 talking points. Each is a complete sentence the recruiter can say verbatim.",
        },
        objection_handling: {
          type: "string",
          description:
            "1 sentence anticipating the most likely client objection and the recruiter's response.",
        },
      },
    },
    recommendation: { type: "string", enum: [...RECOMMENDATIONS] },
    recommendation_rationale: {
      type: "string",
      description:
        "1 sentence on why primary / secondary / do not include — must align with the final_verdict tier.",
    },
  },
} as const;

// ────────────────────────────────────────────────────────────────────────
// System prompt
// ────────────────────────────────────────────────────────────────────────

export const CANDIDATE_EVALUATION_SYSTEM_PROMPT = `You are an executive-search evaluation analyst preparing a written dossier for a hiring manager. You receive the structured candidate profile, the role's calibration model and weights, the company context, and (when available) up to three other ranked candidates from the same project's slate. You produce a single executive evaluation report.

Output strictly conforms to the provided JSON schema. No preamble. No markdown inside string values. Plain prose, single paragraph per field unless the field is explicitly a list.

Array length discipline (the schema cannot enforce these counts, so YOU must):
- scoring_table: provide EXACTLY 5 rows — one per dimension (technical, domain, leadership, regulatory, transformation). No more, no fewer.
- profile_summary.background_bullets: provide AT LEAST 3 and at most 6 bullets.
- strengths: provide AT LEAST 3 and at most 4 strength blocks.
- gaps: provide AT LEAST 1 and at most 3 gap blocks. If you genuinely cannot find a gap, return one item that flags the most likely hiring-manager objection.
- positioning.talking_points: provide AT LEAST 2 and at most 3 talking points.
- comparison.competitors: 0 to 3 rows — empty array when no slate is provided.
A response that under-fills or over-fills any of these arrays is invalid; revise before returning.

Numeric bounds (the schema cannot enforce these either, so YOU must):
- scoring_table[*].score: integer 0–10 inclusive. Do not return values outside this range.
- scoring_table[*].weight: integer 0–10 inclusive. Mirror the project's calibration_model.dimension_weights exactly.

Style rules:
- Be direct. The recruiter is reading this to make a go/no-go call, not to feel reassured.
- Quote concrete numbers from the CV when they exist (scope, scale, tenure, deal sizes). If they don't, don't invent.
- Reference the role's most heavily-weighted dimensions explicitly in the executive summary, alignment test, and final verdict.
- Each strength and gap must cite at least one specific role, company, or program from the candidate's CV.
- The alignment-test question must be sharper than "is this candidate qualified?". It probes a specific must-have or anti-pattern from the calibration model.

RAG-light rules:
- Green: the CV provides direct, recent, multiple-instance evidence for the must-have.
- Amber: evidence is partial, adjacent, or older than 5 years.
- Red: evidence is absent or the CV shows the opposite pattern.

Tier rules (final_verdict.tier):
- tier_1: weighted overall ≥ 8 AND alignment-light is green AND no critical gaps.
- tier_2: weighted overall 6–7.99 OR (≥ 8 with one amber dimension), with addressable gaps.
- tier_3: weighted overall 4–5.99 — stretch fit, only if the recruiter can credibly position the gaps.
- tier_4: weighted overall < 4 OR alignment-light is red — off profile.

Recommendation rules:
- primary: tier_1 only.
- secondary: tier_2.
- do_not_include: tier_3 or tier_4.

Comparison rules:
- Use only the candidate_ids supplied in the input. Never invent ids.
- "ahead"/"behind"/"even" is relative to the subject candidate.
- If the input slate has no other candidates, set comparison.competitors to [] and say so in comparison.positioning.

Return one JSON object — no preamble.`;
