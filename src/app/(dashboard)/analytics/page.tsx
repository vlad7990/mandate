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
import { cn } from "@/lib/utils";

type CandidateLite = {
  pipeline_stage: string | null;
  created_at: string | null;
};

const HEALTH_TONE: Record<HealthStatus, string> = {
  healthy:
    "border-secondary-fixed-dim/60 bg-secondary-fixed-dim/10 text-secondary-fixed-dim",
  stalled: "border-tertiary/60 bg-tertiary/10 text-tertiary",
  at_risk: "border-error/60 bg-error/10 text-error",
};

const HEALTH_DOT: Record<HealthStatus, string> = {
  healthy: "bg-secondary-fixed-dim",
  stalled: "bg-tertiary",
  at_risk: "bg-error",
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
    }))
    .slice()
    .reverse();

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
    <div className="p-6 space-y-6">
      <header className="flex justify-between items-end gap-4 flex-wrap">
        <div>
          <h1 className="font-h1 text-h1 text-primary">PORTFOLIO ANALYTICS</h1>
          <p className="font-mono-label text-mono-label text-outline uppercase tracking-widest mt-1">
            {metrics.totalProjects} mandate{metrics.totalProjects === 1 ? "" : "s"} ·{" "}
            {metrics.totalCandidates} candidates ·{" "}
            {metrics.totalCandidatesThisWeek} added this week
          </p>
        </div>
      </header>

      {/* KPI strip */}
      <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <KpiTile
          label="Active Searches"
          value={String(metrics.activeProjects).padStart(2, "0")}
          unit={`${metrics.totalProjects} total`}
          accent="primary"
        />
        <KpiTile
          label="Total Candidates"
          value={String(metrics.totalCandidates).padStart(2, "0")}
          unit={`+${metrics.totalCandidatesThisWeek} this week`}
          accent="secondary"
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

      {/* Charts: pipeline (full-width) + health (half) + velocity (half) */}
      <ChartCard
        title="Candidates by Pipeline Stage"
        icon="filter_alt"
        subtitle={`${candidates.length} total`}
      >
        <MandateHorizontalBarChart
          data={pipelineData}
          className="h-[320px]"
        />
      </ChartCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard
          title="Projects by Health Status"
          icon="monitor_heart"
          subtitle={`${metrics.totalProjects} mandate${metrics.totalProjects === 1 ? "" : "s"}`}
        >
          <MandateHorizontalBarChart
            data={healthData}
            className="h-[200px]"
          />
        </ChartCard>

        <ChartCard
          title="Weekly Velocity"
          icon="trending_up"
          subtitle="last 8 weeks · candidates added per week"
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
        <section className="bg-surface-container-low border border-outline-variant rounded">
          <header className="flex items-center justify-between gap-2 p-3 border-b border-outline-variant bg-surface-container">
            <h2 className="font-mono-label text-mono-label text-tertiary uppercase tracking-widest flex items-center gap-2">
              <span className="material-symbols-outlined text-[14px]">
                notification_important
              </span>
              Searches Needing Attention
            </h2>
            <span className="font-mono-label text-mono-label text-outline uppercase tracking-wider">
              {metrics.attentionList.length} flagged
            </span>
          </header>
          <ul className="divide-y divide-outline-variant/40">
            {metrics.attentionList.map((row) => (
              <li key={row.projectId}>
                <Link
                  href={`/projects/${row.projectId}/metrics`}
                  prefetch={false}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-surface-container-high transition-colors group"
                >
                  <span
                    className={cn(
                      "px-2 py-0.5 border font-mono-label text-mono-label uppercase tracking-wider flex items-center gap-1.5 shrink-0",
                      HEALTH_TONE[row.status]
                    )}
                  >
                    <span
                      className={cn(
                        "w-1.5 h-1.5 rounded-full",
                        HEALTH_DOT[row.status],
                        row.status === "at_risk" ? "animate-pulse" : ""
                      )}
                    />
                    {HEALTH_LABELS[row.status]}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-on-surface text-body-main font-semibold truncate">
                      {row.title}
                    </div>
                    <div className="font-mono-data text-body-main text-on-surface-variant truncate">
                      {row.companyName}
                    </div>
                  </div>
                  <span className="hidden md:inline font-mono-label text-mono-label text-outline uppercase tracking-wider">
                    {row.alerts.length} alert{row.alerts.length === 1 ? "" : "s"}
                  </span>
                  <span className="material-symbols-outlined text-[18px] text-outline group-hover:text-primary transition-colors">
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
  children,
}: {
  title: string;
  icon: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <article className="bg-surface-container-low border border-outline-variant p-4 space-y-4">
      <header className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="font-mono-label text-mono-label text-primary uppercase tracking-widest flex items-center gap-2">
          <span className="material-symbols-outlined text-[14px]">{icon}</span>
          {title}
        </h2>
        {subtitle && (
          <span className="font-mono-label text-mono-label text-outline uppercase tracking-wider">
            {subtitle}
          </span>
        )}
      </header>
      {children}
    </article>
  );
}

function KpiTile({
  label,
  value,
  unit,
  accent,
}: {
  label: string;
  value: string;
  unit: string;
  accent?: "primary" | "secondary" | "warn";
}) {
  const valueColor =
    accent === "primary"
      ? "text-primary"
      : accent === "secondary"
        ? "text-secondary-fixed-dim"
        : accent === "warn"
          ? "text-tertiary"
          : "text-on-surface";
  return (
    <div className="bg-surface-container-low border border-outline-variant p-3 flex flex-col justify-between min-h-[96px] rounded relative overflow-hidden">
      {/* Subtle accent bar — terminal/instrumentation feel */}
      <div
        className={cn(
          "absolute left-0 top-0 bottom-0 w-0.5",
          accent === "primary"
            ? "bg-primary"
            : accent === "secondary"
              ? "bg-secondary-fixed-dim"
              : accent === "warn"
                ? "bg-tertiary"
                : "bg-outline-variant"
        )}
      />
      <span className="font-mono-label text-mono-label text-outline uppercase tracking-wider">
        {label}
      </span>
      <div className="flex items-baseline gap-2">
        <span className={cn("font-h2 text-h2 tabular-nums", valueColor)}>
          {value}
        </span>
      </div>
      <span className="font-mono-label text-mono-label text-outline uppercase tracking-wider">
        {unit}
      </span>
    </div>
  );
}
