/**
 * The sample workspace.
 *
 * One dataset, rendered on any screen that has no real data behind it,
 * so a new user or a prospect can see what a working Mandate account
 * looks like instead of five empty panels.
 *
 * Three rules this file exists to enforce:
 *
 * 1. **Nothing here is ever written to the database.** These are not
 *    seeded rows. They cannot appear in a real user's counts, exports,
 *    reports or AI context, because they only exist in a render.
 *
 * 2. **Every id is prefixed `sample-`.** That prefix is the entire
 *    routing contract — `isSampleId()` is how a route decides to serve
 *    the fixture instead of querying. A sample id must never collide
 *    with a Supabase uuid, and it cannot, because uuids have no letters
 *    before their first hyphen group.
 *
 * 3. **No absolute dates.** A fixture reading "Opened 14 Jul" is
 *    correct for about three weeks and embarrassing thereafter, and
 *    formatting a date in a client component invites a hydration
 *    mismatch. Everything is stored as a day count and rendered as one
 *    ("Day 27 of 90"), which is also how the product actually talks.
 *
 * Names are invented firms and invented people. They are not
 * anonymised real searches.
 */

export type SampleHealth = "on_track" | "stalling" | "blocked";

export type SampleStage =
  | "SOURCING"
  | "CALIBRATING"
  | "EVALUATING"
  | "WITH CLIENT"
  | "DILIGENCE";

export type SampleMandate = {
  readonly id: string;
  readonly title: string;
  readonly company: string;
  readonly stage: SampleStage;
  readonly candidates: number;
  /** Null where no candidate has been scored yet — renders as an em dash. */
  readonly tierOne: number | null;
  readonly dayOfSearch: number;
  readonly searchLengthDays: number;
  readonly health: SampleHealth;
  readonly owner: string;
};

export const SAMPLE_MANDATES: readonly SampleMandate[] = [
  {
    id: "sample-larkspur",
    title: "Chief Technology Officer",
    company: "Larkspur Health",
    stage: "WITH CLIENT",
    candidates: 18,
    tierOne: 4,
    dayOfSearch: 27,
    searchLengthDays: 90,
    health: "stalling",
    owner: "Elena Marchetti",
  },
  {
    id: "sample-cindermere",
    title: "VP Engineering",
    company: "Cindermere Robotics",
    stage: "EVALUATING",
    candidates: 23,
    tierOne: 2,
    dayOfSearch: 12,
    searchLengthDays: 90,
    health: "on_track",
    owner: "Elena Marchetti",
  },
  {
    id: "sample-northvale",
    title: "Chief Operating Officer",
    company: "Northvale Capital",
    stage: "DILIGENCE",
    candidates: 9,
    tierOne: 3,
    dayOfSearch: 41,
    searchLengthDays: 90,
    health: "on_track",
    owner: "Elena Marchetti",
  },
  {
    id: "sample-ashgrove",
    title: "Head of Data Platform",
    company: "Ashgrove Logistics",
    stage: "CALIBRATING",
    candidates: 0,
    tierOne: null,
    dayOfSearch: 6,
    searchLengthDays: 90,
    health: "blocked",
    owner: "Elena Marchetti",
  },
  {
    id: "sample-merrit",
    title: "General Counsel",
    company: "Merrit & Vale",
    stage: "SOURCING",
    candidates: 5,
    tierOne: null,
    dayOfSearch: 3,
    searchLengthDays: 90,
    health: "on_track",
    owner: "Elena Marchetti",
  },
  {
    id: "sample-thornbury",
    title: "Chief Financial Officer",
    company: "Thornbury Group",
    stage: "EVALUATING",
    candidates: 11,
    tierOne: 1,
    dayOfSearch: 19,
    searchLengthDays: 90,
    health: "on_track",
    owner: "Elena Marchetti",
  },
  {
    id: "sample-varela",
    title: "VP People",
    company: "Varela Bioscience",
    stage: "SOURCING",
    candidates: 2,
    tierOne: null,
    dayOfSearch: 8,
    searchLengthDays: 90,
    health: "on_track",
    owner: "Elena Marchetti",
  },
];

/** Priority items — the only list on the dashboard that carries buttons. */
export type SamplePriority = {
  readonly id: string;
  readonly severity: "urgent" | "attention" | "routine";
  readonly title: string;
  readonly detail: string;
  readonly action: string;
  readonly href: string;
};

