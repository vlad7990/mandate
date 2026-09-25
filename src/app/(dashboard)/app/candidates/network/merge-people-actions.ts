"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { requireActionContext } from "@/lib/auth/access";
import { runAction } from "@/lib/actions/run";
import type { ActionResult } from "@/lib/actions/result";
import {
  describePeopleReceipt,
  type PeopleMergeReceipt,
} from "@/lib/network/merge-people";

/** Sentence subject for a failure this file did not author. See `runAction`. */
const SUBJECT = "The merge";

/**
 * Merge two people in the network.
 *
 * Thin on purpose, exactly as §202's candidate merge is: every decision —
 * the alias that makes it durable, suppression being contagious and never
 * lowered, the warmer state, the refusals — lives inside
 * `merge_network_profiles`, one transaction, migration 143.
 *
 * Unlike the candidate merge there is no stored file to clean up
 * afterwards: a profile owns no bytes. So this function proves the caller
 * may act, calls the function, and turns the receipt into a sentence.
 */
export async function mergePeopleAction(
  keepId: string,
  discardId: string
): Promise<ActionResult<{ keptId: string; message: string }>> {
  return runAction(SUBJECT, async () => {
    await requireActionContext("candidates:write");
    const supabase = await createServerSupabaseClient();

    const { data, error } = await supabase.rpc("merge_network_profiles", {
      p_keep: keepId,
      p_discard: discardId,
    });

    // The function's refusals are authored sentences meant for a human —
    // "merging two people is a human act" — so they surface as-is.
    if (error) throw new Error(error.message);

    const receipt = data as PeopleMergeReceipt;
    revalidatePath("/app/candidates/network");

    return {
      keptId: receipt.kept_id,
      message: describePeopleReceipt(receipt),
    };
  });
}
