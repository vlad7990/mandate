import type {
  SuccessProfileContent,
} from "@/lib/ai/executive-role-architect-agent";
import type {
  InterviewPlanContent,
} from "@/lib/ai/executive-interview-architect-agent";
import type {
  AssessmentContent,
  CompetencyAssessment,
  ExecutiveCandidateStage,
  EvidenceRating,
  ServiceTier,
  ExecutiveSearchStatus,
} from "@/lib/executive/types";
import type { OperationalWeight } from "@/lib/executive/assessment-scoring";
import {
  computeEvidenceRollup,
  computeWeightedEvidenceStrength,
} from "@/lib/executive/assessment-scoring";

/**
 * The sample Executive Intelligence workspace — W7.
 *
 * Everything the module's eleven routes render hangs off one search, the
 * way W3's seven module screens hang off `sample-larkspur`. The rules at
 * the top of `data.ts` apply unchanged; three of them do real work here.
 *
 * ## What D1 turned out to be
 *
 * The inventory said all eleven routes were blocked on an unanswered
 * founder question — what a fabricated agent may say about a fabricated
 * person. Surveying the code rather than the screenshots, it is two.
 *
 * **No page under `/app/executive-intelligence` renders agent output
 * directly.** Every one reads a stored row. Exactly three action files
 * invoke an agent: the intake's company context, the success profile, and
 * the interview plan.
 *
 * **The assessment is not agent-generated.** `assessment/actions.ts` calls
 * `buildAssessmentSkeleton`, `applyRollup` and `normalizeAssessment` — all
 * pure TypeScript in `executive-assessment.ts`, which contains no model
 * call. `types.ts` says so above `AssessmentRow` ("No AI provenance
 * columns: there is no agent"), `ASSESSMENT_DISCLAIMER` exists because the
 * record is a human's, and `report.ts` prints *"Assessment authored by a
 * human · no AI"* into every report's provenance. The one screen in this
 * module that carries an evaluative judgement of a person is the one screen
 * with no agent behind it. The inventory's `generated` classification of
 * `.../assessment` was read off the layout.
 *
 * So D1's surface is the success profile and the interview plan, and both
 * sit inside precedent the product has already written down:
 *
 * - The **success profile** describes the role, never a candidate — the
 *   role-architect agent's own header says so, and nothing in
 *   `SuccessProfileContent` names a person. `potential_derailers` is the
 *   sharp-looking field and it is a property of the job.
 * - The **interview plan** is per-candidate, and is the only place an agent
 *   says anything shaped by a specific person. Its system prompt already
 *   draws the line this fixture keeps: *"Weak-answer indicators and red
 *   flags describe ANSWER CONTENT and observable reasoning, not the
 *   person's character"*, questions gather evidence about "a demonstrable
 *   capability or experience — never about who the person is", and
 *   candidate-specific questions derive only from supplied data, never
 *   invented. Same shape W6 found in the comparison prompt.
 *
 * Which is the existing precedent restated: **a score never travels without
 * the fact that produced it**. Every judgement below is about evidence
 * somebody recorded, a stage in a process, or a requirement of the job.
 * None of it is about what anybody is like.
 *
 * ## Nothing here restates a number another screen owns
 *
 * The six competencies are **real keys from the seeded global catalogue**
 * that `/app/executive-intelligence/competencies` renders. The sample used
 * to invent six names — "Partner-level influence", "Talent architecture" —
 * that a prospect could not have found in the library they can open from
 * the same module. That is the W6 defect (five invented scoring dimensions)
 * repeating in the one place where the real vocabulary is a clickable
 * screen.
 *
 * Coverage, the thin-evidence section, the provenance block and the
 * weighted strength are **not written here**. The report screen runs this
 * fixture through `compileExecutiveReport` — the same function the product
 * uses — so the sample cannot state a number the product would compute
 * differently. `executive.test.ts` pins the rest.
 */

/* ── The searches ─────────────────────────────────────────────────── */

export const SAMPLE_SEARCH_ID = "sample-search-northvale";

export type SampleExecutiveSearch = {
  readonly id: string;
  readonly roleTitle: string;
  readonly companyName: string;
  readonly status: ExecutiveSearchStatus;
  readonly serviceTier: ServiceTier;
  readonly contextStatus: "ready" | "generating" | "none";
  readonly openedDaysAgo: number;
  /** Null until a profile exists at all. */
  readonly profileVersion: number | null;
  readonly profileApproved: boolean;
  readonly candidatesLinked: number;
  /** One line for the list row — what state the search is actually in. */
  readonly summary: string;
};

