import { notFound, redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import {
  normalizeSections,
  type JobSpecSections,
} from "@/lib/ai/job-spec-analysis";
import type { CalibrationModel, CompanyContext } from "@/lib/ai/role-analysis";
import { JobSpecEditor } from "./job-spec-editor";
import { JobSpecEmpty } from "./job-spec-empty";
import { JobSpecError } from "./job-spec-error";
import { JobSpecGenerating } from "./job-spec-generating";
import {
  SpecDiffPanel,
  type SpecVersionPayload,
} from "./spec-diff-panel";

type ProjectRow = {
  id: string;
  title: string;
  company_name: string;
  one_line_input: string;
  calibration_model: Partial<CalibrationModel> | null;
  company_context: Partial<CompanyContext> | null;
};

type JobSpecRow = {
  id: string;
  project_id: string;
  version: number;
  content_json: unknown;
  is_final: boolean;
  is_generating: boolean;
  generation_error: string | null;
  created_by: string | null;
  created_at: string | null;
  updated_at: string;
};

export type SpecVersionSummary = {
  id: string;
  version: number;
  is_final: boolean;
  is_generating: boolean;
  updated_at: string;
  created_at: string | null;
};

function hasCalibrationWeights(row: ProjectRow): boolean {
  return typeof row.calibration_model?.dimension_weights?.technical === "number";
}

/**
 * The render path is intentionally side-effect free. Earlier versions
 * inserted a placeholder job_specs row and kicked off Anthropic generation
 * during this server component, which made Next.js link prefetch silently
 * provision rows and burn AI spend. Generation is now an explicit mutation
 * (initiateJobSpec / requestRegenerate) invoked from a user click.
 */
export default async function JobSpecPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select(
      "id, title, company_name, one_line_input, calibration_model, company_context"
    )
    .eq("id", id)
    .single<ProjectRow>();

  if (projectError || !project) {
    if (projectError?.code === "PGRST116") notFound();
    redirect("/");
  }

  // Job spec depends on calibration weights — bounce until the recruiter
  // has finished onboarding.
  if (!hasCalibrationWeights(project)) {
    redirect(`/app/projects/${id}`);
  }

  const { data: specs, error: specsError } = await supabase
    .from("job_specs")
    .select(
      "id, project_id, version, content_json, is_final, is_generating, generation_error, created_by, created_at, updated_at"
    )
    .eq("project_id", id)
    .order("version", { ascending: false });

  if (specsError) {
    redirect(`/app/projects/${id}`);
  }

  const rows = (specs ?? []) as JobSpecRow[];

  // Bucket rows so a transient generation/failure on the latest version
  // never hides an existing usable spec. Editor edits the latest healthy
  // row; in-flight generation surfaces as a banner; a failed-but-not-
  // recoverable row only takes the whole route when there's nothing
  // usable to fall back to.
  const editorRow =
    rows.find((r) => !r.is_generating && !r.generation_error) ?? null;
  const activeGenerationRow = rows.find((r) => r.is_generating) ?? null;
  const failedGenerationRow = rows.find((r) => r.generation_error) ?? null;

  // (e) Nothing exists → empty state. First visit, or all prior versions
  //     somehow purged. The "Generate Job Spec" CTA is the only path that
  //     creates a placeholder, so prefetch / scrapers can't trigger an
  //     Anthropic call from here.
  if (rows.length === 0) {
    return (
      <JobSpecEmpty
        projectId={project.id}
        roleTitle={project.title}
        companyName={project.company_name}
      />
    );
  }

  // (b) Failed generation with no fallback editor spec → full error view.
  //     This is the only state where the recruiter has nothing usable to
  //     edit, so the route is entirely owned by the retry CTA.
  if (failedGenerationRow && !editorRow) {
    return (
      <JobSpecError
        projectId={project.id}
        roleTitle={project.title}
        companyName={project.company_name}
        version={failedGenerationRow.version}
        errorMessage={
          failedGenerationRow.generation_error ?? "Generation failed."
        }
      />
    );
  }

  // First-time generation (no editor spec yet, AI is in flight) → polling
  // skeleton owns the route. As soon as the placeholder lands as a healthy
  // row, the next refresh swaps to the editor branch below.
  if (activeGenerationRow && !editorRow) {
    return (
      <JobSpecGenerating
        projectId={project.id}
        roleTitle={project.title}
        companyName={project.company_name}
        specId={activeGenerationRow.id}
        version={activeGenerationRow.version}
      />
    );
  }

  // (a, c, d) Editor view. May surface either or both banners:
  //   - active generation: in-flight regenerate, polling banner with live
  //     spinner; the next refresh promotes it once it lands.
  //   - failed generation: dismissible banner with retry CTA.
  // We assert editorRow here — the !editorRow branches above already
  // returned for the empty / failed-only / first-gen cases.
  if (!editorRow) {
    redirect(`/app/projects/${id}`);
  }

  const versions: SpecVersionSummary[] = rows.map((r) => ({
    id: r.id,
    version: r.version,
    is_final: r.is_final,
    is_generating: r.is_generating,
    updated_at: r.updated_at,
    created_at: r.created_at,
  }));

  const finalRow = rows.find((r) => r.is_final) ?? null;
  const finalSections: JobSpecSections | null = finalRow
    ? normalizeSections(finalRow.content_json)
    : null;

  // Author display names for the diff panel's timeline. One query
  // covers every distinct created_by uuid across versions.
  const authorIds = Array.from(
    new Set(
      rows
        .map((r) => r.created_by)
        .filter((v): v is string => typeof v === "string")
    )
  );
  let authorNames = new Map<string, string>();
  if (authorIds.length > 0) {
    const { data: authors } = await supabase
      .from("users")
      .select("id, full_name, email")
      .in("id", authorIds);
    authorNames = new Map(
      ((authors ?? []) as Array<{
        id: string;
        full_name: string | null;
        email: string | null;
      }>).map((u) => [
        u.id,
        (u.full_name?.trim() || u.email || "Unknown") as string,
      ])
    );
  }

  const diffVersions: SpecVersionPayload[] = rows
    .filter((r) => !r.is_generating)
    .map((r) => ({
      id: r.id,
      version: r.version,
      is_final: r.is_final,
      updated_at: r.updated_at,
      created_at: r.created_at,
      created_by_name: r.created_by
        ? authorNames.get(r.created_by) ?? null
        : null,
      sections: normalizeSections(r.content_json),
    }));

  return (
    <JobSpecEditor
      // Force a clean remount when the editor spec changes (e.g. an
      // active generation completes and becomes the new editorRow). Local
      // editor state (sections, dirty flag, expanded sections) reflects
      // the previous version otherwise.
      key={editorRow.id}
      projectId={project.id}
      roleTitle={project.title}
      companyName={project.company_name}
      oneLineInput={project.one_line_input}
      currentSpecId={editorRow.id}
      currentVersion={editorRow.version}
      currentIsFinal={editorRow.is_final}
      currentUpdatedAt={editorRow.updated_at}
      sections={normalizeSections(editorRow.content_json)}
      finalSections={finalSections}
      finalVersion={finalRow?.version ?? null}
      finalSpecId={finalRow?.id ?? null}
      versions={versions}
      companyContext={project.company_context ?? {}}
      calibration={project.calibration_model ?? {}}
      activeGeneration={
        activeGenerationRow
          ? {
              specId: activeGenerationRow.id,
              version: activeGenerationRow.version,
            }
          : null
      }
      failedGeneration={
        failedGenerationRow
          ? {
              specId: failedGenerationRow.id,
              version: failedGenerationRow.version,
              error:
                failedGenerationRow.generation_error ?? "Generation failed.",
            }
          : null
      }
      versionDiffPanel={
        diffVersions.length > 1 ? (
          <SpecDiffPanel
            versions={diffVersions}
            currentSpecId={editorRow.id}
          />
        ) : null
      }
    />
  );
}
