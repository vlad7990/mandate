"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import {
  EVALUATION_KEY,
  ensureCandidateEvaluation,
  type CvStructuredWithEvaluation,
} from "@/lib/ai/generate-evaluation";

/**
 * Force a fresh evaluation by clearing the cached evaluation on the
 * candidate, then re-invoking the gate. Used by the "Regenerate" button
 * on the report header. Throws on auth failure or generation failure
 * so the client can toast a useful message.
 */
export async function regenerateEvaluationAction(
  candidateId: string,
  projectId: string
): Promise<void> {
  if (!candidateId || !projectId) {
    throw new Error("Missing candidateId or projectId.");
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthenticated.");

  // Clear the cached evaluation. We read-then-write rather than using a
  // SQL JSONB delete because the column type is plain JSONB and the
  // Supabase client doesn't expose a partial-update primitive.
  const { data: candidate, error: readErr } = await supabase
    .from("candidates")
    .select("project_id, cv_structured")
    .eq("id", candidateId)
    .single<{ project_id: string; cv_structured: unknown }>();

  if (readErr || !candidate) {
    throw new Error("Candidate not found.");
  }
  if (candidate.project_id !== projectId) {
    throw new Error("Candidate does not belong to the requested project.");
  }

  const cv = (candidate.cv_structured ?? {}) as CvStructuredWithEvaluation;
  if (cv[EVALUATION_KEY]) {
    const { [EVALUATION_KEY]: _drop, ...rest } = cv;
    void _drop;
    const { error: clearErr } = await supabase
      .from("candidates")
      .update({
        cv_structured: rest,
        updated_at: new Date().toISOString(),
      })
      .eq("id", candidateId);
    if (clearErr) throw new Error(`Failed to clear evaluation: ${clearErr.message}`);
  }

  const fresh = await ensureCandidateEvaluation(candidateId, projectId);
  if (!fresh) {
    throw new Error("Could not generate evaluation. Try again.");
  }

  revalidatePath(`/projects/${projectId}/candidates/${candidateId}`);
}
