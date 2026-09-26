import "server-only";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import {
  type Archetype,
  type CandidateProfile,
  type PipelineStage,
} from "@/lib/ai/cv-parsing";
import { TIER_ORDER, type Tier } from "@/lib/ranking/tiers";

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
 * this module reads one page of people. `foldRowsIntoPeople` below stays as
 * the SHAPE authority — the fixtures test it, and a guard proves the SQL
 * agrees with it — because two implementations of one rule drift silently,
 * which is what §201 and §204 both cost.
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
  appearances: unknown;
};

/** PostgREST returns `numeric` as a string; a silent NaN here would sort the
 * whole page wrongly and look like a ranking bug. */
function num(value: number | string | null | undefined): number | null {
  if (value == null) return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function personFromRow(row: PersonRow): NetworkPerson {
  const appearances = Array.isArray(row.appearances)
    ? (row.appearances as Array<Record<string, unknown>>).map((a) => ({
        candidate_id: String(a.candidate_id),
        project_id: String(a.project_id),
        project_title: (a.project_title as string) ?? "(unknown project)",
        project_status: (a.project_status as string | null) ?? null,
        pipeline_stage: (a.pipeline_stage ?? null) as PipelineStage | null,
        rank: num(a.rank as number | string | null),
        overall_score: num(a.overall_score as number | string | null),
        tier: (a.tier ?? null) as Tier | null,
        updated_at: String(a.updated_at),
      }))
    : [];

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
 * The rollup deliberately does NOT come from `people`: under paging that
 * array is 25 rows, and a headline computed from it would describe a page
 * while wearing the word "network" — which is exactly how the old window made
 * the page wrong. It reads the same fold the table reads, filtered the same
 * way (migration 145).
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
  const args = {
    p_q: f.q?.trim() || null,
    p_archetype: f.archetype || null,
    p_tier: f.tier || null,
    p_domain: f.domain || null,
    p_stage: f.stage || null,
    p_years: f.years || null,
  };

  const [peopleQ, rollupQ, projectsQ, domainsQ] = await Promise.all([
    supabase.rpc("network_people", {
      ...args,
      p_sort: input.sort,
      p_dir: input.dir,
      p_limit: input.perPage + 1,
      p_offset: input.offset,
    }),
    supabase.rpc("network_people_rollup", args),
    supabase
      .from("projects")
      .select("id, title, company_name, status")
      .order("created_at", { ascending: false }),
    supabase.rpc("network_domains"),
  ]);

  const rows = (peopleQ.data ?? []) as PersonRow[];
  const hasMore = rows.length > input.perPage;
  const people = rows.slice(0, input.perPage).map(personFromRow);

  const projects = (projectsQ.data ?? []) as NetworkProject[];
  const rollup = (rollupQ.data as NetworkRollup | null) ?? EMPTY_ROLLUP;

  return {
    people,
    hasMore,
    rollup,
    active_projects: projects.filter((p) => (p.status ?? "active") === "active"),
    domains: ((domainsQ.data ?? []) as Array<{ domain: string }>)
      .map((d) => d.domain)
      .filter(Boolean),
  };
}

/** A candidate row as the fold reads it. The SQL in migration 145 reads the
 * same columns; `network-fold.test.ts` drives this shape, and
 * `network-sql-parity.test.ts` proves the two agree. */
export type NetworkCandidateRow = {
  id: string;
  project_id: string | null;
  full_name: string;
  email: string | null;
  linkedin_url: string | null;
  current_title: string | null;
  current_company: string | null;
  archetype: string | null;
  pipeline_stage: string | null;
  cv_structured: unknown;
  updated_at: string;
  /** The durable person (098). NULL while the CV is still being read and
   * the only identity signal is a name — §196/139. */
  network_profile_id: string | null;
};

export type NetworkScoreRow = {
  candidate_id: string;
  project_id: string;
  rank_position: number | null;
  overall_score: number | null;
  tier: string | null;
};

/**
 * The fold: candidate rows → people. Pure, so it can be driven by fixtures
 * rather than inferred from a screenshot.
 *
 * Rows arrive `updated_at` DESC; the most recent row of a person is
 * canonical and supplies the facts shown (D3 — the fold changes WHICH rows
 * sit together, not whose account of the person is authoritative; the
 * documents still speak, not the survivor profile's display name).
 */
export function foldRowsIntoPeople(
  candidateRows: NetworkCandidateRow[],
  scoreRows: NetworkScoreRow[],
  projects: NetworkProject[]
): { people: NetworkPerson[]; people_pending: number } {
  type CandidateRow = NetworkCandidateRow;
  type ScoreRow = NetworkScoreRow;

  const projectById = new Map<string, NetworkProject>();
  for (const p of projects) projectById.set(p.id, p);

  // Index scores by candidate row id (NOT person identity).
  const scoreByCandidateId = new Map<string, ScoreRow>();
  for (const s of scoreRows) scoreByCandidateId.set(s.candidate_id, s);

  // Bucket candidate rows by the person they belong to. A row with no
  // person yet is held back rather than folded (D2) — it is a CV being
  // read, not somebody named after their file.
  const buckets = new Map<string, CandidateRow[]>();
  let people_pending = 0;
  for (const c of candidateRows) {
    const key = c.network_profile_id;
    if (!key) {
      people_pending += 1;
      continue;
    }
    const arr = buckets.get(key) ?? [];
    arr.push(c);
    buckets.set(key, arr);
  }

  const people: NetworkPerson[] = Array.from(buckets.entries()).map(
    ([profile_id, rows]) => {
      // Most recent row is canonical (rows are already updated_at desc).
      const canonical = rows[0];
      const profile = (canonical.cv_structured ?? {}) as Partial<CandidateProfile>;

      const appearances: NetworkAppearance[] = rows
        .filter((r) => r.project_id != null)
        .map((r) => {
          const score = scoreByCandidateId.get(r.id);
          const project = r.project_id
            ? projectById.get(r.project_id) ?? null
            : null;
          return {
            candidate_id: r.id,
            project_id: r.project_id as string,
            project_title: project?.title ?? "(unknown project)",
            project_status: project?.status ?? null,
            pipeline_stage: (r.pipeline_stage ?? null) as PipelineStage | null,
            rank: score?.rank_position ?? null,
            overall_score: score?.overall_score ?? null,
            tier: (score?.tier as Tier | null) ?? null,
            updated_at: r.updated_at,
          };
        });

      const scoredAppearances = appearances.filter(
        (a) => a.overall_score != null
      );
      const best_score =
        scoredAppearances.length > 0
          ? Math.max(...scoredAppearances.map((a) => a.overall_score ?? 0))
          : null;
      const average_score =
        scoredAppearances.length > 0
          ? scoredAppearances.reduce(
              (sum, a) => sum + (a.overall_score ?? 0),
              0
            ) / scoredAppearances.length
          : null;
      const best_tier = bestTier(appearances.map((a) => a.tier));

      const shortlisted_before = appearances.some(
        (a) =>
          (a.tier && (a.tier === "tier_1" || a.tier === "tier_2")) ||
          (a.pipeline_stage &&
            [
              "shortlisted",
              "submitted",
              "interviewed",
              "passed_rounds",
              "finalist",
              "offer",
              "hired",
            ].includes(a.pipeline_stage))
      );

      const last_active_at =
        appearances.length > 0
          ? appearances
              .map((a) => a.updated_at)
              .sort()
              .pop() ?? canonical.updated_at
          : canonical.updated_at;

      return {
        profile_id,
        canonical_candidate_id: canonical.id,
        full_name: canonical.full_name,
        current_title: canonical.current_title,
        current_company: canonical.current_company,
        email: canonical.email,
        linkedin_url: canonical.linkedin_url,
        archetype: (canonical.archetype as Archetype | null) ?? null,
        domain: profile.domain ?? null,
        years_experience: profile.years_experience ?? null,
        tech_exposure: (profile.tech_exposure ?? []).slice(0, 8),
        best_tier,
        best_score,
        average_score:
          average_score != null ? round2(average_score) : null,
        last_active_at,
        appearances,
        shortlisted_before,
        returning: new Set(appearances.map((a) => a.project_id)).size >= 2,
      };
    }
  );

  // Sort by best_score desc by default; null scores sink to the bottom.
  people.sort((a, b) => {
    const av = a.best_score ?? -1;
    const bv = b.best_score ?? -1;
    return bv - av;
  });

  return { people, people_pending };
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
 * with no person yet (migration 144), which is exactly what
 * `foldRowsIntoPeople` above does. The badge and the page therefore answer
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

function bestTier(tiers: Array<Tier | null>): Tier | null {
  let best: Tier | null = null;
  for (const t of tiers) {
    if (!t) continue;
    if (!best) {
      best = t;
      continue;
    }
    if (TIER_ORDER.indexOf(t) < TIER_ORDER.indexOf(best)) {
      best = t;
    }
  }
  return best;
}

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
