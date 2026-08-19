"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { validatePassword } from "@/lib/auth/password-policy";
import { runAction } from "@/lib/actions/run";
import type { ActionResult } from "@/lib/actions/result";

/**
 * Self-service account actions — both personas, one module (D1/D2/D3 of
 * the portal-settings slice). Authorization lives in the database: the
 * rename is a users-table write that the 071 self policy scopes to the
 * caller's own row and the privilege guard limits to `full_name`; the
 * password change is GoTrue's. The checks in this file exist to produce
 * readable sentences, not to be the boundary.
 */

const NAME_MAX = 120;

export async function renameSelfAction(
  fullName: string
): Promise<ActionResult<{ fullName: string }>> {
  return runAction("The name change", async () => {
    const name = fullName.trim();
    if (!name) {
      throw new Error("Your name cannot be empty.");
    }
    if (name.length > NAME_MAX) {
      throw new Error(`Keep your name under ${NAME_MAX} characters.`);
    }

    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      throw new Error("Your session has expired. Sign in again.");
    }

    const { data: updated, error } = await supabase
      .from("users")
      .update({ full_name: name, updated_at: new Date().toISOString() })
      .eq("id", user.id)
      .select("id");
    if (error) {
      // The guard's sentences are authored for readers — pass them through.
      throw new Error(error.message);
    }
    if (!updated || updated.length === 0) {
      throw new Error("Your profile row could not be reached.");
    }

    // The name shows in the portal chrome (portal_context feeds the
    // header on every portal page) and on the staff roster surfaces.
    revalidatePath("/portal", "layout");
    revalidatePath("/app/settings");
    revalidatePath("/app/settings/members");

    return { fullName: name };
  });
}

export async function changePasswordAction(input: {
  currentPassword: string;
  newPassword: string;
}): Promise<ActionResult> {
  return runAction("The password change", async () => {
    // The same 12/4 floor as signup, redemption and recovery — four
    // doors, one floor (D3).
    const policyError = validatePassword(input.newPassword);
    if (policyError) {
      throw new Error(policyError);
    }

    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.email) {
      throw new Error("Your session has expired. Sign in again.");
    }

    // Re-verify the current password before touching anything (D3): a
    // walk-up attacker at an open laptop must not be able to lock the
    // owner out. The check is a scoped sign-in on a throwaway client that
    // persists nothing — the caller's cookie session is not replaced, and
    // a failed probe here changes no state.
    const probe = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );
    const { error: verifyError } = await probe.auth.signInWithPassword({
      email: user.email,
      password: input.currentPassword,
    });
    if (verifyError) {
      throw new Error("Your current password is incorrect.");
    }

    const { error } = await supabase.auth.updateUser({
      password: input.newPassword,
    });
    if (error) {
      // GoTrue's own messages here are readable ("New password should be
      // different from the old password.") — pass them through.
      throw new Error(error.message);
    }
    // Other sessions deliberately stay alive — global sign-out on
    // password change is a Phase 4 verdict candidate, not this slice.
  });
}
