"use server";

import { headers } from "next/headers";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { notifyFoundersOfWaitlistRequest } from "@/lib/waitlist/notify";
import { runAction } from "@/lib/actions/run";
import type { ActionResult } from "@/lib/actions/result";
import { clientIpFrom, limitOpen } from "@/lib/rate-limit/server";
import { verifyTurnstile } from "@/lib/turnstile";

/** Sentence subject for a failure this file did not author. See `runAction`. */
const SUBJECT = "The access request";

export type AccessRequestPayload = {
  full_name: string;
  email: string;
  company: string;
  role: string;
  referral_source: string;
  use_case: string;
  /** Present only when the Turnstile widget rendered (site key set). */
  turnstile_token?: string;
};

/**
 * Public, unauthenticated server action — backed by RLS policy
 * `waitlist_anon_insert` (migration 030). Anyone can insert; only
 * founders can read. We never echo a row back.
 */
export async function submitAccessRequestAction(
  payload: AccessRequestPayload
): Promise<ActionResult> {
  return runAction(SUBJECT, async () => {
    if (!payload.full_name || !payload.email) {
      throw new Error("Name and email are required.");
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) {
      throw new Error("Enter a valid email.");
    }

    // The only door a new customer has (088: 3/hr/IP, 100/day
    // global). Identity door: fails OPEN — and one honest sentence
    // whichever cap tripped, because "how many others applied today"
    // is not the applicant's business.
    const ip = clientIpFrom(await headers());
    const verdict = await limitOpen("access_request_ip", ip);
    if (!verdict.allowed) {
      throw new Error(
        "We've already received a request from you. We'll be in touch."
      );
    }

    // Turnstile (D4): enforced only when the founder has provisioned
    // the keys; an outage fails open with a capture. A token that
    // verifies as WRONG is a scripted submission and is refused.
    const captcha = await verifyTurnstile(payload.turnstile_token, ip);
    if (!captcha.ok) {
      throw new Error(
        "We couldn't confirm you're human. Reload the page and try again."
      );
    }

    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.from("waitlist").insert({
      full_name: payload.full_name,
      email: payload.email.toLowerCase(),
      company: payload.company || null,
      role: payload.role || null,
      referral_source: payload.referral_source || null,
      use_case: payload.use_case || null,
    });

    if (error) {
      // Hide the unique-index violation behind a friendly message —
      // we don't want to leak which emails have already applied.
      if (error.code === "23505") {
        // Pretend success — applicant gets the same thank-you regardless.
        return;
      }
      throw new Error(`Could not submit your request: ${error.message}`);
    }

    // Best-effort founder notification. Failures here don't block the
    // applicant — the row is in the table either way.
    try {
      await notifyFoundersOfWaitlistRequest(payload);
    } catch (err) {
      console.error("[waitlist] founder notification failed", err);
    }
  });
}
