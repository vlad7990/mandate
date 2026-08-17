"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { assertFounder } from "@/lib/auth/access";
import { runAction } from "@/lib/actions/run";
import type { ActionResult } from "@/lib/actions/result";

/** Sentence subject for a failure this file did not author. See `runAction`. */
const SUBJECT = "The waitlist update";

/**
 * The waitlist is Mandate's own intake, not a customer org's, so it stays on
 * `is_founder` rather than on the role model — an org admin administers
 * their organisation, not our pipeline. See the note in `roles.ts`.
 */
async function requireFounder(): Promise<{
  userId: string;
  organizationId: string | null;
}> {
  const access = await assertFounder();
  return { userId: access.userId, organizationId: access.organizationId };
}

export async function approveWaitlistRequestAction(
  requestId: string
): Promise<ActionResult> {
  return runAction(SUBJECT, async () => {
    if (!requestId) throw new Error("Missing requestId.");
    const auth = await requireFounder();
    const supabase = await createServerSupabaseClient();

    const { error } = await supabase
      .from("waitlist")
      .update({
        status: "approved",
        reviewed_by: auth.userId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", requestId);

    if (error) {
      throw new Error(`Failed to approve: ${error.message}`);
    }

    // Approval is recorded; the actual user creation flow is left to the
    // existing /auth/signup → FOUNDER_EMAILS allowlist machinery. Once
    // the founder forwards the invite link to the applicant they sign
    // up normally; their `users.status` flips active manually from
    // /settings if needed. Keeping this surface minimal until the
    // founder asks for automatic invite-email delivery.

    revalidatePath("/app/settings/waitlist");
  });
}

export async function rejectWaitlistRequestAction(
  requestId: string
): Promise<ActionResult> {
  return runAction(SUBJECT, async () => {
    if (!requestId) throw new Error("Missing requestId.");
    const auth = await requireFounder();
    const supabase = await createServerSupabaseClient();

    const { error } = await supabase
      .from("waitlist")
      .update({
        status: "rejected",
        reviewed_by: auth.userId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", requestId);

    if (error) {
      throw new Error(`Failed to reject: ${error.message}`);
    }
    revalidatePath("/app/settings/waitlist");
  });
}

export async function saveWaitlistNoteAction(
  requestId: string,
  note: string
): Promise<ActionResult> {
  return runAction(SUBJECT, async () => {
    if (!requestId) throw new Error("Missing requestId.");
    await requireFounder();
    const supabase = await createServerSupabaseClient();

    const trimmed = note.trim();
    const { error } = await supabase
      .from("waitlist")
      .update({ notes: trimmed.length > 0 ? trimmed : null })
      .eq("id", requestId);

    if (error) {
      throw new Error(`Failed to save note: ${error.message}`);
    }
    revalidatePath("/app/settings/waitlist");
  });
}
