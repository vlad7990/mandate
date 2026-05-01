"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import {
  ROLE_ANALYSIS_MAX,
  ROLE_ANALYSIS_MIN,
  type RoleAnalysisInput,
  type RoleAnalysisInputCandidate,
  type RoleAnalysisResult,
} from "@/lib/ai/role-analysis-agent";
import { runRoleAnalysis } from "@/lib/ai/run-role-analysis";
import { runClientPsychology } from "@/lib/ai/run-client-psychology";
import { runCompanyCulture } from "@/lib/ai/run-company-culture";
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

// ────────────────────────────────────────────────────────────────────────
// Client Psychology Agent — derive HM preference model from feedback
// ────────────────────────────────────────────────────────────────────────

export async function generateClientPsychologyAction(projectId: string) {
  if (!projectId) throw new Error("Missing projectId.");
  const auth = await requireActiveUser();
  const supabase = await createServerSupabaseClient();

  const { data: project, error: projectErr } = await supabase
    .from("projects")
    .select(
      "id, title, company_name, calibration_model, onboarding_responses, organization_id"
    )
    .eq("id", projectId)
    .single<{
      id: string;
      title: string;
      company_name: string;
      calibration_model: unknown;
      onboarding_responses: unknown;
      organization_id: string | null;
    }>();

  if (projectErr || !project) throw new Error("Project not found.");
  if (project.organization_id !== auth.organizationId) {
    throw new Error("Project belongs to a different organisation.");
  }

  const [feedbackQ, reviewsQ, candidatesQ] = await Promise.all([
    supabase
      .from("feedback")
      .select(
        "feedback_type, content, candidate_id, interpreted, triggered_recalibration, created_at"
      )
      .eq("project_id", projectId)
      .order("created_at", { ascending: false }),
    supabase
      .from("hiring_manager_reviews")
      .select("candidate_ratings, top_concern, hm_label, submitted_at")
      .eq("project_id", projectId)
      .order("submitted_at", { ascending: false })
      .limit(20),
    supabase
      .from("candidates")
      .select("id, full_name")
      .eq("project_id", projectId),
  ]);

  type FbRow = {
    feedback_type: string;
    content: string;
    candidate_id: string | null;
    interpreted: { summary?: string } | null;
    triggered_recalibration: boolean;
    created_at: string;
  };
  const feedback = (feedbackQ.data ?? []) as FbRow[];
  if (feedback.length < 3) {
    throw new Error(
      "Need at least 3 feedback rows before the agent can detect patterns."
    );
  }

  const candById = new Map<string, string>();
  for (const c of (candidatesQ.data ?? []) as Array<{
    id: string;
    full_name: string;
  }>) {
    candById.set(c.id, c.full_name);
  }

  const result = await runClientPsychology(
    {
      project: {
        title: project.title,
        company_name: project.company_name,
        calibration: project.calibration_model ?? {},
        onboarding: project.onboarding_responses ?? {},
      },
      feedback_count: feedback.length,
      feedback_rows: feedback.map((f) => ({
        feedback_type: f.feedback_type,
        content: f.content,
        candidate_id: f.candidate_id,
        candidate_name: f.candidate_id
          ? candById.get(f.candidate_id) ?? null
          : null,
        interpreted_summary: f.interpreted?.summary ?? null,
        triggered_recalibration: f.triggered_recalibration,
        created_at: f.created_at,
      })),
      hm_reviews: ((reviewsQ.data ?? []) as Array<{
        candidate_ratings: unknown;
        top_concern: string;
        hm_label: string;
        submitted_at: string;
      }>).map((r) => ({
        candidate_ratings: r.candidate_ratings,
        top_concern: r.top_concern,
        hm_label: r.hm_label,
        submitted_at: r.submitted_at,
      })),
    },
    {
      projectId,
      organizationId: project.organization_id,
    }
  );

  const { error: updateErr } = await supabase
    .from("projects")
    .update({
      client_psychology: result,
      updated_at: new Date().toISOString(),
    })
    .eq("id", projectId);
  if (updateErr) {
    throw new Error(
      `Failed to persist client psychology: ${updateErr.message}`
    );
  }

  revalidatePath(`/projects/${projectId}`);
  return result;
}

// ────────────────────────────────────────────────────────────────────────
// Company Culture Agent — derive culture profile
// ────────────────────────────────────────────────────────────────────────

