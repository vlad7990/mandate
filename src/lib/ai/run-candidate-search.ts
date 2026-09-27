import "server-only";
import { runInference } from "./inference";
import {
  CANDIDATE_SEARCH_SCHEMA,
  CANDIDATE_SEARCH_SYSTEM_PROMPT,
  type CandidateSearchInputCandidate,
  type CandidateSearchResult,
} from "./candidate-search";
import { signInCandidateSearchAgent } from "@/lib/agents/session";
import { applySkillsToPrompt } from "@/lib/skills/skill-injector";
import { captureSeamError } from "@/lib/observability/sentry";
import { personKey } from "@/lib/network/person-key";


export async function runCandidateSearch(
  query: string,
  candidates: CandidateSearchInputCandidate[],
  options?: { system?: string; projectId?: string | null }
): Promise<CandidateSearchResult> {
  if (!query.trim()) {
    return {
      parsed_criteria: { intent: "Empty query.", must_haves: [], nice_to_haves: [] },
      matches: [],
    };
  }

  const userPrompt = JSON.stringify(
    { query: query.trim(), candidates },
    null,
    2
  );

  const response = await runInference("run_candidate_search", {
    max_tokens: 2500,
    system: options?.system ?? CANDIDATE_SEARCH_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
    output_config: {
      format: {
        type: "json_schema",
        schema: CANDIDATE_SEARCH_SCHEMA,
      },
    },
  }, { projectId: options?.projectId });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Candidate-search response contained no text block");
  }

  return JSON.parse(textBlock.text) as CandidateSearchResult;
}

// ────────────────────────────────────────────────────────────────────────
// The seam (096): the CANDIDATE SEARCH AGENT's session, signed in per
// queried render — the TWENTIETH principal, the read-shaped page
// conversion. The split (D2): the page's cookie session stays the
// human door (may this user look at their pool at all) and keeps the
// DISPLAY reads — the rendered rows, the filter dropdowns. The
// judgment runs here: the agent re-reads the pool under ITS OWN
// session (it judges only what it lawfully sees, never cookie-fetched
// rows handed sideways), applies the same structural filters, judges
// with the org's skills in the prompt (D6), records the event with
// COUNTS (never the query's text, never a name), and signs out
// persisting nothing. GET semantics make fail-soft trivial: the query
// and filters live in the URL, so a refusal destroys nothing.
//
// §206 — THE READ HAS A CEILING, and it is stated. The filters are
// clauses in one narrowed query, the six profile fields are JSON paths
// rather than the whole `cv_structured`, and at most POOL_JUDGE_CAP of
// the most recently updated rows reach the model. Whenever that cap cuts
// anybody, `judged` and `inScope` differ and both surfaces say so — a
// list that was cut and does not say so reads as a complete answer
// (§175), and this is an answer a recruiter acts on.
// ────────────────────────────────────────────────────────────────────────

export type CandidateSearchFilters = {
  projectId: string | null;
  archetype: string | null;
  stage: string | null;
  tier: string | null;
  /**
   * §200 — the trawl. `null`/absent searches everything the agent can see
   * (the org), which is what the Pool search page has always done and
   * still does. A list narrows the haystack to those owners plus every
   * UNOWNED row, per 140's ruling.
   *
   * A SCOPE, not a boundary: RLS is unchanged and the same reader can
   * open any of these candidates elsewhere. See lib/desk/trawl.ts.
   */
  ownerIds?: readonly string[] | null;
  /**
   * §200 — the people already present in the mandate being suggested for.
   * Suggesting someone who is already there wastes the reader's attention
   * and the add would refuse them anyway.
   *
   * §204 — these are `personKey` values (profile id, else the computed key),
   * not raw identity keys. On identity keys a MERGED person was suggested
   * again under their other key, and the copy that followed was permitted —
   * minting exactly the duplicate row §201/§202 exist to prevent.
   */
  excludePersonKeys?: readonly string[] | null;
};

/**
 * THE CEILING (§206, D1). The most candidates the agent will judge in one
 * search.
 *
 * This is a TOKEN budget wearing a row count, and the arithmetic is the
 * whole reason it exists. Measured on this organisation's four real CVs,
 * the payload one candidate contributes to the model averages **1,476
 * characters ≈ 370 input tokens** (777 chars of signals, a 185-char
 * headline, the rest identity, pipeline fields and JSON formatting). So:
 *
 *   200 candidates ≈  74k tokens — this cap, comfortably inside a 200k
 *                                  window with the skills prompt and room
 *                                  for the answer
 *   540 candidates ≈ 200k tokens — the window is FULL and the search stops
 *                                  answering at all
 *
 * Before this cap the read had no LIMIT, so the wall was the context
 * window rather than a bill: somewhere around five hundred candidates the
 * Candidate Search Agent simply stopped working, and §200's "Suggest from
 * our pool" calls this path on every mandate.
 *
 * To change it, multiply by 370 and check the result against the model's
 * window — not against how many rows feel reasonable.
 */
