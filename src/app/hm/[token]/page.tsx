import { notFound } from "next/navigation";
import { getServiceRoleSupabaseClient } from "@/lib/supabase-service-role";
import { normaliseRecruiterAssessment } from "@/lib/recruiter-assessment";
import {
  buildCandidateEvidence,
  buildComparisonGrid,
} from "@/lib/comparison/evidence-index";
import { extractEvidence } from "@/lib/comparison/evidence-extractors";
import type { CandidateProfile } from "@/lib/ai/cv-parsing";
import type { CalibrationModel } from "@/lib/ai/role-analysis";
import {
  IconLock,
} from "@/components/icons";
import {
  PortalContent,
  buildPortalCandidate,
  type PortalCandidate,
  type PortalProgress,
} from "@/app/(dashboard)/app/projects/[id]/hiring-manager/portal-content";

// Public hiring-manager portal. The route accepts a uuid token in the
// URL, verifies it via the SECURITY DEFINER `verify_hm_token` RPC, and
// renders the same portal content the founder sees in preview — but
// with the feedback form enabled and submitting back through this
// route's API handler.
//
// All reads after token verification go through the service-role
// client so RLS doesn't reject them. Each query is scoped to the
// token's project_id; nothing else is exposed.

type ProjectRow = {
  id: string;
  title: string;
  company_name: string;
  status: string | null;
  calibration_model: Partial<CalibrationModel> | null;
};

type ShortlistRow = {
  candidate_ids: string[];
  updated_at: string;
};

type CandidateRow = {
  id: string;
  full_name: string;
  current_title: string | null;
  current_company: string | null;
  cv_structured: unknown;
  recruiter_assessment: unknown;
  pipeline_stage: string | null;
};

type ScoreRow = {
  candidate_id: string;
  rank_position: number | null;
  overall_score: number | null;
  tier: string | null;
  technical_score: number | null;
  domain_score: number | null;
  leadership_score: number | null;
  regulatory_score: number | null;
  transformation_score: number | null;
};

export default async function HiringManagerPublicPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // Validate the token shape before hitting the database.
  if (!isUuid(token)) {
    return <PortalAccessDenied reason="invalid" />;
  }

  const supabase = getServiceRoleSupabaseClient();
  const { data: verifyRows, error: verifyErr } = await supabase.rpc(
    "verify_hm_token",
    { p_token: token }
  );
  if (verifyErr) {
    console.error("[hm/portal] token verification failed", verifyErr);
    return <PortalAccessDenied reason="error" />;
  }
  type VerifyRow = {
    project_id: string;
    organization_id: string;
    label: string;
  };
  const verified = (verifyRows as VerifyRow[] | null)?.[0] ?? null;
  if (!verified) {
    return <PortalAccessDenied reason="expired" />;
  }

  // Record the visit on the activity trail — the event 053 declared and
  // could not write from this sessionless path (§5b; migration 063).
  // Fire-and-forget: a trail write must never block or break the portal,
  // and the function itself debounces refreshes to one event per hour.
  supabase
    .rpc("record_hm_portal_opened", { p_token: token })
    .then(({ error }: { error: { message: string } | null }) => {
      if (error) console.error("[hm/portal] visit event failed", error);
    });

  // Token is valid. Fetch the project + shortlist + candidates +
  // scores scoped to the verified project_id.
  const [projectQ, shortlistQ, candidatesQ, scoresQ] = await Promise.all([
    supabase
      .from("projects")
      .select("id, title, company_name, status, calibration_model")
      .eq("id", verified.project_id)
      .single<ProjectRow>(),
    supabase
      .from("shortlists")
      .select("candidate_ids, updated_at")
      .eq("project_id", verified.project_id)
      .maybeSingle<ShortlistRow>(),
    supabase
      .from("candidates")
      .select(
        "id, full_name, current_title, current_company, cv_structured, recruiter_assessment, pipeline_stage"
      )
      .eq("project_id", verified.project_id),
    supabase
      .from("candidate_scores")
      .select(
        "candidate_id, rank_position, overall_score, tier, technical_score, domain_score, leadership_score, regulatory_score, transformation_score"
      )
      .eq("project_id", verified.project_id),
  ]);

  if (projectQ.error || !projectQ.data) {
    notFound();
  }
  const project = projectQ.data;
  const shortlist = shortlistQ.data;
  const candidates = (candidatesQ.data ?? []) as CandidateRow[];
  const scores = (scoresQ.data ?? []) as ScoreRow[];

  const portalCandidates = shapeSlate(shortlist, candidates, scores);
  const progress = computeProgress(candidates, shortlist);

  // Evidence coverage for the shortlisted people only — the hiring manager is
  // being asked about the slate, not about everyone the search touched.
  const scoreByCandidate = new Map(scores.map((s) => [s.candidate_id, s]));
  const weights = project.calibration_model?.dimension_weights ?? null;
  const evidenceGrid = buildComparisonGrid(
    portalCandidates.map((pc) => {
      const source = candidates.find((c) => c.id === pc.id);
      return buildCandidateEvidence(
        {
          candidate_id: pc.id,
          full_name: pc.full_name,
          items: extractEvidence({
            scores: scoreByCandidate.get(pc.id) ?? null,
            cv:
              source?.cv_structured && typeof source.cv_structured === "object"
                ? (source.cv_structured as Partial<CandidateProfile>)
                : null,
            recruiter: normaliseRecruiterAssessment(source?.recruiter_assessment)
              .dimension_notes,
          }),
        },
        weights
      );
    }),
    weights
  );

  return (
    <PortalContent
      projectId={project.id}
      projectTitle={project.title}
      companyName={project.company_name}
      candidates={portalCandidates}
      progress={progress}
      mode="hiring_manager"
      submitHandle={token}
      evidenceGrid={evidenceGrid}
    />
  );
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value
  );
}