/**
 * Three, not one. A list screen with a single row demonstrates nothing, the
 * module's four KPI tiles read as zeroes, and — the reason it is three
 * rather than two — the home page's priority card names a success-profile
 * draft awaiting approval, which cannot be this search once its profile is
 * approved at v3. It names Thornbury instead.
 */
export const SAMPLE_SEARCHES: readonly SampleExecutiveSearch[] = [
  {
    id: SAMPLE_SEARCH_ID,
    roleTitle: "Chief Operating Officer",
    companyName: "Northvale Capital",
    status: "active",
    serviceTier: "premium",
    contextStatus: "ready",
    openedDaysAgo: 41,
    profileVersion: 3,
    profileApproved: true,
    candidatesLinked: 4,
    summary: "Profile approved · 4 linked · 1 assessment approved",
  },
  {
    id: "sample-search-thornbury",
    roleTitle: "Chief Financial Officer",
    companyName: "Thornbury Group",
    status: "active",
    serviceTier: "standard",
    contextStatus: "ready",
    openedDaysAgo: 19,
    profileVersion: 2,
    profileApproved: false,
    candidatesLinked: 2,
    summary: "Profile v2 in draft · awaiting approval",
  },
  {
    id: "sample-search-merrit",
    roleTitle: "General Counsel",
    companyName: "Merrit & Vale",
    status: "draft",
    serviceTier: "standard",
    contextStatus: "ready",
    openedDaysAgo: 3,
    profileVersion: null,
    profileApproved: false,
    candidatesLinked: 0,
    summary: "Company context grounded · no profile yet",
  },
];

export function sampleSearch(id: string): SampleExecutiveSearch | undefined {
  return SAMPLE_SEARCHES.find((s) => s.id === id);
}

/**
 * The module landing page's two organisation-scoped KPI tiles.
 *
 * Derived, so they cannot disagree with the list they sit above. The other
 * two tiles — templates and competencies — are deliberately *not* here:
 * that catalogue is a seeded global set every account really can see (D4),
 * so the real count is the honest one even in sample mode.
 */
export function sampleExecutiveKpis(): {
  activeSearches: number;
  approvedProfiles: number;
} {
  return {
    activeSearches: SAMPLE_SEARCHES.filter((s) => s.status === "active").length,
    approvedProfiles: SAMPLE_SEARCHES.filter((s) => s.profileApproved).length,
  };
}

/** The one search with the full chain behind it. */
export function sampleWorkedSearch(): SampleExecutiveSearch {
  const s = sampleSearch(SAMPLE_SEARCH_ID);
  // Cannot happen: `SAMPLE_SEARCHES` is a literal and a test pins the id.
  if (!s) throw new Error(`${SAMPLE_SEARCH_ID} is missing from SAMPLE_SEARCHES`);
  return s;
}

/* ── The operational competency weights ───────────────────────────── */

/**
 * The six weights approving the success profile wrote, in weight order.
 *
 * **Every key is a real row in the seeded global catalogue** — checked
 * against `executive_competencies` where `is_global`, and pinned by
 * `executive.test.ts`. The labels are the catalogue's own names rather
 * than a nicer paraphrase, because the competency library screen shows
 * those names and a prospect who opens it should recognise them.
 */
export const SAMPLE_OPERATIONAL_WEIGHTS: readonly OperationalWeight[] = [
  { competency_key: "scaling_systems", label: "Scaling Through Growth", weight: 24 },
  { competency_key: "regulatory_compliance", label: "Regulatory Navigation", weight: 21 },
  {
    competency_key: "cross_functional_influence",
    label: "Cross-Functional Influence",
    weight: 18,
  },
  { competency_key: "financial_stewardship", label: "Financial Stewardship", weight: 15 },
  {
    competency_key: "talent_magnetism",
    label: "Talent Attraction & Development",
    weight: 12,
  },
  { competency_key: "technology_strategy", label: "Technology Strategy", weight: 10 },
];

/** Why each weight is what it is — shown beside the profile's weight table. */
export const SAMPLE_WEIGHT_RATIONALE: Readonly<Record<string, string>> = {
  scaling_systems:
    "AUM doubled in 26 months and the operating model has not changed since founding. This is the mandate.",
  regulatory_compliance:
    "The last supervisory review left control gaps open. Closing them is a named 18-month outcome.",
  cross_functional_influence:
    "Origination reports to the partners, not to this seat. Everything this role changes, it changes without line authority.",
  financial_stewardship:
    "The cost base has grown with headcount rather than with AUM, and nobody currently owns that.",
  talent_magnetism:
    "There is no operations leadership bench. The firm cannot absorb this hire leaving.",
  technology_strategy:
    "Northvale buys rather than builds, so the judgment required is vendor and integration, not architecture. Weighted lowest for that reason.",
};