export const POOL_JUDGE_CAP = 200;

/**
 * D2 — what the query returns. The six fields the payload actually uses,
 * read as JSON paths rather than by selecting `cv_structured` whole.
 *
 * The column averages **14,875 bytes** a row (measured, same four CVs) and
 * was selected for every row the agent could see in order to use six
 * fields of it — a 2,000-candidate pool shipped ~30 MB into the function on
 * every search. The paths below are roughly 1 KB a row. This is the same
 * defect §205 removed from the Network page, in the one place §205
 * deliberately did not touch.
 *
 * `cv_structured` itself must never reappear in this list; see the guard in
 * run-candidate-search.test.ts.
 */
const POOL_SELECT = [
  "id",
  "project_id",
  "full_name",
  "current_title",
  "current_company",
  "archetype",
  "pipeline_stage",
  "created_by",
  "email",
  "linkedin_url",
  "network_profile_id",
  "cv_domain:cv_structured->>domain",
  "cv_scale:cv_structured->>scale",
  "cv_tech:cv_structured->tech_exposure",
  "cv_transformation:cv_structured->transformation_experience",
  "cv_summary:cv_structured->>summary",
].join(", ");

export type CandidateSearchRun =
  | {
      status: "ready";
      result: CandidateSearchResult;
      /**
       * §206 D3 — the two numbers that keep the count from being silently
       * short. `judged` is how many candidates the model was handed;
       * `inScope` is how many matched the filters in the database. They are
       * equal on every search the cap did not touch, and a surface that
       * shows only the first when they differ is §175's defect class.
       */
      judged: number;
      inScope: number;
    }
  /** The filtered pool is empty — nothing to judge, no model spend. */
  | { status: "empty_pool" }
  /** The Candidate Search Agent refused to sign in — suspended from
   * /ops or credentials absent. Nothing was searched and NOTHING WAS
   * DESTROYED (D5): the query and filters are still in the URL. */
  | { status: "agent_unavailable"; reason: string }
  /** The model call failed; logged. The page words it via agent-errors. */
  | { status: "failed"; error: unknown };

type PoolRow = {
  id: string;
  project_id: string | null;
  full_name: string;
  current_title: string | null;
  current_company: string | null;
  archetype: string | null;
  pipeline_stage: string | null;
  /** §200 — the trawl reads this; NULL is unowned and in every trawl. */
  created_by: string | null;
  email: string | null;
  linkedin_url: string | null;
  /** §204 — the durable person, so "already on this mandate" survives a
   * merge. NULL while the CV is still being read (§196/139). */
  network_profile_id: string | null;
  /** §206 D2 — the parsed profile's six fields, not the profile. */
  cv_domain: string | null;
  cv_scale: string | null;
  cv_tech: string[] | null;
  cv_transformation: string[] | null;
  cv_summary: string | null;
};

/**
 * §206 D3 — the sentence that stops a cut list reading as a complete
 * answer. Returns the clause both surfaces state, or `null` when the agent
 * judged everything in scope and there is nothing to disclose.
 *
 * The advice that follows the clause belongs to the surface: Pool search
 * has filters to narrow, the mandate's suggester does not, and inventing
 * an action the reader cannot take is its own small dishonesty.
 */
export function describeJudgedPool(run: {
  judged: number;
  inScope: number;
}): string | null {
  if (run.judged >= run.inScope) return null;
  const n = (v: number) => v.toLocaleString("en-GB");
  return `Judged the ${n(run.judged)} most recently updated of ${n(
    run.inScope
  )} in scope`;
}

type ScoreRow = {
  candidate_id: string;
  overall_score: number | null;
  tier: string | null;
};

