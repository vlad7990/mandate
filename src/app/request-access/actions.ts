"use server";

import { createServerSupabaseClient } from "@/lib/supabase-server";
import { notifyFoundersOfWaitlistRequest } from "@/lib/waitlist/notify";

export type AccessRequestPayload = {
  full_name: string;
  email: string;
  company: string;
  role: string;
  referral_source: string;
  use_case: string;
};

/**
 * Public, unauthenticated server action — backed by RLS policy
 * `waitlist_anon_insert` (migration 030). Anyone can insert; only
 * founders can read. We never echo a row back.
 */
export async function submitAccessRequestAction(
  payload: AccessRequestPayload
): Promise<void> {
  if (!payload.full_name || !payload.email) {
    throw new Error("Name and email are required.");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) {
    throw new Error("Enter a valid email.");
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
}