/* ── The intake brief ─────────────────────────────────────────────── */

export const SAMPLE_INTAKE_BRIEF: readonly {
  readonly key: string;
  readonly value: string;
}[] = [
  {
    key: "Mandate origin",
    value:
      "AUM doubled in 26 months; the operating model is unchanged since founding.",
  },
  {
    key: "Outcomes in 18 months",
    value:
      "Close the control gaps flagged in the last supervisory review · reduce origination-to-close cycle by a third · build an operations leadership bench.",
  },
  {
    key: "Non-negotiable",
    value:
      "Has personally carried a regulated control remediation through to closure.",
  },
];

/* ── The success profile (agent-drafted, human-approved) ──────────── */

/**
 * Version 3, approved. The shape is `SuccessProfileContent` exactly, so the
 * sample screen renders through the same section metadata the real editor
 * uses (`PROFILE_TEXT_SECTIONS`, `PROFILE_LIST_SECTIONS`) rather than a
 * layout invented for the sample.
 *
 * Every field describes the role. `potential_derailers` is the one that
 * could drift into describing a person, and is written as the job's failure
 * modes — what this seat does to whoever sits in it — which is what the
 * agent's own prompt asks for.
 */
export const SAMPLE_SUCCESS_PROFILE: SuccessProfileContent = {
  role_mission:
    "Industrialise a firm that has doubled AUM on founder-era processes, without slowing origination while doing it. The seat exists because the partners can no longer absorb operational decisions alongside deal work, and the control environment has started to show it.",
  strategic_mandate:
    "Own the operating model end to end — process, controls, vendors and the operations organisation — and make it capable of the next doubling. The first year is remediation and instrumentation; the second is scale. This is a build, not a caretake: there is no operations function to inherit, only the pieces each partner assembled around their own deals.",
  critical_business_outcomes: [
    {
      outcome:
        "Every control gap named in the last supervisory review closed, with evidence the regulator accepts.",
      timeframe: "12 months",
      evidence_of_success:
        "Written closure on each finding, and a control owner named for each one who is not the COO.",
    },
    {
      outcome:
        "Origination-to-close cycle time reduced by a third without adding headcount to the deal teams.",
      timeframe: "18 months",
      evidence_of_success:
        "Cycle time instrumented and reported monthly from a single source, with the before figure agreed before any change ships.",
    },
    {
      outcome:
        "An operations leadership bench that lets the firm absorb this hire leaving.",
      timeframe: "18 months",
      evidence_of_success:
        "Two direct reports capable of running the function through a quarter, demonstrated rather than asserted.",
    },
  ],
  first_year_priorities: [
    "Establish what the control environment actually is, separately from what the last review said it was.",
    "Put one source of truth behind origination cycle time before attempting to change it.",
    "Take the payroll, fund administration and vendor contracts into one owned estate.",
    "Hire or promote a second operations leader — the function currently has a single point of failure.",
  ],
  required_leadership_capabilities: [
    "Has changed how a partnership works without holding authority over the partners.",
    "Can hold a remediation programme to a date in front of a board that would rather hear about origination.",
    "Builds an operating cadence people keep to after the founder stops attending.",
  ],
  required_functional_capabilities: [
    "Fund operations or comparable regulated financial operations, owned rather than overseen.",
    "Vendor and outsourcing management at contract level, including exiting one.",
    "Cost base ownership — able to say what a basis point of margin is made of.",
  ],
  required_operating_experience: [
    "Has operated inside a regulated financial services firm supervised by a named regulator.",
    "Has taken a function through a doubling in volume, not only in headcount.",
    "Has been accountable for a control failure and its remediation, on the record.",
  ],
  required_scale_of_responsibility:
    "Has held an operations function of at least 100 people, or a smaller function carrying comparable regulatory and counterparty exposure. Scale here means the weight of what breaks, not the size of the reporting line — a 60-person team running fund administration for a multi-strategy book is the harder job and counts as such.",
  required_transformation_experience:
    "Has run a change programme through to a stated outcome inside a live business, where the business could not pause. Greenfield build without an existing estate to carry does not evidence this; nor does a programme the candidate governed rather than delivered.",
  stakeholder_and_board_requirements:
    "Reports to the Managing Partner, presents to an investment committee that meets fortnightly, and is the named operational contact for the firm's two largest LPs and its regulator. Must be able to hold a position with people who have every reason to defer the operational conversation and no obligation to attend it.",
  potential_derailers: [
    "The seat has no line authority over origination, so anyone who works through formal authority will stall in the first quarter.",
    "The remediation clock and the cycle-time mandate pull in opposite directions for at least two quarters; the role fails if one is quietly dropped.",
    "There is no operations bench, so the first year is delivery and hiring at the same time, with neither able to wait for the other.",
    "The founder still makes operational decisions informally. The role requires renegotiating that without making it a confrontation.",
  ],
  acceptable_gaps: [
    "No private credit background specifically — adjacent regulated fund operations transfers.",
    "No prior COO title, where the scope evidences the same accountability.",
    "Limited hands-on technology depth; the estate is bought, not built.",
  ],
  non_negotiable_gaps: [
    "No experience of a regulated control remediation carried to closure.",
    "No evidence of operating without line authority over the function being changed.",
  ],
  recommended_competency_weights: SAMPLE_OPERATIONAL_WEIGHTS.map((w) => ({
    competency_key: w.competency_key,
    competency_name: w.label,
    weight: w.weight,
    rationale: SAMPLE_WEIGHT_RATIONALE[w.competency_key] ?? "",
  })),
  recommended_interview_stages: [
    {
      stage: "Operating review",
      focus: "Scale carried, and what the candidate personally owned through it",
      format: "90 minutes, Managing Partner and COO of a portfolio company",
    },
    {
      stage: "Control environment",
      focus: "A remediation carried to closure, walked through end to end",
      format: "60 minutes, Head of Risk and an external control adviser",
    },
    {
      stage: "Partner panel",
      focus: "Influence without authority, and vendor judgment",
      format: "60 minutes, two origination partners",
    },
    {
      stage: "Organisation and bench",
      focus: "How the candidate builds a second line",
      format: "45 minutes, Managing Partner",
    },
  ],
};

