"use server";

import { createServerSupabaseClient } from "@/lib/supabase-server";
import {
  ROLE_ANALYSIS_MAX,
  ROLE_ANALYSIS_MIN,
  type RoleAnalysisInput,
  type RoleAnalysisInputCandidate,
  type RoleAnalysisResult,
} from "@/lib/ai/role-analysis-agent";
import { runRoleAnalysis } from "@/lib/ai/run-role-analysis";
import {
  type CalibrationModel,
  type CompanyContext,
} from "@/lib/ai/role-analysis";
import type { CandidateProfile } from "@/lib/ai/cv-parsing";
import { normaliseRecruiterAssessment } from "@/lib/recruiter-assessment";

type AuthContext = {
  userId: string;
  organizationId: string;
};

async function requireActiveUser(): Promise<AuthContext> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthenticated.");
  const { data: profile, error } = await supabase
    .from("users")
    .select("organization_id, status")
    .eq("id", user.id)
    .single<{ organization_id: string | null; status: string }>();
  if (error || !profile?.organization_id || profile.status !== "active") {
    throw new Error("Account is not provisioned.");
  }
  return { userId: user.id, organizationId: profile.organization_id };
}

/**
 * Run the Role Analysis Agent against a recruiter-selected working set
 * of candidates. The action takes only ids; it pulls the full input
 * shape server-side so the caller can't manipulate calibration or
 * profile fields the agent reads.
 *
 * Returns the agent's result; persistence is left to the UI (the
 * caller decides whether to act on it, add to shortlist, etc.).
 */
export async function runRoleAnalysisAction(
  projectId: string,
  candidateIds: string[]
): Promise<RoleAnalysisResult> {
  if (!projectId) throw new Error("Missing projectId.");
  if (!Array.isArray(candidateIds) || candidateIds.length === 0) {
    throw new Error("Select at least one candidate to analyse.");
  }
  // Defence-in-depth: dedupe before the count check so duplicate ids
  // can't slip past the per-call cap.
  const uniqueIds = Array.from(new Set(candidateIds.filter((id) => !!id)));
  if (uniqueIds.length < ROLE_ANALYSIS_MIN) {
    throw new Error(
      `Select at least ${ROLE_ANALYSIS_MIN} candidates to compare.`
    );
  }
  if (uniqueIds.length > ROLE_ANALYSIS_MAX) {
    throw new Error(
      `Analysis is capped at ${ROLE_ANALYSIS_MAX} candidates per run.`
    );
  }

  const auth = await requireActiveUser();
  const supabase = await createServerSupabaseClient();

  // Pull project + selected candidates + scores in parallel.
  const [projectQ, candidatesQ, scoresQ] = await Promise.all([
    supabase
      .from("projects")
      .select(
        "id, title, company_name, calibration_model, company_context, organization_id"
      )
      .eq("id", projectId)
      .single<{
        id: string;
        title: string;
        company_name: string;
        calibration_model: Partial<CalibrationModel> | null;
        company_context: Partial<CompanyContext> | null;
        organization_id: string | null;
      }>(),
    supabase
      .from("candidates")
      .select(
        "id, project_id, full_name, current_title, current_company, archetype, cv_structured, recruiter_assessment"
      )
      .in("id", uniqueIds),
    supabase
      .from("candidate_scores")
      .select("candidate_id, rank_position, overall_score, tier")
      .eq("project_id", projectId)
      .in("candidate_id", uniqueIds),
  ]);

  if (projectQ.error || !projectQ.data) {
    throw new Error(
      `Failed to load project: ${projectQ.error?.message ?? "not found"}`
    );
  }
  const project = projectQ.data;

  // Cross-org safety: callers should never reach a project they don't
  // belong to (RLS already blocks this), but throw a clear error if it
  // somehow happens — easier to debug than a generic failure.
  if (
    project.organization_id &&
    project.organization_id !== auth.organizationId
  ) {
    throw new Error("Project belongs to a different organisation.");
  }

  type CandRow = {
    id: string;
    project_id: string | null;
    full_name: string;
    current_title: string | null;
    current_company: string | null;
    archetype: string | null;
    cv_structured: unknown;
    recruiter_assessment: unknown;
  };
  const candidates = (candidatesQ.data ?? []) as CandRow[];
  if (candidates.length === 0) {
    throw new Error("No candidates resolved for the selected ids.");
  }

  // Reject mixed-project sets — the agent ranks against ONE role's
  // calibration model, so cross-project comparison is undefined.
  const wrongProject = candidates.find(
    (c) => c.project_id && c.project_id !== projectId
  );
  if (wrongProject) {
    throw new Error(
      `Candidate "${wrongProject.full_name}" belongs to a different project. Pick candidates already in this role.`
    );
  }

  type ScoreRow = {
    candidate_id: string;
    rank_position: number | null;
    overall_score: number | null;
    tier: string | null;
  };
  const scoreById = new Map<string, ScoreRow>();
  for (const s of (scoresQ.data ?? []) as ScoreRow[]) {
    scoreById.set(s.candidate_id, s);
  }

  const inputCandidates: RoleAnalysisInputCandidate[] = candidates.map((c) => {
    const profile = (c.cv_structured ?? {}) as Partial<CandidateProfile>;
    const score = scoreById.get(c.id);
    const recruiter = normaliseRecruiterAssessment(c.recruiter_assessment);
    return {
      candidate_id: c.id,
      full_name: c.full_name,
      current_title: c.current_title,
      current_company: c.current_company,
      archetype: c.archetype,
      rank: score?.rank_position ?? null,
      overall_score: score?.overall_score ?? null,
      tier: score?.tier ?? null,
      profile: trimProfile(profile),
      recruiter_tier: recruiter.tier,
      recruiter_present: recruiter.would_present,
    } satisfies RoleAnalysisInputCandidate;
  });

  const input: RoleAnalysisInput = {
    role_title: project.calibration_model?.role_title ?? project.title,
    company_name:
      project.company_context?.company_name ?? project.company_name,
    calibration: project.calibration_model ?? {},
    candidates: inputCandidates,
  };

  return runRoleAnalysis(input, {
    projectId: project.id,
    organizationId: project.organization_id,
  });
}

/**
 * Strip the heaviest fields from the parsed profile so the prompt
 * stays compact. The agent doesn't need the full role history or full
 * tech exposure list to rank against the calibration weights.
 */
function trimProfile(profile: Partial<CandidateProfile>): Partial<CandidateProfile> {
  return {
    summary: profile.summary,
    domain: profile.domain,
    scale: profile.scale,
    years_experience: profile.years_experience,
    fit_dimensions: profile.fit_dimensions,
    fit_summary: profile.fit_summary,
    strengths: profile.strengths?.slice(0, 5),
    development_areas: profile.development_areas?.slice(0, 3),
    risks: profile.risks?.slice(0, 3),
    tech_exposure: profile.tech_exposure?.slice(0, 8),
    transformation_experience: profile.transformation_experience?.slice(0, 4),
  };
}
