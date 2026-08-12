// Shared types, schema, and prompts for the Boolean Search Generator.
// Client-safe (no `server-only`) — the editor imports the SLOTS metadata,
// types, and labels; the server-only generation module imports the JSON
// schema and system prompts.

export type QueryType = "linkedin" | "google_xray" | "ats";
export type SearchType = "exact" | "broad" | "adjacent" | "competitor";

/** Canonical key identifying a single query slot. */
export type SlotKey =
  | "linkedin_exact"
  | "linkedin_broad"
  | "linkedin_adjacent"
  | "linkedin_competitor"
  | "google_xray"
  | "ats";

export type SlotDef = {
  key: SlotKey;
  query_type: QueryType;
  /**
   * Database search_type column value. The check constraint only allows
   * exact / broad / adjacent / competitor — google_xray and ats both pin
   * to "exact" since they don't have natural sub-variants.
   */
  search_type: SearchType;
  /** UI grouping: linkedin variants stack as tabs under one card. */
  group: QueryType;
  /** Short label shown in tabs / chips ("EXACT", "XRAY_GOOGLE", …). */
  short: string;
  /** Long human label ("Exact match", "Google X-Ray", …). */
  label: string;
  blurb: string;
};

export const SLOTS: SlotDef[] = [
  {
    key: "linkedin_exact",
    query_type: "linkedin",
    search_type: "exact",
    group: "linkedin",
    short: "EXACT",
    label: "Exact Match",
    blurb:
      "Tight title + skill match for the on-target candidate profile. Highest precision, lowest recall.",
  },
  {
    key: "linkedin_broad",
    query_type: "linkedin",
    search_type: "broad",
    group: "linkedin",
    short: "BROAD",
    label: "Broad",
    blurb:
      "Loosened title constraints with adjacent skill keywords. Pulls in candidates one step away from the ideal profile.",
  },
  {
    key: "linkedin_adjacent",
    query_type: "linkedin",
    search_type: "adjacent",
    group: "linkedin",
    short: "ADJACENT",
    label: "Adjacent",
    blurb:
      "Adjacent functions or industries — operators with transferable skills who could grow into the role.",
  },
  {
    key: "linkedin_competitor",
    query_type: "linkedin",
    search_type: "competitor",
    group: "linkedin",
    short: "COMPETITOR",
    label: "Competitor",
    blurb:
      "Direct-competitor employers in this market. Use for warm outreach and reference checks.",
  },
  {
    key: "google_xray",
    query_type: "google_xray",
    search_type: "exact",
    group: "google_xray",
    short: "XRAY_GOOGLE",
    label: "Google X-Ray",
    blurb:
      "site:linkedin.com/in operator with title and skill clauses. Surfaces public profiles outside InMail credit limits.",
  },
  {
    key: "ats",
    query_type: "ats",
    search_type: "exact",
    group: "ats",
    short: "ATS_LOCAL",
    label: "ATS Search",
    blurb:
      "Greenhouse / Workday / Ashby query syntax for re-engaging silver-medal candidates already in your ATS.",
  },
];

export const SLOT_KEYS = SLOTS.map((s) => s.key) as readonly SlotKey[];

export type SourcingQueries = Record<SlotKey, string>;

export const EMPTY_SOURCING_QUERIES: SourcingQueries = {
  linkedin_exact: "",
  linkedin_broad: "",
  linkedin_adjacent: "",
  linkedin_competitor: "",
  google_xray: "",
  ats: "",
};

export function slotForDbRow(
  query_type: string,
  search_type: string
): SlotKey | null {
  const slot = SLOTS.find(
    (s) => s.query_type === query_type && s.search_type === search_type
  );
  return slot?.key ?? null;
}

// ---------------------------------------------------------------------------
// JSON schemas for Anthropic structured output
// ---------------------------------------------------------------------------

