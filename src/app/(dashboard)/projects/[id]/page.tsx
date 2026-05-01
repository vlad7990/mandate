import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import {
  AgentTiles,
  type AgentTileAction,
  type AgentTileKey,
  type AgentTileState,
} from "@/components/projects/agent-tiles";
import {
  type CalibrationModel,
  type CompanyContext,
} from "@/lib/ai/role-analysis";
import {
  type Archetype,
  type PipelineStage,
} from "@/lib/ai/cv-parsing";
import {
  DIMENSION_KEYS,
  type DimensionKey,
} from "@/lib/ai/onboarding-analysis";
import { computeProjectHealth } from "@/lib/metrics/health";
import {
  HEALTH_LABELS,
  type HealthAlert,
  type HealthStatus,
  type ProjectHealthSummary,
} from "@/lib/metrics/types";
import { type Tier } from "@/lib/ranking/tiers";
import { normaliseRecruiterAssessment } from "@/lib/recruiter-assessment";
import { MastHead } from "@/components/ui/mast-head";
import { LiveTick } from "@/components/ui/live-tick";
import { StatusChip, type ChipTone } from "@/components/ui/status-chip";
import {
  CandidateSearchPanel,
  type SearchCandidate,
} from "./candidate-search-panel";
import { ClientIntelligencePanel } from "./client-intelligence-panel";
import { CultureIntelligencePanel } from "./culture-intelligence-panel";
import type { ClientPsychology } from "@/lib/ai/client-psychology-agent";
import type { CultureProfile } from "@/lib/ai/company-culture-agent";
import { ProjectPoller } from "./project-poller";

type RecalibrationSummary = {
  feedback_id?: string;
  summary?: string;
  applied_at?: string;
  applied_adjustments?: Array<{
    dimension: string;
    delta: number;
    reason: string;
  }>;
};

type ProjectRow = {
  id: string;
  title: string;
  company_name: string;
  one_line_input: string;
  status: string | null;
  created_at: string | null;
  calibration_model: Partial<CalibrationModel> | null;
  company_context:
    | (Partial<CompanyContext> & { culture_profile?: CultureProfile })
    | null;
  recalibration_summary: RecalibrationSummary | null;
  client_psychology: ClientPsychology | null;
};

type SpecState = {
  hasAny: boolean;
  hasFinal: boolean;
  isGenerating: boolean;
};

const HEALTH_CHIP: Record<HealthStatus, ChipTone> = {
  healthy: "secondary",
  stalled: "warn",
  at_risk: "danger",
};

function isAnalysisReady(row: ProjectRow): boolean {
  return Boolean(row.calibration_model?.role_title);
}

function hasCalibrationWeights(row: ProjectRow): boolean {
  return typeof row.calibration_model?.dimension_weights?.technical === "number";
}

