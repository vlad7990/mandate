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
 *
 * §207 D5 — A DECLINE IS NOT ONE ANSWER, and the founder's ruling split
 * it because the blanket version has a victim. Filing an erasure
 * suppresses the person immediately (098), and a portal link can be
 * forwarded, so the person who files is not always the subject:
 *
 *   cannot_erase  the data is retained (a client record, a statutory
 *                 period). The ask was real. The suppression it set
 *                 STANDS — the send ladder simply refuses under
 *                 do-not-contact instead of under the erasure.
 *   not_subject   the filer was not this person. The suppression was
 *                 set on a false basis and is LIFTED — but only if this
 *                 request is what set it. A person suppressed for their
 *                 own reasons keeps that, and a founder's own decline
 *                 note is what the trail records either way.
 */

export type DeclineKind = "cannot_erase" | "not_subject";

/** The system's fingerprint on a suppression this request itself set. */
const ERASURE_DNC_REASON = "erasure requested via their portal";

export async function closeErasureRequestAction(
  requestId: string,
  outcome: "resolved" | "declined",
  note: string,
  declineKind?: DeclineKind
): Promise<ActionResult> {
  return runAction("The erasure request", async () => {
    const access = await assertFounder();
    const supabase = await createServerSupabaseClient();

    if (outcome === "declined" && !declineKind) {
      throw new Error(
        "A decline has to say which it is: the data is retained, or the " +
          "person who asked was not the subject."
      );
    }

    const { data: updated, error } = await supabase
      .from("candidate_erasure_requests")
      .update({
        status: outcome,
        decline_kind: outcome === "declined" ? declineKind : null,
        resolved_by: access.userId,
        resolved_at: new Date().toISOString(),
        resolution_note: note.trim() || null,
      })
      .eq("id", requestId)
      .eq("status", "open")
      .select("id, network_profile_id")
      .maybeSingle<{ id: string; network_profile_id: string | null }>();
    if (error) throw new Error(error.message);
    if (!updated) throw new Error("That request is not open.");

    // D5, the half with teeth: a request filed by somebody who was not the
    // subject must not leave a real candidate quietly uncontactable. Lift
    // the suppression ONLY when this request is demonstrably what set it —
    // the system's own reason, and no human named as the setter.
    if (outcome === "declined" && declineKind === "not_subject" && updated.network_profile_id) {
      const { data: profile } = await supabase
        .from("network_profiles")
        .select("id, dnc, dnc_reason, dnc_set_by")
        .eq("id", updated.network_profile_id)
        .maybeSingle<{
          id: string;
          dnc: boolean;
          dnc_reason: string | null;
          dnc_set_by: string | null;
        }>();

      if (
        profile?.dnc === true &&
        profile.dnc_reason === ERASURE_DNC_REASON &&
        profile.dnc_set_by === null
      ) {
        const { error: clearErr } = await supabase.rpc("clear_network_dnc", {
          p_profile_id: profile.id,
          p_reason:
            "erasure request declined — the person who filed it was not the subject",
        });
        // Loud, not silent: the ticket is closed either way, and a
        // suppression left standing on somebody who never asked is a fact
        // the operator has to know about rather than discover later.
        if (clearErr) {
          throw new Error(
            `The request was closed, but the suppression it set could not ` +
              `be lifted: ${clearErr.message}`
          );
        }
      }
    }

    revalidatePath("/ops");
  });
}
