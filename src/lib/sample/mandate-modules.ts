import { SAMPLE_MANDATES, sampleMandate, type SampleMandate } from "./data";

/**
 * The sample mandate's seven module screens — W3.
 *
 * Everything here hangs off `sample-larkspur`, the mandate the rest of the
 * sample workspace already points at. It is a separate file from `data.ts`
 * only because that file had grown past 900 lines; the rules at the top of
 * it apply here unchanged, and two of them do real work below.
 *
 * **No absolute dates.** Day counts and "N days ago", resolved at render.
 *
 * **Nothing contradicts `SAMPLE_MANDATES`.** Larkspur states 18 candidates,
 * four at tier 1, day 27 of 90, stalling. The funnel, the KPI tiles and the
 * report all derive from that row rather than restating it, so the figures
 * on seven screens cannot drift apart. `sample-larkspur` carries only three
 * *named* candidates in `SAMPLE_CANDIDATES` — the pool is bigger than the
 * rows on screen, which is true of a real mandate too, and the derived
 * counts are careful to say "18" and show three.
 *
 * ## What the agents are allowed to say here
 *
 * Four of these screens render AI output about people, and CLAUDE.md's rule
 * is not negotiable: decision support, never a hire/no-hire verdict, never a
 * psychological or mental-health label, never an inference of a protected
 * characteristic.
 *
 * The precedent is already set by `sample-candidate-detail.tsx`, and it is
 * followed rather than re-argued: **a score never travels without the fact
 * that produced it**, which is what stops a number reading as a verdict.
 * Every judgement below is about evidence in a CV, a stage in a process, or
 * a pattern across several decisions. None of it is about what anybody is
 * like.
 *
 * The `bias_patterns` block on the feedback screen is the sharp edge, and it
 * is deliberately written as arithmetic rather than character: *the stated
 * reason does not match the record*, with both halves shown. That is a
 * pattern a person can check and disagree with, which is the difference
 * between decision support and a label.
 */

export const SAMPLE_MANDATE_ID = "sample-larkspur";

/** The one mandate with module screens behind it. */
export function sampleModuleMandate(): SampleMandate {
  const m = sampleMandate(SAMPLE_MANDATE_ID);
  // Cannot happen: `SAMPLE_MANDATES` is a literal and a test pins the id.
  if (!m) throw new Error(`${SAMPLE_MANDATE_ID} is missing from SAMPLE_MANDATES`);
  return m;
}

/** Which modules the sample workspace actually renders. */
export const SAMPLE_MODULES = [
  { slug: "onboarding", label: "Onboarding", meta: "5 steps complete" },
  { slug: "spec", label: "Job spec", meta: "FINAL_V01" },
  { slug: "calibration-history", label: "Calibration", meta: "3 versions" },
  { slug: "metrics", label: "Metrics", meta: "Stalling" },
  { slug: "hiring-manager", label: "Hiring manager", meta: "Link live" },
  { slug: "feedback", label: "Feedback", meta: "3 logged" },
  { slug: "reports", label: "Reports", meta: "Week 4" },
  { slug: "ranking", label: "Ranking", meta: "6 scored" },
  { slug: "comparison", label: "Comparison", meta: "2 + 2 slate" },
] as const;

/**
 * Modules that exist in the product and not yet in the sample.
 *
 * Listed rather than omitted. Before this they redirected to `/app/home`
 * with no message — eleven routes, silently — and a rail that simply left
 * them out would still leave a typed URL doing it.
 */
export const SAMPLE_MODULES_PENDING = [
  { slug: "sourcing", label: "Sourcing" },
  { slug: "shortlist", label: "Shortlist" },
] as const;

export type SampleModuleSlug =
  | (typeof SAMPLE_MODULES)[number]["slug"]
  | (typeof SAMPLE_MODULES_PENDING)[number]["slug"];

/* ── Onboarding ──────────────────────────────────────────────────── */

