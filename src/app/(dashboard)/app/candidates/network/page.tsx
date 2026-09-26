import { redirect } from "next/navigation";
import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { SetBreadcrumbs } from "@/components/dashboard/breadcrumbs";
import { MastHead } from "@/components/ui/mast-head";
import { KpiTile } from "@/components/ui/kpi-tile";
import {
  countNetworkPeople,
  loadNetworkPage,
  type NetworkRollup,
  type NetworkSort,
} from "@/lib/network/network-aggregator";
import { loadRelationshipProfiles } from "@/lib/network/profile-resolver";
import { NetworkTable } from "./network-table";
import { MergePeoplePanel } from "./merge-people-panel";
import type { MergeablePerson } from "@/lib/network/merge-people";
import { getAccess } from "@/lib/auth/access";
import { can } from "@/lib/auth/roles";
import { PageShell, TerminalTitle } from "@/components/ui/page-shell";
import { ListToolbar, type FilterSpec } from "@/components/ui/list-toolbar";
import { Pagination } from "@/components/ui/pagination";
import {
  buildListHref,
  parseListParams,
  rangeFor,
  type ListParams,
  type RawSearchParams,
} from "@/lib/list-params";
import { ARCHETYPES, PIPELINE_LABELS, PIPELINE_STAGES } from "@/lib/ai/cv-parsing";
import { TIER_BANDS, TIER_ORDER } from "@/lib/ranking/tiers";
import { cookies } from "next/headers";
import { SAMPLE_DISMISSED_COOKIE, shouldShowSample } from "@/lib/sample";
import { SampleNetwork } from "@/components/sample/sample-candidates";

/**
 * The Global Executive Network.
 *
 * §205 — this page used to fetch up to 2,000 candidate rows and do everything
 * in the browser: fold them into people, filter, sort and page. Measured
 * before the change, that was 42 MB on the wire to render 25 rows, and above
 * the window it was also WRONG — 2,000 people where 2,100 existed, and a
 * person on two mandates reading "Considered for 1 project". Both now happen
 * in Postgres (migration 145), and the page reads one page of people.
 *
 * It therefore keeps its state in the query string like every other list in
 * the product: a filtered network is a link somebody can send.
 */

const BASE_PATH = "/app/candidates/network";
const PER_PAGE = 25;

/** Sort keys, and the allowlist that reaches the function. */
const SORTS = ["best_score", "average_score", "last_active", "name"] as const;
const FILTERS = ["archetype", "tier", "domain", "stage", "years"] as const;

const SORT_LABELS: Record<(typeof SORTS)[number], string> = {
  best_score: "Best score",
  average_score: "Avg score",
  last_active: "Most recent",
  name: "Alphabetical",
};

const YEARS_OPTIONS = [
  { value: "0-5", label: "0–5" },
  { value: "6-10", label: "6–10" },
  { value: "11-20", label: "11–20" },
  { value: "21+", label: "21+" },
];