export const SOURCING_FULL_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [...SLOT_KEYS],
  properties: {
    linkedin_exact: {
      type: "string",
      description:
        "LinkedIn boolean string for the on-target profile. Use parentheses + AND/OR + quotes for multi-word terms. Include 1–2 NOT clauses to suppress agency/recruiter noise.",
    },
    linkedin_broad: {
      type: "string",
      description:
        "LinkedIn boolean string with loosened title constraints and adjacent skill keywords. Should pull a 3–5x larger pool than the exact match.",
    },
    linkedin_adjacent: {
      type: "string",
      description:
        "LinkedIn boolean string targeting adjacent functions or industries — operators with transferable skills who could grow into the role.",
    },
    linkedin_competitor: {
      type: "string",
      description:
        "LinkedIn boolean string scoping to direct-competitor employers via currentCompany / pastCompany. Pair with title clauses.",
    },
    google_xray: {
      type: "string",
      description:
        "Google X-Ray search using site:linkedin.com/in/ operator. Combine intitle and inurl clauses to filter by title and seniority. No InMail required.",
    },
    ats: {
      type: "string",
      description:
        "ATS search string in a portable shape (tags / status / keyword clauses). Targets re-engagement of silver-medal candidates already in the funnel.",
    },
  },
} as const;

/** Schema for regenerating a single slot. The output is just the new query string. */
export const SOURCING_SINGLE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["query"],
  properties: {
    query: {
      type: "string",
      description:
        "The regenerated boolean / search string for the requested slot, incorporating any feedback the recruiter provided.",
    },
  },
} as const;

// ---------------------------------------------------------------------------
// System prompts
// ---------------------------------------------------------------------------

export const SOURCING_FULL_SYSTEM_PROMPT = `You are an executive-search sourcing strategist. Given a finalised job specification and the project's calibration model, produce six precise sourcing strings — four LinkedIn boolean variants (exact, broad, adjacent, competitor), one Google X-Ray query, and one ATS search string.

Output strictly conforms to the provided JSON schema.

Style rules per slot:
- linkedin_exact: highest-precision string for the on-target candidate. Tight title constraints + must-have skills. Suppress agency/recruiter noise with -agency -recruiter or NOT clauses.
- linkedin_broad: loosen title constraints and add adjacent skill keywords. Should pull a 3–5x larger pool while still hitting the target persona.
- linkedin_adjacent: target adjacent functions / industries. Use synonymous titles and transferable skill clauses. Useful for non-obvious candidates.
- linkedin_competitor: scope to currentCompany OR pastCompany lists drawn from the role's competitive set. Pair with title clauses.
- google_xray: site:linkedin.com/in/ -intitle:"profiles" -inurl:"dir/" combined with intitle / inurl clauses for title + seniority. Zero-cost, no InMail credits.
- ats: ATS-portable syntax (tags, status, keyword) suitable for Greenhouse / Workday / Ashby. Aim for a query that re-engages silver-medal candidates with the role's must-haves.

Hard constraints:
- Use real boolean operators (AND, OR, NOT) and parenthesis grouping. Single line per query.
- Quote multi-word terms.
- No prose, no explanation, no markdown — just the boolean / search string per slot.
- Reflect the dimension_weights: regulatory-heavy role → add "regulatory" or "compliance" keywords; transformation-heavy → add "scale" / "modernisation" / "transformation".

Return one JSON object — no preamble, no markdown.`;

export const SOURCING_SINGLE_SYSTEM_PROMPT = `You are regenerating a single sourcing string for an existing executive search.

Input includes:
  slot          — the type of query to regenerate (linkedin_exact / linkedin_broad / linkedin_adjacent / linkedin_competitor / google_xray / ats)
  current       — the recruiter's current version of this query (may be edited)
  feedback      — recruiter notes on what to change (e.g. "too narrow", "add 'fintech' keyword")
  job_spec      — the finalised role spec sections
  calibration   — the dimension weights and role context
  company       — the company context

Output strictly conforms to the schema: { "query": "<single search string>" }.

Apply the feedback faithfully. If feedback is empty, produce a meaningfully different alternative that still hits the slot's intent (e.g. swap title synonyms, broaden / tighten clauses).

Hard constraints same as the full-set generator: real boolean operators, parenthesis grouping, quoted multi-word terms, single line, no prose / markdown.`;
