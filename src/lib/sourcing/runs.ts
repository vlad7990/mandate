// Sourcing runs — shared shapes and pure helpers for the lineage UI and the
// import flow. No I/O, no AI, client-safe.
//
// Design: docs/superpowers/specs/2026-08-12-sourcing-runs-design.md
//
// The one idea worth holding onto while reading this file: a lineage BRANCHES,
// it does not supersede. v2 is not a replacement for v1 — v1's yield is the
// baseline v2 gets judged against, and both stay readable forever. Nothing here
// sorts, filters or labels a run as retired, and the UI must not either.

import type { MatchStatus } from "./import";

export type SourcingRunStatus = "draft" | "executed" | "archived";

/** A query as it stood when the run was created. A snapshot, never a reference. */
export type SourcingRunQuery = {
  slot: string;
  query_type: string;
  search_type: string;
  content: string;
  platform: string;
};

export type SourcingRunBrief = {
  role_title?: string | null;
  company_name?: string | null;
  must_haves?: string[];
  geographies?: string[];
  target_companies?: string[];
};

export type SourcingRunContent = {
  brief: SourcingRunBrief;
  /** The agent's — or the recruiter's — account of what this strategy is trying. */
  strategy_rationale: string;
  queries: SourcingRunQuery[];
};

export const EMPTY_RUN_CONTENT: SourcingRunContent = {
  brief: {},
  strategy_rationale: "",
  queries: [],
};

export type SourcingRunRow = {
  id: string;
  parent_run_id: string | null;
  root_run_id: string;
  version: number;
  label: string | null;
  status: SourcingRunStatus;
  content_json: unknown;
  result_count: number;
  imported_count: number;
  executed_at: string | null;
  created_at: string;
};

/**
 * Where a result came off. Free text in the database on purpose — a new tool is
 * a new value, not a migration — but the importer offers a list so the same
 * platform is not recorded five different ways by five recruiters.
 */
export const SOURCE_PLATFORMS: Array<{ value: string; label: string }> = [
  { value: "linkedin_recruiter", label: "LinkedIn Recruiter" },
  { value: "linkedin_sales_navigator", label: "LinkedIn Sales Navigator" },
  { value: "linkedin", label: "LinkedIn (standard)" },
  { value: "google_xray", label: "Google X-Ray" },
  { value: "ats", label: "ATS export" },
  { value: "github", label: "GitHub" },
  { value: "company_site", label: "Company website" },
  { value: "conference", label: "Conference / speaker list" },
  { value: "other", label: "Other" },
];

export function platformLabel(value: string): string {
  return SOURCE_PLATFORMS.find((p) => p.value === value)?.label ?? value;
}

// ---------------------------------------------------------------------------
// Import provenance
// ---------------------------------------------------------------------------

/**
 * Per-row provenance, stored under a reserved key inside `raw`.
 *
 * The uploaded file is deliberately NOT persisted, so this plus the raw columns
 * IS the record. It exists so that a recruiter looking at a sourced candidate
 * six months from now can answer "where did this person come from?" —
 * which line, of which file, imported when.
 */
export type ImportProvenance = {
  source: "paste" | "csv";
  /** Null for a paste — there is no file to name. */
  filename: string | null;
  imported_at: string;
  /** 1-based line number in the source, header included, as the recruiter sees it. */
  row_number: number;
};

/** Reserved key inside `raw`. Prefixed so it cannot collide with a real header. */
export const PROVENANCE_KEY = "__import";

export function readProvenance(raw: unknown): ImportProvenance | null {
  if (!raw || typeof raw !== "object") return null;
  const value = (raw as Record<string, unknown>)[PROVENANCE_KEY];
  if (!value || typeof value !== "object") return null;
  const p = value as Partial<ImportProvenance>;
  if (p.source !== "paste" && p.source !== "csv") return null;
  return {
    source: p.source,
    filename: typeof p.filename === "string" ? p.filename : null,
    imported_at: typeof p.imported_at === "string" ? p.imported_at : "",
    row_number: typeof p.row_number === "number" ? p.row_number : 0,
  };
}

