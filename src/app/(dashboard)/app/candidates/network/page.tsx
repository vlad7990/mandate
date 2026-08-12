import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { BreadcrumbRail } from "@/components/ui/breadcrumb-rail";
import { MastHead } from "@/components/ui/mast-head";
import {
  loadNetworkOverview,
  type NetworkPerson,
} from "@/lib/network/network-aggregator";
import { type Archetype } from "@/lib/ai/cv-parsing";
import { NetworkTable } from "./network-table";

export default async function NetworkPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/signin");

  const overview = await loadNetworkOverview();
  const analytics = computeAnalytics(overview.people);

  return (
    <div className="px-6 py-6 space-y-5 max-w-[1500px] mx-auto">
      <BreadcrumbRail
        segments={[
          { label: "Mandate", href: "/app/home" },
          { label: "Candidates", href: "/app/candidates" },
          { label: "Network" },
        ]}
      />

      <header className="space-y-2">
        <h1 className="font-h1 text-h1 text-on-surface tracking-tight">
          GLOBAL_EXECUTIVE_NETWORK
        </h1>
        <p className="font-mono-label text-mono-label text-on-surface-variant uppercase tracking-widest tabular-nums">
          <span className="text-primary">
            {String(analytics.total).padStart(3, "0")}
          </span>{" "}
          executives in network · {analytics.returning} returning ·{" "}
          {analytics.shortlistedCount} shortlisted before
        </p>
      </header>

      <AnalyticsBlock analytics={analytics} />

      <section className="space-y-2">
        <MastHead
          tone="primary"
          label={
            <span className="flex items-baseline gap-2">
              <span>Talent Pool</span>
              <span className="text-outline tabular-nums">
                · {String(overview.people.length).padStart(3, "0")}
              </span>
            </span>
          }
          meta={
            <span className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
              Cross-project · search, filter, sort
            </span>
          }
        />
        <NetworkTable
          people={overview.people}
          activeProjects={overview.active_projects}
        />
      </section>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Analytics
// ────────────────────────────────────────────────────────────────────────

type AnalyticsBlock = {
  total: number;
  byArchetype: Array<{ archetype: Archetype | "Unspecified"; count: number }>;
  byDomain: Array<{ domain: string; count: number }>;
  topByAverage: NetworkPerson[];
  mostVersatile: NetworkPerson[];
  returning: number;
  shortlistedCount: number;
};

function computeAnalytics(people: NetworkPerson[]): AnalyticsBlock {
  const archetypeMap = new Map<Archetype | "Unspecified", number>();
  const domainMap = new Map<string, number>();
  for (const p of people) {
    const ak = (p.archetype ?? "Unspecified") as Archetype | "Unspecified";
    archetypeMap.set(ak, (archetypeMap.get(ak) ?? 0) + 1);
    if (p.domain) domainMap.set(p.domain, (domainMap.get(p.domain) ?? 0) + 1);
  }

  const byArchetype = Array.from(archetypeMap.entries())
    .map(([archetype, count]) => ({ archetype, count }))
    .sort((a, b) => b.count - a.count);
  const byDomain = Array.from(domainMap.entries())
    .map(([domain, count]) => ({ domain, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  const topByAverage = [...people]
    .filter((p) => p.average_score != null)
    .sort((a, b) => (b.average_score ?? 0) - (a.average_score ?? 0))
    .slice(0, 5);

  const mostVersatile = [...people]
    .filter((p) => p.appearances.length >= 2)
    .sort((a, b) => b.appearances.length - a.appearances.length)
    .slice(0, 5);

  const returning = people.filter((p) => p.returning).length;
  const shortlistedCount = people.filter((p) => p.shortlisted_before).length;

  return {
    total: people.length,
    byArchetype,
    byDomain,
    topByAverage,
    mostVersatile,
    returning,
    shortlistedCount,
  };
}

function AnalyticsBlock({ analytics }: { analytics: AnalyticsBlock }) {
  return (
    <section className="grid grid-cols-1 lg:grid-cols-12 gap-3">
      <KpiTile
        className="lg:col-span-3"
        label="Total executives"
        value={analytics.total}
        tone="primary"
      />
      <KpiTile
        className="lg:col-span-3"
        label="Returning candidates"
        value={analytics.returning}
        tone="secondary"
      />
      <KpiTile
        className="lg:col-span-3"
        label="Shortlisted before"
        value={analytics.shortlistedCount}
        tone="secondary"
      />
      <KpiTile
        className="lg:col-span-3"
        label="Distinct domains"
        value={analytics.byDomain.length}
        tone="tertiary"
      />

      <BreakdownCard
        className="lg:col-span-4"
        title="By archetype"
        rows={analytics.byArchetype.map((r) => ({
          label: r.archetype,
          value: r.count,
        }))}
        total={analytics.total}
      />
      <BreakdownCard
        className="lg:col-span-4"
        title="By domain"
        rows={analytics.byDomain.map((r) => ({
          label: r.domain,
          value: r.count,
        }))}
        total={analytics.total}
      />
      <div className="lg:col-span-4 grid grid-rows-2 gap-3">
        <PeopleListCard
          title="Top by avg score"
          subtitle="Highest mean across all appearances"
          people={analytics.topByAverage}
          metric={(p) =>
            p.average_score != null ? `${p.average_score.toFixed(1)}/10` : "—"
          }
        />
        <PeopleListCard
          title="Most versatile"
          subtitle="Considered for the most projects"
          people={analytics.mostVersatile}
          metric={(p) =>
            `${p.appearances.length} project${p.appearances.length === 1 ? "" : "s"}`
          }
        />
      </div>
    </section>
  );
}

function KpiTile({
  className,
  label,
  value,
  tone,
}: {
  className?: string;
  label: string;
  value: number;
  tone: "primary" | "secondary" | "tertiary";
}) {
  const toneClass =
    tone === "primary"
      ? "text-primary border-primary-container/40"
      : tone === "secondary"
        ? "text-secondary-fixed-dim border-secondary-fixed-dim/40"
        : "text-tertiary border-tertiary/40";
  return (
    <div
      className={`bg-surface-container-low border ${toneClass} p-4 ${className ?? ""}`}
    >
      <div className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
        {label}
      </div>
      <div
        className={`font-h1 text-h1 tabular-nums leading-none mt-1 ${toneClass.split(" ")[0]}`}
      >
        {String(value).padStart(2, "0")}
      </div>
    </div>
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
  people,
  metric,
}: {
  title: string;
  subtitle: string;
  people: NetworkPerson[];
  metric: (p: NetworkPerson) => string;
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
      {people.length === 0 ? (
        <p className="font-mono-label text-mono-label text-outline italic uppercase tracking-widest">
          No data yet.
        </p>
      ) : (
        <ol className="space-y-1">
          {people.map((p, i) => (
            <li
              key={p.identity_key}
              className="flex items-baseline gap-2 font-mono-data text-body-main"
            >
              <span className="font-mono-label text-mono-label text-outline uppercase tracking-widest tabular-nums w-6">
                #{i + 1}
              </span>
              <span className="text-on-surface truncate flex-1 min-w-0">
                {p.full_name}
              </span>
              <span className="text-secondary-fixed-dim tabular-nums">
                {metric(p)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </article>
  );
}
