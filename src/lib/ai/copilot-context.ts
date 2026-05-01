import "server-only";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Build the structured project snapshot that the Copilot model sees on
 * every turn. Optimised for token economy: trim heavy fields, cap
 * arrays, drop large free-text columns the model doesn't need.
 *
 * Returns null when the user has no access to the project — the
 * caller should refuse to stream in that case.
 */
export async function loadCopilotProjectContext(
  projectId: string,
  candidateId: string | null
): Promise<Record<string, unknown> | null> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("users")
    .select("organization_id, status")
    .eq("id", user.id)
    .single<{ organization_id: string | null; status: string }>();
  if (
    !profile ||
    profile.status !== "active" ||
    !profile.organization_id
  ) {
    return null;
  }

  const [projectQ, candidatesQ, scoresQ, feedbackQ, shortlistQ] =
    await Promise.all([
      supabase
        .from("projects")
        .select(
          "id, title, company_name, status, calibration_model, company_context, recalibration_summary, client_psychology, health_suggestions, onboarding_responses, organization_id"
        )
        .eq("id", projectId)
        .single(),
      supabase
        .from("candidates")
        .select(
          "id, full_name, current_title, current_company, archetype, pipeline_stage, cv_structured, recruiter_assessment"
        )
        .eq("project_id", projectId),
      supabase
        .from("candidate_scores")
        .select(
          "candidate_id, technical_score, domain_score, leadership_score, regulatory_score, transformation_score, overall_score, tier, rank_position, previous_rank"
        )
        .eq("project_id", projectId)
        .order("rank_position", { ascending: true }),
      supabase
        .from("feedback")
        .select(
          "feedback_type, content, candidate_id, interpreted, triggered_recalibration, created_at"
        )
        .eq("project_id", projectId)
        .order("created_at", { ascending: false })
        .limit(8),
      supabase
        .from("shortlists")
        .select("candidate_ids, label, created_at")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false })
        .limit(1),
    ]);

  const project = projectQ.data as
    | {
        id: string;
        title: string;
        company_name: string;
        status: string | null;
        calibration_model: unknown;
        company_context: unknown;
        recalibration_summary: unknown;
        client_psychology: unknown;
        health_suggestions: unknown;
        onboarding_responses: unknown;
        organization_id: string | null;
      }
    | null;

  if (!project) return null;
  if (project.organization_id !== profile.organization_id) return null;

  type CandidateRow = {
    id: string;
    full_name: string;
    current_title: string | null;
    current_company: string | null;
    archetype: string | null;
    pipeline_stage: string | null;
    cv_structured: unknown;
    recruiter_assessment: unknown;
  };
  const candidates = ((candidatesQ.data ?? []) as CandidateRow[]).map(
    (c) => {
      const cv = (c.cv_structured ?? {}) as Record<string, unknown>;
      const isFocus = candidateId && c.id === candidateId;
      return {
        id: c.id,
        full_name: c.full_name,
        current_title: c.current_title,
        current_company: c.current_company,
        archetype: c.archetype,
        pipeline_stage: c.pipeline_stage,
        // Heavy fields go in only for the focused candidate so the
        // prompt stays token-bounded.
        ...(isFocus
          ? { focused: true, cv_summary: trimCv(cv) }
          : {
              archetype_summary: cv.summary
                ? String(cv.summary).slice(0, 220)
                : null,
            }),
        recruiter_assessment: c.recruiter_assessment,
      };
    }
  );

  type ScoreRow = {
    candidate_id: string;
    technical_score: number | null;
    domain_score: number | null;
    leadership_score: number | null;
    regulatory_score: number | null;
    transformation_score: number | null;
    overall_score: number | null;
    tier: string | null;
    rank_position: number | null;
    previous_rank: number | null;
  };
  const scores = (scoresQ.data ?? []) as ScoreRow[];

  type FeedbackRow = {
    feedback_type: string;
    content: string;
    candidate_id: string | null;
    interpreted: { summary?: string } | null;
    triggered_recalibration: boolean;
    created_at: string;
  };
  const feedback = ((feedbackQ.data ?? []) as FeedbackRow[]).map((f) => ({
    feedback_type: f.feedback_type,
    candidate_id: f.candidate_id,
    summary: f.interpreted?.summary ?? null,
    content: f.content.slice(0, 600),
    triggered_recalibration: f.triggered_recalibration,
    created_at: f.created_at,
  }));

  const shortlist = (shortlistQ.data ?? [])[0] ?? null;

  // Drop the heaviest top-level project fields to keep the snapshot
  // economical. The recruiter rarely asks about onboarding responses
  // verbatim — keep stakeholders only.
  const onboarding = project.onboarding_responses as
    | { stakeholders?: unknown }
    | null;

  return {
    project: {
      id: project.id,
      title: project.title,
      company_name: project.company_name,
      status: project.status,
      calibration_model: project.calibration_model,
      company_context: trimCompanyContext(project.company_context),
      recalibration_summary: project.recalibration_summary,
      client_psychology: trimClientPsychology(project.client_psychology),
      health_suggestions: project.health_suggestions,
      stakeholders: onboarding?.stakeholders ?? null,
    },
    candidates,
    scores,
    recent_feedback: feedback,
    shortlist,
    focused_candidate_id: candidateId,
  };
}

/**
 * Trim cv_structured to the fields the Copilot actually needs to talk
 * about a focused candidate. Drops verbose roles[] history; keeps
 * fit_dimensions, summary, archetype, scale/domain, recruiter
 * assessment, and any positioning / psychology / triangulation
 * intelligence reports already on the candidate.
 */
function trimCv(cv: Record<string, unknown>): Record<string, unknown> {
  return {
    summary: cv.summary,
    domain: cv.domain,
    scale: cv.scale,
    archetype: cv.archetype,
    fit_dimensions: cv.fit_dimensions,
    fit_summary: cv.fit_summary,
    strengths: Array.isArray(cv.strengths)
      ? (cv.strengths as unknown[]).slice(0, 5)
      : undefined,
    risks: Array.isArray(cv.risks)
      ? (cv.risks as unknown[]).slice(0, 4)
      : undefined,
    psychology: cv.psychology,
    positioning_kit: cv.positioning_kit,
    candidate_intelligence: cv.candidate_intelligence,
    triangulation_report: cv.triangulation_report,
  };
}

function trimCompanyContext(ctx: unknown): unknown {
  if (!ctx || typeof ctx !== "object") return ctx;
  // Pass through but cap the embedded intelligence reports' sources
  // arrays — those URL lists rarely help the copilot answer questions.
  const c = { ...(ctx as Record<string, unknown>) };
  for (const key of [
    "intelligence_report",
    "hm_intelligence",
    "culture_profile",
  ]) {
    const v = c[key];
    if (v && typeof v === "object" && Array.isArray((v as { sources?: unknown }).sources)) {
      c[key] = { ...(v as Record<string, unknown>), sources: undefined };
    }
  }
  return c;
}

function trimClientPsychology(p: unknown): unknown {
  // The client_psychology blob is already compact; pass through.
  return p;
}

export type _ClientReexport = SupabaseClient | null; // satisfy import linter
