import { Suspense } from "react";
import Link from "next/link";
import { cookies } from "next/headers";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { computePortfolioMetrics } from "@/lib/metrics/portfolio";
import {
  HEALTH_LABELS,
  type HealthAlert,
  type HealthStatus,
  type PortfolioMetrics,
} from "@/lib/metrics/types";
import { SetBreadcrumbs } from "@/components/dashboard/breadcrumbs";
import { SkeletonCard } from "@/components/ui/skeleton";
import { ActionQueuePanel } from "./action-queue-panel";
import { SampleBanner } from "@/components/sample/sample-banner";
import { IconArrowRight, IconCopilot, IconInfo } from "@/components/icons";
import { PageShell } from "@/components/ui/page-shell";
import {
  HEALTH_LABEL as SAMPLE_HEALTH_LABEL,
  SAMPLE_AGENT_RUNS,
  SAMPLE_DISMISSED_COOKIE,
  SAMPLE_KPIS,
  SAMPLE_MANDATES,
  SAMPLE_NEXT_ACTION,
  SAMPLE_PRIORITIES,
  shouldShowSample,
  type SampleHealth,
} from "@/lib/sample";

/**
 * The portfolio dashboard.
 *
 * Reading order is the design: what needs me, what changed, what is at
 * risk, what to do next — top-left to bottom-right. "Needs you today"
 * is the only list carrying buttons; everything else is reference.
 *
 * Two deviations from the comp, both because the data is not there:
 *
 * - The comp's second KPI is "AWAITING YOUR REVIEW — candidates parsed
 *   and scored". Nothing tracks reviewed-vs-unreviewed, so that tile
 *   would be a guess. It shows total candidates instead, labelled as
 *   what it is.
 * - Agent activity and Next best action need an `agent_runs` table and
 *   a generator, neither of which exists. They appear in the sample so
 *   a new user can see where the product is going, and are simply
 *   absent from a real workspace rather than rendered empty or faked.
 *
 * Health is a dot plus a word. No gauges, no arrows, no green-to-red
 * ramp — the same rule the marketing surface follows for anything
 * describing a person or their search.
 */

type ProjectRow = {
  id: string;
  title: string;
  company_name: string;
  status: string | null;
  created_at: string | null;
};

export const metadata = { title: "Portfolio" };

export default async function DashboardHomePage() {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("projects")
    .select("id, title, company_name, status, created_at")
    .order("created_at", { ascending: false });

  const projects: ProjectRow[] = data ?? [];
  const dismissed =
    (await cookies()).get(SAMPLE_DISMISSED_COOKIE)?.value === "1";
  const showSample = shouldShowSample({
    hasRealData: projects.length > 0,
    dismissed,
  });

  // Only fan out over per-project health when there are projects.
  const metrics = projects.length > 0 ? await computePortfolioMetrics() : null;

  return (
    <PageShell>
      <SetBreadcrumbs crumbs={[{ label: "Portfolio" }]} />

      <PageHeader
        subtitle={
          showSample
            ? "An example portfolio — this is what Mandate looks like in use."
            : summarise(projects.length, metrics)
        }
      />

      {/* What needs doing, before the portfolio metrics. The rest of this page
          answers "how are my searches doing"; this answers "what do I do now",
          and only one of those gets acted on before lunch. Suspended so a slow
          aggregate never delays the portfolio itself. Hidden in sample mode —
          a demo portfolio has no real obligations to chase. */}
      {!showSample && (
        <div className="mb-6">
          <Suspense fallback={<SkeletonCard />}>
            <ActionQueuePanel />
          </Suspense>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="mt-5 rounded-xl border border-error/60 bg-error/10 px-4 py-3 text-sm text-error"
        >
          Could not load mandates: {error.message}
        </div>
      )}

      {showSample && (
        <div className="mt-5">
          <SampleBanner scope="dashboard" />
        </div>
      )}

      <div className="mt-5">
        {showSample ? <SampleKpis /> : <RealKpis metrics={metrics} />}
      </div>

      <div
        className={
          showSample
            ? "mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_356px]"
            : "mt-5 grid gap-5"
        }
      >
        <div className="flex min-w-0 flex-col gap-5">
          {showSample ? (
            <SamplePriorities />
          ) : (
            metrics && metrics.attentionList.length > 0 && (
              <RealPriorities attentionList={metrics.attentionList} />
            )
          )}

          <MandatesPanel
            showSample={showSample}
            projects={projects}
            metrics={metrics}
          />
        </div>

        {showSample && (
          <div className="flex flex-col gap-5">
            <AgentActivity />
            <NextBestAction />
          </div>
        )}
      </div>
    </PageShell>
  );
}

