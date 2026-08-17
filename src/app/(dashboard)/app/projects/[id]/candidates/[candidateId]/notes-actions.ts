"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { NOTE_TYPES, type NoteType } from "./notes-constants";
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
