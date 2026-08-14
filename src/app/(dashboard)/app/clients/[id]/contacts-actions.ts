"use server";

/**
 * The people we deal with at a client.
 *
 * Every action here takes `mandates:write` — the tier 049 gave `clients`
 * itself, on the reasoning that holding the client relationship is a
 * recruiter act. A researcher sources into mandates that already exist;
 * they do not open the account and do not own who we speak to at it. Note
 * this is deliberately narrower than `candidate_notes`, which sits at the
 * candidates tier because sourcing is exactly what produces those.
 *
 * RLS in 054 says the same thing and RLS is the boundary. These checks
 * exist so the product refuses before the database has to.
 *
 * Constants and types live in `@/lib/clients/contacts` because a
 * `"use server"` module may only export async functions — see the note at
 * the top of that file.
 */

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { requireActionContext } from "@/lib/auth/access";
import {
  contactEmailKey,
  parseContactType,
  type ContactType,
} from "@/lib/clients/contacts";

function str(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

/** An optional free-text field: empty means "not recorded", not "". */
function strOrNull(formData: FormData, key: string): string | null {
  return str(formData, key) || null;
}

/**
 * A light email check.
 *
 * Deliberately not a full RFC 5322 validation — the shapes that regex
 * rejects are mostly legal addresses, and a recruiter typing a real address
 * the form refuses is a worse outcome than an unusable one being stored.
 * This catches the actual mistake, which is pasting a name or a phone
 * number into the email field.
 */
function emailOrNull(formData: FormData, key: string): string | null {
  const value = str(formData, key);
  if (!value) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    throw new Error(`"${value}" does not look like an email address.`);
  }
  return value;
}

/**
 * Confirm the client is one the caller can see, and return its org.
 *
 * RLS would refuse the write anyway. This exists so a mistyped client id
 * fails as "Client not found" rather than as a foreign-key violation, and
 * so the org written on the row is read from the client rather than
 * assumed to match the caller's — 054 makes that a composite foreign key,
 * but the sentence is better than the constraint name.
 */
async function loadClient(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  clientId: string
): Promise<{ id: string; organization_id: string }> {
  const { data, error } = await supabase
    .from("clients")
    .select("id, organization_id")
    .eq("id", clientId)
    .maybeSingle<{ id: string; organization_id: string }>();

  if (error || !data) throw new Error("Client not found.");
  return data;
}

/**
 * Duplicate-email check, run before the insert.
 *
 * `client_contacts_client_email_idx` is the enforcing copy and would refuse
 * the row regardless. Predicting it here turns "duplicate key value violates
 * unique constraint" into a sentence naming the person already on file,
 * which is the difference between a user fixing their input and a user
 * filing a bug. `contactEmailKey` matches the generated column; there is a
 * test that says so.
 */
async function assertEmailFree(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  clientId: string,
  email: string | null,
  exceptContactId: string | null
): Promise<void> {
  const key = contactEmailKey(email);
  if (!key) return;

  let query = supabase
    .from("client_contacts")
    .select("id, full_name")
    .eq("client_id", clientId)
    .eq("email_key", key);

  if (exceptContactId) query = query.neq("id", exceptContactId);

  const { data } = await query.maybeSingle<{ id: string; full_name: string }>();

  if (data) {
    throw new Error(`${data.full_name} already has that email at this client.`);
  }
}

function revalidate(clientId: string) {
  revalidatePath(`/app/clients/${clientId}`);
  revalidatePath("/app/activity");
}

