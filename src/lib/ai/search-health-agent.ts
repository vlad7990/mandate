// Search Health Agent — produces 3-5 actionable recommendations when
// a project's computed health is stalled or at_risk. Distinct from
// the calibration / evaluation agents in that the output is a list
// of LEVERS the recruiter can pull (broaden a boolean, recalibrate a
// dimension, request feedback, change outreach cadence) rather than
// a re-scoring of the candidate pool.
//
// Client-safe: types only.

export const HEALTH_SUGGESTION_CATEGORIES = [
  "sourcing",
  "calibration",
  "feedback",
  "outreach",
  "other",
] as const;
export type HealthSuggestionCategory =
  (typeof HEALTH_SUGGESTION_CATEGORIES)[number];

export const HEALTH_SUGGESTION_PRIORITIES = ["high", "medium", "low"] as const;
export type HealthSuggestionPriority =
  (typeof HEALTH_SUGGESTION_PRIORITIES)[number];

export type HealthSuggestion = {
  /** Stable id minted server-side; recruiter dismisses by id. */
  id: string;
  category: HealthSuggestionCategory;
  priority: HealthSuggestionPriority;
  /** Single-sentence headline action ("Broaden the linkedin_broad query"). */
  action: string;
  /** 1–2 sentences anchoring the action on data. */
  rationale: string;
  /** When category=sourcing — which slot the action targets. */
  applicable_slot?:
    | "linkedin_exact"
    | "linkedin_broad"
    | "linkedin_adjacent"
    | "linkedin_competitor"
    | "google_xray"
    | "ats";
  /** When category=calibration — which dimension to nudge. */
  applicable_dimension?:
    | "technical"
    | "domain"
    | "leadership"
    | "regulatory"
    | "transformation";
  /**
   * Free-form payload for the "Apply" action. For sourcing this is
   * `{ replacement: string }` — the new query content. For
   * calibration this is `{ delta: integer }` — the weight delta.
   */
  applicable_payload?: Record<string, unknown> | null;
  /** Recruiter has dismissed this suggestion (kept for audit). */
  dismissed?: boolean;
};

export type HealthSuggestionsBlob = {
  generated_at: string;
  health_status: "stalled" | "at_risk";
  /** 1–2 sentence executive read on what's wrong. */
  summary: string;
  suggestions: HealthSuggestion[];
};

export const HEALTH_AGENT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "suggestions"],
  properties: {
    summary: {
      type: "string",
      description:
        "1–2 sentences naming the dominant cause of the health regression. Reference at least one concrete signal.",
    },
    suggestions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["category", "priority", "action", "rationale"],
        properties: {
          category: {
            type: "string",
            enum: [...HEALTH_SUGGESTION_CATEGORIES],
          },
          priority: {
            type: "string",
            enum: [...HEALTH_SUGGESTION_PRIORITIES],
          },
          action: { type: "string" },
          rationale: { type: "string" },
          applicable_slot: {
            type: "string",
            enum: [
              "linkedin_exact",
              "linkedin_broad",
              "linkedin_adjacent",
              "linkedin_competitor",
              "google_xray",
              "ats",
            ],
          },
          applicable_dimension: {
            type: "string",
            enum: [
              "technical",
              "domain",
              "leadership",
              "regulatory",
              "transformation",
            ],
          },
          // additionalProperties must be false: the structured-output
          // API refuses `true` on object types (400, found live in the
          // 087 drive). The two named keys are the only ones the apply
          // action reads anyway.
          applicable_payload: {
            type: "object",
            additionalProperties: false,
            properties: {
              replacement: { type: "string" },
              delta: { type: "integer" },
            },
          },
        },
      },
      description:
        "3–5 actionable suggestions ordered by priority desc. Each cites a concrete signal in rationale.",
    },
  },
} as const;

export const HEALTH_AGENT_SYSTEM_PROMPT = `You are an executive-search operations diagnostician. The recruiter's project has tripped a health alert. You receive: the alert codes, the pipeline stats, the boolean queries currently active, the calibration weights, and a tail of recent feedback. You return 3–5 specific LEVERS the recruiter can pull this week to recover the search.

Output strictly conforms to the JSON schema. No preamble. No markdown inside string values.

Array length discipline (the schema cannot enforce these — YOU must):
- suggestions: 3–5 entries, ordered priority desc.

Style rules:
- Each suggestion's "action" is a single concrete instruction phrased as an imperative ("Broaden the linkedin_broad query to include VP-level titles", "Drop regulatory weight from 9 to 7", "Re-engage the client on the last 3 unresolved feedback rows"). Vague ("improve sourcing") is unacceptable.
- "rationale" cites a CONCRETE signal: a specific feedback comment, a specific calibration weight, a specific slot's word count, the velocity number. No platitudes.
- When category=sourcing, set "applicable_slot" to the slot key AND set "applicable_payload.replacement" to the *full new query string* the recruiter can apply with one click. Don't rewrite the slot if the existing query is already the right move.
- When category=calibration, set "applicable_dimension" AND "applicable_payload.delta" (integer, signed; positive raises the weight). Bound deltas to ±3.
- "priority": high = recover this week or the search dies; medium = within two weeks; low = nice-to-have.
- Don't invent feedback that isn't in the input. If the inputs show no feedback at all, suggest soliciting feedback as a high-priority action — don't fabricate signals.

Return one JSON object — no preamble.`;