export default async function NetworkPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const params = parseListParams(await searchParams, {
    perPage: PER_PAGE,
    filters: FILTERS,
    sorts: SORTS,
    defaultSort: "best_score",
    defaultDir: "desc",
  });

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/signin");

  const { from } = rangeFor(params);
  const page = await loadNetworkPage({
    filters: {
      q: params.q,
      archetype: params.filters.archetype,
      tier: params.filters.tier,
      domain: params.filters.domain,
      stage: params.filters.stage,
      years: params.filters.years,
    },
    sort: (params.sort ?? "best_score") as NetworkSort,
    dir: params.dir,
    perPage: params.perPage,
    offset: from,
  });

  // The relationship overlay (#24, 098), for the people ON THIS PAGE, and
  // whether the viewer may clear a suppression (founder territory).
  const [profileMap, { data: viewerRow }] = await Promise.all([
    loadRelationshipProfiles(page.people.map((p) => p.profile_id)),
    supabase
      .from("users")
      .select("is_founder")
      .eq("id", user.id)
      .maybeSingle<{ is_founder: boolean }>(),
  ]);
  const profiles = Object.fromEntries(profileMap);
  const isFounder = viewerRow?.is_founder === true;

  // §203 — the merge panel's list, from every profile in the org rather than
  // this page's: merging is how two people become one, so it cannot only
  // offer the people who happen to be on screen.
  const [allProfiles, { data: profileCounts }] = await Promise.all([
    loadRelationshipProfiles(),
    supabase
      .from("candidates")
      .select("network_profile_id")
      .not("network_profile_id", "is", null),
  ]);
  const countByProfile = new Map<string, number>();
  for (const row of profileCounts ?? []) {
    const key = row.network_profile_id as string;
    countByProfile.set(key, (countByProfile.get(key) ?? 0) + 1);
  }
  const mergeablePeople: MergeablePerson[] = Array.from(allProfiles.values())
    .map((profile) => ({
      id: profile.id,
      displayName: profile.display_name,
      identityKey: profile.identity_key,
      relationshipState: profile.relationship_state,
      dnc: profile.dnc,
      dncReason: profile.dnc_reason,
      candidates: countByProfile.get(profile.id) ?? 0,
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
  const access = await getAccess();

  // A network of nobody is the least legible empty state in the product: the
  // page's whole idea is that a row is a *person folded from several candidate
  // records*, and that cannot be read off an empty table. The signal is the
  // org's own people count, NOT this page's — a filter that matches nothing
  // is an empty result, not an empty product.
  const orgPeople = await countNetworkPeople();
  const dismissed = (await cookies()).get(SAMPLE_DISMISSED_COOKIE)?.value === "1";
  if (shouldShowSample({ hasRealData: orgPeople > 0, dismissed })) {
    return <SampleNetwork />;
  }

  const rollup = page.rollup;

  const filterSpecs: FilterSpec[] = [
    {
      key: "archetype",
      label: "Archetype",
      options: ARCHETYPES.map((a) => ({ value: a, label: a })),
    },
    {
      key: "tier",
      label: "Best tier",
      options: TIER_ORDER.map((t) => ({
        value: t,
        label: TIER_BANDS[t].label.split(" · ")[0],
      })),
    },
    {
      key: "stage",
      label: "Stage",
      options: PIPELINE_STAGES.map((st) => ({
        value: st,
        label: PIPELINE_LABELS[st],
      })),
    },
    {
      key: "domain",
      label: "Domain",
      options: page.domains.map((d) => ({ value: d, label: d })),
    },
    { key: "years", label: "Years", options: YEARS_OPTIONS },
  ];

  return (
    <PageShell className="space-y-5">
      <SetBreadcrumbs
        crumbs={[
          { label: "Candidates", href: "/app/candidates" },
          { label: "Network" },
        ]}
      />

      <header className="space-y-2">
        <TerminalTitle>GLOBAL_EXECUTIVE_NETWORK</TerminalTitle>
        <p className="font-mono-label text-mono-label text-on-surface-variant uppercase tracking-widest tabular-nums">
          <span className="text-primary">
            {String(rollup.total).padStart(3, "0")}
          </span>{" "}
          executives in network · {rollup.returning} returning ·{" "}
          {rollup.shortlisted} shortlisted before
        </p>
      </header>

      {/* §204/D2 — a CV still being read has no person yet (§196/139), so it
          is not a row here. Saying so beats a just-uploaded candidate
          silently missing from a page whose count the recruiter trusts. */}
      {rollup.people_pending > 0 && (
        <p
          role="status"
          className="border border-outline-variant bg-surface-container-low px-4 py-3 text-body-main text-on-surface-variant"
        >
          {rollup.people_pending === 1
            ? "One candidate record is still being read"
            : `${rollup.people_pending} candidate records are still being read`}{" "}
          and {rollup.people_pending === 1 ? "is" : "are"} not counted as
          people yet. They appear here once their CV has been parsed and there
          is something to identify them by.
        </p>
      )}

      <AnalyticsBlock rollup={rollup} />

      <section className="space-y-2">
        <MastHead
          tone="primary"
          label={
            <span className="flex items-baseline gap-2">
              <span>Talent Pool</span>
              <span className="text-outline tabular-nums">
                · {String(rollup.total).padStart(3, "0")}
              </span>
            </span>
          }
          meta={
            <span className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
              Cross-project · search, filter, sort
            </span>
          }
        />

        <div className="border border-outline-variant bg-surface-container-low">
          <ListToolbar
            basePath={BASE_PATH}
            params={params}
            filters={filterSpecs}
            searchPlaceholder="Search by name, title, company, domain, skills"
          />
          <SortBar params={params} />
          <NetworkTable
            people={page.people}
            activeProjects={page.active_projects}
            profiles={profiles}
            isFounder={isFounder}
          />
          <Pagination
            basePath={BASE_PATH}
            params={params}
            rowsOnPage={page.people.length}
            hasMore={page.hasMore}
            noun="people"
          />
        </div>

        <MergePeoplePanel
          people={mergeablePeople}
          canMerge={can(access?.role, "candidates:write")}
        />
      </section>
    </PageShell>
  );
}

/**
 * Sort as links, matching `Pagination`'s reasoning: a sorted list is a place.
 * Clicking the active key flips its direction, which is the one piece of
 * state a select and a toggle used to hold between them.
 */
function SortBar({ params }: { params: ListParams }) {
  return (
    <nav
      aria-label="Sort"
      className="flex flex-wrap items-center gap-2 border-b border-outline-variant px-4 py-2"
    >
      <span className="font-mono-label text-mono-label uppercase tracking-widest text-outline">
        Sort
      </span>
      {SORTS.map((key) => {
        const active = (params.sort ?? "best_score") === key;
        const dir = active && params.dir === "desc" ? "asc" : "desc";
        return (
          <Link
            key={key}
            href={buildListHref(BASE_PATH, params, { sort: key, dir })}
            aria-current={active ? "true" : undefined}
            className={`px-2 py-1 border font-mono-label text-mono-label uppercase tracking-widest transition-colors ${
              active
                ? "border-primary text-primary"
                : "border-outline-variant text-on-surface-variant hover:border-primary hover:text-primary"
            }`}
          >
            {SORT_LABELS[key]}
            {active ? (params.dir === "desc" ? " ↓" : " ↑") : ""}
          </Link>
        );
      })}
    </nav>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Analytics
//
// §205/D2 — these come from `network_people_rollup`, over the whole FILTERED
// pool. They used to be computed in Node from the array the table rendered;
// once the table pages, that array is 25 rows, and a headline computed from
// it would describe a page while wearing the word "network". That is exactly
// how the old 2,000-row window made this block wrong.
// ────────────────────────────────────────────────────────────────────────

function AnalyticsBlock({ rollup }: { rollup: NetworkRollup }) {
  return (
    <section className="grid grid-cols-1 lg:grid-cols-12 gap-3">
      <KpiTile
        className="lg:col-span-3"
        label="Total executives"
        value={String(rollup.total).padStart(2, "0")}
        accent="primary"
      />
      <KpiTile
        className="lg:col-span-3"
        label="Returning candidates"
        value={String(rollup.returning).padStart(2, "0")}
        accent="secondary"
      />
      <KpiTile
        className="lg:col-span-3"
        label="Shortlisted before"
        value={String(rollup.shortlisted).padStart(2, "0")}
        accent="secondary"
      />
      <KpiTile
        className="lg:col-span-3"
        label="Distinct domains"
        value={String(rollup.domains).padStart(2, "0")}
        accent="warn"
      />

      <BreakdownCard
        className="lg:col-span-4"
        title="By archetype"
        rows={rollup.by_archetype.map((r) => ({
          label: r.archetype,
          value: r.count,
        }))}
        total={rollup.total}
      />
      <BreakdownCard
        className="lg:col-span-4"
        title="By domain"
        rows={rollup.by_domain.map((r) => ({
          label: r.domain,
          value: r.count,
        }))}
        total={rollup.total}
      />
      <div className="lg:col-span-4 grid grid-rows-2 gap-3">
        <PeopleListCard
          title="Top by avg score"
          subtitle="Highest mean across all appearances"
          rows={rollup.top_by_average.map((r) => ({
            name: r.full_name,
            metric:
              r.average_score != null
                ? `${Number(r.average_score).toFixed(1)}/10`
                : "—",
          }))}
        />
        <PeopleListCard
          title="Most versatile"
          subtitle="Considered for the most projects"
          rows={rollup.most_versatile.map((r) => ({
            name: r.full_name,
            metric: `${r.project_count} project${r.project_count === 1 ? "" : "s"}`,
          }))}
        />
      </div>
    </section>
  );
}

function BreakdownCard({
  className,
  title,
  rows,
  total,
}: {
  className?: string;
  title: string;
  rows: Array<{ label: string; value: number }>;
  total: number;
}) {
  return (
    <article
      className={`bg-surface-container-low border border-outline-variant p-4 space-y-2 ${className ?? ""}`}
    >
      <h3 className="font-mono-label text-mono-label text-primary uppercase tracking-widest">
        {title}
      </h3>
      {rows.length === 0 ? (
        <p className="font-mono-label text-mono-label text-outline italic uppercase tracking-widest">
          No data yet.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((r, i) => {
            const pct = total > 0 ? Math.round((r.value / total) * 100) : 0;
            return (
              <li key={i} className="space-y-0.5">
                <div className="flex items-baseline justify-between font-mono-data text-body-main text-on-surface-variant">
                  <span className="truncate">{r.label}</span>
                  <span className="tabular-nums">
                    {r.value} · {pct}%
                  </span>
                </div>
                <div className="h-1 bg-surface-container-high overflow-hidden">
                  <span
                    className="block h-full bg-primary transition-[width]"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </article>
  );
}

function PeopleListCard({
  title,
  subtitle,
  rows,
}: {
  title: string;
  subtitle: string;
  rows: Array<{ name: string; metric: string }>;
}) {
  return (
    <article className="bg-surface-container-low border border-outline-variant p-4 space-y-2">
      <header>
        <h3 className="font-mono-label text-mono-label text-primary uppercase tracking-widest">
          {title}
        </h3>
        <p className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
          {subtitle}
        </p>
      </header>
      {rows.length === 0 ? (
        <p className="font-mono-label text-mono-label text-outline italic uppercase tracking-widest">
          No data yet.
        </p>
      ) : (
        <ol className="space-y-1">
          {rows.map((r, i) => (
            <li
              key={`${r.name}-${i}`}
              className="flex items-baseline gap-2 font-mono-data text-body-main"
            >
              <span className="font-mono-label text-mono-label text-outline uppercase tracking-widest tabular-nums w-6">
                #{i + 1}
              </span>
              <span className="text-on-surface truncate flex-1 min-w-0">
                {r.name}
              </span>
              <span className="text-secondary-fixed-dim tabular-nums">
                {r.metric}
              </span>
            </li>
          ))}
        </ol>
      )}
    </article>
  );
}
