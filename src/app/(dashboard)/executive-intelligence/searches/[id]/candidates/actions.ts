"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { recordExecutiveAuditEvent } from "@/lib/executive/audit";
import {
  EXEC_CANDIDATE_STAGES,
  type ExecutiveCandidateStage,
} from "@/lib/executive/types";

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
    .single();

  if (error || !profile?.organization_id || profile.status !== "active") {
    throw new Error("Account is not provisioned.");
  }

  return { userId: user.id, organizationId: profile.organization_id };
}

function candidatesPath(searchId: string): string {
  return `/executive-intelligence/searches/${searchId}/candidates`;
}

/**
 * Link an existing org candidate to an executive search. Idempotent at the
 * DB layer via the (search_id, candidate_id) unique index — a duplicate link
 * surfaces as a friendly no-op rather than an error.
 */
export async function linkCandidateAction(
  searchId: string,
  candidateId: string
): Promise<void> {
  const { userId, organizationId } = await requireAuth();
  const supabase = await createServerSupabaseClient();

  // RLS scopes both lookups to the caller's org — a candidate from another
  // org is simply not found.
  const { data: candidate, error: candidateError } = await supabase
    .from("candidates")
    .select("id, full_name")
    .eq("id", candidateId)
    .maybeSingle();

  if (candidateError) {
    throw new Error(`Failed to load candidate: ${candidateError.message}`);
  }
  if (!candidate) {
    throw new Error("Candidate not found or not accessible.");
  }

  const { error: insertError } = await supabase
    .from("executive_search_candidates")
    .insert({
      search_id: searchId,
      organization_id: organizationId,
      candidate_id: candidateId,
      stage: "identified",
      added_by: userId,
    });

  if (insertError) {
    // 23505 = unique violation → already linked; treat as success.
    if (insertError.code !== "23505") {
      throw new Error(`Failed to link candidate: ${insertError.message}`);
    }
    return;
  }

  await recordExecutiveAuditEvent(supabase, {
    organizationId,
    searchId,
    actorId: userId,
    eventType: "candidate_linked",
    detail: { candidate_id: candidateId },
  });

  revalidatePath(candidatesPath(searchId));
  revalidatePath(`/executive-intelligence/searches/${searchId}`);
}

/**
 * Remove a candidate from a search. The underlying candidate record (and its
 * CV, evaluations, notes) is untouched — only the linkage is deleted, and
 * the removal is recorded in the audit trail.
 */
export async function unlinkCandidateAction(
  searchId: string,
  candidateId: string
): Promise<void> {
  const { userId, organizationId } = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("executive_search_candidates")
    .delete()
    .eq("search_id", searchId)
    .eq("candidate_id", candidateId)
    .select("id")
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to unlink candidate: ${error.message}`);
  }
  if (!data) return; // already unlinked (or not visible) — nothing to record

  await recordExecutiveAuditEvent(supabase, {
    organizationId,
    searchId,
    actorId: userId,
    eventType: "candidate_unlinked",
    detail: { candidate_id: candidateId },
  });

  revalidatePath(candidatesPath(searchId));
  revalidatePath(`/executive-intelligence/searches/${searchId}`);
}

/**
 * Move a linked candidate through the due-diligence funnel. The stage is
 * workflow state, not a hiring decision — the audit trail records who moved
 * whom, from where, to where.
 */
export async function setCandidateStageAction(
  searchId: string,
  candidateId: string,
  stage: ExecutiveCandidateStage
): Promise<void> {
  if (!EXEC_CANDIDATE_STAGES.includes(stage)) {
    throw new Error(`Invalid stage: ${stage}`);
  }

  const { userId, organizationId } = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("executive_search_candidates")
    .update({ stage, updated_at: new Date().toISOString() })
    .eq("search_id", searchId)
    .eq("candidate_id", candidateId)
    .neq("stage", stage)
    .select("id")
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to update stage: ${error.message}`);
  }
  if (!data) return; // no-op: same stage, missing link, or not visible

  await recordExecutiveAuditEvent(supabase, {
    organizationId,
    searchId,
    actorId: userId,
    eventType: "candidate_stage_changed",
    detail: { candidate_id: candidateId, stage },
  });

  revalidatePath(candidatesPath(searchId));
  revalidatePath(`/executive-intelligence/searches/${searchId}`);
}
