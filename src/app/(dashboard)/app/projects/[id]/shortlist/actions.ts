"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { recordActivity } from "@/lib/activity/record";
import { requireActionContext } from "@/lib/auth/access";
import { runShortlistReportAndPersist } from "@/lib/ai/generate-shortlist-report";
import { runAction } from "@/lib/actions/run";
import type { ActionResult } from "@/lib/actions/result";

/** Sentence subject for a failure this file did not author. See `runAction`. */
const SUBJECT = "The shortlist";

const MIN_SLATE_SIZE = 1;
const MAX_SLATE_SIZE = 10;

type AuthContext = {
  userId: string;
  organizationId: string;
};

async function requireAuth(): Promise<AuthContext> {
  return requireActionContext("clients:share");
}

type ShortlistRow = {
  id: string;
  slate_size: number;
  candidate_ids: string[];
  narrative: string;
  submitted_at: string | null;
};

/**
 * Get-or-create the project's shortlist row. Centralised so every action
 * starts from a known-good state, and so the unique-per-project invariant
 * doesn't race when two tabs first edit a shortlist.
 */
async function ensureShortlist(
  projectId: string,
  auth: AuthContext
): Promise<ShortlistRow> {
  const supabase = await createServerSupabaseClient();
  const { data: existing } = await supabase
    .from("shortlists")
    .select("id, slate_size, candidate_ids, narrative, submitted_at")
    .eq("project_id", projectId)
    .maybeSingle<ShortlistRow>();
  if (existing) return existing;

  const { data: inserted, error } = await supabase
    .from("shortlists")
    .insert({
      project_id: projectId,
      organization_id: auth.organizationId,
      created_by: auth.userId,
      slate_size: 3,
      candidate_ids: [],
      narrative: "",
      report_content: {},
    })
    .select("id, slate_size, candidate_ids, narrative, submitted_at")
    .single<ShortlistRow>();

  if (error || !inserted) {
    // Race: another tab created it in the same transaction. Re-read.
    const { data: refetched } = await supabase
      .from("shortlists")
      .select("id, slate_size, candidate_ids, narrative, submitted_at")
      .eq("project_id", projectId)
      .single<ShortlistRow>();
    if (!refetched) {
      throw new Error(
        `Failed to create shortlist for project ${projectId}: ${error?.message ?? "unknown"}`
      );
    }
    return refetched;
  }
  return inserted;
}

/** Update slate size — clamped to 1–10 to match the CHECK constraint. */
export async function setSlateSizeAction(
  projectId: string,
  slateSize: number
): Promise<ActionResult> {
  return runAction(SUBJECT, async () => {
    const auth = await requireAuth();
    const size = Math.max(MIN_SLATE_SIZE, Math.min(MAX_SLATE_SIZE, Math.round(slateSize)));
    const sl = await ensureShortlist(projectId, auth);
    // Trim slate down if shrinking; keep front of array (the higher-priority slots).
    const trimmed = sl.candidate_ids.slice(0, size);
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase
      .from("shortlists")
      .update({
        slate_size: size,
        candidate_ids: trimmed,
        updated_at: new Date().toISOString(),
      })
      .eq("id", sl.id);
    if (error) throw new Error(`Failed to update slate size: ${error.message}`);
    revalidatePath(`/app/projects/${projectId}/shortlist`);
  });
}

/**
 * Add a candidate to the slate. No-op if already present. Refuses if the
 * slate is already at slate_size — recruiter must remove first.
 */
export async function addCandidateAction(
  projectId: string,
  candidateId: string
): Promise<ActionResult> {
  return runAction(SUBJECT, async () => {
    const auth = await requireAuth();
    const sl = await ensureShortlist(projectId, auth);
    if (sl.candidate_ids.includes(candidateId)) return;
    if (sl.candidate_ids.length >= sl.slate_size) {
      throw new Error(
        `Slate is full (${sl.slate_size}). Remove a candidate first or increase slate size.`
      );
    }
    const supabase = await createServerSupabaseClient();
    const next = [...sl.candidate_ids, candidateId];
    const { error } = await supabase
      .from("shortlists")
      .update({ candidate_ids: next, updated_at: new Date().toISOString() })
      .eq("id", sl.id);
    if (error) throw new Error(`Failed to add candidate: ${error.message}`);
    revalidatePath(`/app/projects/${projectId}/shortlist`);
  });
}

export async function removeCandidateAction(
  projectId: string,
  candidateId: string
): Promise<ActionResult> {
  return runAction(SUBJECT, async () => {
    const auth = await requireAuth();
    const sl = await ensureShortlist(projectId, auth);
    const next = sl.candidate_ids.filter((id) => id !== candidateId);
    if (next.length === sl.candidate_ids.length) return;
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase
      .from("shortlists")
      .update({ candidate_ids: next, updated_at: new Date().toISOString() })
      .eq("id", sl.id);
    if (error) throw new Error(`Failed to remove candidate: ${error.message}`);
    revalidatePath(`/app/projects/${projectId}/shortlist`);
  });
}

