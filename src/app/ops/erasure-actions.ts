"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { assertFounder } from "@/lib/auth/access";
import { runAction } from "@/lib/actions/run";
import type { ActionResult } from "@/lib/actions/result";

/**
 * Closing an erasure request is the operator's hand alone (073 RLS:
 * UPDATE is founder-only). Resolving records that the erasure was
 * CARRIED OUT by founder SQL per the retention verdict; declining
 * records why it was not. Neither deletes anything here — this action
 * closes the ticket, not the data.
 */
export async function closeErasureRequestAction(
  requestId: string,
  outcome: "resolved" | "declined",
  note: string
): Promise<ActionResult> {
  return runAction("The erasure request", async () => {
    const access = await assertFounder();
    const supabase = await createServerSupabaseClient();

    const { data: updated, error } = await supabase
      .from("candidate_erasure_requests")
      .update({
        status: outcome,
        resolved_by: access.userId,
        resolved_at: new Date().toISOString(),
        resolution_note: note.trim() || null,
      })
      .eq("id", requestId)
      .eq("status", "open")
      .select("id");
    if (error) throw new Error(error.message);
    if (!updated || updated.length === 0) {
      throw new Error("That request is not open.");
    }
    revalidatePath("/ops");
  });
}