function summarise(count: number, metrics: PortfolioMetrics | null): string {
  if (count === 0) return "No mandates yet.";
  const risk = metrics?.attentionList.length ?? 0;
  const noun = count === 1 ? "mandate" : "mandates";
  return risk > 0
    ? `${count} active ${noun} · ${risk} need attention`
    : `${count} active ${noun} · all on track`;
}

function PageHeader({ subtitle }: { subtitle: string }) {
  return (
    <div className="flex flex-wrap items-start gap-4">
      <div className="min-w-0 flex-1">
        <h1 className="text-[28px] font-bold leading-tight tracking-tight text-on-surface">
          Portfolio
        </h1>
        <p className="mt-1.5 text-sm text-on-surface-variant">{subtitle}</p>
      </div>
      <Link
        href="/app/projects/new"
        className="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border border-primary bg-primary px-4 text-sm font-semibold text-on-primary transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        New mandate
        <IconArrowRight size={15} />
      </Link>
    </div>
  );
}

// ── KPIs ────────────────────────────────────────────────────────────

function Kpi({
  label,
  value,
  meta,
  critical,
}: {
  label: string;
  value: string;
  meta: string;
  critical?: boolean;
}) {
  return (
    <div
      className={`flex flex-col gap-2.5 rounded-xl border p-[18px] ${
        critical
          ? "border-error/60 bg-surface-container-low"
          : "border-outline-variant bg-surface-container-low"
      }`}
    >
      <p
        className={`font-mono-label text-[10px] font-bold uppercase tracking-[0.12em] ${
          critical ? "text-error" : "text-outline"
        }`}
      >
        {label}
      </p>
      <p
        className={`font-heading text-[34px] leading-none tabular-nums ${
          critical ? "text-error" : "text-on-surface"
        }`}
      >
        {value}
      </p>
      <p className="text-xs text-outline">{meta}</p>
    </div>
  );
}

function KpiRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-3.5 xl:grid-cols-4">{children}</div>
  );
}

function SampleKpis() {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    <KpiRow>
      <Kpi
        label="Active mandates"
        value={pad(SAMPLE_KPIS.activeMandates)}
        meta="2 opened this month"
      />
      <Kpi
        label="Candidates"
        value={String(SAMPLE_MANDATES.reduce((n, m) => n + m.candidates, 0))}
        meta="across all mandates"
      />
      <Kpi
        label="Slates with client"
        value={pad(SAMPLE_KPIS.withClient)}
        meta="oldest sent 6 days ago"
      />
      <Kpi
        label="At risk"
        value={pad(SAMPLE_KPIS.atRisk)}
        meta="flagged by Search Health"
        critical
      />
    </KpiRow>
  );
}

function RealKpis({ metrics }: { metrics: PortfolioMetrics | null }) {
  const pad = (n: number) => String(n).padStart(2, "0");
  const atRisk = metrics?.attentionList.length ?? 0;
  return (
    <KpiRow>
      <Kpi
        label="Active mandates"
        value={pad(metrics?.activeProjects ?? 0)}
        meta={`${metrics?.totalProjects ?? 0} in total`}
      />
      {/* Not "awaiting your review" — nothing records whether a
          candidate has been looked at. */}
      <Kpi
        label="Candidates"
        value={String(metrics?.totalCandidates ?? 0)}
        meta="across all mandates"
      />
      <Kpi
        label="Added this week"
        value={String(metrics?.totalCandidatesThisWeek ?? 0)}
        meta={`${metrics?.totalFeedbackThisWeek ?? 0} feedback entries`}
      />
      <Kpi
        label="At risk"
        value={pad(atRisk)}
        meta={atRisk === 0 ? "nothing flagged" : "flagged by Search Health"}
        critical={atRisk > 0}
      />
    </KpiRow>
  );
}

// ── Panels ──────────────────────────────────────────────────────────

