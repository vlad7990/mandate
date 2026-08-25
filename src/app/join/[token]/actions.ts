"use server";

import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getServiceRoleSupabaseClient } from "@/lib/supabase-service-role";
import { validatePassword } from "@/lib/auth/password-policy";
import { runAction } from "@/lib/actions/run";
import type { ActionResult } from "@/lib/actions/result";

/**
 * Staff redemption (§134 D2) — the /invite twin, one boundary over:
 * invitation → account → session, the database deciding every step.
 *
 *   1. `verify_staff_invitation` (anon-callable) re-checks the token is
 *      live at the moment of account creation, not just page render.
 *   2. The auth account is created by the admin API with
 *      `email_confirm: true` — the link click already proved the inbox.
 *      The signup trigger writes its usual viewer/pending row.
 *   3. `redeem_staff_invitation` (service-role-only definer RPC) turns
 *      that row into the invited colleague — org, role, ACTIVE — and
 *      spends the token. The invite IS the approval: no /ops queue.
 *   4. If redemption refuses (raced revocation, email mismatch), the
 *      half-made account is deleted.
 */

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value
  );
}

export async function redeemStaffInvitationAction(input: {
  token: string;
  password: string;
}): Promise<ActionResult> {
  const result = await runAction("The invitation", async () => {
    if (!isUuid(input.token)) {
      throw new Error("This invitation link is not valid.");
    }

    const passwordError = validatePassword(input.password);
    if (passwordError) {
      throw new Error(passwordError);
    }

    const session = await createServerSupabaseClient();
    const { data: verifyRows, error: verifyErr } = await session.rpc(
      "verify_staff_invitation",
      { p_token: input.token }
    );
    if (verifyErr) {
      console.error("[join] verification failed", verifyErr);
      throw new Error("The invitation could not be verified. Try again.");
    }
    type VerifyRow = { email: string };
    const invitation = ((verifyRows ?? []) as VerifyRow[])[0];
    if (!invitation) {
      throw new Error(
        "This invitation is no longer available. Ask for a fresh one."
      );
    }

    const service = getServiceRoleSupabaseClient();
    const { data: created, error: createErr } =
      await service.auth.admin.createUser({
        email: invitation.email,
        password: input.password,
        email_confirm: true,
      });

    if (createErr || !created?.user) {
      if (createErr?.message?.toLowerCase().includes("already")) {
        throw new Error(
          "An account with this email already exists. Sign in instead."
        );
      }
      console.error("[join] account creation failed", createErr);
      throw new Error("Your account could not be created. Try again.");
    }

    const { error: redeemErr } = await service.rpc("redeem_staff_invitation", {
      p_token: input.token,
      p_user_id: created.user.id,
    });

    if (redeemErr) {
      console.error("[join] redemption refused", redeemErr);
      const { error: cleanupErr } = await service.auth.admin.deleteUser(
        created.user.id
      );
      if (cleanupErr) {
        console.error("[join] cleanup of half-redeemed account failed", cleanupErr);
      }
      throw new Error(
        "The invitation could not be redeemed. It may have just been withdrawn."
      );
    }

    const { error: signInErr } = await session.auth.signInWithPassword({
      email: invitation.email,
      password: input.password,
    });
    if (signInErr) {
      console.error("[join] post-redemption sign-in failed", signInErr);
      redirect("/auth/signin?next=/app/home");
    }
  });

  if (result.ok) {
    redirect("/app/home");
  }
  return result;
}
