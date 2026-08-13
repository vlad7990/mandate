import Link from "next/link";
import { cookies } from "next/headers";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { SetBreadcrumbs } from "@/components/dashboard/breadcrumbs";
import { SampleBanner } from "@/components/sample/sample-banner";
import { IconArrowRight } from "@/components/icons";
import { PIPELINE_LABELS, PIPELINE_STAGES } from "@/lib/ai/cv-parsing";
import {
  ListPanel,
  PageHeader,
  PageShell,
} from "@/components/ui/page-shell";
import { ListToolbar } from "@/components/ui/list-toolbar";
import { Pagination } from "@/components/ui/pagination";
import {
  isFiltered,
  parseListParams,
  rangeFor,
  splitOverfetch,
  type RawSearchParams,
} from "@/lib/list-params";
import {
  SAMPLE_CANDIDATES,
  SAMPLE_DISMISSED_COOKIE,
  SAMPLE_MANDATES,
  shouldShowSample,
} from "@/lib/sample";

/**
 * Every candidate across every mandate.
 *
 * Three rules carried over from the comp, all of which are really about
 * honesty rather than styling:
 *
 * - **Partial data is normal.** A CV still parsing and a candidate found
 *   but not yet scored both appear inline with honest placeholders. The
 *   alternative — hiding a row until it is complete — makes the count
 *   wrong and the upload look lost.
 * - **Tier is a band, not a grade.** Tier 1 carries the accent; 2–4 stay
 *   neutral. Nothing is red, because a tier-3 candidate is not a
 *   failure, and colouring them as one is the traffic-light problem the
 *   marketing surface was corrected for.
 * - **Dedupe is visible.** The network view states how each merge
 *   happened, so a wrong merge can be found rather than silently
 *   trusted.
 *
 * The page reads one screenful at a time. It previously selected every
 * candidate the org could see plus every score, and did the joining in
 * JavaScript — fine against a demo pool, fatal against a real one. Search
 * and the mandate and stage filters run in Postgres; see the note on `tier`
 * below for the one that cannot.
 */

const BASE_PATH = "/app/candidates";
const PER_PAGE = 25;

/**
 * Sortable columns, and the allowlist that reaches `.order()`.
 * `updated_at` leads because the question this page answers is "what moved".
 */
const SORTS = ["updated_at", "full_name", "current_company"] as const;

type ProjectLite = {
  id: string;
  title: string;
  company_name: string;
};

type CandidateLite = {
  id: string;
  project_id: string | null;
  full_name: string;
  current_title: string | null;
  current_company: string | null;
  archetype: string | null;
  pipeline_stage: string | null;
  cv_processing: boolean;
  updated_at: string;
};

type ScoreLite = {
  candidate_id: string;
  overall_score: number | null;
  tier: string | null;
};

export const metadata = { title: "Candidates" };

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "??";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Coarse relative time. Exactness is not the point on this column. */
function ago(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const h = Math.floor(ms / 3_600_000);
  if (h < 1) return "NOW";
  if (h < 24) return `${h}H AGO`;
  const d = Math.floor(h / 24);
  return `${d}D AGO`;
}

function tierNumber(tier: string | null): number | null {
  if (!tier) return null;
  const m = tier.match(/\d/);
  return m ? Number(m[0]) : null;
}

function TierBadge({ tier }: { tier: number | null }) {
  if (tier === null) {
    return <span className="text-xs text-outline">Not scored</span>;
  }
  // Only tier 1 is accented. No tier is ever red.
  const lead = tier === 1;
  return (
    <span
      className={`px-2 py-1 font-mono-label text-mono-label uppercase tracking-wider ${
        lead
          ? "bg-primary/20 text-primary"
          : "bg-surface-container-high text-on-surface-variant"
      }`}
    >
      Tier {tier}
    </span>
  );
}

function Avatar({ name, parsing }: { name: string; parsing?: boolean }) {
  if (parsing) {
    return (
      <span
        aria-hidden
        className="h-[30px] w-[30px] shrink-0 border border-dashed border-outline-variant bg-surface-container"
      />
    );
  }
  return (
    <span
      aria-hidden
      className="flex h-[30px] w-[30px] shrink-0 items-center justify-center border border-outline-variant bg-surface-container-high font-mono-label text-mono-label text-on-surface-variant"
    >
      {initials(name)}
    </span>
  );
}