function tileStates(
  row: ProjectRow,
  spec: SpecState
): Record<AgentTileKey, AgentTileState> {
  const ready = isAnalysisReady(row);
  const calibrated = hasCalibrationWeights(row);
  let role_spec: AgentTileState;
  if (spec.hasFinal) role_spec = "complete";
  else if (spec.isGenerating || spec.hasAny) role_spec = "active";
  else if (calibrated) role_spec = "active";
  else role_spec = "queued";

  return {
    intake: ready ? "complete" : "active",
    company_research: ready ? "complete" : "active",
    role_spec,
    calibration: calibrated ? "complete" : ready ? "active" : "queued",
  };
}

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("projects")
    .select(
      "id, title, company_name, one_line_input, status, created_at, calibration_model, company_context, recalibration_summary, client_psychology"
    )
    .eq("id", id)
    .single();

  if (error || !data) {
    if (error?.code === "PGRST116") notFound();
    redirect("/");
  }

  const project = data as ProjectRow;
  const ready = isAnalysisReady(project);
  const calibrated = hasCalibrationWeights(project);
  const calibration = (project.calibration_model ?? {}) as Partial<CalibrationModel>;
  const company = (project.company_context ?? {}) as Partial<CompanyContext>;

  // Pull a compact summary of the project's job_specs to drive the role_spec
  // tile state and the "Build / Open Job Spec" CTA.
  const { data: specRows } = await supabase
    .from("job_specs")
    .select("id, is_final, is_generating")
    .eq("project_id", id);

  const spec: SpecState = {
    hasAny: (specRows?.length ?? 0) > 0,
    hasFinal: (specRows ?? []).some((r) => r.is_final),
    isGenerating: (specRows ?? []).some((r) => r.is_generating),
  };

  // Project health drives the weekly summary card. Computed here (not in
  // the card component) so it stays in the same server-component pass as
  // the other queries — avoids a second round-trip on render.
  const health: ProjectHealthSummary | null = ready
    ? await computeProjectHealth(project.id)
    : null;

  // Candidate search pool — shape every candidate the org can see for
  // the "Find Candidates" panel. We pull the project's own candidates
  // and the global pool in one batch (RLS scopes by org), tag each row
  // with whether it lives in THIS project, and stitch the project's
  // score row + recruiter assessment in.
  const searchCandidates = ready ? await loadSearchCandidates(project.id) : [];

  // Feedback count gates the Client Intelligence panel (need ≥3 events
  // before the agent can detect patterns).
  const { count: feedbackCount } = await supabase
    .from("feedback")
    .select("id", { count: "exact", head: true })
    .eq("project_id", project.id);

  const specAction: AgentTileAction = {
    label: spec.hasAny ? "Open Job Spec" : "Build Job Spec",
    href: `/projects/${project.id}/spec`,
    enabled: calibrated,
    disabledHint: calibrated ? undefined : "Awaiting calibration",
  };

  const projectStatus = (project.status ?? "active").toLowerCase();
  const statusTone: ChipTone =
    projectStatus === "active"
      ? "secondary"
      : projectStatus === "paused"
        ? "warn"
        : "neutral";

  return (
    <div className="px-6 py-6 space-y-5 max-w-[1600px] mx-auto">
      <ProjectPoller analysisReady={ready} />

      <ProjectHero
        ready={ready}
        calibrated={calibrated}
        title={project.title}
        companyName={project.company_name}
        oneLineInput={project.one_line_input}
        status={projectStatus}
        statusTone={statusTone}
        projectId={project.id}
      />

      {ready && <ProjectModuleNav projectId={project.id} />}

      {project.recalibration_summary?.summary && (
        <RecalibrationBanner
          projectId={project.id}
          summary={project.recalibration_summary}
        />
      )}

      {health && (
        <WeeklyHealthCard projectId={project.id} health={health} />
      )}

      <section className="space-y-3">
        <MastHead
          tone="primary"
          icon="robot_2"
          label="Agent Stack"
          meta={
            !ready ? (
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                Live analysis in progress
              </span>
            ) : (
              <span className="tabular-nums">
                4/4 agents · {calibrated ? "calibrated" : "calibration pending"}
              </span>
            )
          }
        />
        <AgentTiles
          states={tileStates(project, spec)}
          actions={{ role_spec: specAction }}
        />
        {spec.hasFinal && <BuildSourcingCta projectId={project.id} />}
      </section>

      {ready && (
        <CandidateSearchPanel
          projectId={project.id}
          projectTitle={project.title}
          candidates={searchCandidates}
        />
      )}

      {ready && (
        <ClientIntelligencePanel
          projectId={project.id}
          initial={project.client_psychology}
          feedbackCount={feedbackCount ?? 0}
        />
      )}

      {ready && (
        <CultureIntelligencePanel
          projectId={project.id}
          initial={project.company_context?.culture_profile ?? null}
        />
      )}

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <RoleSummaryCard ready={ready} calibration={calibration} />
        <CompanySummaryCard ready={ready} company={company} />
      </section>

      {calibrated && <DimensionWeightsCard calibration={calibration} />}

      {ready && Array.isArray(calibration.missing_information) && calibration.missing_information.length > 0 && (
        <section className="bg-tertiary-container/10 border border-tertiary/30 px-4 py-3 space-y-3">
          <h3 className="font-mono-label text-mono-label text-tertiary uppercase tracking-widest flex items-center gap-2">
            <span
              className="material-symbols-outlined text-[14px]"
              style={{ fontVariationSettings: "'FILL' 1" }}
              aria-hidden
            >
              psychology
            </span>
            Information Required ·{" "}
            <span className="tabular-nums">
              {String(calibration.missing_information.length).padStart(2, "0")}
            </span>
          </h3>
          <ul className="space-y-1.5 list-disc list-inside text-on-tertiary-container text-body-main">
            {calibration.missing_information.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function ProjectHero({
  ready,
  calibrated,
  title,
  companyName,
  oneLineInput,
  status,
  statusTone,
  projectId,
}: {
  ready: boolean;
  calibrated: boolean;
  title: string;
  companyName: string;
  oneLineInput: string;
  status: string;
  statusTone: ChipTone;
  projectId: string;
}) {
  return (
    <header className="space-y-3">
      <div className="font-mono-label text-mono-label text-outline uppercase tracking-widest flex items-center gap-2 flex-wrap">
        <Link
          href="/"
          prefetch={false}
          className="hover:text-on-surface transition-colors focus-visible:outline-none focus-visible:text-primary focus-visible:underline focus-visible:underline-offset-2"
        >
          Mandate
        </Link>
        <span className="text-outline-variant" aria-hidden>
          /
        </span>
        <span className="text-primary">Project</span>
      </div>

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-2 min-w-0 flex-1">
          {ready ? (
            <h1 className="font-h1 text-h1 text-on-surface tracking-tight">
              {title}
            </h1>
          ) : (
            <div
              className="h-9 w-72 bg-surface-container-high animate-pulse"
              role="status"
              aria-label="Loading mandate title"
            />
          )}
          <div className="flex items-center gap-3 flex-wrap font-mono-label text-mono-label text-on-surface-variant uppercase tracking-widest">
            <StatusChip tone={statusTone} dot pulse={status === "active"}>
              {status}
            </StatusChip>
            {ready ? (
              <span className="text-on-surface-variant">{companyName}</span>
            ) : (
              <div
                className="h-3 w-32 bg-surface-container-high animate-pulse inline-block align-middle"
                role="status"
                aria-label="Loading company"
              />
            )}
            <span className="text-outline-variant" aria-hidden>
              ·
            </span>
            <span className="text-outline truncate max-w-[40ch]">
              {oneLineInput}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <LiveTick nowOnServer label="Snapshot" />
          {ready && (
            <Link
              href={`/projects/${projectId}/onboarding`}
              prefetch={false}
              className={
                calibrated
                  ? "px-4 py-2 border border-outline-variant text-on-surface-variant font-mono-label text-mono-label uppercase tracking-widest hover:border-primary hover:text-primary transition-colors flex items-center gap-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                  : "px-4 py-2 bg-primary-container text-on-primary-container font-mono-label text-mono-label uppercase tracking-widest hover:brightness-110 active:scale-[0.98] transition-[filter,transform] flex items-center gap-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              }
            >
              <span
                className="material-symbols-outlined text-[14px]"
                aria-hidden
              >
                tune
              </span>
              {calibrated ? "Re-run Calibration" : "Start Onboarding"}
            </Link>
          )}
          {ready && (
            <Link
              href={`/projects/${projectId}/hiring-manager`}
              prefetch={false}
              className="px-4 py-2 border border-outline-variant text-on-surface-variant font-mono-label text-mono-label uppercase tracking-widest hover:border-primary hover:text-primary transition-colors flex items-center gap-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <span
                className="material-symbols-outlined text-[14px]"
                aria-hidden
              >
                share
              </span>
              Share with HM
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}

function RoleSummaryCard({
  ready,
  calibration,
}: {
  ready: boolean;
  calibration: Partial<CalibrationModel>;
}) {
  return (
    <article className="bg-surface-container-low border border-outline-variant">
      <header className="px-4 py-2.5 border-b border-outline-variant bg-surface-container">
        <h3 className="font-mono-label text-mono-label text-primary uppercase tracking-widest flex items-center gap-2">
          <span
            className="material-symbols-outlined text-[14px]"
            aria-hidden
          >
            badge
          </span>
          Role Calibration
        </h3>
      </header>
      <div className="p-4">
        {ready ? (
          <dl className="space-y-2.5">
            <Field label="Title" value={calibration.role_title} />
            <Field label="Seniority" value={calibration.role_structure?.seniority} />
            <Field label="Function" value={calibration.role_structure?.function} />
            <FieldBlock label="Inferred Scope" value={calibration.inferred_scope} />
          </dl>
        ) : (
          <SkeletonRows rows={4} />
        )}
      </div>
    </article>
  );
}

function CompanySummaryCard({
  ready,
  company,
}: {
  ready: boolean;
  company: Partial<CompanyContext>;
}) {
  return (
    <article className="bg-surface-container-low border border-outline-variant">
      <header className="px-4 py-2.5 border-b border-outline-variant bg-surface-container">
        <h3 className="font-mono-label text-mono-label text-primary uppercase tracking-widest flex items-center gap-2">
          <span
            className="material-symbols-outlined text-[14px]"
            aria-hidden
          >
            domain
          </span>
          Company Context
        </h3>
      </header>
      <div className="p-4">
        {ready ? (
          <dl className="space-y-2.5">
            <Field label="Name" value={company.company_name} />
            <Field label="Industry" value={company.industry} />
            <Field label="Business Model" value={company.business_model} />
          </dl>
        ) : (
          <SkeletonRows rows={3} />
        )}
      </div>
    </article>
  );
}

function Field({ label, value }: { label: string; value: string | undefined }) {
  return (
    <div className="grid grid-cols-[7rem_1fr] items-baseline gap-3">
      <dt className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
        {label}
      </dt>
      <dd className="font-mono-data text-body-main text-on-surface text-right truncate">
        {value ?? "—"}
      </dd>
    </div>
  );
}

function FieldBlock({
  label,
  value,
}: {
  label: string;
  value: string | undefined;
}) {
  return (
    <div className="space-y-1.5 pt-2.5 border-t border-outline-variant/40">
      <dt className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
        {label}
      </dt>
      <dd className="text-on-surface text-body-main leading-relaxed">
        {value ?? "—"}
      </dd>
    </div>
  );
}

function SkeletonRows({ rows }: { rows: number }) {
  return (
    <div className="space-y-3" role="status" aria-label="Loading content">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="space-y-1.5">
          <div className="h-3 w-20 bg-surface-container-high animate-pulse" />
          <div
            className="h-4 bg-surface-container-high animate-pulse"
            style={{ width: `${50 + ((i * 17) % 40)}%` }}
          />
        </div>
      ))}
    </div>
  );
}

function DimensionWeightsCard({
  calibration,
}: {
  calibration: Partial<CalibrationModel>;
}) {
  const weights = calibration.dimension_weights;
  if (!weights) return null;
  return (
    <section className="bg-surface-container-low border border-outline-variant">
      <header className="px-4 py-2.5 border-b border-outline-variant bg-surface-container flex items-center justify-between gap-2 flex-wrap">
        <h3 className="font-mono-label text-mono-label text-secondary-fixed-dim uppercase tracking-widest flex items-center gap-2">
          <span
            className="material-symbols-outlined text-[14px]"
            aria-hidden
          >
            tune
          </span>
          Calibration Weights
        </h3>
        <span className="font-mono-label text-mono-label text-outline uppercase tracking-wider tabular-nums">
          0–10 scale · multi-dimension
        </span>
      </header>
      <div className="p-4 grid grid-cols-2 md:grid-cols-5 gap-4">
        {DIMENSION_KEYS.map((k: DimensionKey) => {
          const v = Math.max(0, Math.min(10, weights[k] ?? 0));
          return (
            <div key={k} className="space-y-2">
              <div className="flex items-baseline justify-between">
                <span className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
                  {k}
                </span>
                <span className="font-h2 text-h2 text-primary tabular-nums leading-none">
                  {v}
                </span>
              </div>
              <div
                className="h-1.5 bg-surface-container-highest overflow-hidden"
                role="meter"
                aria-valuemin={0}
                aria-valuemax={10}
                aria-valuenow={v}
                aria-label={`${k} weight`}
              >
                <div
                  className="h-full bg-primary-container"
                  style={{ width: `${(v / 10) * 100}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
      {calibration.weights_rationale && (
        <p className="px-4 pb-4 text-body-main text-on-surface-variant border-t border-outline-variant/40 pt-4">
          {calibration.weights_rationale}
        </p>
      )}
    </section>
  );
}

function RecalibrationBanner({
  projectId,
  summary,
}: {
  projectId: string;
  summary: RecalibrationSummary;
}) {
  return (
    <Link
      href={`/projects/${projectId}/feedback`}
      prefetch={false}
      className="block bg-secondary-fixed-dim/5 border border-secondary-fixed-dim/40 hover:border-secondary-fixed-dim/70 hover:bg-secondary-fixed-dim/10 transition-colors p-4 group focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary-fixed-dim"
    >
      <div className="flex items-start gap-3">
        <span
          className="material-symbols-outlined text-secondary-fixed-dim mt-0.5 text-[20px]"
          style={{ fontVariationSettings: "'FILL' 1" }}
          aria-hidden
        >
          refresh
        </span>
        <div className="flex-1 min-w-0">
          <div className="font-mono-label text-mono-label text-secondary-fixed-dim uppercase tracking-widest tabular-nums">
            Calibration recalibrated
            {summary.applied_at ? ` · ${formatRelative(summary.applied_at)}` : ""}
          </div>
          <p className="text-on-surface text-body-main mt-1">{summary.summary}</p>
          {Array.isArray(summary.applied_adjustments) &&
            summary.applied_adjustments.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {summary.applied_adjustments.map((adj, i) => (
                  <StatusChip
                    key={i}
                    tone={adj.delta >= 0 ? "secondary" : "danger"}
                    intensity="soft"
                  >
                    <span className="tabular-nums">
                      {adj.dimension} {adj.delta >= 0 ? "+" : ""}
                      {adj.delta}
                    </span>
                  </StatusChip>
                ))}
              </div>
            )}
        </div>
        <span className="font-mono-label text-mono-label text-outline uppercase tracking-widest flex items-center gap-1.5 group-hover:translate-x-0.5 transition-transform shrink-0">
          View
          <span className="material-symbols-outlined text-[14px]" aria-hidden>
            arrow_forward
          </span>
        </span>
      </div>
    </Link>
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

function BuildSourcingCta({ projectId }: { projectId: string }) {
  return (
    <Link
      href={`/projects/${projectId}/sourcing`}
      prefetch={false}
      className="block bg-primary-container/10 border border-primary-container/40 hover:border-primary-container hover:bg-primary-container/15 transition-colors p-4 group focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <span
            className="material-symbols-outlined text-[20px] text-primary"
            style={{ fontVariationSettings: "'FILL' 1" }}
            aria-hidden
          >
            travel_explore
          </span>
          <div>
            <div className="font-mono-label text-mono-label text-primary uppercase tracking-widest">
              Job spec is final · Next step
            </div>
            <div className="text-on-surface text-body-main font-semibold mt-0.5">
              Build Sourcing Queries
            </div>
            <div className="text-on-surface-variant text-body-main mt-0.5">
              Synthesise LinkedIn boolean variants, Google X-Ray, and ATS strings from the canonical spec.
            </div>
          </div>
        </div>
        <span className="font-mono-label text-mono-label text-primary uppercase tracking-widest flex items-center gap-1.5 group-hover:translate-x-0.5 transition-transform shrink-0">
          Open
          <span className="material-symbols-outlined text-[14px]" aria-hidden>
            arrow_forward
          </span>
        </span>
      </div>
    </Link>
  );
}

function WeeklyHealthCard({
  projectId,
  health,
}: {
  projectId: string;
  health: ProjectHealthSummary;
}) {
  return (
    <Link
      href={`/projects/${projectId}/metrics`}
      prefetch={false}
      className="block bg-surface-container-low border border-outline-variant hover:border-primary transition-colors group focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      <header className="px-4 py-2.5 border-b border-outline-variant bg-surface-container flex items-center justify-between gap-2 flex-wrap">
        <h3 className="font-mono-label text-mono-label text-primary uppercase tracking-widest flex items-center gap-2">
          <span
            className="material-symbols-outlined text-[14px]"
            aria-hidden
          >
            monitor_heart
          </span>
          This Week
        </h3>
        <div className="flex items-center gap-2">
          <StatusChip
            tone={HEALTH_CHIP[health.status]}
            dot
            pulse={health.status === "at_risk"}
          >
            {HEALTH_LABELS[health.status]}
          </StatusChip>
          <span className="font-mono-label text-mono-label text-primary uppercase tracking-widest flex items-center gap-1.5 group-hover:translate-x-0.5 transition-transform">
            Open metrics
            <span className="material-symbols-outlined text-[14px]" aria-hidden>
              arrow_forward
            </span>
          </span>
        </div>
      </header>
      <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-outline-variant/40">
        <WeeklyKpi
          label="Sourced"
          value={String(health.candidatesThisWeek).padStart(2, "0")}
          unit="this week"
        />
        <WeeklyKpi
          label="Feedback"
          value={String(health.feedbackThisWeek).padStart(2, "0")}
          unit="this week"
        />
        <WeeklyKpi
          label="Rank Δ"
          value={String(health.rankingChangesThisWeek).padStart(2, "0")}
          unit="changes 7d"
        />
        <WeeklyKpi
          label="Last activity"
          value={
            health.lastActivityAt
              ? formatRelative(health.lastActivityAt)
              : "—"
          }
          unit={`${health.totalCandidates} total`}
        />
      </div>
      {health.alerts.length > 0 && (
        <div className="px-4 py-2.5 border-t border-outline-variant/40 flex flex-wrap gap-1.5">
          {health.alerts.map((alert) => (
            <HealthAlertChip key={alert.code} alert={alert} />
          ))}
        </div>
      )}
    </Link>
  );
}

function WeeklyKpi({
  label,
  value,
  unit,
}: {
  label: string;
  value: string;
  unit: string;
}) {
  return (
    <div className="px-4 py-3 space-y-1">
      <span className="font-mono-label text-mono-label text-outline uppercase tracking-widest block">
        {label}
      </span>
      <span className="font-h2 text-h2 text-on-surface tabular-nums leading-none block">
        {value}
      </span>
      <span className="font-mono-label text-mono-label text-outline uppercase tracking-widest block">
        {unit}
      </span>
    </div>
  );
}

function HealthAlertChip({ alert }: { alert: HealthAlert }) {
  return (
    <StatusChip
      tone={alert.severity === "critical" ? "danger" : "warn"}
      intensity="soft"
    >
      <span className="sr-only">
        {alert.severity === "critical" ? "Critical: " : "Warning: "}
      </span>
      {alert.label}
    </StatusChip>
  );
}

/**
 * Module nav strip that lives below the project header. The header used to
 * carry six CTA buttons and a primary action; that crowded the hero info.
 * Splitting nav into its own strip lets each link breathe and signals
 * "modules of the search" rather than "buttons attached to the title".
 *
 * Server component — no client interactivity. Active-state highlighting
 * happens at the route level (each module has its own page) so this strip
 * is purely outbound.
 */
const PROJECT_MODULES: Array<{
  href: (id: string) => string;
  label: string;
  icon: string;
}> = [
  { href: (id) => `/projects/${id}/candidates`, label: "Candidates", icon: "groups" },
  { href: (id) => `/projects/${id}/ranking`, label: "Rankings", icon: "leaderboard" },
  { href: (id) => `/projects/${id}/metrics`, label: "Metrics", icon: "analytics" },
  { href: (id) => `/projects/${id}/shortlist`, label: "Shortlist", icon: "view_kanban" },
  { href: (id) => `/projects/${id}/feedback`, label: "Feedback", icon: "rate_review" },
  { href: (id) => `/projects/${id}/reports`, label: "Weekly Report", icon: "summarize" },
  { href: (id) => `/projects/${id}/hiring-manager`, label: "HM Portal", icon: "share" },
];

function ProjectModuleNav({ projectId }: { projectId: string }) {
  return (
    <nav
      aria-label="Project modules"
      className="bg-surface-container-low border border-outline-variant"
    >
      <ul className="flex divide-x divide-outline-variant overflow-x-auto">
        {PROJECT_MODULES.map((mod) => (
          <li key={mod.label} className="flex-1 min-w-[120px]">
            <Link
              href={mod.href(projectId)}
              prefetch={false}
              className="flex items-center justify-center gap-2 px-4 py-3 font-mono-label text-mono-label text-on-surface-variant uppercase tracking-widest hover:text-primary hover:bg-surface-container transition-colors focus-visible:outline-none focus-visible:bg-surface-container focus-visible:text-primary focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-primary"
            >
              <span
                className="material-symbols-outlined text-[14px]"
                aria-hidden
              >
                {mod.icon}
              </span>
              {mod.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Candidate search pool loader
//
// Pulls every candidate the caller's org can see (RLS scopes by org)
// plus this project's score rows, then stitches them into the
// SearchCandidate shape the panel expects. Done in one server pass so
// the panel renders immediately on page load — the AI call only fires
// when the recruiter clicks "Analyze Selected".
// ────────────────────────────────────────────────────────────────────────

async function loadSearchCandidates(
  projectId: string
): Promise<SearchCandidate[]> {
  const supabase = await createServerSupabaseClient();

  type CandidateRow = {
    id: string;
    project_id: string | null;
    full_name: string;
    current_title: string | null;
    current_company: string | null;
    archetype: string | null;
    pipeline_stage: string | null;
    recruiter_assessment: unknown;
  };
  type ProjectLite = { id: string; title: string };
  type ScoreRow = {
    candidate_id: string;
    rank_position: number | null;
    overall_score: number | null;
    tier: string | null;
  };

  const [candidatesQ, projectsQ, scoresQ] = await Promise.all([
    supabase
      .from("candidates")
      .select(
        "id, project_id, full_name, current_title, current_company, archetype, pipeline_stage, recruiter_assessment"
      )
      .order("updated_at", { ascending: false }),
    supabase
      .from("projects")
      .select("id, title"),
    supabase
      .from("candidate_scores")
      .select("candidate_id, rank_position, overall_score, tier")
      .eq("project_id", projectId),
  ]);

  const candidates = (candidatesQ.data ?? []) as CandidateRow[];
  const projects = (projectsQ.data ?? []) as ProjectLite[];
  const scoreById = new Map<string, ScoreRow>();
  for (const s of (scoresQ.data ?? []) as ScoreRow[]) {
    scoreById.set(s.candidate_id, s);
  }
  const titleById = new Map(projects.map((p) => [p.id, p.title]));

  return candidates.map<SearchCandidate>((c) => {
    const score = scoreById.get(c.id);
    const recruiter = normaliseRecruiterAssessment(c.recruiter_assessment);
    const inProject = c.project_id === projectId;
    return {
      id: c.id,
      full_name: c.full_name,
      current_title: c.current_title,
      current_company: c.current_company,
      archetype: c.archetype as Archetype | null,
      pipeline_stage: c.pipeline_stage as PipelineStage | null,
      in_project: inProject,
      rank: inProject ? score?.rank_position ?? null : null,
      overall_score: inProject ? score?.overall_score ?? null : null,
      ai_tier: inProject ? ((score?.tier as Tier | null) ?? null) : null,
      recruiter_tier: recruiter.tier,
      project_id: c.project_id,
      project_title: c.project_id ? titleById.get(c.project_id) ?? null : null,
    };
  });
}
