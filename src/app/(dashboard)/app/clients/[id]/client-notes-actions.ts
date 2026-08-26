"use server";

/**
 * Client notes — the qualitative log against the account.
 *
 * `candidate_notes` (020) is the same problem solved once already and this
 * is deliberately its shape. The one divergence is `visibility`: some of
 * what belongs here is commercially sensitive ("they are squeezing us on
 * the rate"), and an org-readable notes table would undo `fees:read`
 * through the side door the way 053 says an org-readable fee event would.
 *
 * Two tiers. `org` is every active member; `commercial` resolves to
 * `can_read_fees()` in RLS — the same predicate the fee tables use, so the
 * rule stays one rule rather than two that happen to agree today.
 *
 * ## What this deliberately does not do
 *
 * Notes are **not** written to the activity trail. Contacts are (054 adds
 * three event types for them) because they are the "who signed off" record;
 * notes are the chatty half by design and a trail recording every edit is
 * one nobody scrolls. Same judgement 053 already made twice.
 *
 * ## The Art. 14 boundary, restated where it can be seen
 *
 * A client contact carries no statutory notification duty the way a
 * candidate does (043/044), because contacts are not profiled or scored —
 * see the header of 054 for the full reasoning. Notes are the live edge of
 * that: free text about an identified person who was never told. If these
 * are ever fed to an agent, the analysis has to be redone first.
 */

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getAccess, requireActionContext } from "@/lib/auth/access";
import { can } from "@/lib/auth/roles";
import {
  parseClientNoteType,
  parseClientNoteVisibility,
} from "@/lib/clients/contacts";
import { AUDIO_EXTENSIONS, validateAudioFile } from "@/lib/calls/audio";
import { transcribeAudio, transcriptionAvailable } from "@/lib/calls/transcribe";
import { runAction } from "@/lib/actions/run";
import type { ActionResult } from "@/lib/actions/result";

/** Sentence subject for a failure this file did not author. See `runAction`. */
const SUBJECT = "The client note";

