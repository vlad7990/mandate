import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import {
  PIPELINE_LABELS,
  type PipelineStage,
} from "@/lib/ai/cv-parsing";
import { computePipelineMetrics } from "@/lib/metrics/pipeline";
import { computeProjectHealth } from "@/lib/metrics/health";
import {
  HEALTH_LABELS,
  type FunnelEntry,
  type HealthStatus,
} from "@/lib/metrics/types";
import {
  MandateHorizontalBarChart,
  type MandateBarDatum,
} from "@/components/charts/mandate-charts";
import { cn } from "@/lib/utils";

type ProjectRow = {
  id: string;
  title: string;
  company_name: string;
};

const HEALTH_TONES: Record<HealthStatus, string> = {
  healthy: "border-secondary-fixed-dim/60 bg-secondary-fixed-dim/10 text-secondary-fixed-dim",
  stalled: "border-tertiary/60 bg-tertiary/10 text-tertiary",
  at_risk: "border-error/60 bg-error/10 text-error",
};

const HEALTH_BARS: Record<HealthStatus, string> = {
  healthy: "bg-secondary-fixed-dim",
  stalled: "bg-tertiary",
  at_risk: "bg-error",
};

export default async function ProjectMetricsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id, title, company_name")
    .eq("id", id)
    .single<ProjectRow>();

  if (projectError || !project) {
    if (projectError?.code === "PGRST116") notFound();
    redirect("/");
  }

  // Pipeline + health are independent computations on the same data;
  // run in parallel so the page lands in one round-trip's worth of time.
  const [pipeline, health] = await Promise.all([
    computePipelineMetrics(id),
    computeProjectHealth(id),
  ]);

  return (
    <div className="min-h-full bg-surface text-on-surface">
      <div className="max-w-7xl mx-auto px-6 py-10 space-y-6">
        <div className="flex items-center gap-3 font-mono-label text-mono-label uppercase tracking-widest text-outline">
          <Link
            href={`/projects/${project.id}`}
            prefetch={false}
            className="hover:text-on-surface transition-colors flex items-center gap-1.5"
          >
            <span className="material-symbols-outlined text-[14px]">arrow_back</span>
            Mandate
          </Link>
          <span className="text-outline-variant">/</span>
          <span className="text-on-surface-variant">{project.title}</span>
          <span className="text-outline-variant">/</span>
          <span className="text-primary">Metrics</span>
        </div>

        <header className="flex justify-between items-end gap-4 flex-wrap">
          <div>
            <h1 className="font-h1 text-h1 text-primary">SEARCH METRICS</h1>
            <p className="font-mono-label text-mono-label text-outline uppercase tracking-widest mt-1">
              {project.company_name} · {project.title}
              {health.lastActivityAt
                ? ` · last activity ${formatRelative(health.lastActivityAt)}`
                : ""}
            </p>
          </div>
          <span
            className={cn(
              "px-3 py-1.5 border font-mono-label text-mono-label uppercase tracking-widest flex items-center gap-2",
              HEALTH_TONES[health.status]
            )}
          >
            <span
              className={cn(
                "w-2 h-2 rounded-full",
                HEALTH_BARS[health.status],
                health.status === "at_risk" ? "animate-pulse" : ""
              )}
            />
            {HEALTH_LABELS[health.status]}
          </span>
        </header>

        {/* KPI row */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiTile
            label="Active pool"
            value={pipeline.activePoolSize.toString()}
            unit={`${pipeline.rejectedCount} rejected`}
            accent="primary"
          />
          <KpiTile
            label="Weekly velocity"
            value={pipeline.weeklyVelocity.toFixed(1)}
            unit="candidates / week"
            accent={pipeline.weeklyVelocity >= 2 ? "secondary" : "neutral"}
          />
          <KpiTile
            label="This week"
            value={String(health.candidatesThisWeek).padStart(2, "0")}
            unit={`${health.feedbackThisWeek} feedback · ${health.rankingChangesThisWeek} rank Δ`}
          />
          <KpiTile
            label="Avg score"
            value={
              health.avgOverallScore != null
                ? `${health.avgOverallScore.toFixed(1)} / 10`
                : "—"
            }
            unit={`${health.totalCandidates} candidates total`}
            accent={
              health.avgOverallScore != null && health.avgOverallScore >= 6
                ? "secondary"
                : "neutral"
            }
          />
        </section>

        {/* Health alerts */}
        {health.alerts.length > 0 && (
          <section className="space-y-2">
            <h2 className="font-mono-label text-mono-label text-outline uppercase tracking-widest flex items-center gap-2">
              <span className="material-symbols-outlined text-[14px]">notification_important</span>
              Health alerts · {health.alerts.length}
            </h2>
            <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {health.alerts.map((alert) => (
                <li
                  key={alert.code}
                  className={cn(
                    "border-l-2 px-3 py-2 bg-surface-container-low",
                    alert.severity === "critical"
                      ? "border-l-error/80"
                      : "border-l-tertiary/80"
                  )}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span
                      className={cn(
                        "font-mono-label text-mono-label uppercase tracking-widest",
                        alert.severity === "critical"
                          ? "text-error"
                          : "text-tertiary"
                      )}
                    >
                      {alert.label}
                    </span>
                    <span
                      className={cn(
                        "font-mono-label text-mono-label uppercase tracking-wider",
                        alert.severity === "critical" ? "text-error" : "text-tertiary"
                      )}
                    >
                      {alert.severity}
                    </span>
                  </div>
                  <p className="text-body-main text-on-surface-variant mt-1">
                    {alert.detail}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Funnel */}
        <FunnelSection
          funnel={pipeline.funnel}
          activePoolSize={pipeline.activePoolSize}
          submissionToHire={pipeline.submissionToHire}
        />

        {/* Source performance */}
        <SourceSection breakdown={pipeline.sourceBreakdown} total={health.totalCandidates} />
      </div>
    </div>
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
  accent?: "primary" | "secondary" | "neutral";
}) {
  const valueColor =
    accent === "primary"
      ? "text-primary"
      : accent === "secondary"
        ? "text-secondary-fixed-dim"
        : "text-on-surface";
  return (
    <div className="bg-surface-container-low border border-outline-variant p-3 flex flex-col justify-between min-h-[96px]">
      <span className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
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

function FunnelSection({
  funnel,
  activePoolSize,
  submissionToHire,
}: {
  funnel: FunnelEntry[];
  activePoolSize: number;
  submissionToHire: number | null;
}) {
  const maxCount = funnel.reduce((m, e) => Math.max(m, e.count), 1);

  return (
    <section className="bg-surface-container-low border border-outline-variant p-5 space-y-4">
      <header className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="font-mono-label text-mono-label text-primary uppercase tracking-widest flex items-center gap-2">
          <span className="material-symbols-outlined text-[14px]">filter_alt</span>
          Pipeline Funnel
        </h2>
        <div className="flex items-center gap-3 font-mono-label text-mono-label text-outline uppercase tracking-wider">
          <span>{activePoolSize} active</span>
          {submissionToHire != null && (
            <span className="text-secondary-fixed-dim">
              {(submissionToHire * 100).toFixed(0)}% submitted → hired
            </span>
          )}
        </div>
      </header>

      <ol className="space-y-2">
        {funnel.map((entry) => (
          <FunnelRow
            key={entry.stage}
            entry={entry}
            maxCount={maxCount}
          />
        ))}
      </ol>
    </section>
  );
}

function FunnelRow({
  entry,
  maxCount,
}: {
  entry: FunnelEntry;
  maxCount: number;
}) {
  const isRejected = entry.stage === "rejected";
  const widthPct = entry.count > 0 ? (entry.count / maxCount) * 100 : 0;
  const conversionPct =
    entry.conversionFromPrev != null
      ? Math.round(entry.conversionFromPrev * 100)
      : null;
  return (
    <li className="grid grid-cols-[160px_1fr_120px] gap-3 items-center">
      <span
        className={cn(
          "font-mono-label text-mono-label uppercase tracking-widest",
          isRejected ? "text-error" : "text-on-surface"
        )}
      >
        {PIPELINE_LABELS[entry.stage as PipelineStage]}
      </span>
      <div className="relative h-8 bg-surface-container border border-outline-variant overflow-hidden">
        <div
          className={cn(
            "h-full",
            isRejected
              ? "bg-error/30"
              : entry.count > 0
                ? "bg-primary-container"
                : "bg-transparent"
          )}
          style={{ width: `${widthPct}%` }}
        />
        <span className="absolute inset-0 flex items-center px-3 font-mono-data text-mono-data text-on-surface tabular-nums">
          {entry.count}
        </span>
      </div>
      <span
        className={cn(
          "font-mono-label text-mono-label uppercase tracking-wider tabular-nums",
          conversionPct == null
            ? "text-outline"
            : conversionPct >= 50
              ? "text-secondary-fixed-dim"
              : conversionPct >= 25
                ? "text-on-surface"
                : "text-tertiary"
        )}
      >
        {conversionPct == null
          ? isRejected
            ? "off-funnel"
            : "—"
          : `${conversionPct}% conv`}
      </span>
    </li>
  );
}

function SourceSection({
  breakdown,
  total,
}: {
  breakdown: Array<{ source: string; count: number }>;
  total: number;
}) {
  if (total === 0) {
    return null;
  }
  // Use the shared chart wrapper for visual consistency with /analytics
  // and so tooltips / accessibility come for free. The 'unspecified'
  // bucket is tone-shifted so the recruiter notices the gap (encourages
  // tagging sources on upload).
  const data: MandateBarDatum[] = breakdown.map((row) => ({
    label: row.source,
    value: row.count,
    fill:
      row.source === "unspecified"
        ? "var(--color-tertiary)"
        : "var(--color-secondary-fixed-dim)",
    meta: total > 0 ? `${Math.round((row.count / total) * 100)}%` : undefined,
  }));
  return (
    <section className="bg-surface-container-low border border-outline-variant p-5 space-y-3">
      <h2 className="font-mono-label text-mono-label text-primary uppercase tracking-widest flex items-center gap-2">
        <span className="material-symbols-outlined text-[14px]">share</span>
        Source Performance
      </h2>
      <MandateHorizontalBarChart
        data={data}
        formatter={(v) => `${v} candidate${v === 1 ? "" : "s"}`}
        className="h-[200px]"
      />
    </section>
  );
}

function formatRelative(iso: string): string {
  const t = new Date(iso).getTime();
  const diffMs = Date.now() - t;
  const min = Math.round(diffMs / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hrs = Math.round(min / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toISOString().slice(0, 10);
}
