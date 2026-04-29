import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { computePortfolioMetrics } from "@/lib/metrics/portfolio";
import {
  ALERT_LABELS,
  HEALTH_LABELS,
  type HealthAlert,
  type HealthStatus,
  type PortfolioMetrics,
} from "@/lib/metrics/types";
import { cn } from "@/lib/utils";

type ProjectRow = {
  id: string;
  title: string;
  company_name: string;
  status: string | null;
  created_at: string | null;
};

const STATUS_TONE: Record<string, string> = {
  active: "bg-secondary/10 text-secondary border-secondary/30",
  paused: "bg-tertiary/10 text-tertiary border-tertiary/30",
  closed: "bg-outline/10 text-outline border-outline-variant",
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

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value)
    .toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "2-digit",
    })
    .toUpperCase();
}

function projectStatusTone(status: string | null) {
  if (!status) return STATUS_TONE.active;
  return STATUS_TONE[status.toLowerCase()] ?? STATUS_TONE.active;
}

export default async function DashboardHomePage() {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("projects")
    .select("id, title, company_name, status, created_at")
    .order("created_at", { ascending: false });

  const projects: ProjectRow[] = data ?? [];

  // Portfolio metrics fan out to per-project health computations. The
  // fan-out is fine for tens of projects per org; if a single org grows
  // to hundreds we'll want a server-side rollup RPC.
  const metrics = await computePortfolioMetrics();

  return (
    <div className="p-4 grid grid-cols-12 gap-4">
      {error && (
        <div className="col-span-12 border border-error/40 bg-error-container/30 text-error px-4 py-3 rounded text-body-main">
          Could not load projects: {error.message}
        </div>
      )}

      <PortfolioKpiRow metrics={metrics} />

      {metrics.attentionList.length > 0 && (
        <AttentionPanel attentionList={metrics.attentionList} />
      )}

      <div className="col-span-12 flex justify-between items-center pt-2">
        <div className="flex items-center gap-3">
          <h2 className="font-h2 text-h2 text-on-surface flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">leaderboard</span>
            ACTIVE_MANDATES
          </h2>
          <span className="px-2 py-0.5 border border-outline-variant font-mono-label text-mono-label text-outline tracking-wider">
            N={metrics.totalProjects}
          </span>
        </div>
        <Link
          href="/projects/new"
          className="bg-primary-container text-on-primary-container px-4 py-2 rounded font-mono-label text-mono-label uppercase tracking-wider hover:brightness-110 active:scale-[0.98] transition-all flex items-center gap-2"
        >
          <span className="material-symbols-outlined text-[18px]">add</span>
          New Search
        </Link>
      </div>

      {projects.length === 0 ? (
        <EmptyState />
      ) : (
        <ProjectsTable projects={projects} attentionList={metrics.attentionList} />
      )}
    </div>
  );
}