export const SAMPLE_ONBOARDING = {
  completedDaysAgo: 24,
  origin: {
    kind: "Newly created",
    detail:
      "The board approved a platform replacement in Q1 and the engineering function has reported into the COO since the last CTO left. This is the first time the seat has existed at exec level.",
  },
  mustHaves: [
    "Has personally owned a platform replacement of £20m or more, start to finish",
    "Has run engineering inside a regulated provider — HIPAA, or a comparable regime named on the CV",
    "Has reported to a board and can evidence two or more board reviews",
    "Has built a function past 150 engineers without attrition running above 15%",
  ],
  antiPatterns: [
    "Pure greenfield background — the estate here is 11 years old and stays",
    "Consulting-only delivery, where the CV names programmes but not a team they held",
    "Vendor-estate CTOs whose scale claim is spend rather than engineers or users",
  ],
  stakeholders: [
    {
      name: "Tom Feltrin",
      title: "Chief Executive Officer",
      role: "Decision maker · final panel",
    },
    {
      name: "Priya Raman",
      title: "Chief People Officer",
      role: "Process owner · schedules the panel",
    },
    {
      name: "Dr Alan Meunier",
      title: "Chief Medical Officer",
      role: "Veto on clinical safety · joins round two",
    },
  ],
  priorities: [
    { name: "Technical Depth", weight: 4 },
    { name: "Domain Fit", weight: 5 },
    { name: "Leadership Scale", weight: 5 },
    { name: "Regulatory Exposure", weight: 4 },
    { name: "Transformation Track Record", weight: 5 },
  ],
} as const;

/* ── Job spec ────────────────────────────────────────────────────── */

export const SAMPLE_SPEC = {
  version: 1,
  label: "FINAL_V01",
  generatedDaysAgo: 22,
  finalisedDaysAgo: 21,
  characters: 6_112,
  sections: [
    {
      heading: "The mandate",
      body: "Larkspur Health is replacing an eleven-year-old care-records platform while it is in daily clinical use across 1,400 beds. The Chief Technology Officer is a new seat at executive level: engineering has reported to the COO since 2024, and the board's Q1 approval of the replacement programme is what created the role. The first eighteen months are the replacement; what follows is a function that has never had its own voice in the room.",
    },
    {
      heading: "What this person owns",
      body: "A 210-person engineering and platform organisation across Boston and Manchester, a £34m annual run cost, and the replacement programme itself. The clinical safety case sits jointly with the Chief Medical Officer — the CTO cannot sign it alone, and the reporting line into the board is direct rather than through the COO.",
    },
    {
      heading: "Evidence we are looking for",
      body: "A platform replacement of comparable size that the candidate personally owned end to end, in an environment with a named regulatory regime. Scale is measured in engineers and concurrent clinical users, not in spend. Board exposure means minuted board reviews the candidate led, not attendance. Team building is evidenced by headcount growth alongside retention, because either alone is easy to produce.",
    },
    {
      heading: "What this is not",
      body: "Not a greenfield build — the existing estate stays and has to be migrated around. Not a vendor-management seat, though there are four material vendors. Not a role for a CTO whose last replacement programme was delivered by a consultancy they were supervising rather than by a team they held.",
    },
    {
      heading: "Package and process",
      body: "Base £185,000–£215,000 plus a 30% bonus and an LTIP that vests over three years, on the group scheme. Four stages: an introductory call, a technical deep dive, a panel with the CEO and CPO, and a clinical-safety conversation with the CMO. Regulatory references add roughly three weeks between offer and start.",
    },
  ],
} as const;

/* ── Calibration history ─────────────────────────────────────────── */

/**
 * The scoring engine has exactly five dimensions — `DIMENSION_KEYS` in
 * `onboarding-analysis.ts` — and a calibration model is a weight per key.
 * There is nowhere in the schema for a custom dimension name.
 *
 * The sample used to invent five prose ones ("Regulated-environment scale",
 * "Delivery pace"), which read well and taught a vocabulary the product does
 * not have: a prospect who saw them and then signed up would meet
 * Technical / Domain / Leadership / Regulatory / Transformation instead. The
 * evidence lines carry the specificity now, which is where it belongs.
 */
export type SampleCalibrationSnapshot = {
  readonly id: string;
  readonly version: number;
  readonly daysAgo: number;
  readonly trigger: string;
  readonly rationale: string;
  readonly weights: ReadonlyArray<{ readonly name: string; readonly weight: number }>;
  /** Dimensions whose weight moved in this version, for the diff chips. */
  readonly changed: readonly string[];
};

