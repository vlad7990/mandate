"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { generateAndStoreJobSpec } from "@/lib/ai/generate-job-spec";
import {
  EMPTY_JOB_SPEC,
  normalizeSections,
  sectionsToMarkdown,
  type JobSpecSections,
} from "@/lib/ai/job-spec-analysis";
import { SAVE_DRAFT_FINALIZED_MESSAGE } from "@/lib/constants/job-spec-constants";

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

/**
 * Save the user's edits onto the current draft row in place. No new version.
 *
 * The is_final=false guard lives in the UPDATE's WHERE clause itself, so a
 * concurrent finalize between the user's last read and this write cannot
 * silently overwrite the canonical version. Zero rows updated → throw the
 * finalized-conflict sentinel; any other error surfaces with its supabase
 * message.
 */
export async function saveDraft(
  specId: string,
  projectId: string,
  sections: JobSpecSections
): Promise<void> {
  await requireAuth();
  const supabase = await createServerSupabaseClient();

  const normalized = normalizeSections(sections);
  const markdown = sectionsToMarkdown(normalized);

  const { data, error } = await supabase
    .from("job_specs")
    .update({
      content_json: normalized,
      content: markdown,
      updated_at: new Date().toISOString(),
    })
    .eq("id", specId)
    .eq("project_id", projectId)
    .eq("is_final", false)
    .select("id")
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to save draft: ${error.message}`);
  }

  // Zero rows means one of: spec was finalised between client read and this
  // write (the race we're guarding against), spec was deleted, or RLS
  // hides it. All three deserve the same recruiter-facing message — the
  // wizard should refresh and the user should snapshot before editing.
  if (data == null) {
    throw new Error(SAVE_DRAFT_FINALIZED_MESSAGE);
  }

  revalidatePath(`/projects/${projectId}/spec`);
}

/**
 * Snapshot the recruiter's current edits as a brand-new version row.
 * Version allocation and INSERT happen inside a single SQL transaction
 * via allocate_and_insert_job_spec — the project row lock is held
 * continuously, so concurrent allocators are serialised and the
 * (project_id, version) unique index never sees a collision.
 */
export async function createNewVersion(
  projectId: string,
  sections: JobSpecSections
): Promise<{ specId: string; version: number; wasExisting: boolean }> {
  const { userId, organizationId } = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const normalized = normalizeSections(sections);
  const markdown = sectionsToMarkdown(normalized);

  const inserted = await allocateAndInsertSpec(supabase, {
    projectId,
    organizationId,
    createdBy: userId,
    content: markdown,
    contentJson: normalized,
    isFinal: false,
    isGenerating: false,
  });

  revalidatePath(`/projects/${projectId}/spec`);
  return inserted;
}

/**
 * Atomically promote a single version to is_final=true and demote every
 * other row for the project. Delegated to the finalize_job_spec RPC,
 * which executes a single UPDATE statement (so the partial unique index
 * on is_final is checked at statement end) and raises if the target row
 * was not actually updated — covers RLS denial, deleted rows, or a
 * mismatched project id. The previous two-step UPDATE could silently
 * leave the project with no final spec on a partial failure.
 */
export async function markAsFinal(
  specId: string,
  projectId: string
): Promise<void> {
  await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { error } = await supabase.rpc("finalize_job_spec", {
    p_spec_id: specId,
    p_project_id: projectId,
  });

  if (error) {
    throw new Error(`Failed to mark as final: ${error.message}`);
  }

  revalidatePath(`/projects/${projectId}/spec`);
  revalidatePath(`/projects/${projectId}`);
}

/**
 * First-time spec generation, invoked explicitly from the empty-state CTA.
 *
 * Mechanically identical to requestRegenerate (allocate version → insert
 * placeholder → after() Anthropic call → revalidate) — the separation is
 * semantic only: this is the "no spec yet, build the first one" entry
 * point, while requestRegenerate is the "I want another draft" entry
 * point invoked from the editor.
 *
 * This MUST stay a server action invoked on explicit user click — never
 * trigger from a render path. Earlier versions of the route created the
 * placeholder during the spec/page.tsx server-component render, which made
 * Next.js link prefetch silently provision rows and burn AI spend.
 */
export async function initiateJobSpec(
  projectId: string
): Promise<{ specId: string; version: number; wasExisting: boolean }> {
  return requestRegenerate(projectId);
}

/**
 * Re-run AI generation. Allocates a new placeholder version and inserts
 * it atomically (allocate_and_insert_job_spec RPC), kicks off the
 * Anthropic call via after(), and the editor's polling view picks up the
 * result.
 *
 * Idempotent: if a generation is already in flight for this project, the
 * RPC returns the existing row (wasExisting=true) and we skip the after()
 * callback so we don't launch a duplicate paid Anthropic call. Concurrent
 * tabs / double-submits / retries all coalesce onto the same in-flight
 * placeholder. The DB-level partial unique index on
 * (project_id) WHERE is_generating is the hard backstop.
 */
export async function requestRegenerate(
  projectId: string
): Promise<{ specId: string; version: number; wasExisting: boolean }> {
  const { userId, organizationId } = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const placeholderMarkdown = sectionsToMarkdown(EMPTY_JOB_SPEC);

  const inserted = await allocateAndInsertSpec(supabase, {
    projectId,
    organizationId,
    createdBy: userId,
    content: placeholderMarkdown,
    contentJson: EMPTY_JOB_SPEC,
    isFinal: false,
    isGenerating: true,
  });

  // Only launch a fresh Anthropic call when this request actually created a
  // new placeholder. If the RPC returned an existing in-flight row the
  // original after() callback is still pending — adding another would
  // duplicate spend and could race the persist step.
  if (!inserted.wasExisting) {
    after(async () => {
      try {
        await generateAndStoreJobSpec(inserted.specId, projectId);
      } catch (err) {
        console.error("[generate-job-spec] failed for spec", inserted.specId, err);
      }
    });
  }

  revalidatePath(`/projects/${projectId}/spec`);
  return inserted;
}

/**
 * Mark a placeholder row as failed when client-side polling has waited
 * past the timeout window without seeing the AI call land. Sets
 * generation_error so the page routes to the retry view, and clears
 * is_generating so the polling skeleton stops.
 *
 * Guarded by `.eq("is_generating", true)`: if the AI call has already
 * landed (success or failure), this is a no-op — we don't clobber a
 * completed row with a stale "timed out" message.
 */
export async function markGenerationTimedOut(
  specId: string,
  projectId: string
): Promise<void> {
  await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { error } = await supabase
    .from("job_specs")
    .update({
      is_generating: false,
      generation_error: "Generation timed out. Please retry.",
      updated_at: new Date().toISOString(),
    })
    .eq("id", specId)
    .eq("project_id", projectId)
    .eq("is_generating", true);

  if (error) {
    throw new Error(`Failed to mark generation as timed out: ${error.message}`);
  }

  revalidatePath(`/projects/${projectId}/spec`);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type SupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClient>>;

type AllocateAndInsertArgs = {
  projectId: string;
  organizationId: string;
  createdBy: string;
  content: string;
  contentJson: JobSpecSections;
  isFinal: boolean;
  isGenerating: boolean;
};

/**
 * Allocate a fresh version and INSERT the job_specs row in a single SQL
 * transaction via allocate_and_insert_job_spec. The project row lock is
 * held for the entire allocate-then-insert sequence inside the function,
 * so concurrent callers serialise on the lock and each receives a
 * distinct, monotonically increasing version. No retry loop is needed —
 * if the RPC raises, the cause is genuine (RLS denial, missing project,
 * or a real DB error), not a benign uniqueness collision.
 *
 * When `isGenerating=true` and another generation is already in flight for
 * the same project, the RPC returns that existing row and sets
 * `wasExisting=true`. Callers should skip launching a new Anthropic call
 * in that case (the in-flight one will land via its own after() callback).
 */
async function allocateAndInsertSpec(
  supabase: SupabaseClient,
  args: AllocateAndInsertArgs
): Promise<{ specId: string; version: number; wasExisting: boolean }> {
  const { data, error } = await supabase
    .rpc("allocate_and_insert_job_spec", {
      p_project_id: args.projectId,
      p_organization_id: args.organizationId,
      p_content: args.content,
      p_content_json: args.contentJson,
      p_is_final: args.isFinal,
      p_is_generating: args.isGenerating,
      p_created_by: args.createdBy,
    })
    .single();

  if (error || !data) {
    throw new Error(
      `Failed to allocate and insert job spec: ${error?.message ?? "no row returned"}`
    );
  }

  const row = data as { id: string; version: number; was_existing: boolean };
  return {
    specId: row.id,
    version: row.version,
    wasExisting: Boolean(row.was_existing),
  };
}
