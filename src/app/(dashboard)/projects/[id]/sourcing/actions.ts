"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import {
  generateAllSourcingQueries,
  regenerateSingleQuery,
  type GenerationContext,
} from "@/lib/ai/generate-sourcing";
import {
  SLOTS,
  type SlotKey,
} from "@/lib/ai/sourcing-analysis";
import {
  normalizeSections,
  type JobSpecSections,
} from "@/lib/ai/job-spec-analysis";
import type { CalibrationModel, CompanyContext } from "@/lib/ai/role-analysis";

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

type ProjectRow = {
  calibration_model: Partial<CalibrationModel> | null;
  company_context: Partial<CompanyContext> | null;
};

type FinalSpecRow = {
  version: number;
  content_json: unknown;
};

/**
 * Pull the project's calibration model + company context + the FINAL job
 * spec sections. The sourcing AI calls require all three so the boolean
 * strings reflect the canonical hiring brief. Throws if the prerequisite
 * (final job spec) isn't present — the route also gates on this, but the
 * action validates defensively.
 */
async function loadGenerationContext(
  projectId: string
): Promise<GenerationContext> {
  const supabase = await createServerSupabaseClient();

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("calibration_model, company_context")
    .eq("id", projectId)
    .single<ProjectRow>();

  if (projectError || !project) {
    throw new Error(
      `Failed to load project: ${projectError?.message ?? "not found"}`
    );
  }

  const { data: finalSpec, error: specError } = await supabase
    .from("job_specs")
    .select("version, content_json")
    .eq("project_id", projectId)
    .eq("is_final", true)
    .maybeSingle<FinalSpecRow>();

  if (specError) {
    throw new Error(`Failed to load final job spec: ${specError.message}`);
  }
  if (!finalSpec) {
    throw new Error(
      "No finalised job spec for this project. Mark a version as final before generating sourcing queries."
    );
  }

  const sections: JobSpecSections = normalizeSections(finalSpec.content_json);

  return {
    job_spec: sections,
    job_spec_version: finalSpec.version,
    calibration: project.calibration_model ?? {},
    company: project.company_context ?? {},
  };
}

/**
 * First-time generation: produce all six sourcing strings in one Anthropic
 * call and INSERT one row per (project_id, query_type, search_type) at
 * version=1. Idempotent in the user-facing sense: if any rows already
 * exist for this project, the action refuses and points to regenerateOne.
 */
export async function generateAllAction(projectId: string): Promise<void> {
  const { userId, organizationId } = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { count, error: countError } = await supabase
    .from("boolean_queries")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId);

  if (countError) {
    throw new Error(`Failed to check existing queries: ${countError.message}`);
  }
  if ((count ?? 0) > 0) {
    throw new Error(
      "Sourcing queries already exist for this project. Use 'Regenerate' on individual queries instead."
    );
  }

  const ctx = await loadGenerationContext(projectId);
  const queries = await generateAllSourcingQueries(ctx);
  const now = new Date().toISOString();

  const rows = SLOTS.map((slot) => ({
    project_id: projectId,
    organization_id: organizationId,
    query_type: slot.query_type,
    search_type: slot.search_type,
    content: queries[slot.key] ?? "",
    version: 1,
    updated_at: now,
  }));

  const { error: insertError } = await supabase
    .from("boolean_queries")
    .insert(rows);

  if (insertError) {
    throw new Error(`Failed to persist queries: ${insertError.message}`);
  }

  // userId reserved for future audit trail (created_by isn't a column on
  // boolean_queries — leaving the ref as documentation rather than a
  // dropped binding).
  void userId;

  revalidatePath(`/projects/${projectId}/sourcing`);
}

/**
 * Regenerate a single slot. Calls Anthropic with the current draft +
 * recruiter feedback, then INSERTs a new row at MAX(version)+1 for that
 * (project, query_type, search_type) so the editor surfaces the new
 * canonical and the prior version remains in history.
 */
export async function regenerateOneAction(
  projectId: string,
  slotKey: SlotKey,
  feedback: string
): Promise<void> {
  const { organizationId } = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const slot = SLOTS.find((s) => s.key === slotKey);
  if (!slot) {
    throw new Error(`Unknown slot: ${slotKey}`);
  }

  // Latest version + current content for this slot. The current content
  // is fed into the regen prompt so the model can iterate from it (and
  // honour any inline edits the recruiter made before regenerating).
  const { data: latest } = await supabase
    .from("boolean_queries")
    .select("version, content")
    .eq("project_id", projectId)
    .eq("query_type", slot.query_type)
    .eq("search_type", slot.search_type)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle<{ version: number; content: string }>();

  const current = latest?.content ?? "";
  const nextVersion = (latest?.version ?? 0) + 1;

  const ctx = await loadGenerationContext(projectId);
  const newContent = await regenerateSingleQuery(slotKey, current, feedback, ctx);
  const now = new Date().toISOString();

  const { error } = await supabase.from("boolean_queries").insert({
    project_id: projectId,
    organization_id: organizationId,
    query_type: slot.query_type,
    search_type: slot.search_type,
    content: newContent,
    version: nextVersion,
    updated_at: now,
  });

  if (error) {
    throw new Error(`Failed to persist regenerated query: ${error.message}`);
  }

  revalidatePath(`/projects/${projectId}/sourcing`);
}

/**
 * In-place edit of the canonical (latest version) row for a slot. Saves
 * the recruiter's manual edits without bumping version. Refuses if the
 * row doesn't exist yet (the slot hasn't been generated).
 */
export async function saveQueryEditAction(
  projectId: string,
  slotKey: SlotKey,
  content: string
): Promise<void> {
  await requireAuth();
  const supabase = await createServerSupabaseClient();

  const slot = SLOTS.find((s) => s.key === slotKey);
  if (!slot) {
    throw new Error(`Unknown slot: ${slotKey}`);
  }

  const trimmed = content.trim();
  if (!trimmed) {
    throw new Error("Query string cannot be empty.");
  }

  const { data: latest } = await supabase
    .from("boolean_queries")
    .select("id")
    .eq("project_id", projectId)
    .eq("query_type", slot.query_type)
    .eq("search_type", slot.search_type)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string }>();

  if (!latest) {
    throw new Error(
      "No query to edit yet for this slot. Generate the sourcing set first."
    );
  }

  const { error } = await supabase
    .from("boolean_queries")
    .update({
      content: trimmed,
      updated_at: new Date().toISOString(),
    })
    .eq("id", latest.id);

  if (error) {
    throw new Error(`Failed to save edit: ${error.message}`);
  }

  revalidatePath(`/projects/${projectId}/sourcing`);
}