/** Provenance for the approved profile — a record of a decision, not a form. */
export const SAMPLE_PROFILE_PROVENANCE = {
  version: 3,
  supersedes: 2,
  approvedDaysAgo: 8,
  approvedByName: "Elena Marchetti",
  promptVersion: "eia-role-architect-v1",
  /** Kept vague on purpose — the sample must not imply a specific model ran. */
  modelVersion: "prompt v2.4",
} as const;

/* ── The linked candidates ────────────────────────────────────────── */

export type SampleLinkedCandidate = {
  readonly id: string;
  readonly name: string;
  readonly initials: string;
  readonly currentRole: string;
  readonly stage: ExecutiveCandidateStage;
  readonly linkedDaysAgo: number;
  /** Where this person is in the chain, stated as artifacts not as a verdict. */
  readonly chainNote: string;
  readonly planStatus: "approved" | "draft" | "none";
  readonly assessmentStatus: "approved" | "draft" | "none";
};

/**
 * Four, folded out of the organisation pool rather than invented here —
 * Daniel Okonjo is already `sample-okonjo` in `SAMPLE_CANDIDATES` and
 * already appears in `SAMPLE_NETWORK` against "COO · Northvale Capital".
 *
 * Only Okonjo carries a full chain. That is deliberate: a module in which
 * every candidate is at the same stage demonstrates a list, and this one
 * demonstrates a funnel — which is also why the stage counts below never
 * get restated in prose. `sampleStageSummary()` derives them.
 */
export const SAMPLE_LINKED_CANDIDATES: readonly SampleLinkedCandidate[] = [
  {
    id: "sample-okonjo",
    name: "Daniel Okonjo",
    initials: "DO",
    currentRole: "CIO · Pellworth NHS Trust",
    stage: "advanced",
    linkedDaysAgo: 30,
    chainNote: "Assessment approved · all six competencies carry recorded evidence",
    planStatus: "approved",
    assessmentStatus: "approved",
  },
  {
    id: "sample-bellweather",
    name: "Ingrid Bellweather",
    initials: "IB",
    currentRole: "COO · Halden Freight",
    stage: "in_diligence",
    linkedDaysAgo: 27,
    chainNote: "Interview plan approved · assessment not started",
    planStatus: "approved",
    assessmentStatus: "none",
  },
  {
    id: "sample-quintero",
    name: "Tomasz Quintero-Reyes",
    initials: "TQ",
    currentRole: "Managing Director, Operations · Kestrel Bank",
    stage: "in_diligence",
    linkedDaysAgo: 21,
    chainNote: "Interview plan in draft · not yet approved",
    planStatus: "draft",
    assessmentStatus: "none",
  },
  {
    id: "sample-sowande",
    name: "Rachel Sowande",
    initials: "RS",
    currentRole: "COO · Bramblewick Retail",
    stage: "on_hold",
    linkedDaysAgo: 18,
    chainNote: "Paused at the candidate's request",
    planStatus: "none",
    assessmentStatus: "none",
  },
];

