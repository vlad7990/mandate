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

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export default async function PortfolioAnalyticsPage() {
  const supabase = await createServerSupabaseClient();

  // The portfolio rollup fans out one health-compute per project. We pull
  // candidate rows separately here to avoid duplicating that work for the
  // stage and weekly-velocity charts — both want raw rows, not the
  // pre-bucketed health summary.
  const [metrics, candidatesQ] = await Promise.all([
    computePortfolioMetrics(),
    supabase
      .from("candidates")
      .select("pipeline_stage, created_at"),
  ]);

  const candidates = (candidatesQ.data ?? []) as CandidateLite[];

  const stageCounts = new Map<PipelineStage, number>();
  for (const stage of FUNNEL_STAGES) stageCounts.set(stage, 0);
  for (const c of candidates) {
    const stage = (c.pipeline_stage ?? "found") as PipelineStage;
    stageCounts.set(stage, (stageCounts.get(stage) ?? 0) + 1);
  }
  const maxStageCount = Math.max(1, ...Array.from(stageCounts.values()));

  // 8-week velocity series. Reversed so the chart reads left-to-right
  // oldest → newest. Bucketing lives in a top-level helper because
  // `Date.now()` is impure and react-hooks/purity rejects impure calls
  // in a server-component render body.
  const WEEKS = 8;
  const weeklySeries = bucketByWeek(candidates, WEEKS).slice().reverse();
  const maxWeek = Math.max(1, ...weeklySeries);

  // Health histogram — projects bucketed by computed status.
  const healthBuckets: Record<HealthStatus, number> = {
    healthy: 0,
    stalled: 0,
    at_risk: 0,
  };
  // attentionList is the projects with ≥1 alert. Healthy projects = total - attention.
  for (const row of metrics.attentionList) {
    healthBuckets[row.status] += 1;
  }
  healthBuckets.healthy =
    metrics.totalProjects - healthBuckets.stalled - healthBuckets.at_risk;
  const healthMax = Math.max(1, ...Object.values(healthBuckets));

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

      {/* KPI strip — same shape as the dashboard root, but read-only here. */}
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

      {/* Three-up chart row. Use plain divs styled as bars — no charting
          library, since the data shape is small and the existing palette
          gives us a consistent look. */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard
          title="Candidates by Pipeline Stage"
          icon="filter_alt"
          subtitle={`${candidates.length} total`}
        >
          <ul className="space-y-2">
            {FUNNEL_STAGES.map((stage) => {
              const count = stageCounts.get(stage) ?? 0;
              const pct = (count / maxStageCount) * 100;
              const isRejected = stage === "rejected";
              return (
                <li
                  key={stage}
                  className="grid grid-cols-[140px_1fr_60px] gap-3 items-center"
                >
                  <span
                    className={cn(
                      "font-mono-label text-mono-label uppercase tracking-widest",
                      isRejected ? "text-error" : "text-on-surface"
                    )}
                  >
                    {PIPELINE_LABELS[stage]}
                  </span>
                  <div className="h-2 bg-surface-container border border-outline-variant overflow-hidden">
                    <div
                      className={cn(
                        "h-full transition-all",
                        isRejected
                          ? "bg-error/40"
                          : count > 0
                            ? "bg-primary-container"
                            : "bg-transparent"
                      )}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="font-mono-data text-mono-data text-on-surface tabular-nums text-right">
                    {count}
                  </span>
                </li>
              );
            })}
          </ul>
        </ChartCard>

        <ChartCard
          title="Projects by Health Status"
          icon="monitor_heart"
          subtitle={`${metrics.totalProjects} mandate${metrics.totalProjects === 1 ? "" : "s"}`}
        >
          <ul className="space-y-3">
            {(["healthy", "stalled", "at_risk"] as HealthStatus[]).map(
              (status) => {
                const count = healthBuckets[status];
                const pct = (count / healthMax) * 100;
                return (
                  <li
                    key={status}
                    className="grid grid-cols-[140px_1fr_60px] gap-3 items-center"
                  >
                    <span
                      className={cn(
                        "px-2 py-0.5 border font-mono-label text-mono-label uppercase tracking-wider flex items-center gap-1.5 w-fit",
                        HEALTH_TONE[status]
                      )}
                    >
                      <span
                        className={cn(
                          "w-1.5 h-1.5 rounded-full",
                          HEALTH_DOT[status],
                          status === "at_risk" ? "animate-pulse" : ""
                        )}
                      />
                      {HEALTH_LABELS[status]}
                    </span>
                    <div className="h-2 bg-surface-container border border-outline-variant overflow-hidden">
                      <div
                        className={cn("h-full", HEALTH_DOT[status])}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="font-mono-data text-mono-data text-on-surface tabular-nums text-right">
                      {count}
                    </span>
                  </li>
                );
              }
            )}
          </ul>
        </ChartCard>
      </div>

      <ChartCard
        title="Weekly Velocity (last 8 weeks)"
        icon="trending_up"
        subtitle="candidates added per week, all mandates combined"
      >
        <div className="flex items-end gap-2 h-32">
          {weeklySeries.map((value, i) => {
            const isCurrent = i === weeklySeries.length - 1;
            const pct = (value / maxWeek) * 100;
            const weeksAgo = weeklySeries.length - 1 - i;
            const label =
              weeksAgo === 0 ? "this" : `T-${weeksAgo}w`;
            return (
              <div
                key={i}
                className="flex-1 flex flex-col items-center gap-2 min-w-0"
              >
                <span className="font-mono-data text-body-main text-on-surface tabular-nums">
                  {value}
                </span>
                <div className="w-full h-24 bg-surface-container border border-outline-variant flex flex-col justify-end overflow-hidden">
                  <div
                    className={cn(
                      "transition-all",
                      isCurrent
                        ? "bg-primary-container"
                        : "bg-secondary-fixed-dim/60"
                    )}
                    style={{ height: `${pct}%` }}
                  />
                </div>
                <span
                  className={cn(
                    "font-mono-label text-mono-label uppercase tracking-wider truncate",
                    isCurrent ? "text-primary" : "text-outline"
                  )}
                >
                  {label}
                </span>
              </div>
            );
          })}
        </div>
      </ChartCard>

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

/**
 * Bucket candidates by week-of-creation relative to now. Bucket 0 = this
 * week (T..T-7d), bucket N = T-(N*7d)..T-((N+1)*7d). Lives outside the
 * server component so the impure `Date.now()` call doesn't trigger
 * react-hooks/purity in the render body.
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
    <div className="bg-surface-container-low border border-outline-variant p-3 flex flex-col justify-between min-h-[96px] rounded">
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