export const SAMPLE_CALIBRATION_HISTORY: readonly SampleCalibrationSnapshot[] = [
  {
    id: "sample-calib-3",
    version: 3,
    daysAgo: 5,
    trigger: "Recalibrated from hiring-manager feedback",
    rationale:
      "Three of the first four reviews cited regulated-environment evidence as the deciding factor and none cited engineering depth. Regulatory moves up, technical moves down, and the total is held at 100 so earlier scores stay comparable.",
    weights: [
      { name: "Regulatory", weight: 26 },
      { name: "Transformation", weight: 22 },
      { name: "Leadership", weight: 20 },
      { name: "Domain", weight: 18 },
      { name: "Technical", weight: 14 },
    ],
    changed: ["Regulatory", "Technical", "Domain"],
  },
  {
    id: "sample-calib-2",
    version: 2,
    daysAgo: 19,
    trigger: "Recruiter edit after the calibration review",
    rationale:
      "Leadership was under-weighted against a spec that makes the board line explicit and gives the CMO a veto. Raised at the expense of transformation, which the must-haves already gate on.",
    weights: [
      { name: "Regulatory", weight: 22 },
      { name: "Transformation", weight: 22 },
      { name: "Leadership", weight: 18 },
      { name: "Domain", weight: 15 },
      { name: "Technical", weight: 23 },
    ],
    changed: ["Leadership", "Transformation"],
  },
  {
    id: "sample-calib-1",
    version: 1,
    daysAgo: 24,
    trigger: "Compiled from onboarding",
    rationale:
      "Derived from the five weighted priorities and the anti-patterns. Technical starts high because the board approved a fixed programme end date and the estate is eleven years old; it is the dimension most likely to move once real candidates are scored against it.",
    weights: [
      { name: "Regulatory", weight: 20 },
      { name: "Transformation", weight: 26 },
      { name: "Leadership", weight: 12 },
      { name: "Domain", weight: 15 },
      { name: "Technical", weight: 27 },
    ],
    changed: [],
  },
];

/* ── Metrics ─────────────────────────────────────────────────────── */

/**
 * The funnel, stated as counts per stage.
 *
 * `sourced` is pinned to the mandate's own `candidates` figure by
 * `sampleFunnel()` rather than typed here, so the metrics screen and the
 * mandate list cannot disagree about how big the pool is.
 */
export const SAMPLE_FUNNEL_TAIL = [
  { stage: "Reviewed", count: 14 },
  { stage: "Shortlisted", count: 7 },
  { stage: "Submitted", count: 4 },
  { stage: "Interviewing", count: 2 },
  { stage: "Offer", count: 0 },
] as const;

export function sampleFunnel(): ReadonlyArray<{ stage: string; count: number }> {
  return [
    { stage: "Sourced", count: sampleModuleMandate().candidates },
    ...SAMPLE_FUNNEL_TAIL,
  ];
}

export const SAMPLE_METRICS = {
  weeklyVelocity: 5,
  addedThisWeek: 3,
  averageScore: 74,
  daysSinceLastMovement: 6,
  /**
   * Search-health suggestions. Note what these are *about*: the search, not
   * a candidate. An agent proposing "widen the boolean" is nowhere near
   * CLAUDE.md's line; the same agent ranking people would be.
   */
  suggestions: [
    {
      id: "sample-hint-1",
      severity: "attention",
      title: "The slate has been with the client for six days",
      body: "Two of the four submitted candidates have competing processes logged in your notes. A structured nudge with the trade-off summary attached is the usual unblock; the alternative is to let the slate age and re-open sourcing.",
    },
    {
      id: "sample-hint-2",
      severity: "routine",
      title: "Boolean variant 3 has produced nothing in eleven days",
      body: "The adjacent-industry string is returning candidates the calibration model scores below 60. Either the string is too broad or the adjacency is wrong for this mandate — worth a look before it is re-run.",
    },
    {
      id: "sample-hint-3",
      severity: "routine",
      title: "Regulatory exposure now carries 26% of the score",
      body: "After the last recalibration this is the heaviest dimension. Six candidates scored before version 3 have not been re-scored against it.",
    },
  ],
} as const;

/* ── Hiring manager ──────────────────────────────────────────────── */

