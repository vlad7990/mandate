import { notFound, redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import {
  AgentTiles,
  AGENT_TILES,
  type AgentTileState,
} from "@/components/projects/agent-tiles";
import {
  type CalibrationModel,
  type CompanyContext,
} from "@/lib/ai/role-analysis";
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

function isAnalysisReady(row: ProjectRow): boolean {
  return Boolean(row.calibration_model?.role_title);
}

function tileStates(row: ProjectRow): Record<
  (typeof AGENT_TILES)[number]["key"],
  AgentTileState
> {
  const ready = isAnalysisReady(row);
  return {
    intake: ready ? "complete" : "active",
    company_research: ready ? "complete" : "active",
    role_spec: "queued",
    calibration: "queued",
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
  const calibration = (project.calibration_model ?? {}) as Partial<CalibrationModel>;
  const company = (project.company_context ?? {}) as Partial<CompanyContext>;

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
        <AgentTiles states={tileStates(project)} />
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <RoleSummaryCard ready={ready} calibration={calibration} />
        <CompanySummaryCard ready={ready} company={company} />
      </section>

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
