import { notFound, redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { normalizeAssessment } from "@/lib/ai/executive-assessment";
import type { AssessmentRow } from "@/lib/executive/types";
import { AssessmentEmpty } from "./assessment-empty";
import { AssessmentGate } from "./assessment-gate";
import {
  AssessmentEditor,
  type AssessmentVersionSummary,
} from "./assessment-editor";
import { isSampleId } from "@/lib/sample";
import { SampleEiAssessment } from "@/components/sample/sample-ei-assessment";

type Params = Promise<{ id: string; candidateId: string }>;

/**
 * State routing mirrors the interview-plan page, minus the AI generation states
 * (assessments are human-authored). Gated: without an approved interview plan
 * for this candidate, the assessment has no structure to build on, so we show
 * <AssessmentGate />.
 */
export default async function AssessmentPage({ params }: { params: Params }) {
  const { id, candidateId } = await params;

  // W7 filled this in. The inventory listed this screen `generated` and
  // blocked on D1; there is no agent anywhere in its action file. See the
  // header of `sample-ei-assessment.tsx`.
  if (isSampleId(id) || isSampleId(candidateId)) {
    return <SampleEiAssessment candidateId={candidateId} />;
  }
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

  // Candidate must be linked to this search (via the join table).
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

  // Gate: require an approved interview plan for this candidate.
  const { data: approvedPlan } = await supabase
    .from("executive_interview_plans")
    .select("id")
    .eq("search_id", id)
    .eq("candidate_id", candidateId)
    .eq("status", "approved")
    .maybeSingle();

  if (!approvedPlan) {
    return (
      <AssessmentGate
        searchId={search.id}
        candidateId={candidateId}
        candidateName={candidateName}
      />
    );
  }

  const { data: assessmentRows, error: rowsError } = await supabase
    .from("executive_assessments")
    .select(
      "id, search_id, candidate_id, organization_id, source_plan_id, version, content_json, status, created_by, approved_by, approved_at, created_at, updated_at"
    )
    .eq("search_id", id)
    .eq("candidate_id", candidateId)
    .order("version", { ascending: false });

  if (rowsError) {
    redirect(`/app/executive-intelligence/searches/${id}/candidates`);
  }

  const rows = (assessmentRows ?? []) as AssessmentRow[];

  if (rows.length === 0) {
    return (
      <AssessmentEmpty
        searchId={search.id}
        candidateId={candidateId}
        candidateName={candidateName}
      />
    );
  }

  const editorRow = rows.find((r) => r.status === "approved") ?? rows[0];

  let approverName: string | null = null;
  if (editorRow.approved_by) {
    const { data: approver } = await supabase
      .from("users")
      .select("full_name, email")
      .eq("id", editorRow.approved_by)
      .maybeSingle<{ full_name: string | null; email: string | null }>();
    approverName = approver?.full_name?.trim() || approver?.email || null;
  }

  const versions: AssessmentVersionSummary[] = rows.map((r) => ({
    id: r.id,
    version: r.version,
    status: r.status,
  }));

  return (
    <AssessmentEditor
      key={editorRow.id}
      searchId={search.id}
      candidateId={candidateId}
      candidateName={candidateName}
      assessmentId={editorRow.id}
      version={editorRow.version}
      status={editorRow.status}
      approvedAt={editorRow.approved_at}
      approverName={approverName}
      updatedAt={editorRow.updated_at}
      content={normalizeAssessment(editorRow.content_json)}
      versions={versions}
    />
  );
}
