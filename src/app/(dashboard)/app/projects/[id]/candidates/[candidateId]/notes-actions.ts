"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { NOTE_TYPES, type NoteType } from "./notes-constants";
import { AUDIO_EXTENSIONS, validateAudioFile } from "@/lib/calls/audio";
import { transcribeAudio, transcriptionAvailable } from "@/lib/calls/transcribe";
import { runAction } from "@/lib/actions/run";
import type { ActionResult } from "@/lib/actions/result";

/** Sentence subject for a failure this file did not author. See `runAction`. */
const SUBJECT = "The candidate note";

// NOTE_TYPES / NoteType used to live here, but a "use server" file can
// only export async functions — every const export becomes a server
// action reference at runtime, breaking client-side .map/.includes.
// Callers import the constants directly from ./notes-constants.

type AuthContext = {
  userId: string;
  organizationId: string;
};

async function requireAuth(): Promise<AuthContext> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthenticated.");

  const { data: profile, error } = await supabase
    .from("users")
    .select("organization_id, status")
    .eq("id", user.id)
    .single<{ organization_id: string | null; status: string }>();

  if (error || !profile?.organization_id || profile.status !== "active") {
    throw new Error("Account is not provisioned.");
  }

  return { userId: user.id, organizationId: profile.organization_id };
}

async function assertCandidateOwnership(
  candidateId: string,
  projectId: string
): Promise<void> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("candidates")
    .select("project_id")
    .eq("id", candidateId)
    .single<{ project_id: string }>();
  if (error || !data) throw new Error("Candidate not found.");
  if (data.project_id !== projectId) {
    throw new Error("Candidate does not belong to the requested project.");
  }
}

export type CreateNoteInput = {
  noteType: NoteType;
  content: string;
  isPinned?: boolean;
  callDurationMinutes?: number | null;
};

export async function createNoteAction(
  candidateId: string,
  projectId: string,
  data: CreateNoteInput
): Promise<ActionResult<{ id: string }>> {
  return runAction(SUBJECT, async () => {
    const auth = await requireAuth();
    await assertCandidateOwnership(candidateId, projectId);

    if (!NOTE_TYPES.includes(data.noteType)) {
      throw new Error("Unknown note type.");
    }
    const content = data.content.trim();
    if (content.length === 0) {
      throw new Error("Note content cannot be empty.");
    }

    // call_duration_minutes is only meaningful for call notes.
    let callDuration: number | null = null;
    if (data.noteType === "call") {
      if (data.callDurationMinutes != null) {
        const n = Number(data.callDurationMinutes);
        if (!Number.isFinite(n) || n < 0) {
          throw new Error("Call duration must be a non-negative number.");
        }
        callDuration = Math.round(n);
      }
    }

    const supabase = await createServerSupabaseClient();
    const { data: inserted, error } = await supabase
      .from("candidate_notes")
      .insert({
        candidate_id: candidateId,
        project_id: projectId,
        organization_id: auth.organizationId,
        created_by: auth.userId,
        note_type: data.noteType,
        content,
        is_pinned: !!data.isPinned,
        call_duration_minutes: callDuration,
      })
      .select("id")
      .single<{ id: string }>();

    if (error || !inserted) {
      throw new Error(`Failed to create note: ${error?.message ?? "no row"}`);
    }

    revalidatePath(`/app/projects/${projectId}/candidates/${candidateId}`);
    return { id: inserted.id };
  });
}

/**
 * Attach a call recording to an existing call note (122, gate
 * adbb05f). Consent is an attestation the recruiter makes explicitly —
 * the CHECK refuses the row without it; this action refuses earlier
 * with the friendlier sentence. Upload failure leaves the typed note
 * standing: a note is not hostage to its attachment.
 */
