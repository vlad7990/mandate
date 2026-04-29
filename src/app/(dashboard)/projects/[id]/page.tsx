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
  DIMENSION_KEYS,
  type DimensionKey,
} from "@/lib/ai/onboarding-analysis";
import { ProjectPoller } from "./project-poller";

type ProjectRow = {
  id: string;
  title: string;
  company_name: string;
  one_line_input: string;
  status: string | null;
  created_at: string | null;
  calibration_model: Partial<CalibrationModel> | null;
  company_context: Partial<CompanyContext> | null;
};

type SpecState = {
  hasAny: boolean;
  hasFinal: boolean;
  isGenerating: boolean;
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
      "id, title, company_name, one_line_input, status, created_at, calibration_model, company_context"
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

  const specAction: AgentTileAction = {
    label: spec.hasAny ? "Open Job Spec" : "Build Job Spec",
    href: `/projects/${project.id}/spec`,
    enabled: calibrated,
    disabledHint: calibrated ? undefined : "Awaiting calibration",
  };

  return (
    <div className="p-6 space-y-6">
      <ProjectPoller analysisReady={ready} />

      <header className="space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
            MANDATE //
          </span>
          {ready ? (
            <h1 className="font-h2 text-h2 text-on-surface">{project.title}</h1>
          ) : (
            <div className="h-7 w-72 bg-surface-container-high rounded animate-pulse" />
          )}
          <span className="px-2 py-0.5 border border-secondary/40 bg-secondary/10 text-secondary font-mono-label text-mono-label uppercase tracking-wider">
            {project.status ?? "active"}
          </span>
          {ready && (
            <div className="ml-auto flex items-center gap-2 flex-wrap">
              <Link
                href={`/projects/${project.id}/candidates`}
                prefetch={false}
                className="px-4 py-2 border border-outline-variant text-on-surface-variant font-mono-label text-mono-label uppercase tracking-widest hover:border-primary hover:text-primary transition-colors flex items-center gap-2"
              >
                <span className="material-symbols-outlined text-[14px]">groups</span>
                Candidates
              </Link>
              <Link
                href={`/projects/${project.id}/ranking`}
                prefetch={false}
                className="px-4 py-2 border border-outline-variant text-on-surface-variant font-mono-label text-mono-label uppercase tracking-widest hover:border-primary hover:text-primary transition-colors flex items-center gap-2"
              >
                <span className="material-symbols-outlined text-[14px]">leaderboard</span>
                View Rankings
              </Link>
              <Link
                href={`/projects/${project.id}/onboarding`}
                className={
                  calibrated
                    ? "px-4 py-2 border border-outline-variant text-on-surface-variant font-mono-label text-mono-label uppercase tracking-widest hover:border-primary hover:text-primary transition-colors flex items-center gap-2"
                    : "px-4 py-2 bg-primary-container text-on-primary-container font-mono-label text-mono-label uppercase tracking-widest hover:brightness-110 active:scale-[0.98] transition-all flex items-center gap-2"
                }
              >
                <span className="material-symbols-outlined text-[14px]">tune</span>
                {calibrated ? "Re-run Calibration" : "Start Onboarding"}
              </Link>
            </div>
          )}
        </div>
        <div className="flex items-center gap-3 text-on-surface-variant text-body-main">
          {ready ? (
            <span>{project.company_name}</span>
          ) : (
            <div className="h-4 w-48 bg-surface-container-high rounded animate-pulse" />
          )}
          <span className="text-outline">·</span>
          <span className="font-mono-label text-mono-label text-outline uppercase tracking-wider">
            {project.one_line_input}
          </span>
        </div>
      </header>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-mono-label text-mono-label text-outline uppercase tracking-widest flex items-center gap-2">
            <span className="material-symbols-outlined text-[14px]">robot_2</span>
            Agent Stack
          </h2>
          {!ready && (
            <span className="font-mono-label text-mono-label text-primary uppercase tracking-wider flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              Live analysis in progress
            </span>
          )}
        </div>
        <AgentTiles
          states={tileStates(project, spec)}
          actions={{ role_spec: specAction }}
        />
        {spec.hasFinal && <BuildSourcingCta projectId={project.id} />}
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <RoleSummaryCard ready={ready} calibration={calibration} />
        <CompanySummaryCard ready={ready} company={company} />
      </section>

      {calibrated && <DimensionWeightsCard calibration={calibration} />}

      {ready && Array.isArray(calibration.missing_information) && calibration.missing_information.length > 0 && (
        <section className="bg-tertiary-container/10 border border-tertiary/30 p-4 rounded space-y-3">
          <h3 className="font-mono-label text-mono-label text-tertiary uppercase tracking-widest flex items-center gap-2">
            <span className="material-symbols-outlined text-[14px]" style={{ fontVariationSettings: "'FILL' 1" }}>
              psychology
            </span>
            Information Required
          </h3>
          <ul className="space-y-1.5 list-disc list-inside text-on-tertiary-container text-body-main">
            {calibration.missing_information.map((item, i) => (
              <li key={i} className="font-body-main">
                {item}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
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
    <div className="bg-surface-container-low border border-outline-variant rounded p-5 space-y-4">
      <h3 className="font-mono-label text-mono-label text-primary uppercase tracking-widest flex items-center gap-2">
        <span className="material-symbols-outlined text-[14px]">badge</span>
        Role Calibration
      </h3>
      {ready ? (
        <div className="space-y-3">
          <Field label="TITLE" value={calibration.role_title} />
          <Field label="SENIORITY" value={calibration.role_structure?.seniority} />
          <Field label="FUNCTION" value={calibration.role_structure?.function} />
          <FieldBlock label="INFERRED SCOPE" value={calibration.inferred_scope} />
        </div>
      ) : (
        <SkeletonRows rows={4} />
      )}
    </div>
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
    <div className="bg-surface-container-low border border-outline-variant rounded p-5 space-y-4">
      <h3 className="font-mono-label text-mono-label text-primary uppercase tracking-widest flex items-center gap-2">
        <span className="material-symbols-outlined text-[14px]">domain</span>
        Company Context
      </h3>
      {ready ? (
        <div className="space-y-3">
          <Field label="NAME" value={company.company_name} />
          <Field label="INDUSTRY" value={company.industry} />
          <Field label="BUSINESS MODEL" value={company.business_model} />
        </div>
      ) : (
        <SkeletonRows rows={3} />
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | undefined }) {
  return (
    <div className="flex justify-between items-baseline gap-4">
      <span className="font-mono-label text-mono-label text-outline uppercase tracking-wider">
        {label}
      </span>
      <span className="text-on-surface text-body-main text-right">
        {value ?? "—"}
      </span>
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
    <div className="space-y-1 pt-1 border-t border-outline-variant/40">
      <span className="font-mono-label text-mono-label text-outline uppercase tracking-wider block">
        {label}
      </span>
      <p className="text-on-surface text-body-main leading-relaxed">{value ?? "—"}</p>
    </div>
  );
}

function SkeletonRows({ rows }: { rows: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="space-y-1.5">
          <div className="h-3 w-20 bg-surface-container-high rounded animate-pulse" />
          <div
            className="h-4 bg-surface-container-high rounded animate-pulse"
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
    <section className="bg-surface-container-low border border-outline-variant rounded p-5 space-y-4">
      <header className="flex items-center justify-between">
        <h3 className="font-mono-label text-mono-label text-secondary-fixed uppercase tracking-widest flex items-center gap-2">
          <span className="material-symbols-outlined text-[14px]">tune</span>
          Calibration Weights
        </h3>
        <span className="font-mono-label text-mono-label text-outline uppercase tracking-wider">
          0–10 SCALE · MULTI-DIMENSION
        </span>
      </header>
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        {DIMENSION_KEYS.map((k: DimensionKey) => {
          const v = Math.max(0, Math.min(10, weights[k] ?? 0));
          return (
            <div key={k} className="space-y-2">
              <div className="flex items-baseline justify-between">
                <span className="font-mono-label text-mono-label text-outline uppercase tracking-wider">
                  {k}
                </span>
                <span className="font-h2 text-h2 text-primary tabular-nums">
                  {v}
                </span>
              </div>
              <div className="h-1.5 bg-surface-container-highest overflow-hidden">
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
        <p className="text-body-main text-on-surface-variant pt-3 border-t border-outline-variant/40">
          {calibration.weights_rationale}
        </p>
      )}
    </section>
  );
}

function BuildSourcingCta({ projectId }: { projectId: string }) {
  return (
    <Link
      href={`/projects/${projectId}/sourcing`}
      prefetch={false}
      className="block bg-primary-container/10 border border-primary-container/40 hover:border-primary-container hover:bg-primary-container/15 transition-colors p-4 group"
    >
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <span
            className="material-symbols-outlined text-[20px] text-primary"
            style={{ fontVariationSettings: "'FILL' 1" }}
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
            <div className="text-outline text-body-main mt-0.5">
              Synthesise LinkedIn boolean variants, Google X-Ray, and ATS strings from the canonical spec.
            </div>
          </div>
        </div>
        <span className="font-mono-label text-mono-label text-primary uppercase tracking-widest flex items-center gap-1.5 group-hover:translate-x-0.5 transition-transform">
          Open
          <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
        </span>
      </div>
    </Link>
  );
}
