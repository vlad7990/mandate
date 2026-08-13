import "server-only";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import {
  type Archetype,
  type CandidateProfile,
  type PipelineStage,
} from "@/lib/ai/cv-parsing";
import { TIER_ORDER, type Tier } from "@/lib/ranking/tiers";
import { identityKey } from "@/lib/candidate-identity";

// Aggregator for the Global Executive Network view.
//
// Candidates today are project-scoped (one row per (person, project)
// pair). The network view collapses those rows into "people" so the
// recruiter can see one card per individual with their full
// cross-project track record.
//
// Identity proxy: email > linkedin_url > name|current_company. Email
// and linkedin handle the common cases; the name+company fallback
// tolerates candidates who came in via LinkedIn import without
// contact details.

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
   * Stable identity key the UI uses for selection / dedup. Derived
   * from email/linkedin/name — NOT a real database id.
   */
  identity_key: string;
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
 * Candidate rows read per Network view.
 *
 * This page cannot page in SQL the way the candidate and mandate lists do.
 * A person here is several candidate rows folded together by `identityKey`,
 * and which rows fold together is only knowable once they have all been
 * compared — so a LIMIT would cut a person in half rather than cut the list
 * short, and the page would report someone as appearing on one search when
 * they appear on four.
 *
 * The window is a bound rather than a fix: it makes the cost of the view
 * constant instead of proportional to the pool, at the price of only seeing
 * the most recently updated rows. `truncated` says when that has happened,
 * because a silently short network reads as a small network. Removing the
 * bound properly means grouping by identity in Postgres — a stored key
 * column and an aggregate function, along the lines of migration 040.
 */
export const CANDIDATE_ROW_CAP = 2000;

export type NetworkOverview = {
  people: NetworkPerson[];
  projects: NetworkProject[];
  /** True when the pool is larger than `CANDIDATE_ROW_CAP`. */
  truncated: boolean;
  /** Candidate rows actually folded into `people`. */
  rows_considered: number;
  /** Active projects only (status = 'active' or null) — used by the
   * "available for" matcher and the add-to-search picker. */
  active_projects: NetworkProject[];
};

export async function loadNetworkOverview(): Promise<NetworkOverview> {
  const supabase = await createServerSupabaseClient();

  type CandidateRow = {
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
  };
  type ScoreRow = {
    candidate_id: string;
    project_id: string;
    rank_position: number | null;
    overall_score: number | null;
    tier: string | null;
  };

  const [candidatesQ, projectsQ, scoresQ] = await Promise.all([
    supabase
      .from("candidates")
      .select(
        "id, project_id, full_name, email, linkedin_url, current_title, current_company, archetype, pipeline_stage, cv_structured, updated_at"
      )
      .order("updated_at", { ascending: false })
      // Overfetches one row so the caller can tell a full window from a
      // truncated one. See CANDIDATE_ROW_CAP.
      .range(0, CANDIDATE_ROW_CAP),
    supabase
      .from("projects")
      .select("id, title, company_name, status")
      .order("created_at", { ascending: false }),
    supabase
      .from("candidate_scores")
      .select(
        "candidate_id, project_id, rank_position, overall_score, tier"
      ),
  ]);

  const fetched = (candidatesQ.data ?? []) as CandidateRow[];
  const truncated = fetched.length > CANDIDATE_ROW_CAP;
  const candidateRows = truncated ? fetched.slice(0, CANDIDATE_ROW_CAP) : fetched;
  const projects = (projectsQ.data ?? []) as NetworkProject[];
  const scoreRows = (scoresQ.data ?? []) as ScoreRow[];

  const projectById = new Map<string, NetworkProject>();
  for (const p of projects) projectById.set(p.id, p);

  // Index scores by candidate row id (NOT person identity).
  const scoreByCandidateId = new Map<string, ScoreRow>();
  for (const s of scoreRows) scoreByCandidateId.set(s.candidate_id, s);

  // Bucket candidate rows by identity key.
  const buckets = new Map<string, CandidateRow[]>();
  for (const c of candidateRows) {
    const key = identityKey(c);
    const arr = buckets.get(key) ?? [];
    arr.push(c);
    buckets.set(key, arr);
  }

  const people: NetworkPerson[] = Array.from(buckets.entries()).map(
    ([identity_key, rows]) => {
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
        identity_key,
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

  const active_projects = projects.filter(
    (p) => (p.status ?? "active") === "active"
  );

  return {
    people,
    projects,
    active_projects,
    truncated,
    rows_considered: candidateRows.length,
  };
}

/**
 * Count of distinct people in the org's network, for the sidebar badge.
 *
 * Runs in the dashboard layout, so it executes on every authenticated
 * route — which is why it must not scale with the candidate pool. It
 * used to select five columns for every visible candidate row and dedupe
 * them here; now `count_network_people()` (migration 040) applies the
 * same identity rule in Postgres and returns one integer.
 *
 * That function is a transcription of `identityKey` below — email, else
 * linkedin, else name|company. The two must change together or the badge
 * stops matching the Network page.
 */
export async function countNetworkPeople(): Promise<number> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("count_network_people");
  if (error || typeof data !== "number") return 0;
  return data;
}

// identityKey moved to @/lib/candidate-identity — it now has three consumers
// (this page, the sidebar badge, sourcing import dedupe) and one of them is
// SQL (migration 040), so it needed a single home.

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
