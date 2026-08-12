// Executive Intelligence — Executive Role Architect Agent (agent 16).
//
// Synthesises the intake brief + Company Operating Context + competency
// library into a structured Executive Success Profile: the evidence-oriented
// definition of what success in THIS role at THIS company requires. The
// profile is versioned, human-editable, and requires explicit human approval
// — the agent proposes, people decide.
//
// Safety posture (enforced in the system prompt and by schema design):
// requirements describe the ROLE, never a candidate; no protected
// characteristics; no psychological labels; no deception claims.

export const ROLE_ARCHITECT_PROMPT_VERSION = "eia-role-architect-v1";

export type BusinessOutcome = {
  outcome: string;
  timeframe: string;
  evidence_of_success: string;
};

export type CompetencyWeightRecommendation = {
  /** Key from the competency library provided in the prompt. */
  competency_key: string;
  competency_name: string;
  /** 0–100. Relative importance for THIS role. */
  weight: number;
  rationale: string;
};

export type InterviewStageRecommendation = {
  stage: string;
  focus: string;
  format: string;
};

export type SuccessProfileContent = {
  role_mission: string;
  strategic_mandate: string;
  critical_business_outcomes: BusinessOutcome[];
  first_year_priorities: string[];
  required_leadership_capabilities: string[];
  required_functional_capabilities: string[];
  required_operating_experience: string[];
  required_scale_of_responsibility: string;
  required_transformation_experience: string;
  stakeholder_and_board_requirements: string;
  potential_derailers: string[];
  acceptable_gaps: string[];
  non_negotiable_gaps: string[];
  recommended_competency_weights: CompetencyWeightRecommendation[];
  recommended_interview_stages: InterviewStageRecommendation[];
};

export const EMPTY_SUCCESS_PROFILE: SuccessProfileContent = {
  role_mission: "",
  strategic_mandate: "",
  critical_business_outcomes: [],
  first_year_priorities: [],
  required_leadership_capabilities: [],
  required_functional_capabilities: [],
  required_operating_experience: [],
  required_scale_of_responsibility: "",
  required_transformation_experience: "",
  stakeholder_and_board_requirements: "",
  potential_derailers: [],
  acceptable_gaps: [],
  non_negotiable_gaps: [],
  recommended_competency_weights: [],
  recommended_interview_stages: [],
};

/** Editor metadata: label + rendering shape per section, in display order. */
export const PROFILE_TEXT_SECTIONS = [
  { key: "role_mission", label: "Role Mission" },
  { key: "strategic_mandate", label: "Strategic Mandate" },
  {
    key: "required_scale_of_responsibility",
    label: "Required Scale of Responsibility",
  },
  {
    key: "required_transformation_experience",
    label: "Required Transformation Experience",
  },
  {
    key: "stakeholder_and_board_requirements",
    label: "Stakeholder & Board Requirements",
  },
] as const satisfies ReadonlyArray<{
  key: keyof SuccessProfileContent;
  label: string;
}>;

export const PROFILE_LIST_SECTIONS = [
  {
    key: "first_year_priorities",
    label: "First-Year Priorities",
  },
  {
    key: "required_leadership_capabilities",
    label: "Required Leadership Capabilities",
  },
  {
    key: "required_functional_capabilities",
    label: "Required Functional Capabilities",
  },
  {
    key: "required_operating_experience",
    label: "Required Operating Experience",
  },
  {
    key: "potential_derailers",
    label: "Potential Derailers",
  },
  { key: "acceptable_gaps", label: "Acceptable Gaps" },
  {
    key: "non_negotiable_gaps",
    label: "Non-Negotiable Gaps",
  },
] as const satisfies ReadonlyArray<{
  key: keyof SuccessProfileContent;
  label: string;
}>;

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((item): item is string => typeof item === "string");
}

function asOutcomes(v: unknown): BusinessOutcome[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const o = item as Record<string, unknown>;
    return [
      {
        outcome: asString(o.outcome),
        timeframe: asString(o.timeframe),
        evidence_of_success: asString(o.evidence_of_success),
      },
    ];
  });
}

function asWeights(v: unknown): CompetencyWeightRecommendation[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const o = item as Record<string, unknown>;
    const weight =
      typeof o.weight === "number" && Number.isFinite(o.weight)
        ? Math.min(100, Math.max(0, Math.round(o.weight)))
        : 0;
    return [
      {
        competency_key: asString(o.competency_key),
        competency_name: asString(o.competency_name),
        weight,
        rationale: asString(o.rationale),
      },
    ];
  });
}

