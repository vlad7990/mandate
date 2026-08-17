import { SLOTS, type SlotKey } from "@/lib/ai/sourcing-analysis";
import { SAMPLE_CANDIDATES } from "./data";
import { SAMPLE_MANDATE_ID } from "./mandate-modules";

/**
 * Sourcing and AI search — W5.
 *
 * ## What is and is not filled in
 *
 * `/sourcing` gets the six boolean slots, the target-company thesis and the
 * run history. Its **archetype tab needs nothing**: `ArchetypePanel` renders
 * `ARCHETYPE_BLURBS`, which is static reference content identical for every
 * mandate, so it already reads correctly in the sample. Saying so is the
 * right outcome — the same call W1 made about `/app/settings`.
 *
 * `/sourcing/runs/[runId]/import` stays on the honest not-built state. It is
 * a mid-workflow step whose entire content is a staging table waiting for a
 * promote — a write the sample cannot perform — so a read-only copy would be
 * a table of rows with the one control that gives them meaning removed. Same
 * reasoning as `/candidates/new`.
 *
 * ## The boolean strings are real syntax
 *
 * They are what a recruiter would paste into LinkedIn, not prose standing in
 * for a query. A sample that showed `(CTO OR "Chief Technology Officer")` and
 * stopped would teach that the generator produces something trivial; the
 * whole claim of the feature is that it produces something a researcher would
 * otherwise spend an hour on.
 */

export type SampleSlot = {
  readonly slot: SlotKey;
  readonly version: number;
  readonly daysAgo: number;
  readonly content: string;
  /** Earlier versions, newest first. Empty where the first draft still stands. */
  readonly history: ReadonlyArray<{ version: number; daysAgo: number; note: string }>;
};

export const SAMPLE_SLOTS: readonly SampleSlot[] = [
  {
    slot: "linkedin_exact",
    version: 3,
    daysAgo: 5,
    content:
      '("Chief Technology Officer" OR "Chief Information Officer" OR "Group CTO") AND ("electronic patient record" OR "EPR" OR "care records" OR "clinical systems") AND ("HIPAA" OR "MHRA" OR "CQC" OR "information governance") NOT ("consultant" OR "advisory" OR "interim")',
    history: [
      { version: 2, daysAgo: 19, note: "Added the regulator names after calibration v02" },
      { version: 1, daysAgo: 24, note: "First draft from FINAL_V01" },
    ],
  },
  {
    slot: "linkedin_broad",
    version: 2,
    daysAgo: 19,
    content:
      '("CTO" OR "CIO" OR "VP Engineering" OR "Director of Technology") AND ("healthcare" OR "health system" OR "hospital" OR "care provider" OR "medtech") AND ("platform replacement" OR "modernisation" OR "migration" OR "transformation")',
    history: [{ version: 1, daysAgo: 24, note: "First draft from FINAL_V01" }],
  },
  {
    slot: "linkedin_adjacent",
    version: 2,
    daysAgo: 11,
    content:
      '("CTO" OR "CIO" OR "Chief Digital Officer") AND ("financial services" OR "insurance" OR "utilities" OR "public sector") AND ("regulated" OR "compliance" OR "supervisory") AND ("core system replacement" OR "legacy migration" OR "platform rebuild")',
    history: [{ version: 1, daysAgo: 24, note: "First draft from FINAL_V01" }],
  },
  {
    slot: "linkedin_competitor",
    version: 1,
    daysAgo: 24,
    content:
      '("CTO" OR "CIO" OR "VP Engineering") AND ("Cerner" OR "Epic Systems" OR "Meditech" OR "System C" OR "Altera Digital Health" OR "Dedalus") AND NOT ("sales" OR "account" OR "pre-sales")',
    history: [],
  },
  {
    slot: "google_xray",
    version: 1,
    daysAgo: 24,
    content:
      'site:linkedin.com/in ("chief technology officer" OR "chief information officer") ("electronic patient record" OR "clinical systems") ("HIPAA" OR "MHRA") -"interim" -"consultant"',
    history: [],
  },
  {
    slot: "ats",
    version: 1,
    daysAgo: 24,
    content:
      'title:("Chief Technology Officer" OR "CTO" OR "Chief Information Officer") AND skills:("EPR" OR "clinical systems" OR "healthcare platform") AND years_experience:>12',
    history: [],
  },
];

export function sampleSlot(key: SlotKey): SampleSlot | undefined {
  return SAMPLE_SLOTS.find((s) => s.slot === key);
}

/** Slot metadata in the product's own order, paired with its sample content. */
export function sampleSlotsInOrder(): Array<{
  def: (typeof SLOTS)[number];
  sample: SampleSlot;
}> {
  return SLOTS.map((def) => ({ def, sample: sampleSlot(def.key)! })).filter(
    (x) => x.sample
  );
}

/* ── Target companies ────────────────────────────────────────────── */