/** Placeholder bar for a value that does not exist yet. */
function Pending({ w }: { w: number }) {
  return (
    <span
      aria-hidden
      className="block h-2.5 bg-surface-container-high"
      style={{ width: w }}
    />
  );
}

const HEAD = [
  "Candidate",
  "Mandate",
  "Archetype",
  "Tier",
  "Fit",
  "Stage",
  "Updated",
];

/**
 * PostgREST `or=` takes a comma-separated filter list, so a comma or a
 * parenthesis in the search term would be read as syntax rather than text.
 * Stripping them costs nothing on a name search and keeps a stray comma
 * from returning the whole table.
 */
function searchTerm(q: string): string {
  return q.replace(/[,()*\\]/g, " ").trim();
}

export default async function CandidatesPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const params = parseListParams(await searchParams, {
    perPage: PER_PAGE,
    filters: ["project_id", "pipeline_stage", "tier"],
    sorts: SORTS,
    defaultSort: "updated_at",
    defaultDir: "desc",
  });

  const supabase = await createServerSupabaseClient();

  // Mandates are needed whole: they populate the filter and label each row,
  // and a workspace has tens of them, not thousands.
  const projectsQ = await supabase
    .from("projects")
    .select("id, title, company_name")
    .order("created_at", { ascending: false });
  const projects = (projectsQ.data ?? []) as ProjectLite[];

  // `tier` lives on candidate_scores, one join away, and PostgREST cannot
  // filter a table by an embedded resource without an inner join it does not
  // expose here. Resolving the tier filter to a candidate id set first keeps
  // the page's paging honest — filtering after the fact would silently
  // return short pages.
  let tierCandidateIds: string[] | null = null;
  if (params.filters.tier) {
    const tierQ = await supabase
      .from("candidate_scores")
      .select("candidate_id")
      .eq("tier", `tier_${params.filters.tier}`);
    tierCandidateIds = (tierQ.data ?? []).map(
      (r) => (r as { candidate_id: string }).candidate_id
    );
  }

  const { from, to } = rangeFor(params);
  let query = supabase
    .from("candidates")
    .select(
      "id, project_id, full_name, current_title, current_company, archetype, pipeline_stage, cv_processing, updated_at"
    )
    .order(params.sort ?? "updated_at", { ascending: params.dir === "asc" })
    .range(from, to);

  const term = searchTerm(params.q);
  if (term) {
    query = query.or(
      `full_name.ilike.%${term}%,current_title.ilike.%${term}%,current_company.ilike.%${term}%`
    );
  }
  if (params.filters.project_id) {
    query = query.eq("project_id", params.filters.project_id);
  }
  if (params.filters.pipeline_stage) {
    query = query.eq("pipeline_stage", params.filters.pipeline_stage);
  }
  if (tierCandidateIds !== null) {
    // An empty set must match nothing rather than being skipped.
    query = query.in("id", tierCandidateIds);
  }

  const candidatesQ = await query;
  const { rows: candidates, hasMore } = splitOverfetch(
    (candidatesQ.data ?? []) as CandidateLite[],
    params
  );

  // Scores for the rows actually on screen, not for the whole pool.
  const scoreQ =
    candidates.length > 0
      ? await supabase
          .from("candidate_scores")
          .select("candidate_id, overall_score, tier")
          .in(
            "candidate_id",
            candidates.map((c) => c.id)
          )
      : { data: [] as ScoreLite[] };
  const scores = (scoreQ.data ?? []) as ScoreLite[];

  const dismissed =
    (await cookies()).get(SAMPLE_DISMISSED_COOKIE)?.value === "1";
  // A filtered view that finds nothing is not an empty workspace, so the
  // sample must not appear on top of a search that simply had no hits.
  const showSample = shouldShowSample({
    hasRealData: candidates.length > 0 || isFiltered(params),
    dismissed,
  });

  const projectById = new Map(projects.map((p) => [p.id, p]));
  const scoreByCandidate = new Map(scores.map((s) => [s.candidate_id, s]));
  const mandateById = new Map(SAMPLE_MANDATES.map((m) => [m.id, m]));

  return (
    <PageShell>
      <SetBreadcrumbs crumbs={[{ label: "Candidates" }]} />

      <PageHeader
        title="Candidates"
        subtitle={
          showSample
            ? `${SAMPLE_CANDIDATES.length} example rows across ${SAMPLE_MANDATES.length} mandates`
            : describe(candidates.length, params, projects.length)
        }
        action={{
          label: "Upload CVs",
          href: "/app/projects",
          icon: <IconArrowRight size={15} />,
          capability: "candidates:write",
        }}
      />

      {showSample && (
        <div className="mt-5">
          <SampleBanner scope="candidates" />
        </div>
      )}

      <ListPanel className="mt-5">
        {!showSample && (
          <ListToolbar
            basePath={BASE_PATH}
            params={params}
            searchPlaceholder="Search name, title or company…"
            filters={[
              {
                key: "project_id",
                label: "Mandate",
                options: projects.map((p) => ({
                  value: p.id,
                  label: p.title,
                })),
              },
              {
                key: "pipeline_stage",
                label: "Stage",
                options: PIPELINE_STAGES.map((s) => ({
                  value: s,
                  label: PIPELINE_LABELS[s],
                })),
              },
              {
                key: "tier",
                label: "Tier",
                options: [1, 2, 3, 4].map((n) => ({
                  value: String(n),
                  label: `Tier ${n}`,
                })),
              },
            ]}
          />
        )}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse tabular-nums">
            <caption className="sr-only">
              {showSample
                ? "Example candidates with mandate, archetype, tier, fit and stage."
                : "Candidates with mandate, archetype, tier, fit and stage."}
            </caption>
            <thead>
              <tr>
                {HEAD.map((h) => (
                  <th
                    key={h}
                    scope="col"
                    className="border-b border-outline-variant px-3 py-3 text-left font-mono-label text-[10px] font-bold uppercase tracking-[0.1em] text-outline first:pl-[18px] last:pr-[18px]"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {showSample
                ? SAMPLE_CANDIDATES.map((c) => {
                    const m = mandateById.get(c.mandateId);
                    return (
                      <tr
                        key={c.id}
                        className="border-b border-outline-variant/40 last:border-0"
                      >
                        <td className="w-[38%] max-w-0 px-3 py-3 pl-[18px]">
                          <div className="flex items-center gap-3">
                            <Avatar name={c.name} parsing={c.parsing} />
                            <div className="min-w-0">
                              <span
                                className={`block truncate text-[13px] font-medium ${c.parsing ? "text-outline" : "text-on-surface"}`}
                              >
                                {c.name}
                              </span>
                              <span className="block truncate text-xs text-outline">
                                {c.parsing
                                  ? c.fileName
                                  : `${c.currentTitle} · ${c.currentCompany}`}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-xs text-on-surface-variant">
                          {m ? `${m.title} · ${m.company}` : "—"}
                        </td>
                        <td className="px-3 py-3">
                          {c.parsing ? (
                            <Pending w={72} />
                          ) : c.archetype ? (
                            <span className="bg-surface-container-high px-2.5 py-1 font-mono-label text-mono-label uppercase tracking-wider text-on-surface-variant">
                              {c.archetype}
                            </span>
                          ) : (
                            <span className="text-xs text-outline">—</span>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          {c.parsing ? <Pending w={48} /> : <TierBadge tier={c.tier} />}
                        </td>
                        <td className="px-3 py-3 font-mono-data text-[13px] text-on-surface">
                          {c.parsing ? (
                            <Pending w={24} />
                          ) : c.fit === null ? (
                            <span className="text-outline">—</span>
                          ) : (
                            c.fit
                          )}
                        </td>
                        <td className="px-3 py-3 text-xs text-on-surface-variant">
                          {c.stage}
                        </td>
                        <td className="px-3 py-3 pr-[18px] font-mono-label text-[11px] text-outline">
                          {c.updated}
                        </td>
                      </tr>
                    );
                  })
                : candidates.map((c) => {
                    const p = c.project_id
                      ? projectById.get(c.project_id)
                      : undefined;
                    const s = scoreByCandidate.get(c.id);
                    const tier = tierNumber(s?.tier ?? null);
                    return (
                      <tr
                        key={c.id}
                        className="border-b border-outline-variant/40 last:border-0"
                      >
                        <td className="w-[38%] max-w-0 px-3 py-3 pl-[18px]">
                          <Link
                            href={
                              c.project_id
                                ? `/app/projects/${c.project_id}/candidates/${c.id}`
                                : "/app/candidates"
                            }
                            className="flex items-center gap-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                          >
                            <Avatar
                              name={c.full_name}
                              parsing={c.cv_processing}
                            />
                            <span className="min-w-0">
                              <span className="block truncate text-[13px] font-medium text-on-surface">
                                {c.full_name}
                              </span>
                              <span className="block truncate text-xs text-outline">
                                {c.cv_processing
                                  ? "Parsing CV…"
                                  : [c.current_title, c.current_company]
                                      .filter(Boolean)
                                      .join(" · ") || "—"}
                              </span>
                            </span>
                          </Link>
                        </td>
                        <td className="px-3 py-3 text-xs text-on-surface-variant">
                          {p ? `${p.title} · ${p.company_name}` : "—"}
                        </td>
                        <td className="px-3 py-3">
                          {c.cv_processing ? (
                            <Pending w={72} />
                          ) : c.archetype ? (
                            <span className="bg-surface-container-high px-2.5 py-1 font-mono-label text-mono-label uppercase tracking-wider text-on-surface-variant">
                              {c.archetype}
                            </span>
                          ) : (
                            <span className="text-xs text-outline">—</span>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          {c.cv_processing ? (
                            <Pending w={48} />
                          ) : (
                            <TierBadge tier={tier} />
                          )}
                        </td>
                        <td className="px-3 py-3 font-mono-data text-[13px] text-on-surface">
                          {c.cv_processing ? (
                            <Pending w={24} />
                          ) : s?.overall_score == null ? (
                            <span className="text-outline">—</span>
                          ) : (
                            Math.round(s.overall_score)
                          )}
                        </td>
                        <td className="px-3 py-3 font-mono-label text-mono-label uppercase tracking-wider text-on-surface-variant">
                          {c.cv_processing
                            ? "Parsing"
                            : (c.pipeline_stage ?? "—").replace(/_/g, " ")}
                        </td>
                        <td className="px-3 py-3 pr-[18px] font-mono-label text-[11px] text-outline">
                          {ago(c.updated_at)}
                        </td>
                      </tr>
                    );
                  })}
            </tbody>
          </table>
        </div>

        {!showSample && candidates.length === 0 && (
          <p className="px-[18px] py-10 text-center font-mono-label text-mono-label uppercase leading-[1.6] tracking-widest text-outline">
            {isFiltered(params)
              ? "No candidates match these filters."
              : "No candidates yet. Open a mandate and upload CVs to get started."}
          </p>
        )}

        {!showSample && (
          <Pagination
            basePath={BASE_PATH}
            params={params}
            rowsOnPage={candidates.length}
            hasMore={hasMore}
            noun="candidates"
          />
        )}
      </ListPanel>
    </PageShell>
  );
}

/**
 * The subtitle no longer states a total: counting every matching row on
 * every view is the cost this page was rewritten to avoid, and "25 rows" on
 * page one of forty would be a worse answer than not claiming one.
 */
function describe(
  rowsOnPage: number,
  params: ReturnType<typeof parseListParams>,
  projectCount: number
): string {
  if (isFiltered(params)) {
    return rowsOnPage === 0
      ? "No matches."
      : `Showing ${rowsOnPage} ${rowsOnPage === 1 ? "match" : "matches"} on this page.`;
  }
  const mandates = `${projectCount} ${projectCount === 1 ? "mandate" : "mandates"}`;
  return rowsOnPage === 0
    ? `No candidates yet across ${mandates}.`
    : `Most recently updated first, across ${mandates}.`;
}
