import "server-only";
import { runInference } from "./inference";
import {
  CANDIDATE_SEARCH_SCHEMA,
  CANDIDATE_SEARCH_SYSTEM_PROMPT,
  type CandidateSearchInputCandidate,
  type CandidateSearchResult,
} from "./candidate-search";
import type { CandidateProfile } from "./cv-parsing";
import { signInCandidateSearchAgent } from "@/lib/agents/session";
import { applySkillsToPrompt } from "@/lib/skills/skill-injector";
import { captureSeamError } from "@/lib/observability/sentry";
import { identityKey } from "@/lib/candidate-identity";


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
   * §200 — identity keys already present in the mandate being suggested
   * for. Suggesting someone who is already there wastes the reader's
   * attention and the add would refuse them anyway.
   */
  excludeIdentityKeys?: readonly string[] | null;
};

export type CandidateSearchRun =
  | {
      status: "ready";
      result: CandidateSearchResult;
      /** What the agent actually searched, for the page's honest count. */
      poolSize: number;
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
  cv_structured: unknown;
  /** §200 — the trawl reads this; NULL is unowned and in every trawl. */
  created_by: string | null;
  email: string | null;
  linkedin_url: string | null;
};

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
  trigger: "query" | "mandate" = "query"
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

    const [candidatesQ, projectsQ, scoresQ] = await Promise.all([
      supabase
        .from("candidates")
        .select(
          "id, project_id, full_name, current_title, current_company, archetype, pipeline_stage, cv_structured, created_by, email, linkedin_url"
        ),
      supabase.from("projects").select("id, title"),
      supabase
        .from("candidate_scores")
        .select("candidate_id, overall_score, tier"),
    ]);

    const pool = (candidatesQ.data ?? []) as PoolRow[];
    const projects = (projectsQ.data ?? []) as Array<{
      id: string;
      title: string;
    }>;
    const scores = (scoresQ.data ?? []) as ScoreRow[];

    const projectById = new Map(projects.map((p) => [p.id, p.title]));
    const scoreById = new Map(scores.map((s) => [s.candidate_id, s]));

    // The same structural narrowing the page shows: filters shrink the
    // haystack; the agent ranks what's left.
    const owners = filters.ownerIds ? new Set(filters.ownerIds) : null;
    const excluded = filters.excludeIdentityKeys
      ? new Set(filters.excludeIdentityKeys)
      : null;

    const filtered = pool.filter((c) => {
      if (filters.projectId && c.project_id !== filters.projectId) return false;
      if (filters.archetype && c.archetype !== filters.archetype) return false;
      if (filters.stage && c.pipeline_stage !== filters.stage) return false;
      if (filters.tier) {
        const score = scoreById.get(c.id);
        if (score?.tier !== filters.tier) return false;
      }
      // §200 — the trawl. An UNOWNED row is in every scope (140's ruling):
      // every candidate predating that migration has created_by NULL, and
      // treating those as nobody's would empty the trawl entirely.
      if (owners && c.created_by && !owners.has(c.created_by)) return false;
      if (
        excluded &&
        excluded.has(
          identityKey({
            full_name: c.full_name,
            email: c.email,
            linkedin_url: c.linkedin_url,
            current_company: c.current_company,
          })
        )
      ) {
        return false;
      }
      return true;
    });

    if (filtered.length === 0) return { status: "empty_pool" };

    const inputCandidates: CandidateSearchInputCandidate[] = filtered.map(
      (c) => {
        const profile = (c.cv_structured ?? {}) as Partial<CandidateProfile>;
        const score = scoreById.get(c.id);
        const signals = [
          profile.domain,
          profile.scale,
          ...(profile.tech_exposure ?? []).slice(0, 6),
          ...(profile.transformation_experience ?? []).slice(0, 3),
        ]
          .filter((s): s is string => !!s)
          .join(", ");
        const headline =
          profile.summary?.split(/(?<=[.!?])\s/)[0]?.trim() ?? null;

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
      p_project_id: filters.projectId,
      p_detail: {
        agent_kind: "candidate_search",
        trigger,
        pool: pool.length,
        filtered: filtered.length,
        matches: result.matches.length,
        project_filter: Boolean(filters.projectId),
        archetype_filter: Boolean(filters.archetype),
        stage_filter: Boolean(filters.stage),
        tier_filter: Boolean(filters.tier),
        // Counts only, never ids: the trail says HOW MUCH the trawl saw,
        // not whose CVs they were.
        owner_scoped: Boolean(filters.ownerIds),
        excluded: filters.excludeIdentityKeys?.length ?? 0,
      },
    });
    if (eventErr) {
      captureSeamError(
        "[candidate-search] failed to record the answer event",
        eventErr
      );
    }

    return { status: "ready", result, poolSize: inputCandidates.length };
  } finally {
    // Persist nothing (D3): revoke the run's session from GoTrue's ledger.
    await session.signOut();
  }
}
