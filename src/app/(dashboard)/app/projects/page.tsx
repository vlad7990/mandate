import Link from "next/link";
import { CapabilityGate } from "@/components/auth/capability-gate";
import { cookies } from "next/headers";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { computePortfolioMetrics } from "@/lib/metrics/portfolio";
import { HEALTH_LABELS, type HealthStatus } from "@/lib/metrics/types";
import { SetBreadcrumbs } from "@/components/dashboard/breadcrumbs";
import { SampleBanner } from "@/components/sample/sample-banner";
import {
  SAMPLE_DISMISSED_COOKIE,
  SAMPLE_MANDATES,
  HEALTH_LABEL as SAMPLE_HEALTH_LABEL,
  shouldShowSample,
  type SampleHealth,
} from "@/lib/sample";
import { IconArrowRight } from "@/components/icons";
import { ListPanel, PageHeader, PageShell } from "@/components/ui/page-shell";
import { ListToolbar } from "@/components/ui/list-toolbar";
import { Pagination } from "@/components/ui/pagination";
import {
  isFiltered,
  parseListParams,
  rangeFor,
  splitOverfetch,
  type RawSearchParams,
} from "@/lib/list-params";

export const metadata = { title: "Mandates" };

/**
 * Every mandate in the workspace.
 *
 * This route did not exist. The rail's Mandates entry pointed at it and
 * would have 404'd, and the only way to see the full list was the
 * dashboard's table, which shows the top few. The dashboard comp's
 * "View all" link needs a destination.
 *
 * The real table carries three columns fewer than the sample one. Candidate
 * counts, tier-1 counts and day-of-search need a per-project aggregate this
 * page does not do, and three columns of em-dashes on every row is a worse
 * answer than not offering the column — the mandate's own page has them.
 * The sample keeps them because it is showing what a populated workspace
 * looks like.
 */

const BASE_PATH = "/app/projects";
const PER_PAGE = 25;

/** Mirrors the `status` values the rest of the app writes. */
const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "paused", label: "Paused" },
  { value: "closed", label: "Closed" },
];

/** Health is a dot plus a word. Never a gauge, never a red-to-green ramp. */
function HealthDot({ status }: { status: HealthStatus | SampleHealth }) {
  const critical = status === "at_risk" || status === "blocked";
  const warn = status === "stalled" || status === "stalling";
  const label =
    status in HEALTH_LABELS
      ? HEALTH_LABELS[status as HealthStatus]
      : SAMPLE_HEALTH_LABEL[status as SampleHealth];

  return (
    <span
      className={`inline-flex items-center gap-2 text-xs ${
        critical || warn ? "text-error" : "text-on-surface-variant"
      }`}
    >
      <span
        aria-hidden
        className={`h-[7px] w-[7px] shrink-0 rounded-full ${
          critical || warn ? "bg-error" : "bg-outline"
        }`}
      />
      {label}
    </span>
  );
}

/** See the note in the candidates list — `or=` treats these as syntax. */
function searchTerm(q: string): string {
  return q.replace(/[,()*\\]/g, " ").trim();
}

