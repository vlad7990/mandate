"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { assertFounder } from "@/lib/auth/access";
import { runAction } from "@/lib/actions/run";
import type { ActionResult } from "@/lib/actions/result";

/** Sentence subject for a failure this file did not author. See `runAction`. */
const SUBJECT = "The account update";

type AuthContext = {
  userId: string;
  isFounder: boolean;
  organizationId: string | null;
};

/**
 * Approving a pending account assigns it to an organisation, which is a
 * platform act rather than an org one — so these two stay founder-gated.
 * Changing a member's role *within* an org is the admin's job and lives in
 * `settings/members/actions.ts`.
 */
async function requireFounder(): Promise<AuthContext> {
  const access = await assertFounder();
  return {
    userId: access.userId,
    isFounder: access.isFounder,
    organizationId: access.organizationId,
  };
}

/**
 * Approve a pending user. Sets status='active' and (optionally) assigns
 * them to the founder's organization if they're not yet attached. RLS on
 * the users table allows founders to update other rows via the
 * `founders_can_update_users` policy from migration 002.
 */
export async function approveUserAction(targetUserId: string): Promise<ActionResult> {
  return runAction(SUBJECT, async () => {
    const auth = await requireFounder();
    const supabase = await createServerSupabaseClient();

    const { data: target, error: targetError } = await supabase
      .from("users")
      .select("id, organization_id, status, is_founder")
      .eq("id", targetUserId)
      .single<{
        id: string;
        organization_id: string | null;
        status: string;
        is_founder: boolean;
      }>();

    if (targetError || !target) {
      throw new Error(`User not found: ${targetError?.message ?? targetUserId}`);
    }

    // If the pending user has no org yet, assign them to the founder's org.
    // Otherwise just flip their status.
    const updates: Record<string, unknown> = {
      status: "active",
      updated_at: new Date().toISOString(),
    };
    if (!target.organization_id && auth.organizationId) {
      updates.organization_id = auth.organizationId;
    }

    const { error: updateError } = await supabase
      .from("users")
      .update(updates)
      .eq("id", targetUserId);

    if (updateError) {
      throw new Error(`Failed to approve user: ${updateError.message}`);
    }

    revalidatePath("/ops");
  });
}

/**
 * Reject a pending or active user — sets status='suspended'. The user
 * retains org membership (we don't unassign) so that audit trail
 * survives, but the dashboard layout's gate (`status === 'pending' →
 * /auth/pending`) and signin gate (`status === 'suspended' → signed
 * out with a friendly error`) prevent further access.
 */
export async function rejectUserAction(targetUserId: string): Promise<ActionResult> {
  return runAction(SUBJECT, async () => {
    await requireFounder();
    const supabase = await createServerSupabaseClient();

    const { error } = await supabase
      .from("users")
      .update({
        status: "suspended",
        updated_at: new Date().toISOString(),
      })
      .eq("id", targetUserId);

    if (error) {
      throw new Error(`Failed to reject user: ${error.message}`);
    }

    revalidatePath("/ops");
  });
}
