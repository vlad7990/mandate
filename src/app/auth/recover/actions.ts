"use server";

import { headers } from "next/headers";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { siteUrl } from "@/lib/email/send";
import { runAction } from "@/lib/actions/run";
import type { ActionResult } from "@/lib/actions/result";
import { clientIpFrom, limitOpen } from "@/lib/rate-limit/server";
import { normalizeEmailKey, retryPhrase } from "@/lib/rate-limit/core";

/**
 * Request a recovery email. GoTrue does the sending (the built-in
 * sender until the SMTP switch, D3) and the not-telling: it answers the
 * same for unknown addresses, and so does this action — the only error
 * a caller can see is "that isn't an email address" or a transport
 * failure, never "no such account" (D2).
 *
 * The redirect threads through /auth/callback, which exchanges the
 * recovery code for a session and forwards to /auth/reset. The callback
 * also turns suspended accounts away by name before they ever see the
 * reset form — the password and the standing are different facts, and
 * the standing wins.
 */
export async function requestRecoveryAction(emailRaw: string): Promise<ActionResult> {
  return runAction("The recovery request", async () => {
    const email = emailRaw.trim();
    if (!email || email.indexOf("@") < 1) {
      throw new Error("Enter the email address you sign in with.");
    }

    // Two keys (088): the IP, and the EMAIL — the address is the
    // abused resource in a mail-bomb, and it must be limited whether
    // or not the account exists (the sentence is the same either
    // way; no enumeration). Identity door: fails OPEN.
    const ip = clientIpFrom(await headers());
    const ipVerdict = await limitOpen("recovery_ip", ip);
    if (!ipVerdict.allowed) {
      throw new Error(
        "Too many recovery requests from this location. " +
          `Try again in ${retryPhrase(ipVerdict.retryAfterSeconds)}.`
      );
    }
    const emailVerdict = await limitOpen("recovery_email", normalizeEmailKey(email));
    if (!emailVerdict.allowed) {
      throw new Error(
        "A reset link has already been requested for this address. " +
          `Check your inbox, or try again in ${retryPhrase(emailVerdict.retryAfterSeconds)}.`
      );
    }

    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${siteUrl()}/auth/callback?next=${encodeURIComponent("/auth/reset")}`,
    });

    if (error) {
      // Rate limits and transport failures are real outcomes the person
      // should hear about; "user not found" style answers must not be.
      // GoTrue already answers 200 for unknown emails, so anything here
      // is infrastructure, not enumeration.
      console.error("[auth/recover] recovery request failed", error);
      throw new Error(
        "The recovery email could not be requested just now. Try again in a minute."
      );
    }
  });
}