export const SAMPLE_HM = {
  token: {
    label: "Priya Raman · Chief People Officer",
    contactName: "Priya Raman",
    createdDaysAgo: 8,
    expiresInDays: 22,
    opens: 4,
  },
  /** Who the slate went to, in the order it renders in the portal. */
  slate: [
    {
      candidateId: "sample-anand",
      name: "Priya Anand",
      headline: "Group CTO · Thornbury Care",
      tier: 1,
      fit: 87,
      evidence: "£48m records replacement delivered; 6,400-staff regulated provider",
    },
    {
      candidateId: "sample-okonjo",
      name: "Daniel Okonjo",
      headline: "CIO · Pellworth NHS Trust",
      tier: 1,
      fit: 84,
      evidence: "Two board reviews led; 90 → 240 engineers at under 9% attrition",
    },
    {
      candidateId: "sample-tavares",
      name: "Rafael Tavares",
      headline: "CTO · Bramblewick Retail",
      tier: 2,
      fit: 76,
      evidence: "Comparable programme scale; regulated exposure is retail PCI, not clinical",
    },
  ],
  reviews: [
    {
      id: "sample-hmreview-1",
      reviewer: "Priya Raman",
      daysAgo: 6,
      ratings: [
        { candidate: "Priya Anand", rating: "Advance" },
        { candidate: "Daniel Okonjo", rating: "Advance" },
        { candidate: "Rafael Tavares", rating: "Hold" },
      ],
      topConcern:
        "Rafael's regulatory exposure is PCI rather than clinical. Tom wants to see how that transfers before we spend a panel slot on it.",
    },
    {
      id: "sample-hmreview-2",
      reviewer: "Dr Alan Meunier",
      daysAgo: 3,
      ratings: [
        { candidate: "Priya Anand", rating: "Advance" },
        { candidate: "Daniel Okonjo", rating: "Hold" },
      ],
      topConcern:
        "Daniel's replacement ran alongside the old system for nineteen months. Ours cannot; I want to understand what that changes about his approach.",
    },
  ],
} as const;

/* ── Feedback ────────────────────────────────────────────────────── */

export const SAMPLE_FEEDBACK = {
  entries: [
    {
      id: "sample-fb-1",
      source: "Hiring manager portal",
      author: "Priya Raman",
      daysAgo: 6,
      body: "The two we want to progress both come from providers of our size or bigger. Rafael is strong on the programme but the regulated side is not comparable. Keep looking in health and adjacent regulated infrastructure.",
      triggeredRecalibration: true,
    },
    {
      id: "sample-fb-2",
      source: "Recruiter",
      author: "Elena Marchetti",
      daysAgo: 5,
      body: "Debrief with Tom: he keeps returning to whether the person has done this with the old system still running. That is not in the spec as written and it is doing a lot of work in his read of each CV.",
      triggeredRecalibration: false,
    },
    {
      id: "sample-fb-3",
      source: "Hiring manager portal",
      author: "Dr Alan Meunier",
      daysAgo: 3,
      body: "Clinical safety is the part I care about. Neither of the two I have seen has signed a safety case themselves — they have both had someone who did.",
      triggeredRecalibration: false,
    },
  ],
  interpreted: {
    summary:
      "Three reviews across two reviewers converge on one dimension the spec under-weights: comparable regulated scale, specifically clinical rather than regulated-in-general. A second signal — parallel running — appears twice and is not in the spec at all.",
    preferenceChanges: [
      "Regulated exposure is being read as clinical exposure. PCI and financial-services regimes are not being treated as comparable, whatever the spec says.",
      "Both reviewers ask whether the old system ran in parallel. That is a constraint on approach, not on background, and it is not currently a scored dimension.",
      "Personally signing a clinical safety case has been raised once and would exclude both submitted candidates if applied as a must-have.",
    ],
    biasPatterns: [
      "Three of the four holds cite insufficient scale. Two of those three candidates ran larger estates than one of the candidates advanced. The stated reason does not match the record, so the operative reason is probably something else — worth asking before the next slate.",
    ],
    contradictions: [
      "The spec says regulatory exposure means a named regime on the CV. The reviews are applying a narrower test — clinical only. One of the two has to move.",
    ],
    weightAdjustments: [
      { dimension: "Regulatory", from: 22, to: 26 },
      { dimension: "Technical", from: 23, to: 14 },
      { dimension: "Domain", from: 15, to: 18 },
    ],
    applied: true,
  },
} as const;