export async function createContactAction(formData: FormData): Promise<void> {
  const { userId } = await requireActionContext("mandates:write");

  const clientId = str(formData, "clientId");
  if (!clientId) throw new Error("Missing client.");

  const fullName = str(formData, "fullName");
  if (!fullName) throw new Error("A contact needs a name.");

  const contactType: ContactType =
    parseContactType(formData.get("contactType")) ?? "hiring_manager";

  const email = emailOrNull(formData, "email");

  const supabase = await createServerSupabaseClient();
  const client = await loadClient(supabase, clientId);
  await assertEmailFree(supabase, clientId, email, null);

  const { error } = await supabase.from("client_contacts").insert({
    organization_id: client.organization_id,
    client_id: clientId,
    full_name: fullName,
    title: strOrNull(formData, "title"),
    email,
    phone: strOrNull(formData, "phone"),
    linkedin_url: strOrNull(formData, "linkedinUrl"),
    contact_type: contactType,
    // The trigger in 054 demotes whoever was primary before, so this never
    // has to be a read-then-write and two people promoting two different
    // contacts at once cannot both win.
    is_primary: formData.get("isPrimary") === "on",
    created_by: userId,
  });

  if (error) {
    if (error.code === "23505") {
      throw new Error("That email is already on another contact at this client.");
    }
    throw new Error(`Could not add the contact: ${error.message}`);
  }

  revalidate(clientId);
}

export async function updateContactAction(formData: FormData): Promise<void> {
  await requireActionContext("mandates:write");

  const contactId = str(formData, "contactId");
  const clientId = str(formData, "clientId");
  if (!contactId || !clientId) throw new Error("Missing contact.");

  const fullName = str(formData, "fullName");
  if (!fullName) throw new Error("A contact needs a name.");

  const email = emailOrNull(formData, "email");

  const supabase = await createServerSupabaseClient();
  await assertEmailFree(supabase, clientId, email, contactId);

  const { error } = await supabase
    .from("client_contacts")
    .update({
      full_name: fullName,
      title: strOrNull(formData, "title"),
      email,
      phone: strOrNull(formData, "phone"),
      linkedin_url: strOrNull(formData, "linkedinUrl"),
      contact_type: parseContactType(formData.get("contactType")) ?? "hiring_manager",
      is_primary: formData.get("isPrimary") === "on",
      updated_at: new Date().toISOString(),
    })
    .eq("id", contactId)
    .eq("client_id", clientId);

  if (error) {
    if (error.code === "23505") {
      throw new Error("That email is already on another contact at this client.");
    }
    throw new Error(`Could not save the contact: ${error.message}`);
  }

  revalidate(clientId);
}

/**
 * Archive or restore a contact.
 *
 * The ordinary way a contact leaves. A placement's sign-off and a portal
 * token both point at this row, and deleting it would blank those FKs —
 * the placement would keep its `signed_off_by_label` snapshot and the token
 * its `label`, but the link would be gone. Archiving keeps both and takes
 * the person out of the pickers.
 */
export async function setContactArchivedAction(formData: FormData): Promise<void> {
  await requireActionContext("mandates:write");

  const contactId = str(formData, "contactId");
  const clientId = str(formData, "clientId");
  if (!contactId || !clientId) throw new Error("Missing contact.");

  const archived = str(formData, "archived") === "true";

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from("client_contacts")
    .update({
      is_archived: archived,
      // An archived contact cannot also be the primary — the person we
      // deal with by default cannot be one who has left.
      ...(archived ? { is_primary: false } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", contactId)
    .eq("client_id", clientId);

  if (error) throw new Error(`Could not update the contact: ${error.message}`);

  revalidate(clientId);
}

/**
 * Delete a contact outright.
 *
 * Kept alongside archiving for the case archiving does not cover: a row
 * created by mistake, which should leave no trace in the pickers or the
 * history rather than sit there marked "archived". Anything pointing at it
 * keeps its snapshot label, so a booked placement never loses who signed
 * it off.
 */
export async function deleteContactAction(formData: FormData): Promise<void> {
  await requireActionContext("mandates:write");

  const contactId = str(formData, "contactId");
  const clientId = str(formData, "clientId");
  if (!contactId || !clientId) throw new Error("Missing contact.");

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from("client_contacts")
    .delete()
    .eq("id", contactId)
    .eq("client_id", clientId);

  if (error) throw new Error(`Could not remove the contact: ${error.message}`);

  revalidate(clientId);
}