/** The candidate whose chain is complete. */
export const SAMPLE_WORKED_CANDIDATE_ID = "sample-okonjo";

export function sampleLinkedCandidate(
  id: string
): SampleLinkedCandidate | undefined {
  return SAMPLE_LINKED_CANDIDATES.find((c) => c.id === id);
}

/**
 * Stage counts, derived.
 *
 * The shipped workspace header said "4 candidates in diligence" beside its
 * own chain saying "2 in diligence · 1 advanced" — one screen contradicting
 * itself, the same class as the comparison screen's "two at Tier 2" over a
 * table of three. Nothing states a stage count as a literal any more.
 */
export function sampleStageCounts(): Record<ExecutiveCandidateStage, number> {
  const counts = {
    identified: 0,
    in_diligence: 0,
    advanced: 0,
    on_hold: 0,
    declined: 0,
  } satisfies Record<ExecutiveCandidateStage, number>;
  for (const c of SAMPLE_LINKED_CANDIDATES) counts[c.stage] += 1;
  return counts;
}

/* ── The interview plan (agent-drafted, human-approved) ───────────── */

/**
 * Okonjo's approved plan, in `InterviewPlanContent` shape.
 *
 * This is the one artifact in the module where an agent says something
 * shaped by a specific person, so the prompt's own constraints are the
 * fixture's constraints:
 *
 * - `candidate_specific_questions` derive only from what the record holds —
 *   a sector move, a tenure, a scale figure. They ask the person to account
 *   for a fact, which is the opposite of asserting one about them.
 * - `weak_answer_indicators` and `red_flags` describe **answer content**.
 *   Read them back: every one is a property of a reply, not of a character.
 * - No stage recommends a decision, and `recommended_interviewer_role` is
 *   always a role.
 *
 * `competency_coverage` is computed rather than written — the real
 * generator computes it server-side and the sample must not be able to
 * claim coverage its own stage assignments do not support.
 */
