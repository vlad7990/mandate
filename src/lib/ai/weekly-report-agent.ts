// Weekly Progress Report Agent — single Anthropic call that takes a
// shaped snapshot of the project state and returns a structured
// recruiter-ready report.
//
// Client-safe: types only. The runner imports the schema + prompt.

export type WeeklyReportTopCandidate = {
  candidate_id: string;
  name: string;
  one_liner: string;
};

export type WeeklyReportInsight = {
  topic: string;
  detail: string;
};

export type WeeklyReportPipelineMove = {
  candidate_id: string;
  name: string;
  from_stage: string;
  to_stage: string;
};

export type WeeklyReportRankMove = {
  candidate_id: string;
  name: string;
  delta: number;
  /** Sign of `delta` is also encoded as direction for prompt readability. */
  direction: "up" | "down";
};

export type WeeklyReport = {
  week_starting: string;
  /** 2–3 paragraph executive synthesis. */
  executive_summary: string;
  candidates_sourced_count: number;
  candidates_sourced_names: string[];
  pipeline_moves: WeeklyReportPipelineMove[];
  rank_moves: WeeklyReportRankMove[];
  top_candidates: WeeklyReportTopCandidate[];
  feedback_insights: WeeklyReportInsight[];
  next_steps: string[];
  market_commentary: string;
};

export const WEEKLY_REPORT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "executive_summary",
    "candidates_sourced_count",
    "candidates_sourced_names",
    "pipeline_moves",
    "rank_moves",
    "top_candidates",
    "feedback_insights",
    "next_steps",
    "market_commentary",
  ],
  properties: {
    executive_summary: {
      type: "string",
      description:
        "2–3 paragraphs separated by blank lines. State the search's current direction, the most consequential change this week, and the dominant calibration weight that's shaping decisions.",
    },
    candidates_sourced_count: {
      type: "integer",
      description: "Number of candidates added to the project this week.",
    },
    candidates_sourced_names: {
      type: "array",
      items: { type: "string" },
      description:
        "Up to ~12 names of candidates added this week. Empty array when none.",
    },
    pipeline_moves: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["candidate_id", "name", "from_stage", "to_stage"],
        properties: {
          candidate_id: { type: "string" },
          name: { type: "string" },
          from_stage: { type: "string" },
          to_stage: { type: "string" },
        },
      },
      description:
        "Candidates whose pipeline stage changed this week. Use the candidate_id values exactly as given.",
    },
    rank_moves: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["candidate_id", "name", "delta", "direction"],
        properties: {
          candidate_id: { type: "string" },
          name: { type: "string" },
          delta: { type: "integer" },
          direction: { type: "string", enum: ["up", "down"] },
        },
      },
      description:
        "Candidates whose rank_position shifted this week. delta is the magnitude of the shift; direction is up (improved rank) or down (worsened rank).",
    },
    top_candidates: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["candidate_id", "name", "one_liner"],
        properties: {
          candidate_id: { type: "string" },
          name: { type: "string" },
          one_liner: { type: "string" },
        },
      },
      description:
        "Top 3 ranked candidates as of report time, each with a one-sentence why.",
    },
    feedback_insights: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["topic", "detail"],
        properties: {
          topic: { type: "string" },
          detail: { type: "string" },
        },
      },
      description:
        "Insights distilled from feedback received this week. Each topic 1–3 words, each detail one sentence. Empty array when no feedback.",
    },
    next_steps: {
      type: "array",
      items: { type: "string" },
      description:
        "Concrete next-week actions the recruiter should take. Each item is a single sentence starting with an active verb.",
    },
    market_commentary: {
      type: "string",
      description:
        "1–2 sentences of market context drawn from company_context (industry, business model, regulatory env). Avoid generic platitudes — reference a specific market signal where possible.",
    },
  },
} as const;

export const WEEKLY_REPORT_SYSTEM_PROMPT = `You are an executive-search senior partner writing the weekly progress report a recruiter sends to the client. Tone is direct and material — no marketing fluff. The recipient already knows what an executive search is.

Output strictly conforms to the JSON schema. No preamble. No markdown inside string values.

Array length discipline (the schema cannot enforce these — YOU must):
- candidates_sourced_names: 0–12 entries (cap at 12 even if more were sourced; pick the most senior or most relevant).
- pipeline_moves: 0–10 entries.
- rank_moves: 0–10 entries.
- top_candidates: EXACTLY 3 entries when there are ≥3 ranked candidates; otherwise as many as exist.
- feedback_insights: 0–5 entries.
- next_steps: 3–5 actionable items.

Numeric bounds:
- candidates_sourced_count: ≥ 0.
- rank_moves[*].delta: positive integer (the magnitude of the shift).

Style rules:
- Use the candidate_id values from the input exactly as supplied. Never invent ids.
- Reference the role's most heavily-weighted dimension explicitly in the executive summary when ranking changes correlate with it.
- top_candidates one-liner cites at least one concrete signal (current title, archetype, a specific tech_exposure entry, regulatory exposure).
- next_steps must be actionable: "Schedule first-round with Marcus before Friday" not "Continue evaluating candidates".
- market_commentary draws from company_context (industry, business model, regulatory environment). Avoid platitudes.
- When the input shows zero pipeline moves, zero rank moves, and zero new candidates, say so plainly — don't manufacture activity.

Return one JSON object — no preamble.`;