export async function generateCompanyCultureAction(
  projectId: string,
  recruiterContext?: string
) {
  if (!projectId) throw new Error("Missing projectId.");
  const auth = await requireActiveUser();
  const supabase = await createServerSupabaseClient();

  const { data: project, error: projectErr } = await supabase
    .from("projects")
    .select(
      "id, company_context, onboarding_responses, organization_id"
    )
    .eq("id", projectId)
    .single<{
      id: string;
      company_context: unknown;
      onboarding_responses: unknown;
      organization_id: string | null;
    }>();

  if (projectErr || !project) throw new Error("Project not found.");
  if (project.organization_id !== auth.organizationId) {
    throw new Error("Project belongs to a different organisation.");
  }

  const { data: feedback } = await supabase
    .from("feedback")
    .select("feedback_type, content, interpreted, created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(20);

  type FbRow = {
    feedback_type: string;
    content: string;
    interpreted: { summary?: string } | null;
    created_at: string;
  };
  const feedback_summaries = ((feedback ?? []) as FbRow[]).map((f) => ({
    feedback_type: f.feedback_type,
    summary: f.interpreted?.summary ?? null,
    content: f.content,
    created_at: f.created_at,
  }));

  const result = await runCompanyCulture(
    {
      company: project.company_context ?? {},
      onboarding: project.onboarding_responses ?? {},
      feedback_summaries,
    },
    {
      projectId,
      organizationId: project.organization_id,
      recruiterContext,
    }
  );

  // Merge into existing company_context.{culture_profile, culture_context}.
  const currentCompany = (project.company_context ?? {}) as Record<
    string,
    unknown
  >;
  const trimmedContext = recruiterContext?.trim() ?? "";
  const nextCompany: Record<string, unknown> = {
    ...currentCompany,
    culture_profile: result,
  };
  if (trimmedContext.length > 0) {
    nextCompany.culture_context = trimmedContext;
  } else {
    delete nextCompany.culture_context;
  }

  const { error: updateErr } = await supabase
    .from("projects")
    .update({
      company_context: nextCompany,
      updated_at: new Date().toISOString(),
    })
    .eq("id", projectId);
  if (updateErr) {
    throw new Error(
      `Failed to persist culture profile: ${updateErr.message}`
    );
  }

  revalidatePath(`/projects/${projectId}`);
  return result;
}

// ────────────────────────────────────────────────────────────────────────
// Recruiter overlays for the Culture Intelligence panel
//
// Annotations + flags live inside company_context as sibling keys
// (culture_notes, culture_flags). We use read-modify-write here
// because company_context doesn't yet have an atomic single-key RPC
// — the row is rarely contended for writes (one recruiter at a time
// per project) so the race window is small.
// ────────────────────────────────────────────────────────────────────────

export async function saveCultureAnnotationAction(
  projectId: string,
  sectionKey: string,
  note: string
): Promise<void> {
  if (!projectId) throw new Error("Missing projectId.");
  const key = sectionKey.trim();
  if (!key) throw new Error("Section key is required.");

  const auth = await requireActiveUser();
  const supabase = await createServerSupabaseClient();

  const { data: project, error } = await supabase
    .from("projects")
    .select("company_context, organization_id")
    .eq("id", projectId)
    .single<{
      company_context: unknown;
      organization_id: string | null;
    }>();
  if (error || !project) throw new Error("Project not found.");
  if (project.organization_id !== auth.organizationId) {
    throw new Error("Project belongs to a different organisation.");
  }

  const company = (project.company_context ?? {}) as Record<string, unknown>;
  const existingNotes =
    (company.culture_notes as
      | Record<string, { note: string; updated_at: string }>
      | undefined) ?? {};

  const trimmedNote = note.trim();
  let nextNotes: Record<string, { note: string; updated_at: string }>;
  if (trimmedNote.length === 0) {
    const { [key]: _drop, ...rest } = existingNotes;
    void _drop;
    nextNotes = rest;
  } else {
    nextNotes = {
      ...existingNotes,
      [key]: { note: trimmedNote, updated_at: new Date().toISOString() },
    };
  }

  const nextCompany: Record<string, unknown> = { ...company };
  if (Object.keys(nextNotes).length === 0) {
    delete nextCompany.culture_notes;
  } else {
    nextCompany.culture_notes = nextNotes;
  }

  const { error: updateErr } = await supabase
    .from("projects")
    .update({
      company_context: nextCompany,
      updated_at: new Date().toISOString(),
    })
    .eq("id", projectId);
  if (updateErr) {
    throw new Error(`Failed to save annotation: ${updateErr.message}`);
  }

  revalidatePath(`/projects/${projectId}`);
}

export async function toggleCultureFlagAction(
  projectId: string,
  axisKey: string
): Promise<void> {
  if (!projectId) throw new Error("Missing projectId.");
  const key = axisKey.trim();
  if (!key) throw new Error("Axis key is required.");

  const auth = await requireActiveUser();
  const supabase = await createServerSupabaseClient();

  const { data: project, error } = await supabase
    .from("projects")
    .select("company_context, organization_id")
    .eq("id", projectId)
    .single<{
      company_context: unknown;
      organization_id: string | null;
    }>();
  if (error || !project) throw new Error("Project not found.");
  if (project.organization_id !== auth.organizationId) {
    throw new Error("Project belongs to a different organisation.");
  }

  const company = (project.company_context ?? {}) as Record<string, unknown>;
  const existing = Array.isArray(company.culture_flags)
    ? (company.culture_flags as unknown[]).filter(
        (v): v is string => typeof v === "string"
      )
    : [];

  const next = existing.includes(key)
    ? existing.filter((k) => k !== key)
    : [...existing, key];

  const nextCompany: Record<string, unknown> = { ...company };
  if (next.length === 0) {
    delete nextCompany.culture_flags;
  } else {
    nextCompany.culture_flags = next;
  }

  const { error: updateErr } = await supabase
    .from("projects")
    .update({
      company_context: nextCompany,
      updated_at: new Date().toISOString(),
    })
    .eq("id", projectId);
  if (updateErr) {
    throw new Error(`Failed to toggle flag: ${updateErr.message}`);
  }

  revalidatePath(`/projects/${projectId}`);
}
