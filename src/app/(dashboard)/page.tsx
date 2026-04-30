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
import { KpiTile } from "@/components/ui/kpi-tile";
import { LiveTick } from "@/components/ui/live-tick";
import { MastHead } from "@/components/ui/mast-head";
import { StatusChip, type ChipTone } from "@/components/ui/status-chip";

type ProjectRow = {
  id: string;
  title: string;
  company_name: string;
  status: string | null;
  created_at: string | null;
};

const STATUS_CHIP: Record<string, ChipTone> = {
  active: "secondary",
  paused: "warn",
  closed: "neutral",
};

const HEALTH_CHIP: Record<HealthStatus, ChipTone> = {
  healthy: "secondary",
  stalled: "warn",
  at_risk: "danger",
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

function projectStatusChipTone(status: string | null): ChipTone {
  if (!status) return STATUS_CHIP.active;
  return STATUS_CHIP[status.toLowerCase()] ?? STATUS_CHIP.active;
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
    <div className="px-6 py-6 space-y-5 max-w-[1600px] mx-auto">
      {error && (
        <div
          role="alert"
          className="border border-error/60 bg-error/10 text-error px-4 py-3 font-mono-data text-body-main flex items-start gap-3"
        >
          <span
            className="material-symbols-outlined text-[18px] mt-0.5"
            style={{ fontVariationSettings: "'FILL' 1" }}
            aria-hidden
          >
            error
          </span>
          <span>Could not load projects: {error.message}</span>
        </div>
      )}

      <PortfolioHeader metrics={metrics} />

      <PortfolioKpiRow metrics={metrics} />

      {metrics.attentionList.length > 0 && (
        <AttentionPanel attentionList={metrics.attentionList} />
      )}

      <section className="space-y-3">
        <MastHead
          tone="primary"
          icon="leaderboard"
          label={
            <span className="flex items-center gap-2">
              <span>Active Mandates</span>
              <span className="px-1.5 py-0.5 border border-outline-variant text-outline tabular-nums">
                N={String(metrics.totalProjects).padStart(2, "0")}
              </span>
            </span>
          }
          meta={
            <span className="flex items-center gap-3">
              <span>Sort: Newest</span>
              <Link
                href="/projects/new"
                prefetch={false}
                className="bg-primary-container text-on-primary-container px-3 py-1.5 font-mono-label text-mono-label uppercase tracking-widest hover:brightness-110 active:scale-[0.98] transition-[filter,transform] flex items-center gap-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                <span
                  className="material-symbols-outlined text-[14px]"
                  aria-hidden
                >
                  add
                </span>
                New Search
              </Link>
            </span>
          }
        />

        {projects.length === 0 ? (
          <EmptyState />
        ) : (
          <ProjectsTable projects={projects} attentionList={metrics.attentionList} />
        )}
      </section>
    </div>
  );
}

function PortfolioHeader({ metrics }: { metrics: PortfolioMetrics }) {
  return (
    <header className="flex items-end justify-between gap-4 flex-wrap">
      <div>
        <div className="font-mono-label text-mono-label text-outline uppercase tracking-widest mb-1">
          Workspace // Portfolio
        </div>
        <h1 className="font-h1 text-h1 text-on-surface tracking-tight">
          PORTFOLIO COMMAND
        </h1>
        <p className="font-mono-label text-mono-label text-on-surface-variant uppercase tracking-widest mt-1.5 tabular-nums">
          {String(metrics.activeProjects).padStart(2, "0")} active ·{" "}
          {String(metrics.totalCandidates).padStart(2, "0")} candidates ·{" "}
          {metrics.attentionList.length === 0
            ? "All searches healthy"
            : `${String(metrics.attentionList.length).padStart(2, "0")} need attention`}
        </p>
      </div>
      <LiveTick nowOnServer label="Snapshot" />
    </header>
  );
}

