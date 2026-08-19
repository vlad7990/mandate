"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { requireActionContext } from "@/lib/auth/access";
import { EXTERNAL_ROLES, type ExternalRole } from "@/lib/auth/roles";
import { sendEmail, siteUrl } from "@/lib/email/send";
import { renderInvitationEmail } from "@/lib/email/invitation";
import { runAction } from "@/lib/actions/run";
import type { ActionResult } from "@/lib/actions/result";

/**
 * Staff-side management of a client's portal people. Everything here sits
 * at `clients:share` — inviting an external, sharing a mandate, granting
 * a slate: all of it is the "anything that leaves the building" tier. The
 * real refusals are the 068 RPCs' own checks and the RLS/trigger set on
 * users, mandate_shares and mandate_grants; this file's checks produce
 * the sentences.
 */

const SUBJECT = "The portal change";

function isExternal(value: string): value is ExternalRole {
  return (EXTERNAL_ROLES as readonly string[]).includes(value);
}

export type StaffInviteOutcome = {
  emailSent: boolean;
  emailDetail: string | null;
  /**
   * The redemption link, for the inviter to pass on by hand when the
   * email did not go. Staff holding clients:share can read the token from
   * the table anyway — this hands them the same thing at the moment they
   * need it, and only then.
   */
  inviteUrl: string | null;
};

export async function inviteExternalStaffAction(input: {
  clientId: string;
  clientName: string;
  organizationName: string;
  email: string;
  fullName: string;
  role: string;
  projectIds: string[];
}): Promise<ActionResult<StaffInviteOutcome>> {
  return runAction("The invitation", async () => {
    const actor = await requireActionContext("clients:share");
    if (!isExternal(input.role)) {
      throw new Error("Choose a portal role for the invitee.");
    }

    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.rpc("issue_external_invitation", {
      p_client_id: input.clientId,
      p_email: input.email,
      p_full_name: input.fullName,
      p_role: input.role,
      p_project_ids: input.role === "hiring_manager" ? input.projectIds : [],
    });
    if (error) throw new Error(error.message);

    type IssueRow = { invitation_id: string; invitation_token: string };
    const issued = ((data ?? []) as IssueRow[])[0];
    if (!issued) throw new Error("The invitation could not be created.");

    const { data: profile } = await supabase
      .from("users")
      .select("full_name, email")
      .eq("id", actor.userId)
      .maybeSingle<{ full_name: string | null; email: string }>();

    const message = renderInvitationEmail({
      inviteeName: input.fullName,
      inviterLabel: profile?.full_name?.trim() || profile?.email || "",
      organizationName: input.organizationName,
      clientName: input.clientName,
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

    revalidatePath(`/app/clients/${input.clientId}`);
    return {
      emailSent: sent.sent,
      emailDetail: sent.sent ? null : sent.detail,
      inviteUrl: sent.sent ? null : `${siteUrl()}/invite/${issued.invitation_token}`,
    };
  });
}

export async function resendInvitationStaffAction(input: {
  clientId: string;
  clientName: string;
  organizationName: string;
  invitationId: string;
}): Promise<ActionResult<StaffInviteOutcome>> {
  return runAction("The resend", async () => {
    const actor = await requireActionContext("clients:share");
    const supabase = await createServerSupabaseClient();

    // Same token, fresh clock (070/D4); the RPC refuses accepted and
    // revoked states with its own sentences, passed through verbatim.
    const { data, error } = await supabase.rpc("resend_external_invitation", {
      p_invitation_id: input.invitationId,
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

    const { data: profile } = await supabase
      .from("users")
      .select("full_name, email")
      .eq("id", actor.userId)
      .maybeSingle<{ full_name: string | null; email: string }>();

    const message = renderInvitationEmail({
      inviteeName: inv.full_name,
      inviterLabel: profile?.full_name?.trim() || profile?.email || "",
      organizationName: input.organizationName,
      clientName: input.clientName,
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

    revalidatePath(`/app/clients/${input.clientId}`);
    return {
      emailSent: sent.sent,
      emailDetail: sent.sent ? null : sent.detail,
      inviteUrl: sent.sent ? null : `${siteUrl()}/invite/${inv.invitation_token}`,
    };
  });
}

export async function revokeInvitationStaffAction(
  clientId: string,
  invitationId: string
): Promise<ActionResult> {
  return runAction(SUBJECT, async () => {
    await requireActionContext("clients:share");
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.rpc("revoke_external_invitation", {
      p_invitation_id: invitationId,
    });
    if (error) throw new Error(error.message);
    revalidatePath(`/app/clients/${clientId}`);
  });
}

export async function setExternalStatusStaffAction(
  clientId: string,
  userId: string,
  nextStatus: "active" | "suspended"
): Promise<ActionResult> {
  return runAction(SUBJECT, async () => {
    await requireActionContext("clients:share");
    const supabase = await createServerSupabaseClient();
    const { data: updated, error } = await supabase
      .from("users")
      .update({ status: nextStatus, updated_at: new Date().toISOString() })
      .eq("id", userId)
      .select("id");
    if (error) throw new Error(error.message);
    if (!updated || updated.length === 0) {
      throw new Error("That account is not one of this client's people.");
    }
    revalidatePath(`/app/clients/${clientId}`);
  });
}

export async function setMandateSharedAction(
  clientId: string,
  projectId: string,
  shared: boolean
): Promise<ActionResult> {
  return runAction(SUBJECT, async () => {
    const actor = await requireActionContext("clients:share");
    const supabase = await createServerSupabaseClient();

    if (shared) {
      const { error } = await supabase.from("mandate_shares").insert({
        organization_id: actor.organizationId,
        project_id: projectId,
        client_id: clientId,
        shared_by: actor.userId,
      });
      // A second share of the same mandate is already the state asked for.
      if (error && !error.message.includes("mandate_shares_one_per_project")) {
        throw new Error(error.message);
      }
    } else {
      const { error } = await supabase
        .from("mandate_shares")
        .delete()
        .eq("project_id", projectId);
      if (error) throw new Error(error.message);
    }
    revalidatePath(`/app/clients/${clientId}`);
    revalidatePath(`/app/projects/${projectId}/hiring-manager`);
  });
}

export async function setHmGrantAction(
  clientId: string,
  projectId: string,
  userId: string,
  granted: boolean
): Promise<ActionResult> {
  return runAction(SUBJECT, async () => {
    const actor = await requireActionContext("clients:share");
    const supabase = await createServerSupabaseClient();

    if (granted) {
      const { error } = await supabase.from("mandate_grants").insert({
        organization_id: actor.organizationId,
        project_id: projectId,
        client_id: clientId,
        user_id: userId,
        granted_by: actor.userId,
      });
      if (error && !error.message.includes("mandate_grants_one_per_user")) {
        throw new Error(error.message);
      }
    } else {
      const { error } = await supabase
        .from("mandate_grants")
        .delete()
        .eq("project_id", projectId)
        .eq("user_id", userId);
      if (error) throw new Error(error.message);
    }
    revalidatePath(`/app/clients/${clientId}`);
    revalidatePath(`/app/projects/${projectId}/hiring-manager`);
  });
}
