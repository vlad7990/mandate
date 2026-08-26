"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { requireActionContext } from "@/lib/auth/access";
import { isExternalRole, parseRole } from "@/lib/auth/roles";
import { memberStatusRefusal } from "@/lib/members/status-rules";
import { runAction } from "@/lib/actions/run";
import { ActionFailure, type ActionResult } from "@/lib/actions/result";

/** Sentence subject for a failure this file did not author. See `runAction`. */
const SUBJECT = "The role change";

/** What a role write actually did — "pending" means it awaits a second admin. */
export type RoleWriteOutcome = "applied" | "pending";

/**
 * Changing a colleague's role.
 *
 * This is the one place in the product that writes `users.role`, and it is
 * the reason the column now means something. It sits with the org admin
 * rather than with the founder: a customer administers their own team, and
 * `is_founder` stays Mandate's own flag.
 *
 * Three guards, deliberately in three different places:
 *
 *   1. `org:manage` here, so the action refuses before it touches the row.
 *   2. `admins_can_update_org_users` in RLS, so a hand-rolled PostgREST call
 *      from a recruiter's browser refuses too.
 *   3. `guard_user_privilege_changes` as a trigger, because RLS cannot say
 *      *which columns* an update may touch — without it an admin inside the
 *      policy could set `is_founder = true` on themselves.
 *
 * Both migration 046. 129 adds a fourth: granting `admin` goes through
 * `propose_admin_grant`, which applies it outright while an org has
 * fewer than two admins and otherwise parks it for a second one.
 */
export async function setMemberRoleAction(
  targetUserId: string,
  nextRole: string
): Promise<ActionResult<RoleWriteOutcome>> {
  return runAction(SUBJECT, async () => {
    const actor = await requireActionContext("org:manage");

    const role = parseRole(nextRole);
    if (!role) {
      throw new Error(`Not a role: ${nextRole}`);
    }

    // The vocabulary now spans the client boundary (067). A staff member
    // cannot become an external here — that transition is a different
    // identity, not a promotion — and the XOR CHECK would refuse the row
    // anyway; this states it in words instead of a constraint error.
    if (isExternalRole(role)) {
      throw new Error(
        "Client-side roles are assigned by invitation, not from the members screen."
      );
    }

    const supabase = await createServerSupabaseClient();

    const { data: target, error: readError } = await supabase
      .from("users")
      .select("id, organization_id, is_founder, role, full_name, email")
      .eq("id", targetUserId)
      .single<{
        id: string;
        organization_id: string | null;
        is_founder: boolean;
        role: string | null;
        full_name: string | null;
        email: string;
      }>();

    if (readError || !target) {
      throw new Error("That member is not visible from your organisation.");
    }

    // Checked here as well as in RLS because the error a person reads should
    // say what went wrong, and a policy denial arrives as zero rows updated.
    if (target.organization_id !== actor.organizationId) {
      throw new Error("That member belongs to a different organisation.");
    }

    // A Mandate founder sitting inside a customer org is not the customer's to
    // demote. The database would permit it — the row is in reach of
    // `admins_can_update_org_users` — so the rule is stated here.
    if (target.is_founder) {
      throw new Error(
        "Founder accounts are managed by Mandate and cannot be changed here."
      );
    }

    if (parseRole(target.role) === role) {
      return "applied"; // Nothing to do; don't spend a write or a revalidation.
    }

    // 129 — granting admin takes two people. The RPC decides whether that
    // applies: below two active admins there is nobody to ask, so it
    // grants outright and says so. We route through it rather than
    // testing the threshold here, because the same threshold is enforced
    // by the trigger and a second copy of the rule would be a second
    // thing to drift.
    if (role === "admin") {
      const { data, error } = await supabase.rpc("propose_admin_grant", {
        p_target_user_id: targetUserId,
      });
      if (error) throw new Error(error.message);
      revalidatePath("/app/settings/members");
      revalidatePath("/app/settings");
      // "Awaiting a second admin" is an OUTCOME, not a failure — it rides
      // the success channel so the screen can say what happened instead
      // of showing a red toast for a thing that worked.
      return (data as { outcome?: string } | null)?.outcome === "pending"
        ? "pending"
        : "applied";
    }

    // `.select()` on the update is what turns a policy denial into something
    // the caller can see. A trigger raises and lands in `updateError`, but RLS
    // refusing the row is silent — the statement succeeds and touches nothing.
    // Without the returned row this action would report success on a write
    // that never happened.
    const { data: updated, error: updateError } = await supabase
      .from("users")
      .update({ role, updated_at: new Date().toISOString() })
      .eq("id", targetUserId)
      .select("id");

    if (updateError) {
      // The last-admin trigger raises with a readable message; pass it
      // through rather than replacing it with something vaguer.
      throw new Error(updateError.message);
    }

    if (!updated || updated.length === 0) {
      throw new Error(
        "The change was refused. You may no longer have admin access to this organisation."
      );
    }

    revalidatePath("/app/settings/members");
    revalidatePath("/app/settings");
    return "applied";
  });
}