function PortfolioKpiRow({ metrics }: { metrics: PortfolioMetrics }) {
  const attentionCount = metrics.attentionList.length;
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <KpiTile
        label="Active Searches"
        value={metrics.activeProjects.toString().padStart(2, "0")}
        unit={`${metrics.totalProjects} total`}
        accent="primary"
      />
      <KpiTile
        label="Total Candidates"
        value={metrics.totalCandidates.toString().padStart(2, "0")}
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
        accent="neutral"
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

function AttentionPanel({
  attentionList,
}: {
  attentionList: PortfolioMetrics["attentionList"];
}) {
  return (
    <section className="bg-surface-container-low border border-outline-variant">
      <header className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-outline-variant bg-surface-container">
        <h2 className="font-mono-label text-mono-label text-tertiary uppercase tracking-widest flex items-center gap-2">
          <span
            className="material-symbols-outlined text-[14px]"
            style={{ fontVariationSettings: "'FILL' 1" }}
            aria-hidden
          >
            notification_important
          </span>
          Searches Needing Attention
        </h2>
        <span className="font-mono-label text-mono-label text-outline uppercase tracking-wider tabular-nums">
          {String(attentionList.length).padStart(2, "0")} flagged
        </span>
      </header>
      <ul className="divide-y divide-outline-variant/40">
        {attentionList.map((row) => (
          <li key={row.projectId}>
            <Link
              href={`/projects/${row.projectId}/metrics`}
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
              <div className="hidden md:flex flex-wrap gap-1.5 shrink-0 max-w-[60%] justify-end">
                {row.alerts.slice(0, 4).map((a) => (
                  <AlertChip key={a.code} alert={a} />
                ))}
                {row.alerts.length > 4 && (
                  <span className="px-2 py-0.5 border border-outline-variant text-outline font-mono-label text-mono-label uppercase tracking-wider tabular-nums">
                    +{row.alerts.length - 4}
                  </span>
                )}
              </div>
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
  );
}

function AlertChip({ alert }: { alert: HealthAlert }) {
  const tone: ChipTone = alert.severity === "critical" ? "danger" : "warn";
  // The full alert detail used to be in a `title` attribute (hover-only,
  // fails touch and keyboard). We surface the short label visually and
  // keep the detail accessible via the project's Metrics page where it
  // belongs in long form.
  return (
    <StatusChip tone={tone} intensity="soft">
      <span className="sr-only">
        {alert.severity === "critical" ? "Critical: " : "Warning: "}
      </span>
      {ALERT_LABELS[alert.code]}
    </StatusChip>
  );
}

function EmptyState() {
  return (
    <div className="flex items-center justify-center min-h-[420px] bg-surface-container-low border border-outline-variant relative overflow-hidden">
      <div
        className="absolute inset-0 terminal-grid opacity-10 pointer-events-none"
        aria-hidden
      />
      <div className="text-center max-w-md p-8 relative z-10">
        <div className="inline-flex items-center justify-center w-16 h-16 border border-outline-variant bg-surface-container mb-6">
          <span
            className="material-symbols-outlined text-outline text-3xl"
            aria-hidden
          >
            radar
          </span>
        </div>
        <h2 className="font-h2 text-h2 text-on-surface mb-3">
          No active mandates yet.
        </h2>
        <p className="text-on-surface-variant text-body-main mb-6">
          Initialize a search to deploy the agent stack.
        </p>
        <Link
          href="/projects/new"
          className="bg-primary-container text-on-primary-container px-4 py-2 font-mono-label text-mono-label uppercase tracking-widest hover:brightness-110 active:scale-[0.98] transition-[filter,transform] inline-flex items-center gap-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <span
            className="material-symbols-outlined text-[18px]"
            aria-hidden
          >
            add
          </span>
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
    <div className="bg-surface-container-low border border-outline-variant overflow-hidden">
      <div className="overflow-auto">
        <table className="w-full text-left border-collapse">
          <caption className="sr-only">
            All mandates ordered by creation date (newest first).
          </caption>
          <thead className="bg-surface-container border-b border-outline-variant">
            <tr className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
              <th scope="col" className="px-4 py-2 w-12 tabular-nums">
                #
              </th>
              <th scope="col" className="px-4 py-2">
                Title / Company
              </th>
              <th scope="col" className="px-4 py-2 w-28">
                Status
              </th>
              <th scope="col" className="px-4 py-2 w-32">
                Health
              </th>
              <th scope="col" className="px-4 py-2 w-28 tabular-nums">
                Created
              </th>
              <th scope="col" className="px-4 py-2 w-12 text-right">
                <span className="sr-only">Open</span>
              </th>
            </tr>
          </thead>
          <tbody className="font-mono-data">
            {projects.map((p, i) => {
              const status = (p.status ?? "active").toLowerCase();
              const health = healthByProject.get(p.id);
              const healthStatus: HealthStatus = health?.status ?? "healthy";
              return (
                <tr
                  key={p.id}
                  className="border-b border-outline-variant/40 last:border-b-0 hover:bg-surface-container/40 focus-within:bg-surface-container/40 transition-colors group"
                >
                  <td className="px-4 py-3 text-primary font-bold tabular-nums">
                    {(i + 1).toString().padStart(2, "0")}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/projects/${p.id}`}
                      prefetch={false}
                      className="block hover:text-primary transition-colors focus-visible:outline-none focus-visible:text-primary"
                    >
                      <div className="text-on-surface font-bold uppercase truncate">
                        {p.title}
                      </div>
                      <div className="text-mono-label font-mono-label text-outline uppercase tracking-wider mt-0.5 truncate">
                        {p.company_name}
                      </div>
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <StatusChip
                      tone={projectStatusChipTone(p.status)}
                      intensity="soft"
                    >
                      {status}
                    </StatusChip>
                  </td>
                  <td className="px-4 py-3">
                    <StatusChip
                      tone={HEALTH_CHIP[healthStatus]}
                      dot
                      pulse={healthStatus === "at_risk"}
                    >
                      {HEALTH_LABELS[healthStatus]}
                    </StatusChip>
                  </td>
                  <td className="px-4 py-3 text-on-surface-variant text-mono-label font-mono-label tabular-nums">
                    {formatDate(p.created_at)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/projects/${p.id}`}
                      aria-label={`Open ${p.title}`}
                      prefetch={false}
                      className="inline-flex items-center justify-center w-8 h-8 text-outline opacity-60 group-hover:opacity-100 hover:text-primary transition-[opacity,color] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary focus-visible:opacity-100"
                    >
                      <span
                        className="material-symbols-outlined text-[18px]"
                        aria-hidden
                      >
                        chevron_right
                      </span>
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

