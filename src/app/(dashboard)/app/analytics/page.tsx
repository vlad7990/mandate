import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import {
  PIPELINE_LABELS,
  type PipelineStage,
} from "@/lib/ai/cv-parsing";
import { computePortfolioMetrics } from "@/lib/metrics/portfolio";
import {
  FUNNEL_STAGES,
  HEALTH_LABELS,
  type HealthStatus,
} from "@/lib/metrics/types";
import {
  MandateHorizontalBarChart,
  MandateLineChart,
  type MandateBarDatum,
} from "@/components/charts/mandate-charts";
import { KpiTile } from "@/components/ui/kpi-tile";
import { LiveTick } from "@/components/ui/live-tick";
import { MastHead } from "@/components/ui/mast-head";
import { StatusChip, type ChipTone } from "@/components/ui/status-chip";

type CandidateLite = {
  pipeline_stage: string | null;
  created_at: string | null;
};

const HEALTH_CHIP: Record<HealthStatus, ChipTone> = {
  healthy: "secondary",
  stalled: "warn",
  at_risk: "danger",
};

const HEALTH_FILL: Record<HealthStatus, string> = {
  healthy: "var(--color-secondary-fixed-dim)",
  stalled: "var(--color-tertiary)",
  at_risk: "var(--color-error)",
};

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export default async function PortfolioAnalyticsPage() {
  const supabase = await createServerSupabaseClient();

  const [metrics, candidatesQ] = await Promise.all([
    computePortfolioMetrics(),
    supabase.from("candidates").select("pipeline_stage, created_at"),
  ]);

  const candidates = (candidatesQ.data ?? []) as CandidateLite[];

  // Pipeline stage distribution. 'rejected' tinted error so it reads as
  // off-funnel; everything else inherits the chart's primary fill.
  const stageCounts = new Map<PipelineStage, number>();
  for (const stage of FUNNEL_STAGES) stageCounts.set(stage, 0);
  for (const c of candidates) {
    const stage = (c.pipeline_stage ?? "found") as PipelineStage;
    stageCounts.set(stage, (stageCounts.get(stage) ?? 0) + 1);
  }
  const pipelineData: MandateBarDatum[] = FUNNEL_STAGES.map((stage) => {
    const value = stageCounts.get(stage) ?? 0;
    return {
      label: PIPELINE_LABELS[stage],
      value,
      fill: stage === "rejected" ? "var(--color-error)" : null,
      meta: `${value} candidate${value === 1 ? "" : "s"}`,
    };
  });

  // Weekly velocity over the last 8 weeks. Bucketed in a top-level
  // helper because Date.now() is impure and react-hooks/purity rejects
  // it inside server-component render bodies.
  const weeklyBuckets = bucketByWeek(candidates, 8);
  const weeklyData: MandateBarDatum[] = weeklyBuckets
    .map((value, bucketIndex) => ({
      // bucketIndex 0 = this week; later we reverse so the chart reads
      // left-to-right oldest → newest with the rightmost bar being now.
      label: bucketIndex === 0 ? "this" : `T-${bucketIndex}w`,
      value,
      meta: `${value} candidate${value === 1 ? "" : "s"} ${bucketIndex === 0 ? "this week" : `${bucketIndex}w ago`}`,
    }))
    .slice()
    .reverse();

  const lastWeek = weeklyBuckets[0] ?? 0;
  const previousWeek = weeklyBuckets[1] ?? 0;
  const weeklyDelta = lastWeek - previousWeek;

  // Health histogram. attentionList already excludes healthy projects
  // (those have zero alerts), so the healthy bucket is computed via
  // subtraction.
  const healthBuckets: Record<HealthStatus, number> = {
    healthy: 0,
    stalled: 0,
    at_risk: 0,
  };
  for (const row of metrics.attentionList) {
    healthBuckets[row.status] += 1;
  }
  healthBuckets.healthy =
    metrics.totalProjects - healthBuckets.stalled - healthBuckets.at_risk;
  const healthData: MandateBarDatum[] = (
    ["healthy", "stalled", "at_risk"] as HealthStatus[]
  ).map((status) => {
    const value = healthBuckets[status];
    return {
      label: HEALTH_LABELS[status],
      value,
      fill: HEALTH_FILL[status],
      meta: `${value} project${value === 1 ? "" : "s"}`,
    };
  });

  return (
    <div className="px-6 py-6 space-y-5 max-w-[1600px] mx-auto">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="font-mono-label text-mono-label text-outline uppercase tracking-widest mb-1">
            Workspace // Analytics
          </div>
          <h1 className="font-h1 text-h1 text-on-surface tracking-tight">
            PORTFOLIO ANALYTICS
          </h1>
          <p className="font-mono-label text-mono-label text-on-surface-variant uppercase tracking-widest mt-1.5 tabular-nums">
            {String(metrics.totalProjects).padStart(2, "0")} mandate
            {metrics.totalProjects === 1 ? "" : "s"} ·{" "}
            {String(metrics.totalCandidates).padStart(2, "0")} candidates ·{" "}
            +{metrics.totalCandidatesThisWeek} this week
          </p>
        </div>
        <LiveTick nowOnServer label="Snapshot" />
      </header>

      {/* KPI strip — uses the shared instrument tile so dashboard, project,
          and analytics all read with the same visual rhythm. */}
      <section
        aria-label="Portfolio key metrics"
        className="grid grid-cols-2 lg:grid-cols-4 gap-3"
      >
        <KpiTile
          label="Active Searches"
          value={String(metrics.activeProjects).padStart(2, "0")}
          unit={`${metrics.totalProjects} total`}
          accent="primary"
        />
        <KpiTile
          label="Total Candidates"
          value={String(metrics.totalCandidates).padStart(2, "0")}
          unit="across portfolio"
          accent="secondary"
          delta={
            metrics.totalCandidatesThisWeek > 0
              ? {
                  direction: "up",
                  label: `+${metrics.totalCandidatesThisWeek} 7d`,
                }
              : { direction: "flat", label: "0 7d" }
          }
        />
        <KpiTile
          label="Avg Velocity"
          value={metrics.averageWeeklyVelocity.toFixed(1)}
          unit="cand / week / search"
        />
        <KpiTile
          label="Feedback 7d"
          value={String(metrics.totalFeedbackThisWeek).padStart(2, "0")}
          unit={`${metrics.attentionList.length} need attention`}
          accent={metrics.attentionList.length > 0 ? "warn" : "secondary"}
        />
      </section>

      <ChartCard
        title="Candidates by Pipeline Stage"
        icon="filter_alt"
        subtitle={`${candidates.length} total`}
      >
        <MandateHorizontalBarChart data={pipelineData} className="h-[320px]" />
      </ChartCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard
          title="Projects by Health Status"
          icon="monitor_heart"
          subtitle={`${metrics.totalProjects} mandate${metrics.totalProjects === 1 ? "" : "s"}`}
        >
          <MandateHorizontalBarChart data={healthData} className="h-[200px]" />
        </ChartCard>

        <ChartCard
          title="Weekly Velocity"
          icon="trending_up"
          subtitle="last 8 weeks · candidates added per week"
          headerExtra={
            <span
              className={
                "font-mono-label text-mono-label uppercase tracking-widest tabular-nums flex items-center gap-1 " +
                (weeklyDelta > 0
                  ? "text-secondary-fixed-dim"
                  : weeklyDelta < 0
                    ? "text-error"
                    : "text-outline")
              }
            >
              <span
                className="material-symbols-outlined text-[12px]"
                aria-hidden
              >
                {weeklyDelta > 0
                  ? "trending_up"
                  : weeklyDelta < 0
                    ? "trending_down"
                    : "trending_flat"}
              </span>
              {weeklyDelta > 0 ? "+" : ""}
              {weeklyDelta} vs prev
            </span>
          }
        >
          <MandateLineChart
            data={weeklyData}
            valueLabel="Candidates"
            stroke="var(--color-primary)"
            className="h-[200px]"
          />
        </ChartCard>
      </div>

      {metrics.attentionList.length > 0 && (
        <section className="space-y-2">
          <MastHead
            tone="tertiary"
            icon="notification_important"
            label="Searches Needing Attention"
            meta={
              <span className="tabular-nums">
                {String(metrics.attentionList.length).padStart(2, "0")} flagged
              </span>
            }
          />
          <ul className="bg-surface-container-low border border-outline-variant divide-y divide-outline-variant/40">
            {metrics.attentionList.map((row) => (
              <li key={row.projectId}>
                <Link
                  href={`/app/projects/${row.projectId}/metrics`}
                  prefetch={false}
                  className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-container-high transition-colors group focus-visible:outline-none focus-visible:bg-surface-container-high focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-primary"
                >
                  <StatusChip
                    tone={HEALTH_CHIP[row.status]}
                    dot
                    pulse={row.status === "at_risk"}
                  >
                    {HEALTH_LABELS[row.status]}
                  </StatusChip>
                  <div className="flex-1 min-w-0">
                    <div className="text-on-surface text-body-main font-semibold truncate">
                      {row.title}
                    </div>
                    <div className="font-mono-data text-body-main text-on-surface-variant truncate">
                      {row.companyName}
                    </div>
                  </div>
                  <span className="hidden md:inline font-mono-label text-mono-label text-outline uppercase tracking-widest tabular-nums">
                    {String(row.alerts.length).padStart(2, "0")} alert
                    {row.alerts.length === 1 ? "" : "s"}
                  </span>
                  <span
                    className="material-symbols-outlined text-[18px] text-outline group-hover:text-primary transition-colors shrink-0"
                    aria-hidden
                  >
                    chevron_right
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/**
 * Bucket candidates by week-of-creation relative to now. Bucket 0 = this
 * week (T..T-7d). Lives outside the server component so the impure
 * `Date.now()` call doesn't trigger react-hooks/purity in render.
 */
function bucketByWeek(
  candidates: Array<{ created_at: string | null }>,
  weeks: number
): number[] {
  const now = Date.now();
  const buckets = Array<number>(weeks).fill(0);
  for (const c of candidates) {
    if (!c.created_at) continue;
    const weeksAgo = (now - new Date(c.created_at).getTime()) / WEEK_MS;
    const bucket = Math.floor(weeksAgo);
    if (bucket >= 0 && bucket < weeks) {
      buckets[bucket] += 1;
    }
  }
  return buckets;
}

function ChartCard({
  title,
  icon,
  subtitle,
  headerExtra,
  children,
}: {
  title: string;
  icon: string;
  subtitle?: string;
  headerExtra?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <article className="bg-surface-container-low border border-outline-variant">
      <header className="px-4 py-2.5 border-b border-outline-variant bg-surface-container flex items-center justify-between gap-3 flex-wrap">
        <h2 className="font-mono-label text-mono-label text-primary uppercase tracking-widest flex items-center gap-2">
          <span className="material-symbols-outlined text-[14px]" aria-hidden>
            {icon}
          </span>
          {title}
        </h2>
        <div className="flex items-center gap-3">
          {subtitle && (
            <span className="font-mono-label text-mono-label text-outline uppercase tracking-widest tabular-nums">
              {subtitle}
            </span>
          )}
          {headerExtra}
        </div>
      </header>
      <div className="p-4">{children}</div>
    </article>
  );
}
