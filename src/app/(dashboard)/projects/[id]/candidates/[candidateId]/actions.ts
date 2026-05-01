"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import {
  EVALUATION_KEY,
  ensureCandidateEvaluation,
} from "@/lib/ai/generate-evaluation";
import {
  PRESENT_DECISIONS,
  RECRUITER_TIERS,
  type PresentDecision,
  type RecruiterAssessment,
} from "@/lib/recruiter-assessment";
import type { Tier } from "@/lib/ranking/tiers";

// ────────────────────────────────────────────────────────────────────────
// Auth helper
// ────────────────────────────────────────────────────────────────────────

type AuthContext = {
  userId: string;
  organizationId: string;
};

/**
 * Active-user gate shared by every mutating action in this file.
 *
 * Why this exists separately from RLS: the database helper
 * `current_user_org_id()` returns the row's organization_id without
 * checking `users.status`. That means a user whose status flipped to
 * `pending` or `suspended` since they last refreshed the dashboard
 * still has a valid Supabase JWT and could trigger server actions
 * directly. The dashboard layout's redirect catches them on a normal
 * page visit but does not protect server-action POSTs invoked with a
 * still-valid token. Every mutation in this file therefore re-checks
 * status against the live row before writing.
 */
async function requireActiveUser(): Promise<AuthContext> {
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

/**
 * Confirm the candidate belongs to the requested project. Used in
 * conjunction with `requireActiveUser` to keep server-action requests
 * defended against client-side parameter tampering.
 */
async function assertCandidateBelongsToProject(
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

// ────────────────────────────────────────────────────────────────────────
// Evaluation regenerate
// ────────────────────────────────────────────────────────────────────────

/**
 * Force a fresh evaluation by clearing the cached evaluation on the
 * candidate, then re-invoking the gate. Used by the "Regenerate" button
 * on the report header. Throws on auth failure or generation failure
 * so the client can toast a useful message.
 */
export async function regenerateEvaluationAction(
  candidateId: string,
  projectId: string
): Promise<void> {
  if (!candidateId || !projectId) {
    throw new Error("Missing candidateId or projectId.");
  }

  await requireActiveUser();
  await assertCandidateBelongsToProject(candidateId, projectId);

  // Clear the cached evaluation atomically via the RPC. This avoids the
  // read-modify-write race where a concurrent inline edit could revive
  // the deleted key by writing back stale JSON.
  const supabase = await createServerSupabaseClient();
  const { error: clearErr } = await supabase.rpc(
    "update_cv_structured_field",
    {
      p_candidate_id: candidateId,
      p_project_id: projectId,
      p_key: EVALUATION_KEY,
      p_value: null,
    }
  );
  if (clearErr) {
    throw new Error(`Failed to clear evaluation: ${clearErr.message}`);
  }

  const fresh = await ensureCandidateEvaluation(candidateId, projectId);
  if (!fresh) {
    throw new Error("Could not generate evaluation. Try again.");
  }

  revalidatePath(`/projects/${projectId}/candidates/${candidateId}`);
}

// ────────────────────────────────────────────────────────────────────────
// Inline contact-detail edits
// ────────────────────────────────────────────────────────────────────────

const CONTACT_FIELDS = [
  "linkedin_url",
  "twitter_url",
  "github_url",
  "website_url",
  "phone",
  "location",
  "email",
] as const;

export type ContactField = (typeof CONTACT_FIELDS)[number];

const URL_FIELDS: ReadonlySet<ContactField> = new Set([
  "linkedin_url",
  "twitter_url",
  "github_url",
  "website_url",
]);

/**
 * Inline-edit one contact field on a candidate. The profile UI calls
 * this once per blur/Enter — keeping the action narrow makes the round
 * trip cheap and the optimistic UI logic obvious.
 *
 * Empty / whitespace-only values clear the field (set NULL). URL-typed
 * fields are normalised: bare hostnames (`linkedin.com/in/foo`) get an
 * `https://` prefix so the rendered link tag is always navigable.
 */
export async function updateCandidateContact(
  candidateId: string,
  projectId: string,
  field: ContactField,
  rawValue: string
): Promise<{ value: string | null }> {
  if (!candidateId || !projectId) {
    throw new Error("Missing candidateId or projectId.");
  }
  if (!CONTACT_FIELDS.includes(field)) {
    throw new Error(`Unknown contact field: ${field}`);
  }

  await requireActiveUser();
  await assertCandidateBelongsToProject(candidateId, projectId);

  const trimmed = rawValue.trim();
  let nextValue: string | null;
  if (trimmed.length === 0) {
    nextValue = null;
  } else if (URL_FIELDS.has(field)) {
    nextValue = normaliseUrl(trimmed);
    if (!nextValue) {
      throw new Error("That doesn't look like a valid URL.");
    }
  } else if (field === "email") {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      throw new Error("That doesn't look like a valid email.");
    }
    nextValue = trimmed;
  } else {
    nextValue = trimmed;
  }

  const supabase = await createServerSupabaseClient();
  const { error: updateErr } = await supabase
    .from("candidates")
    .update({
      [field]: nextValue,
      updated_at: new Date().toISOString(),
    })
    .eq("id", candidateId);

  if (updateErr) {
    throw new Error(`Failed to update ${field}: ${updateErr.message}`);
  }

  revalidatePath(`/projects/${projectId}/candidates/${candidateId}`);
  return { value: nextValue };
}

function normaliseUrl(raw: string): string | null {
  // Accept full URLs, protocol-relative URLs, and bare hostnames. Reject
  // whitespace and obvious garbage so the field can't store a free-text
  // note where a URL is expected.
  if (/\s/.test(raw)) return null;

  let candidate = raw;
  if (!/^https?:\/\//i.test(candidate)) {
    if (candidate.startsWith("//")) {
      candidate = "https:" + candidate;
    } else {
      candidate = "https://" + candidate;
    }
  }
  try {
    const url = new URL(candidate);
    if (!url.hostname.includes(".")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

// ────────────────────────────────────────────────────────────────────────
// Inline-edit profile / CV fields
// ────────────────────────────────────────────────────────────────────────

const ARCHETYPE_VALUES = [
  "Builder",
  "Operator",
  "Transformer",
  "Infrastructure",
] as const;
type ArchetypeValue = (typeof ARCHETYPE_VALUES)[number];

const CORE_TEXT_FIELDS = [
  "full_name",
  "current_title",
  "current_company",
] as const;

const CV_TEXT_FIELDS = [
  "summary",
  "domain",
  "scale",
] as const;

const CV_LIST_FIELDS = [
  "strengths",
  "development_areas",
  "risks",
] as const;

export type CandidateEditableField =
  | (typeof CORE_TEXT_FIELDS)[number]
  | (typeof CV_TEXT_FIELDS)[number]
  | (typeof CV_LIST_FIELDS)[number]
  | "archetype"
  | "years_experience";

type FieldValue = string | string[] | number | null;

/**
 * Inline-update one editable field on a candidate. Three storage
 * shapes hide behind a single entry point:
 *   * core text columns (full_name, current_title, current_company)
 *     → typed columns on `candidates`.
 *   * archetype → typed column AND mirrored back into cv_structured.
 *   * everything CV-derived (summary, strengths/development_areas/risks,
 *     domain, scale, years_experience) → one top-level key on the
 *     cv_structured JSONB.
 *
 * Concurrency: the cv_structured key is mutated via the SQL-level
 * `update_cv_structured_field` RPC (jsonb_set in a single UPDATE). The
 * old read-modify-write code path raced with the executive-evaluation
 * generator and with parallel inline edits; the RPC serialises on the
 * row lock so the lost-update class of bug goes away.
 *
 * Empty strings, empty arrays, and `null` clear the field.
 */
export async function updateCandidateField(
  candidateId: string,
  projectId: string,
  field: CandidateEditableField,
  value: FieldValue
): Promise<void> {
  if (!candidateId || !projectId) {
    throw new Error("Missing candidateId or projectId.");
  }

  await requireActiveUser();
  await assertCandidateBelongsToProject(candidateId, projectId);

  const supabase = await createServerSupabaseClient();

  if ((CORE_TEXT_FIELDS as readonly string[]).includes(field)) {
    if (typeof value !== "string" && value !== null) {
      throw new Error(`${field} must be text.`);
    }
    const next = typeof value === "string" ? value.trim() : null;
    if (field === "full_name" && (!next || next.length === 0)) {
      throw new Error("Name cannot be blank.");
    }
    const stored = next && next.length > 0 ? next : null;

    const { error: updateErr } = await supabase
      .from("candidates")
      .update({
        [field]: stored,
        updated_at: new Date().toISOString(),
      })
      .eq("id", candidateId);
    if (updateErr) {
      throw new Error(`Failed to update ${field}: ${updateErr.message}`);
    }

    // Mirror full_name into cv_structured atomically so exports stay coherent.
    if (field === "full_name") {
      await rpcSetCvField(candidateId, projectId, "full_name", stored);
    }
  } else if (field === "archetype") {
    let next: ArchetypeValue | null;
    if (value === null || value === "") {
      next = null;
    } else if (
      typeof value === "string" &&
      (ARCHETYPE_VALUES as readonly string[]).includes(value)
    ) {
      next = value as ArchetypeValue;
    } else {
      throw new Error("Invalid archetype.");
    }

    const { error: updateErr } = await supabase
      .from("candidates")
      .update({
        archetype: next,
        updated_at: new Date().toISOString(),
      })
      .eq("id", candidateId);
    if (updateErr) {
      throw new Error(`Failed to update archetype: ${updateErr.message}`);
    }

    await rpcSetCvField(candidateId, projectId, "archetype", next);
  } else if ((CV_TEXT_FIELDS as readonly string[]).includes(field)) {
    if (typeof value !== "string" && value !== null) {
      throw new Error(`${field} must be text.`);
    }
    const next = typeof value === "string" ? value.trim() : null;
    await rpcSetCvField(
      candidateId,
      projectId,
      field,
      next && next.length > 0 ? next : null
    );
  } else if ((CV_LIST_FIELDS as readonly string[]).includes(field)) {
    if (!Array.isArray(value)) {
      throw new Error(`${field} must be an array.`);
    }
    const cleaned = value
      .filter((v): v is string => typeof v === "string")
      .map((v) => v.trim())
      .filter((v) => v.length > 0);
    await rpcSetCvField(candidateId, projectId, field, cleaned);
  } else if (field === "years_experience") {
    if (value === null || value === "") {
      await rpcSetCvField(candidateId, projectId, "years_experience", null);
    } else {
      const n =
        typeof value === "number"
          ? value
          : typeof value === "string"
            ? Number(value)
            : NaN;
      if (!Number.isFinite(n) || n < 0) {
        throw new Error("Years of experience must be a non-negative number.");
      }
      await rpcSetCvField(
        candidateId,
        projectId,
        "years_experience",
        Math.round(n)
      );
    }
  } else {
    throw new Error(`Unknown field: ${field}`);
  }

  revalidatePath(`/projects/${projectId}/candidates/${candidateId}`);
}

/**
 * Atomically set or delete a single top-level key on
 * `candidates.cv_structured` via the migration-021 RPC. Pass `null`
 * (or `undefined`) for `value` to delete the key; any other value —
 * including string, number, array, object — is JSON-encoded by the
 * Supabase client and written via `jsonb_set`.
 */
async function rpcSetCvField(
  candidateId: string,
  projectId: string,
  key: string,
  value: unknown
): Promise<void> {
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("update_cv_structured_field", {
    p_candidate_id: candidateId,
    p_project_id: projectId,
    p_key: key,
    // Supabase encodes JS arrays/objects/scalars to jsonb. `null` here
    // becomes SQL NULL, which the RPC interprets as "delete the key".
    p_value: value === undefined ? null : value,
  });
  if (error) {
    throw new Error(`Failed to update ${key}: ${error.message}`);
  }
}

// ────────────────────────────────────────────────────────────────────────
// Recruiter assessment (override layer on top of AI evaluation)
// ────────────────────────────────────────────────────────────────────────

export type RecruiterAssessmentInput = {
  tier: Tier | null;
  fit_notes: string;
  strengths: string[];
  would_present: PresentDecision | null;
};

/**
 * Persist the recruiter's own read on a candidate. Stored on the
 * `candidates.recruiter_assessment` JSONB column added in migration
 * 022. Never touches AI-derived fields (cv_structured, scores,
 * evaluation) — the recruiter's read is always additive.
 *
 * Empty assessments (all fields null/empty/empty-array) clear the
 * column to NULL so the UI can fall back to "no recruiter read yet".
 */
export async function updateRecruiterAssessment(
  candidateId: string,
  projectId: string,
  input: RecruiterAssessmentInput
): Promise<void> {
  if (!candidateId || !projectId) {
    throw new Error("Missing candidateId or projectId.");
  }

  const auth = await requireActiveUser();
  await assertCandidateBelongsToProject(candidateId, projectId);

  // Validate enums; coerce empties.
  const tier =
    input.tier && (RECRUITER_TIERS as readonly string[]).includes(input.tier)
      ? input.tier
      : null;
  const wouldPresent =
    input.would_present &&
    (PRESENT_DECISIONS as readonly string[]).includes(input.would_present)
      ? input.would_present
      : null;
  const fitNotes =
    typeof input.fit_notes === "string" ? input.fit_notes.trim() : "";
  const strengths = Array.isArray(input.strengths)
    ? input.strengths
        .filter((s): s is string => typeof s === "string")
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
    : [];

  const isEmpty =
    tier == null &&
    wouldPresent == null &&
    fitNotes.length === 0 &&
    strengths.length === 0;

  const next: RecruiterAssessment | null = isEmpty
    ? null
    : {
        tier,
        fit_notes: fitNotes,
        strengths,
        would_present: wouldPresent,
        updated_by: auth.userId,
        updated_at: new Date().toISOString(),
      };

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from("candidates")
    .update({
      recruiter_assessment: next,
      updated_at: new Date().toISOString(),
    })
    .eq("id", candidateId);

  if (error) {
    throw new Error(`Failed to save recruiter assessment: ${error.message}`);
  }

  revalidatePath(`/projects/${projectId}/candidates/${candidateId}`);
}