/**
 * Suspending or restoring a colleague (§134 D3).
 *
 * Same discipline as the role writer: capability gate first, refusals in
 * words (the pure rule in src/lib/members/status-rules.ts carries the
 * lockout invariants — never the founder, never yourself, never an agent,
 * never the last active admin), and a `.select()` read-back so a silent
 * RLS denial cannot report success.
 */
export async function setMemberStatusAction(
  targetUserId: string,
  nextStatus: string
): Promise<ActionResult> {
  return runAction("The status change", async () => {
    const actor = await requireActionContext("org:manage");

    if (nextStatus !== "active" && nextStatus !== "suspended") {
      throw new Error(`Not a member status: ${nextStatus}`);
    }

    const supabase = await createServerSupabaseClient();

    const { data: target, error: readError } = await supabase
      .from("users")
      .select("id, organization_id, is_founder, role, status")
      .eq("id", targetUserId)
      .single<{
        id: string;
        organization_id: string | null;
        is_founder: boolean;
        role: string | null;
        status: string;
      }>();

    if (readError || !target) {
      throw new Error("That member is not visible from your organisation.");
    }
    if (target.organization_id !== actor.organizationId) {
      throw new Error("That member belongs to a different organisation.");
    }

    const { count: adminCount } = await supabase
      .from("users")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", actor.organizationId)
      .eq("role", "admin")
      .eq("status", "active");

    const refusal = memberStatusRefusal({
      actorId: actor.userId,
      target,
      nextStatus,
      activeAdminCount: adminCount ?? 0,
    });
    if (refusal) {
      throw new Error(refusal);
    }

    if (target.status === nextStatus) {
      return;
    }

    const { data: updated, error: updateError } = await supabase
      .from("users")
      .update({ status: nextStatus, updated_at: new Date().toISOString() })
      .eq("id", targetUserId)
      .select("id");

    if (updateError) {
      throw new Error(updateError.message);
    }
    if (!updated || updated.length === 0) {
      throw new Error(
        "The change was refused. You may no longer have admin access to this organisation."
      );
    }

    revalidatePath("/app/settings/members");
  });
}

/**
 * Issuing a staff invitation (§134 D1). The write is RLS-anchored — the
 * admin's own session inserts, `staff_invitations_admin_insert` decides —
 * and nothing is emailed: the admin hands the /join link over, exactly the
 * HM-token contract.
 */
