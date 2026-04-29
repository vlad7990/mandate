// Shared types, schema, and prompt for the Feedback Interpretation Agent.
// Client-safe (no `server-only`) — UI imports the enums and result types;
// the server-only interpreter imports the schema + prompt for the
// Anthropic call.

import { DIMENSION_KEYS, type DimensionKey } from "./onboarding-analysis";

export const FEEDBACK_TYPES = [
  "recruiter_note",
  "hiring_manager",
  "interview_outcome",
] as const;
export type FeedbackType = (typeof FEEDBACK_TYPES)[number];

export const FEEDBACK_TYPE_LABELS: Record<FeedbackType, string> = {
  recruiter_note: "Recruiter note",
  hiring_manager: "Hiring manager",
  interview_outcome: "Interview outcome",
};

/**
 * Suggested per-dimension delta. The server clamps the resulting weight
 * to [0, 10] before persisting, so the model can suggest large swings
 * without breaking the schema's bounds.
 */
export type WeightAdjustment = {
  dimension: DimensionKey;
  delta: number;
  reason: string;
};

export type FeedbackInterpretation = {
  preference_changes: string[];
  bias_patterns: string[];
  contradictions: string[];
  recalibration_needed: boolean;
  suggested_weight_adjustments: WeightAdjustment[];
  /** Short summary surfaced in the feedback list and the project banner. */
  summary: string;
};

export const FEEDBACK_INTERPRETATION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "preference_changes",
    "bias_patterns",
    "contradictions",
    "recalibration_needed",
    "suggested_weight_adjustments",
    "summary",
  ],
  properties: {
    preference_changes: {
      type: "array",
      items: { type: "string" },
      description:
        "0–4 concrete things this feedback reveals about what the client values that wasn't already captured. Each item is one short sentence (max ~15 words). Empty array if the feedback is purely confirmatory.",
    },
    bias_patterns: {
      type: "array",
      items: { type: "string" },
      description:
        "0–3 concerning patterns detected — e.g. 'consistently rejects female candidates', 'always weights pedigree over outcome'. Be conservative; only flag patterns the feedback materially supports.",
    },
    contradictions: {
      type: "array",
      items: { type: "string" },
      description:
        "0–3 conflicts with previously stated criteria, prior feedback, or the project's must-haves / anti-patterns. Cite the conflicting claim explicitly.",
    },
    recalibration_needed: {
      type: "boolean",
      description:
        "True when the feedback materially changes how candidates should be scored against this role. Confirmatory feedback ('Marcus is great, advance him') does NOT need recalibration. Preference-shift feedback ('we actually need someone with regulatory chops, not just transformation') DOES.",
    },
    suggested_weight_adjustments: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["dimension", "delta", "reason"],
        properties: {
          dimension: { type: "string", enum: [...DIMENSION_KEYS] },
          delta: {
            type: "integer",
            description:
              "Signed adjustment in dimension_weights points. Positive raises the dimension, negative lowers it. Typical range: -3 to +3. Larger swings (±5) only for explicit feedback like 'we don't actually care about regulatory at all'.",
          },
          reason: {
            type: "string",
            description:
              "One sentence quoting or paraphrasing the feedback that motivates this delta.",
          },
        },
      },
      description:
        "Empty array when recalibration_needed is false. When true, recommend 1–3 deltas. Don't over-fit to a single piece of feedback; small adjustments compound across the feedback log.",
    },
    summary: {
      type: "string",
      description:
        "1–2 sentence executive summary of what this feedback signals and how it should change downstream behaviour (sourcing, interview focus, weighting). Plain prose; no bullets.",
    },
  },
} as const;

export const FEEDBACK_INTERPRETATION_SYSTEM_PROMPT = `You are an executive-search feedback-interpretation analyst. You receive one new piece of recruiter or hiring-manager feedback plus the project's calibration model, must-haves, anti-patterns, and a tail of recent prior feedback. Your job is to extract structured signal that the recalibration engine and the audit log can act on.

Output strictly conforms to the provided JSON schema.

Hard rules:
- Be conservative. Empty arrays are correct when the feedback genuinely says nothing new.
- recalibration_needed is FALSE for purely directional feedback ("advance Marcus", "schedule round 2"). It is TRUE for preference-shift feedback ("we actually need someone with regulatory chops") or for repeated patterns confirmed by prior feedback.
- bias_patterns must be evidence-backed. Don't pattern-match on a single data point. If unsure, return an empty array.
- contradictions cite the conflicting prior claim concretely (e.g. "earlier feedback said 'cloud-native experience non-negotiable' — this rejects a strong cloud-native candidate").
- suggested_weight_adjustments only when recalibration_needed is true. Deltas typically -3 to +3; reserve ±5 for explicit reweights. Reference the dimensions exactly as: technical, domain, leadership, regulatory, transformation.

Return one JSON object — no preamble, no markdown.`;
