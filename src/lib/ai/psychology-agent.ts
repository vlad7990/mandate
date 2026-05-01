// Candidate Psychology Agent — generates a behavioural / cultural-fit
// profile for one candidate from their structured CV, AI evaluation,
// and recruiter notes. Distinct from the candidate evaluation (which
// is technical-fit-against-role) — psychology is candidate-intrinsic.
//
// Client-safe: types only. The runner imports the schema + prompt.

export const LEADERSHIP_STYLES = [
  "directive",
  "collaborative",
  "servant",
] as const;
export type LeadershipStyle = (typeof LEADERSHIP_STYLES)[number];

export const LEADERSHIP_STYLE_LABELS: Record<LeadershipStyle, string> = {
  directive: "Directive",
  collaborative: "Collaborative",
  servant: "Servant",
};

export const RISK_TOLERANCES = [
  "conservative",
  "balanced",
  "aggressive",
] as const;
export type RiskTolerance = (typeof RISK_TOLERANCES)[number];

export const RISK_TOLERANCE_LABELS: Record<RiskTolerance, string> = {
  conservative: "Conservative",
  balanced: "Balanced",
  aggressive: "Aggressive",
};

export const CHANGE_ORIENTATIONS = [
  "status_quo",
  "incremental",
  "transformational",
] as const;
export type ChangeOrientation = (typeof CHANGE_ORIENTATIONS)[number];

export const CHANGE_ORIENTATION_LABELS: Record<ChangeOrientation, string> = {
  status_quo: "Status quo",
  incremental: "Incremental",
  transformational: "Transformational",
};

export const ROLE_PATTERNS = ["climber", "specialist", "generalist"] as const;
export type RolePattern = (typeof ROLE_PATTERNS)[number];

export const ROLE_PATTERN_LABELS: Record<RolePattern, string> = {
  climber: "Climber",
  specialist: "Specialist",
  generalist: "Generalist",
};

export const COLLABORATION_STYLES = [
  "solo_achiever",
  "pair_operator",
  "team_builder",
] as const;
export type CollaborationStyle = (typeof COLLABORATION_STYLES)[number];

export const COLLABORATION_STYLE_LABELS: Record<CollaborationStyle, string> = {
  solo_achiever: "Solo achiever",
  pair_operator: "Pair operator",
  team_builder: "Team builder",
};

export const HIERARCHY_PREFERENCES = ["flat", "balanced", "structured"] as const;
export type HierarchyPreference = (typeof HIERARCHY_PREFERENCES)[number];

export const HIERARCHY_PREFERENCE_LABELS: Record<HierarchyPreference, string> = {
  flat: "Flat org",
  balanced: "Balanced",
  structured: "Hierarchical",
};

export const PACE_PREFERENCES = [
  "startup",
  "scale_up",
  "enterprise",
] as const;
export type PacePreference = (typeof PACE_PREFERENCES)[number];

export const PACE_PREFERENCE_LABELS: Record<PacePreference, string> = {
  startup: "Startup pace",
  scale_up: "Scale-up cadence",
  enterprise: "Enterprise rhythm",
};

export const MOTIVATION_DRIVERS = [
  "money",
  "status",
  "impact",
  "mastery",
] as const;
export type MotivationDriver = (typeof MOTIVATION_DRIVERS)[number];

export const MOTIVATION_DRIVER_LABELS: Record<MotivationDriver, string> = {
  money: "Money",
  status: "Status",
  impact: "Impact",
  mastery: "Mastery",
};

export type EvidencedRating<T extends string> = {
  /** The picked enum value. */
  value: T;
  /** 1-sentence justification citing concrete CV / evaluation evidence. */
  evidence: string;
  /** 1-100 confidence in the read, calibrated by signal density. */
  confidence: number;
};