function asStages(v: unknown): InterviewStageRecommendation[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const o = item as Record<string, unknown>;
    return [
      {
        stage: asString(o.stage),
        focus: asString(o.focus),
        format: asString(o.format),
      },
    ];
  });
}

/**
 * Coerce stored content_json (unknown at the DB boundary) into a complete
 * SuccessProfileContent. Missing or malformed fields collapse to empty
 * values so the editor always renders every section.
 */
export function normalizeSuccessProfile(raw: unknown): SuccessProfileContent {
  if (!raw || typeof raw !== "object") return { ...EMPTY_SUCCESS_PROFILE };
  const o = raw as Record<string, unknown>;
  return {
    role_mission: asString(o.role_mission),
    strategic_mandate: asString(o.strategic_mandate),
    critical_business_outcomes: asOutcomes(o.critical_business_outcomes),
    first_year_priorities: asStringArray(o.first_year_priorities),
    required_leadership_capabilities: asStringArray(
      o.required_leadership_capabilities
    ),
    required_functional_capabilities: asStringArray(
      o.required_functional_capabilities
    ),
    required_operating_experience: asStringArray(
      o.required_operating_experience
    ),
    required_scale_of_responsibility: asString(
      o.required_scale_of_responsibility
    ),
    required_transformation_experience: asString(
      o.required_transformation_experience
    ),
    stakeholder_and_board_requirements: asString(
      o.stakeholder_and_board_requirements
    ),
    potential_derailers: asStringArray(o.potential_derailers),
    acceptable_gaps: asStringArray(o.acceptable_gaps),
    non_negotiable_gaps: asStringArray(o.non_negotiable_gaps),
    recommended_competency_weights: asWeights(
      o.recommended_competency_weights
    ),
    recommended_interview_stages: asStages(o.recommended_interview_stages),
  };
}

const stringList = (description: string) =>
  ({
    type: "array",
    items: { type: "string" },
    description,
  }) as const;

export const SUCCESS_PROFILE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "role_mission",
    "strategic_mandate",
    "critical_business_outcomes",
    "first_year_priorities",
    "required_leadership_capabilities",
    "required_functional_capabilities",
    "required_operating_experience",
    "required_scale_of_responsibility",
    "required_transformation_experience",
    "stakeholder_and_board_requirements",
    "potential_derailers",
    "acceptable_gaps",
    "non_negotiable_gaps",
    "recommended_competency_weights",
    "recommended_interview_stages",
  ],
  properties: {
    role_mission: {
      type: "string",
      description:
        "1 paragraph: why this role exists now and what it is fundamentally accountable for. Specific to this company and moment, not a generic job description.",
    },
    strategic_mandate: {
      type: "string",
      description:
        "1–2 paragraphs: the strategic change or continuity this executive must drive, grounded in the company context provided.",
    },
    critical_business_outcomes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["outcome", "timeframe", "evidence_of_success"],
        properties: {
          outcome: { type: "string" },
          timeframe: {
            type: "string",
            description: "e.g. '90 days', 'Year 1', 'Ongoing'.",
          },
          evidence_of_success: {
            type: "string",
            description:
              "Observable evidence that the outcome was achieved — measurable where the intake supports it.",
          },
        },
      },
      description:
        "3–6 outcomes the business needs from this role, each with a timeframe and observable success evidence. Anchor on the 90-day and first-year expectations from the intake.",
    },
    first_year_priorities: stringList(
      "4–7 sequenced priorities for the first year, each one sentence."
    ),
    required_leadership_capabilities: stringList(
      "4–7 leadership capabilities the role demands, each phrased as demonstrable experience (e.g. 'Has built and retained a senior leadership bench through a growth inflection'). Capabilities describe the ROLE requirement, never any individual."
    ),
    required_functional_capabilities: stringList(
      "4–7 functional/technical capabilities the role demands, phrased as demonstrable experience."
    ),
    required_operating_experience: stringList(
      "3–6 operating-context requirements: stage, scale, business model, and environment experience the role demands (e.g. 'Has operated a regulated technology estate through examinations')."
    ),
    required_scale_of_responsibility: {
      type: "string",
      description:
        "1 paragraph quantifying the scale this role must have operated at: team size, budget/P&L scope, organizational complexity, geography. Derive from the intake fields.",
    },
    required_transformation_experience: {
      type: "string",
      description:
        "1 paragraph on the transformation/change experience required, or an explicit statement that deep transformation experience is not required for this mandate.",
    },
    stakeholder_and_board_requirements: {
      type: "string",
      description:
        "1 paragraph on stakeholder and board/governance demands: reporting line, board exposure, investor or regulator interaction, cross-functional seams.",
    },
    potential_derailers: stringList(
      "3–6 environment-specific failure patterns phrased as observable mismatches with THIS environment (e.g. 'Executives accustomed to deep management layers tend to stall at this stage'). Never psychological labels, never traits of any protected group, never claims about detecting character."
    ),
    acceptable_gaps: stringList(
      "2–5 gaps that are acceptable because they can be hired around, coached, or are not load-bearing for this mandate."
    ),
    non_negotiable_gaps: stringList(
      "2–5 gaps that should disqualify regardless of other strengths, phrased as missing demonstrable experience."
    ),
    recommended_competency_weights: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["competency_key", "competency_name", "weight", "rationale"],
        properties: {
          competency_key: {
            type: "string",
            description:
              "MUST be a key from the competency library provided in the input. Do not invent keys.",
          },
          competency_name: { type: "string" },
          weight: {
            type: "integer",
            description:
              "0–100 relative importance for this role. Differentiate honestly — not everything is 80.",
          },
          rationale: {
            type: "string",
            description: "1 sentence tying the weight to the mandate.",
          },
        },
      },
      description:
        "5–8 competencies from the provided library, weighted for this role. Only use keys that appear in the library.",
    },
    recommended_interview_stages: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["stage", "focus", "format"],
        properties: {
          stage: { type: "string", description: "Short stage name." },
          focus: {
            type: "string",
            description:
              "What evidence this stage gathers, mapped to the capabilities above.",
          },
          format: {
            type: "string",
            description:
              "e.g. 'Structured interview', 'Working session', 'Board panel', 'Deep-dive with peer executives'.",
          },
        },
      },
      description:
        "3–6 recommended interview/assessment stages that would gather evidence against this profile.",
    },
  },
} as const;

