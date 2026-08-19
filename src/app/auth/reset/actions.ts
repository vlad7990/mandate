"use server";

import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { validatePassword } from "@/lib/auth/password-policy";
import { runAction } from "@/lib/actions/run";
import type { ActionResult } from "@/lib/actions/result";

/**
 * Set the new password on the recovery session. The same 12/4 policy as
 * signup and invitation redemption (D3) — three doors, one floor.
 * Success lands on /app; the dashboard layout routes externals on to
 * /portal and pending staff to /auth/pending, so this action does not
 * need a persona opinion of its own.
 */
export async function resetPasswordAction(password: string): Promise<ActionResult> {
  const result = await runAction("The password reset", async () => {
    const policyError = validatePassword(password);
    if (policyError) {
      throw new Error(policyError);
    }

    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      throw new Error("The recovery session has expired. Request a fresh link.");
    }

    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      // GoTrue's own messages here are readable ("New password should be
      // different from the old password.") — pass them through.
      throw new Error(error.message);
    }
  });

  if (result.ok) {
    redirect("/app");
  }
  return result;
}