export default async function MandatesPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const params = parseListParams(await searchParams, {
    perPage: PER_PAGE,
    filters: ["status"],
    sorts: ["created_at", "title", "company_name"],
    defaultSort: "created_at",
    defaultDir: "desc",
  });

  const supabase = await createServerSupabaseClient();

  const { from, to } = rangeFor(params);
  let query = supabase
    .from("projects")
    .select("id, title, company_name, status, created_at")
    .order(params.sort ?? "created_at", { ascending: params.dir === "asc" })
    .range(from, to);

  const term = searchTerm(params.q);
  if (term) {
    query = query.or(`title.ilike.%${term}%,company_name.ilike.%${term}%`);
  }
  if (params.filters.status) {
    query = query.eq("status", params.filters.status);
  }

  const { data } = await query;
  const { rows: projects, hasMore } = splitOverfetch(data ?? [], params);

  const dismissed =
    (await cookies()).get(SAMPLE_DISMISSED_COOKIE)?.value === "1";
  const showSample = shouldShowSample({
    hasRealData: projects.length > 0 || isFiltered(params),
    dismissed,
  });

  // Health is portfolio-wide rather than per-page, and only worth computing
  // when there is something to compute it for.
  const metrics = projects.length > 0 ? await computePortfolioMetrics() : null;
  const healthByProject = new Map(
    metrics?.attentionList.map((a) => [a.projectId, a.status]) ?? []
  );

  const head = showSample
    ? ["Mandate", "Stage", "Candidates", "Tier 1", "Day", "Health"]
    : ["Mandate", "Status", "Health"];

  return (
    <PageShell>
      <SetBreadcrumbs crumbs={[{ label: "Mandates" }]} />

      <PageHeader
        title="Mandates"
        subtitle={
          showSample
            ? "An example portfolio — your own mandates will appear here."
            : isFiltered(params)
              ? `${projects.length} ${projects.length === 1 ? "match" : "matches"} on this page.`
              : "Most recently opened first."
        }
        action={{
          label: "New mandate",
          href: "/app/projects/new",
          icon: <IconArrowRight size={15} />,
          capability: "mandates:write",
        }}
      />

      {showSample && (
        <div className="mt-5">
          <SampleBanner scope="mandates" />
        </div>
      )}

      <ListPanel className="mt-5">
        {!showSample && (
          <ListToolbar
            basePath={BASE_PATH}
            params={params}
            searchPlaceholder="Search mandate or company…"
            filters={[
              { key: "status", label: "Status", options: STATUS_OPTIONS },
            ]}
          />
        )}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse tabular-nums">
            <caption className="sr-only">
              {showSample
                ? "Example mandates, with stage, candidate counts and health."
                : "Your mandates, with status and health."}
            </caption>
            <thead>
              <tr>
                {head.map((h) => (
                  <th
                    key={h}
                    scope="col"
                    className="border-b border-outline-variant px-4 py-3 text-left font-mono-label text-[10px] font-bold uppercase tracking-[0.1em] text-outline"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {showSample
                ? SAMPLE_MANDATES.map((m) => (
                    <tr key={m.id} className="border-b border-outline-variant/50 last:border-0">
                      <td className="px-4 py-3">
                        <Link
                          href={`/app/projects/${m.id}`}
                          className="block rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                        >
                          <span className="block text-[13px] font-medium text-on-surface">
                            {m.title}
                          </span>
                          <span className="block text-xs text-outline">
                            {m.company}
                          </span>
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded-md bg-surface-container-high px-2 py-1 font-mono-label text-[10px] font-semibold uppercase tracking-[0.08em] text-on-surface-variant">
                          {m.stage}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono-data text-[13px] text-on-surface">
                        {String(m.candidates).padStart(2, "0")}
                      </td>
                      <td className="px-4 py-3 font-mono-data text-[13px] text-on-surface">
                        {m.tierOne === null ? (
                          <span className="text-outline">—</span>
                        ) : (
                          String(m.tierOne).padStart(2, "0")
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono-data text-[13px] text-on-surface-variant">
                        {m.dayOfSearch}
                      </td>
                      <td className="px-4 py-3">
                        <HealthDot status={m.health} />
                      </td>
                    </tr>
                  ))
                : projects.map((p) => (
                    <tr key={p.id} className="border-b border-outline-variant/50 last:border-0">
                      <td className="px-4 py-3">
                        <Link
                          href={`/app/projects/${p.id}`}
                          className="block rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                        >
                          <span className="block text-[13px] font-medium text-on-surface">
                            {p.title}
                          </span>
                          <span className="block text-xs text-outline">
                            {p.company_name}
                          </span>
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded-md bg-surface-container-high px-2 py-1 font-mono-label text-[10px] font-semibold uppercase tracking-[0.08em] text-on-surface-variant">
                          {(p.status ?? "active").toUpperCase()}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <HealthDot
                          status={healthByProject.get(p.id) ?? "healthy"}
                        />
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>

        {!showSample && projects.length === 0 && (
          <p className="px-4 py-10 text-center text-sm text-outline">
            {isFiltered(params)
              ? "No mandates match these filters."
              : "No mandates yet."}
            <CapabilityGate capability="mandates:write">
              {" "}
              <Link href="/app/projects/new" className="text-primary hover:underline">
                Start one
              </Link>
            </CapabilityGate>
          </p>
        )}

        {!showSample && (
          <Pagination
            basePath={BASE_PATH}
            params={params}
            rowsOnPage={projects.length}
            hasMore={hasMore}
            noun="mandates"
          />
        )}
      </ListPanel>
    </PageShell>
  );
}
