// Shared types, schema, and prompt for the onboarding → calibration step.
// Imported by the client wizard (constants only) and the server-only
// derive-calibration module (schema + prompt).

export const ROLE_ORIGIN_OPTIONS = [
  { value: "new_hire", label: "NEW_HIRE", caption: "Net-new role / headcount" },
  { value: "backfill", label: "BACKFILL", caption: "Replacement for departing leader" },
  { value: "expansion", label: "EXPANSION", caption: "Scaling existing function" },
] as const;
export type RoleOrigin = (typeof ROLE_ORIGIN_OPTIONS)[number]["value"];

export const MUST_HAVES_MIN = 3;
export const MUST_HAVES_MAX = 5;
export const ANTI_PATTERNS_MIN = 1;
export const ANTI_PATTERNS_MAX = 5;
export const STAKEHOLDERS_MIN = 1;
export const STAKEHOLDERS_MAX = 5;
export const PRIORITY_SIGNALS_MIN = 1;
export const PRIORITY_SIGNALS_MAX = 8;
export const PRIORITY_WEIGHT_MIN = 1;
export const PRIORITY_WEIGHT_MAX = 10;

export type Stakeholder = {
  name: string;
  role: string;
  focus: string;
};

export type PrioritySignal = {
  name: string;
  weight: number;
};

export type OnboardingResponses = {
  role_origin: RoleOrigin;
  must_haves: string[];
  anti_patterns: string[];
  stakeholders: Stakeholder[];
  priority_signals: PrioritySignal[];
};

export const DIMENSION_KEYS = [
  "technical",
  "domain",
  "leadership",
  "regulatory",
  "transformation",
] as const;
export type DimensionKey = (typeof DIMENSION_KEYS)[number];

export type DimensionWeights = Record<DimensionKey, number>;

export type CalibrationDerivation = {
  dimension_weights: DimensionWeights;
  weights_rationale: string;
};

export const DEFAULT_PRIORITY_SIGNALS: PrioritySignal[] = [
  { name: "Technical Depth", weight: 5 },
  { name: "Leadership Scale", weight: 5 },
  { name: "Domain Expertise", weight: 5 },
];

export const EMPTY_RESPONSES: OnboardingResponses = {
  role_origin: "new_hire",
  must_haves: ["", "", ""],
  anti_patterns: [""],
  stakeholders: [{ name: "", role: "", focus: "" }],
  priority_signals: DEFAULT_PRIORITY_SIGNALS,
};

export const CALIBRATION_WEIGHTS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["dimension_weights", "weights_rationale"],
  properties: {
    dimension_weights: {
      type: "object",
      additionalProperties: false,
      required: [...DIMENSION_KEYS],
      properties: {
        technical: {
          type: "integer",
          description:
            "Hands-on technical depth required: architecture, code, systems, modern stacks.",
        },
        domain: {
          type: "integer",
          description:
            "Industry / sector knowledge: vertical fluency, business context, customer types.",
        },
        leadership: {
          type: "integer",
          description:
            "People / org leadership: building teams, executive presence, stakeholder mgmt.",
        },
        regulatory: {
          type: "integer",
          description:
            "Compliance, audit, risk, regulator relationships, controls maturity.",
        },
        transformation: {
          type: "integer",
          description:
            "Change leadership: turnaround, scaling, modernisation, M&A integration.",
        },
      },
    },
    weights_rationale: {
      type: "string",
      description:
        "1–2 sentence summary of which signals from the onboarding answers drove the highest-weighted dimensions. No bullet points; plain prose.",
    },
  },
} as const;

export const CALIBRATION_SYSTEM_PROMPT = `You are an executive-search calibration analyst. Given a recruiter's onboarding answers and the existing role / company context, derive a five-dimension scoring model that will be used to rank candidates.

Output strictly conforms to the provided JSON schema. Each weight MUST be an integer between 0 and 10 inclusive. Do not return values outside this range.

Rules:
- Use the full 0–10 range. Do not cluster every weight at 5.
- Differentiate: at least one dimension should be ≥ 7 and at least one should be ≤ 4 unless the inputs genuinely demand a flat profile.
- 'priority_signals' is a recruiter-supplied list of named signals with weights 1–10. Map each signal's name to the closest dimension(s) and let the recruiter's weight steer the dimension upward proportionally. Examples: "Technical Depth" → technical; "Leadership Scale" → leadership; "Domain Expertise" → domain; "Regulatory Experience" → regulatory; "Post-Merger Integration" / "Turnaround" → transformation. A signal can map to more than one dimension (e.g. "Compliance Leadership" splits across regulatory + leadership).
- 'must_haves' and 'anti_patterns' refine the picture: e.g. heavy regulatory must-haves → bump regulatory; "must have built from zero" or "post-merger integration" → bump transformation.
- 'role_origin' matters: 'expansion' often raises transformation; 'backfill' often raises leadership / domain; 'new_hire' depends on context.
- Industry / business model from company_context informs the regulatory baseline (FS / Banking / Insurance / Healthcare → higher floor).

Return one JSON object — no preamble, no markdown.`;