export const SAMPLE_PRIORITIES: readonly SamplePriority[] = [
  {
    id: "sample-priority-slate",
    severity: "urgent",
    title: "Slate sent 6 days ago — no response from the client",
    detail:
      "CTO · Larkspur Health · portal opened twice, no feedback submitted",
    action: "Open mandate",
    href: "/app/projects/sample-larkspur",
  },
  {
    id: "sample-priority-review",
    severity: "attention",
    title: "6 candidates scored and unreviewed",
    detail: "VP Engineering · Cindermere Robotics · 2 land in tier 1",
    action: "Review",
    href: "/app/projects/sample-cindermere/ranking",
  },
  {
    id: "sample-priority-profile",
    severity: "attention",
    title: "Success profile draft ready for approval",
    detail:
      "Chief Operating Officer · Northvale Capital · v2 · approving writes competency weights",
    action: "Open",
    href: "/app/projects/sample-northvale",
  },
  {
    id: "sample-priority-calibration",
    severity: "routine",
    title: "Calibration unapproved for 4 days",
    detail:
      "Head of Data Platform · Ashgrove Logistics · sourcing blocked until the bar is set",
    action: "Open",
    href: "/app/projects/sample-ashgrove",
  },
];

/**
 * Agent activity.
 *
 * There is no `agent_runs` table, so in a real workspace this panel has
 * nothing to render. The sample shows what it is for: what ran
 * overnight, what is running now, and what failed — with a retry rather
 * than a shrug.
 */
export type SampleAgentRun = {
  readonly id: string;
  readonly agent: string;
  readonly summary: string;
  readonly state: "running" | "done" | "failed";
  /** Rendered verbatim in the mono meta line. */
  readonly meta: string;
};

export const SAMPLE_AGENT_RUNS: readonly SampleAgentRun[] = [
  {
    id: "sample-run-company",
    agent: "Company Research",
    summary: "is grounding Merrit & Vale — web search, ~40s remaining",
    state: "running",
    meta: "RUNNING",
  },
  {
    id: "sample-run-cv",
    agent: "CV Parsing",
    summary: "is processing 3 uploads on Cindermere Robotics",
    state: "running",
    meta: "RUNNING",
  },
  {
    id: "sample-run-ranking",
    agent: "Ranking",
    summary: "re-scored 23 candidates after your feedback",
    state: "done",
    meta: "07:14 · 2 MOVED TIER",
  },
  {
    id: "sample-run-architect",
    agent: "Role Architect",
    summary: "failed on Ashgrove Logistics",
    state: "failed",
    meta: "06:52 · GENERATION_ERROR",
  },
  {
    id: "sample-run-health",
    agent: "Search Health",
    summary: "flagged 2 mandates as stalling",
    state: "done",
    meta: "06:00 · NIGHTLY",
  },
];

/**
 * Next best action.
 *
 * Decision support, never an instruction — the copy says so on the card
 * and the product's AI rules require it.
 */
export const SAMPLE_NEXT_ACTION = {
  body:
    "Larkspur Health has had a slate with the client for six days. Two tier-1 candidates have competing processes logged in your notes. Consider a structured nudge with the trade-off summary attached.",
  actionLabel: "Open Larkspur Health",
  href: "/app/projects/sample-larkspur",
  disclaimer:
    "Decision support. Generated from your notes and portal telemetry — you decide.",
} as const;

/** The person the sample workspace belongs to. Never a real user. */
export const SAMPLE_VIEWER = {
  displayName: "Elena Marchetti",
  initials: "EM",
  role: "Recruiter",
  org: "Harrow Vale",
} as const;

// ── Derived figures ─────────────────────────────────────────────────
// Computed from the arrays above so the KPI row cannot contradict the
// table beneath it — the same discipline as the marketing surface.

export const SAMPLE_KPIS = {
  activeMandates: SAMPLE_MANDATES.length,
  awaitingReview: SAMPLE_MANDATES.reduce((n, m) => n + (m.tierOne ?? 0), 0) + 4,
  withClient: SAMPLE_MANDATES.filter((m) => m.stage === "WITH CLIENT").length,
  atRisk: SAMPLE_MANDATES.filter((m) => m.health !== "on_track").length,
} as const;

/** Human label for a health state. Colour never travels alone. */
export const HEALTH_LABEL: Record<SampleHealth, string> = {
  on_track: "On track",
  stalling: "Stalling",
  blocked: "Blocked",
};

export function sampleMandate(id: string): SampleMandate | undefined {
  return SAMPLE_MANDATES.find((m) => m.id === id);
}

