"use server";

import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getServiceRoleSupabaseClient } from "@/lib/supabase-service-role";
import { validatePassword } from "@/lib/auth/password-policy";
import { runAction } from "@/lib/actions/run";
import type { ActionResult } from "@/lib/actions/result";

/**
 * Redemption: invitation → account → session, in that order, with the
 * database deciding every step.
 *
 *   1. `verify_invitation` (anon-callable) re-checks the token is live —
 *      the page checked too, but the page render is not the moment of
 *      account creation.
 *   2. The auth account is created by the *admin* API with
 *      `email_confirm: true` — the invitation email click already proved
 *      the inbox (D4), and a second confirmation loop would be asking
 *      the same question twice. The signup trigger writes its usual
 *      viewer/pending row.
 *   3. `redeem_invitation` (service-role-only definer RPC) turns that
 *      row into the invited external — role, client, active — stamps the
 *      invitation spent, and writes the promised mandate grants.
 *   4. If redemption refuses (raced revocation, email mismatch), the
 *      just-created auth account is deleted: a half-redeemed viewer row
 *      with no org and no client is not a state the product has.
 *
 * Sign-in happens with the fresh credentials and lands on /portal.
 */

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value
  );
}

export async function redeemInvitationAction(input: {
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
      "verify_invitation",
      { p_token: input.token }
    );
    if (verifyErr) {
      console.error("[invite] verification failed", verifyErr);
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
      console.error("[invite] account creation failed", createErr);
      throw new Error("Your account could not be created. Try again.");
    }

    const { error: redeemErr } = await service.rpc("redeem_invitation", {
      p_token: input.token,
      p_user_id: created.user.id,
    });

    if (redeemErr) {
      // Undo the half-made account; see the header. Deletion failure is
      // logged, not surfaced — the account is inert (viewer/pending, no
      // org, no client) and a founder can clear it.
      console.error("[invite] redemption refused", redeemErr);
      const { error: cleanupErr } = await service.auth.admin.deleteUser(
        created.user.id
      );
      if (cleanupErr) {
        console.error("[invite] cleanup of half-redeemed account failed", cleanupErr);
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
      // The account exists and is fully redeemed; the sign-in page will
      // take it from here.
      console.error("[invite] post-redemption sign-in failed", signInErr);
      redirect("/auth/signin?next=/portal");
    }
  });

  if (result.ok) {
    redirect("/portal");
  }
  return result;
}
