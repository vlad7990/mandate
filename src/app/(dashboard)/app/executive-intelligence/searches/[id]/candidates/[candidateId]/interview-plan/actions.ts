"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import {
  generateAndStoreInterviewPlan,
  INTERVIEW_ARCHITECT_MODEL,
} from "@/lib/ai/generate-executive-interview-plan";
import {
  EMPTY_INTERVIEW_PLAN,
  INTERVIEW_ARCHITECT_PROMPT_VERSION,
  normalizeInterviewPlan,
  type InterviewPlanContent,
} from "@/lib/ai/executive-interview-architect-agent";
import { recordExecutiveAuditEvent } from "@/lib/executive/audit";

type AuthContext = { userId: string; organizationId: string };

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

type SupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClient>>;

function planPath(searchId: string, candidateId: string): string {
  return `/app/executive-intelligence/searches/${searchId}/candidates/${candidateId}/interview-plan`;
}

/** The approved success profile id for a search, or null. Generation gate. */
async function approvedProfileId(
  supabase: SupabaseClient,
  searchId: string
): Promise<string | null> {
  const { data } = await supabase
    .from("role_success_profiles")
    .select("id")
    .eq("search_id", searchId)
    .eq("status", "approved")
    .maybeSingle();
  return data?.id ?? null;
}

type AllocateArgs = {
  searchId: string;
  candidateId: string;
  organizationId: string;
  sourceProfileId: string | null;
  createdBy: string;
  contentJson: InterviewPlanContent;
  isGenerating: boolean;
};

async function allocateAndInsertPlan(
  supabase: SupabaseClient,
  args: AllocateArgs
): Promise<{ planId: string; version: number; wasExisting: boolean }> {
  const { data, error } = await supabase
    .rpc("allocate_and_insert_interview_plan", {
      p_search_id: args.searchId,
      p_candidate_id: args.candidateId,
      p_organization_id: args.organizationId,
      p_source_profile_id: args.sourceProfileId,
      p_content_json: args.contentJson,
      p_is_generating: args.isGenerating,
      p_created_by: args.createdBy,
      p_prompt_version: INTERVIEW_ARCHITECT_PROMPT_VERSION,
      p_model_version: INTERVIEW_ARCHITECT_MODEL,
    })
    .single();

  if (error || !data) {
    throw new Error(
      `Failed to allocate interview plan version: ${error?.message ?? "no row returned"}`
    );
  }
  const row = data as { id: string; version: number; was_existing: boolean };
  return {
    planId: row.id,
    version: row.version,
    wasExisting: Boolean(row.was_existing),
  };
}

/**
 * Generate (and regenerate) an interview plan. Gated: requires an approved
 * success profile for the search. The allocate RPC additionally enforces that
 * the candidate is linked (it locks the linkage row). Must be an explicit
 * user click — never a render path.
 */
export async function requestInterviewPlanGeneration(
  searchId: string,
  candidateId: string
): Promise<{ planId: string; version: number; wasExisting: boolean }> {
  const { userId, organizationId } = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const sourceProfileId = await approvedProfileId(supabase, searchId);
  if (!sourceProfileId) {
    throw new Error(
      "Approve a success profile for this search before generating an interview plan."
    );
  }

  const inserted = await allocateAndInsertPlan(supabase, {
    searchId,
    candidateId,
    organizationId,
    sourceProfileId,
    createdBy: userId,
    contentJson: EMPTY_INTERVIEW_PLAN,
    isGenerating: true,
  });

  if (!inserted.wasExisting) {
    await recordExecutiveAuditEvent(supabase, {
      organizationId,
      searchId,
      planId: inserted.planId,
      actorId: userId,
      eventType:
        inserted.version === 1
          ? "interview_plan_generation_requested"
          : "interview_plan_regenerated",
      detail: { candidate_id: candidateId, version: inserted.version },
    });

    after(async () => {
      try {
        await generateAndStoreInterviewPlan(
          inserted.planId,
          searchId,
          candidateId,
          userId
        );
      } catch (err) {
        console.error(
          "[generate-interview-plan] failed for plan",
          inserted.planId,
          err
        );
      }
    });
  }

  revalidatePath(planPath(searchId, candidateId));
  return inserted;
}