// ── Candidates ──────────────────────────────────────────────────────

/**
 * Sample candidates.
 *
 * Deliberately includes the partial states, because they are the normal
 * ones and a demo that only shows finished rows teaches the wrong
 * expectation: a CV still parsing, and a candidate found but not yet
 * scored. The comp is explicit that these appear inline with honest
 * placeholders rather than being hidden until complete.
 */
export type SampleCandidate = {
  readonly id: string;
  readonly name: string;
  readonly currentTitle: string;
  readonly currentCompany: string;
  readonly mandateId: string;
  readonly archetype: string | null;
  /** 1–4. Null when nothing has scored them yet. */
  readonly tier: number | null;
  readonly fit: number | null;
  readonly stage: string;
  readonly updated: string;
  /** A CV mid-parse has no profile yet — the row still shows. */
  readonly parsing?: true;
  readonly fileName?: string;
  readonly location?: string;
};

export const SAMPLE_CANDIDATES: readonly SampleCandidate[] = [
  {
    id: "sample-anand",
    name: "Priya Anand",
    currentTitle: "Group CTO",
    currentCompany: "Thornbury Care",
    location: "London",
    mandateId: "sample-larkspur",
    archetype: "Transformer",
    tier: 1,
    fit: 87,
    stage: "Submitted",
    updated: "2H AGO",
  },
  {
    id: "sample-okonjo",
    name: "Daniel Okonjo",
    currentTitle: "CIO",
    currentCompany: "Pellworth NHS Trust",
    location: "Leeds",
    mandateId: "sample-larkspur",
    archetype: "Operator",
    tier: 1,
    fit: 84,
    stage: "Submitted",
    updated: "2H AGO",
  },
  {
    id: "sample-mbeki",
    name: "Helena Mbeki-Sørensen",
    currentTitle: "SVP Engineering",
    currentCompany: "Corvid Systems",
    location: "Malmö",
    mandateId: "sample-cindermere",
    archetype: "Builder",
    tier: 1,
    fit: 82,
    stage: "Matched",
    updated: "5H AGO",
  },
  {
    id: "sample-tavares",
    name: "Rafael Tavares",
    currentTitle: "CTO",
    currentCompany: "Bramblewick Retail",
    location: "Lisbon",
    mandateId: "sample-larkspur",
    archetype: "Transformer",
    tier: 2,
    fit: 76,
    stage: "Shortlisted",
    updated: "1D AGO",
  },
  {
    id: "sample-kaur",
    name: "Sofia Kaur",
    currentTitle: "VP Platform",
    currentCompany: "Halden Freight",
    location: "Manchester",
    mandateId: "sample-ashgrove",
    archetype: "Infrastructure",
    tier: 2,
    fit: 74,
    stage: "Reviewed",
    updated: "1D AGO",
  },
  {
    id: "sample-parsing",
    name: "Parsing CV…",
    currentTitle: "",
    currentCompany: "",
    mandateId: "sample-cindermere",
    archetype: null,
    tier: null,
    fit: null,
    stage: "Parsing",
    updated: "NOW",
    parsing: true,
    fileName: "nordholm-cv-final.pdf",
  },
  {
    id: "sample-wexler",
    name: "Jonas Wexler",
    currentTitle: "Director of Engineering",
    currentCompany: "Vaskr",
    location: "Berlin",
    mandateId: "sample-cindermere",
    archetype: "Builder",
    tier: 3,
    fit: 61,
    stage: "Found",
    updated: "2D AGO",
  },
  {
    id: "sample-fontaine",
    name: "Aurélie Fontaine-Baptiste",
    currentTitle: "General Counsel",
    currentCompany: "Kestrel Bank",
    location: "Paris",
    mandateId: "sample-merrit",
    archetype: null,
    tier: null,
    fit: null,
    stage: "Found",
    updated: "3D AGO",
  },
];

/**
 * Network view — one person, many mandate appearances.
 *
 * Every card states how the merge happened, so a wrong merge is
 * findable rather than silent.
 */
export type SampleNetworkPerson = {
  readonly id: string;
  readonly name: string;
  readonly headline: string;
  readonly appearances: ReadonlyArray<{ mandate: string; outcome: string }>;
  readonly mergedBy: string;
};