const SAMPLE_PLAN_STAGES: InterviewPlanContent["stages"] = [
  {
    stage_name: "Operating review",
    objective:
      "Establish what the candidate personally owned through a doubling in volume, separated from what their organisation did around them.",
    recommended_interviewer_role: "Managing Partner",
    duration_minutes: 90,
    assigned_competencies: ["scaling_systems", "financial_stewardship"],
    core_questions: [
      "Take one function you scaled and walk through it from the decision to change it to the point you stopped watching it. What did you do personally?",
      "What was the cycle time or unit cost before you started, and how did you know that number was right?",
      "Which part of that scale-up did you get wrong, and when did you find out?",
      "How did the cost base move relative to volume, and who owned that relationship before you did?",
    ],
    follow_up_questions: [
      "Who else could have told me that number, and would they have given me the same one?",
      "What did you stop doing to make room for it?",
      "If you had six months rather than eighteen, which part would you have cut?",
    ],
    candidate_specific_questions: [
      "The record shows a shared-services function going from roughly 40 to 190 people over two years. What was the ratio of hired to inherited in that, and what did that do to the operating cadence?",
      "Payroll was insourced after a vendor transition failed. Walk through how the decision to insource was reached and who carried it.",
    ],
    evidence_to_listen_for: [
      "A before figure that was measured rather than reconstructed afterwards.",
      "A decision the candidate made against advice, with the reasoning available.",
      "Specific mechanics of how work was re-sequenced, not only that it was.",
      "An account of the failure that names what it cost.",
    ],
    weak_answer_indicators: [
      "Scale described in headcount or budget only, with no measure of throughput or quality.",
      "The answer stays at programme level and never reaches a decision the candidate made.",
      "Improvements quantified only after the fact, from a figure nobody agreed at the start.",
    ],
    red_flags: [
      "The account changes shape when asked for the before figure a second time.",
      "Every difficulty in the answer is attributed to a party not in the room.",
    ],
  },
  {
    stage_name: "Control environment",
    objective:
      "Test a regulated control remediation carried to closure — the mandate's one non-negotiable — end to end rather than in summary.",
    recommended_interviewer_role: "Head of Risk",
    duration_minutes: 60,
    assigned_competencies: ["regulatory_compliance"],
    core_questions: [
      "Take a control finding you owned. What was the finding as written, and what did closure require in the regulator's terms rather than yours?",
      "Describe the escalation path you built for it and who could use it without your permission.",
      "Where did that programme slip, and what did you tell the board at the time rather than afterwards?",
      "How did you know the control was working six months after closure?",
    ],
    follow_up_questions: [
      "Who signed off, and what did they need to see that you did not initially have?",
      "What would have happened if you had missed the date?",
      "Which of those controls would still hold if you removed the person running it?",
    ],
    candidate_specific_questions: [
      "The remediation on record was carried to regulator sign-off in a clinical rather than a financial-services regime. Which parts of that approach do you expect not to transfer to a supervised credit manager?",
    ],
    evidence_to_listen_for: [
      "The finding stated in the regulator's language, not paraphrased into something easier.",
      "An escalation path with a named owner other than the candidate.",
      "A slip disclosed at the time, with the disclosure described.",
      "A post-closure check that could have failed.",
    ],
    weak_answer_indicators: [
      "Closure evidenced by a status report rather than by an acceptance.",
      "The control described as a policy rather than as something that runs.",
      "No account of what the programme cost the business while it ran.",
    ],
    red_flags: [
      "Remediation described entirely in terms of documentation produced.",
      "The answer cannot name what would have constituted failure.",
    ],
  },
  {
    stage_name: "Partner panel",
    objective:
      "Test influence where there is no line authority, and vendor judgment on a bought rather than built estate.",
    recommended_interviewer_role: "Origination Partner",
    duration_minutes: 60,
    assigned_competencies: [
      "cross_functional_influence",
      "technology_strategy",
    ],
    core_questions: [
      "Describe changing how a group worked when you had no authority over any of them. What did you have instead?",
      "Tell me about a time senior people kept deferring an operational conversation. How did it end?",
      "Walk me through a vendor decision where the cheaper option was the wrong one, and how you carried that argument.",
      "How do you decide when a bought system stops being adequate?",
    ],
    follow_up_questions: [
      "Which of those people would take your call now, and which would not?",
      "What did you concede to get it?",
      "Where has that judgment about a vendor turned out to be wrong?",
    ],
    candidate_specific_questions: [
      "The move from a provider-side CIO seat to a partnership means influence stops being structural. What in the record evidences working that way already?",
    ],
    evidence_to_listen_for: [
      "A named mechanism — a forum, a measure, a shared commitment — rather than force of personality.",
      "A concession made deliberately, with the reasoning.",
      "Vendor judgment expressed in terms of exit and integration, not features.",
      "An account of an argument the candidate lost and what they did next.",
    ],
    weak_answer_indicators: [
      "Influence described as relationship-building with no mechanism behind it.",
      "Vendor selection reasoned entirely on cost or on brand.",
      "The answer assumes an escalation route that a partnership does not have.",
    ],
    red_flags: [
      "Every example of influence resolves by escalating to someone with authority.",
      "Technology judgment offered at a depth the answer cannot then support under follow-up.",
    ],
  },
  {
    stage_name: "Organisation and bench",
    objective:
      "Test how the candidate builds a second line, given the firm has none and cannot absorb this hire leaving.",
    recommended_interviewer_role: "Managing Partner",
    duration_minutes: 45,
    assigned_competencies: ["talent_magnetism"],
    core_questions: [
      "Who have you hired or promoted who went on to hold your job or one like it?",
      "How did you build a bench while delivering, when neither could wait for the other?",
      "What do you do about a capable person in the wrong seat?",
    ],
    follow_up_questions: [
      "What did retention look like across that period, and what moved it?",
      "Which of those hires did not work, and how long did it take you to act?",
    ],
    candidate_specific_questions: [
      "The function grew to roughly 190 people. Who was running it when you were not in the room?",
    ],
    evidence_to_listen_for: [
      "Named people whose progression the candidate can describe concretely.",
      "A hiring decision made against short-term delivery pressure.",
      "A specific account of acting slowly, and what it cost.",
    ],
    weak_answer_indicators: [
      "Bench described as a plan rather than as people who exist.",
      "Development described entirely as training provided.",
    ],
    red_flags: [
      "No example of a hire that did not work out.",
      "Succession described as something the organisation would arrange.",
    ],
  },
];

/** Coverage computed from the stage assignments, as the real generator does. */
function computeCoverage(
  stages: InterviewPlanContent["stages"],
  weights: readonly OperationalWeight[]
): InterviewPlanContent["competency_coverage"] {
  return weights.map((w) => ({
    competency_key: w.competency_key,
    competency_name: w.label,
    weight: w.weight,
    covered_by: stages
      .filter((s) => s.assigned_competencies.includes(w.competency_key))
      .map((s) => s.stage_name),
  }));
}

export const SAMPLE_INTERVIEW_PLAN: InterviewPlanContent = {
  overview:
    "Four stages, weighted toward the two competencies that carry 45% of the approved set between them. The control-environment stage stands alone because the mandate's one non-negotiable sits inside it and a shared stage would let it be covered in passing. Every stage gathers evidence against the approved profile; none of them produces a recommendation.",
  stages: SAMPLE_PLAN_STAGES,
  competency_coverage: computeCoverage(
    SAMPLE_PLAN_STAGES,
    SAMPLE_OPERATIONAL_WEIGHTS
  ),
};

