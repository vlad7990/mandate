"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { requireActionContext } from "@/lib/auth/access";
import {
  generateShortlistReport,
  type ShortlistGenerationInput,
} from "@/lib/ai/generate-shortlist-report";
import type { CandidateProfile } from "@/lib/ai/cv-parsing";
import type { CalibrationModel, CompanyContext } from "@/lib/ai/role-analysis";

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
): Promise<void> {
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
}

/**
 * Add a candidate to the slate. No-op if already present. Refuses if the
 * slate is already at slate_size — recruiter must remove first.
 */
export async function addCandidateAction(
  projectId: string,
  candidateId: string
): Promise<void> {
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
}

export async function removeCandidateAction(
  projectId: string,
  candidateId: string
): Promise<void> {
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
}

/** Move a candidate up (-1) or down (+1) one slot. */
export async function moveCandidateAction(
  projectId: string,
  candidateId: string,
  direction: "up" | "down"
): Promise<void> {
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
}

export async function saveNarrativeAction(
  projectId: string,
  narrative: string
): Promise<void> {
  const auth = await requireAuth();
  const sl = await ensureShortlist(projectId, auth);
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from("shortlists")
    .update({ narrative, updated_at: new Date().toISOString() })
    .eq("id", sl.id);
  if (error) throw new Error(`Failed to save narrative: ${error.message}`);
  revalidatePath(`/app/projects/${projectId}/shortlist`);
}

/**
 * Generate the submission-ready report from the current slate.
 * Synchronous Anthropic call (~5–10s); UI shows a pending state.
 */
export async function generateReportAction(projectId: string): Promise<void> {
  const auth = await requireAuth();
  const sl = await ensureShortlist(projectId, auth);
  if (sl.candidate_ids.length === 0) {
    throw new Error(
      "Slate is empty. Add candidates before generating the report."
    );
  }

  const supabase = await createServerSupabaseClient();

  // Pull project + slate context in parallel.
  const [{ data: project }, { data: candidates }, { data: scores }] =
    await Promise.all([
      supabase
        .from("projects")
        .select(
          "id, title, calibration_model, company_context"
        )
        .eq("id", projectId)
        .single<{
          id: string;
          title: string;
          calibration_model: Partial<CalibrationModel> | null;
          company_context: Partial<CompanyContext> | null;
        }>(),
      supabase
        .from("candidates")
        .select("id, full_name, cv_structured")
        .in("id", sl.candidate_ids),
      supabase
        .from("candidate_scores")
        .select("candidate_id, rank_position, overall_score")
        .eq("project_id", projectId)
        .in("candidate_id", sl.candidate_ids),
    ]);

  if (!project) {
    throw new Error("Failed to load project for report generation.");
  }

  const candidateMap = new Map(
    (candidates ?? []).map((c) => [
      c.id as string,
      c as { id: string; full_name: string; cv_structured: unknown },
    ])
  );
  const scoreMap = new Map(
    (scores ?? []).map((s) => [
      s.candidate_id as string,
      s as {
        candidate_id: string;
        rank_position: number | null;
        overall_score: number | null;
      },
    ])
  );

  // Build the slate input in the recruiter's chosen order.
  const slate: ShortlistGenerationInput["slate"] = sl.candidate_ids
    .map((cid) => {
      const cand = candidateMap.get(cid);
      const score = scoreMap.get(cid);
      if (!cand) return null;
      const profile = (cand.cv_structured ?? {}) as Partial<CandidateProfile>;
      return {
        candidate_id: cid,
        full_name: cand.full_name,
        rank: score?.rank_position ?? null,
        overall_score: score?.overall_score ?? null,
        profile,
        fit_dimensions: profile.fit_dimensions ?? null,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x != null);

  if (slate.length === 0) {
    throw new Error(
      "None of the slate candidates could be loaded — they may have been deleted."
    );
  }

  const report = await generateShortlistReport({
    role_context: {
      title: project.title,
      role_title: project.calibration_model?.role_title ?? null,
      inferred_scope: project.calibration_model?.inferred_scope ?? null,
      role_structure: project.calibration_model?.role_structure ?? null,
    },
    company_context: project.company_context ?? {},
    calibration: project.calibration_model ?? {},
    recruiter_narrative: sl.narrative.trim() || null,
    slate,
  });

  const { error: updateError } = await supabase
    .from("shortlists")
    .update({
      report_content: report,
      updated_at: new Date().toISOString(),
    })
    .eq("id", sl.id);
  if (updateError) {
    throw new Error(`Failed to persist report: ${updateError.message}`);
  }

  revalidatePath(`/app/projects/${projectId}/shortlist`);
}

/**
 * Mark the shortlist as submitted: stamp submitted_at + submitted_by,
 * and update each shortlisted candidate's pipeline_stage to 'submitted'.
 * Idempotent: re-submitting just refreshes the timestamp.
 */
export async function submitShortlistAction(projectId: string): Promise<void> {
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

  revalidatePath(`/app/projects/${projectId}/shortlist`);
  revalidatePath(`/app/projects/${projectId}/candidates`);
  revalidatePath(`/app/projects/${projectId}`);
}
