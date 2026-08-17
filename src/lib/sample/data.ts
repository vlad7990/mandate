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

/* ────────────────────────────────────────────────────────────────────
   Skills studio
   ──────────────────────────────────────────────────────────────────── */

export type SampleSkill = {
  id: string;
  name: string;
  description: string;
  skillType: "search_skill" | "client_skill" | "role_skill";
  triggerConditions: string;
  instructions: string;
  isActive: boolean;
  /** Rendered where a real role skill would name its project. */
  appliesTo: string | null;
};

/**
 * Three skills, one per type, because the type *is* the lesson.
 *
 * A skill is the most abstract thing in the product — an instruction block
 * injected into six agents — and the empty state can only describe it. These
 * show the shape: a trigger, an instruction written in the second person to
 * the agent, and a scope that narrows from every search to a single mandate.
 *
 * Written to be worth reading rather than to fill a table. Each one is a rule
 * a real search firm would actually hold, and the precedence line on the page
 * (Role > Client > Search) is legible from the three side by side.
 *
 * Deliberately *not* a hire/no-hire rule anywhere. Skills steer how an agent
 * reads evidence; they do not hand it a verdict, and a sample that implied
 * otherwise would teach the wrong thing about the product on the one screen
 * whose whole job is teaching.
 */
export const SAMPLE_SKILLS: readonly SampleSkill[] = [
  {
    id: "sample-skill-regulated",
    name: "Regulated-industry evidence bar",
    description:
      "Raises the evidence required before crediting regulatory experience.",
    skillType: "search_skill",
    triggerConditions:
      "Any mandate in financial services, healthcare, or utilities.",
    instructions:
      "When a CV claims regulatory exposure, look for the specific regime by name (SMCR, MiFID II, HIPAA, Ofgem) and the candidate's own role in it. Treat 'worked in a regulated environment' as unevidenced unless the CV names what they personally owned. Record the distinction in the evidence note rather than adjusting the score silently.",
    isActive: true,
    appliesTo: null,
  },
  {
    id: "sample-skill-tenure",
    name: "Cindermere — tenure context",
    description:
      "Client-specific framing for short tenures, agreed with the client.",
    skillType: "client_skill",
    triggerConditions: "Mandates for Cindermere Robotics.",
    instructions:
      "This client has said repeatedly that a two-year tenure inside a scale-up is normal and not a flag. Do not surface short tenure as a risk on its own. If a pattern spans four or more roles, describe the pattern factually and leave the read to the recruiter.",
    isActive: true,
    appliesTo: null,
  },
  {
    id: "sample-skill-platform",
    name: "Platform rebuild — scope check",
    description: "Narrows what counts as relevant scale for one mandate.",
    skillType: "role_skill",
    triggerConditions: "Invoked for the Larkspur VP Engineering mandate only.",
    instructions:
      "Scale here means concurrent users and deploy frequency, not headcount. A candidate who ran a team of eighty on a quarterly release cycle is a weaker match on scale than one who ran twelve engineers shipping daily. Say which of the two you are looking at when you cite scale.",
    isActive: false,
    appliesTo: "VP Engineering · Larkspur",
  },
];

/* ────────────────────────────────────────────────────────────────────
   Clients — W2

   The client record answers "what have we done for this company", which
   is the question `projects.company_name` could not answer at all before
   migration 049. An empty client page therefore fails at the one thing
   it exists for, and its four panels — contacts, notes, commercial
   terms, mandates — are unconvincing unless all four have content.

   Two constraints shape what is written below.

   **Mandate counts are derived, not typed.** The real list counts every
   project with `client_id = id`, live or not; `SAMPLE_MANDATES` holds
   only searches in flight. So a client states its *closed* searches and
   the count is live + closed. Typing a total instead would let the
   column contradict the mandate list the same way a hand-written KPI
   would contradict its own table.

   **A note is about the deal, never about the person.** §5c of the
   handoff records why: a client contact is not notified that we hold a
   record on them, and legitimate interest covers a name, a title and a
   phone number collected inside a commercial relationship. It stops
   covering the moment a note carries an assessment of the individual —
   that is profiling of someone who was never told. Every note here is
   about process, logistics or terms. None of them is about what anybody
   is like, and none should be added later.
   ──────────────────────────────────────────────────────────────────── */

export type SampleContact = {
  readonly id: string;
  readonly fullName: string;
  readonly title: string;
  /** Matches the `client_contacts.contact_type` vocabulary in 054. */
  readonly contactType: "hiring_manager" | "hr" | "procurement" | "executive" | "other";
  readonly email: string;
  readonly phone: string | null;
  readonly isPrimary: boolean;
};