/** The raw columns as supplied, with the provenance key filtered back out. */
export function readRawColumns(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (k === PROVENANCE_KEY) continue;
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------

export function normalizeRunContent(json: unknown): SourcingRunContent {
  if (!json || typeof json !== "object") return EMPTY_RUN_CONTENT;
  const raw = json as Record<string, unknown>;

  const queries = Array.isArray(raw.queries)
    ? raw.queries.flatMap((q): SourcingRunQuery[] => {
        if (!q || typeof q !== "object") return [];
        const r = q as Record<string, unknown>;
        const content = typeof r.content === "string" ? r.content : "";
        if (!content.trim()) return [];
        return [
          {
            slot: typeof r.slot === "string" ? r.slot : "",
            query_type: typeof r.query_type === "string" ? r.query_type : "",
            search_type: typeof r.search_type === "string" ? r.search_type : "",
            content,
            platform: typeof r.platform === "string" ? r.platform : "",
          },
        ];
      })
    : [];

  const briefRaw =
    raw.brief && typeof raw.brief === "object"
      ? (raw.brief as Record<string, unknown>)
      : {};

  return {
    brief: {
      role_title:
        typeof briefRaw.role_title === "string" ? briefRaw.role_title : null,
      company_name:
        typeof briefRaw.company_name === "string" ? briefRaw.company_name : null,
      must_haves: stringArray(briefRaw.must_haves),
      geographies: stringArray(briefRaw.geographies),
      target_companies: stringArray(briefRaw.target_companies),
    },
    strategy_rationale:
      typeof raw.strategy_rationale === "string" ? raw.strategy_rationale : "",
    queries,
  };
}

function stringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
}

// ---------------------------------------------------------------------------
// Lineage
// ---------------------------------------------------------------------------

export type Lineage = {
  root_run_id: string;
  /** Ascending by version — v1 first, because v1 came first. */
  runs: SourcingRunRow[];
  /** Newest activity in the family, for ordering families against each other. */
  latest_at: string;
};

/**
 * Group runs into lineages.
 *
 * Versions are ordered ascending and every one is returned. There is no
 * "current" run to single out and no earlier run to fold away: each executed
 * version is an independent historical measurement, and a v1 that yielded two
 * hires stays the most interesting row in its family no matter how many
 * refinements followed it.
 */
export function groupLineages(runs: readonly SourcingRunRow[]): Lineage[] {
  const byRoot = new Map<string, SourcingRunRow[]>();
  for (const run of runs) {
    const bucket = byRoot.get(run.root_run_id);
    if (bucket) bucket.push(run);
    else byRoot.set(run.root_run_id, [run]);
  }

  const lineages: Lineage[] = [];
  for (const [root_run_id, bucket] of byRoot) {
    const ordered = [...bucket].sort((a, b) => a.version - b.version);
    const latest_at = ordered.reduce(
      (acc, r) => (r.created_at > acc ? r.created_at : acc),
      ordered[0]?.created_at ?? ""
    );
    lineages.push({ root_run_id, runs: ordered, latest_at });
  }

  // Most recently active family first; the runs INSIDE a family stay in
  // chronological order.
  lineages.sort((a, b) => (a.latest_at < b.latest_at ? 1 : -1));
  return lineages;
}

/** Yield across a whole lineage, for the family header. */
export function lineageTotals(lineage: Lineage): {
  executed: number;
  results: number;
  imported: number;
} {
  let executed = 0;
  let results = 0;
  let imported = 0;
  for (const run of lineage.runs) {
    if (run.status === "executed") executed++;
    results += run.result_count;
    imported += run.imported_count;
  }
  return { executed, results, imported };
}

// ---------------------------------------------------------------------------
// Review decisions
// ---------------------------------------------------------------------------

export type PromoteAction = "create" | "link";

export type PromoteDecision = {
  result_id: string;
  action: PromoteAction;
  candidate_id?: string | null;
};

/**
 * What the review table pre-selects, per dedupe verdict.
 *
 * `ambiguous` deliberately gets NO default. A name-only match at a large
 * employer is a genuine collision and the recruiter is the only one who can
 * resolve it; pre-selecting either answer would turn "we could not tell" into a
 * silent merge or a silent duplicate.
 */
export function defaultDecision(
  status: MatchStatus,
  matchedCandidateId: string | null
): PromoteAction | null {
  if (status === "new") return "create";
  if (status === "duplicate" && matchedCandidateId) return "link";
  return null;
}