function str(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function revalidate(clientId: string) {
  revalidatePath(`/app/clients/${clientId}`);
}

/**
 * The tier the note is being written at, having checked the author may
 * read it back.
 *
 * RLS enforces this too — the INSERT policy in 054 carries the same
 * `can_read_fees()` clause. It is here as well because the failure it
 * prevents is a note that vanishes the instant it is saved, and the
 * database's version of that message is a policy violation.
 */
async function resolveVisibility(formData: FormData): Promise<"org" | "commercial"> {
  const requested = parseClientNoteVisibility(formData.get("visibility")) ?? "org";
  if (requested !== "commercial") return "org";

  const access = await getAccess();
  if (!can(access?.role, "fees:read")) {
    throw new Error("Your role cannot write a commercial note it could not then read.");
  }
  return "commercial";
}

/**
 * Which contact this note is about, if any.
 *
 * Checked against the client rather than trusted, so a note cannot be
 * attached to a contact at another client — RLS scopes by org, not by
 * client, so that is a check only the application makes.
 */
async function resolveContactId(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  clientId: string,
  raw: string
): Promise<string | null> {
  if (!raw) return null;

  const { data } = await supabase
    .from("client_contacts")
    .select("id")
    .eq("id", raw)
    .eq("client_id", clientId)
    .maybeSingle<{ id: string }>();

  if (!data) throw new Error("That contact is not at this client.");
  return data.id;
}

export async function createClientNoteAction(formData: FormData): Promise<ActionResult> {
  return runAction(SUBJECT, async () => {
    const { userId, organizationId } = await requireActionContext("mandates:write");

    const clientId = str(formData, "clientId");
    if (!clientId) throw new Error("Missing client.");

    const content = str(formData, "content");
    if (!content) throw new Error("A note cannot be empty.");

    const visibility = await resolveVisibility(formData);

    const supabase = await createServerSupabaseClient();
    const contactId = await resolveContactId(supabase, clientId, str(formData, "contactId"));

    // `author_label` is not set here. A BEFORE INSERT trigger in 054 stamps
    // it from `created_by`, so the name is snapshotted even on a row written
    // by a hand-run statement — and the action does not need a round trip
    // purely to read its own name. `created_by` is ON DELETE SET NULL, which
    // is why the snapshot has to exist at all: without it, every note a
    // departed colleague wrote goes anonymous the day their account is
    // removed. Same fix 053 made with `actor_label`.
    const noteType = parseClientNoteType(formData.get("noteType")) ?? "general";

    // 122: an optional call recording rides the same form. Validated
    // before the insert so a refused file refuses the whole submit —
    // the author fixes it and resubmits with nothing half-landed.
    const file = formData.get("file");
    const attaching =
      file instanceof File && file.size > 0 && noteType === "call";
    let audioVerdict: { extension: string } | null = null;
    if (attaching) {
      if (formData.get("consent") !== "on") {
        throw new Error(
          "Confirm that every party consented to the recording before attaching it."
        );
      }
      const verdict = validateAudioFile(file);
      if (!verdict.ok) throw new Error(verdict.reason);
      audioVerdict = verdict;
    }

    const { data: born, error } = await supabase
      .from("client_notes")
      .insert({
        organization_id: organizationId,
        client_id: clientId,
        contact_id: contactId,
        created_by: userId,
        note_type: noteType,
        content,
        visibility,
        is_pinned: formData.get("isPinned") === "on",
      })
      .select("id")
      .maybeSingle<{ id: string }>();

    if (error || !born) {
      throw new Error(`Could not save the note: ${error?.message ?? "no row"}`);
    }

    if (attaching && audioVerdict) {
      // Org id first — storage RLS anchors on the first path segment.
      // Failure after the insert keeps the typed note standing (gate
      // adbb05f §D) and says so.
      const storagePath = `${organizationId}/client-notes/${born.id}.${audioVerdict.extension}`;
      const bytes = new Uint8Array(await (file as File).arrayBuffer());
      const { error: uploadErr } = await supabase.storage
        .from("call-audio")
        .upload(storagePath, bytes, {
          contentType: (file as File).type,
          upsert: true,
        });
      if (uploadErr) {
        revalidate(clientId);
        throw new Error(
          `The note is saved, but the recording did not upload (${uploadErr.message}).`
        );
      }
      const { error: stampErr } = await supabase
        .from("client_notes")
        .update({
          audio_path: storagePath,
          consent_confirmed: true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", born.id);
      if (stampErr) {
        revalidate(clientId);
        throw new Error(
          `The note is saved, but the recording did not attach (${stampErr.message}).`
        );
      }
    }

    revalidate(clientId);
  });
}

/**
 * Transcribe a client call note's recording through the key-gated ASR
 * seam (122). Failure lands on the row (`transcript_error`) AND in the
 * toast — never retried silently. The transcript is DATA on the note;
 * per 054's Art. 14 note it feeds no agent.
 */
export async function transcribeClientNoteAction(
  formData: FormData
): Promise<ActionResult> {
  return runAction(SUBJECT, async () => {
    await requireActionContext("mandates:write");
    if (!transcriptionAvailable()) {
      throw new Error(
        "Transcription is not configured — the recording stays attached, and transcripts switch on when the provider key is added."
      );
    }

    const noteId = str(formData, "noteId");
    const clientId = str(formData, "clientId");
    if (!noteId || !clientId) throw new Error("Missing note.");

    const supabase = await createServerSupabaseClient();
    const { data: note, error: readErr } = await supabase
      .from("client_notes")
      .select("audio_path")
      .eq("id", noteId)
      .eq("client_id", clientId)
      .single<{ audio_path: string | null }>();

    if (readErr || !note) throw new Error("Note not found.");
    if (!note.audio_path) {
      throw new Error("This note has no recording to transcribe.");
    }

    const { data: blob, error: dlErr } = await supabase.storage
      .from("call-audio")
      .download(note.audio_path);
    if (dlErr || !blob) {
      throw new Error("The recording could not be read from storage.");
    }

    const ext = note.audio_path.split(".").pop() ?? "";
    const fallbackMime =
      Object.entries(AUDIO_EXTENSIONS).find(([, e]) => e === ext)?.[0] ??
      "audio/mpeg";
    const bytes = new Uint8Array(await blob.arrayBuffer());

    try {
      const text = await transcribeAudio(
        bytes,
        blob.type || fallbackMime,
        `call.${ext || "mp3"}`
      );
      const { error } = await supabase
        .from("client_notes")
        .update({
          transcript: text,
          transcript_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", noteId);
      if (error) throw new Error(`The transcript did not save: ${error.message}`);
    } catch (err) {
      const sentence =
        err instanceof Error ? err.message : "Transcription failed.";
      const { error: markErr } = await supabase
        .from("client_notes")
        .update({
          transcript_error: sentence,
          updated_at: new Date().toISOString(),
        })
        .eq("id", noteId);
      if (markErr) {
        console.error("[calls] transcript_error write failed:", markErr.message);
      }
      throw err instanceof Error ? err : new Error(sentence);
    }

    revalidate(clientId);
  });
}

export async function updateClientNoteAction(formData: FormData): Promise<ActionResult> {
  return runAction(SUBJECT, async () => {
    await requireActionContext("mandates:write");

    const noteId = str(formData, "noteId");
    const clientId = str(formData, "clientId");
    if (!noteId || !clientId) throw new Error("Missing note.");

    const content = str(formData, "content");
    if (!content) throw new Error("A note cannot be empty.");

    const visibility = await resolveVisibility(formData);

    const supabase = await createServerSupabaseClient();
    const contactId = await resolveContactId(supabase, clientId, str(formData, "contactId"));

    const { error } = await supabase
      .from("client_notes")
      .update({
        content,
        contact_id: contactId,
        note_type: parseClientNoteType(formData.get("noteType")) ?? "general",
        visibility,
        updated_at: new Date().toISOString(),
      })
      .eq("id", noteId)
      .eq("client_id", clientId);

    if (error) throw new Error(`Could not save the note: ${error.message}`);

    revalidate(clientId);
  });
}

export async function deleteClientNoteAction(formData: FormData): Promise<ActionResult> {
  return runAction(SUBJECT, async () => {
    await requireActionContext("mandates:write");

    const noteId = str(formData, "noteId");
    const clientId = str(formData, "clientId");
    if (!noteId || !clientId) throw new Error("Missing note.");

    const supabase = await createServerSupabaseClient();
    const { error } = await supabase
      .from("client_notes")
      .delete()
      .eq("id", noteId)
      .eq("client_id", clientId);

    if (error) throw new Error(`Could not remove the note: ${error.message}`);

    revalidate(clientId);
  });
}

/**
 * Pin or unpin. Pinned notes float to the top of the feed, as in 020.
 *
 * Takes the desired state rather than toggling from what the server reads,
 * so two people clicking at once converge instead of flipping each other's
 * change back.
 */
export async function toggleClientNotePinAction(formData: FormData): Promise<ActionResult> {
  return runAction(SUBJECT, async () => {
    await requireActionContext("mandates:write");

    const noteId = str(formData, "noteId");
    const clientId = str(formData, "clientId");
    if (!noteId || !clientId) throw new Error("Missing note.");

    const supabase = await createServerSupabaseClient();
    const { error } = await supabase
      .from("client_notes")
      .update({
        is_pinned: str(formData, "pinned") === "true",
        updated_at: new Date().toISOString(),
      })
      .eq("id", noteId)
      .eq("client_id", clientId);

    if (error) throw new Error(`Could not pin the note: ${error.message}`);

    revalidate(clientId);
  });
}
