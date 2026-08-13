import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { isSampleId } from "@/lib/sample";
import { SampleProjectDetail } from "@/components/sample/sample-project-detail";
import {
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
import { StatusChip, type ChipTone } from "@/components/ui/status-chip";
import { IconArrowRight, IconRefresh } from "@/components/icons";
import { ProjectView, type ProjectVm, type Stage } from "./project-view";
import {
  CandidateSearchPanel,
  type SearchCandidate,
} from "./candidate-search-panel";
import { ClientIntelligencePanel } from "./client-intelligence-panel";
import { CompanyIntelligencePanel } from "./company-intelligence-panel";
import { CultureIntelligencePanel } from "./culture-intelligence-panel";
import { HealthSuggestionsPanel } from "./health-suggestions-panel";
import { HMIntelligencePanel } from "./hm-intelligence-panel";
import type { ClientPsychology } from "@/lib/ai/client-psychology-agent";
import type { CompanyIntelligenceReport } from "@/lib/ai/company-intelligence-agent";
import type { CultureProfile } from "@/lib/ai/company-culture-agent";
import type { HealthSuggestionsBlob } from "@/lib/ai/search-health-agent";
import type { HiringManagerIntelligenceReport } from "@/lib/ai/hiring-manager-research-agent";
import type { Stakeholder } from "@/lib/ai/onboarding-analysis";
import {
  normaliseAnnotationMap,
  normaliseFlagArray,
} from "@/lib/intelligence/overlays";
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
    | (Partial<CompanyContext> & {
        culture_profile?: CultureProfile;
        intelligence_report?: CompanyIntelligenceReport;
        hm_intelligence?: HiringManagerIntelligenceReport;
      })
    | null;
  onboarding_responses: { stakeholders?: Stakeholder[] } | null;
  recalibration_summary: RecalibrationSummary | null;
  client_psychology: ClientPsychology | null;
  health_suggestions: HealthSuggestionsBlob | null;
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

/**
 * The modules of a search, as a nav strip below the header. Labels only —
 * they were icon + label ligatures, and the ligature put the literal string
 * "view_kanban" in the DOM for a screen reader to read out.
 */
const PROJECT_MODULES: Array<{ href: (id: string) => string; label: string }> = [
  { href: (id) => `/app/projects/${id}/candidates`, label: "Candidates" },
  { href: (id) => `/app/projects/${id}/ranking`, label: "Rankings" },
  { href: (id) => `/app/projects/${id}/metrics`, label: "Metrics" },
  { href: (id) => `/app/projects/${id}/shortlist`, label: "Shortlist" },
  { href: (id) => `/app/projects/${id}/feedback`, label: "Feedback" },
  { href: (id) => `/app/projects/${id}/reports`, label: "Weekly Report" },
  { href: (id) => `/app/projects/${id}/hiring-manager`, label: "HM Portal" },
];

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

  // Sample ids never touch the database. The prefix is the whole
  // contract — a uuid has no letters before its first hyphen, so a real
  // project can never land here and a crafted `sample-` id can never
  // reach a query.
  if (isSampleId(id)) {
    return <SampleProjectDetail id={id} />;
  }

  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("projects")
    .select(
      "id, title, company_name, one_line_input, status, created_at, calibration_model, company_context, recalibration_summary, client_psychology, health_suggestions, onboarding_responses"
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
    href: `/app/projects/${project.id}/spec`,
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

  // Stage-rail inputs. The comp draws nine fixed segments; these are the
  // rows that can actually say whether a stage happened. Head-only counts —
  // no rows come back.
  const [
    { count: queryCount },
    { count: scoredCount },
    { data: shortlist },
    { count: offerCount },
  ] = await Promise.all([
    supabase
      .from("boolean_queries")
      .select("id", { count: "exact", head: true })
      .eq("project_id", project.id),
    supabase
      .from("candidate_scores")
      .select("candidate_id", { count: "exact", head: true })
      .eq("project_id", project.id),
    supabase
      .from("shortlists")
      .select("candidate_ids, submitted_at")
      .eq("project_id", project.id)
      .maybeSingle<{ candidate_ids: string[] | null; submitted_at: string | null }>(),
    supabase
      .from("candidates")
      .select("id", { count: "exact", head: true })
      .eq("project_id", project.id)
      .in("pipeline_stage", ["offer", "hired"]),
  ]);

  const researched = Boolean(company.industry || company.business_model);
  const slateSize = shortlist?.candidate_ids?.length ?? 0;
  const daysWithClient = daysSince(shortlist?.submitted_at ?? null);

  const stages: Stage[] = [
    { label: "Intake", tone: ready ? "done" : "active" },
    { label: "Research", tone: researched ? "done" : ready ? "active" : "todo" },
    {
      label: spec.hasFinal ? "Spec final" : spec.hasAny ? "Spec draft" : "Spec",
      tone: spec.hasFinal ? "done" : spec.hasAny || spec.isGenerating ? "active" : "todo",
    },
    { label: "Calibrated", tone: calibrated ? "done" : ready ? "active" : "todo" },
    { label: "Sourced", tone: (queryCount ?? 0) > 0 ? "done" : "todo" },
    {
      label: (scoredCount ?? 0) > 0 ? `${scoredCount} evaluated` : "Evaluated",
      tone: (scoredCount ?? 0) > 0 ? "done" : "todo",
      grow: 1.2,
    },
    {
      label: slateSize > 0 ? `Shortlist ${slateSize}` : "Shortlist",
      tone: slateSize > 0 ? "done" : "todo",
    },
    {
      // A slate sitting with the client is the thing that stalls a search,
      // so it says how long. Five days is the threshold the health module
      // already treats as stale — not a number invented for the rail.
      label:
        daysWithClient === null
          ? "With client"
          : `With client · ${daysWithClient} day${daysWithClient === 1 ? "" : "s"}`,
      tone:
        daysWithClient === null ? "todo" : daysWithClient >= 5 ? "risk" : "done",
      grow: daysWithClient === null ? 1 : 1.4,
    },
    {
      label: (offerCount ?? 0) > 0 ? `${offerCount} at offer` : "Offer",
      tone: (offerCount ?? 0) > 0 ? "done" : "todo",
    },
  ];

  const weights = calibration.dimension_weights;
  const stakeholder = primaryStakeholder(project.onboarding_responses);

  const vm: ProjectVm = {
    projectId: project.id,
    title: project.title,
    companyName: project.company_name,
    oneLineInput: project.one_line_input,
    statusLabel: projectStatus,
    statusTone,
    ready,
    calibrated,
    stages,
    agentStates: tileStates(project, spec),
    specAction,
    // Four agents run on this surface. The comp badges seventeen.
    agentMeta: ready
      ? `4 agents · ${calibrated ? "calibrated" : "calibration pending"}`
      : "Live analysis in progress",
    modules: ready
      ? PROJECT_MODULES.map((m) => ({ href: m.href(project.id), label: m.label }))
      : [],
    roleFields: [
      { label: "Title", value: calibration.role_title ?? "—" },
      { label: "Seniority", value: calibration.role_structure?.seniority ?? "—" },
      { label: "Function", value: calibration.role_structure?.function ?? "—" },
    ],
    companyFields: [
      { label: "Name", value: company.company_name ?? project.company_name },
      { label: "Industry", value: company.industry ?? "—" },
      { label: "Business model", value: company.business_model ?? "—" },
    ],
    inferredScope: calibration.inferred_scope ?? null,
    weights: weights
      ? DIMENSION_KEYS.map((k: DimensionKey) => ({
          key: k,
          label: k,
          value: Math.max(0, Math.min(10, weights[k] ?? 0)),
        }))
      : [],
    weightsRationale: calibration.weights_rationale ?? null,
    health: health
      ? {
          statusLabel: HEALTH_LABELS[health.status],
          statusTone: HEALTH_CHIP[health.status],
          href: `/app/projects/${project.id}/metrics`,
          kpis: [
            {
              label: "Sourced",
              value: String(health.candidatesThisWeek).padStart(2, "0"),
              unit: "this week",
            },
            {
              label: "Feedback",
              value: String(health.feedbackThisWeek).padStart(2, "0"),
              unit: "this week",
            },
            {
              label: "Rank Δ",
              value: String(health.rankingChangesThisWeek).padStart(2, "0"),
              unit: "changes 7d",
            },
            {
              label: "Last activity",
              value: health.lastActivityAt ? formatRelative(health.lastActivityAt) : "—",
              unit: `${health.totalCandidates} total`,
            },
          ],
          alerts: health.alerts.map((a: HealthAlert) => ({
            label: a.label,
            critical: a.severity === "critical",
          })),
        }
      : null,
    missingInformation:
      ready && Array.isArray(calibration.missing_information)
        ? calibration.missing_information
        : [],
    banners: (
      <>
        {project.recalibration_summary?.summary && (
          <RecalibrationBanner
            projectId={project.id}
            summary={project.recalibration_summary}
          />
        )}
        {spec.hasFinal && <BuildSourcingCta projectId={project.id} />}
      </>
    ),
    panels: (
      <>
        {health && (
          <HealthSuggestionsPanel
            projectId={project.id}
            initial={project.health_suggestions}
            healthStatus={health.status}
          />
        )}
        {ready && (
          <CandidateSearchPanel
            projectId={project.id}
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
          <HMIntelligencePanel
            projectId={project.id}
            hmName={stakeholder?.name ?? null}
            hmRole={stakeholder?.role ?? null}
            initial={project.company_context?.hm_intelligence ?? null}
          />
        )}
        {ready && (
          <CompanyIntelligencePanel
            projectId={project.id}
            companyName={project.company_name}
            initial={project.company_context?.intelligence_report ?? null}
          />
        )}
        {ready && (
          <CultureIntelligencePanel
            projectId={project.id}
            initial={project.company_context?.culture_profile ?? null}
            initialContext={
              (project.company_context as { culture_context?: string | null })
                ?.culture_context ?? null
            }
            notes={normaliseAnnotationMap(
              (project.company_context as { culture_notes?: unknown })?.culture_notes
            )}
            flags={normaliseFlagArray(
              (project.company_context as { culture_flags?: unknown })?.culture_flags
            )}
          />
        )}
      </>
    ),
  };

  return (
    <>
      <ProjectPoller analysisReady={ready} />
      <ProjectView vm={vm} />
    </>
  );
}

function primaryStakeholder(
  onboarding: { stakeholders?: Stakeholder[] } | null
): Stakeholder | null {
  const list = onboarding?.stakeholders ?? [];
  return list.find((s) => s && typeof s.name === "string" && s.name.trim()) ?? null;
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
      href={`/app/projects/${projectId}/feedback`}
      prefetch={false}
      className="group block border border-secondary-fixed-dim/40 bg-secondary-fixed-dim/5 p-4 transition-colors hover:border-secondary-fixed-dim/70 hover:bg-secondary-fixed-dim/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary-fixed-dim"
    >
      <div className="flex items-start gap-3">
        <IconRefresh size={18} className="mt-0.5 shrink-0 text-secondary-fixed-dim" />
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
          <IconArrowRight size={13} />
        </span>
      </div>
    </Link>
  );
}

/** Whole days since an instant, or null when there is no instant. Kept out
 * of the component body: "now" is impure, and the lint rule is right that a
 * render should not read the clock inline. */
function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((Date.now() - t) / 86_400_000);
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
      href={`/app/projects/${projectId}/sourcing`}
      prefetch={false}
      className="group block border border-primary-container/40 bg-primary-container/10 p-4 transition-colors hover:border-primary-container hover:bg-primary-container/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
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
          <IconArrowRight size={13} />
        </span>
      </div>
    </Link>
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
