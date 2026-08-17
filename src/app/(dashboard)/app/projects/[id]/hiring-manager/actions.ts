"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { requireActionContext } from "@/lib/auth/access";
import { contactLabel } from "@/lib/clients/contacts";
import { runAction } from "@/lib/actions/run";
import type { ActionResult } from "@/lib/actions/result";

/** Sentence subject for a failure this file did not author. See `runAction`. */
const SUBJECT = "The share link";

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
 * Which contact this link is for, checked against the project's client.
 *
 * 054 gave `hiring_manager_tokens` a nullable `contact_id`, so "invite this
 * contact" is a token pointed at a CRM record rather than another free-text
 * string. The check is here rather than in a foreign key because tokens are
 * project-scoped and contacts are client-scoped: "this contact works at the
 * client this mandate is for" is not expressible as an FK, and a trigger
 * would have to carve out the normal case where `projects.client_id` is
 * still null because the company is being analysed.
 *
 * Returns the label to store alongside it. The label is derived from the
 * contact rather than taken from the form, so the two cannot disagree — the
 * same rule the placement sign-off uses.
 */
async function resolveTokenContact(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  projectId: string,
  contactId: string
): Promise<{ id: string; label: string }> {
  const { data: project } = await supabase
    .from("projects")
    .select("client_id")
    .eq("id", projectId)
    .single<{ client_id: string | null }>();

  const { data: contact } = await supabase
    .from("client_contacts")
    .select("id, full_name, title, client_id, is_archived")
    .eq("id", contactId)
    .maybeSingle<{
      id: string;
      full_name: string;
      title: string | null;
      client_id: string;
      is_archived: boolean;
    }>();

  if (!contact) throw new Error("Contact not found.");
  if (!project?.client_id || contact.client_id !== project.client_id) {
    throw new Error("That contact is not at this mandate's client.");
  }
  if (contact.is_archived) {
    throw new Error(`${contact.full_name} is archived and cannot be sent a link.`);
  }

  return { id: contact.id, label: contactLabel(contact) };
}

/**
 * Mint a hiring-manager share token for the project. Returns the
 * token uuid which the caller renders into the share URL. Tokens
 * default to 30-day expiry; revoke via revokeHmTokenAction.
 *
 * `contactId` is optional and stays optional: a link can still be issued to
 * a typed name with no contact record, which is what every token written
 * before 054 is. Naming a contact does not give them an account — externals
 * remain on the token path with no login.
 */
export async function generateHmTokenAction(
  projectId: string,
  label: string,
  contactId?: string
): Promise<ActionResult<{ token: string; expires_at: string }>> {
  return runAction(SUBJECT, async () => {
    const auth = await requireActiveUser();
    await assertProjectOwnership(projectId, auth.organizationId);

    const expiresAt = new Date(
      Date.now() + DEFAULT_EXPIRY_DAYS * 24 * 60 * 60 * 1000
    ).toISOString();

    const supabase = await createServerSupabaseClient();

    const contact = contactId?.trim()
      ? await resolveTokenContact(supabase, projectId, contactId.trim())
      : null;

    const { data, error } = await supabase
      .from("hiring_manager_tokens")
      .insert({
        project_id: projectId,
        organization_id: auth.organizationId,
        created_by: auth.userId,
        contact_id: contact?.id ?? null,
        label: contact?.label ?? label.trim(),
        expires_at: expiresAt,
      })
      .select("token, expires_at")
      .single<{ token: string; expires_at: string }>();

    if (error || !data) {
      throw new Error(`Failed to mint token: ${error?.message ?? "no row"}`);
    }

    revalidatePath(`/app/projects/${projectId}/hiring-manager`);
    return { token: data.token, expires_at: data.expires_at };
  });
}

export async function revokeHmTokenAction(
  projectId: string,
  tokenId: string
): Promise<ActionResult> {
  return runAction(SUBJECT, async () => {
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
  });
}
