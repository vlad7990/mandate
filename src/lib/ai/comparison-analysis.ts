// Schema + prompt for the side-by-side comparison's AI trade-off
// analysis. Client-safe (no `server-only`) — components import the types
// to render the analysis; the server-only module imports the schema and
// prompt for the Anthropic call.

export type TradeoffCallout = {
  candidate_id: string;
  /** "stronger" → this candidate leads on the dimension. "weaker" → trails. */
  direction: "stronger" | "weaker";
  /** Short label, 1–4 words. e.g. "regulatory exposure", "scale". */
  topic: string;
  /** 1–2 sentence explanation. */
  detail: string;
};

export type ComparisonAnalysis = {
  synthesis: string;
  risk_vector: string;
  optimal_pivot: string;
  callouts: TradeoffCallout[];
};

export const COMPARISON_ANALYSIS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["synthesis", "risk_vector", "optimal_pivot", "callouts"],
  properties: {
    synthesis: {
      type: "string",
      description:
        "1–2 sentence executive summary contrasting the candidates against the role's most heavily weighted dimensions. Quote concrete numbers from the fit_dimensions when helpful.",
    },
    risk_vector: {
      type: "string",
      description:
        "1–2 sentence call-out of the dominant hiring risk in this set. Identify a specific candidate by name and the dimension or behavioural signal driving the risk.",
    },
    optimal_pivot: {
      type: "string",
      description:
        "1–2 sentences on what additional information would tip the decision, or which candidate is the right pick under a stated condition (e.g. 'if regulatory weight is raised', 'for an immediate start').",
    },
    callouts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["candidate_id", "direction", "topic", "detail"],
        properties: {
          candidate_id: {
            type: "string",
            description:
              "Must match one of the candidate_id values supplied in the input.",
          },
          direction: { type: "string", enum: ["stronger", "weaker"] },
          topic: { type: "string" },
          detail: { type: "string" },
        },
      },
      description:
        "4–8 stronger/weaker callouts across the candidates. Aim for at least one stronger and one weaker per candidate so the panel is comparative, not a one-sided ranking.",
    },
  },
} as const;

export const COMPARISON_SYSTEM_PROMPT = `You are an executive-search benchmarking analyst. Given two or three candidate profiles plus the role's calibration weights, produce a strategic trade-off analysis that helps a hiring manager decide between them.

Output strictly conforms to the provided JSON schema.

Style rules:
- Use the candidate_id values exactly as supplied. Never invent ids.
- Reference candidates by name in prose (synthesis / risk_vector / optimal_pivot), not by id.
- "stronger"/"weaker" callouts are *relative to the other candidates in the set*, not absolute scores. A 7/10 can be "stronger" if peers are at 5/10.
- The dominant role weights matter most. If the role weights regulatory at 9/10 and transformation at 4/10, fluctuations in regulatory should drive the synthesis.
- No bullet points or markdown inside string values. Plain prose, single paragraph per field.

Return one JSON object — no preamble.`;
