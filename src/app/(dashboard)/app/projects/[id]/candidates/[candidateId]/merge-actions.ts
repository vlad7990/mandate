"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { requireActionContext } from "@/lib/auth/access";
import { runAction } from "@/lib/actions/run";
import type { ActionResult } from "@/lib/actions/result";
import { describeReceipt, type MergeReceipt } from "@/lib/candidates/merge";

/** Sentence subject for a failure this file did not author. See `runAction`. */
const SUBJECT = "The merge";

export type MergeOutcome = {
  /** The record that survived — the page navigates here. */
  keptId: string;
  /** One sentence naming what moved, what was filled and what was dropped. */
  message: string;
};

/**
 * Merge two records of one person within a mandate.
 *
 * Gate: docs/superpowers/specs/2026-09-25-candidate-merge-gate.md.
 *
 * ## This action is deliberately thin
 *
 * Every decision — which collisions the survivor wins (D1), what moves
 * (D2), the placement refusal (D3), which blanks are filled (D4), the
 * order that keeps `feedback` from blocking the delete — lives inside
 * `merge_candidates`, ONE SECURITY DEFINER function in ONE transaction.
 * Eighteen tables reparented across eighteen round trips from here would
 * leave a half-merge on any failure, and a half-merge is unrecoverable.
 *
 * So this function does three things the database cannot: it proves the
 * caller may act, it deletes the discarded record's stored CV (storage is
 * API-only and SQL cannot reach it), and it turns the receipt into a
 * sentence.
 *
 * The capability check is here AND in the function. Not redundancy for its
 * own sake: `requireActionContext` produces the authored refusal a
 * recruiter reads, while the function's own `can_write_candidates()` gate
 * is what stops a hand-rolled REST call that never passes through here.
 */
export async function mergeCandidatesAction(
  projectId: string,
  keepId: string,
  discardId: string
): Promise<ActionResult<MergeOutcome>> {
  return runAction(SUBJECT, async () => {
    await requireActionContext("candidates:write");
    const supabase = await createServerSupabaseClient();

    const { data, error } = await supabase.rpc("merge_candidates", {
      p_keep: keepId,
      p_discard: discardId,
    });

    if (error) {
      // The function's refusals are authored sentences meant for a human
      // — "carries a placement (accepted, offer dated 11 Sep)" — so they
      // are surfaced as-is rather than wrapped in a generic failure.
      throw new Error(error.message);
    }

    const receipt = data as MergeReceipt;

    // The discarded record's file. Deleted AFTER the merge commits, not
    // before: §201's discard deletes the object first because the row it
    // points at survives a failure, but here the RPC can REFUSE (D3) and
    // destroying a file for a merge that never happened would be the
    // worse mistake. An orphaned object is inert and logged.
    if (receipt?.discarded_cv) {
      const { error: removeError } = await supabase.storage
        .from("cvs")
        .remove([receipt.discarded_cv]);
      if (removeError) {
        console.error(
          "[candidates/merge] merge left the discarded CV behind",
          removeError.message
        );
      }
    }

    revalidatePath(`/app/projects/${projectId}/candidates`);
    revalidatePath(`/app/projects/${projectId}/candidates/${keepId}`);

    return {
      keptId: receipt.kept_id,
      message: describeReceipt(receipt),
    };
  });
}
