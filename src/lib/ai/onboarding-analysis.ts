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

// ────────────────────────────────────────────────────────────────────────
// §196 — CUSTOM INDUSTRY DIMENSIONS.
//
// The five above are the spine: hardcoded, columnar in candidate_scores,
// named by every report and both portals. They are not changing. A
// custom dimension rides ALONGSIDE them — an extra axis this one mandate
// needs that "domain" cannot honestly carry (e.g. "FX options
// market-making depth" for an MD FX search).
//
// The ruling that shapes this file (founder, 2026-09-23): THE AGENT
// AUTHORS, THE HUMAN APPROVES. The Calibration Agent proposes these the
// same way it already derives the weights — the recruiter is never
// required to author one, and a mandate with zero of them is the normal,
// healthy case. But a proposed dimension does NOT score. Deriving a
// weight tunes an axis a human wrote; deriving a DIMENSION invents the
// criterion people are ranked by, which is a bigger claim than an agent
// gets to make unwitnessed. So `status` starts at "proposed" and one
// recruiter click moves it to "approved".
//
// This is not a stopper, and the distinction matters: the mandate
// proceeds, candidates parse, and the leaderboard ranks on the core five
// whether or not anyone ever clicks. Approval decides only whether the
// extra axes COUNT — never whether work can continue.
// ────────────────────────────────────────────────────────────────────────

/** Ceiling per mandate. Past ~8 axes a weighted average stops
 * discriminating — every candidate drifts to the mean and the ranking
 * loses the edge that makes it worth having. Also bounds parse cost. */
export const CUSTOM_DIMENSIONS_MAX = 3;

/** Reserved: a custom key may never shadow one of the five. */
export const CUSTOM_DIMENSION_KEY_RE = /^[a-z][a-z0-9_]{1,39}$/;

export const CUSTOM_LABEL_MAX = 60;

/**
 * Drive 128 raised this from 400. A definition is required to say what a
 * 10 looks like AND what a 0 looks like, and the live agent's first
 * proposal ran 420 characters — so the bound was cutting the "what a 0
 * looks like" clause off the end of a well-formed answer. That clause is
 * the one that stops the model scoring generously by default, which
 * makes the truncation a scoring defect, not a cosmetic one.
 *
 * Still bounded: this text rides in every CV parse prompt for the
 * mandate, so it is not free. 600 fits the two-part answer the schema
 * asks for with room to spare, and `truncateAtWord` now makes any cut
 * land on a word boundary and show an ellipsis.
 */
export const CUSTOM_DEFINITION_MAX = 600;
export const CUSTOM_RATIONALE_MAX = 400;

/** "proposed" = derived but unwitnessed; contributes NOTHING to any
 * score. "approved" = a human with mandates:write signed for it. */
export type CustomDimensionStatus = "proposed" | "approved";

/** Who authored it. Kept because the two carry different burdens of
 * proof at review time — an agent's proposal is a claim, a recruiter's
 * is a decision. */
export type CustomDimensionOrigin = "agent" | "recruiter";

export type CustomDimension = {
  /** Stable slug. The parser scores against this key and
   * candidate_scores.custom_scores is keyed by it, so it must never
   * change once candidates have been scored. */
  key: string;
  label: string;
  /** What a 10 looks like vs. a 0 — this is what the parser scores
   * against, so vagueness here is vagueness in the ranking. */
  definition: string;
  /** WHY this mandate needs an axis the core five don't cover. Exists so
   * approving is a ten-second read rather than a leap of faith, and so
   * a hiring manager asking "why is my candidate a 4 on this?" gets a
   * real answer instead of a shrug. */
  rationale: string;
  weight: number;
  status: CustomDimensionStatus;
  origin: CustomDimensionOrigin;
};

export type CalibrationDerivation = {
  dimension_weights: DimensionWeights;
  weights_rationale: string;
  /** The agent's proposals. Absent or empty is a GOOD answer — see the
   * prompt, which says so explicitly. */
  custom_dimensions?: CustomDimensionProposal[];
};

/** What the agent is allowed to return. `status` and `origin` are
 * stamped server-side: the model does not get to mark its own work
 * approved. */
