import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import {
  EXEC_CANDIDATE_STAGE_LABELS,
  type ExecutiveCandidateStage,
} from "@/lib/executive/types";
import {
  CandidateStageSelect,
  LinkCandidateButton,
  UnlinkCandidateButton,
} from "./candidate-link-controls";

type SearchSummary = {
  id: string;
  role_title: string;
  company_name: string;
};

type CandidateSummary = {
  id: string;
  full_name: string;
  current_title: string | null;
  current_company: string | null;
  location: string | null;
  project_id: string | null;
};

type LinkedRow = {
  id: string;
  stage: ExecutiveCandidateStage;
  created_at: string;
  candidate_id: string;
  candidates: CandidateSummary | null;
};

const PICKER_LIMIT = 15;

export default async function ExecutiveSearchCandidatesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { id } = await params;
  const { q } = await searchParams;
  const query = (q ?? "").trim();
  const supabase = await createServerSupabaseClient();

  const { data: search, error: searchError } = await supabase
    .from("executive_searches")
    .select("id, role_title, company_name")
    .eq("id", id)
    .single<SearchSummary>();

  if (searchError || !search) {
    if (searchError?.code === "PGRST116") notFound();
    redirect("/executive-intelligence/searches");
  }

  const { data: linkedData, error: linkedError } = await supabase
    .from("executive_search_candidates")
    .select(
      "id, stage, created_at, candidate_id, candidates(id, full_name, current_title, current_company, location, project_id)"
    )
    .eq("search_id", id)
    .order("created_at", { ascending: true });

  const linked = (linkedData ?? []) as unknown as LinkedRow[];
  const linkedIds = new Set(linked.map((l) => l.candidate_id));

  // Org candidate pool picker. RLS scopes to the caller's org; already-linked
  // candidates are filtered out after the query (the set is small).
  let pickerQuery = supabase
    .from("candidates")
    .select("id, full_name, current_title, current_company, location, project_id")
    .order("created_at", { ascending: false })
    .limit(PICKER_LIMIT + linkedIds.size);
  if (query) {
    const escaped = query.replace(/[%_,]/g, " ").trim();
    pickerQuery = pickerQuery.or(
      `full_name.ilike.%${escaped}%,current_company.ilike.%${escaped}%,current_title.ilike.%${escaped}%`
    );
  }
  const { data: poolData, error: poolError } = await pickerQuery;
  const pool = ((poolData ?? []) as CandidateSummary[])
    .filter((c) => !linkedIds.has(c.id))
    .slice(0, PICKER_LIMIT);

  const stageCounts = new Map<ExecutiveCandidateStage, number>();
  for (const row of linked) {
    stageCounts.set(row.stage, (stageCounts.get(row.stage) ?? 0) + 1);
  }

  return (
    <div className="min-h-full p-6">
      <div className="max-w-5xl mx-auto pt-4 space-y-6">
        <div className="flex items-center gap-3 font-mono-label text-mono-label uppercase tracking-widest text-outline">
          <Link
            href={`/executive-intelligence/searches/${search.id}`}
            className="hover:text-on-surface transition-colors flex items-center gap-1.5"
          >
            <span className="material-symbols-outlined text-[14px]">arrow_back</span>
            Search Workspace
          </Link>
          <span className="text-outline-variant">/</span>
          <span className="text-on-surface-variant">Candidates</span>
        </div>

        <header className="space-y-2">
          <h1 className="font-h2 text-h2 text-on-surface">
            Candidates{" "}
            <span className="text-on-surface-variant">
              — {search.role_title} @ {search.company_name}
            </span>
          </h1>
          <p className="text-body-main text-on-surface-variant max-w-2xl">
            Link candidates from your organization&rsquo;s pool to this search.
            Stages track the due-diligence funnel; every link, removal, and stage
            change is recorded in the audit trail.
          </p>
          {linked.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {Array.from(stageCounts.entries()).map(([stage, count]) => (
                <span
                  key={stage}
                  className="font-mono-label text-mono-label uppercase tracking-wider px-2 py-1 border border-outline-variant text-on-surface-variant"
                >
                  {EXEC_CANDIDATE_STAGE_LABELS[stage]}: {count}
                </span>
              ))}
            </div>
          )}
        </header>

        {/* Linked candidates */}
        <section className="bg-surface-container-low border border-outline-variant">
          <header className="px-5 py-3 border-b border-outline-variant/40">
            <span className="font-mono-label text-mono-label text-secondary-fixed-dim uppercase tracking-widest">
              # Linked Candidates ({linked.length})
            </span>
          </header>
          {linkedError && (
            <p className="px-5 py-4 text-body-main text-error">
              Failed to load linked candidates: {linkedError.message}
            </p>
          )}
          {!linkedError && linked.length === 0 && (
            <p className="px-5 py-8 text-body-main text-outline text-center">
              No candidates linked yet — use the pool below to attach the first
              one.
            </p>
          )}
          {linked.map((row) => {
            const c = row.candidates;
            if (!c) return null;
            return (
              <div
                key={row.id}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-b border-outline-variant/30 last:border-0"
              >
                <div className="space-y-0.5 min-w-0">
                  <p className="text-body-main text-on-surface">
                    {c.full_name}
                    {c.project_id && (
                      <Link
                        href={`/projects/${c.project_id}/candidates/${c.id}`}
                        className="ml-2 font-mono-label text-mono-label uppercase tracking-wider text-primary hover:brightness-110"
                      >
                        Source Profile ↗
                      </Link>
                    )}
                  </p>
                  <p className="font-mono-label text-mono-label text-outline uppercase tracking-wider">
                    {[c.current_title, c.current_company].filter(Boolean).join(" @ ") ||
                      "No current role on record"}
                    {c.location ? ` · ${c.location}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Link
                    href={`/executive-intelligence/searches/${search.id}/candidates/${c.id}/interview-plan`}
                    className="font-mono-label text-mono-label uppercase tracking-widest text-primary hover:brightness-110 transition-all flex items-center gap-1.5"
                  >
                    <span className="material-symbols-outlined text-[15px]">checklist</span>
                    Interview Plan
                  </Link>
                  <CandidateStageSelect
                    searchId={search.id}
                    candidateId={c.id}
                    stage={row.stage}
                  />
                  <UnlinkCandidateButton
                    searchId={search.id}
                    candidateId={c.id}
                    candidateName={c.full_name}
                  />
                </div>
              </div>
            );
          })}
        </section>

        {/* Pool picker */}
        <section className="bg-surface-container-low border border-outline-variant">
          <header className="px-5 py-3 border-b border-outline-variant/40 flex flex-wrap items-center justify-between gap-3">
            <span className="font-mono-label text-mono-label text-secondary-fixed-dim uppercase tracking-widest">
              # Organization Pool
            </span>
            <form method="get" className="flex items-center gap-2">
              <input
                type="text"
                name="q"
                defaultValue={query}
                placeholder="Search name, company, title…"
                className="bg-surface-container-lowest border border-outline-variant px-3 py-1.5 text-body-main text-on-surface placeholder:text-outline-variant outline-none focus:border-primary transition-colors w-64"
              />
              <button
                type="submit"
                className="px-3 py-1.5 border border-outline-variant text-on-surface-variant font-mono-label text-mono-label uppercase tracking-widest hover:bg-surface-container transition-colors"
              >
                Search
              </button>
            </form>
          </header>
          {poolError && (
            <p className="px-5 py-4 text-body-main text-error">
              Failed to load the candidate pool: {poolError.message}
            </p>
          )}
          {!poolError && pool.length === 0 && (
            <p className="px-5 py-8 text-body-main text-outline text-center">
              {query
                ? `No unlinked candidates match "${query}".`
                : "No unlinked candidates in the pool. Upload CVs in a project to grow it."}
            </p>
          )}
          {pool.map((c) => (
            <div
              key={c.id}
              className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-b border-outline-variant/30 last:border-0"
            >
              <div className="space-y-0.5 min-w-0">
                <p className="text-body-main text-on-surface">{c.full_name}</p>
                <p className="font-mono-label text-mono-label text-outline uppercase tracking-wider">
                  {[c.current_title, c.current_company].filter(Boolean).join(" @ ") ||
                    "No current role on record"}
                  {c.location ? ` · ${c.location}` : ""}
                </p>
              </div>
              <LinkCandidateButton
                searchId={search.id}
                candidateId={c.id}
                candidateName={c.full_name}
              />
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
