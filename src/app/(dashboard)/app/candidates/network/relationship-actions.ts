"use server";

// The relationship card's acts (#24, 098). Updating the record is the
// agent's judgment through the seam; suppressing a person is the
// HUMAN's act through set_network_dnc (reason mandatory, actor
// recorded); un-suppressing is FOUNDER territory through
// clear_network_dnc — or, since §208, one reason at a time through
// lift_network_suppression, after the founder has been shown who else
// that lift reaches. Direct dnc writes do not exist — the guard
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

/** One person a lift would reach, as `network_suppression_reach` returns them. */
export type ReachedPerson = {
  suppressionId: string;
  profileId: string;
  displayName: string;
  isOrigin: boolean;
};

/**
 * §208 D2 — **a lift is never silent.** Who else holds a copy of these
 * suppressions, named, BEFORE anything is lifted. The card shows this and
 * waits; nothing here writes.
 *
 * Takes a list because the two lifts on the card ask the same question at
 * different widths: one reason (`lift_network_suppression`) asks about its own
 * lineage, while clearing the person (`clear_network_dnc`) lifts every reason
 * standing against them, so its reach is the union of theirs.
 */
export async function suppressionReachAction(
  suppressionIds: readonly string[]
): Promise<ActionResult<ReachedPerson[]>> {
  return runAction(SUBJECT, async () => {
    await requireAuth();
    const supabase = await createServerSupabaseClient();
    const byRow = new Map<string, ReachedPerson>();
    for (const id of suppressionIds) {
      const { data, error } = await supabase.rpc("network_suppression_reach", {
        p_suppression: id,
      });
      if (error) throw new Error(error.message);
      for (const row of (data ?? []) as Array<{
        suppression_id: string;
        profile_id: string;
        display_name: string;
        is_origin: boolean;
      }>) {
        // Two of the asked-about reasons can share a descendant; the union
        // must name that person once, not twice.
        const seen = byRow.get(row.suppression_id);
        byRow.set(row.suppression_id, {
          suppressionId: row.suppression_id,
          profileId: row.profile_id,
          displayName: row.display_name,
          // Origin of ANY of the reasons asked about stays an origin.
          isOrigin: (seen?.isOrigin ?? false) || row.is_origin,
        });
      }
    }
    return Array.from(byRow.values());
  });
}

/**
 * Lift ONE standing reason — founder only, reason mandatory, and it travels
 * down that reason's recorded lineage and no further. The person stays
 * suppressed while any other reason of theirs stands, which is the only safe
 * way to make lifting travel at all (D2).
 */
export async function liftSuppressionAction(
  suppressionId: string,
  reason: string
): Promise<ActionResult<null>> {
  return runAction(SUBJECT, async () => {
    await requireAuth();
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.rpc("lift_network_suppression", {
      p_suppression: suppressionId,
      p_reason: reason,
    });
    if (error) throw new Error(error.message);
    revalidatePath("/app/candidates/network");
    return null;
  });
}