export const SAMPLE_PLAN_PROVENANCE = {
  version: 2,
  supersedes: 1,
  approvedDaysAgo: 4,
  approvedByName: "Elena Marchetti",
  promptVersion: "eia-interview-architect-v1",
  modelVersion: "prompt v1.8",
} as const;

/* ── The assessment (human-authored — there is no agent) ──────────── */

/**
 * Okonjo's approved assessment.
 *
 * `source_stages` are **stage names from the approved plan**, because
 * `compileExecutiveReport` filters provenance against the plan's stage names
 * and silently drops anything else. The old hand-written sample cited
 * "stages 1, 3", which the real report would have dropped on the floor.
 *
 * `evidence_rollup` and `weighted_evidence_strength` are computed below
 * rather than typed. The product stamps them server-side on every save and
 * never trusts a client copy; a fixture that typed them would be asserting
 * a number the product computes.
 */
const SAMPLE_COMPETENCY_ASSESSMENTS: readonly CompetencyAssessment[] = [
  {
    competency_key: "scaling_systems",
    rating: "strong",
    evidence:
      "Took a shared-services function from roughly 40 to 190 people across two years, including the decision to insource payroll after a vendor transition failed. Gave cycle-time figures before and after and could say where the before figure came from. Named two things he would do differently and one he would not.",
    source_stages: ["Operating review"],
  },
  {
    competency_key: "regulatory_compliance",
    rating: "strong",
    evidence:
      "Carried a control remediation through to regulator sign-off and walked the escalation path he built, including who could use it without him. Volunteered where the programme slipped, what he told the board at the time, and what the slip cost.",
    source_stages: ["Control environment"],
  },
  {
    competency_key: "cross_functional_influence",
    rating: "moderate",
    evidence:
      "Described changing clinical working practice without authority over any clinician, and named the forum he used rather than describing it as relationship-building. Less convincing on the partnership case: the two examples both had an escalation route available, which this seat does not have. Panel asked twice and did not close it.",
    source_stages: ["Partner panel", "Operating review"],
  },
  {
    competency_key: "financial_stewardship",
    rating: "strong",
    evidence:
      "Could account for the cost base in unit terms and explain which parts moved with volume and which did not. Described taking ownership of a run-rate nobody had held before, and the argument it took to get it.",
    source_stages: ["Operating review"],
  },
  {
    competency_key: "talent_magnetism",
    rating: "moderate",
    evidence:
      "Named three people he promoted and could describe where each went. Gave a specific account of acting slowly on a hire that was not working and what the delay cost. Thinner on building a bench under delivery pressure — the growth described happened with budget available, which is not this situation.",
    source_stages: ["Organisation and bench"],
  },
  {
    competency_key: "technology_strategy",
    rating: "limited",
    evidence:
      "Answered at the level of vendor selection rather than integration or exit. One concrete example given, and it did not extend under follow-up. The stage ran twelve minutes short and this competency was the one not fully covered.",
    source_stages: ["Partner panel"],
  },
];

const SAMPLE_ASSESSMENT_ROLLUP = computeEvidenceRollup(
  SAMPLE_OPERATIONAL_WEIGHTS,
  SAMPLE_COMPETENCY_ASSESSMENTS
);

export const SAMPLE_ASSESSMENT: AssessmentContent = {
  overall_summary:
    "Six competencies assessed across four stages. The two heaviest — scaling and the control environment — carry strong recorded evidence, and the financial ownership question was answered more completely than the profile required. Two competencies are moderate and one is limited, and the limited one is limited partly because its stage ran short rather than because the answers were weak. Recorded for the decision panel; the decision is theirs.",
  competency_assessments: [...SAMPLE_COMPETENCY_ASSESSMENTS],
  evidence_rollup: SAMPLE_ASSESSMENT_ROLLUP,
  weighted_evidence_strength: computeWeightedEvidenceStrength(
    SAMPLE_ASSESSMENT_ROLLUP
  ),
};

export const SAMPLE_ASSESSMENT_PROVENANCE = {
  version: 1,
  approvedDaysAgo: 2,
  approvedByName: "Elena Marchetti",
} as const;

/** Ratings by key — for screens that show the scale without the narrative. */
export function sampleRating(key: string): EvidenceRating {
  return (
    SAMPLE_COMPETENCY_ASSESSMENTS.find((a) => a.competency_key === key)?.rating ??
    "none"
  );
}

/* ── The audit trail ──────────────────────────────────────────────── */

