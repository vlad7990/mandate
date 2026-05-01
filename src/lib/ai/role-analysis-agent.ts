// Role Analysis Agent — focused comparison of 2-5 candidates against
// the project's calibration model.
//
// Distinct from generate-comparison.ts (the side-by-side trade-off
// panel on the ranking page, capped at 3 candidates and shaped for
// "stronger/weaker callouts"). This agent is invoked from the project
// page after the recruiter selects a working set of candidates and
// asks "rank these for me, against THIS role". Output:
//   * a ranked order of the supplied candidates,
//   * key differentiators across the set,
//   * a single recommendation sentence the recruiter can act on.
//
// Client-safe: types only. The server-only runner imports the schema
// + system prompt for the Anthropic call.

import type { CandidateProfile } from "./cv-parsing";
import type { CalibrationModel } from "./role-analysis";

export const ROLE_ANALYSIS_MIN = 2;
export const ROLE_ANALYSIS_MAX = 5;

export type RoleAnalysisInputCandidate = {
  candidate_id: string;
  full_name: string;
  current_title: string | null;
  current_company: string | null;
  archetype: string | null;
  /** This project's score for the candidate when one exists. */
  rank: number | null;
  overall_score: number | null;
  tier: string | null;
  /** A trimmed slice of the parsed profile. */
  profile: Partial<CandidateProfile>;
  /** Recruiter's own read, when present. */
  recruiter_tier: string | null;
  recruiter_present: "yes" | "maybe" | "no" | null;
};

export type RoleAnalysisInput = {
  role_title: string;
  company_name: string;
  calibration: Partial<CalibrationModel>;
  candidates: RoleAnalysisInputCandidate[];
};

export type RoleAnalysisRanked = {
  candidate_id: string;
  /** 1-indexed position within this set. */
  rank: number;
  /** 1-sentence rationale for placing the candidate at this rank. */
  rationale: string;
};

export type RoleAnalysisDifferentiator = {
  /** Short topic — 1-3 words. */
  topic: string;
  /** 1 sentence on what splits the field along this axis. */
  detail: string;
  /** Optional candidate_id this differentiator most strongly applies to. */
  leading_candidate_id?: string;
};

export type RoleAnalysisRecommendation = {
  /** "advance" | "split" | "hold" — one-word disposition. */
  disposition: "advance" | "split" | "hold";
  /** 1–2 sentences. The action the recruiter should take next. */
  detail: string;
  /** Up to 3 candidate_ids the recruiter should put in front of the client first. */
  primary_candidate_ids: string[];
};

export type RoleAnalysisResult = {
  /** 1–2 sentence executive synthesis specific to THIS role. */
  synthesis: string;
  ranked: RoleAnalysisRanked[];
  differentiators: RoleAnalysisDifferentiator[];
  recommendation: RoleAnalysisRecommendation;
};

export const ROLE_ANALYSIS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["synthesis", "ranked", "differentiators", "recommendation"],
  properties: {
    synthesis: {
      type: "string",
      description:
        "1–2 sentences. Open with the dominant calibration weight(s) for the role and the line that best contrasts the supplied candidates against that lens.",
    },
    ranked: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["candidate_id", "rank", "rationale"],
        properties: {
          candidate_id: { type: "string" },
          rank: { type: "integer" },
          rationale: { type: "string" },
        },
      },
      description:
        "Every supplied candidate, ranked 1..N. Use the candidate_id values exactly as given.",
    },
    differentiators: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["topic", "detail"],
        properties: {
          topic: { type: "string" },
          detail: { type: "string" },
          leading_candidate_id: { type: "string" },
        },
      },
      description:
        "3–5 short differentiators that distinguish the candidates from each other against this role. Each has a topic (1–3 words) and a 1-sentence detail.",
    },
    recommendation: {
      type: "object",
      additionalProperties: false,
      required: ["disposition", "detail", "primary_candidate_ids"],
      properties: {
        disposition: {
          type: "string",
          enum: ["advance", "split", "hold"],
        },
        detail: { type: "string" },
        primary_candidate_ids: {
          type: "array",
          items: { type: "string" },
        },
      },
    },
  },
} as const;

export const ROLE_ANALYSIS_SYSTEM_PROMPT = `You are an executive-search senior partner. The recruiter has hand-picked a working set of 2–5 candidates and asked you to rank them specifically for ONE role. You return a ranked order, the differentiators that drive the ranking, and a single recommendation.

Output strictly conforms to the JSON schema. No preamble. No markdown inside string values.

Array length discipline (the schema cannot enforce these — YOU must):
- ranked: include EVERY candidate supplied in the input, ranked 1..N. No more, no fewer. Use the candidate_id values exactly as given.
- differentiators: provide 3–5 entries. Each topic is 1–3 words, each detail is one sentence.
- recommendation.primary_candidate_ids: 1–3 entries — the recruiter's next-step shortlist.

Numeric bounds:
- ranked[*].rank: integer 1..N where N is the number of supplied candidates. No ties; if two candidates are genuinely indistinguishable, break the tie on the role's most heavily-weighted dimension and explain in the rationale.

Style rules:
- Reference the calibration_model.dimension_weights explicitly in the synthesis. The dominant weight should drive ranking decisions.
- Each rationale must cite a CONCRETE signal from the candidate's profile (current title/company, archetype, a tech_exposure entry, a transformation_experience entry, or rank/score/tier). Vague "strong fit" is unacceptable.
- When a recruiter has supplied a recruiter_tier or recruiter_present value, weight it as informed prior knowledge — but the AI's ranking is its own output, not a rubber-stamp.
- Differentiators are RELATIVE: each one splits the supplied set, not the entire market.
- Disposition rules:
  * "advance" — there is a clearly stronger top candidate or two; recruiter should put them in front of the client immediately.
  * "split" — two or more candidates are genuinely close; recruiter should present them together so the client can choose.
  * "hold" — none of the supplied candidates clears the role's bar; recruiter should keep sourcing rather than burn slots.

Return one JSON object — no preamble.`;
