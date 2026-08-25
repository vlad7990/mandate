"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { assertFounder } from "@/lib/auth/access";
import { isExternalRole, parseRole } from "@/lib/auth/roles";
import { orgProvisionRefusal } from "@/lib/orgs/provision-rules";
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

/**
 * The explicit provisioning choice (§137 D1, the §135 D4 principle — no
 * silent defaults). A new organisation is named by the founder; an existing
 * one is picked, with the staff role picked alongside it.
 */
export type ApprovalProvision =
  | { kind: "new-org"; orgName: string; orgSlug: string }
  | { kind: "existing-org"; organizationId: string; role: string };

/**
 * Approval is a PROVISIONING act (§137 D1) — the middle of the
 * access-request journey this file used to leave to hand-work. The
 * founder's own session writes every row; RLS decides (migration 114:
 * organizations_founder_insert, the cross-org founder pair on
 * staff_invitations). R2: approval issues an INVITATION, never an
 * account — the requester exists only when they set their own password
 * at /join. Nothing is emailed; the founder hands the link over, the
 * standing hand-over contract.
 */
export async function approveWaitlistRequestAction(
  requestId: string,
  provision: ApprovalProvision
): Promise<ActionResult<{ url: string; expiresAt: string }>> {
  return runAction(SUBJECT, async () => {
    if (!requestId) throw new Error("Missing requestId.");
    const auth = await requireFounder();
    const supabase = await createServerSupabaseClient();

    const { data: request, error: requestError } = await supabase
      .from("waitlist")
      .select("id, full_name, email, status")
      .eq("id", requestId)
      .maybeSingle<{
        id: string;
        full_name: string;
        email: string;
        status: string;
      }>();
    if (requestError || !request) {
      throw new Error("That request is not on the waitlist.");
    }
    if (request.status !== "pending") {
      throw new Error("That request has already been reviewed.");
    }

    // Resolve the door: a freshly named organisation, or a seat in an
    // existing one. Either way the invitation role is decided here.
    let organizationId: string;
    let role: string;

    if (provision.kind === "new-org") {
      const refusal = orgProvisionRefusal({
        name: provision.orgName,
        slug: provision.orgSlug,
      });
      if (refusal) throw new Error(refusal);

      const { data: org, error: orgError } = await supabase
        .from("organizations")
        .insert({
          name: provision.orgName.trim(),
          slug: provision.orgSlug.trim(),
        })
        .select("id")
        .single<{ id: string }>();

      if (orgError) {
        if (orgError.message.includes("organizations_slug_key")) {
          throw new Error("That slug is already taken by another organisation.");
        }
        throw new Error(orgError.message);
      }
      if (!org) {
        throw new Error("The organisation was refused.");
      }
      organizationId = org.id;
      // The requester administers the organisation born for them.
      role = "admin";
    } else {
      const parsed = parseRole(provision.role);
      if (!parsed) {
        throw new Error(`Not a role: ${provision.role}`);
      }
      if (parsed === "agent" || isExternalRole(parsed)) {
        throw new Error("Only staff roles can be provisioned from the waitlist.");
      }
      const { data: org } = await supabase
        .from("organizations")
        .select("id")
        .eq("id", provision.organizationId)
        .maybeSingle<{ id: string }>();
      if (!org) {
        throw new Error("That organisation does not exist.");
      }
      organizationId = org.id;
      role = parsed;

      // An address already holding an active seat there needs no
      // invitation; said in words before the unique index says it in codes.
      const { data: existing } = await supabase
        .from("users")
        .select("id")
        .eq("organization_id", organizationId)
        .ilike("email", request.email)
        .maybeSingle<{ id: string }>();
      if (existing) {
        throw new Error(
          "That address already belongs to a member of that organisation."
        );
      }
    }

    const { data: self } = await supabase
      .from("users")
      .select("full_name, email")
      .eq("id", auth.userId)
      .maybeSingle<{ full_name: string | null; email: string }>();

    const { data: invitation, error: inviteError } = await supabase
      .from("staff_invitations")
      .insert({
        organization_id: organizationId,
        email: request.email,
        full_name: request.full_name,
        role,
        invited_by: auth.userId,
        invited_by_label: self?.full_name?.trim() || self?.email || null,
      })
      .select("id, token, expires_at")
      .single<{ id: string; token: string; expires_at: string }>();

    if (inviteError) {
      if (inviteError.message.includes("staff_invitations_live_email_idx")) {
        throw new Error(
          "A live invitation for that address already exists in that organisation."
        );
      }
      throw new Error(inviteError.message);
    }
    if (!invitation) {
      throw new Error("The invitation was refused.");
    }

    // `.select()` read-back so a silent RLS denial cannot report success —
    // if this refuses, the org and invitation stand and the error says so.
    const { data: updated, error: updateError } = await supabase
      .from("waitlist")
      .update({
        status: "approved",
        reviewed_by: auth.userId,
        reviewed_at: new Date().toISOString(),
        staff_invitation_id: invitation.id,
      })
      .eq("id", requestId)
      .eq("status", "pending")
      .select("id");

    if (updateError) {
      throw new Error(`Failed to approve: ${updateError.message}`);
    }
    if (!updated || updated.length === 0) {
      throw new Error(
        "The invitation was issued but the waitlist row refused the update — check the queue before reissuing."
      );
    }

    revalidatePath("/ops/waitlist");
    return {
      url: `/join/${invitation.token}`,
      expiresAt: invitation.expires_at,
    };
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
    revalidatePath("/ops/waitlist");
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
    revalidatePath("/ops/waitlist");
  });
}
