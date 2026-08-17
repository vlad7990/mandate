"use server";

import { revalidatePath } from "next/cache";
import { requireActionContext } from "@/lib/auth/access";
import { computeAndStoreScores } from "@/lib/ranking/scoring-engine";
import { runAction } from "@/lib/actions/run";
import type { ActionResult } from "@/lib/actions/result";

/** Sentence subject for a failure this file did not author. See `runAction`. */
const SUBJECT = "The score refresh";

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
export async function refreshScoresAction(projectId: string): Promise<ActionResult> {
  return runAction(SUBJECT, async () => {
    await requireAuth();
    await computeAndStoreScores(projectId);
    revalidatePath(`/app/projects/${projectId}/ranking`);
  });
}