function shapeSlate(
  shortlist: ShortlistRow | null,
  candidates: CandidateRow[],
  scores: ScoreRow[]
): PortalCandidate[] {
  const candById = new Map(candidates.map((c) => [c.id, c]));
  const scoreById = new Map<string, ScoreRow>();
  for (const s of scores) scoreById.set(s.candidate_id, s);

  const ids = shortlist?.candidate_ids?.length
    ? shortlist.candidate_ids
    : candidates
        .map((c) => c.id)
        .filter((cid) => scoreById.get(cid)?.rank_position != null)
        .sort((a, b) => {
          const ar = scoreById.get(a)?.rank_position ?? 999;
          const br = scoreById.get(b)?.rank_position ?? 999;
          return ar - br;
        })
        .slice(0, 5);

  return ids
    .map((cid) => {
      const base = candById.get(cid);
      if (!base) return null;
      const score = scoreById.get(cid) ?? null;
      const recruiter = normaliseRecruiterAssessment(base.recruiter_assessment);
      return buildPortalCandidate(base, score, recruiter);
    })
    .filter((c): c is PortalCandidate => c != null);
}

function computeProgress(
  candidates: CandidateRow[],
  shortlist: ShortlistRow | null
): PortalProgress {
  const reviewed = candidates.filter((c) => {
    const stage = c.pipeline_stage ?? "found";
    return [
      "reviewed",
      "matched",
      "shortlisted",
      "submitted",
      "interviewed",
      "passed_rounds",
      "finalist",
      "offer",
      "hired",
    ].includes(stage);
  }).length;
  return {
    candidates_reviewed: reviewed,
    candidates_total: candidates.length,
    last_updated: shortlist?.updated_at ?? null,
    search_status: shortlist?.candidate_ids?.length
      ? "Shortlist live"
      : candidates.length > 0
        ? "Slate building"
        : "Sourcing",
  };
}

function PortalAccessDenied({
  reason,
}: {
  reason: "invalid" | "expired" | "error";
}) {
  const message =
    reason === "invalid"
      ? "This link is malformed."
      : reason === "expired"
        ? "This link has expired or been revoked. Reach out to the recruiter for a fresh one."
        : "Something went wrong verifying your access. Please try again.";
  return (
    <div className="bg-surface-container border border-outline-variant px-6 py-12 text-center space-y-3 mx-auto max-w-md">
      <div className="w-14 h-14 mx-auto border border-error/40 bg-error/10 flex items-center justify-center">
        <IconLock size={24} className="text-error" />
      </div>
      <h2 className="font-h2 text-h2 text-on-surface">Access denied</h2>
      <p className="text-body-main text-on-surface-variant leading-relaxed">
        {message}
      </p>
    </div>
  );
}