export const SAMPLE_TARGET_COMPANIES = {
  generatedDaysAgo: 12,
  thesis:
    "Regulatory carries 26 of the 100 weight after the last recalibration, so the hunting ground is provider-side technology leadership inside a named clinical regime — not health-tech vendors, whose CTOs sell into that regime rather than operate under it. The adjacent tier is regulated infrastructure outside healthcare, where the compliance muscle transfers and the domain gap is the trade.",
  companies: [
    { name: "Pellworth NHS Trust", category: "Direct", pool: "Large", rationale: "Acute trust mid-EPR migration; the exact shape of this mandate" },
    { name: "Vendela Care Group", category: "Direct", pool: "Medium", rationale: "2,100-staff care group, platform rebuild under way" },
    { name: "Ashfield Medical", category: "Direct", pool: "Medium", rationale: "Medical devices under HIQA and MDR; provider-adjacent" },
    { name: "Thornbury Care", category: "Direct", pool: "Large", rationale: "6,400 staff, replacement delivered — proven supply" },
    { name: "Brackenmoor Health", category: "Direct", pool: "Medium", rationale: "Regional provider, digital leadership recently reorganised" },
    { name: "Nyren Diagnostics", category: "Adjacent", pool: "Small", rationale: "Diagnostics software; GDPR only, no sector regime" },
    { name: "Kestrel Bank", category: "Adjacent", pool: "Large", rationale: "FCA-regulated core replacement; compliance muscle transfers" },
    { name: "Halden Freight", category: "Adjacent", pool: "Medium", rationale: "Regulated logistics, legacy estate of comparable age" },
    { name: "Corvid Systems", category: "Adjacent", pool: "Medium", rationale: "Industrial platform scale; domain gap is the trade" },
    { name: "Marlow Diagnostics", category: "Direct", pool: "Small", rationale: "Prior finalist source for this client" },
    { name: "Cindermere Robotics", category: "Adjacent", pool: "Small", rationale: "CE and ISO regimes; scale-up pace" },
    { name: "Larkspur Health", category: "Excluded", pool: "—", rationale: "The client. Listed so the exclusion is visible rather than assumed" },
  ],
} as const;

/* ── Runs ────────────────────────────────────────────────────────── */

export const SAMPLE_RUNS = [
  {
    id: "sample-run-3",
    slot: "linkedin_adjacent" as SlotKey,
    platform: "LinkedIn Recruiter",
    daysAgo: 4,
    executed: true,
    found: 14,
    imported: 3,
    note: "Adjacent-industry string. Eleven of fourteen scored below 60 — the finding behind the second search-health suggestion.",
  },
  {
    id: "sample-run-2",
    slot: "linkedin_exact" as SlotKey,
    platform: "LinkedIn Recruiter",
    daysAgo: 18,
    executed: true,
    found: 9,
    imported: 6,
    note: "Exact match, v2. The highest-yield run on this search.",
  },
  {
    id: "sample-run-1",
    slot: "google_xray" as SlotKey,
    platform: "Google X-Ray",
    daysAgo: 22,
    executed: true,
    found: 12,
    imported: 4,
    note: "Broad sweep before the calibration was tightened.",
  },
] as const;

/* ── AI candidate search ─────────────────────────────────────────── */

/**
 * One worked search, so a prospect can see what the feature actually returns.
 *
 * The form above it stays live: this is an example of a completed search, not
 * a fake response to whatever the reader types. Typing a real query with an
 * empty pool falls through to the product's own "no matches" state, which is
 * the truthful answer.
 *
 * Every match carries its reasoning and the evidence under it — the same rule
 * the candidate detail and the leaderboard follow.
 */
export const SAMPLE_SEARCH = {
  query:
    "CTOs who have replaced a clinical records platform inside a named regulatory regime",
  intent:
    "Technology leadership, provider-side healthcare, with a delivered platform replacement and a named regime on the CV. Seniority at or above CTO of a multi-thousand-staff organisation.",
  mustHaves: [
    "Owned a records or core-platform replacement end to end",
    "A named regulatory regime — HIPAA, MHRA, CQC or equivalent",
  ],
  niceToHaves: [
    "Board-level reporting line",
    "Team build past 150 engineers",
    "Experience running old and new systems in parallel",
  ],
  matches: [
    {
      candidateId: "sample-anand",
      score: 94,
      reasoning:
        "Both must-haves are evidenced directly: a £48m records replacement delivered end to end, and HIPAA plus MHRA estates with the clinical safety case owned personally. Two board reviews led covers the first nice-to-have.",
    },
    {
      candidateId: "sample-okonjo",
      score: 89,
      reasoning:
        "Trust-wide EPR migration delivered under NHS information governance, signed off twice. The only candidate in the pool with parallel-running experience, which the third nice-to-have asks for. Team build of 90 to 240 is the largest here.",
    },
    {
      candidateId: "sample-tavares",
      score: 58,
      reasoning:
        "Two replatformings, one at £30m, satisfies the first must-have. The second is not met: PCI-DSS is a named regime but not a clinical one, which is the distinction this query turns on.",
    },
  ],
  /** Below the product's own noise floor, and therefore not returned. */
  belowFloor: 3,
} as const;

/** The candidates a sample search can return — the mandate's own pool. */
export function sampleSearchPoolSize(): number {
  return SAMPLE_CANDIDATES.filter((c) => c.mandateId === SAMPLE_MANDATE_ID).length;
}
