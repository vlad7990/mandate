import "server-only";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { type Archetype, type PipelineStage } from "@/lib/ai/cv-parsing";
import { type Tier } from "@/lib/ranking/tiers";

// Aggregator for the Global Executive Network view.
//
// Candidates today are project-scoped (one row per (person, project)
// pair). The network view collapses those rows into "people" so the
// recruiter can see one card per individual with their full
// cross-project track record.
//
// §204 — WHAT MAKES TWO ROWS ONE PERSON HERE: `network_profile_id`, the
// durable person 098 maintains on every candidate birth path. It used to
// be `identityKey(row)`, recomputed per row — which was the only identity
// available when this page was built, and stopped being right the moment
// §203 shipped a merge. A merge repoints the FK; it cannot change what a
// row's own fields compute to, so a merged person went on rendering as two
// rows, and the second of them found no relationship profile at all and so
// wore the neutral chip — including when the person was suppressed.
//
// Consequence worth keeping in view: the fold no longer computes identity
// anywhere in the render path. There is exactly one rule, it lives in the
// database, and the overlay joins on the profile's own id.

export type NetworkProject = {
  id: string;
  title: string;
  company_name: string;
  status: string | null;
};

export type NetworkAppearance = {
  /** The candidate row id in the source project. */
  candidate_id: string;
  project_id: string;
  project_title: string;
  project_status: string | null;
  pipeline_stage: PipelineStage | null;
  rank: number | null;
  overall_score: number | null;
  tier: Tier | null;
  /** When this row was last touched. */
  updated_at: string;
};

export type NetworkPerson = {
  /**
   * The durable person (098) these candidate rows belong to — a real
   * `network_profiles.id`, and the key the relationship overlay joins on.
   * §204 replaced a derived `identity_key` here: a merge moves this and
   * cannot move a derived key.
   */
  profile_id: string;
  /** The most recently updated candidate row id — used as the
   * source when copying into a new project. */
  canonical_candidate_id: string;
  full_name: string;
  current_title: string | null;
  current_company: string | null;
  email: string | null;
  linkedin_url: string | null;
  archetype: Archetype | null;
  domain: string | null;
  years_experience: number | null;
  /** Tech_exposure from the canonical row, capped to 8 entries. */
  tech_exposure: string[];
  /** Best (closest-to-tier_1) tier achieved across all appearances. */
  best_tier: Tier | null;
  /** Highest overall_score across all appearances. */
  best_score: number | null;
  /** Average overall_score across appearances with a score. */
  average_score: number | null;
  /** Most recent updated_at across all appearances. */
  last_active_at: string;
  /** Distinct project_ids the person appears in. */
  appearances: NetworkAppearance[];
  /** True when person has been shortlisted (>=tier_2 OR
   * pipeline_stage is past "matched") at least once. */
  shortlisted_before: boolean;
  /** True when person appears in ≥2 distinct projects. */
  returning: boolean;
};

/**
 * §205 — WHAT THE PAGE READS NOW, and what it stopped reading.
 *
 * This view used to fetch candidate rows and fold them here, over a window of
 * the 2,000 most recently updated rows. Measured on production before the
 * change, against a 2,100-row pool:
 *
 *   bytes the page shipped (2000 rows):  42,497 KB  (cv_structured: 42,217 KB)
 *   bytes ONE folded page of 25 needs:       13 KB
 *
 * 99.3% of that was `cv_structured`, transferred for every row so the fold
 * could read three fields from each person's canonical record. Worse than the
 * cost, the window made the page WRONG: it showed 2,000 people where 2,100
 * existed (the badge said 2,100), and a person who WAS on the page read
 * "Considered for 1 project" when they were on two, because their older
 * record fell outside the window.
 *
 * The fold now runs in Postgres (migration 145) on `network_profile_id`, and
 * this module reads one page of people.
 *
 * The gate expected a TypeScript fold to stay here as the shape authority.
 * It is gone instead, deliberately: once the page reads the view, nothing
 * calls it, and an implementation with no caller is the drift it was meant to
 * guard against. The shape is held by `network-sql-parity.test.ts`, which
 * compares the view's own columns to the row type below.
 */

