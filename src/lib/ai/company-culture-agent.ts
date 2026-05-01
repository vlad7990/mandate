// Company Culture Intelligence Agent — derives a culture profile for
// the hiring company from company_context, onboarding answers, and
// feedback patterns. The recruiter uses the profile to score candidate
// culture-fit alongside technical fit, and to flag culture risks.
//
// Stored on `projects.company_context.culture_profile` (JSONB) — uses
// the existing column.

export const CULTURE_RISK_APPETITES = [
  "conservative",
  "measured",
  "innovative",
] as const;
export type CultureRiskAppetite = (typeof CULTURE_RISK_APPETITES)[number];

export const CULTURE_RISK_APPETITE_LABELS: Record<
  CultureRiskAppetite,
  string
> = {
  conservative: "Conservative",
  measured: "Measured",
  innovative: "Innovative",
};

export const DECISION_SPEEDS = ["fast", "balanced", "committee"] as const;
export type DecisionSpeed = (typeof DECISION_SPEEDS)[number];

export const DECISION_SPEED_LABELS: Record<DecisionSpeed, string> = {
  fast: "Fast-moving",
  balanced: "Balanced",
  committee: "Committee-driven",
};

export const LEADERSHIP_PREFERENCES = [
  "operator",
  "balanced",
  "visionary",
] as const;
export type LeadershipPreference = (typeof LEADERSHIP_PREFERENCES)[number];

export const LEADERSHIP_PREFERENCE_LABELS: Record<
  LeadershipPreference,
  string
> = {
  operator: "Operator",
  balanced: "Balanced",
  visionary: "Visionary",
};

export const CHANGE_READINESS = [
  "resistant",
  "incremental",
  "transformation_ready",
] as const;
export type ChangeReadiness = (typeof CHANGE_READINESS)[number];

export const CHANGE_READINESS_LABELS: Record<ChangeReadiness, string> = {
  resistant: "Resistant",
  incremental: "Incremental",
  transformation_ready: "Transformation-ready",
};

export type CultureAxis<T extends string> = {
  value: T;
  /** 1 sentence on the supporting signals from company_context / feedback. */
  evidence: string;
  /** 0–100 confidence. */
  confidence: number;
};

export type CultureRedFlag = {
  /** Short label — "Hierarchy mismatch", "Pace mismatch". */
  label: string;
  /** 1 sentence on the risk and the likely failure mode. */
  detail: string;
  severity: "low" | "medium" | "high";
};

export type CultureProfile = {
  generated_at: string;
  /** 1–2 sentence executive summary of the culture. */
  summary: string;
  risk_appetite: CultureAxis<CultureRiskAppetite>;
  decision_speed: CultureAxis<DecisionSpeed>;
  leadership_preference: CultureAxis<LeadershipPreference>;
  change_readiness: CultureAxis<ChangeReadiness>;
  /** 0–4 risk patterns recruiters should screen against. */
  red_flags: CultureRedFlag[];
  /** 1–2 sentences on how to pitch the culture to candidates. */
  candidate_facing_pitch: string;
};

export const COMPANY_CULTURE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "summary",
    "risk_appetite",
    "decision_speed",
    "leadership_preference",
    "change_readiness",
    "red_flags",
    "candidate_facing_pitch",
  ],
  properties: {
    summary: {
      type: "string",
      description:
        "1–2 sentences naming the company's dominant cultural posture, anchored on industry, business model, and any pattern visible in feedback decisions.",
    },
    risk_appetite: cultureAxis([...CULTURE_RISK_APPETITES]),
    decision_speed: cultureAxis([...DECISION_SPEEDS]),
    leadership_preference: cultureAxis([...LEADERSHIP_PREFERENCES]),
    change_readiness: cultureAxis([...CHANGE_READINESS]),
    red_flags: {
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
        "0–4 cultural-fit risks the recruiter should screen against. Empty array when none material.",
    },
    candidate_facing_pitch: {
      type: "string",
      description:
        "1–2 sentences the recruiter can paste verbatim when describing the culture to a prospect.",
    },
  },
} as const;

function cultureAxis(values: string[]) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["value", "evidence", "confidence"],
    properties: {
      value: { type: "string", enum: values },
      evidence: { type: "string" },
      confidence: { type: "integer" },
    },
  } as const;
}

export const COMPANY_CULTURE_SYSTEM_PROMPT = `You are an executive-search culture analyst. Given a company's structured context (industry, business model, regulatory environment), the recruiter's onboarding answers (must-haves, anti-patterns, stakeholders), and the project's feedback history, you produce a four-axis culture profile.

Output strictly conforms to the JSON schema. No preamble. No markdown inside string values.

Array length discipline:
- red_flags: 0–4 entries. A flag requires concrete evidence; leave empty when none.

Numeric bounds:
- Every confidence is integer 0–100 inclusive. 80+ requires multiple concordant signals; 50–80 requires at least one direct signal; below 50 means exploratory.

Axis definitions:
- risk_appetite: conservative (regulator-led / capital-preserving) | measured (default) | innovative (platform / fintech / R&D-led)
- decision_speed: fast (founder-led, days) | balanced | committee (board / matrix, weeks)
- leadership_preference: operator (delivery-first) | balanced | visionary (narrative / industry-shaping)
- change_readiness: resistant (rigid org, status quo) | incremental | transformation_ready (active modernisation programme, M&A integration)

Style rules:
- Anchor each axis on a CONCRETE signal: industry classification, business model, regulatory regime, anti-pattern wording, or a feedback rejection pattern.
- candidate_facing_pitch is the recruiter's verbatim culture pitch — drop generic lines, name the trade-off honestly.
- red_flags name the failure mode: "Pace mismatch — committee culture rejects bias-to-action operators".
- When the inputs are thin (no feedback yet, sparse company_context), say so in the summary and drop confidences below 60 across the board.

Return one JSON object — no preamble.`;