export type SampleClientNote = {
  readonly id: string;
  readonly noteType: "general" | "call" | "meeting" | "email";
  /** `commercial` notes are hidden from a reader without `fees:read`, as in 054. */
  readonly visibility: "org" | "commercial";
  readonly contactName: string | null;
  readonly body: string;
  readonly isPinned: boolean;
  readonly daysAgo: number;
  readonly author: string;
};

export type SampleFeeTerms = {
  readonly model: "contingent" | "retained" | "fixed";
  readonly summary: string;
  readonly basis: "Base salary" | "Total first-year cash";
  readonly guaranteeDays: number;
  /** Retained searches only; a contingent fee is one line and has none. */
  readonly instalments: readonly { readonly label: string; readonly share: string }[];
  readonly note: string | null;
};

export type SampleClosedMandate = {
  readonly title: string;
  readonly outcome: "Placed" | "Closed";
  readonly closedDaysAgo: number;
};

export type SampleClient = {
  readonly id: string;
  readonly name: string;
  readonly domain: string;
  readonly industry: string;
  readonly businessModel: string;
  readonly revenueRange: string;
  readonly employeeCount: string;
  readonly fundingStage: string;
  readonly ownershipStructure: string;
  readonly geographicFootprint: string;
  readonly regulatoryEnvironment: string;
  /** Null where research has not been run — a real state, worth showing once. */
  readonly researchedDaysAgo: number | null;
  /** Ids in `SAMPLE_MANDATES`. The live half of the mandate count. */
  readonly liveMandateIds: readonly string[];
  readonly closedMandates: readonly SampleClosedMandate[];
  readonly contacts: readonly SampleContact[];
  readonly notes: readonly SampleClientNote[];
  readonly feeTerms: SampleFeeTerms | null;
};