export type CustomDimensionProposal = {
  key: string;
  label: string;
  definition: string;
  rationale: string;
  weight: number;
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
  // §180 (F-H) precedent: custom_dimensions is REQUIRED, not optional.
  // An optional field lets the model skip the question; a required empty
  // array is the honest-absence shape — and "this role needs no extra
  // axis" is the answer we expect most of the time.
  required: ["dimension_weights", "weights_rationale", "custom_dimensions"],
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
    custom_dimensions: {
      // NO `maxItems`. Anthropic's structured-output schema subset
      // REJECTS it outright — "For 'array' type, property 'maxItems' is
      // not supported" — and the rejection is a 400 on the whole
      // request, so shipping it here did not merely lose the cap, it
      // broke derive_calibration ENTIRELY. Drive 128 found it in
      // production; tsc, vitest and next build all passed, because none
      // of them sends the schema to the API.
      //
      // The cap is enforced where it always really was: the prompt
      // states the maximum, `mergeProposals` slices to
      // CUSTOM_DIMENSIONS_MAX, and `normaliseCustomDimensions` caps
      // again on read. Losing the schema-level bound costs nothing.
      type: "array",
      description:
        `Industry-specific scoring axes the five core dimensions cannot honestly carry for THIS role. AT MOST ${CUSTOM_DIMENSIONS_MAX}. Return an empty array when the five are sufficient — that is the expected answer for most roles, not a failure.`,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["key", "label", "definition", "rationale", "weight"],
        properties: {
          key: {
            type: "string",
            description:
              "Stable lower_snake_case slug, 2–40 chars, starting with a letter. e.g. 'fx_options_market_making'. Must not be one of: technical, domain, leadership, regulatory, transformation.",
          },
          label: {
            type: "string",
            description:
              "Human-readable name, 2–6 words. e.g. 'FX options market-making depth'.",
          },
          definition: {
            type: "string",
            description:
              `What a 10 looks like and what a 0 looks like, in one or two sentences and UNDER ${CUSTOM_DEFINITION_MAX} characters — longer is truncated, and the end of your answer is the part that describes a 0. This text is what a CV gets scored against, so be concrete and observable — name the experience, instruments, scale or accountability that evidences it. Vagueness here becomes noise in the ranking.`,
          },
          rationale: {
            type: "string",
            description:
              "One sentence on why this role needs an axis the core five don't cover, grounded in the company context or onboarding answers. A recruiter reads this to decide whether to approve it.",
          },
          weight: {
            type: "integer",
            description:
              "0–10, on the same scale as the core dimension weights.",
          },
        },
      },
    },
  },
} as const;

export const CALIBRATION_SYSTEM_PROMPT = `You are an executive-search calibration analyst. Given a recruiter's onboarding answers and the existing role / company context, derive the scoring model that will be used to rank candidates: weights for the five core dimensions, plus — only where the role genuinely demands it — a small number of industry-specific dimensions.

Output strictly conforms to the provided JSON schema. Each weight MUST be an integer between 0 and 10 inclusive. Do not return values outside this range.

Rules:
- Use the full 0–10 range. Do not cluster every weight at 5.
- Differentiate: at least one dimension should be ≥ 7 and at least one should be ≤ 4 unless the inputs genuinely demand a flat profile.
- 'priority_signals' is a recruiter-supplied list of named signals with weights 1–10. Map each signal's name to the closest dimension(s) and let the recruiter's weight steer the dimension upward proportionally. Examples: "Technical Depth" → technical; "Leadership Scale" → leadership; "Domain Expertise" → domain; "Regulatory Experience" → regulatory; "Post-Merger Integration" / "Turnaround" → transformation. A signal can map to more than one dimension (e.g. "Compliance Leadership" splits across regulatory + leadership).
- 'must_haves' and 'anti_patterns' refine the picture: e.g. heavy regulatory must-haves → bump regulatory; "must have built from zero" or "post-merger integration" → bump transformation.
- 'role_origin' matters: 'expansion' often raises transformation; 'backfill' often raises leadership / domain; 'new_hire' depends on context.
- Industry / business model from company_context informs the regulatory baseline (FS / Banking / Insurance / Healthcare → higher floor).

Custom dimensions (the 'custom_dimensions' array):
- These are extra scoring axes for THIS role, specific to its industry. They will rank real people, so the bar for proposing one is high.
- Propose one ONLY when the five core dimensions cannot honestly carry the signal. Ask yourself whether 'domain' already covers it. Usually it does. "Knows the insurance industry" is domain. "Lloyd's syndicate underwriting authority" is not — that is a distinct, observable axis with its own evidence.
- Returning an EMPTY ARRAY is a good and expected answer. Most roles need nothing beyond the five. Do not invent an axis to look thorough. Proposing zero when zero are warranted is the correct behaviour, not a failure to contribute.
- Maximum ${CUSTOM_DIMENSIONS_MAX}. Fewer is better. Every axis you add flattens the weighted average and costs the recruiter discrimination between candidates.
- Each must be SCORABLE FROM A CV. If you cannot state what evidence on a CV would make someone a 9 versus a 3, do not propose it. "Cultural fit", "gravitas", "hunger", "executive presence" are not scorable from a document — do not propose them.
- NEVER propose an axis that is, or proxies for, a protected characteristic or a personal circumstance: age, career-break or employment continuity, nationality, visa or work-authorisation status, geographic mobility or willingness to relocate, family or caring responsibilities, health, gender, ethnicity, religion, or socioeconomic and educational-pedigree signals such as employer prestige or university ranking. These are not scoring dimensions. If the onboarding answers push toward one of these, ignore that push and do not encode it.
- Anchor the rationale in the supplied company_context or onboarding answers. Do not invent industry facts you were not given.
- 'key' is lower_snake_case and must not collide with the five core dimension names.

Return one JSON object — no preamble, no markdown.`;