/** Filters the page understands. Every one of them is applied in SQL. */
export type NetworkFilters = {
  q?: string | null;
  archetype?: string | null;
  tier?: string | null;
  domain?: string | null;
  stage?: string | null;
  years?: string | null;
};

export type NetworkSort =
  | "best_score"
  | "average_score"
  | "last_active"
  | "name";

export type NetworkRollup = {
  /** People matching the current filters — the whole pool, not this page. */
  total: number;
  returning: number;
  shortlisted: number;
  domains: number;
  by_archetype: Array<{ archetype: string; count: number }>;
  by_domain: Array<{ domain: string; count: number }>;
  top_by_average: Array<{ full_name: string; average_score: number }>;
  most_versatile: Array<{ full_name: string; project_count: number }>;
  /** §204/D2 — candidate rows with no person yet. Said, never dropped. */
  people_pending: number;
};

export type NetworkPage = {
  people: NetworkPerson[];
  /** One row was overfetched and found — the Next control is live. */
  hasMore: boolean;
  rollup: NetworkRollup;
  /** Active mandates, for "available for" and the add-to-search picker. */
  active_projects: NetworkProject[];
  /** Every domain in the pool, for the filter. NOT just this page's. */
  domains: string[];
};

type PersonRow = {
  profile_id: string;
  canonical_candidate_id: string;
  full_name: string;
  current_title: string | null;
  current_company: string | null;
  email: string | null;
  linkedin_url: string | null;
  archetype: string | null;
  domain: string | null;
  years_experience: number | string | null;
  tech_exposure: unknown;
  best_tier: string | null;
  best_score: number | string | null;
  average_score: number | string | null;
  last_active_at: string;
  appearance_count: number;
  project_count: number;
  shortlisted_before: boolean;
  is_returning: boolean;
};

/** PostgREST returns `numeric` as a string; a silent NaN here would sort the
 * whole page wrongly and look like a ranking bug. */