function PortfolioKpiRow({ metrics }: { metrics: PortfolioMetrics }) {
  const attentionCount = metrics.attentionList.length;
  return (
    <div className="col-span-12 grid grid-cols-1 md:grid-cols-4 gap-4">
      <KpiTile
        label="Active Searches"
        value={metrics.activeProjects.toString().padStart(2, "0")}
        unit={`${metrics.totalProjects} total`}
        accent="primary"
      />
      <KpiTile
        label="Total Candidates"
        value={metrics.totalCandidates.toString().padStart(2, "0")}
        unit={`+${metrics.totalCandidatesThisWeek} this week`}
        accent="secondary"
      />
      <KpiTile
        label="Avg Velocity"
        value={metrics.averageWeeklyVelocity.toFixed(1)}
        unit="cand / week / search"
      />
      <KpiTile
        label="Needs Attention"
        value={attentionCount.toString().padStart(2, "0")}
        unit={
          attentionCount === 0
            ? "All healthy"
            : `${metrics.totalFeedbackThisWeek} feedback 7d`
        }
        accent={attentionCount > 0 ? "warn" : "secondary"}
      />
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
  const accentBar =
    accent === "primary"
      ? "bg-primary"
      : accent === "secondary"
        ? "bg-secondary-fixed-dim"
        : accent === "warn"
          ? "bg-tertiary"
          : "bg-outline-variant";
  return (
    <div className="bg-surface-container-low border border-outline-variant p-3 flex flex-col justify-between min-h-[96px] rounded relative overflow-hidden">
      {/* Left-edge accent — terminal/instrumentation feel without
          adding chart-like noise to the tile. */}
      <div className={cn("absolute left-0 top-0 bottom-0 w-0.5", accentBar)} />
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

function AttentionPanel({
  attentionList,
}: {
  attentionList: PortfolioMetrics["attentionList"];
}) {
  return (
    <section className="col-span-12 bg-surface-container-low border border-outline-variant rounded">
      <header className="flex items-center justify-between gap-2 p-3 border-b border-outline-variant bg-surface-container">
        <h3 className="font-mono-label text-mono-label text-tertiary uppercase tracking-widest flex items-center gap-2">
          <span className="material-symbols-outlined text-[14px]">notification_important</span>
          Searches Needing Attention
        </h3>
        <span className="font-mono-label text-mono-label text-outline uppercase tracking-wider">
          {attentionList.length} flagged
        </span>
      </header>
      <ul className="divide-y divide-outline-variant/40">
        {attentionList.map((row) => (
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
              <div className="hidden md:flex flex-wrap gap-1.5 shrink-0">
                {row.alerts.slice(0, 4).map((a) => (
                  <AlertChip key={a.code} alert={a} />
                ))}
              </div>
              <span className="material-symbols-outlined text-[18px] text-outline group-hover:text-primary transition-colors">
                chevron_right
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function AlertChip({ alert }: { alert: HealthAlert }) {
  const tone =
    alert.severity === "critical"
      ? "border-error/60 text-error"
      : "border-tertiary/60 text-tertiary";
  return (
    <span
      title={alert.detail}
      className={cn(
        "px-2 py-0.5 border font-mono-label text-mono-label uppercase tracking-wider",
        tone
      )}
    >
      {ALERT_LABELS[alert.code]}
    </span>
  );
}

function EmptyState() {
  return (
    <div className="col-span-12 flex items-center justify-center min-h-[420px] bg-surface-container-low border border-outline-variant rounded relative overflow-hidden">
      <div className="absolute inset-0 terminal-grid opacity-10 pointer-events-none" />
      <div className="text-center max-w-md p-8 relative z-10">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded border border-outline-variant bg-surface-container mb-6">
          <span className="material-symbols-outlined text-outline text-3xl">
            radar
          </span>
        </div>
        <h3 className="font-h2 text-h2 text-on-surface mb-3">
          No active mandates yet.
        </h3>
        <p className="text-on-surface-variant font-body-main mb-6">
          Initialize a search to deploy the agent stack.
        </p>
        <Link
          href="/projects/new"
          className="bg-primary-container text-on-primary-container px-4 py-2 rounded font-mono-label text-mono-label uppercase tracking-wider hover:brightness-110 active:scale-[0.98] transition-all inline-flex items-center gap-2"
        >
          <span className="material-symbols-outlined text-[18px]">add</span>
          New Search
        </Link>
      </div>
    </div>
  );
}

function ProjectsTable({
  projects,
  attentionList,
}: {
  projects: ProjectRow[];
  attentionList: PortfolioMetrics["attentionList"];
}) {
  const healthByProject = new Map(
    attentionList.map((row) => [
      row.projectId,
      { status: row.status, alerts: row.alerts },
    ])
  );
  return (
    <div className="col-span-12 bg-surface-container-low border border-outline-variant rounded overflow-hidden">
      <div className="p-3 border-b border-outline-variant flex justify-between items-center bg-surface-container">
        <h3 className="font-mono-label text-mono-label text-outline uppercase tracking-wider">
          MANDATE_PIPELINE
        </h3>
        <span className="px-2 py-0.5 border border-outline-variant font-mono-label text-mono-label text-outline tracking-wider">
          SORT: NEWEST
        </span>
      </div>
      <div className="overflow-auto">
        <table className="w-full text-left border-collapse">
          <thead className="bg-surface-container-high">
            <tr className="font-mono-label text-mono-label text-outline border-b border-outline-variant uppercase tracking-wider">
              <th className="p-3 w-12">#</th>
              <th className="p-3">TITLE / COMPANY</th>
              <th className="p-3 w-32">STATUS</th>
              <th className="p-3 w-32">HEALTH</th>
              <th className="p-3 w-28">CREATED</th>
              <th className="p-3 w-16 text-right">ACTION</th>
            </tr>
          </thead>
          <tbody className="font-mono-data">
            {projects.map((p, i) => {
              const status = (p.status ?? "active").toLowerCase();
              const health = healthByProject.get(p.id);
              return (
                <tr
                  key={p.id}
                  className="border-b border-outline-variant/40 hover:bg-surface-container/40 transition-colors group"
                >
                  <td className="p-3 text-primary font-bold">
                    {(i + 1).toString().padStart(2, "0")}
                  </td>
                  <td className="p-3">
                    <Link
                      href={`/projects/${p.id}`}
                      className="block hover:text-primary transition-colors"
                    >
                      <div className="text-on-surface font-bold uppercase">
                        {p.title}
                      </div>
                      <div className="text-mono-label text-outline mt-0.5">
                        {p.company_name}
                      </div>
                    </Link>
                  </td>
                  <td className="p-3">
                    <span
                      className={cn(
                        "px-1.5 py-0.5 text-[9px] uppercase font-bold border",
                        projectStatusTone(p.status)
                      )}
                    >
                      {status}
                    </span>
                  </td>
                  <td className="p-3">
                    {health ? (
                      <span
                        className={cn(
                          "px-2 py-0.5 border font-mono-label text-mono-label uppercase tracking-wider flex items-center gap-1.5 w-fit",
                          HEALTH_TONE[health.status]
                        )}
                      >
                        <span
                          className={cn(
                            "w-1.5 h-1.5 rounded-full",
                            HEALTH_DOT[health.status],
                            health.status === "at_risk" ? "animate-pulse" : ""
                          )}
                        />
                        {HEALTH_LABELS[health.status]}
                      </span>
                    ) : (
                      <span className="font-mono-label text-mono-label text-secondary-fixed-dim uppercase tracking-wider flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-secondary-fixed-dim" />
                        {HEALTH_LABELS.healthy}
                      </span>
                    )}
                  </td>
                  <td className="p-3 text-on-surface-variant text-mono-label">
                    {formatDate(p.created_at)}
                  </td>
                  <td className="p-3 text-right">
                    <Link
                      href={`/projects/${p.id}`}
                      aria-label={`Open ${p.title}`}
                      className="opacity-0 group-hover:opacity-100 material-symbols-outlined text-outline hover:text-primary transition-opacity"
                    >
                      open_in_new
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
