"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import {
  applyRollup,
  buildAssessmentSkeleton,
  normalizeAssessment,
} from "@/lib/ai/executive-assessment";
import type { OperationalWeight } from "@/lib/executive/assessment-scoring";
import type { AssessmentContent } from "@/lib/executive/types";
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

function assessmentPath(searchId: string, candidateId: string): string {
  return `/app/executive-intelligence/searches/${searchId}/candidates/${candidateId}/assessment`;
}

/**
 * Operational competency weights (source of truth) for a search, joined to the
 * competency library for labels. Same query shape as the interview-plan
 * generator; ordered by weight so the assessment rows read top-down.
 */
async function loadOperationalWeights(
  supabase: SupabaseClient,
  searchId: string
): Promise<OperationalWeight[]> {
  const { data, error } = await supabase
    .from("executive_search_competencies")
    .select("weight, executive_competencies(key, name)")
    .eq("search_id", searchId)
    .order("weight", { ascending: false });

  if (error) throw new Error(`Failed to load competency weights: ${error.message}`);

  type CompetencyEmbed = { key: string; name: string };
  return (
    (data ?? []) as unknown as Array<{
      weight: number;
      executive_competencies: CompetencyEmbed | CompetencyEmbed[] | null;
    }>
  ).flatMap((r) => {
    const comp = Array.isArray(r.executive_competencies)
      ? r.executive_competencies[0]
      : r.executive_competencies;
    return comp
      ? [{ competency_key: comp.key, label: comp.name, weight: r.weight }]
      : [];
  });
}

/** The approved interview plan for (search, candidate) — the gate + skeleton
 * source. Null when none is approved yet. */
async function approvedPlan(
  supabase: SupabaseClient,
  searchId: string,
  candidateId: string
): Promise<{ id: string; content_json: unknown } | null> {
  const { data } = await supabase
    .from("executive_interview_plans")
    .select("id, content_json")
    .eq("search_id", searchId)
    .eq("candidate_id", candidateId)
    .eq("status", "approved")
    .maybeSingle<{ id: string; content_json: unknown }>();
  return data ?? null;
}

type AllocateArgs = {
  searchId: string;
  candidateId: string;
  organizationId: string;
  sourcePlanId: string | null;
  createdBy: string;
  contentJson: AssessmentContent;
};

async function allocateAndInsertAssessment(
  supabase: SupabaseClient,
  args: AllocateArgs
): Promise<{ assessmentId: string; version: number }> {
  const { data, error } = await supabase
    .rpc("allocate_and_insert_assessment", {
      p_search_id: args.searchId,
      p_candidate_id: args.candidateId,
      p_organization_id: args.organizationId,
      p_source_plan_id: args.sourcePlanId,
      p_content_json: args.contentJson,
      p_created_by: args.createdBy,
    })
    .single();

  if (error || !data) {
    throw new Error(
      `Failed to allocate assessment version: ${error?.message ?? "no row returned"}`
    );
  }
  const row = data as { id: string; version: number };
  return { assessmentId: row.id, version: row.version };
}

/**
 * Create the first draft assessment, pre-structured from the approved interview
 * plan and the operational competency weights. Gated: requires an approved
 * interview plan (the allocate RPC additionally requires the candidate linkage).
 * Must be an explicit user click.
 */
export async function createAssessment(
  searchId: string,
  candidateId: string
): Promise<{ assessmentId: string; version: number }> {
  const { userId, organizationId } = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const plan = await approvedPlan(supabase, searchId, candidateId);
  if (!plan) {
    throw new Error(
      "Approve an interview plan for this candidate before starting an assessment."
    );
  }

  const weights = await loadOperationalWeights(supabase, searchId);
  const skeleton = buildAssessmentSkeleton(weights, plan.content_json);

  const inserted = await allocateAndInsertAssessment(supabase, {
    searchId,
    candidateId,
    organizationId,
    sourcePlanId: plan.id,
    createdBy: userId,
    contentJson: skeleton,
  });

  await recordExecutiveAuditEvent(supabase, {
    organizationId,
    searchId,
    assessmentId: inserted.assessmentId,
    actorId: userId,
    eventType: "assessment_created",
    detail: { candidate_id: candidateId, version: inserted.version },
  });

  revalidatePath(assessmentPath(searchId, candidateId));
  return inserted;
}

const DRAFT_LOCKED_MESSAGE =
  "This version is no longer an editable draft. Create a new version to make changes.";

/** Save edits onto the current draft. The evidence rollup + weighted strength
 * are recomputed server-side from the operational weights — never trusted from
 * the client. The status='draft' guard is in the WHERE. */
export async function saveAssessmentDraft(
  assessmentId: string,
  searchId: string,
  candidateId: string,
  content: AssessmentContent
): Promise<void> {
  const { userId, organizationId } = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const weights = await loadOperationalWeights(supabase, searchId);
  const normalized = applyRollup(normalizeAssessment(content), weights);

  const { data, error } = await supabase
    .from("executive_assessments")
    .update({ content_json: normalized, updated_at: new Date().toISOString() })
    .eq("id", assessmentId)
    .eq("search_id", searchId)
    .eq("candidate_id", candidateId)
    .eq("status", "draft")
    .select("id")
    .maybeSingle();

  if (error) throw new Error(`Failed to save draft: ${error.message}`);
  if (data == null) throw new Error(DRAFT_LOCKED_MESSAGE);

  await recordExecutiveAuditEvent(supabase, {
    organizationId,
    searchId,
    assessmentId,
    actorId: userId,
    eventType: "assessment_edited",
    detail: { candidate_id: candidateId },
  });

  revalidatePath(assessmentPath(searchId, candidateId));
}

/** Snapshot current edits as a new draft version (e.g. to branch from approved). */
export async function createAssessmentNewVersion(
  searchId: string,
  candidateId: string,
  content: AssessmentContent
): Promise<{ assessmentId: string; version: number }> {
  const { userId, organizationId } = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const plan = await approvedPlan(supabase, searchId, candidateId);
  const weights = await loadOperationalWeights(supabase, searchId);
  const normalized = applyRollup(normalizeAssessment(content), weights);

  const inserted = await allocateAndInsertAssessment(supabase, {
    searchId,
    candidateId,
    organizationId,
    sourcePlanId: plan?.id ?? null,
    createdBy: userId,
    contentJson: normalized,
  });

  await recordExecutiveAuditEvent(supabase, {
    organizationId,
    searchId,
    assessmentId: inserted.assessmentId,
    actorId: userId,
    eventType: "assessment_new_version",
    detail: { candidate_id: candidateId, version: inserted.version },
  });

  revalidatePath(assessmentPath(searchId, candidateId));
  return inserted;
}

/** Human approval — RPC stamps approved_by from auth.uid() and archives prior. */
export async function approveAssessment(
  assessmentId: string,
  searchId: string,
  candidateId: string
): Promise<void> {
  const { userId, organizationId } = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { error } = await supabase.rpc("approve_assessment", {
    p_assessment_id: assessmentId,
    p_search_id: searchId,
    p_candidate_id: candidateId,
  });
  if (error) throw new Error(`Failed to approve assessment: ${error.message}`);

  await recordExecutiveAuditEvent(supabase, {
    organizationId,
    searchId,
    assessmentId,
    actorId: userId,
    eventType: "assessment_approved",
    detail: { candidate_id: candidateId },
  });

  revalidatePath(assessmentPath(searchId, candidateId));
}