const DRAFT_LOCKED_MESSAGE =
  "This version is no longer an editable draft. Create a new version to make changes.";

/** Save edits onto the current draft. The status='draft' guard is in the WHERE. */
export async function saveInterviewPlanDraft(
  planId: string,
  searchId: string,
  candidateId: string,
  content: InterviewPlanContent
): Promise<void> {
  const { userId, organizationId } = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const normalized = normalizeInterviewPlan(content);

  const { data, error } = await supabase
    .from("executive_interview_plans")
    .update({ content_json: normalized, updated_at: new Date().toISOString() })
    .eq("id", planId)
    .eq("search_id", searchId)
    .eq("candidate_id", candidateId)
    .eq("status", "draft")
    .eq("is_generating", false)
    .select("id")
    .maybeSingle();

  if (error) throw new Error(`Failed to save draft: ${error.message}`);
  if (data == null) throw new Error(DRAFT_LOCKED_MESSAGE);

  await recordExecutiveAuditEvent(supabase, {
    organizationId,
    searchId,
    planId,
    actorId: userId,
    eventType: "interview_plan_edited",
    detail: { candidate_id: candidateId },
  });

  revalidatePath(planPath(searchId, candidateId));
}

/** Snapshot current edits as a new draft version (e.g. to branch from approved). */
export async function createInterviewPlanNewVersion(
  searchId: string,
  candidateId: string,
  content: InterviewPlanContent
): Promise<{ planId: string; version: number }> {
  const { userId, organizationId } = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const sourceProfileId = await approvedProfileId(supabase, searchId);

  const inserted = await allocateAndInsertPlan(supabase, {
    searchId,
    candidateId,
    organizationId,
    sourceProfileId,
    createdBy: userId,
    contentJson: normalizeInterviewPlan(content),
    isGenerating: false,
  });

  await recordExecutiveAuditEvent(supabase, {
    organizationId,
    searchId,
    planId: inserted.planId,
    actorId: userId,
    eventType: "interview_plan_new_version",
    detail: { candidate_id: candidateId, version: inserted.version },
  });

  revalidatePath(planPath(searchId, candidateId));
  return { planId: inserted.planId, version: inserted.version };
}

/** Human approval — RPC stamps approved_by from auth.uid() and archives prior. */
export async function approveInterviewPlan(
  planId: string,
  searchId: string,
  candidateId: string
): Promise<void> {
  const { userId, organizationId } = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { error } = await supabase.rpc("approve_interview_plan", {
    p_plan_id: planId,
    p_search_id: searchId,
    p_candidate_id: candidateId,
  });
  if (error) throw new Error(`Failed to approve interview plan: ${error.message}`);

  await recordExecutiveAuditEvent(supabase, {
    organizationId,
    searchId,
    planId,
    actorId: userId,
    eventType: "interview_plan_approved",
    detail: { candidate_id: candidateId },
  });

  revalidatePath(planPath(searchId, candidateId));
}

/** Terminal timeout marker for a stuck placeholder — only flips generating rows. */
export async function markInterviewPlanTimedOut(
  planId: string,
  searchId: string,
  candidateId: string
): Promise<void> {
  await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { error } = await supabase
    .from("executive_interview_plans")
    .update({
      is_generating: false,
      generation_error: "Generation timed out. Please retry.",
      updated_at: new Date().toISOString(),
    })
    .eq("id", planId)
    .eq("search_id", searchId)
    .eq("candidate_id", candidateId)
    .eq("is_generating", true);

  if (error) throw new Error(`Failed to mark generation as timed out: ${error.message}`);
  revalidatePath(planPath(searchId, candidateId));
}
