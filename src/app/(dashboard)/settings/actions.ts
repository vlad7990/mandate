"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase-server";

type AuthContext = {
  userId: string;
  isFounder: boolean;
  organizationId: string | null;
};

async function requireFounder(): Promise<AuthContext> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthenticated.");

  const { data: profile, error } = await supabase
    .from("users")
    .select("is_founder, organization_id, status")
    .eq("id", user.id)
    .single<{
      is_founder: boolean;
      organization_id: string | null;
      status: string;
    }>();

  if (error || !profile) {
    throw new Error("Profile not found.");
  }
  if (profile.status !== "active") {
    throw new Error("Account is not active.");
  }
  if (!profile.is_founder) {
    throw new Error("Founders only.");
  }

  return {
    userId: user.id,
    isFounder: profile.is_founder,
    organizationId: profile.organization_id,
  };
}

/**
 * Approve a pending user. Sets status='active' and (optionally) assigns
 * them to the founder's organization if they're not yet attached. RLS on
 * the users table allows founders to update other rows via the
 * `founders_can_update_users` policy from migration 002.
 */
export async function approveUserAction(targetUserId: string): Promise<void> {
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

  revalidatePath("/settings");
}

/**
 * Reject a pending or active user — sets status='suspended'. The user
 * retains org membership (we don't unassign) so that audit trail
 * survives, but the dashboard layout's gate (`status === 'pending' →
 * /auth/pending`) and signin gate (`status === 'suspended' → signed
 * out with a friendly error`) prevent further access.
 */
export async function rejectUserAction(targetUserId: string): Promise<void> {
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

  revalidatePath("/settings");
}