export const SAMPLE_CLIENTS: readonly SampleClient[] = [
  {
    id: "sample-client-larkspur",
    name: "Larkspur Health",
    domain: "larkspurhealth.com",
    industry: "Healthcare technology",
    businessModel: "B2B SaaS, per-bed licensing with implementation services",
    revenueRange: "~$180m ARR",
    employeeCount: "1,200–1,500",
    fundingStage: "Series E, PE minority",
    ownershipStructure: "Founder-led, Meridian Growth holds 34%",
    geographicFootprint: "US, Canada, UK",
    regulatoryEnvironment: "HIPAA, SOC 2 Type II, MHRA for the UK estate",
    researchedDaysAgo: 9,
    liveMandateIds: ["sample-larkspur"],
    closedMandates: [
      { title: "VP Clinical Operations", outcome: "Placed", closedDaysAgo: 214 },
      { title: "Head of Information Security", outcome: "Placed", closedDaysAgo: 402 },
    ],
    contacts: [
      {
        id: "sample-contact-larkspur-raman",
        fullName: "Priya Raman",
        title: "Chief People Officer",
        contactType: "hr",
        email: "p.raman@larkspurhealth.com",
        phone: "+1 617 555 0148",
        isPrimary: true,
      },
      {
        id: "sample-contact-larkspur-feltrin",
        fullName: "Tom Feltrin",
        title: "Chief Executive Officer",
        contactType: "executive",
        email: "t.feltrin@larkspurhealth.com",
        phone: null,
        isPrimary: false,
      },
      {
        id: "sample-contact-larkspur-oyelaran",
        fullName: "Dele Oyelaran",
        title: "Director, Procurement",
        contactType: "procurement",
        email: "d.oyelaran@larkspurhealth.com",
        phone: null,
        isPrimary: false,
      },
    ],
    notes: [
      {
        id: "sample-note-larkspur-panel",
        noteType: "meeting",
        visibility: "org",
        contactName: "Priya Raman",
        body: "Second-round format confirmed: 90 minutes, architecture deep-dive first, then 30 with the CEO. Panel is Priya, Tom and the VP Clinical. They want the security posture question asked by us in round one rather than by them in round two.",
        isPinned: true,
        daysAgo: 6,
        author: "Elena Marchetti",
      },
      {
        id: "sample-note-larkspur-scheduling",
        noteType: "email",
        visibility: "org",
        contactName: "Priya Raman",
        body: "Board offsite runs the week of the 14th; no interviews that week. Priya asked for the slate a full working day before the panel rather than the morning of.",
        isPinned: false,
        daysAgo: 11,
        author: "Elena Marchetti",
      },
      {
        id: "sample-note-larkspur-terms",
        noteType: "call",
        visibility: "commercial",
        contactName: "Dele Oyelaran",
        body: "Renewal agreed at 22% of total first-year cash, up from 20% of base. Procurement wanted the guarantee extended to 120 days in exchange; agreed. Invoicing stays on the same PO structure.",
        isPinned: false,
        daysAgo: 34,
        author: "Elena Marchetti",
      },
    ],
    feeTerms: {
      model: "contingent",
      summary: "22% of total first-year cash",
      basis: "Total first-year cash",
      guaranteeDays: 120,
      instalments: [],
      note: "Renewed at the 34-day mark; supersedes the 20%-of-base agreement.",
    },
  },
  {
    id: "sample-client-cindermere",
    name: "Cindermere Robotics",
    domain: "cindermere.io",
    industry: "Industrial automation",
    businessModel: "Hardware plus recurring fleet-software subscription",
    revenueRange: "~$62m",
    employeeCount: "380–420",
    fundingStage: "Series C",
    ownershipStructure: "Venture-backed, no single majority holder",
    geographicFootprint: "Germany, Netherlands, US Midwest",
    regulatoryEnvironment: "CE machinery directive, ISO 10218",
    researchedDaysAgo: 3,
    liveMandateIds: ["sample-cindermere"],
    closedMandates: [
      { title: "Director of Manufacturing", outcome: "Closed", closedDaysAgo: 158 },
    ],
    contacts: [
      {
        id: "sample-contact-cindermere-vogt",
        fullName: "Annika Vogt",
        title: "Chief Technology Officer",
        contactType: "hiring_manager",
        email: "a.vogt@cindermere.io",
        phone: "+49 30 5550 118",
        isPrimary: true,
      },
      {
        id: "sample-contact-cindermere-brandt",
        fullName: "Sebastian Brandt",
        title: "Talent Partner",
        contactType: "hr",
        email: "s.brandt@cindermere.io",
        phone: null,
        isPrimary: false,
      },
    ],
    notes: [
      {
        id: "sample-note-cindermere-tenure",
        noteType: "call",
        visibility: "org",
        contactName: "Annika Vogt",
        body: "Annika restated that two-year tenures inside a scale-up are normal here and asked that we stop filtering on them. Recorded as a client skill so the evaluation agent applies it rather than us remembering.",
        isPinned: true,
        daysAgo: 19,
        author: "Elena Marchetti",
      },
      {
        id: "sample-note-cindermere-fallthrough",
        noteType: "general",
        visibility: "org",
        contactName: null,
        body: "Previous offer was declined at the paperwork stage over relocation support. Package now includes a stated relocation allowance before the offer goes out.",
        isPinned: false,
        daysAgo: 41,
        author: "Elena Marchetti",
      },
      {
        id: "sample-note-cindermere-rebate",
        noteType: "email",
        visibility: "commercial",
        contactName: "Sebastian Brandt",
        body: "Fall-through inside the guarantee window was credited in full rather than replaced, at their request. The reversal is on the placement record; the replacement search is billed as new.",
        isPinned: false,
        daysAgo: 28,
        author: "Elena Marchetti",
      },
    ],
    feeTerms: {
      model: "retained",
      summary: "28% of base salary, three stages",
      basis: "Base salary",
      guaranteeDays: 90,
      instalments: [
        { label: "On engagement", share: "33.333%" },
        { label: "On shortlist delivery", share: "33.333%" },
        { label: "On start date", share: "33.334%" },
      ],
      note: "Thirds, so the plan sums to 100% exactly rather than to 99.999%.",
    },
  },
  {
    id: "sample-client-northvale",
    name: "Northvale Capital",
    domain: "northvalecapital.com",
    industry: "Asset management",
    businessModel: "Fee on AUM plus carry on the direct-lending vehicles",
    revenueRange: "Not disclosed",
    employeeCount: "210–240",
    fundingStage: "Privately held",
    ownershipStructure: "Partnership, 11 equity partners",
    geographicFootprint: "UK, Luxembourg, Singapore",
    regulatoryEnvironment: "FCA authorised, SMCR applies to the COO seat",
    researchedDaysAgo: 22,
    liveMandateIds: ["sample-northvale"],
    closedMandates: [
      { title: "Head of Compliance", outcome: "Placed", closedDaysAgo: 96 },
    ],
    contacts: [
      {
        id: "sample-contact-northvale-akerman",
        fullName: "Rosalind Akerman",
        title: "Managing Partner",
        contactType: "executive",
        email: "r.akerman@northvalecapital.com",
        phone: "+44 20 7555 0192",
        isPrimary: true,
      },
      {
        id: "sample-contact-northvale-desai",
        fullName: "Nikhil Desai",
        title: "Head of Talent",
        contactType: "hr",
        email: "n.desai@northvalecapital.com",
        phone: null,
        isPrimary: false,
      },
    ],
    notes: [
      {
        id: "sample-note-northvale-smcr",
        noteType: "meeting",
        visibility: "org",
        contactName: "Rosalind Akerman",
        body: "The COO seat is an SMF role, so the regulatory reference process adds roughly six weeks between offer and start. Both sides agreed the start date on the offer letter should reflect that rather than being renegotiated later.",
        isPinned: true,
        daysAgo: 15,
        author: "Elena Marchetti",
      },
      {
        id: "sample-note-northvale-partners",
        noteType: "general",
        visibility: "org",
        contactName: null,
        body: "Final decision sits with the partnership, not with Rosalind alone. Slates go to her first and she circulates; expect four to five working days for a response rather than two.",
        isPinned: false,
        daysAgo: 30,
        author: "Elena Marchetti",
      },
    ],
    feeTerms: {
      model: "retained",
      summary: "30% of total first-year cash, two stages",
      basis: "Total first-year cash",
      guaranteeDays: 180,
      instalments: [
        { label: "On engagement", share: "40%" },
        { label: "On start date", share: "60%" },
      ],
      note: "Longer guarantee negotiated in place of a lower percentage.",
    },
  },
  {
    id: "sample-client-thornbury",
    name: "Thornbury Group",
    domain: "thornburygroup.co.uk",
    industry: "Building materials",
    businessModel: "Manufacture and distribution, 60% trade counter",
    revenueRange: "~£410m",
    employeeCount: "2,800–3,200",
    fundingStage: "Listed",
    ownershipStructure: "LSE main market, free float 78%",
    geographicFootprint: "UK, Ireland",
    regulatoryEnvironment: "UK listing rules, TCFD reporting",
    researchedDaysAgo: 5,
    liveMandateIds: ["sample-thornbury"],
    closedMandates: [],
    contacts: [
      {
        id: "sample-contact-thornbury-whitlock",
        fullName: "Margaret Whitlock",
        title: "Chair, Audit Committee",
        contactType: "executive",
        email: "m.whitlock@thornburygroup.co.uk",
        phone: null,
        isPrimary: true,
      },
      {
        id: "sample-contact-thornbury-ianno",
        fullName: "Carlo Ianno",
        title: "Group HR Director",
        contactType: "hr",
        email: "c.ianno@thornburygroup.co.uk",
        phone: "+44 121 555 0173",
        isPrimary: false,
      },
    ],
    notes: [
      {
        id: "sample-note-thornbury-timing",
        noteType: "call",
        visibility: "org",
        contactName: "Margaret Whitlock",
        body: "Close period runs to the end of the month and the audit committee will not convene on appointments during it. First panel date available is the week after results.",
        isPinned: true,
        daysAgo: 4,
        author: "Elena Marchetti",
      },
      {
        id: "sample-note-thornbury-brief",
        noteType: "meeting",
        visibility: "org",
        contactName: "Carlo Ianno",
        body: "Brief widened after the first calibration: listed-company reporting experience is required, sector experience is not. The spec was reissued and the previous version is in the calibration history.",
        isPinned: false,
        daysAgo: 12,
        author: "Elena Marchetti",
      },
    ],
    feeTerms: {
      model: "fixed",
      summary: "£95,000 fixed",
      basis: "Total first-year cash",
      guaranteeDays: 90,
      instalments: [
        { label: "On engagement", share: "50%" },
        { label: "On start date", share: "50%" },
      ],
      note: "Fixed at their request so the fee is not a function of the package.",
    },
  },
  {
    id: "sample-client-ashgrove",
    name: "Ashgrove Logistics",
    domain: "ashgrove-logistics.com",
    industry: "Freight and logistics",
    businessModel: "Asset-light 3PL, contract logistics",
    revenueRange: "~€240m",
    employeeCount: "1,900–2,100",
    fundingStage: "PE-backed, second hold",
    ownershipStructure: "Cormont Partners majority",
    geographicFootprint: "Benelux, Germany, Poland",
    regulatoryEnvironment: "GDPR, EU driving-time rules, customs authorisations",
    researchedDaysAgo: 1,
    liveMandateIds: ["sample-ashgrove"],
    closedMandates: [],
    contacts: [
      {
        id: "sample-contact-ashgrove-nowak",
        fullName: "Kasia Nowak",
        title: "Chief Information Officer",
        contactType: "hiring_manager",
        email: "k.nowak@ashgrove-logistics.com",
        phone: "+31 20 555 0166",
        isPrimary: true,
      },
    ],
    notes: [
      {
        id: "sample-note-ashgrove-blocked",
        noteType: "general",
        visibility: "org",
        contactName: "Kasia Nowak",
        body: "Calibration is waiting on the target operating model, which lands with the board at the end of the month. Sourcing is deliberately paused rather than run against a spec that is about to change.",
        isPinned: true,
        daysAgo: 2,
        author: "Elena Marchetti",
      },
    ],
    feeTerms: {
      model: "contingent",
      summary: "20% of base salary",
      basis: "Base salary",
      guaranteeDays: 90,
      instalments: [],
      note: null,
    },
  },
  {
    id: "sample-client-merrit",
    name: "Merrit & Vale",
    domain: "merritvale.com",
    industry: "Professional services",
    businessModel: "Partnership, billable hours with fixed-fee advisory",
    revenueRange: "~$88m",
    employeeCount: "300–350",
    fundingStage: "Privately held",
    ownershipStructure: "Equity partnership, 26 partners",
    geographicFootprint: "US East Coast",
    regulatoryEnvironment: "State bar admission, conflict-of-interest screening",
    researchedDaysAgo: 7,
    liveMandateIds: ["sample-merrit"],
    closedMandates: [],
    contacts: [
      {
        id: "sample-contact-merrit-oduya",
        fullName: "Grace Oduya",
        title: "Managing Partner",
        contactType: "executive",
        email: "g.oduya@merritvale.com",
        phone: null,
        isPrimary: true,
      },
      {
        id: "sample-contact-merrit-halloran",
        fullName: "Peter Halloran",
        title: "Director of Operations",
        contactType: "other",
        email: "p.halloran@merritvale.com",
        phone: "+1 212 555 0134",
        isPrimary: false,
      },
    ],
    notes: [
      {
        id: "sample-note-merrit-conflicts",
        noteType: "email",
        visibility: "org",
        contactName: "Peter Halloran",
        body: "Every candidate has to clear conflict screening before an introduction, not before an offer. Names go to Peter first and come back cleared or blocked within two working days.",
        isPinned: true,
        daysAgo: 8,
        author: "Elena Marchetti",
      },
    ],
    feeTerms: null,
  },
  {
    id: "sample-client-varela",
    name: "Varela Bioscience",
    domain: "varelabio.com",
    industry: "Biotechnology",
    businessModel: "Pre-revenue, milestone-funded research programmes",
    revenueRange: "Pre-revenue",
    employeeCount: "120–150",
    fundingStage: "Series B",
    ownershipStructure: "Venture-backed, founder retains board control",
    geographicFootprint: "Spain, US Northeast",
    regulatoryEnvironment: "EMA and FDA pathways, GCP for the trial estate",
    researchedDaysAgo: null,
    liveMandateIds: ["sample-varela"],
    closedMandates: [],
    contacts: [
      {
        id: "sample-contact-varela-serrano",
        fullName: "Miguel Serrano",
        title: "Chief Executive Officer",
        contactType: "executive",
        email: "m.serrano@varelabio.com",
        phone: null,
        isPrimary: true,
      },
    ],
    notes: [
      {
        id: "sample-note-varela-first",
        noteType: "call",
        visibility: "org",
        contactName: "Miguel Serrano",
        body: "First mandate with this client. Company research has not been run yet — the intake was taken verbally and the profile below is what Miguel gave us on the call.",
        isPinned: false,
        daysAgo: 8,
        author: "Elena Marchetti",
      },
    ],
    feeTerms: null,
  },
];

export function sampleClient(id: string): SampleClient | undefined {
  return SAMPLE_CLIENTS.find((c) => c.id === id);
}

/**
 * Live mandates plus closed ones, which is what the real page counts: it
 * reads every `projects` row for the client with no status filter, while
 * `SAMPLE_MANDATES` holds only searches in flight. Derived rather than
 * typed so the column cannot drift from the mandate list.
 */
export function sampleClientMandateCount(client: SampleClient): number {
  return client.liveMandateIds.length + client.closedMandates.length;
}

/** The live mandates behind a sample client, resolved against `SAMPLE_MANDATES`. */
export function sampleClientLiveMandates(client: SampleClient): SampleMandate[] {
  return client.liveMandateIds
    .map((id) => sampleMandate(id))
    .filter((m): m is SampleMandate => m !== undefined);
}