export type CandidatePsychology = {
  generated_at: string;
  // Section 1 — Leadership Style
  leadership_style: EvidencedRating<LeadershipStyle>;
  risk_tolerance: EvidencedRating<RiskTolerance>;
  change_orientation: EvidencedRating<ChangeOrientation>;
  // Section 2 — Behavioural Patterns
  adversity_response: string;
  role_pattern: EvidencedRating<RolePattern>;
  collaboration_style: EvidencedRating<CollaborationStyle>;
  // Section 3 — Cultural Fit
  hierarchy_preference: EvidencedRating<HierarchyPreference>;
  pace_preference: EvidencedRating<PacePreference>;
  motivation_drivers: Array<{
    driver: MotivationDriver;
    /** 1-100 — relative weight among the drivers. Sum across the array
     * isn't constrained; each driver carries its own evidence. */
    weight: number;
    evidence: string;
  }>;
  /** 2–3 sentence narrative integrating the above into a recruiter
   * pitch — what the on-the-job behaviour looks like. */
  narrative_summary: string;
  /** 1–2 short flags worth surfacing on the candidate card. */
  watch_outs: string[];
};

export const PSYCHOLOGY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "leadership_style",
    "risk_tolerance",
    "change_orientation",
    "adversity_response",
    "role_pattern",
    "collaboration_style",
    "hierarchy_preference",
    "pace_preference",
    "motivation_drivers",
    "narrative_summary",
    "watch_outs",
  ],
  properties: {
    leadership_style: ratingSchema([...LEADERSHIP_STYLES]),
    risk_tolerance: ratingSchema([...RISK_TOLERANCES]),
    change_orientation: ratingSchema([...CHANGE_ORIENTATIONS]),
    adversity_response: {
      type: "string",
      description:
        "1–2 sentences on how this candidate has historically responded to setbacks (failed transformations, demotions, mass exits, tenure jumps after rough patches). Cite concrete CV signals.",
    },
    role_pattern: ratingSchema([...ROLE_PATTERNS]),
    collaboration_style: ratingSchema([...COLLABORATION_STYLES]),
    hierarchy_preference: ratingSchema([...HIERARCHY_PREFERENCES]),
    pace_preference: ratingSchema([...PACE_PREFERENCES]),
    motivation_drivers: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["driver", "weight", "evidence"],
        properties: {
          driver: { type: "string", enum: [...MOTIVATION_DRIVERS] },
          weight: { type: "integer" },
          evidence: { type: "string" },
        },
      },
      description:
        "2–4 motivation drivers ranked by relative weight (1–100). Each cites concrete evidence (a stated quote in the CV summary, a pattern across roles, a transformation choice).",
    },
    narrative_summary: {
      type: "string",
      description:
        "2–3 sentences integrating the readings above into a behavioural narrative the recruiter can pitch. Anchored on concrete CV signals.",
    },
    watch_outs: {
      type: "array",
      items: { type: "string" },
      description:
        "0–2 short flags (≤ 12 words each) the recruiter should surface to the hiring manager pre-interview. Empty array when there's nothing material.",
    },
  },
} as const;

function ratingSchema(values: string[]) {
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

export const PSYCHOLOGY_SYSTEM_PROMPT = `You are an executive-search behavioural psychologist. Given one candidate's structured CV, AI evaluation report, and any recruiter notes, you produce a calibrated psychological profile across leadership style, risk tolerance, change orientation, behavioural patterns, and cultural fit.

Output strictly conforms to the JSON schema. No preamble. No markdown inside string values. Plain prose, single paragraph per field unless the field is explicitly a list.

Array length discipline (the schema cannot enforce these — YOU must):
- motivation_drivers: 2–4 entries, ordered by descending weight.
- watch_outs: 0–2 entries. Empty array is preferred over filler.

Numeric bounds:
- Every confidence and motivation_drivers[*].weight is integer 0–100 inclusive. Calibrate honestly: low confidence (<60) when the CV is thin or ambiguous; high confidence (>80) only when at least three concrete signals back the read.

Style rules:
- Every "value" choice is paired with one sentence of "evidence" that cites a concrete CV signal (a job title, a transformation_experience entry, a role-tenure pattern, a quoted line from the AI evaluation). Vague evidence ("strong leader") is unacceptable.
- adversity_response cites at least one inflection point in the career (a sideways move, a layoff, a tenure spike after a downturn).
- narrative_summary integrates the readings — don't repeat them. State what on-the-job behaviour the recruiter should expect.
- Don't moralise: a "directive" leader isn't worse than "servant"; calibrate context-dependent fit, not preference.
- When evidence is genuinely ambiguous, prefer "balanced" / "incremental" / "pair_operator" over forcing a polar reading, AND drop confidence below 60.

Return one JSON object — no preamble.`;
