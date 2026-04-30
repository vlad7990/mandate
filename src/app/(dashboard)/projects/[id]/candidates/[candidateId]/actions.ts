"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import {
  EVALUATION_KEY,
  ensureCandidateEvaluation,
  type CvStructuredWithEvaluation,
} from "@/lib/ai/generate-evaluation";

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

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthenticated.");

  // Clear the cached evaluation. We read-then-write rather than using a
  // SQL JSONB delete because the column type is plain JSONB and the
  // Supabase client doesn't expose a partial-update primitive.
  const { data: candidate, error: readErr } = await supabase
    .from("candidates")
    .select("project_id, cv_structured")
    .eq("id", candidateId)
    .single<{ project_id: string; cv_structured: unknown }>();

  if (readErr || !candidate) {
    throw new Error("Candidate not found.");
  }
  if (candidate.project_id !== projectId) {
    throw new Error("Candidate does not belong to the requested project.");
  }

  const cv = (candidate.cv_structured ?? {}) as CvStructuredWithEvaluation;
  if (cv[EVALUATION_KEY]) {
    const { [EVALUATION_KEY]: _drop, ...rest } = cv;
    void _drop;
    const { error: clearErr } = await supabase
      .from("candidates")
      .update({
        cv_structured: rest,
        updated_at: new Date().toISOString(),
      })
      .eq("id", candidateId);
    if (clearErr) throw new Error(`Failed to clear evaluation: ${clearErr.message}`);
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

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthenticated.");

  // RLS scopes by org, but we still confirm the candidate belongs to
  // the requested project so a malformed client request can't write
  // across projects.
  const { data: candidate, error: readErr } = await supabase
    .from("candidates")
    .select("project_id")
    .eq("id", candidateId)
    .single<{ project_id: string }>();

  if (readErr || !candidate) {
    throw new Error("Candidate not found.");
  }
  if (candidate.project_id !== projectId) {
    throw new Error("Candidate does not belong to the requested project.");
  }

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
 * Inline-update one editable field on a candidate. The action handles
 * three storage shapes behind one entry point:
 *   * core text columns (full_name, current_title, current_company)
 *     → typed columns on `candidates`.
 *   * archetype → typed column AND mirrored back into cv_structured.
 *   * everything CV-derived (summary, strengths/development_areas/risks,
 *     domain, scale, years_experience) → spread into the cv_structured
 *     JSONB so future renderers and exports keep reading the same shape.
 *
 * Empty strings, empty arrays, and `null` clear the field. Numeric
 * input is coerced and clamped at non-negative.
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

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthenticated.");

  const { data: candidate, error: readErr } = await supabase
    .from("candidates")
    .select("project_id, cv_structured")
    .eq("id", candidateId)
    .single<{ project_id: string; cv_structured: unknown }>();

  if (readErr || !candidate) {
    throw new Error("Candidate not found.");
  }
  if (candidate.project_id !== projectId) {
    throw new Error("Candidate does not belong to the requested project.");
  }

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  const currentCv = (candidate.cv_structured ?? {}) as Record<string, unknown>;
  let nextCv: Record<string, unknown> | null = null;
  const setCvField = (k: string, v: unknown) => {
    if (!nextCv) nextCv = { ...currentCv };
    if (v === null || v === undefined) {
      delete nextCv[k];
    } else {
      nextCv[k] = v;
    }
  };

  if ((CORE_TEXT_FIELDS as readonly string[]).includes(field)) {
    if (typeof value !== "string" && value !== null) {
      throw new Error(`${field} must be text.`);
    }
    const next = typeof value === "string" ? value.trim() : null;
    if (field === "full_name" && (!next || next.length === 0)) {
      throw new Error("Name cannot be blank.");
    }
    updates[field] = next && next.length > 0 ? next : null;
    // Mirror full_name into cv_structured so exports stay coherent.
    if (field === "full_name") setCvField("full_name", updates[field]);
  } else if (field === "archetype") {
    if (value === null || value === "") {
      updates.archetype = null;
      setCvField("archetype", null);
    } else if (
      typeof value === "string" &&
      (ARCHETYPE_VALUES as readonly string[]).includes(value)
    ) {
      updates.archetype = value as ArchetypeValue;
      setCvField("archetype", value);
    } else {
      throw new Error("Invalid archetype.");
    }
  } else if ((CV_TEXT_FIELDS as readonly string[]).includes(field)) {
    if (typeof value !== "string" && value !== null) {
      throw new Error(`${field} must be text.`);
    }
    const next = typeof value === "string" ? value.trim() : null;
    setCvField(field, next && next.length > 0 ? next : null);
  } else if ((CV_LIST_FIELDS as readonly string[]).includes(field)) {
    if (!Array.isArray(value)) {
      throw new Error(`${field} must be an array.`);
    }
    const cleaned = value
      .filter((v): v is string => typeof v === "string")
      .map((v) => v.trim())
      .filter((v) => v.length > 0);
    setCvField(field, cleaned);
  } else if (field === "years_experience") {
    if (value === null || value === "") {
      setCvField("years_experience", null);
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
      setCvField("years_experience", Math.round(n));
    }
  } else {
    throw new Error(`Unknown field: ${field}`);
  }

  if (nextCv) {
    updates.cv_structured = nextCv;
  }

  const { error: updateErr } = await supabase
    .from("candidates")
    .update(updates)
    .eq("id", candidateId);

  if (updateErr) {
    throw new Error(`Failed to update ${field}: ${updateErr.message}`);
  }

  revalidatePath(`/projects/${projectId}/candidates/${candidateId}`);
}
