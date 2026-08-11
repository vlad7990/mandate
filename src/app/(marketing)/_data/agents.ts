/**
 * The agent roster, mirroring `AGENTS.md` — the product's source of
 * truth for what actually runs.
 *
 * Why this is a module and not markup: the Platform comp drew its own
 * roster, and it did not reconcile. It invented three agents that do
 * not exist ("Client Psychology", "Skills", "Triangulation"), omitted
 * several that do, and badged its EVALUATE column "6" above a list of
 * four — so the column headers summed to 17 while the rendered rows
 * summed to 15. On a product whose entire pitch is that its outputs
 * reconcile, publishing a miscounted list of its own parts is a
 * category refutation, not a typo. The comp's grouping is kept; its
 * contents are replaced with the real roster, and every count on every
 * page is derived from this array rather than typed.
 *
 * `AGENT_COUNT` in `../_constants` is `AGENTS.length`. Adding an agent
 * here updates the hero rail, the meta description, the OG card and the
 * pricing feature lists at once, which is the point.
 */

/** Pipeline phase an agent serves. */
export type AgentPhase = "define" | "calibrate" | "evaluate" | "defend" | "always";

export type Agent = {
  readonly name: string;
  readonly phase: AgentPhase;
  /** One line: what it produces, not how it feels. */
  readonly output: string;
  /**
   * True for the three Executive Intelligence agents. They are part of
   * the roster but only run for accounts with the add-on, and the page
   * has to say so — a visitor on the Starter tier should not read this
   * grid as a list of what they are buying.
   */
  readonly addOn?: true;
};

export const AGENTS: readonly Agent[] = [
  // ── DEFINE — turn one line into a specified mandate ──────────────
  {
    name: "Intake",
    phase: "define",
    output: "Turns one line into a structured mandate with the gaps named",
  },
  {
    name: "Company Research",
    phase: "define",
    output: "Web-grounded picture of the estate, org shape and regulatory environment",
  },
  {
    name: "Onboarding",
    phase: "define",
    output: "A questionnaire built for this role, capturing must-haves and anti-patterns",
  },
  {
    name: "Role Spec",
    phase: "define",
    output: "A versioned specification you edit and approve",
  },
  {
    name: "Company Context",
    phase: "define",
    addOn: true,
    output: "Stage, scale, governance and recent events, for executive diligence",
  },
  {
    name: "Executive Role Architect",
    phase: "define",
    addOn: true,
    output: "A versioned success profile — outcomes, capabilities, derailers, weights",
  },

  // ── CALIBRATE — set the bar, then go looking ─────────────────────
  {
    name: "Calibration",
    phase: "calibrate",
    output: "A weighted scoring model, operational only once a human approves it",
  },
  {
    name: "Boolean Search",
    phase: "calibrate",
    output: "LinkedIn, X-Ray and ATS queries in four postures",
  },

  // ── EVALUATE — read the field against the bar ────────────────────
  {
    name: "CV Parsing",
    phase: "evaluate",
    output: "A structured profile from a PDF or DOCX",
  },
  {
    name: "Candidate Review",
    phase: "evaluate",
    output: "Strengths, risks and fit against the approved model",
  },
  {
    name: "Ranking",
    phase: "evaluate",
    output: "Scores across every dimension, tiers, and the history of each move",
  },
  {
    name: "Interview Architect",
    phase: "evaluate",
    addOn: true,
    output: "A per-candidate plan with evidence to listen for and weak-answer tells",
  },

  // ── DEFEND — commit, and stand behind it ─────────────────────────
  {
    name: "Shortlist",
    phase: "defend",
    output: "A slate with its trade-offs written down",
  },
  {
    name: "Candidate Positioning",
    phase: "defend",
    output: "The submission narrative, in your voice",
  },
  {
    name: "Feedback",
    phase: "defend",
    output: "Reads client response into a recalibration, and flags contradictions",
  },
  {
    name: "Search Health",
    phase: "defend",
    output: "Flags a stalling mandate before you feel it",
  },

  // ── ALWAYS — not a phase, and the page should not pretend it is ──
  {
    name: "Recruiter Copilot",
    phase: "always",
    output: "Answers questions and explains why a decision was recorded the way it was",
  },
];

export const AGENT_PHASES: ReadonlyArray<{
  readonly key: Exclude<AgentPhase, "always">;
  readonly label: string;
  readonly caption: string;
}> = [
  {
    key: "define",
    label: "Define",
    caption: "One line becomes a mandate with a shape",
  },
  {
    key: "calibrate",
    label: "Calibrate",
    caption: "The bar is set, and approved, before anyone is measured",
  },
  {
    key: "evaluate",
    label: "Evaluate",
    caption: "The field is read against that bar, not against a vibe",
  },
  {
    key: "defend",
    label: "Defend",
    caption: "The slate goes out with its reasoning attached",
  },
];

/** Agents in one phase, in roster order. */
export function agentsInPhase(phase: AgentPhase): readonly Agent[] {
  return AGENTS.filter((a) => a.phase === phase);
}
