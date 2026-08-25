"use server";

// The relationship card's acts (#24, 098). Updating the record is the
// agent's judgment through the seam; suppressing a person is the
// HUMAN's act through set_network_dnc (reason mandatory, actor
// recorded); un-suppressing is FOUNDER territory through
// clear_network_dnc. Direct dnc writes do not exist — the guard
// trigger refuses them for everyone.

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { runRelationshipAndPersist } from "@/lib/ai/run-relationship";
import { runAction } from "@/lib/actions/run";
import type { ActionResult } from "@/lib/actions/result";

/** Sentence subject for a failure this file did not author. See `runAction`. */
const SUBJECT = "The relationship record";

/** D5, worded verbatim — the refusal is honest and destroys nothing. */
const AGENT_UNAVAILABLE_MESSAGE =
  "The Candidate Relationship Agent could not run — an operator has " +
  "suspended it or its credentials are absent. The relationship record " +
  "is untouched. Try again when it is restored.";

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

export async function updateRelationshipAction(
  profileId: string
): Promise<ActionResult<null>> {
  return runAction(SUBJECT, async () => {
    await requireAuth();
    const run = await runRelationshipAndPersist(profileId);
    if (run.status === "agent_unavailable") {
      throw new Error(AGENT_UNAVAILABLE_MESSAGE);
    }
    if (run.status === "unavailable") {
      throw new Error(
        "The profile could not be read — nothing was updated."
      );
    }
    if (run.status !== "updated") {
      throw new Error("The update failed — the record stands as it was.");
    }
    revalidatePath("/app/candidates/network");
    return null;
  });
}

export async function setDncAction(
  profileId: string,
  reason: string
): Promise<ActionResult<null>> {
  return runAction(SUBJECT, async () => {
    await requireAuth();
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.rpc("set_network_dnc", {
      p_profile_id: profileId,
      p_reason: reason,
    });
    if (error) throw new Error(error.message);
    revalidatePath("/app/candidates/network");
    return null;
  });
}

export async function clearDncAction(
  profileId: string,
  reason: string
): Promise<ActionResult<null>> {
  return runAction(SUBJECT, async () => {
    await requireAuth();
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.rpc("clear_network_dnc", {
      p_profile_id: profileId,
      p_reason: reason,
    });
    if (error) throw new Error(error.message);
    revalidatePath("/app/candidates/network");
    return null;
  });
}