/** Move a candidate up (-1) or down (+1) one slot. */
export async function moveCandidateAction(
  projectId: string,
  candidateId: string,
  direction: "up" | "down"
): Promise<ActionResult> {
  return runAction(SUBJECT, async () => {
    const auth = await requireAuth();
    const sl = await ensureShortlist(projectId, auth);
    const idx = sl.candidate_ids.indexOf(candidateId);
    if (idx < 0) return;
    const swapWith = direction === "up" ? idx - 1 : idx + 1;
    if (swapWith < 0 || swapWith >= sl.candidate_ids.length) return;
    const next = [...sl.candidate_ids];
    [next[idx], next[swapWith]] = [next[swapWith], next[idx]];
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase
      .from("shortlists")
      .update({ candidate_ids: next, updated_at: new Date().toISOString() })
      .eq("id", sl.id);
    if (error) throw new Error(`Failed to move candidate: ${error.message}`);
    revalidatePath(`/app/projects/${projectId}/shortlist`);
  });
}

export async function saveNarrativeAction(
  projectId: string,
  narrative: string
): Promise<ActionResult> {
  return runAction(SUBJECT, async () => {
    const auth = await requireAuth();
    const sl = await ensureShortlist(projectId, auth);
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase
      .from("shortlists")
      .update({ narrative, updated_at: new Date().toISOString() })
      .eq("id", sl.id);
    if (error) throw new Error(`Failed to save narrative: ${error.message}`);
    revalidatePath(`/app/projects/${projectId}/shortlist`);
  });
}

/**
 * Generate the submission-ready report from the current slate.
 * Synchronous (~5–10s); UI shows a pending state. The recruiter's
 * acts stop at the slate row (ensureShortlist, the composition, the
 * narrative — all persisted before this runs); the judgment itself
 * runs under the SHORTLIST AGENT's own session (093), which reads
 * the slate it lawfully sees, merges only report_content through the
 * submitted_at-pinned door, and records the event under its own name.
 */
export async function generateReportAction(projectId: string): Promise<ActionResult> {
  return runAction(SUBJECT, async () => {
    const auth = await requireAuth();
    const sl = await ensureShortlist(projectId, auth);
    if (sl.candidate_ids.length === 0) {
      throw new Error(
        "Slate is empty. Add candidates before generating the report."
      );
    }

    const run = await runShortlistReportAndPersist(projectId, sl.id);

    if (run.status === "agent_unavailable") {
      throw new Error(
        "The Shortlist Agent could not run — an operator has suspended it " +
          "or its credentials are absent. Your slate and narrative are " +
          "saved; generate the report when it is restored."
      );
    }
    if (run.status === "submitted") {
      throw new Error(
        "This shortlist has been submitted — the submitted report is the " +
          "record and cannot be regenerated."
      );
    }
    if (run.status === "unavailable") {
      throw new Error(
        "The slate could not be loaded — its candidates may have been deleted."
      );
    }
    if (run.status !== "ready") {
      throw new Error(
        "Report generation failed. Your slate and narrative are saved — " +
          "try again, and tell an admin if it keeps happening."
      );
    }

    revalidatePath(`/app/projects/${projectId}/shortlist`);
  });
}

/**
 * Mark the shortlist as submitted: stamp submitted_at + submitted_by,
 * and update each shortlisted candidate's pipeline_stage to 'submitted'.
 * Idempotent: re-submitting just refreshes the timestamp.
 */
export async function submitShortlistAction(projectId: string): Promise<ActionResult> {
  return runAction(SUBJECT, async () => {
    const auth = await requireAuth();
    const sl = await ensureShortlist(projectId, auth);
    if (sl.candidate_ids.length === 0) {
      throw new Error("Slate is empty — nothing to submit.");
    }

    const supabase = await createServerSupabaseClient();
    const now = new Date().toISOString();

    // Stamp the shortlist row.
    const { error: shortlistError } = await supabase
      .from("shortlists")
      .update({
        submitted_at: now,
        submitted_by: auth.userId,
        updated_at: now,
      })
      .eq("id", sl.id);
    if (shortlistError) {
      throw new Error(`Failed to mark shortlist as submitted: ${shortlistError.message}`);
    }

    // Bump each candidate's pipeline_stage to 'submitted', but only if
    // they're currently at an earlier stage. We don't want to demote a
    // candidate who's already further along (interviewed, finalist…).
    const earlierStages = ["found", "reviewed", "matched", "shortlisted"];
    const { error: candError } = await supabase
      .from("candidates")
      .update({
        pipeline_stage: "submitted",
        updated_at: now,
      })
      .in("id", sl.candidate_ids)
      .in("pipeline_stage", earlierStages);
    if (candError) {
      console.error(
        "[shortlist] failed to advance candidate pipeline stages",
        candError
      );
    }

    // The slate has left the building. Nothing in the row change says that —
    // `submitted_at` records when, not that a person did it deliberately —
    // so this is one of the three events the application has to state.
    await recordActivity(supabase, {
      eventType: "shortlist_published",
      projectId,
      detail: { count: sl.candidate_ids.length },
    });

    revalidatePath(`/app/projects/${projectId}/shortlist`);
    revalidatePath(`/app/projects/${projectId}/candidates`);
    revalidatePath(`/app/projects/${projectId}`);
  });
}
