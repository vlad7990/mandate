// Schema, types, and prompt for the AI Candidate Search Agent.
//
// The agent receives:
//   * a recruiter's natural-language search query, and
//   * a compact summary of every candidate the org has access to
//     (id + role + title + archetype + overall score + tier + dominant
//     CV signals).
//
// It returns a ranked list of candidate ids with a 0–100 match score
// and a one-sentence rationale. The runner (server action) then joins
// the result back to the full candidate rows for rendering.
//
// Client-safe: types only. The schema and system prompt are imported by
// the server-only runner. We keep this on the same convention as the
// other agents (cv-parsing, candidate-evaluation, …).

export type CandidateSearchInputCandidate = {
  id: string;
  full_name: string;
  current_title: string | null;
  current_company: string | null;
  archetype: string | null;
  pipeline_stage: string | null;
  project_id: string | null;
  project_title: string | null;
  overall_score: number | null;
  tier: string | null;
  /** Domain / scale / tech_exposure summary, comma-joined. */
  signals: string;
  /** First sentence of the candidate's CV summary. */
  headline: string | null;
};

export type CandidateSearchMatch = {
  candidate_id: string;
  /** 0–100. */
  match_score: number;
  reasoning: string;
};

export type CandidateSearchResult = {
  /** Echo back the criteria the agent inferred from the query. */
  parsed_criteria: {
    /** Free-text restatement of the recruiter's intent in 1 sentence. */
    intent: string;
    /** 2–6 short keyword phrases the agent matched on. */
    must_haves: string[];
    /** 0–4 nice-to-haves that boost score but aren't filters. */
    nice_to_haves: string[];
  };
  matches: CandidateSearchMatch[];
};

export const CANDIDATE_SEARCH_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["parsed_criteria", "matches"],
  properties: {
    parsed_criteria: {
      type: "object",
      additionalProperties: false,
      required: ["intent", "must_haves", "nice_to_haves"],
      properties: {
        intent: { type: "string" },
        must_haves: {
          // Counts (0–6) enforced by the system prompt; Anthropic
          // structured output doesn't support maxItems.
          type: "array",
          items: { type: "string" },
        },
        nice_to_haves: {
          // Counts (0–4) enforced by the system prompt only.
          type: "array",
          items: { type: "string" },
        },
      },
    },
    matches: {
      type: "array",
      // maxItems (25) enforced by the system prompt only.
      items: {
        type: "object",
        additionalProperties: false,
        required: ["candidate_id", "match_score", "reasoning"],
        properties: {
          candidate_id: { type: "string" },
          match_score: { type: "integer", minimum: 0, maximum: 100 },
          reasoning: { type: "string" },
        },
      },
      description:
        "Up to 25 matches ranked by match_score descending. Only include candidates with match_score >= 30 — anything weaker is noise.",
    },
  },
} as const;

export const CANDIDATE_SEARCH_SYSTEM_PROMPT = `You are an executive-search retrieval analyst. A recruiter gives you a natural-language search query plus a compact directory of the org's candidates. You return a ranked list of candidate ids with a 0–100 match score and a one-sentence rationale.

Output strictly conforms to the JSON schema. No preamble.

Array length discipline (the schema cannot enforce these — YOU must):
- parsed_criteria.must_haves: 2–6 short keyword phrases. 0 only when the query is empty/nonsensical.
- parsed_criteria.nice_to_haves: 0–4 entries.
- matches: 0–25 entries, ranked by match_score descending. Drop anything with match_score < 30.

Rules:
- Use the candidate_id values exactly as supplied. Never invent ids.
- match_score is calibrated, not relative: 90+ = excellent fit, 70–89 = solid fit, 50–69 = adjacent, 30–49 = weak/long-shot. Below 30, drop the candidate from the result.
- The reasoning sentence must reference at least one concrete signal from the candidate's record (title, company, archetype, project, dominant CV signal). Vague ("strong fit", "good background") is not acceptable.
- Resolve obvious synonyms in the query: "FS" = financial services, "buy-side" = asset management / hedge fund, "post-trade" = clearing/settlement/recon, "head of" = director-level / VP-level.
- If the query is empty or nonsensical, set parsed_criteria.intent to a brief description of why and return matches: [].
- Do not deduplicate identical names across projects — each candidate row is independent.
- Sort matches by match_score descending. Cap at 25.

Return one JSON object — no preamble.`;