function num(value: number | string | null | undefined): number | null {
  if (value == null) return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function personFromRow(
  row: PersonRow,
  appearances: NetworkAppearance[]
): NetworkPerson {
  const average = num(row.average_score);

  return {
    profile_id: row.profile_id,
    canonical_candidate_id: row.canonical_candidate_id,
    full_name: row.full_name,
    current_title: row.current_title,
    current_company: row.current_company,
    email: row.email,
    linkedin_url: row.linkedin_url,
    archetype: (row.archetype as Archetype | null) ?? null,
    domain: row.domain,
    years_experience: num(row.years_experience),
    tech_exposure: Array.isArray(row.tech_exposure)
      ? (row.tech_exposure as unknown[]).map(String).slice(0, 8)
      : [],
    best_tier: (row.best_tier as Tier | null) ?? null,
    best_score: num(row.best_score),
    average_score: average != null ? round2(average) : null,
    last_active_at: row.last_active_at,
    appearances,
    shortlisted_before: row.shortlisted_before,
    returning: row.is_returning,
  };
}

const EMPTY_ROLLUP: NetworkRollup = {
  total: 0,
  returning: 0,
  shortlisted: 0,
  domains: 0,
  by_archetype: [],
  by_domain: [],
  top_by_average: [],
  most_versatile: [],
  people_pending: 0,
};

/**
 * One page of the network, its figures, and the filter's own options.
 *
 * §205 — THE PAGE READS THE VIEW DIRECTLY, and that is a measurement, not a
 * preference. At 2,135 people, the same fold:
 *
 *   the view with ORDER BY + LIMIT, as PostgREST sends it:      13 ms
 *   ... inside a SQL function taking the filters as parameters: 785 ms
 *   ... inside a plpgsql function with EXECUTE ... USING:       209 ms
 *
 * A function returning a ROW SET is planned once with the filters as
 * parameters — so it cannot prune what a NULL filter makes irrelevant — and
 * copies every row through a tuplestore. Sending the filters as literals, the
 * way every other list in this product does, avoids both. The rollup is the
 * exception that proves the rule: it returns ONE value, and as plpgsql with a
 * custom plan per call it costs 12 ms.
 *
 * The rollup deliberately does NOT come from `people`: under paging that array
 * is 25 rows, and a headline computed from it would describe a page while
 * wearing the word "network" — which is how the old 2,000-row window made this
 * page wrong in the first place.
 */
export async function loadNetworkPage(input: {
  filters: NetworkFilters;
  sort: NetworkSort;
  dir: "asc" | "desc";
  /** Rows wanted. One more than this is fetched, to light the Next control. */
  perPage: number;
  offset: number;
}): Promise<NetworkPage> {
  const supabase = await createServerSupabaseClient();
  const f = input.filters;
  const q = f.q?.trim() || null;
  const rpcArgs = {
    p_q: q,
    p_archetype: f.archetype || null,
    p_tier: f.tier || null,
    p_domain: f.domain || null,
    p_stage: f.stage || null,
    p_years: f.years || null,
  };

  // The page, straight off the fold. Every clause here has a twin inside
  // `network_people_matches` (migration 146), which is what the rollup uses —
  // the guard in network-sql-parity.test.ts holds the two lists together.
  let page = supabase
    .from("network_people_folded")
    .select(
      "profile_id, canonical_candidate_id, full_name, current_title, current_company, email, linkedin_url, archetype, domain, years_experience, tech_exposure, best_tier, best_score, average_score, last_active_at, appearance_count, project_count, shortlisted_before, is_returning"
    )
    .order(SORT_COLUMNS[input.sort], {
      ascending: input.dir === "asc",
      nullsFirst: false,
    })
    // The tiebreak is load-bearing: without a total order, two people on the
    // same score sit in an undefined relative position, and OFFSET paging can
    // then show one twice or never while the pager looks fine.
    .order("last_active_at", { ascending: false, nullsFirst: false })
    .order("profile_id", { ascending: true })
    .range(input.offset, input.offset + input.perPage);

  if (q) page = page.ilike("search_text", `%${q}%`);
  if (f.archetype) page = page.eq("archetype", f.archetype);
  if (f.tier) page = page.eq("best_tier", f.tier);
  if (f.domain) page = page.eq("domain", f.domain);
  if (f.stage) page = page.contains("stages", [f.stage]);
  if (f.years) {
    // `coalesce(years, 0)` in SQL: a person with no stated experience reads as
    // 0, so they belong in the first bucket rather than in none of them.
    const bucket = YEARS_BUCKETS[f.years];
    if (bucket) {
      if (bucket.min === 0) {
        page = page.or(
          `years_experience.is.null,years_experience.lte.${bucket.max}`
        );
      } else {
        page = page.gte("years_experience", bucket.min);
        if (bucket.max != null) page = page.lte("years_experience", bucket.max);
      }
    }
  }

  const [pageQ, rollupQ, projectsQ, domainsQ] = await Promise.all([
    page,
    supabase.rpc("network_people_rollup", rpcArgs),
    supabase
      .from("projects")
      .select("id, title, company_name, status")
      .order("created_at", { ascending: false }),
    supabase.rpc("network_domains"),
  ]);

  const rows = (pageQ.data ?? []) as PersonRow[];
  const hasMore = rows.length > input.perPage;
  const onPage = rows.slice(0, input.perPage);

  // Appearances for the people ON THIS PAGE — one indexed read, not a jsonb
  // gather inside the fold. Measured at 0 ms against a 2,136-row pool.
  const appearances = await loadAppearances(
    supabase,
    onPage.map((r) => r.profile_id)
  );

  const projects = (projectsQ.data ?? []) as NetworkProject[];
  const rollup = (rollupQ.data as NetworkRollup | null) ?? EMPTY_ROLLUP;

  return {
    people: onPage.map((row) =>
      personFromRow(row, appearances.get(row.profile_id) ?? [])
    ),
    hasMore,
    rollup,
    active_projects: projects.filter((p) => (p.status ?? "active") === "active"),
    domains: ((domainsQ.data ?? []) as Array<{ domain: string }>)
      .map((d) => d.domain)
      .filter(Boolean),
  };
}

/** Sort keys to view columns. The keys are the page's allowlist. */
const SORT_COLUMNS: Record<NetworkSort, string> = {
  best_score: "best_score",
  average_score: "average_score",
  last_active: "last_active_at",
  name: "full_name",
};

const YEARS_BUCKETS: Record<string, { min: number; max: number | null }> = {
  "0-5": { min: 0, max: 5 },
  "6-10": { min: 6, max: 10 },
  "11-20": { min: 11, max: 20 },
  "21+": { min: 21, max: null },
};

type AppearanceRow = {
  id: string;
  project_id: string;
  pipeline_stage: string | null;
  updated_at: string;
  network_profile_id: string;
  projects: Array<{ title: string | null; status: string | null }> | { title: string | null; status: string | null } | null;
  candidate_scores:
    | Array<{ rank_position: number | null; overall_score: number | null; tier: string | null }>
    | null;
};

async function loadAppearances(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  profileIds: string[]
): Promise<Map<string, NetworkAppearance[]>> {
  const out = new Map<string, NetworkAppearance[]>();
  if (profileIds.length === 0) return out;

  // NAME THE FK on every embed (§158's standing lesson: a bare embed of a
  // table with two paths to the same parent nulls the whole thing).
  const { data } = await supabase
    .from("candidates")
    .select(
      "id, project_id, pipeline_stage, updated_at, network_profile_id, projects!candidates_project_id_fkey(title, status), candidate_scores!candidate_scores_candidate_id_fkey(rank_position, overall_score, tier)"
    )
    .in("network_profile_id", profileIds)
    .not("project_id", "is", null)
    .order("updated_at", { ascending: false });

  for (const row of (data ?? []) as unknown as AppearanceRow[]) {
    const score = row.candidate_scores?.[0] ?? null;
    const project = Array.isArray(row.projects) ? row.projects[0] : row.projects;
    const list = out.get(row.network_profile_id) ?? [];
    list.push({
      candidate_id: row.id,
      project_id: row.project_id,
      project_title: project?.title ?? "(unknown project)",
      project_status: project?.status ?? null,
      pipeline_stage: (row.pipeline_stage ?? null) as PipelineStage | null,
      rank: num(score?.rank_position ?? null),
      overall_score: num(score?.overall_score ?? null),
      tier: (score?.tier ?? null) as Tier | null,
      updated_at: row.updated_at,
    });
    out.set(row.network_profile_id, list);
  }
  return out;
}

/**
 * Count of distinct people in the org's network, for the sidebar badge.
 *
 * Runs in the dashboard layout, so it executes on every authenticated
 * route — which is why it must not scale with the candidate pool. It
 * used to select five columns for every visible candidate row and dedupe
 * them here; now `count_network_people()` returns one integer.
 *
 * §204 — that function counts DISTINCT `network_profile_id`, excluding rows
 * with no person yet (migration 144), which is exactly what the
 * `network_people_folded` view does. The badge and the page therefore answer
 * the same question; while the badge counted derived keys, a merge moved the
 * page by one and the badge by nothing.
 */
export async function countNetworkPeople(): Promise<number> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("count_network_people");
  if (error || typeof data !== "number") return 0;
  return data;
}

// identityKey lives in @/lib/candidate-identity and is NO LONGER READ HERE
// (§204). Its remaining consumers all ask the other question — "who is this
// INCOMING thing?" — before a row, and therefore a person, exists.

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Surface the active projects this person *could* fit, based on
 * dimension overlap. Pure heuristic — no AI call. The recruiter
 * reads it as "consider these searches", not as a binding match.
 */
export function recommendActiveProjectsForPerson(
  person: NetworkPerson,
  activeProjects: NetworkProject[]
): NetworkProject[] {
  const inProject = new Set(person.appearances.map((a) => a.project_id));
  return activeProjects
    .filter((p) => !inProject.has(p.id))
    .slice(0, 5);
}