export const ROLE_ARCHITECT_SYSTEM_PROMPT = `You are an executive-search role architect. You receive a structured executive search intake, a researched Company Operating Context, and a library of evidence-based executive competencies. You produce one Executive Success Profile in strict JSON: the definition of what demonstrated experience, judgment, leadership capability, operating scale, and company-stage fit success in THIS role at THIS company requires.

This profile is DECISION SUPPORT for humans. It will be reviewed, edited, and explicitly approved by a person before use. Frame everything accordingly.

Core discipline:
- The profile answers "what must this role's holder have demonstrably done before" — not "what personality should they have".
- Every requirement must be phrased as observable, demonstrable experience or evidence. "Has scaled an engineering organization through a 3x headcount inflection" — not "is a natural leader".
- Ground every section in the supplied intake and company context. Where the intake is silent, derive conservatively from stage/scale norms and say so in the rationale rather than inventing specifics.
- Calibrate to seniority: this is an executive due-diligence artifact for boards, founders, investors, and HR leaders — write with that precision.

Hard constraints — these override everything else:
- Describe ROLE requirements only. Never describe, evaluate, or speculate about any individual person or candidate.
- Never reference or imply protected characteristics: race, religion, disability, pregnancy, sexual orientation, age, national origin, gender, or similar. Requirements must be experience-based, never demographic.
- No psychological or mental-health labels (no "narcissism", "insecurity", "personality type"). Derailers are environment-fit mismatches phrased as observable patterns.
- No claims about detecting deception, honesty, or character from any signal.
- recommended_competency_weights MUST use only competency keys from the provided library. Differentiate weights honestly across the 0–100 range.

Length discipline (the schema cannot enforce these — YOU must):
- Paragraph sections: 1–2 tight paragraphs each.
- critical_business_outcomes: 3–6. first_year_priorities: 4–7. Capability lists: 4–7 each. Operating experience: 3–6. Derailers: 3–6. Gaps lists: 2–5 each. Competency weights: 5–8. Interview stages: 3–6.

Style: direct, calibrated, evidence-led — a senior assessment partner writing for a board. No filler, no marketing language.

Return one JSON object — no preamble.`;