export async function runCandidateSearchAsAgent(
  query: string,
  filters: CandidateSearchFilters,
  /**
   * §200 — what prompted the run, for the trail. "query" is a recruiter
   * typing on Pool search; "mandate" is the reuse suggester asking on a
   * mandate's behalf. Same agent, same judgment, different question.
   */
  trigger: "query" | "mandate" = "query",
  /**
   * The mandate this run was asked on behalf of, for the trail ONLY.
   *
   * It is not `filters.projectId`, and that is the point: a mandate-driven
   * suggestion deliberately searches the WHOLE trawl rather than one
   * mandate's rows, so the filter must stay null while the event still
   * records which search prompted it. Drive 132 caught this — the event
   * landed with no mandate at all, which made "a suggestion ran" true but
   * unanswerable as "for what".
   */
  trailProjectId: string | null = null
): Promise<CandidateSearchRun> {
  const session = await signInCandidateSearchAgent();
  if (!session.ok) {
    console.error(
      `[candidate-search] The Candidate Search Agent could not run — an ` +
        `operator has suspended it or its credentials are absent. The ` +
        `query and filters are safe in the URL. (${session.reason})`
    );
    return { status: "agent_unavailable", reason: session.reason };
  }

  try {
    const supabase = session.client;

    // ── The narrowing happens in Postgres (§206 D2) ──────────────────
    //
    // Every filter below used to run in Node over every row the agent
    // could see. Each one that stays in Node is a row read for nothing,
    // and — because what survives is then capped (D1) — a row that could
    // push somebody out of the judged set without ever being eligible.
    // The test suite fails if one of them stops reaching the query.
    //
    // `tier` lives on candidate_scores, one table away, and PostgREST
    // cannot filter a table by an embedded resource here (candidate_scores
    // has no uniqueness on candidate_id, so an inner join could multiply
    // rows). Resolving it to an id set first is what the candidates list
    // does. Its ceiling is the request line: a tier holding many thousands
    // of candidates would make a URL too long to send, and that is a
    // narrower ceiling than the one this slice removes.
    let tierCandidateIds: string[] | null = null;
    if (filters.tier) {
      const tierQ = await supabase
        .from("candidate_scores")
        .select("candidate_id")
        .eq("tier", filters.tier);
      tierCandidateIds = ((tierQ.data ?? []) as Array<{ candidate_id: string }>)
        .map((r) => r.candidate_id);
    }

    let poolQuery = supabase
      .from("candidates")
      .select(POOL_SELECT, { count: "exact" })
      // D4 — the cap keeps the MOST RECENTLY UPDATED. Ordering by score
      // would promote people evaluated for an unrelated mandate (scores are
      // calibrated per role) and bury every newly parsed CV, which is
      // §175's class as a ranking. `updated_at` is nullable, so NULLS LAST
      // is explicit: a row with no timestamp is not the newest thing here.
      // `id` breaks ties so the same search twice reads the same people.
      .order("updated_at", { ascending: false, nullsFirst: false })
      .order("id", { ascending: false })
      // One more than the cap, so "cut" is distinguishable from "complete"
      // in the rows themselves — the splitOverfetch shape the lists use.
      .limit(POOL_JUDGE_CAP + 1);

    if (filters.projectId) poolQuery = poolQuery.eq("project_id", filters.projectId);
    if (filters.archetype) poolQuery = poolQuery.eq("archetype", filters.archetype);
    if (filters.stage) poolQuery = poolQuery.eq("pipeline_stage", filters.stage);
    if (tierCandidateIds !== null) {
      // An empty set must match nothing rather than being skipped.
      poolQuery = poolQuery.in("id", tierCandidateIds);
    }
    if (filters.ownerIds) {
      // §200 — the trawl. An UNOWNED row is in every scope (140's ruling):
      // every candidate predating that migration has created_by NULL, and
      // treating those as nobody's would empty the trawl entirely.
      const owners = filters.ownerIds.filter(Boolean);
      poolQuery =
        owners.length > 0
          ? poolQuery.or(`created_by.is.null,created_by.in.(${owners.join(",")})`)
          : poolQuery.is("created_by", null);
    }

    const [poolQ, projectsQ, wholePoolQ] = await Promise.all([
      poolQuery,
      supabase.from("projects").select("id, title"),
      // The trail's `pool` has always meant the whole visible pool, and it
      // still does — as a count with no rows on the wire.
      supabase.from("candidates").select("id", { count: "exact", head: true }),
    ]);

    // A rejected query must not read as an empty pool. That was tolerable
    // while the read had no clauses to reject; now that the filters are in
    // the request (and the tier id set can outgrow a URL), silence here
    // would answer "nobody matches" to a question never asked.
    if (poolQ.error) {
      captureSeamError("[candidate-search] the pool read failed", poolQ.error);
      return { status: "failed", error: poolQ.error };
    }

    const overfetched = (poolQ.data ?? []) as unknown as PoolRow[];
    /** Everything the filters admit, whether or not it was read. */
    const inScope = poolQ.count ?? overfetched.length;
    const projects = (projectsQ.data ?? []) as Array<{
      id: string;
      title: string;
    }>;

    const projectById = new Map(projects.map((p) => [p.id, p.title]));

    // The one rule that stays in Node, because it needs `personKey` and
    // cannot be a clause: it now runs over at most CAP + 1 rows.
    const excluded = filters.excludePersonKeys
      ? new Set(filters.excludePersonKeys)
      : null;

    const eligible = excluded
      ? overfetched.filter(
          (c) =>
            !excluded.has(
              personKey({
                full_name: c.full_name,
                email: c.email,
                linkedin_url: c.linkedin_url,
                current_company: c.current_company,
                network_profile_id: c.network_profile_id,
              })
            )
        )
      : overfetched;

    const judged = eligible.slice(0, POOL_JUDGE_CAP);

    if (judged.length === 0) return { status: "empty_pool" };

    // Scores for the rows actually judged, not for the whole pool.
    const scoresQ = await supabase
      .from("candidate_scores")
      .select("candidate_id, overall_score, tier")
      .in(
        "candidate_id",
        judged.map((c) => c.id)
      );
    const scores = (scoresQ.data ?? []) as ScoreRow[];
    const scoreById = new Map(scores.map((s) => [s.candidate_id, s]));

    const inputCandidates: CandidateSearchInputCandidate[] = judged.map(
      (c) => {
        const score = scoreById.get(c.id);
        const signals = [
          c.cv_domain,
          c.cv_scale,
          ...(c.cv_tech ?? []).slice(0, 6),
          ...(c.cv_transformation ?? []).slice(0, 3),
        ]
          .filter((s): s is string => !!s)
          .join(", ");
        const headline =
          c.cv_summary?.split(/(?<=[.!?])\s/)[0]?.trim() ?? null;

        return {
          id: c.id,
          full_name: c.full_name,
          current_title: c.current_title,
          current_company: c.current_company,
          archetype: c.archetype,
          pipeline_stage: c.pipeline_stage,
          project_id: c.project_id,
          project_title: c.project_id
            ? projectById.get(c.project_id) ?? null
            : null,
          overall_score: score?.overall_score ?? null,
          tier: score?.tier ?? null,
          signals,
          headline,
        };
      }
    );

    // The judgment carries the org's skills (D6). A project-filtered
    // search reads that project's role skills too; an org-wide search
    // reads the org-wide set.
    const system = await applySkillsToPrompt(CANDIDATE_SEARCH_SYSTEM_PROMPT, {
      projectId: filters.projectId,
      organizationId: session.organizationId,
      client: supabase,
    });

    let result: CandidateSearchResult;
    try {
      result = await runCandidateSearch(query, inputCandidates, { system, projectId: filters.projectId });
    } catch (err) {
      captureSeamError("[candidate-search] agent judgment failed", err);
      return { status: "failed", error: err };
    }

    // The trail (D4): one event per ANSWERED search — counts and which
    // filters were applied, never the query's text, never a name.
    const { error: eventErr } = await supabase.rpc("record_agent_event", {
      p_event_type: "candidate_search_answered",
      p_project_id: trailProjectId ?? filters.projectId,
      p_detail: {
        agent_kind: "candidate_search",
        trigger,
        pool: wholePoolQ.count ?? 0,
        filtered: inScope,
        // §206 D3 — the third count, so the trail can answer "did the cap
        // fire?" without re-deriving it. `judged < filtered` means somebody
        // in scope was never read.
        judged: inputCandidates.length,
        matches: result.matches.length,
        project_filter: Boolean(filters.projectId),
        archetype_filter: Boolean(filters.archetype),
        stage_filter: Boolean(filters.stage),
        tier_filter: Boolean(filters.tier),
        // Counts only, never ids: the trail says HOW MUCH the trawl saw,
        // not whose CVs they were.
        owner_scoped: Boolean(filters.ownerIds),
        excluded: filters.excludePersonKeys?.length ?? 0,
      },
    });
    if (eventErr) {
      captureSeamError(
        "[candidate-search] failed to record the answer event",
        eventErr
      );
    }

    return {
      status: "ready",
      result,
      judged: inputCandidates.length,
      inScope,
    };
  } finally {
    // Persist nothing (D3): revoke the run's session from GoTrue's ledger.
    await session.signOut();
  }
}
