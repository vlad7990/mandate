"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase-server";

async function requireFounder(): Promise<{
  userId: string;
  organizationId: string | null;
}> {
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

  if (error || !profile) throw new Error("Profile not found.");
  if (!profile.is_founder || profile.status !== "active") {
    throw new Error("Founder access required.");
  }
  return { userId: user.id, organizationId: profile.organization_id };
}

export async function approveWaitlistRequestAction(
  requestId: string
): Promise<void> {
  if (!requestId) throw new Error("Missing requestId.");
  const auth = await requireFounder();
  const supabase = await createServerSupabaseClient();

  const { error } = await supabase
    .from("waitlist")
    .update({
      status: "approved",
      reviewed_by: auth.userId,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", requestId);

  if (error) {
    throw new Error(`Failed to approve: ${error.message}`);
  }

  // Approval is recorded; the actual user creation flow is left to the
  // existing /auth/signup → FOUNDER_EMAILS allowlist machinery. Once
  // the founder forwards the invite link to the applicant they sign
  // up normally; their `users.status` flips active manually from
  // /settings if needed. Keeping this surface minimal until the
  // founder asks for automatic invite-email delivery.

  revalidatePath("/settings/waitlist");
}

export async function rejectWaitlistRequestAction(
  requestId: string
): Promise<void> {
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
  revalidatePath("/settings/waitlist");
}

export async function saveWaitlistNoteAction(
  requestId: string,
  note: string
): Promise<void> {
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
  revalidatePath("/settings/waitlist");
}