/* ── Weekly report ───────────────────────────────────────────────── */

export type SampleReport = {
  readonly id: string;
  readonly weekNumber: number;
  readonly generatedDaysAgo: number;
  readonly executiveSummary: string;
  readonly topCandidates: ReadonlyArray<{
    readonly name: string;
    readonly headline: string;
    readonly tier: number;
    readonly evidence: string;
  }>;
  readonly sourcedCount: number;
  readonly sourcedNames: readonly string[];
  readonly pipelineMoves: readonly string[];
  readonly rankMoves: readonly string[];
  readonly feedbackInsights: readonly string[];
  readonly nextSteps: readonly string[];
  readonly marketCommentary: string;
};

export const SAMPLE_REPORTS: readonly SampleReport[] = [
  {
    id: "sample-report-w4",
    weekNumber: 4,
    generatedDaysAgo: 1,
    executiveSummary:
      "The slate has been with Larkspur for six days without a scheduling decision, which is the single thing holding this search. Two reviewers have now responded and they agree on the two candidates to advance. The calibration model was re-derived from that feedback on day 22 and six earlier candidates have not been re-scored against it.",
    topCandidates: [
      {
        name: "Priya Anand",
        headline: "Group CTO · Thornbury Care",
        tier: 1,
        evidence: "£48m records replacement delivered; 6,400-staff regulated provider",
      },
      {
        name: "Daniel Okonjo",
        headline: "CIO · Pellworth NHS Trust",
        tier: 1,
        evidence: "Two board reviews led; 90 → 240 engineers at under 9% attrition",
      },
      {
        name: "Rafael Tavares",
        headline: "CTO · Bramblewick Retail",
        tier: 2,
        evidence: "Comparable programme scale; regulated exposure is PCI, not clinical",
      },
    ],
    sourcedCount: 3,
    sourcedNames: ["Marta Koval", "Idris Bello", "Hanne Lindqvist"],
    pipelineMoves: [
      "Priya Anand · Shortlisted → Submitted",
      "Daniel Okonjo · Shortlisted → Submitted",
      "Rafael Tavares · Reviewed → Shortlisted",
    ],
    rankMoves: [
      "Daniel Okonjo · 4 → 2, after regulated-environment scale was re-weighted",
      "Rafael Tavares · 2 → 3, same recalibration",
    ],
    feedbackInsights: [
      "Both reviewers are reading regulated exposure as clinical exposure specifically.",
      "Parallel running has been raised twice and is not a scored dimension.",
    ],
    nextSteps: [
      "Chase the panel date — six days is the longest gap in this search so far",
      "Re-score the six pre-version-3 candidates against the new weights",
      "Put the parallel-running question to Tom before the spec is reissued",
    ],
    marketCommentary:
      "Clinical-platform CTOs with a delivered replacement at this scale are a pool of roughly forty in the UK and Ireland, and four of them changed roles in the last quarter. The narrower reading of regulated exposure that the reviews imply would cut the addressable pool by about half.",
  },
  {
    id: "sample-report-w3",
    weekNumber: 3,
    generatedDaysAgo: 8,
    executiveSummary:
      "First slate delivered on day 19. Sourcing produced eleven candidates against the revised boolean, of which four scored above 75.",
    topCandidates: [],
    sourcedCount: 11,
    sourcedNames: [],
    pipelineMoves: [],
    rankMoves: [],
    feedbackInsights: [],
    nextSteps: ["Deliver the slate", "Book the technical deep dives"],
    marketCommentary: "",
  },
  {
    id: "sample-report-w2",
    weekNumber: 2,
    generatedDaysAgo: 15,
    executiveSummary:
      "Calibration reviewed and revised. Leadership raised after the spec made the board line explicit.",
    topCandidates: [],
    sourcedCount: 6,
    sourcedNames: [],
    pipelineMoves: [],
    rankMoves: [],
    feedbackInsights: [],
    nextSteps: ["Run the adjacent-industry boolean"],
    marketCommentary: "",
  },
];

/** Guards the fixture against a mandate id that no longer exists. */
export function sampleModuleMandateExists(): boolean {
  return SAMPLE_MANDATES.some((m) => m.id === SAMPLE_MANDATE_ID);
}
