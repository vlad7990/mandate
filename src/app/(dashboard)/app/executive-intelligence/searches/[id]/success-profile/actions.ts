"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { requireActionContext } from "@/lib/auth/access";
import {
  generateAndStoreSuccessProfile,
  ROLE_ARCHITECT_MODEL,
} from "@/lib/ai/generate-executive-success-profile";
import {
  EMPTY_SUCCESS_PROFILE,
  normalizeSuccessProfile,
  ROLE_ARCHITECT_PROMPT_VERSION,
  type SuccessProfileContent,
} from "@/lib/ai/executive-role-architect-agent";
import { recordExecutiveAuditEvent } from "@/lib/executive/audit";
import { runAction } from "@/lib/actions/run";
import type { ActionResult } from "@/lib/actions/result";

/** Sentence subject for a failure this file did not author. See `runAction`. */
const SUBJECT = "The success profile";

type AuthContext = {
  userId: string;
  organizationId: string;
};

async function requireAuth(): Promise<AuthContext> {
  return requireActionContext("mandates:write");
}

type SupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClient>>;

type AllocateArgs = {
  searchId: string;
  organizationId: string;
  createdBy: string;
  contentJson: SuccessProfileContent;
  isGenerating: boolean;
};

/**
 * Atomic version allocation + insert via allocate_and_insert_success_profile
 * — see migration 032. When isGenerating=true and a generation is already in
 * flight, the RPC returns that row with was_existing=true and callers must
 * skip launching a duplicate AI call.
 */
async function allocateAndInsertProfile(
  supabase: SupabaseClient,
  args: AllocateArgs
): Promise<{ profileId: string; version: number; wasExisting: boolean }> {
  const { data, error } = await supabase
    .rpc("allocate_and_insert_success_profile", {
      p_search_id: args.searchId,
      p_organization_id: args.organizationId,
      p_content_json: args.contentJson,
      p_is_generating: args.isGenerating,
      p_created_by: args.createdBy,
      p_prompt_version: ROLE_ARCHITECT_PROMPT_VERSION,
      p_model_version: ROLE_ARCHITECT_MODEL,
    })
    .single();

  if (error || !data) {
    throw new Error(
      `Failed to allocate success profile version: ${error?.message ?? "no row returned"}`
    );
  }

  const row = data as { id: string; version: number; was_existing: boolean };
  return {
    profileId: row.id,
    version: row.version,
    wasExisting: Boolean(row.was_existing),
  };
}

function profilePath(searchId: string): string {
  return `/app/executive-intelligence/searches/${searchId}/success-profile`;
}

/**
 * First-time generation from the empty-state CTA, and every subsequent
 * regenerate. Allocates a placeholder version, fires the Role Architect via
 * after(), and the polling view picks up the result. Must stay a server
 * action invoked on explicit user click — never from a render path.
 */
export async function requestProfileGeneration(
  searchId: string
): Promise<ActionResult<{ profileId: string; version: number; wasExisting: boolean }>> {
  return runAction(SUBJECT, async () => {
    const { userId, organizationId } = await requireAuth();
    const supabase = await createServerSupabaseClient();

    const inserted = await allocateAndInsertProfile(supabase, {
      searchId,
      organizationId,
      createdBy: userId,
      contentJson: EMPTY_SUCCESS_PROFILE,
      isGenerating: true,
    });

    if (!inserted.wasExisting) {
      await recordExecutiveAuditEvent(supabase, {
        organizationId,
        searchId,
        profileId: inserted.profileId,
        actorId: userId,
        eventType:
          inserted.version === 1
            ? "profile_generation_requested"
            : "profile_regenerated",
        detail: { version: inserted.version },
      });

      after(async () => {
        try {
          await generateAndStoreSuccessProfile(
            inserted.profileId,
            searchId,
            userId
          );
        } catch (err) {
          console.error(
            "[generate-success-profile] failed for profile",
            inserted.profileId,
            err
          );
        }
      });
    }

    revalidatePath(profilePath(searchId));
    return inserted;
  });
}

const DRAFT_LOCKED_MESSAGE =
  "This version is no longer an editable draft. Create a new version to make changes.";

/**
 * Save edits onto the current draft row in place. The status='draft' guard
 * lives in the UPDATE's WHERE clause so a concurrent approval can never be
 * silently overwritten — approved profiles are immutable.
 */
