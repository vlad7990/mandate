"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { computeAndStoreScores } from "@/lib/ranking/scoring-engine";

async function requireAuth(): Promise<void> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthenticated.");

  const { data: profile, error } = await supabase
    .from("users")
    .select("organization_id, status")
    .eq("id", user.id)
    .single();

  if (error || !profile?.organization_id || profile.status !== "active") {
    throw new Error("Account is not provisioned.");
  }
}

/**
 * Manual rescore from the ranking page. Re-reads each candidate's
 * fit_dimensions, recomputes against the project's current
 * calibration_model.dimension_weights, and updates rank_position +
 * previous_rank in candidate_scores. Used by the "Refresh scores" CTA
 * after the recruiter edits a candidate or changes calibration.
 */
export async function refreshScoresAction(projectId: string): Promise<void> {
  await requireAuth();
  await computeAndStoreScores(projectId);
  revalidatePath(`/projects/${projectId}/ranking`);
}