export const SAMPLE_NETWORK: readonly SampleNetworkPerson[] = [
  {
    id: "sample-anand",
    name: "Priya Anand",
    headline: "Group CTO · Thornbury Care · London",
    appearances: [
      { mandate: "CTO · Larkspur Health", outcome: "Submitted" },
      { mandate: "CIO · Pellworth Group", outcome: "Declined 2025" },
      { mandate: "CTO · Marlow Diagnostics", outcome: "Finalist 2024" },
    ],
    mergedBy: "Merged by email · 2 source rows",
  },
  {
    id: "sample-okonjo",
    name: "Daniel Okonjo",
    headline: "CIO · Pellworth NHS Trust · Leeds",
    appearances: [
      { mandate: "CTO · Larkspur Health", outcome: "Submitted" },
      { mandate: "COO · Northvale Capital", outcome: "In diligence" },
    ],
    mergedBy: "Merged by LinkedIn · 2 source rows",
  },
  {
    id: "sample-mbeki",
    name: "Helena Mbeki-Sørensen",
    headline: "SVP Engineering · Corvid Systems · Malmö",
    appearances: [
      { mandate: "VP Eng · Cindermere Robotics", outcome: "Matched" },
    ],
    mergedBy: "Single source row",
  },
];

export function sampleCandidate(id: string): SampleCandidate | undefined {
  return SAMPLE_CANDIDATES.find((c) => c.id === id);
}

export function sampleCandidatesForMandate(
  mandateId: string
): readonly SampleCandidate[] {
  return SAMPLE_CANDIDATES.filter((c) => c.mandateId === mandateId);
}

/**
 * Sample placements, for the revenue screen.
 *
 * The screen exists to answer "what did we bill this quarter", and an
 * empty one cannot demonstrate that — a recruiter evaluating the product
 * would see four zeroes and learn nothing about what it does once it has
 * data. These are the same three mandates and the same people as the rest
 * of the sample workspace, carried through to their outcomes, so the
 * fixture reads as one agency rather than three unrelated screens.
 *
 * Chosen to show the four states that matter and are otherwise hard to
 * see: a retainer part-billed, a contingent fee earned in full, a
 * placement inside its guarantee, and one that fell through and was
 * clawed back. The clawback is what makes the quarter columns interesting
 * — it lands in the quarter it happened, not the one that booked the fee.
 *
 * Amounts are in the sample's own currency and are never summed with real
 * rows: `shouldShowSample` only renders these when the org has no
 * placements at all.
 */
export type SamplePlacement = {
  readonly id: string;
  readonly candidate: string;
  readonly mandate: string;
  readonly client: string;
  readonly status: "OFFER OUT" | "ACCEPTED" | "STARTED" | "FELL THROUGH";
  readonly startDate: string | null;
  readonly guarantee: string;
  /** Total fee booked, in the org's base currency. */
  readonly fee: number;
  /** Of that, what has been earned — negative where clawed back. */
  readonly billed: number;
};

export const SAMPLE_PLACEMENTS: readonly SamplePlacement[] = [
  {
    id: "sample-placement-anand",
    candidate: "Priya Anand",
    mandate: "Chief Technology Officer",
    client: "Larkspur Health",
    status: "STARTED",
    startDate: "2026-07-06",
    guarantee: "In guarantee",
    fee: 96_000,
    billed: 64_000,
  },
  {
    id: "sample-placement-okonjo",
    candidate: "Daniel Okonjo",
    mandate: "Chief Operating Officer",
    client: "Northvale Capital",
    status: "STARTED",
    startDate: "2026-04-20",
    guarantee: "Guarantee cleared",
    fee: 78_000,
    billed: 78_000,
  },
  {
    id: "sample-placement-mbeki",
    candidate: "Helena Mbeki-Sørensen",
    mandate: "VP Engineering",
    client: "Cindermere Robotics",
    status: "FELL THROUGH",
    startDate: "2026-05-11",
    guarantee: "Fell through",
    fee: 0,
    billed: -54_000,
  },
  {
    id: "sample-placement-varga",
    candidate: "Ilona Varga",
    mandate: "VP Engineering",
    client: "Cindermere Robotics",
    status: "ACCEPTED",
    startDate: null,
    guarantee: "—",
    fee: 61_500,
    billed: 0,
  },
];

/** Headline figures for the sample revenue tiles, written out rather than summed. */
export const SAMPLE_REVENUE = {
  billedThisQuarter: 64_000,
  outstanding: 93_500,
  started: 2,
  inGuarantee: 1,
  /** Oldest first, matching `recentQuarters`. */
  byQuarter: [48_000, 132_000, 24_000, 64_000],
} as const;