export async function attachCallAudioAction(
  noteId: string,
  projectId: string,
  formData: FormData
): Promise<ActionResult> {
  return runAction(SUBJECT, async () => {
    const auth = await requireAuth();
    const supabase = await createServerSupabaseClient();

    const { data: note, error: readErr } = await supabase
      .from("candidate_notes")
      .select("project_id, candidate_id, note_type")
      .eq("id", noteId)
      .single<{ project_id: string; candidate_id: string; note_type: string }>();

    if (readErr || !note) throw new Error("Note not found.");
    if (note.project_id !== projectId) {
      throw new Error("Note does not belong to the requested project.");
    }
    if (note.note_type !== "call") {
      throw new Error("Recordings attach to call notes only.");
    }
    if (formData.get("consent") !== "true") {
      throw new Error(
        "Confirm that every party consented to the recording before attaching it."
      );
    }

    const file = formData.get("file");
    if (!(file instanceof File)) throw new Error("No audio file was sent.");
    const verdict = validateAudioFile(file);
    if (!verdict.ok) throw new Error(verdict.reason);

    // Org id first — storage RLS anchors on the first path segment.
    const storagePath = `${auth.organizationId}/candidate-notes/${noteId}.${verdict.extension}`;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const { error: uploadErr } = await supabase.storage
      .from("call-audio")
      .upload(storagePath, bytes, { contentType: file.type, upsert: true });
    if (uploadErr) {
      throw new Error(
        `The recording did not upload (${uploadErr.message}). The note itself is saved.`
      );
    }

    const { data: landed, error } = await supabase
      .from("candidate_notes")
      .update({
        audio_path: storagePath,
        consent_confirmed: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", noteId)
      .select("id");
    if (error) throw new Error(`Failed to attach the recording: ${error.message}`);
    if (!landed || landed.length === 0) {
      throw new Error("Nothing was attached — the note no longer exists. Reload the page.");
    }

    revalidatePath(`/app/projects/${projectId}/candidates/${note.candidate_id}`);
  });
}

/**
 * Transcribe a note's recording through the key-gated ASR seam.
 * Failure is recorded on the row (`transcript_error`, the
 * generation_error precedent) AND surfaced — never retried silently.
 */
export async function transcribeNoteAction(
  noteId: string,
  projectId: string
): Promise<ActionResult> {
  return runAction(SUBJECT, async () => {
    await requireAuth();
    if (!transcriptionAvailable()) {
      throw new Error(
        "Transcription is not configured — the recording stays attached, and transcripts switch on when the provider key is added."
      );
    }

    const supabase = await createServerSupabaseClient();
    const { data: note, error: readErr } = await supabase
      .from("candidate_notes")
      .select("project_id, candidate_id, audio_path")
      .eq("id", noteId)
      .single<{ project_id: string; candidate_id: string; audio_path: string | null }>();

    if (readErr || !note) throw new Error("Note not found.");
    if (note.project_id !== projectId) {
      throw new Error("Note does not belong to the requested project.");
    }
    if (!note.audio_path) {
      throw new Error("This note has no recording to transcribe.");
    }

    // The session client downloads under storage RLS — the org read IS
    // the authorization; the ASR never touches the database.
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
        .from("candidate_notes")
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
      // Honest bookkeeping on the row, then the same sentence to the
      // reader. A failed write of the failure is logged and swallowed —
      // the toast still tells the truth.
      const { error: markErr } = await supabase
        .from("candidate_notes")
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

    revalidatePath(`/app/projects/${projectId}/candidates/${note.candidate_id}`);
  });
}

export async function updateNoteAction(
  noteId: string,
  projectId: string,
  content: string
): Promise<ActionResult> {
  return runAction(SUBJECT, async () => {
    await requireAuth();
    const supabase = await createServerSupabaseClient();

    const trimmed = content.trim();
    if (trimmed.length === 0) {
      throw new Error("Note content cannot be empty.");
    }

    const { data: note, error: readErr } = await supabase
      .from("candidate_notes")
      .select("project_id, candidate_id")
      .eq("id", noteId)
      .single<{ project_id: string; candidate_id: string }>();

    if (readErr || !note) throw new Error("Note not found.");
    if (note.project_id !== projectId) {
      throw new Error("Note does not belong to the requested project.");
    }

    const { error } = await supabase
      .from("candidate_notes")
      .update({
        content: trimmed,
        updated_at: new Date().toISOString(),
      })
      .eq("id", noteId);

    if (error) {
      throw new Error(`Failed to update note: ${error.message}`);
    }

    revalidatePath(`/app/projects/${projectId}/candidates/${note.candidate_id}`);
  });
}

export async function deleteNoteAction(
  noteId: string,
  projectId: string
): Promise<ActionResult> {
  return runAction(SUBJECT, async () => {
    await requireAuth();
    const supabase = await createServerSupabaseClient();

    const { data: note, error: readErr } = await supabase
      .from("candidate_notes")
      .select("project_id, candidate_id")
      .eq("id", noteId)
      .single<{ project_id: string; candidate_id: string }>();

    if (readErr || !note) throw new Error("Note not found.");
    if (note.project_id !== projectId) {
      throw new Error("Note does not belong to the requested project.");
    }

    const { error } = await supabase
      .from("candidate_notes")
      .delete()
      .eq("id", noteId);

    if (error) {
      throw new Error(`Failed to delete note: ${error.message}`);
    }

    revalidatePath(`/app/projects/${projectId}/candidates/${note.candidate_id}`);
  });
}

export async function togglePinAction(
  noteId: string,
  projectId: string
): Promise<ActionResult<{ is_pinned: boolean }>> {
  return runAction(SUBJECT, async () => {
    await requireAuth();
    const supabase = await createServerSupabaseClient();

    const { data: note, error: readErr } = await supabase
      .from("candidate_notes")
      .select("project_id, candidate_id, is_pinned")
      .eq("id", noteId)
      .single<{
        project_id: string;
        candidate_id: string;
        is_pinned: boolean;
      }>();

    if (readErr || !note) throw new Error("Note not found.");
    if (note.project_id !== projectId) {
      throw new Error("Note does not belong to the requested project.");
    }

    const next = !note.is_pinned;
    const { error } = await supabase
      .from("candidate_notes")
      .update({
        is_pinned: next,
        updated_at: new Date().toISOString(),
      })
      .eq("id", noteId);

    if (error) {
      throw new Error(`Failed to toggle pin: ${error.message}`);
    }

    revalidatePath(`/app/projects/${projectId}/candidates/${note.candidate_id}`);
    return { is_pinned: next };
  });
}
