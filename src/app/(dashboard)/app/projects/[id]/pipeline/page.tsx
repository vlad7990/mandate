import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { hasCapability } from "@/lib/auth/access";
import { IconArrowLeft, IconChecklist } from "@/components/icons";
import { isSampleId } from "@/lib/sample";
import { SampleNotBuilt } from "@/components/sample/sample-not-built";
import { PipelineBoard, type BoardCandidate } from "./pipeline-board";

type ProjectRow = {
  id: string;
  title: string;
  company_name: string;
};

/**
 * The candidate pipeline as a board: one column per stage, in the order a
 * candidate moves through them. The same act as the detail page's stage
 * select — `updatePipelineStage` under the recruiter's own session — with
 * the whole mandate visible at once instead of one person at a time.
 */
export default async function PipelinePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  if (isSampleId(id)) {
    return (
      <SampleNotBuilt
        title="Pipeline board"
        context="Mandate module // one column per stage"
        backHref={`/app/projects/${id}`}
        backLabel="Mandate"
        scope="mandate"
      />
    );
  }

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

  const { data: candidateRows, error: candidatesError } = await supabase
    .from("candidates")
    .select(
      "id, full_name, current_title, current_company, pipeline_stage, cv_processing, cv_parse_error, updated_at"
    )
    .eq("project_id", id)
    .order("updated_at", { ascending: false });

  if (candidatesError) {
    redirect(`/app/projects/${id}`);
  }

  const candidates = (candidateRows ?? []) as BoardCandidate[];
  // Moving a card is the same write the stage select performs, so it is
  // offered to the same roles. Everyone else gets the board read-only —
  // the route stays open like the candidate list it mirrors.
  const canWrite = await hasCapability("candidates:write");

  return (
    <div className="min-h-full bg-surface text-on-surface">
      <div className="mx-auto max-w-[1600px] space-y-6 px-8 py-10">
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
          <span className="text-primary">Pipeline</span>
        </div>

        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-h1 text-h1 text-primary">PIPELINE BOARD</h1>
            <p className="mt-1 font-mono-label text-mono-label uppercase tracking-widest text-outline">
              {candidates.length} {candidates.length === 1 ? "candidate" : "candidates"} ·{" "}
              {project.company_name}
              {canWrite ? "" : " · read-only"}
            </p>
          </div>
          <Link
            href={`/app/projects/${project.id}/candidates`}
            prefetch={false}
            className="flex items-center gap-2 border border-outline-variant px-4 py-2 font-mono-label text-mono-label uppercase tracking-widest text-on-surface-variant transition-colors hover:border-primary hover:text-primary"
          >
            <IconChecklist size={14} />
            List view
          </Link>
        </header>

        <PipelineBoard
          projectId={project.id}
          candidates={candidates}
          canWrite={canWrite}
        />
      </div>
    </div>
  );
}
