import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { computeProjectHealth } from "@/lib/metrics/health";
import { MIN_ROWS_FOR_ANALYSIS } from "@/lib/sourcing/coverage";
import type { SourcingRunRow } from "@/lib/sourcing/runs";
import type { HealthSuggestionsBlob } from "@/lib/ai/search-health-agent";
import type { DimensionWeights } from "@/lib/ai/onboarding-analysis";
import { IconArrowLeft } from "@/components/icons";
import { StatusChip, type ChipTone } from "@/components/ui/status-chip";
import { isSampleId } from "@/lib/sample";
import { SampleNotBuilt } from "@/components/sample/sample-not-built";
import { HealthSuggestionsPanel } from "../health-suggestions-panel";
import { CoveragePanel } from "../sourcing/coverage-panel";
import { QuickActs } from "./quick-acts";

type ProjectRow = {
  id: string;
  title: string;
  company_name: string;
  health_suggestions: HealthSuggestionsBlob | null;
  calibration_model: { dimension_weights?: DimensionWeights } | null;
};

const HEALTH_CHIP: Record<string, ChipTone> = {
  healthy: "secondary",
  stalled: "warn",
  at_risk: "danger",
};

/**
 * The Optimizer — every optimization lever the product already has,
 * fanned into one per-mandate surface (§109 gate). Composition, not
 * relocation: the health panel, the coverage panel and the quick acts
 * are the same components and the same server actions their home
 * surfaces use; every applied act records through its own machinery.
 */
export default async function OptimizePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  if (isSampleId(id)) {
    return (
      <SampleNotBuilt
        title="Optimize"
        context="Mandate module // every lever in one place"
        backHref={`/app/projects/${id}`}
        backLabel="Mandate"
        scope="mandate"
      />
    );
  }

  const supabase = await createServerSupabaseClient();

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id, title, company_name, health_suggestions, calibration_model")
    .eq("id", id)
    .single<ProjectRow>();

  if (projectError || !project) {
    if (projectError?.code === "PGRST116") notFound();
    redirect("/");
  }

  const [health, { data: runRows }, { count: queryCount }, { data: specRows }] =
    await Promise.all([
      computeProjectHealth(id),
      supabase
        .from("sourcing_runs")
        .select(
          "id, version, status, analysis_json, result_count, executed_at"
        )
        .eq("project_id", id)
        .eq("status", "executed")
        .order("executed_at", { ascending: false })
        .limit(1),
      supabase
        .from("boolean_queries")
        .select("id", { count: "exact", head: true })
        .eq("project_id", id),
      supabase
        .from("job_specs")
        .select("is_final, is_generating")
        .eq("project_id", id),
    ]);

  const latestRun = ((runRows ?? []) as SourcingRunRow[])[0] ?? null;
  let nextVersion = 1;
  if (latestRun) {
    const { data: maxRows } = await supabase
      .from("sourcing_runs")
      .select("version")
      .eq("project_id", id)
      .order("version", { ascending: false })
      .limit(1);
    nextVersion = ((maxRows?.[0]?.version as number) ?? 0) + 1;
  }

  const spec = {
    hasFinal: (specRows ?? []).some((r) => r.is_final),
    isGenerating: (specRows ?? []).some((r) => r.is_generating),
  };
  const weights = project.calibration_model?.dimension_weights ?? null;

  return (
    <div className="min-h-full bg-surface text-on-surface">
      <div className="mx-auto max-w-7xl space-y-6 px-8 py-10">
        {/* breadcrumb */}
        <div className="flex items-center gap-3 font-mono-label text-mono-label uppercase tracking-widest text-outline">
          <Link
            href={`/app/projects/${project.id}`}
            prefetch={false}
            className="flex items-center gap-1.5 transition-colors hover:text-on-surface"
          >
            <IconArrowLeft size={14} />
            Mandate
          </Link>
          <span className="text-outline-variant">/</span>
          <span className="text-on-surface-variant">{project.title}</span>
          <span className="text-outline-variant">/</span>
          <span className="text-primary">Optimize</span>
        </div>

        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-h1 text-h1 text-primary">OPTIMIZE</h1>
            <p className="mt-1 font-mono-label text-mono-label uppercase tracking-widest text-outline">
              {project.company_name} · every lever in one place
            </p>
          </div>
          <StatusChip tone={HEALTH_CHIP[health.status] ?? "neutral"} dot>
            {health.status.replace("_", " ")}
          </StatusChip>
        </header>

        {/* The honest healthy state: the page exists, says so, and the
            panel's Refresh stays offered — never a bare empty screen. */}
        {health.status === "healthy" && !project.health_suggestions && (
          <p className="border border-outline-variant bg-surface-container-low px-4 py-3 text-body-main leading-relaxed text-on-surface-variant">
            This search is healthy — the Search Health Agent only proposes
            levers when it stalls or drifts to at-risk. The signals below
            keep watch; the quick acts stay available.
          </p>
        )}

        {/* Rule-based signals — advisory by nature, nothing to click. */}
        {health.alerts.length > 0 && (
          <ul className="divide-y divide-outline-variant/40 border border-outline-variant bg-surface-container-low">
            {health.alerts.map((a) => (
              <li
                key={a.code}
                className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-3"
              >
                <span
                  className={
                    a.severity === "critical"
                      ? "font-mono-label text-mono-label uppercase tracking-wider text-error"
                      : "font-mono-label text-mono-label uppercase tracking-wider text-warn"
                  }
                >
                  {a.label}
                </span>
                <span className="min-w-0 flex-1 text-body-main text-on-surface-variant">
                  {a.detail}
                </span>
              </li>
            ))}
          </ul>
        )}

        <HealthSuggestionsPanel
          projectId={project.id}
          initial={project.health_suggestions}
          healthStatus={health.status}
          weights={weights}
        />

        {latestRun && (
          <CoveragePanel
            projectId={project.id}
            runId={latestRun.id}
            runVersion={latestRun.version}
            nextVersion={nextVersion}
            analysisJson={latestRun.analysis_json}
            canAnalyse={latestRun.result_count >= MIN_ROWS_FOR_ANALYSIS}
          />
        )}

        <QuickActs
          projectId={project.id}
          spec={spec}
          queryCount={queryCount ?? 0}
        />
      </div>
    </div>
  );
}
