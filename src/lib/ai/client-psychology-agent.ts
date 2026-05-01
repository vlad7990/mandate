// Client (hiring-manager) Psychology Agent — derives a preference
// model from the project's feedback history and HM portal reviews.
// The recruiter uses this to predict what the client will reject and
// to position upcoming candidates accordingly.
//
// Stored on `projects.client_psychology` (JSONB). Refresh when ≥3
// feedback rows exist; re-run on every new feedback submission.

export type RevealedPreference = {
  /** Short topic — 1–4 words ("Goldman pedigree", "transformation depth"). */
  topic: string;
  /** "favours" or "rejects". */
  direction: "favours" | "rejects";
  /** 1 sentence on the pattern, citing concrete feedback events. */
  detail: string;
  /** 0–100 confidence in the read, calibrated by feedback density. */
  confidence: number;
};

export type StatedVsRevealed = {
  stated: string;
  revealed: string;
  /** 1 sentence on the divergence and what it means for upcoming pitches. */
  delta: string;
};

export type BiasFlag = {
  /** Short label — "School halo", "Industry tunnel". */
  label: string;
  /** 1 sentence on the bias and the cost it imposes. */
  detail: string;
  /** Rough magnitude: "low" | "medium" | "high". */
  severity: "low" | "medium" | "high";
};

export type DealBreaker = {
  /** Short pattern — "No regulator-led remediation", "≤3 years tenure". */
  pattern: string;
  /** 1 sentence on the consistent reject reason. */
  detail: string;
  /** 0–100 confidence. */
  confidence: number;
};

export type Prediction = {
  /** Conditional clause: "If the candidate has Y…" */
  scenario: string;
  /** "approve" | "reject" | "maybe". */
  likely_outcome: "approve" | "reject" | "maybe";
  /** 1-sentence rationale grounded in past feedback. */
  rationale: string;
  /** 0–100 confidence. */
  confidence: number;
};

export type ClientPsychology = {
  generated_at: string;
  /** Number of feedback rows the model was built from. */
  feedback_count: number;
  /** 1–2 sentence executive summary of the client. */
  summary: string;
  revealed_preferences: RevealedPreference[];
  stated_vs_revealed: StatedVsRevealed | null;
  bias_flags: BiasFlag[];
  deal_breakers: DealBreaker[];
  predictions: Prediction[];
  /** 1–2 sentences on what the recruiter should change in the next slate. */
  next_slate_guidance: string;
};

export const CLIENT_PSYCHOLOGY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "summary",
    "revealed_preferences",
    "stated_vs_revealed",
    "bias_flags",
    "deal_breakers",
    "predictions",
    "next_slate_guidance",
  ],
  properties: {
    summary: {
      type: "string",
      description:
        "1–2 sentences naming the client's dominant decision posture. Reference at least one concrete pattern from the feedback history.",
    },
    revealed_preferences: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["topic", "direction", "detail", "confidence"],
        properties: {
          topic: { type: "string" },
          direction: { type: "string", enum: ["favours", "rejects"] },
          detail: { type: "string" },
          confidence: { type: "integer" },
        },
      },
      description:
        "3–6 entries. The patterns the client has demonstrated through actual feedback — not what they said in the brief.",
    },
    stated_vs_revealed: {
      anyOf: [
        {
          type: "object",
          additionalProperties: false,
          required: ["stated", "revealed", "delta"],
          properties: {
            stated: { type: "string" },
            revealed: { type: "string" },
            delta: { type: "string" },
          },
        },
        { type: "null" },
      ],
      description:
        "Single divergence between brief intent and feedback behaviour. Null when no clear divergence exists.",
    },
    bias_flags: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["label", "detail", "severity"],
        properties: {
          label: { type: "string" },
          detail: { type: "string" },
          severity: { type: "string", enum: ["low", "medium", "high"] },
        },
      },
      description:
        "0–4 systemic bias patterns (school halo, gender skew, single-industry tunnel, salary anchoring, etc.). Empty array when none.",
    },
    deal_breakers: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["pattern", "detail", "confidence"],
        properties: {
          pattern: { type: "string" },
          detail: { type: "string" },
          confidence: { type: "integer" },
        },
      },
      description:
        "0–4 consistent reject patterns. Each anchored on at least two rejected candidates.",
    },
    predictions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["scenario", "likely_outcome", "rationale", "confidence"],
        properties: {
          scenario: { type: "string" },
          likely_outcome: {
            type: "string",
            enum: ["approve", "reject", "maybe"],
          },
          rationale: { type: "string" },
          confidence: { type: "integer" },
        },
      },
      description:
        "3–5 actionable predictions for upcoming candidate types.",
    },
    next_slate_guidance: {
      type: "string",
      description:
        "1–2 sentences telling the recruiter what to emphasise / avoid in the next slate.",
    },
  },
} as const;

export const CLIENT_PSYCHOLOGY_SYSTEM_PROMPT = `You are an executive-search behavioural analyst profiling ONE hiring-manager client based on their feedback history. You receive the project's calibration model, the recruiter's stated brief (onboarding answers), and a list of feedback rows (advance/reject/observation comments) plus structured hiring-manager portal reviews. You produce a calibrated preference model the recruiter will use to predict and pre-empt rejections.

Output strictly conforms to the JSON schema. No preamble. No markdown inside string values.

Array length discipline (the schema cannot enforce these — YOU must):
- revealed_preferences: 3–6 entries. Every entry must cite at least one concrete feedback event.
- bias_flags: 0–4 entries. A bias requires ≥2 supporting events; if you can't name them, leave the array empty.
- deal_breakers: 0–4 entries. Same evidence bar — ≥2 rejected candidates fitting the pattern.
- predictions: 3–5 entries. Each scenario is conditional ("If the candidate has X…").

Numeric bounds:
- Every confidence value is integer 0–100 inclusive. Calibrate honestly: 80+ requires ≥3 concordant feedback signals; 50–80 requires 2; below 50 means flag as exploratory.

Style rules:
- Distinguish STATED preference (what the brief / onboarding said) from REVEALED preference (what feedback decisions show). When they disagree, surface the divergence in stated_vs_revealed.
- Never invent a feedback event. When evidence is thin (<3 feedback rows), set summary to that limitation explicitly and emit conservative preferences with low confidence.
- bias_flags should be calibrated, not accusatory: "consistent preference for Goldman pedigree across rejected non-bulge candidates" is fine; "biased against women" requires direct, repeated evidence (and is rare).
- predictions are actionable: name the candidate attribute and the likely outcome.
- next_slate_guidance is a single concrete instruction — what to over-index on, what to drop.

Return one JSON object — no preamble.`;
