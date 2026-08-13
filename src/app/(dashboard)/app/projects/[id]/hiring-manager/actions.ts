"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { requireActionContext } from "@/lib/auth/access";

const DEFAULT_EXPIRY_DAYS = 30;

type AuthContext = {
  userId: string;
  organizationId: string;
};

async function requireActiveUser(): Promise<AuthContext> {
  return requireActionContext("clients:share");
}

async function assertProjectOwnership(
  projectId: string,
  organizationId: string
): Promise<void> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("projects")
    .select("organization_id")
    .eq("id", projectId)
    .single<{ organization_id: string | null }>();
  if (error || !data) throw new Error("Project not found.");
  if (data.organization_id !== organizationId) {
    throw new Error("Project belongs to a different organisation.");
  }
}

/**
 * Mint a hiring-manager share token for the project. Returns the
 * token uuid which the caller renders into the share URL. Tokens
 * default to 30-day expiry; revoke via revokeHmTokenAction.
 */
export async function generateHmTokenAction(
  projectId: string,
  label: string
): Promise<{ token: string; expires_at: string }> {
  const auth = await requireActiveUser();
  await assertProjectOwnership(projectId, auth.organizationId);

  const expiresAt = new Date(
    Date.now() + DEFAULT_EXPIRY_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("hiring_manager_tokens")
    .insert({
      project_id: projectId,
      organization_id: auth.organizationId,
      created_by: auth.userId,
      label: label.trim(),
      expires_at: expiresAt,
    })
    .select("token, expires_at")
    .single<{ token: string; expires_at: string }>();

  if (error || !data) {
    throw new Error(`Failed to mint token: ${error?.message ?? "no row"}`);
  }

  revalidatePath(`/app/projects/${projectId}/hiring-manager`);
  return { token: data.token, expires_at: data.expires_at };
}

export async function revokeHmTokenAction(
  projectId: string,
  tokenId: string
): Promise<void> {
  const auth = await requireActiveUser();
  await assertProjectOwnership(projectId, auth.organizationId);

  const supabase = await createServerSupabaseClient();
  // RLS already scopes the update by org; the project-id filter keeps
  // the action narrow.
  const { error } = await supabase
    .from("hiring_manager_tokens")
    .update({ revoked_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", tokenId)
    .eq("project_id", projectId);

  if (error) {
    throw new Error(`Failed to revoke token: ${error.message}`);
  }

  revalidatePath(`/app/projects/${projectId}/hiring-manager`);
}
