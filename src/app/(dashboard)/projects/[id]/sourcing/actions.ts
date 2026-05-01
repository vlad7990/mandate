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
  organization_id: string | null;
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
    .select("calibration_model, company_context, organization_id")
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
    skill_context: {
      project_id: projectId,
      organization_id: project.organization_id,
    },
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

/**
 * Restore a historical version by inserting a new boolean_queries row
 * at version+1 with the historical content. Mirrors the regenerate
 * flow's append-only behaviour — the prior history stays intact so
 * the recruiter can roll forward from any point.
 */
export async function restoreQueryVersionAction(
  projectId: string,
  rowId: string
): Promise<{ slot: string; version: number }> {
  const { organizationId } = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data: source, error: srcErr } = await supabase
    .from("boolean_queries")
    .select("query_type, search_type, content, version")
    .eq("id", rowId)
    .eq("project_id", projectId)
    .single<{
      query_type: string;
      search_type: string;
      content: string;
      version: number;
    }>();

  if (srcErr || !source) {
    throw new Error("Source version not found.");
  }

  // Find current max version for the slot.
  const { data: latest } = await supabase
    .from("boolean_queries")
    .select("version")
    .eq("project_id", projectId)
    .eq("query_type", source.query_type)
    .eq("search_type", source.search_type)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle<{ version: number }>();

  const nextVersion = (latest?.version ?? source.version) + 1;

  const { error: insertErr } = await supabase
    .from("boolean_queries")
    .insert({
      project_id: projectId,
      organization_id: organizationId,
      query_type: source.query_type,
      search_type: source.search_type,
      content: source.content,
      version: nextVersion,
      updated_at: new Date().toISOString(),
    });
  if (insertErr) {
    throw new Error(`Failed to restore version: ${insertErr.message}`);
  }

  revalidatePath(`/projects/${projectId}/sourcing`);
  return {
    slot: `${source.query_type}_${source.search_type}`,
    version: nextVersion,
  };
}

// ────────────────────────────────────────────────────────────────────────
// F5 — Sourcing Strategy: target-company generator
// ────────────────────────────────────────────────────────────────────────

import { runTargetCompanies } from "@/lib/ai/run-target-companies";
import type { TargetCompaniesReport } from "@/lib/ai/target-companies-agent";

export async function generateTargetCompaniesAction(
  projectId: string,
  archetypeHint?: string
): Promise<TargetCompaniesReport> {
  if (!projectId) throw new Error("Missing projectId.");
  const auth = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data: project, error } = await supabase
    .from("projects")
    .select(
      "id, company_name, calibration_model, company_context, organization_id"
    )
    .eq("id", projectId)
    .single<{
      id: string;
      company_name: string;
      calibration_model: Partial<CalibrationModel> | null;
      company_context: Partial<CompanyContext> | null;
      organization_id: string | null;
    }>();

  if (error || !project) throw new Error("Project not found.");
  if (project.organization_id !== auth.organizationId) {
    throw new Error("Project belongs to a different organisation.");
  }

  const company = project.company_context ?? {};
  const calibration = project.calibration_model ?? {};

  return runTargetCompanies(
    {
      role: {
        title: calibration.role_title ?? null,
        seniority: calibration.role_structure?.seniority ?? null,
        function: calibration.role_structure?.function ?? null,
      },
      company: {
        name: company.company_name ?? project.company_name,
        industry: company.industry ?? null,
        business_model: company.business_model ?? null,
      },
      calibration,
      archetype_hint: archetypeHint?.trim() || null,
    },
    {
      projectId,
      organizationId: project.organization_id,
    }
  );
}

export async function appendCompaniesToBooleanAction(
  projectId: string,
  slot: SlotKey,
  companies: string[]
): Promise<{ slot: SlotKey; version: number }> {
  if (!projectId) throw new Error("Missing projectId.");
  if (!Array.isArray(companies) || companies.length === 0) {
    throw new Error("No companies to append.");
  }

  const auth = await requireAuth();
  const supabase = await createServerSupabaseClient();

  // Reuse the project-org guard via the existing actions's pattern.
  const { data: project } = await supabase
    .from("projects")
    .select("organization_id")
    .eq("id", projectId)
    .single<{ organization_id: string | null }>();
  if (!project) throw new Error("Project not found.");
  if (project.organization_id !== auth.organizationId) {
    throw new Error("Project belongs to a different organisation.");
  }

  const slotMeta = SLOTS.find((s) => s.key === slot);
  if (!slotMeta) throw new Error(`Unknown slot: ${slot}`);

  // Pull the latest version for this slot.
  const { data: existing } = await supabase
    .from("boolean_queries")
    .select("content, version")
    .eq("project_id", projectId)
    .eq("query_type", slotMeta.query_type)
    .eq("search_type", slotMeta.search_type)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle<{ content: string; version: number }>();

  // Boolean string append: " OR " into the existing content. Quote
  // company names that contain spaces — Boolean parsers expect that.
  const formatted = companies
    .map((c) => (/\s/.test(c) ? `"${c.replace(/"/g, "")}"` : c))
    .join(" OR ");
  const next = existing?.content
    ? `${existing.content} OR ${formatted}`
    : formatted;
  const nextVersion = (existing?.version ?? 0) + 1;

  const { error: insertErr } = await supabase
    .from("boolean_queries")
    .insert({
      project_id: projectId,
      organization_id: auth.organizationId,
      query_type: slotMeta.query_type,
      search_type: slotMeta.search_type,
      content: next,
      version: nextVersion,
    });

  if (insertErr) {
    throw new Error(`Failed to append: ${insertErr.message}`);
  }

  revalidatePath(`/projects/${projectId}/sourcing`);
  return { slot, version: nextVersion };
}