function Panel({
  title,
  meta,
  action,
  children,
  accent,
}: {
  title: string;
  meta?: React.ReactNode;
  action?: { label: string; href: string };
  children: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <section
      className={`overflow-hidden rounded-xl border bg-surface-container-low ${
        accent ? "border-primary" : "border-outline-variant"
      }`}
    >
      <div className="flex items-center gap-2.5 border-b border-outline-variant px-[18px] py-[15px]">
        <h2 className="text-sm font-semibold text-on-surface">{title}</h2>
        {meta}
        {action && (
          <Link
            href={action.href}
            className="ml-auto text-xs font-medium text-primary hover:underline"
          >
            {action.label}
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

/** Severity is a dot AND a position in the list, never colour alone. */
function SeverityDot({ tone }: { tone: "urgent" | "attention" | "routine" }) {
  return (
    <span
      aria-hidden
      className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${
        tone === "urgent"
          ? "bg-error"
          : tone === "attention"
            ? "bg-primary"
            : "bg-outline"
      }`}
    />
  );
}

function PriorityRow({
  tone,
  title,
  detail,
  action,
  href,
}: {
  tone: "urgent" | "attention" | "routine";
  title: string;
  detail: string;
  action: string;
  href: string;
}) {
  return (
    <li className="flex items-start gap-3.5 border-b border-outline-variant/50 px-[18px] py-[15px] last:border-0">
      <SeverityDot tone={tone} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium leading-snug text-on-surface">
          {title}
        </p>
        <p className="mt-0.5 text-xs leading-snug text-outline">{detail}</p>
      </div>
      <Link
        href={href}
        className="inline-flex h-8 shrink-0 items-center rounded-lg border border-outline-variant bg-surface-container px-3 text-xs font-medium text-on-surface-variant transition-colors hover:text-on-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
      >
        {action}
      </Link>
    </li>
  );
}

function SamplePriorities() {
  return (
    <Panel
      title="Needs you today"
      meta={
        <span className="font-mono-label text-[11px] text-outline">
          {SAMPLE_PRIORITIES.length} ITEMS
        </span>
      }
    >
      <ul>
        {SAMPLE_PRIORITIES.map((p) => (
          <PriorityRow
            key={p.id}
            tone={p.severity}
            title={p.title}
            detail={p.detail}
            action={p.action}
            href={p.href}
          />
        ))}
      </ul>
    </Panel>
  );
}

function RealPriorities({
  attentionList,
}: {
  attentionList: PortfolioMetrics["attentionList"];
}) {
  return (
    <Panel
      title="Needs you today"
      meta={
        <span className="font-mono-label text-[11px] text-outline">
          {attentionList.length}{" "}
          {attentionList.length === 1 ? "ITEM" : "ITEMS"}
        </span>
      }
    >
      <ul>
        {attentionList.map((a) => {
          const worst: HealthAlert | undefined =
            a.alerts.find((x) => x.severity === "critical") ?? a.alerts[0];
          return (
            <PriorityRow
              key={a.projectId}
              tone={worst?.severity === "critical" ? "urgent" : "attention"}
              title={worst ? worst.label : HEALTH_LABELS[a.status]}
              detail={`${a.title} · ${a.companyName}${worst?.detail ? ` · ${worst.detail}` : ""}`}
              action="Open"
              href={`/app/projects/${a.projectId}`}
            />
          );
        })}
      </ul>
    </Panel>
  );
}

function HealthCell({ status }: { status: HealthStatus | SampleHealth }) {
  const bad =
    status === "at_risk" ||
    status === "blocked" ||
    status === "stalled" ||
    status === "stalling";
  const label =
    status in HEALTH_LABELS
      ? HEALTH_LABELS[status as HealthStatus]
      : SAMPLE_HEALTH_LABEL[status as SampleHealth];
  return (
    <span
      className={`inline-flex items-center gap-2 text-xs ${
        bad ? "text-error" : "text-on-surface-variant"
      }`}
    >
      <span
        aria-hidden
        className={`h-[7px] w-[7px] shrink-0 rounded-full ${bad ? "bg-error" : "bg-outline"}`}
      />
      {label}
    </span>
  );
}

function MandatesPanel({
  showSample,
  projects,
  metrics,
}: {
  showSample: boolean;
  projects: ProjectRow[];
  metrics: PortfolioMetrics | null;
}) {
  const healthByProject = new Map(
    metrics?.attentionList.map((a) => [a.projectId, a.status]) ?? []
  );

  return (
    <Panel
      title="Active mandates"
      action={{ label: "View all", href: "/app/projects" }}
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse tabular-nums">
          <caption className="sr-only">
            {showSample
              ? "Example mandates with stage, candidate counts and health."
              : "Your mandates with stage and health."}
          </caption>
          <thead>
            <tr>
              {(showSample
                ? ["Mandate", "Stage", "Cands", "Tier 1", "Day", "Health"]
                : ["Mandate", "Status", "Health"]
              ).map((h) => (
                <th
                  key={h}
                  scope="col"
                  className="border-b border-outline-variant/60 px-[18px] py-3 text-left font-mono-label text-[10px] font-bold uppercase tracking-[0.1em] text-outline"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {showSample
              ? SAMPLE_MANDATES.slice(0, 5).map((m) => (
                  <tr
                    key={m.id}
                    className="border-b border-outline-variant/40 last:border-0"
                  >
                    <td className="px-[18px] py-3">
                      <Link href={`/app/projects/${m.id}`} className="block rounded">
                        <span className="block text-[13px] font-medium text-on-surface">
                          {m.title}
                        </span>
                        <span className="block text-xs text-outline">
                          {m.company}
                        </span>
                      </Link>
                    </td>
                    <td className="px-3 py-3">
                      <span className="rounded-md bg-surface-container-high px-2 py-1 font-mono-label text-[10px] font-semibold uppercase tracking-[0.08em] text-on-surface-variant">
                        {m.stage}
                      </span>
                    </td>
                    <td className="px-3 py-3 font-mono-data text-[13px] text-on-surface">
                      {String(m.candidates).padStart(2, "0")}
                    </td>
                    <td className="px-3 py-3 font-mono-data text-[13px] text-on-surface">
                      {m.tierOne === null ? (
                        <span className="text-outline">—</span>
                      ) : (
                        String(m.tierOne).padStart(2, "0")
                      )}
                    </td>
                    <td className="px-3 py-3 font-mono-data text-[13px] text-on-surface-variant">
                      {m.dayOfSearch}
                    </td>
                    <td className="px-[18px] py-3">
                      <HealthCell status={m.health} />
                    </td>
                  </tr>
                ))
              : projects.slice(0, 8).map((p) => (
                  <tr
                    key={p.id}
                    className="border-b border-outline-variant/40 last:border-0"
                  >
                    <td className="px-[18px] py-3">
                      <Link href={`/app/projects/${p.id}`} className="block rounded">
                        <span className="block text-[13px] font-medium text-on-surface">
                          {p.title}
                        </span>
                        <span className="block text-xs text-outline">
                          {p.company_name}
                        </span>
                      </Link>
                    </td>
                    <td className="px-3 py-3">
                      <span className="rounded-md bg-surface-container-high px-2 py-1 font-mono-label text-[10px] font-semibold uppercase tracking-[0.08em] text-on-surface-variant">
                        {(p.status ?? "active").toUpperCase()}
                      </span>
                    </td>
                    <td className="px-[18px] py-3">
                      <HealthCell
                        status={healthByProject.get(p.id) ?? "healthy"}
                      />
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>

        {!showSample && projects.length === 0 && (
          <p className="px-[18px] py-8 text-center text-sm text-outline">
            No mandates yet.{" "}
            <Link href="/app/projects/new" className="text-primary hover:underline">
              Start one
            </Link>
            .
          </p>
        )}
      </div>
    </Panel>
  );
}

/**
 * Agent activity — sample only.
 *
 * Nothing persists agent invocations, so a real workspace has no rows
 * to show. Rather than render an empty shell on a live account, the
 * panel simply is not there; here it shows what the product is for.
 */
function AgentActivity() {
  const running = SAMPLE_AGENT_RUNS.filter((r) => r.state === "running").length;
  return (
    <Panel
      title="Agent activity"
      meta={
        <span className="ml-auto inline-flex items-center gap-1.5 font-mono-label text-[11px] text-outline">
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-primary" />
          {running} RUNNING
        </span>
      }
    >
      <ul className="py-1.5">
        {SAMPLE_AGENT_RUNS.map((r) => (
          <li key={r.id} className="flex gap-3 px-[18px] py-2.5">
            <span
              aria-hidden
              className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                r.state === "running"
                  ? "bg-primary"
                  : r.state === "failed"
                    ? "bg-error"
                    : "bg-outline-variant"
              }`}
            />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] leading-snug text-on-surface-variant">
                <span className="font-medium text-on-surface">{r.agent}</span>{" "}
                {r.summary}
              </p>
              <p
                className={`mt-0.5 font-mono-label text-[11px] ${
                  r.state === "failed" ? "text-error" : "text-outline"
                }`}
              >
                {r.meta}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/** Next best action — sample only, and decision support by policy. */
function NextBestAction() {
  return (
    <Panel
      accent
      title="Next best action"
      meta={<IconCopilot size={16} className="order-first text-primary" />}
    >
      <div className="flex flex-col gap-3 px-[18px] py-4">
        <p className="text-[13px] leading-relaxed text-on-surface-variant">
          {SAMPLE_NEXT_ACTION.body}
        </p>
        <Link
          href={SAMPLE_NEXT_ACTION.href}
          className="inline-flex h-9 items-center justify-center rounded-lg border border-primary bg-primary text-[13px] font-semibold text-on-primary transition-opacity hover:opacity-90"
        >
          {SAMPLE_NEXT_ACTION.actionLabel}
        </Link>
        <p className="flex items-start gap-2 text-[11px] leading-snug text-outline">
          <IconInfo size={13} className="mt-px shrink-0" />
          {SAMPLE_NEXT_ACTION.disclaimer}
        </p>
      </div>
    </Panel>
  );
}