export type SampleExecutiveAuditEntry = {
  readonly daysAgo: number;
  readonly eventType: string;
  readonly detail: string;
};

/**
 * Append-only, newest first. Written as `event_type · subject` because that
 * is what `executive_audit_events` actually stores — the sentence is
 * assembled at render, the same division `describe.ts` makes for the
 * activity trail.
 */
const AUDIT_SEEDS: readonly SampleExecutiveAuditEntry[] = [
  { daysAgo: 2, eventType: "assessment_approved", detail: "Daniel Okonjo · v1" },
  { daysAgo: 3, eventType: "assessment_created", detail: "Daniel Okonjo" },
  {
    daysAgo: 4,
    eventType: "interview_plan_approved",
    detail: "Ingrid Bellweather · v2",
  },
  {
    daysAgo: 4,
    eventType: "interview_plan_approved",
    detail: "Daniel Okonjo · v2",
  },
  {
    daysAgo: 5,
    eventType: "candidate_stage_changed",
    detail: "Rachel Sowande · in diligence → on hold",
  },
  {
    daysAgo: 6,
    eventType: "interview_plan_generated",
    detail: "Tomasz Quintero-Reyes · v1 draft",
  },
  {
    daysAgo: 8,
    eventType: "profile_approved",
    detail: "v3 · operational weights written",
  },
  { daysAgo: 8, eventType: "profile_new_version", detail: "v2 superseded" },
  { daysAgo: 14, eventType: "profile_generated", detail: "v2 draft" },
];

/**
 * The trail, with the link events derived from the candidates themselves.
 *
 * This was typed once and immediately drifted: the seed said Rachel
 * Sowande was linked 11 days ago while her own row says 18, so the
 * workspace's audit panel put her on day 30 and the candidates screen put
 * her on day 23 — the same fact, two screens, two answers. Found by
 * reading the rendered pages rather than by any test, which is the third
 * time that has been the case in this programme.
 *
 * `linkedDaysAgo` is now the only place a link date exists.
 */
export const SAMPLE_EXECUTIVE_AUDIT: readonly SampleExecutiveAuditEntry[] = [
  ...AUDIT_SEEDS,
  ...SAMPLE_LINKED_CANDIDATES.map((c) => ({
    daysAgo: c.linkedDaysAgo,
    eventType: "candidate_linked",
    detail: c.name,
  })),
].sort((a, b) => a.daysAgo - b.daysAgo);

/* ── The diligence chain ──────────────────────────────────────────── */

export type SampleChainStep = {
  readonly label: string;
  readonly state: "ready" | "approved" | "linked" | "progress" | "locked";
  readonly badge: string;
  readonly detail: string;
};

/**
 * The chain, derived from the fixture rather than typed.
 *
 * Every badge and every count below reads from the arrays above, so the
 * chain cannot disagree with the panels underneath it — which is exactly
 * what the shipped version did.
 */
export function sampleChain(): readonly SampleChainStep[] {
  const counts = sampleStageCounts();
  const plans = SAMPLE_LINKED_CANDIDATES.filter((c) => c.planStatus !== "none");
  const approvedPlans = plans.filter((c) => c.planStatus === "approved");
  const draftPlans = plans.filter((c) => c.planStatus === "draft");
  const notStarted = SAMPLE_LINKED_CANDIDATES.length - plans.length;
  const approvedAssessments = SAMPLE_LINKED_CANDIDATES.filter(
    (c) => c.assessmentStatus === "approved"
  );

  return [
    {
      label: "Company context",
      state: "ready",
      badge: "Ready",
      detail: "Grounded on day 1 · 22 sources",
    },
    {
      label: "Success profile",
      state: "approved",
      badge: "Approved",
      detail: `v${SAMPLE_PROFILE_PROVENANCE.version} · approved by ${SAMPLE_PROFILE_PROVENANCE.approvedByName}`,
    },
    {
      label: "Candidates",
      state: "linked",
      badge: `${SAMPLE_LINKED_CANDIDATES.length} linked`,
      detail: `${counts.in_diligence} in diligence · ${counts.advanced} advanced · ${counts.on_hold} on hold`,
    },
    {
      label: "Interview plans",
      state: "progress",
      badge: "In progress",
      detail: `${approvedPlans.length} approved · ${draftPlans.length} draft · ${notStarted} not started`,
    },
    {
      label: "Assessments",
      state: approvedAssessments.length > 0 ? "progress" : "locked",
      badge:
        approvedAssessments.length > 0
          ? `${approvedAssessments.length} approved`
          : "Locked",
      detail: "Opens per candidate once their interview plan is approved",
    },
  ];
}