export async function saveProfileDraft(
  profileId: string,
  searchId: string,
  content: SuccessProfileContent
): Promise<ActionResult> {
  return runAction(SUBJECT, async () => {
    const { userId, organizationId } = await requireAuth();
    const supabase = await createServerSupabaseClient();

    const normalized = normalizeSuccessProfile(content);

    const { data, error } = await supabase
      .from("role_success_profiles")
      .update({
        content_json: normalized,
        updated_at: new Date().toISOString(),
      })
      .eq("id", profileId)
      .eq("search_id", searchId)
      .eq("status", "draft")
      .eq("is_generating", false)
      .select("id")
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to save draft: ${error.message}`);
    }
    if (data == null) {
      throw new Error(DRAFT_LOCKED_MESSAGE);
    }

    await recordExecutiveAuditEvent(supabase, {
      organizationId,
      searchId,
      profileId,
      actorId: userId,
      eventType: "profile_edited",
      detail: {},
    });

    revalidatePath(profilePath(searchId));
  });
}

/**
 * Snapshot the current edits as a brand-new draft version. Used both to
 * branch from an approved profile (approved rows are never edited) and to
 * checkpoint significant manual revisions.
 */
export async function createProfileNewVersion(
  searchId: string,
  content: SuccessProfileContent
): Promise<ActionResult<{ profileId: string; version: number }>> {
  return runAction(SUBJECT, async () => {
    const { userId, organizationId } = await requireAuth();
    const supabase = await createServerSupabaseClient();

    const inserted = await allocateAndInsertProfile(supabase, {
      searchId,
      organizationId,
      createdBy: userId,
      contentJson: normalizeSuccessProfile(content),
      isGenerating: false,
    });

    await recordExecutiveAuditEvent(supabase, {
      organizationId,
      searchId,
      profileId: inserted.profileId,
      actorId: userId,
      eventType: "profile_new_version",
      detail: { version: inserted.version },
    });

    revalidatePath(profilePath(searchId));
    return { profileId: inserted.profileId, version: inserted.version };
  });
}

/**
 * Human approval — the explicit sign-off this module requires before a
 * profile drives anything downstream. Delegated to approve_success_profile,
 * which validates the target, stamps approved_by from auth.uid() (the
 * approver cannot be forged), and archives the previously approved version
 * in one atomic statement.
 */
export async function approveProfile(
  profileId: string,
  searchId: string
): Promise<ActionResult> {
  return runAction(SUBJECT, async () => {
    const { userId, organizationId } = await requireAuth();
    const supabase = await createServerSupabaseClient();

    const { error } = await supabase.rpc("approve_success_profile", {
      p_profile_id: profileId,
      p_search_id: searchId,
    });

    if (error) {
      throw new Error(`Failed to approve profile: ${error.message}`);
    }

    // Approval promotes the profile's competency weights to the operational
    // source of truth (executive_search_competencies) — see the sync helper
    // for the overwrite semantics.
    await syncCompetencyWeightsFromApprovedProfile(
      supabase,
      profileId,
      searchId,
      organizationId
    );

    await recordExecutiveAuditEvent(supabase, {
      organizationId,
      searchId,
      profileId,
      actorId: userId,
      eventType: "profile_approved",
      detail: {},
    });

    revalidatePath(profilePath(searchId));
    revalidatePath(`/app/executive-intelligence/searches/${searchId}`);
  });
}

/**
 * Source-of-truth contract (see docs/executive-intelligence.md):
 * executive_search_competencies is the operational store downstream features
 * (interview plans, assessments) read from; profile content_json keeps the
 * per-version recommendation history. On approval, the approved profile's
 * weights — already human-reviewed by definition — are upserted with
 * source='ai', overwriting prior rows for the same competencies (template or
 * ai). Manually added competencies NOT present in the approved profile are
 * left untouched.
 *
 * Best-effort: the approval itself has already committed, so a sync failure
 * logs loudly rather than failing the user action; re-approving a version
 * re-runs the sync.
 */
async function syncCompetencyWeightsFromApprovedProfile(
  supabase: SupabaseClient,
  profileId: string,
  searchId: string,
  organizationId: string
): Promise<void> {
  try {
    const { data: profileRow, error: profileError } = await supabase
      .from("role_success_profiles")
      .select("content_json")
      .eq("id", profileId)
      .single();

    if (profileError || !profileRow) {
      throw new Error(profileError?.message ?? "approved profile not found");
    }

    const weights = normalizeSuccessProfile(
      profileRow.content_json
    ).recommended_competency_weights;
    if (weights.length === 0) return;

    const { data: comps, error: compsError } = await supabase
      .from("executive_competencies")
      .select("id, key, is_global")
      .in(
        "key",
        weights.map((w) => w.competency_key)
      );
    if (compsError) throw new Error(compsError.message);

    // Id and tier together, org-private winning over global on a shared key —
    // the same resolution the intake prefill does. 056 pairs the two in a
    // foreign key, so they cannot be looked up independently.
    const byKey = new Map<string, { id: string; is_global: boolean }>();
    for (const c of (comps ?? []) as Array<{
      id: string;
      key: string;
      is_global: boolean;
    }>) {
      const existing = byKey.get(c.key);
      if (!existing || existing.is_global) {
        byKey.set(c.key, { id: c.id, is_global: c.is_global });
      }
    }

    const rows = weights.flatMap((w) => {
      const competency = byKey.get(w.competency_key);
      if (!competency) return [];
      return [
        {
          search_id: searchId,
          organization_id: organizationId,
          competency_id: competency.id,
          competency_is_global: competency.is_global,
          weight: w.weight,
          rationale: w.rationale,
          source: "ai",
        },
      ];
    });
    if (rows.length === 0) return;

    const { error: upsertError } = await supabase
      .from("executive_search_competencies")
      .upsert(rows, { onConflict: "search_id,competency_id" });
    if (upsertError) throw new Error(upsertError.message);
  } catch (err) {
    console.error(
      "[success-profile] competency weight sync failed for profile",
      profileId,
      err
    );
  }
}

/**
 * Terminal timeout marker for a stuck placeholder — same contract as the
 * job-spec version: only flips rows still is_generating=true, so a
 * completed generation is never clobbered.
 */
export async function markProfileGenerationTimedOut(
  profileId: string,
  searchId: string
): Promise<ActionResult> {
  return runAction(SUBJECT, async () => {
    await requireAuth();
    const supabase = await createServerSupabaseClient();

    const { error } = await supabase
      .from("role_success_profiles")
      .update({
        is_generating: false,
        generation_error: "Generation timed out. Please retry.",
        updated_at: new Date().toISOString(),
      })
      .eq("id", profileId)
      .eq("search_id", searchId)
      .eq("is_generating", true);

    if (error) {
      throw new Error(`Failed to mark generation as timed out: ${error.message}`);
    }

    revalidatePath(profilePath(searchId));
  });
}