export async function issueStaffInvitationAction(input: {
  email: string;
  fullName: string;
  role: string;
}): Promise<ActionResult<{ url: string; expiresAt: string }>> {
  return runAction("The invitation", async () => {
    const actor = await requireActionContext("org:manage");

    const role = parseRole(input.role);
    if (!role) {
      throw new Error(`Not a role: ${input.role}`);
    }
    if (role === "agent" || isExternalRole(role)) {
      throw new Error("Only staff roles can be invited from the members screen.");
    }

    const email = input.email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error("That does not look like an email address.");
    }
    const fullName = input.fullName.trim();
    if (!fullName) {
      throw new Error("The invitation needs the person's name.");
    }

    const supabase = await createServerSupabaseClient();

    // 129 — an admin-role invitation is an admin grant with a longer
    // fuse, so it takes the same two people. `propose_admin_grant`
    // parks it; the invitation itself is issued by `approve_admin_grant`
    // once a second admin agrees, which is why nothing is inserted here.
    // Below two admins the RPC says 'granted' and the normal path runs.
    if (role === "admin") {
      const { data: proposal, error: proposeError } = await supabase.rpc(
        "propose_admin_grant",
        { p_target_email: email, p_full_name: fullName }
      );
      if (proposeError) throw new Error(proposeError.message);
      if ((proposal as { outcome?: string } | null)?.outcome === "pending") {
        // A pending invitation has no link to hand over yet — the link is
        // minted at approval. Saying so is better than returning a URL
        // that does not exist.
        throw new ActionFailure(
          "Proposed. A second admin has to approve before the invitation is sent."
        );
      }
    }

    // An address that already holds an ACTIVE seat in this org needs no
    // invitation; said in words before the unique index says it in codes.
    const { data: existing } = await supabase
      .from("users")
      .select("id, status")
      .eq("organization_id", actor.organizationId)
      .ilike("email", email)
      .maybeSingle<{ id: string; status: string }>();
    if (existing) {
      throw new Error(
        "That address already belongs to a member of this organisation."
      );
    }

    const { data: self } = await supabase
      .from("users")
      .select("full_name, email")
      .eq("id", actor.userId)
      .maybeSingle<{ full_name: string | null; email: string }>();

    const { data: invitation, error: insertError } = await supabase
      .from("staff_invitations")
      .insert({
        organization_id: actor.organizationId,
        email,
        full_name: fullName,
        role,
        invited_by: actor.userId,
        invited_by_label: self?.full_name?.trim() || self?.email || null,
      })
      .select("token, expires_at")
      .single<{ token: string; expires_at: string }>();

    if (insertError) {
      if (insertError.message.includes("staff_invitations_live_email_idx")) {
        throw new Error(
          "A live invitation for that address already exists. Revoke it first to change the role."
        );
      }
      throw new Error(insertError.message);
    }
    if (!invitation) {
      throw new Error(
        "The invitation was refused. You may no longer have admin access to this organisation."
      );
    }

    revalidatePath("/app/settings/members");
    return {
      url: `/join/${invitation.token}`,
      expiresAt: invitation.expires_at,
    };
  });
}

/** Revoking a live staff invitation. It cannot be reactivated. */
export async function revokeStaffInvitationAction(
  invitationId: string
): Promise<ActionResult> {
  return runAction("The revocation", async () => {
    await requireActionContext("org:manage");
    const supabase = await createServerSupabaseClient();

    const { data: updated, error: updateError } = await supabase
      .from("staff_invitations")
      .update({
        revoked_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", invitationId)
      .is("revoked_at", null)
      .is("accepted_at", null)
      .select("id");

    if (updateError) {
      throw new Error(updateError.message);
    }
    if (!updated || updated.length === 0) {
      throw new Error("That invitation is no longer live.");
    }

    revalidatePath("/app/settings/members");
  });
}

/**
 * Deciding a parked admin grant (129).
 *
 * Approve, decline, or withdraw your own proposal. Every rule that
 * matters lives in the RPC and, beneath it, in the trigger: the
 * approver may not be the proposer, only the proposer may withdraw, an
 * expired request cannot be approved, and a grant that reaches
 * `users.role` any other way is refused outright. This action is the
 * doorway, not the doorman.
 */
export async function decideAdminGrantAction(
  requestId: string,
  decision: "approve" | "reject" | "withdraw"
): Promise<ActionResult> {
  return runAction("The approval", async () => {
    await requireActionContext("org:manage");
    const supabase = await createServerSupabaseClient();

    const { error } =
      decision === "approve"
        ? await supabase.rpc("approve_admin_grant", { p_request_id: requestId })
        : await supabase.rpc("decide_admin_grant", {
            p_request_id: requestId,
            p_decision: decision === "reject" ? "rejected" : "withdrawn",
          });

    if (error) throw new Error(error.message);

    revalidatePath("/app/settings/members");
    revalidatePath("/app/settings");
  });
}
