"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { requireActionContext } from "@/lib/auth/access";
import { parseRole, type Role } from "@/lib/auth/roles";
import {
  FEEDBACK_TYPES,
  type FeedbackInterpretation,
  type FeedbackType,
} from "@/lib/ai/feedback-analysis";
import { interpretFeedback } from "@/lib/ai/interpret-feedback";
import { applyRecalibration } from "@/lib/recalibration/recalibrate";
import type { CandidateProfile } from "@/lib/ai/cv-parsing";
import type { CalibrationModel } from "@/lib/ai/role-analysis";
import type { OnboardingResponses } from "@/lib/ai/onboarding-analysis";
import { runAction } from "@/lib/actions/run";
import type { ActionResult } from "@/lib/actions/result";

/** Sentence subject for a failure this file did not author. See `runAction`. */
const SUBJECT = "The feedback submission";

const FEEDBACK_TYPE_VALUES = FEEDBACK_TYPES as readonly string[];

type AuthContext = {
  userId: string;
  organizationId: string;
  /** Parsed, so a value outside the vocabulary reaches the interpreter as null. */
  role: Role | null;
  fullName: string | null;
};

/**
 * Feedback reshapes a mandate's calibration, so submitting it is a mandate
 * write. A researcher screens against the calibration; they do not move it.
 *
 * The extra profile read is for the interpreter, not for the guard — it is
 * told who is speaking, because "the hiring manager thinks he is too junior"
 * and "the researcher thinks he is too junior" are different signals.
 */
async function requireAuth(): Promise<AuthContext> {
  const { userId, organizationId } = await requireActionContext("mandates:write");

  const supabase = await createServerSupabaseClient();
  const { data: profile } = await supabase
    .from("users")
    .select("role, full_name")
    .eq("id", userId)
    .single<{ role: string | null; full_name: string | null }>();

  return {
    userId,
    organizationId,
    role: parseRole(profile?.role),
    fullName: profile?.full_name ?? null,
  };
}

/**
 * Submit one feedback row, run the Feedback Interpretation Agent
 * synchronously, persist the interpretation, and conditionally
 * recalibrate.
 *
 * Order matters: insert FIRST so the row exists for the audit log even
 * if the AI call (or recalibration) fails. Then update with the
 * interpretation. Then recalibrate if flagged. Each step that follows
 * the insert is best-effort — the user gets the row in their feedback
 * log either way.
 */
export async function submitFeedbackAction(formData: FormData): Promise<ActionResult> {
  return runAction(SUBJECT, async () => {
    const projectId = String(formData.get("projectId") ?? "").trim();
    const feedbackType = String(formData.get("feedbackType") ?? "").trim();
    const rawCandidateId = String(formData.get("candidateId") ?? "").trim();
    const candidateId = rawCandidateId.length === 0 ? null : rawCandidateId;
    const content = String(formData.get("content") ?? "").trim();

    if (!projectId) throw new Error("Missing projectId.");
    if (!FEEDBACK_TYPE_VALUES.includes(feedbackType)) {
      throw new Error(`Invalid feedback type: ${feedbackType}`);
    }
    if (content.length < 4) {
      throw new Error("Feedback is too short. Add at least a sentence of context.");
    }

    const auth = await requireAuth();
    const supabase = await createServerSupabaseClient();

    // 1. Insert the row up-front. interpreted = '{}' until the AI call lands.
    const { data: inserted, error: insertError } = await supabase
      .from("feedback")
      .insert({
        project_id: projectId,
        organization_id: auth.organizationId,
        candidate_id: candidateId,
        submitted_by: auth.userId,
        feedback_type: feedbackType as FeedbackType,
        content,
        interpreted: {},
        triggered_recalibration: false,
      })
      .select("id, created_at")
      .single<{ id: string; created_at: string }>();

    if (insertError || !inserted) {
      throw new Error(
        `Failed to save feedback: ${insertError?.message ?? "no row returned"}`
      );
    }

    // 2. Pull project context + a tail of prior feedback for the interpreter.
    const [{ data: project }, { data: priorRows }, { data: candidate }] =
      await Promise.all([
        supabase
          .from("projects")
          .select("calibration_model, onboarding_responses")
          .eq("id", projectId)
          .single<{
            calibration_model: Partial<CalibrationModel> | null;
            onboarding_responses: Partial<OnboardingResponses> | null;
          }>(),
        supabase
          .from("feedback")
          .select(
            "feedback_type, content, candidate_id, interpreted, triggered_recalibration, created_at"
          )
          .eq("project_id", projectId)
          .neq("id", inserted.id)
          .order("created_at", { ascending: false })
          .limit(10),
        candidateId
          ? supabase
              .from("candidates")
              .select("id, full_name, cv_structured")
              .eq("id", candidateId)
              .maybeSingle<{
                id: string;
                full_name: string;
                cv_structured: unknown;
              }>()
          : Promise.resolve({ data: null as null }),
      ]);

    // 3. Run interpreter. Failure here is logged but doesn't undo the insert.
    let interpretation: FeedbackInterpretation | null = null;
    let interpretError: string | null = null;
    try {
      interpretation = await interpretFeedback({
        new_feedback: {
          type: feedbackType as FeedbackType,
          content,
          candidate_id: candidateId,
          submitted_role: auth.role,
        },
        prior_feedback: (priorRows ?? []).reverse().map((r) => ({
          type: r.feedback_type as FeedbackType,
          content: r.content,
          candidate_id: r.candidate_id,
          summary:
            (r.interpreted as { summary?: string } | null)?.summary ?? null,
          triggered_recalibration: r.triggered_recalibration,
          created_at: r.created_at,
        })),
        calibration: project?.calibration_model ?? {},
        onboarding: project?.onboarding_responses ?? {},
        candidate: candidate
          ? {
              id: candidate.id,
              full_name: candidate.full_name,
              profile: (candidate.cv_structured ?? {}) as Partial<CandidateProfile>,
            }
          : null,
        skill_context: {
          project_id: projectId,
          organization_id: auth.organizationId,
        },
      });
    } catch (err) {
      interpretError =
        err instanceof Error ? err.message : "Interpretation failed.";
      console.error("[feedback] interpretation failed", err);
    }

    // 4. Persist interpretation onto the feedback row.
    if (interpretation) {
      const { error: updateError } = await supabase
        .from("feedback")
        .update({ interpreted: interpretation })
        .eq("id", inserted.id);
      if (updateError) {
        console.error(
          "[feedback] failed to persist interpretation",
          updateError
        );
      }
    } else if (interpretError) {
      await supabase
        .from("feedback")
        .update({
          interpreted: {
            summary: "AI interpretation failed — see content above.",
            error: interpretError,
          },
        })
        .eq("id", inserted.id);
    }

    // 5. Recalibrate if flagged AND we have non-empty adjustments.
    if (
      interpretation?.recalibration_needed &&
      interpretation.suggested_weight_adjustments.length > 0
    ) {
      try {
        await applyRecalibration(projectId, inserted.id, interpretation);
      } catch (err) {
        console.error("[feedback] recalibration failed", err);
      }
    }

    revalidatePath(`/app/projects/${projectId}/feedback`);
    revalidatePath(`/app/projects/${projectId}`);
    revalidatePath(`/app/projects/${projectId}/ranking`);
  });
}
