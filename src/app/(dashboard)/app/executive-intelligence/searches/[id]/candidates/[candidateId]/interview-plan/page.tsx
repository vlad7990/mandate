import { notFound, redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { normalizeInterviewPlan } from "@/lib/ai/executive-interview-architect-agent";
import type { InterviewPlanRow } from "@/lib/executive/types";
import { PlanEmpty } from "./plan-empty";
import { PlanError } from "./plan-error";
import { PlanGate } from "./plan-gate";
import { PlanGenerating } from "./plan-generating";
import { PlanEditor, type PlanVersionSummary } from "./plan-editor";

// Server-action generation runs in an after() callback on this route; give it a
// generous ceiling so an 8000-token plan (~90–100s) completes before the function
// is reclaimed. Matches Vercel's current default; set explicitly so it survives
// default changes.
export const maxDuration = 300;

type Params = Promise<{ id: string; candidateId: string }>;

/**
 * State routing mirrors the success-profile page. Side-effect free — generation
 * only starts from explicit user clicks. Gated: without an approved success
 * profile for the search, the plan cannot be built, so we show <PlanGate />.
 */
export default async function InterviewPlanPage({ params }: { params: Params }) {
  const { id, candidateId } = await params;
  const supabase = await createServerSupabaseClient();

  const { data: search, error: searchError } = await supabase
    .from("executive_searches")
    .select("id, role_title, company_name")
    .eq("id", id)
    .single<{ id: string; role_title: string; company_name: string }>();

  if (searchError || !search) {
    if (searchError?.code === "PGRST116") notFound();
    redirect("/app/executive-intelligence/searches");
  }

  // Candidate must be linked to this search (via the join table). RLS + the
  // inner-join shape mean an unlinked/foreign candidate yields no row.
  const { data: link, error: linkError } = await supabase
    .from("executive_search_candidates")
    .select("candidate_id, candidates(id, full_name)")
    .eq("search_id", id)
    .eq("candidate_id", candidateId)
    .maybeSingle<{
      candidate_id: string;
      candidates: { id: string; full_name: string } | null;
    }>();

  if (linkError) {
    redirect(`/app/executive-intelligence/searches/${id}/candidates`);
  }
  if (!link || !link.candidates) {
    notFound();
  }
  const candidateName = link.candidates.full_name;

  // Gate: require an approved success profile for the search.
  const { data: approvedProfile } = await supabase
    .from("role_success_profiles")
    .select("id")
    .eq("search_id", id)
    .eq("status", "approved")
    .maybeSingle();

  if (!approvedProfile) {
    return (
      <PlanGate searchId={search.id} candidateName={candidateName} />
    );
  }

  const { data: planRows, error: plansError } = await supabase
    .from("executive_interview_plans")
    .select(
      "id, search_id, candidate_id, organization_id, source_profile_id, version, content_json, status, prompt_version, model_version, is_generating, generation_error, created_by, approved_by, approved_at, created_at, updated_at"
    )
    .eq("search_id", id)
    .eq("candidate_id", candidateId)
    .order("version", { ascending: false });

  if (plansError) {
    redirect(`/app/executive-intelligence/searches/${id}/candidates`);
  }

  const rows = (planRows ?? []) as InterviewPlanRow[];

  if (rows.length === 0) {
    return (
      <PlanEmpty
        searchId={search.id}
        candidateId={candidateId}
        candidateName={candidateName}
      />
    );
  }

  const healthy = rows.filter((r) => !r.is_generating && !r.generation_error);
  const editorRow =
    healthy.find((r) => r.status === "approved") ?? healthy[0] ?? null;
  const activeGenerationRow = rows.find((r) => r.is_generating) ?? null;
  const failedGenerationRow = rows.find((r) => r.generation_error) ?? null;

  if (failedGenerationRow && !editorRow) {
    return (
      <PlanError
        searchId={search.id}
        candidateId={candidateId}
        candidateName={candidateName}
        version={failedGenerationRow.version}
        errorMessage={failedGenerationRow.generation_error ?? "Generation failed."}
      />
    );
  }

  if (activeGenerationRow && !editorRow) {
    return (
      <PlanGenerating
        searchId={search.id}
        candidateId={candidateId}
        candidateName={candidateName}
        planId={activeGenerationRow.id}
        version={activeGenerationRow.version}
      />
    );
  }

  if (!editorRow) {
    redirect(`/app/executive-intelligence/searches/${id}/candidates`);
  }

  let approverName: string | null = null;
  if (editorRow.approved_by) {
    const { data: approver } = await supabase
      .from("users")
      .select("full_name, email")
      .eq("id", editorRow.approved_by)
      .maybeSingle<{ full_name: string | null; email: string | null }>();
    approverName = approver?.full_name?.trim() || approver?.email || null;
  }

  const versions: PlanVersionSummary[] = rows.map((r) => ({
    id: r.id,
    version: r.version,
    status: r.status,
    is_generating: r.is_generating,
    generation_error: r.generation_error,
  }));

  return (
    <PlanEditor
      key={editorRow.id}
      searchId={search.id}
      candidateId={candidateId}
      candidateName={candidateName}
      planId={editorRow.id}
      version={editorRow.version}
      status={editorRow.status}
      promptVersion={editorRow.prompt_version}
      modelVersion={editorRow.model_version}
      approvedAt={editorRow.approved_at}
      approverName={approverName}
      updatedAt={editorRow.updated_at}
      content={normalizeInterviewPlan(editorRow.content_json)}
      versions={versions}
      activeGeneration={
        activeGenerationRow ? { version: activeGenerationRow.version } : null
      }
      failedGeneration={
        failedGenerationRow
          ? {
              version: failedGenerationRow.version,
              error: failedGenerationRow.generation_error ?? "Generation failed.",
            }
          : null
      }
    />
  );
}
