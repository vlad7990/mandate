/**
 * The agent roster — the twenty-five principals that actually run.
 *
 * ## Why this file is shaped this way
 *
 * It began as a corrective: the Platform comp drew its own roster and
 * did not reconcile, inventing agents that did not exist and badging a
 * column "6" above a list of four. Deriving every count from one array
 * fixed that — inside marketing.
 *
 * It came back one level up. By §169 this file listed SEVENTEEN agents
 * while the platform ran TWENTY-FIVE, and the two disagreed by name,
 * not merely by count: five marketed agents were not platform
 * principals at all ("Company Research", "Onboarding", "Executive Role
 * Architect", "Interview Architect", "Candidate Review"), and twelve
 * live ones had never been mentioned. Because `AGENT_COUNT` derives
 * from this array, the hero rail, the meta description, the OG card and
 * the Platform phase map were mutually consistent and all wrong.
 *
 * So every entry now carries the `kind` of the platform agent it
 * describes, and `agent-roster.test.ts` fails the build if the platform
 * gains or loses an agent this file does not account for. The names and
 * the one-line outputs stay OURS — a client should read "Pre-Screen",
 * not `prescreen` — but the SET is no longer ours to drift.
 *
 * `AGENT_COUNT` in `../_constants` is `AGENTS.length`. Adding an agent
 * to the platform now forces a decision here rather than silently
 * making this page a liar.
 */

/** Pipeline phase an agent serves. */
export type AgentPhase = "define" | "calibrate" | "evaluate" | "defend" | "always";

export type Agent = {
  /**
   * The platform agent this describes — the `kind` in
   * `src/lib/agents/session.ts`. This is the join that keeps marketing
   * honest; it is never rendered.
   */
  readonly kind: string;
  readonly name: string;
  readonly phase: AgentPhase;
  /** One line: what it produces, not how it feels. */
  readonly output: string;
  /**
   * True for the Executive Intelligence agents. They are part of the
   * roster but only run for accounts with the add-on, and the page has
   * to say so — a visitor on the Starter tier should not read this grid
   * as a list of what they are buying.
   */
  readonly addOn?: true;
};

export const AGENTS: readonly Agent[] = [
  // ── DEFINE — turn one line into a specified mandate ──────────────
  {
    kind: "intake",
    name: "Intake",
    phase: "define",
    output: "Turns one line into a structured mandate with the gaps named",
  },
  {
    kind: "company_intel",
    name: "Company Intelligence",
    phase: "define",
    output: "Web-grounded picture of the estate, org shape and regulatory environment",
  },
  {
    kind: "culture",
    name: "Culture",
    phase: "define",
    output: "How this company actually decides, and who survives it",
  },
  {
    kind: "rolespec",
    name: "Role Spec",
    phase: "define",
    output: "A versioned specification you edit and approve",
  },
  {
    kind: "interviewer",
    name: "Interviewer",
    phase: "define",
    output:
      "Interviews your own team to close the gaps the brief left open, and plans each candidate's rounds",
  },

  // ── CALIBRATE — make the judgement explicit before anyone is judged
  {
    kind: "calibration",
    name: "Calibration",
    phase: "calibrate",
    output: "A weighted scoring model you can argue with before it scores anyone",
  },
  {
    kind: "psychology",
    name: "Client Psychology",
    phase: "calibrate",
    output: "What this client says they want, and what they have actually hired",
  },
  {
    kind: "boolean_search",
    name: "Boolean Search",
    phase: "calibrate",
    output: "LinkedIn, X-Ray and ATS queries — exact, broad and adjacent",
  },
  {
    kind: "candidate_search",
    name: "Candidate Search",
    phase: "calibrate",
    output: "Runs the searches and returns a de-duplicated long list",
  },
  {
    kind: "relationship",
    name: "Relationship",
    phase: "calibrate",
    output: "Who in your network already knows this person, and how well",
  },

  // ── EVALUATE — read every candidate the same way ─────────────────
  {
    kind: "cv_parser",
    name: "CV Parsing",
    phase: "evaluate",
    output: "A structured profile from a PDF or DOCX",
  },
  {
    kind: "evaluator",
    name: "Evaluation",
    phase: "evaluate",
    output: "Strengths, risks and fit against the specification — with its evidence",
  },
  {
    kind: "ranker",
    name: "Ranking",
    phase: "evaluate",
    output: "A multi-dimension score and a tier, from the calibrated model",
  },
  {
    kind: "researcher",
    name: "Candidate Research",
    phase: "evaluate",
    output: "Web-grounded verification of what the CV claims",
  },
  {
    kind: "prescreen",
    name: "Pre-Screen",
    phase: "evaluate",
    output: "The questions worth asking this candidate before anyone's diary opens",
  },

  // ── DEFEND — the slate, and the case for it ──────────────────────
  {
    kind: "shortlist",
    name: "Shortlist",
    phase: "defend",
    output: "A slate with its trade-offs written down",
  },
  {
    kind: "positioner",
    name: "Candidate Positioning",
    phase: "defend",
    output: "The submission narrative, in your voice",
  },
  {
    kind: "outreach_strategy",
    name: "Outreach Strategy",
    phase: "defend",
    output: "How to approach this person, given who they are and who you are",
  },
  {
    kind: "engagement",
    name: "Engagement",
    phase: "defend",
    output: "Drafts the approach and keeps the thread honest — never sends unapproved",
  },
  {
    kind: "feedback_interpreter",
    name: "Feedback",
    phase: "defend",
    output: "Reads what the client said, and recalibrates the model that ranked them",
  },

  // ── ALWAYS — running whether or not you asked ────────────────────
  {
    kind: "copilot",
    name: "Recruiter Copilot",
    phase: "always",
    output: "Answers questions about the search, with the search in front of it",
  },
  {
    kind: "search_health",
    name: "Search Health",
    phase: "always",
    output: "Funnel conversion, stalled searches, and what is about to go wrong",
  },
  {
    kind: "digest",
    name: "Desk Digest",
    phase: "always",
    output: "What moved across every mandate since you last looked",
  },

  // ── EXECUTIVE INTELLIGENCE — the add-on ──────────────────────────
  {
    kind: "execintel",
    name: "Executive Intelligence",
    phase: "always",
    output: "The deep-research dossier on a single executive",
    addOn: true,
  },
  {
    kind: "triangulator",
    name: "Triangulation",
    phase: "always",
    output: "Fuses four perspectives into one defensible verdict",
    addOn: true,
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
