"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getPortalAccess } from "@/lib/auth/portal-access";
import { EXTERNAL_ROLES, type ExternalRole } from "@/lib/auth/roles";
import { sendEmail } from "@/lib/email/send";
import { renderInvitationEmail } from "@/lib/email/invitation";
import { runAction } from "@/lib/actions/run";
import type { ActionResult } from "@/lib/actions/result";

/**
 * The client_admin's people management — the one management surface the
 * client side holds (D4). Authorization lives in the database: every
 * mutation here is either a SECURITY DEFINER RPC that re-checks the
 * caller (issue/revoke/grant), or a users-table write that RLS scopes to
 * the caller's own company and the 067 trigger limits to `status`. The
 * checks in this file exist to produce readable sentences, not to be the
 * boundary.
 */

function isExternal(value: string): value is ExternalRole {
  return (EXTERNAL_ROLES as readonly string[]).includes(value);
}

export type InviteOutcome = {
  /** Whether the invitation email actually left the building. */
  emailSent: boolean;
  emailDetail: string | null;
};

export async function inviteColleagueAction(input: {
  email: string;
  fullName: string;
  role: string;
  projectIds: string[];
}): Promise<ActionResult<InviteOutcome>> {
  return runAction("The invitation", async () => {
    const access = await getPortalAccess();
    if (!access || access.role !== "client_admin") {
      throw new Error("Only your company's admin can invite colleagues.");
    }
    if (!isExternal(input.role)) {
      throw new Error("Choose a role for your colleague.");
    }

    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.rpc("issue_external_invitation", {
      p_client_id: access.clientId,
      p_email: input.email,
      p_full_name: input.fullName,
      p_role: input.role,
      p_project_ids: input.projectIds,
    });
    if (error) {
      throw new Error(error.message);
    }

    type IssueRow = { invitation_id: string; invitation_token: string };
    const issued = ((data ?? []) as IssueRow[])[0];
    if (!issued) {
      throw new Error("The invitation could not be created.");
    }

    // Delivery honesty: the invitation exists either way, and the caller
    // is told whether the email went out or the link must be passed on by
    // hand. A swallowed send failure here is a colleague who was never
    // actually invited.
    const message = renderInvitationEmail({
      inviteeName: input.fullName,
      inviterLabel: access.fullName,
      organizationName: access.organizationName,
      clientName: access.clientName,
      role: input.role,
      token: issued.invitation_token,
      expiresAt: new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString(),
    });
    const sent = await sendEmail({
      to: [input.email],
      subject: message.subject,
      html: message.html,
      text: message.text,
    });

    revalidatePath("/portal/people");
    return {
      emailSent: sent.sent,
      emailDetail: sent.sent ? null : sent.detail,
    };
  });
}

export async function resendInvitationAction(
  invitationId: string
): Promise<ActionResult<InviteOutcome>> {
  return runAction("The resend", async () => {
    const access = await getPortalAccess();
    if (!access || access.role !== "client_admin") {
      throw new Error("Only your company's admin can resend invitations.");
    }

    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.rpc("resend_external_invitation", {
      p_invitation_id: invitationId,
    });
    if (error) throw new Error(error.message);

    type ResendRow = {
      invitation_token: string;
      email: string;
      full_name: string;
      role: string;
      expires_at: string;
    };
    const inv = ((data ?? []) as ResendRow[])[0];
    if (!inv || !isExternal(inv.role)) {
      throw new Error("The invitation could not be resent.");
    }

    const message = renderInvitationEmail({
      inviteeName: inv.full_name,
      inviterLabel: access.fullName,
      organizationName: access.organizationName,
      clientName: access.clientName,
      role: inv.role,
      token: inv.invitation_token,
      expiresAt: inv.expires_at,
    });
    const sent = await sendEmail({
      to: [inv.email],
      subject: message.subject,
      html: message.html,
      text: message.text,
    });

    revalidatePath("/portal/people");
    return {
      emailSent: sent.sent,
      emailDetail: sent.sent ? null : sent.detail,
    };
  });
}

export async function revokeInvitationAction(
  invitationId: string
): Promise<ActionResult> {
  return runAction("The revocation", async () => {
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.rpc("revoke_external_invitation", {
      p_invitation_id: invitationId,
    });
    if (error) throw new Error(error.message);
    revalidatePath("/portal/people");
  });
}

export async function setColleagueStatusAction(
  userId: string,
  nextStatus: "active" | "suspended"
): Promise<ActionResult> {
  return runAction("The status change", async () => {
    const access = await getPortalAccess();
    if (!access || access.role !== "client_admin") {
      throw new Error("Only your company's admin can suspend or restore access.");
    }
    if (userId === access.userId) {
      throw new Error("You cannot suspend your own account.");
    }

    const supabase = await createServerSupabaseClient();
    const { data: updated, error } = await supabase
      .from("users")
      .update({ status: nextStatus, updated_at: new Date().toISOString() })
      .eq("id", userId)
      .select("id");

    if (error) throw new Error(error.message);
    if (!updated || updated.length === 0) {
      // RLS filtered the row: not this company's person, or the caller's
      // own standing changed under them.
      throw new Error("That account is not yours to manage.");
    }
    revalidatePath("/portal/people");
  });
}

export async function grantAccessAction(
  projectId: string,
  userId: string
): Promise<ActionResult> {
  return runAction("The access grant", async () => {
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.rpc("grant_mandate_access", {
      p_project_id: projectId,
      p_user_id: userId,
    });
    if (error) throw new Error(error.message);
    revalidatePath("/portal/people");
  });
}

export async function revokeAccessAction(
  projectId: string,
  userId: string
): Promise<ActionResult> {
  return runAction("The access revocation", async () => {
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.rpc("revoke_mandate_access", {
      p_project_id: projectId,
      p_user_id: userId,
    });
    if (error) throw new Error(error.message);
    revalidatePath("/portal/people");
  });
}
