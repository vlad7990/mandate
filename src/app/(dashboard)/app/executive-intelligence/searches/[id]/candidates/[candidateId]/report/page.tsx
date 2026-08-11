import { notFound, redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { isSampleId } from "@/lib/sample";
import { SampleEiReport } from "@/components/sample/sample-ei-report";
import { normalizeAssessment } from "@/lib/ai/executive-assessment";
import { normalizeInterviewPlan } from "@/lib/ai/executive-interview-architect-agent";
import { normalizeSuccessProfile } from "@/lib/ai/executive-role-architect-agent";
import { compileExecutiveReport } from "@/lib/executive/report";
import type { OperationalWeight } from "@/lib/executive/assessment-scoring";
import {
  EXEC_CANDIDATE_STAGE_LABELS,
  type ExecutiveCandidateStage,
  type ProfileStatus,
} from "@/lib/executive/types";
import { ExecutiveReportDocument } from "./report-document";
import { ReportGate, type ReportSource, type ReportSourceState } from "./report-gate";

export const metadata = { title: "Executive Intelligence report" };

type Params = Promise<{ id: string; candidateId: string }>;

/** A versioned artifact row, in the only shape this page needs. */
type VersionedRow = {
  id: string;
  version: number;
  status: ProfileStatus;
  content_json: unknown;
  approved_at: string | null;
  approved_by: string | null;
};

/**
 * The approved row, plus what to tell the recruiter when there isn't one.
 * Rows arrive newest-version-first, so `rows[0]` is the live draft.
 */
function sourceState(rows: VersionedRow[]): ReportSourceState {
  const approved = rows.find((r) => r.status === "approved");
  if (approved) return { kind: "approved", version: approved.version };
  if (rows.length > 0) return { kind: "draft", version: rows[0].version };
  return { kind: "missing" };
}

/**
 * The Executive Intelligence report — comp 12.
 *
 * Compiled, not generated. Every figure comes from three approved records
 * (success profile, interview plan, human-authored assessment) joined to the
 * search's current competency weights, with coverage recomputed server-side by
 * `compileExecutiveReport` — a stored rollup is never trusted for display.
 * There is no model call on this path at all.
 *
 * Without all three approvals the page shows the gate and names which record
 * is outstanding. A partial document would be worse than no document: this one
 * goes to a client.
 */
export default async function EiReportPage({ params }: { params: Params }) {
  const { id, candidateId } = await params;

  // Sample ids never touch the database — checked before the client is
  // constructed, which is the whole routing contract for sample data.
  if (isSampleId(id) && isSampleId(candidateId)) {
    return <SampleEiReport searchId={id} />;
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

  // The candidate must be linked to this search — same check as every other
  // per-candidate page in the module.
  const { data: link, error: linkError } = await supabase
    .from("executive_search_candidates")
    .select("stage, candidates(id, full_name)")
    .eq("search_id", id)
    .eq("candidate_id", candidateId)
    .maybeSingle<{
      stage: ExecutiveCandidateStage;
      candidates: { id: string; full_name: string } | null;
    }>();

  if (linkError) {
    redirect(`/app/executive-intelligence/searches/${id}/candidates`);
  }
  if (!link?.candidates) {
    notFound();
  }
  const candidateName = link.candidates.full_name;

  const versioned = "id, version, status, content_json, approved_at, approved_by";

  const [profileRes, planRes, assessmentRes, weightRes] = await Promise.all([
    supabase
      .from("role_success_profiles")
      .select(versioned)
      .eq("search_id", id)
      .order("version", { ascending: false }),
    supabase
      .from("executive_interview_plans")
      .select(versioned)
      .eq("search_id", id)
      .eq("candidate_id", candidateId)
      .order("version", { ascending: false }),
    supabase
      .from("executive_assessments")
      .select(versioned)
      .eq("search_id", id)
      .eq("candidate_id", candidateId)
      .order("version", { ascending: false }),
    supabase
      .from("executive_search_competencies")
      .select("weight, executive_competencies(key, name)")
      .eq("search_id", id)
      .order("weight", { ascending: false }),
  ]);

  if (profileRes.error || planRes.error || assessmentRes.error || weightRes.error) {
    redirect(`/app/executive-intelligence/searches/${id}/candidates`);
  }

  const profiles = (profileRes.data ?? []) as unknown as VersionedRow[];
  const plans = (planRes.data ?? []) as unknown as VersionedRow[];
  const assessments = (assessmentRes.data ?? []) as unknown as VersionedRow[];

  const candidateBase = `/app/executive-intelligence/searches/${id}/candidates/${candidateId}`;
  const sources: ReportSource[] = [
    {
      label: "Success profile",
      role: "What the role requires, and the competency weights everything is measured against.",
      state: sourceState(profiles),
      href: `/app/executive-intelligence/searches/${id}/success-profile`,
    },
    {
      label: "Interview plan",
      role: "The stages this candidate was assessed through — the provenance behind each piece of evidence.",
      state: sourceState(plans),
      href: `${candidateBase}/interview-plan`,
    },
    {
      label: "Assessment",
      role: "The evidence an interviewer recorded. Human-authored; no agent writes it.",
      state: sourceState(assessments),
      href: `${candidateBase}/assessment`,
    },
  ];

  const approvedProfile = profiles.find((r) => r.status === "approved");
  const approvedPlan = plans.find((r) => r.status === "approved");
  const approvedAssessment = assessments.find((r) => r.status === "approved");

  if (!approvedProfile || !approvedPlan || !approvedAssessment) {
    return (
      <ReportGate
        searchId={id}
        candidateName={candidateName}
        sources={sources}
      />
    );
  }

  // Approver names, in one query. An id with no matching user row stays null
  // and the provenance block says "approver not recorded" rather than
  // printing a uuid on a document that goes to a client.
  const approverIds = [
    ...new Set(
      [
        approvedProfile.approved_by,
        approvedPlan.approved_by,
        approvedAssessment.approved_by,
      ].filter((v): v is string => Boolean(v))
    ),
  ];
  const nameById = new Map<string, string>();
  if (approverIds.length > 0) {
    const { data: approvers } = await supabase
      .from("users")
      .select("id, full_name, email")
      .in("id", approverIds);
    for (const u of (approvers ?? []) as {
      id: string;
      full_name: string | null;
      email: string | null;
    }[]) {
      const name = u.full_name?.trim() || u.email;
      if (name) nameById.set(u.id, name);
    }
  }
  const approverName = (userId: string | null) =>
    userId ? (nameById.get(userId) ?? null) : null;

  type CompetencyEmbed = { key: string; name: string };
  const weights: OperationalWeight[] = (
    (weightRes.data ?? []) as unknown as Array<{
      weight: number;
      executive_competencies: CompetencyEmbed | CompetencyEmbed[] | null;
    }>
  ).flatMap((r) => {
    const comp = Array.isArray(r.executive_competencies)
      ? r.executive_competencies[0]
      : r.executive_competencies;
    return comp
      ? [{ competency_key: comp.key, label: comp.name, weight: r.weight }]
      : [];
  });

  const profileContent = normalizeSuccessProfile(approvedProfile.content_json);
  const planContent = normalizeInterviewPlan(approvedPlan.content_json);

  const report = compileExecutiveReport({
    candidateName,
    roleTitle: search.role_title,
    companyName: search.company_name,
    profile: {
      version: approvedProfile.version,
      approvedAt: approvedProfile.approved_at,
      approverName: approverName(approvedProfile.approved_by),
      roleMission: profileContent.role_mission,
      strategicMandate: profileContent.strategic_mandate,
    },
    plan: {
      version: approvedPlan.version,
      approvedAt: approvedPlan.approved_at,
      approverName: approverName(approvedPlan.approved_by),
      stageNames: planContent.stages.map((s) => s.stage_name),
    },
    assessment: {
      version: approvedAssessment.version,
      approvedAt: approvedAssessment.approved_at,
      approverName: approverName(approvedAssessment.approved_by),
      content: normalizeAssessment(approvedAssessment.content_json),
    },
    weights,
  });

  return (
    <ExecutiveReportDocument
      report={report}
      searchId={id}
      candidateId={candidateId}
      stageLabel={EXEC_CANDIDATE_STAGE_LABELS[link.stage] ?? "In diligence"}
    />
  );
}
