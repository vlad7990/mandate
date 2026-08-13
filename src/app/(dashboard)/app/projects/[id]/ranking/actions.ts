"use server";

import { revalidatePath } from "next/cache";
import { requireActionContext } from "@/lib/auth/access";
import { computeAndStoreScores } from "@/lib/ranking/scoring-engine";

async function requireAuth(): Promise<void> {
  await requireActionContext("candidates:write");
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
  revalidatePath(`/app/projects/${projectId}/ranking`);
}
