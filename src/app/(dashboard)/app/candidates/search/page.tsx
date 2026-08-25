import Link from "next/link";
import { TerminalTitle } from "@/components/ui/page-shell";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import {
  ARCHETYPES,
  PIPELINE_LABELS,
  PIPELINE_STAGES,
  type Archetype,
  type PipelineStage,
} from "@/lib/ai/cv-parsing";
import { TIER_BANDS, TIER_ORDER, type Tier } from "@/lib/ranking/tiers";
import { runCandidateSearchAsAgent } from "@/lib/ai/run-candidate-search";
import { agentErrorMessage } from "@/lib/ai/agent-errors";
import type { CandidateSearchResult } from "@/lib/ai/candidate-search";
import { SetBreadcrumbs } from "@/components/dashboard/breadcrumbs";
import {
  IconChevronRight,
  IconFilter,
  IconIntelligence,
  IconMandates,
  IconSearch,
} from "@/components/icons";
import { MastHead } from "@/components/ui/mast-head";
import { StatusChip, type ChipTone } from "@/components/ui/status-chip";
import { cn } from "@/lib/utils";
import { cookies } from "next/headers";
import { SAMPLE_DISMISSED_COOKIE, shouldShowSample } from "@/lib/sample";
import { SampleSearchExample } from "@/components/sample/sample-sourcing";

type CandidateRow = {
  id: string;
  project_id: string | null;
  full_name: string;
  current_title: string | null;
  current_company: string | null;
  archetype: string | null;
  pipeline_stage: string | null;
  cv_processing: boolean;
  cv_structured: unknown;
};

type ProjectLite = { id: string; title: string };
type ScoreLite = {
  candidate_id: string;
  overall_score: number | null;
  tier: string | null;
};

type SearchParams = {
  q?: string;
  project?: string;
  archetype?: string;
  stage?: string;
  tier?: string;
};

const ARCHETYPE_TONE: Record<Archetype, ChipTone> = {
  Builder: "primary",
  Operator: "secondary",
  Transformer: "warn",
  Infrastructure: "neutral",
};

const TIER_TONE: Record<Tier, ChipTone> = {
  tier_1: "secondary",
  tier_2: "primary",
  tier_3: "warn",
  tier_4: "danger",
};

