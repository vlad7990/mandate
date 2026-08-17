"use server";

// Candidate outreach — logging contact, and discharging the Art. 14 duty.
//
// The write goes through log_candidate_outreach() rather than an insert,
// because logging a notice-carrying message and stamping
// candidates.subject_notified_at are two writes that must not come apart. A
// stamp with no message behind it is an attestation with no evidence; a message
// that failed to stamp leaves an obligation looking open when it was met.

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase-server";

// The channel vocabulary lives in `outreach-constants.ts`, not here: a
// `"use server"` module may only export async functions, and exporting the
// array from this file made the whole page's action manifest invalid. See
// the note in that file.
import type { OutreachChannel, OutreachDirection } from "./outreach-constants";
import { runAction } from "@/lib/actions/run";
import type { ActionResult } from "@/lib/actions/result";

/** Sentence subject for a failure this file did not author. See `runAction`. */
const SUBJECT = "The outreach log";

export type LogOutreachInput = {
  channel: OutreachChannel;
  direction: OutreachDirection;
  subject: string;
  body: string;
  /** Did this message actually tell them where their data came from? */
  includesPrivacyNotice: boolean;
  /** ISO. Defaults to now when omitted — logging a call from yesterday is normal. */
  occurredAt?: string | null;
};

async function requireAuth(): Promise<{ userId: string; organizationId: string }> {
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
  return { userId: user.id, organizationId: profile.organization_id };
}

export async function logOutreachAction(
  projectId: string,
  candidateId: string,
  input: LogOutreachInput
): Promise<ActionResult<{ notifiedAt: string | null }>> {
  return runAction(SUBJECT, async () => {
    await requireAuth();
    const supabase = await createServerSupabaseClient();

    if (input.includesPrivacyNotice && input.direction === "inbound") {
      // The RPC rejects this too; caught here so the recruiter gets a sentence
      // rather than a database error.
      throw new Error(
        "A reply you received cannot be the message that notified them."
      );
    }

    const subject = input.subject.trim();
    const body = input.body.trim();
    if (!subject && !body) {
      throw new Error("Add a subject or a note so the record says something.");
    }

    const { data, error } = await supabase
      .rpc("log_candidate_outreach", {
        p_candidate_id: candidateId,
        p_channel: input.channel,
        p_direction: input.direction,
        p_subject: subject || null,
        p_body: body || null,
        p_includes_privacy_notice: input.includesPrivacyNotice,
        p_occurred_at: input.occurredAt ?? null,
      })
      .single<{ id: string; subject_notified_at: string | null }>();

    if (error || !data) {
      throw new Error(
        `Nothing was logged: ${error?.message ?? "the write failed"}`
      );
    }

    revalidatePath(`/app/projects/${projectId}/candidates/${candidateId}`);
    revalidatePath(`/app/projects/${projectId}/candidates`);

    return { notifiedAt: data.subject_notified_at };
  });
}