export default async function CandidateSearchPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const query = (params.q ?? "").trim();
  const filterProject = params.project ?? "";
  const filterArchetype = params.archetype ?? "";
  const filterStage = params.stage ?? "";
  const filterTier = params.tier ?? "";

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/signin");

  const [candidatesQ, projectsQ, scoresQ] = await Promise.all([
    supabase
      .from("candidates")
      .select(
        "id, project_id, full_name, current_title, current_company, archetype, pipeline_stage, cv_processing, cv_structured"
      )
      .order("updated_at", { ascending: false }),
    supabase
      .from("projects")
      .select("id, title")
      .order("created_at", { ascending: false }),
    supabase
      .from("candidate_scores")
      .select("candidate_id, overall_score, tier"),
  ]);

  const candidates = (candidatesQ.data ?? []) as CandidateRow[];
  const projects = (projectsQ.data ?? []) as ProjectLite[];
  const scores = (scoresQ.data ?? []) as ScoreLite[];

  const projectById = new Map(projects.map((p) => [p.id, p.title]));
  const scoreById = new Map<string, ScoreLite>();
  for (const s of scores) scoreById.set(s.candidate_id, s);

  // The page's own view of the structural narrowing — used for display
  // stitching, the sample gate, and the empty short-circuit. The AGENT
  // re-reads and re-filters the pool under its own session (the seam's
  // split): both sessions are org-scoped, so the two views agree.
  const filtered = candidates.filter((c) => {
    if (filterProject && c.project_id !== filterProject) return false;
    if (filterArchetype && c.archetype !== filterArchetype) return false;
    if (filterStage && c.pipeline_stage !== filterStage) return false;
    if (filterTier) {
      const score = scoreById.get(c.id);
      if (score?.tier !== filterTier) return false;
    }
    return true;
  });

  const emptyPoolResult: CandidateSearchResult = {
    parsed_criteria: {
      intent: "No candidates match the structural filters.",
      must_haves: [],
      nice_to_haves: [],
    },
    matches: [],
  };

  let searchResult: CandidateSearchResult | null = null;
  let searchError: string | null = null;
  let poolSearched = 0;

  if (query.length > 0) {
    if (filtered.length === 0) {
      // Nothing to judge — answered honestly with no sign-in and no spend.
      searchResult = emptyPoolResult;
    } else {
      const run = await runCandidateSearchAsAgent(query, {
        projectId: filterProject || null,
        archetype: filterArchetype || null,
        stage: filterStage || null,
        tier: filterTier || null,
      });
      switch (run.status) {
        case "ready":
          searchResult = run.result;
          poolSearched = run.poolSize;
          break;
        case "empty_pool":
          searchResult = emptyPoolResult;
          break;
        case "agent_unavailable":
          // D5: honest refusal, nothing destroyed — the query and
          // filters are still in the URL.
          searchError =
            "The Candidate Search Agent could not run — an operator has " +
            "suspended it or its credentials are absent. Your query and " +
            "filters are safe in this page's address; search again when " +
            "it is restored.";
          break;
        case "failed":
          // Not `err.message`: that rendered the provider's raw JSON body —
          // vendor name, billing advice and a request id — straight into the
          // page. Harmless while this route was unreachable except by typing
          // the URL; a real screen the moment it was linked into the rail.
          // See `agent-errors.ts`. The console still gets the whole thing.
          searchError = agentErrorMessage(run.error, "The Candidate Search Agent");
          console.error("[candidates/search] agent failed", run.error);
          break;
      }
    }
  }

  // Stitch the agent matches back to full candidate rows for display.
  const candidateById = new Map(filtered.map((c) => [c.id, c]));

  // The pool is what makes this screen work at all, so the sample keys off
  // it rather than off the project count.
  const dismissed = (await cookies()).get(SAMPLE_DISMISSED_COOKIE)?.value === "1";
  const showSample = shouldShowSample({
    hasRealData: filtered.length > 0,
    dismissed,
  });

  return (
    <div className="px-6 py-6 space-y-5 max-w-[1400px] mx-auto">
      <SetBreadcrumbs
        crumbs={[
          { label: "Candidates", href: "/app/candidates" },
          { label: "Pool search" },
        ]}
      />

      <header className="space-y-2">
        <TerminalTitle label="Pool search">POOL_SEARCH</TerminalTitle>
        <p className="font-mono-label text-mono-label text-on-surface-variant uppercase tracking-widest">
          Type what you&rsquo;re looking for in plain English. The Candidate
          Search Agent parses intent, scores the pool, and ranks the
          matches with reasoning.
        </p>
      </header>

      <SearchForm
        query={query}
        projects={projects}
        filterProject={filterProject}
        filterArchetype={filterArchetype}
        filterStage={filterStage}
        filterTier={filterTier}
      />

      {/*
        A worked example, for an account with no candidates of its own. It
        sits above the live form's results rather than replacing them: a real
        query against an empty pool still falls through to `NoMatchesState`,
        which is the truthful answer. Answering an arbitrary question with a
        canned result is the one dishonesty this screen cannot afford.
      */}
      {showSample && query.length === 0 && <SampleSearchExample />}

      {query.length === 0 ? (
        showSample ? null : <EmptyState />
      ) : searchError ? (
        <ErrorState error={searchError} />
      ) : searchResult ? (
        <SearchResults
          query={query}
          result={searchResult}
          candidatesById={candidateById}
          scoresById={scoreById}
          projectsById={projectById}
          poolSize={poolSearched}
        />
      ) : null}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Form
// ────────────────────────────────────────────────────────────────────────

function SearchForm({
  query,
  projects,
  filterProject,
  filterArchetype,
  filterStage,
  filterTier,
}: {
  query: string;
  projects: ProjectLite[];
  filterProject: string;
  filterArchetype: string;
  filterStage: string;
  filterTier: string;
}) {
  return (
    <form
      method="GET"
      action="/app/candidates/search"
      className="space-y-3 bg-surface-container-low border border-outline-variant p-4"
    >
      <div className="flex items-center gap-2">
        <IconSearch size={20} className="text-primary shrink-0" />
        <input
          name="q"
          type="search"
          autoFocus
          defaultValue={query}
          placeholder="Senior post-trade engineering leaders with FCA exposure who've shipped a T+1 migration"
          className="min-w-0 flex-1 bg-transparent border-b border-outline-variant focus:border-primary focus:outline-none px-2 py-2 text-on-surface text-body-main placeholder:text-outline transition-colors"
        />
        <button
          type="submit"
          className="px-4 py-2 btn-notch bg-primary-container text-on-primary-container font-mono-label text-mono-label uppercase tracking-widest hover:brightness-110 active:scale-[0.98] transition-[filter,transform] flex items-center gap-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <IconSearch size={14} />
          Search
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <FilterSelect
          name="project"
          label="Project"
          value={filterProject}
          options={[
            { value: "", label: "All projects" },
            ...projects.map((p) => ({ value: p.id, label: p.title })),
          ]}
        />
        <FilterSelect
          name="archetype"
          label="Archetype"
          value={filterArchetype}
          options={[
            { value: "", label: "All archetypes" },
            ...ARCHETYPES.map((a) => ({ value: a, label: a })),
          ]}
        />
        <FilterSelect
          name="stage"
          label="Pipeline"
          value={filterStage}
          options={[
            { value: "", label: "All stages" },
            ...PIPELINE_STAGES.map((s) => ({
              value: s,
              label: PIPELINE_LABELS[s],
            })),
          ]}
        />
        <FilterSelect
          name="tier"
          label="Tier"
          value={filterTier}
          options={[
            { value: "", label: "All tiers" },
            ...TIER_ORDER.map((t) => ({
              value: t,
              label: TIER_BANDS[t].label.split(" · ")[0],
            })),
          ]}
        />
      </div>
    </form>
  );
}

function FilterSelect({
  name,
  label,
  value,
  options,
}: {
  name: string;
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="block space-y-1">
      <span className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
        {label}
      </span>
      <select
        name={name}
        defaultValue={value}
        className="w-full bg-surface-container-lowest border border-outline-variant px-2 py-1.5 text-on-surface text-body-main focus:border-primary focus:outline-none transition-colors"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Results
// ────────────────────────────────────────────────────────────────────────

function SearchResults({
  query,
  result,
  candidatesById,
  scoresById,
  projectsById,
  poolSize,
}: {
  query: string;
  result: CandidateSearchResult;
  candidatesById: Map<string, CandidateRow>;
  scoresById: Map<string, ScoreLite>;
  projectsById: Map<string, string>;
  poolSize: number;
}) {
  const matches = result.matches.filter((m) => candidatesById.has(m.candidate_id));

  return (
    <div className="space-y-4">
      <article className="bg-surface-container-low border border-outline-variant relative overflow-hidden">
        <div
          className="absolute inset-0 terminal-grid opacity-10 pointer-events-none"
          aria-hidden
        />
        <div className="relative p-4 space-y-3">
          <div className="font-mono-label text-mono-label text-primary uppercase tracking-widest flex items-center gap-2">
            <IconFilter size={14} />
            Parsed Criteria
          </div>
          <p className="text-body-main text-on-surface">
            <span className="font-mono-label uppercase tracking-widest text-outline mr-2">
              Intent:
            </span>
            {result.parsed_criteria.intent}
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <CriteriaList
              label="Must-haves"
              items={result.parsed_criteria.must_haves}
              tone="primary"
            />
            <CriteriaList
              label="Nice-to-haves"
              items={result.parsed_criteria.nice_to_haves}
              tone="secondary"
            />
          </div>
          <div className="font-mono-label text-mono-label text-outline uppercase tracking-widest pt-2 border-t border-outline-variant/40">
            Pool searched: <span className="text-on-surface tabular-nums">{poolSize}</span>{" "}
            · Matches returned:{" "}
            <span className="text-on-surface tabular-nums">{matches.length}</span>
          </div>
        </div>
      </article>

      {matches.length === 0 ? (
        <NoMatchesState query={query} />
      ) : (
        <section className="space-y-2">
          <MastHead
            tone="primary"
            label={
              <span className="flex items-baseline gap-2">
                <span>Ranked Matches</span>
                <span className="text-outline tabular-nums">
                  · {String(matches.length).padStart(2, "0")}
                </span>
              </span>
            }
            meta={
              <span className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
                Sorted by match score
              </span>
            }
          />
          <ol className="space-y-2">
            {matches.map((m, idx) => {
              const c = candidatesById.get(m.candidate_id);
              if (!c) return null;
              const score = scoresById.get(c.id);
              const projectTitle = c.project_id
                ? projectsById.get(c.project_id)
                : null;
              return (
                <li key={m.candidate_id}>
                  <Link
                    href={
                      c.project_id
                        ? `/app/projects/${c.project_id}/candidates/${c.id}`
                        : "/app/candidates"
                    }
                    prefetch={false}
                    className="block bg-surface-container-low border border-outline-variant hover:border-primary hover:bg-surface-container-high transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                  >
                    <div className="flex items-stretch gap-4 px-4 py-3 flex-wrap">
                      <div
                        className={cn(
                          "shrink-0 w-20 flex flex-col items-center justify-center border-r border-outline-variant/40 pr-3",
                          m.match_score >= 80
                            ? "text-secondary-fixed-dim"
                            : m.match_score >= 60
                              ? "text-primary"
                              : m.match_score >= 40
                                ? "text-warn"
                                : "text-error"
                        )}
                      >
                        <span className="font-mono-label text-mono-label uppercase tracking-widest text-outline">
                          Match
                        </span>
                        <span className="font-h1 text-h1 leading-none tabular-nums mt-1">
                          {m.match_score}
                        </span>
                        <span className="font-mono-label text-mono-label uppercase tracking-widest text-outline mt-1 tabular-nums">
                          #{String(idx + 1).padStart(2, "0")}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0 space-y-1.5">
                        <div className="flex items-baseline gap-2 flex-wrap">
                          <h3 className="font-h2 text-h2 text-on-surface truncate">
                            {c.full_name}
                          </h3>
                          {score?.tier && TIER_ORDER.includes(score.tier as Tier) && (
                            <StatusChip tone={TIER_TONE[score.tier as Tier]}>
                              {TIER_BANDS[score.tier as Tier].label.split(" · ")[0]}
                            </StatusChip>
                          )}
                          {c.archetype && (
                            <StatusChip
                              tone={ARCHETYPE_TONE[c.archetype as Archetype] ?? "neutral"}
                              intensity="soft"
                            >
                              {c.archetype}
                            </StatusChip>
                          )}
                          {projectTitle && (
                            <StatusChip
                              tone="neutral"
                              intensity="soft"
                              icon={IconMandates}
                            >
                              {projectTitle}
                            </StatusChip>
                          )}
                          {c.pipeline_stage && (
                            <span className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
                              {PIPELINE_LABELS[c.pipeline_stage as PipelineStage] ?? c.pipeline_stage}
                            </span>
                          )}
                        </div>
                        <div className="font-mono-data text-body-main text-on-surface-variant truncate">
                          {c.current_title ?? "—"}
                          {c.current_company ? ` @ ${c.current_company}` : ""}
                        </div>
                        <p className="text-body-main text-on-surface leading-relaxed">
                          <span className="font-mono-label uppercase tracking-widest text-primary mr-1">
                            Why:
                          </span>
                          {m.reasoning}
                        </p>
                      </div>
                      <IconChevronRight
                        size={20}
                        className="text-outline self-center shrink-0"
                      />
                    </div>
                  </Link>
                </li>
              );
            })}
          </ol>
        </section>
      )}
    </div>
  );
}

function CriteriaList({
  label,
  items,
  tone,
}: {
  label: string;
  items: string[];
  tone: "primary" | "secondary";
}) {
  if (items.length === 0) {
    return (
      <div className="space-y-1">
        <div className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
          {label}
        </div>
        <p className="font-mono-label text-mono-label text-outline italic uppercase tracking-widest">
          None inferred.
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-1">
      <div className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
        {label}
      </div>
      <ul className="flex flex-wrap gap-1.5">
        {items.map((it, i) => (
          <li
            key={i}
            className={cn(
              "px-2 py-0.5 border font-mono-label text-mono-label uppercase tracking-widest",
              tone === "primary"
                ? "border-primary-container/60 bg-primary-container/10 text-primary"
                : "border-secondary-fixed-dim/60 bg-secondary-fixed-dim/10 text-secondary-fixed-dim"
            )}
          >
            {it}
          </li>
        ))}
      </ul>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="bg-surface-container-low border border-outline-variant px-8 py-12 text-center space-y-4">
      <div className="w-14 h-14 mx-auto border border-primary-container/40 bg-primary-container/10 flex items-center justify-center">
        <IconIntelligence size={24} className="text-primary" />
      </div>
      <p className="text-body-main text-on-surface-variant max-w-md mx-auto">
        Try a query like &ldquo;Tier 1 transformation leaders with M&amp;A
        integration experience&rdquo; or &ldquo;senior platform engineers who
        have shipped through a regulator-led remediation&rdquo;. The agent
        scores every candidate in the pool and explains its reasoning.
      </p>
    </div>
  );
}

function ErrorState({ error }: { error: string }) {
  return (
    <div className="bg-error/10 border border-error/40 px-4 py-3">
      <div className="font-mono-label text-mono-label text-error uppercase tracking-widest">
        Search failed
      </div>
      <p className="text-body-main text-on-surface-variant mt-1">{error}</p>
    </div>
  );
}

function NoMatchesState({ query }: { query: string }) {
  return (
    <div className="bg-tertiary/10 border border-tertiary/40 px-4 py-3">
      <div className="font-mono-label text-mono-label text-tertiary uppercase tracking-widest">
        No matches above the noise floor
      </div>
      <p className="text-body-main text-on-surface-variant mt-1">
        The agent didn&rsquo;t find any candidates with a match score ≥ 30
        for &ldquo;{query}&rdquo;. Loosen the filters or rephrase the query.
      </p>
    </div>
  );
}
