"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import {
  EVALUATION_KEY,
  ensureCandidateEvaluation,
} from "@/lib/ai/generate-evaluation";
import {
  normaliseDimensionNotes,
  PRESENT_DECISIONS,
  RECRUITER_TIERS,
  type DimensionNotes,
  type PresentDecision,
  type RecruiterAssessment,
} from "@/lib/recruiter-assessment";
import type { Tier } from "@/lib/ranking/tiers";
import { runPositioning, type PositioningInput } from "@/lib/ai/run-positioning";
import type { PositioningResult } from "@/lib/ai/positioning-agent";
import { runCandidateResearch } from "@/lib/ai/run-candidate-research";
import type { CandidateIntelligenceReport } from "@/lib/ai/candidate-research-agent";
import { runTriangulation } from "@/lib/ai/run-triangulation";
import type { TriangulationReport } from "@/lib/ai/triangulation-agent";
import type { CompanyIntelligenceReport } from "@/lib/ai/company-intelligence-agent";
import type { HiringManagerIntelligenceReport } from "@/lib/ai/hiring-manager-research-agent";

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

  revalidatePath(`/app/projects/${projectId}/candidates/${candidateId}`);
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

  revalidatePath(`/app/projects/${projectId}/candidates/${candidateId}`);
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

  revalidatePath(`/app/projects/${projectId}/candidates/${candidateId}`);
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
  /** Per-dimension judgement. The only human input the comparison grid can
   * line up candidate against candidate. */
  dimension_notes?: DimensionNotes;
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

  // Dropped through the same normaliser the read path uses, so an untouched
  // form ("Not assessed", no note) stores nothing rather than making every
  // candidate look assessed on every dimension.
  const dimensionNotes = normaliseDimensionNotes(input.dimension_notes);

  const isEmpty =
    tier == null &&
    wouldPresent == null &&
    fitNotes.length === 0 &&
    strengths.length === 0 &&
    Object.keys(dimensionNotes).length === 0;

  const next: RecruiterAssessment | null = isEmpty
    ? null
    : {
        tier,
        fit_notes: fitNotes,
        strengths,
        would_present: wouldPresent,
        dimension_notes: dimensionNotes,
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

  revalidatePath(`/app/projects/${projectId}/candidates/${candidateId}`);
}

// ────────────────────────────────────────────────────────────────────────
// Positioning Agent — generate 3 pitches + 3 email templates
// ────────────────────────────────────────────────────────────────────────

const POSITIONING_KEY = "positioning_kit" as const;

/**
 * Run the positioning agent for this candidate against this role and
 * persist the result onto cv_structured.positioning_kit via the atomic
 * RPC. Returns the generated artefacts so the panel can render them
 * immediately without a re-fetch.
 */
export async function generatePositioningAction(
  candidateId: string,
  projectId: string
): Promise<PositioningResult> {
  if (!candidateId || !projectId) {
    throw new Error("Missing candidateId or projectId.");
  }

  const auth = await requireActiveUser();
  await assertCandidateBelongsToProject(candidateId, projectId);

  const supabase = await createServerSupabaseClient();

  // Pull project + candidate + recent feedback in parallel.
  const [projectQ, candidateQ, feedbackQ] = await Promise.all([
    supabase
      .from("projects")
      .select(
        "id, title, company_name, calibration_model, company_context, organization_id"
      )
      .eq("id", projectId)
      .single<{
        id: string;
        title: string;
        company_name: string;
        calibration_model: unknown;
        company_context: unknown;
        organization_id: string | null;
      }>(),
    supabase
      .from("candidates")
      .select(
        "id, full_name, current_title, current_company, archetype, cv_structured, recruiter_assessment"
      )
      .eq("id", candidateId)
      .single<{
        id: string;
        full_name: string;
        current_title: string | null;
        current_company: string | null;
        archetype: string | null;
        cv_structured: unknown;
        recruiter_assessment: unknown;
      }>(),
    supabase
      .from("feedback")
      .select("feedback_type, content, interpreted, created_at")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  if (projectQ.error || !projectQ.data) {
    throw new Error("Project not found.");
  }
  if (projectQ.data.organization_id !== auth.organizationId) {
    throw new Error("Project belongs to a different organisation.");
  }
  if (candidateQ.error || !candidateQ.data) {
    throw new Error("Candidate not found.");
  }

  const project = projectQ.data;
  const candidate = candidateQ.data;
  const cv = (candidate.cv_structured ?? {}) as Record<string, unknown>;

  type FbRow = {
    feedback_type: string;
    content: string;
    interpreted: { summary?: string } | null;
    created_at: string;
  };
  const recentFeedback = ((feedbackQ.data ?? []) as FbRow[]).map((f) => ({
    feedback_type: f.feedback_type,
    content: f.content,
    summary: f.interpreted?.summary ?? null,
    created_at: f.created_at,
  }));

  const input: PositioningInput = {
    role: {
      role_title: project.title,
      company_name: project.company_name,
      calibration: project.calibration_model ?? {},
      company_context: project.company_context ?? {},
    },
    candidate: {
      candidate_id: candidate.id,
      full_name: candidate.full_name,
      current_title: candidate.current_title,
      current_company: candidate.current_company,
      archetype: candidate.archetype,
      profile: cv,
      evaluation: cv["evaluation"] ?? null,
      recruiter_assessment: candidate.recruiter_assessment ?? null,
    },
    recent_feedback: recentFeedback,
  };

  const result = await runPositioning(input, {
    projectId,
    organizationId: project.organization_id,
  });

  // Persist atomically to cv_structured.positioning_kit.
  await rpcSetCvField(candidateId, projectId, POSITIONING_KEY, result);

  revalidatePath(`/app/projects/${projectId}/candidates/${candidateId}`);
  return result;
}

// Note: the cv_structured key for the positioning kit is intentionally
// not exported from this "use server" file — Next.js only allows async
// function exports here. Components read the kit straight off
// cv_structured.positioning_kit.

// ────────────────────────────────────────────────────────────────────────
// Psychology Agent — generate behavioural / cultural-fit profile
// ────────────────────────────────────────────────────────────────────────

const PSYCHOLOGY_KEY = "psychology" as const;

/**
 * Run the candidate psychology agent and persist the result onto
 * cv_structured.psychology via the atomic JSONB RPC. Returns the
 * generated profile so the panel renders immediately.
 *
 * Optional `recruiterContext` — free text the recruiter pastes into
 * the regenerate dialog ("confirmed directive in phone screen", etc.)
 * — is prepended to the agent's system prompt as informed prior
 * knowledge AND persisted to cv_structured.psychology_context so the
 * panel can show what shaped the read.
 */
export async function generatePsychologyAction(
  candidateId: string,
  projectId: string,
  recruiterContext?: string
) {
  if (!candidateId || !projectId) {
    throw new Error("Missing candidateId or projectId.");
  }

  const auth = await requireActiveUser();
  await assertCandidateBelongsToProject(candidateId, projectId);

  const supabase = await createServerSupabaseClient();

  const [candidateQ, notesQ, projectQ] = await Promise.all([
    supabase
      .from("candidates")
      .select(
        "id, full_name, current_title, current_company, archetype, cv_structured"
      )
      .eq("id", candidateId)
      .single<{
        id: string;
        full_name: string;
        current_title: string | null;
        current_company: string | null;
        archetype: string | null;
        cv_structured: unknown;
      }>(),
    supabase
      .from("candidate_notes")
      .select("note_type, content, created_at")
      .eq("candidate_id", candidateId)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("projects")
      .select("organization_id")
      .eq("id", projectId)
      .single<{ organization_id: string | null }>(),
  ]);

  if (candidateQ.error || !candidateQ.data) {
    throw new Error("Candidate not found.");
  }
  if (projectQ.error || !projectQ.data) {
    throw new Error("Project not found.");
  }
  if (projectQ.data.organization_id !== auth.organizationId) {
    throw new Error("Project belongs to a different organisation.");
  }

  const { runPsychology } = await import("@/lib/ai/run-psychology");
  const candidate = candidateQ.data;
  const cv = (candidate.cv_structured ?? {}) as Record<string, unknown>;
  type NoteRow = { note_type: string; content: string; created_at: string };
  const notes = ((notesQ.data ?? []) as NoteRow[]).map((n) => ({
    note_type: n.note_type,
    content: n.content,
    created_at: n.created_at,
  }));

  const profile = await runPsychology(
    {
      candidate: {
        candidate_id: candidate.id,
        full_name: candidate.full_name,
        current_title: candidate.current_title,
        current_company: candidate.current_company,
        archetype: candidate.archetype,
        profile: cv,
        evaluation: cv["evaluation"] ?? null,
      },
      recruiter_notes: notes,
    },
    {
      projectId,
      organizationId: projectQ.data.organization_id,
      recruiterContext,
    }
  );

  await rpcSetCvField(candidateId, projectId, PSYCHOLOGY_KEY, profile);
  // Persist the context the recruiter supplied (or clear if absent)
  // so the panel can show what shaped this read.
  await rpcSetCvField(
    candidateId,
    projectId,
    "psychology_context",
    recruiterContext?.trim() ? recruiterContext.trim() : null
  );
  revalidatePath(`/app/projects/${projectId}/candidates/${candidateId}`);
  return profile;
}

// ────────────────────────────────────────────────────────────────────────
// Recruiter overlays for the Psychology panel
//
// All three live on cv_structured under sibling keys (notes, flags,
// confidence_overrides) and use the atomic JSONB RPC so a parallel
// psychology regenerate can never overwrite them.
// ────────────────────────────────────────────────────────────────────────

/**
 * Save (or clear) a recruiter annotation against a section of the
 * candidate psychology profile. Empty / whitespace `note` clears the
 * entry. The map is keyed by section identifier — the panel decides
 * the keys so the storage shape doesn't dictate the UI layout.
 */
export async function savePsychologyAnnotationAction(
  candidateId: string,
  projectId: string,
  sectionKey: string,
  note: string
): Promise<void> {
  if (!candidateId || !projectId) {
    throw new Error("Missing candidateId or projectId.");
  }
  const key = sectionKey.trim();
  if (!key) throw new Error("Section key is required.");

  await requireActiveUser();
  await assertCandidateBelongsToProject(candidateId, projectId);

  // Read-modify-write the notes map atomically via the RPC. We can't
  // use jsonb_set with a path this dynamic from the client, so we
  // round-trip the whole map — the map is small (≤10 keys) and
  // contention on a single candidate is negligible.
  const supabase = await createServerSupabaseClient();
  const { data: row } = await supabase
    .from("candidates")
    .select("cv_structured")
    .eq("id", candidateId)
    .single<{ cv_structured: unknown }>();

  const current = (row?.cv_structured ?? {}) as Record<string, unknown>;
  const existingNotes =
    (current.psychology_notes as
      | Record<string, { note: string; updated_at: string }>
      | undefined) ?? {};

  const trimmedNote = note.trim();
  let nextNotes: Record<string, { note: string; updated_at: string }>;
  if (trimmedNote.length === 0) {
    const { [key]: _drop, ...rest } = existingNotes;
    void _drop;
    nextNotes = rest;
  } else {
    nextNotes = {
      ...existingNotes,
      [key]: { note: trimmedNote, updated_at: new Date().toISOString() },
    };
  }

  await rpcSetCvField(
    candidateId,
    projectId,
    "psychology_notes",
    Object.keys(nextNotes).length === 0 ? null : nextNotes
  );
  revalidatePath(`/app/projects/${projectId}/candidates/${candidateId}`);
}

/**
 * Toggle a recruiter flag against a single axis of the psychology
 * profile. Flags are a string-array of axis keys; the panel renders
 * an amber border + "Recruiter flagged" label on each.
 */
export async function togglePsychologyFlagAction(
  candidateId: string,
  projectId: string,
  axisKey: string
): Promise<void> {
  if (!candidateId || !projectId) {
    throw new Error("Missing candidateId or projectId.");
  }
  const key = axisKey.trim();
  if (!key) throw new Error("Axis key is required.");

  await requireActiveUser();
  await assertCandidateBelongsToProject(candidateId, projectId);

  const supabase = await createServerSupabaseClient();
  const { data: row } = await supabase
    .from("candidates")
    .select("cv_structured")
    .eq("id", candidateId)
    .single<{ cv_structured: unknown }>();

  const current = (row?.cv_structured ?? {}) as Record<string, unknown>;
  const existing = Array.isArray(current.psychology_flags)
    ? (current.psychology_flags as unknown[]).filter(
        (v): v is string => typeof v === "string"
      )
    : [];

  const next = existing.includes(key)
    ? existing.filter((k) => k !== key)
    : [...existing, key];

  await rpcSetCvField(
    candidateId,
    projectId,
    "psychology_flags",
    next.length === 0 ? null : next
  );
  revalidatePath(`/app/projects/${projectId}/candidates/${candidateId}`);
}

/**
 * Override (or clear) the recruiter's read on a single axis's
 * confidence. Pass `value: null` to clear. Recruiter overrides are
 * stored separately from the AI confidence so the UI can show both.
 */
export async function overridePsychologyConfidenceAction(
  candidateId: string,
  projectId: string,
  axisKey: string,
  value: number | null
): Promise<void> {
  if (!candidateId || !projectId) {
    throw new Error("Missing candidateId or projectId.");
  }
  const key = axisKey.trim();
  if (!key) throw new Error("Axis key is required.");
  if (value !== null) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new Error("Confidence must be a number.");
    }
    if (value < 0 || value > 100) {
      throw new Error("Confidence must be between 0 and 100.");
    }
  }

  await requireActiveUser();
  await assertCandidateBelongsToProject(candidateId, projectId);

  const supabase = await createServerSupabaseClient();
  const { data: row } = await supabase
    .from("candidates")
    .select("cv_structured")
    .eq("id", candidateId)
    .single<{ cv_structured: unknown }>();

  const current = (row?.cv_structured ?? {}) as Record<string, unknown>;
  const existing =
    (current.psychology_confidence_overrides as
      | Record<string, { value: number; updated_at: string }>
      | undefined) ?? {};

  let next: Record<string, { value: number; updated_at: string }>;
  if (value === null) {
    const { [key]: _drop, ...rest } = existing;
    void _drop;
    next = rest;
  } else {
    next = {
      ...existing,
      [key]: {
        value: Math.round(value),
        updated_at: new Date().toISOString(),
      },
    };
  }

  await rpcSetCvField(
    candidateId,
    projectId,
    "psychology_confidence_overrides",
    Object.keys(next).length === 0 ? null : next
  );
  revalidatePath(`/app/projects/${projectId}/candidates/${candidateId}`);
}

// ────────────────────────────────────────────────────────────────────────
// Candidate Web Research Agent — public-presence dossier via web_search
// ────────────────────────────────────────────────────────────────────────

const CANDIDATE_INTELLIGENCE_KEY = "candidate_intelligence" as const;

export async function researchCandidateAction(
  candidateId: string,
  projectId: string
): Promise<CandidateIntelligenceReport> {
  if (!candidateId || !projectId) {
    throw new Error("Missing candidateId or projectId.");
  }

  const auth = await requireActiveUser();
  await assertCandidateBelongsToProject(candidateId, projectId);

  const supabase = await createServerSupabaseClient();
  const [candidateQ, projectQ] = await Promise.all([
    supabase
      .from("candidates")
      .select(
        "id, full_name, current_title, current_company, location, linkedin_url, github_url, website_url, cv_structured"
      )
      .eq("id", candidateId)
      .single<{
        id: string;
        full_name: string;
        current_title: string | null;
        current_company: string | null;
        location: string | null;
        linkedin_url: string | null;
        github_url: string | null;
        website_url: string | null;
        cv_structured: unknown;
      }>(),
    supabase
      .from("projects")
      .select("organization_id")
      .eq("id", projectId)
      .single<{ organization_id: string | null }>(),
  ]);

  if (candidateQ.error || !candidateQ.data) {
    throw new Error("Candidate not found.");
  }
  if (projectQ.error || !projectQ.data) {
    throw new Error("Project not found.");
  }
  if (projectQ.data.organization_id !== auth.organizationId) {
    throw new Error("Project belongs to a different organisation.");
  }

  const c = candidateQ.data;
  const cv = (c.cv_structured ?? {}) as Record<string, unknown>;
  // Trim heavy CV fields before sending — the model needs narrative
  // anchors for identity verification, not the full role history.
  const cv_summary = {
    summary: cv.summary,
    domain: cv.domain,
    scale: cv.scale,
    years_experience: cv.years_experience,
    archetype: cv.archetype,
    tech_exposure: Array.isArray(cv.tech_exposure)
      ? (cv.tech_exposure as unknown[]).slice(0, 8)
      : undefined,
    transformation_experience: Array.isArray(cv.transformation_experience)
      ? (cv.transformation_experience as unknown[]).slice(0, 5)
      : undefined,
  };

  const report = await runCandidateResearch(
    {
      candidate: {
        full_name: c.full_name,
        current_title: c.current_title,
        current_company: c.current_company,
        location: c.location,
        linkedin_url: c.linkedin_url,
        github_url: c.github_url,
        website_url: c.website_url,
        cv_summary,
      },
    },
    {
      projectId,
      candidateId,
      organizationId: projectQ.data.organization_id,
    }
  );

  await rpcSetCvField(
    candidateId,
    projectId,
    CANDIDATE_INTELLIGENCE_KEY,
    report
  );
  revalidatePath(`/app/projects/${projectId}/candidates/${candidateId}`);
  return report;
}

// ────────────────────────────────────────────────────────────────────────
// Triangulation — synthesise Company + HM + Candidate intelligence into
// a decision-grade fit report. Gated on all three base reports existing.
// ────────────────────────────────────────────────────────────────────────

const TRIANGULATION_KEY = "triangulation_report" as const;

export async function generateTriangulationAction(
  candidateId: string,
  projectId: string
): Promise<TriangulationReport> {
  if (!candidateId || !projectId) {
    throw new Error("Missing candidateId or projectId.");
  }

  const auth = await requireActiveUser();
  await assertCandidateBelongsToProject(candidateId, projectId);

  const supabase = await createServerSupabaseClient();
  const [candidateQ, projectQ] = await Promise.all([
    supabase
      .from("candidates")
      .select(
        "id, full_name, current_title, current_company, archetype, cv_structured"
      )
      .eq("id", candidateId)
      .single<{
        id: string;
        full_name: string;
        current_title: string | null;
        current_company: string | null;
        archetype: string | null;
        cv_structured: unknown;
      }>(),
    supabase
      .from("projects")
      .select(
        "organization_id, company_name, calibration_model, company_context"
      )
      .eq("id", projectId)
      .single<{
        organization_id: string | null;
        company_name: string;
        calibration_model: { role_title?: string | null } | null;
        company_context: Record<string, unknown> | null;
      }>(),
  ]);

  if (candidateQ.error || !candidateQ.data) {
    throw new Error("Candidate not found.");
  }
  if (projectQ.error || !projectQ.data) {
    throw new Error("Project not found.");
  }
  if (projectQ.data.organization_id !== auth.organizationId) {
    throw new Error("Project belongs to a different organisation.");
  }

  const cv = (candidateQ.data.cv_structured ?? {}) as Record<string, unknown>;
  const candidateIntelligence = cv[CANDIDATE_INTELLIGENCE_KEY] as
    | CandidateIntelligenceReport
    | undefined;
  const company = (projectQ.data.company_context ?? {}) as Record<
    string,
    unknown
  >;
  const companyIntelligence = company.intelligence_report as
    | CompanyIntelligenceReport
    | undefined;
  const hmIntelligence = company.hm_intelligence as
    | HiringManagerIntelligenceReport
    | undefined;

  const missing: string[] = [];
  if (!companyIntelligence) missing.push("Company Intelligence");
  if (!candidateIntelligence) missing.push("Candidate Intelligence");
  if (!hmIntelligence) missing.push("Hiring Manager Intelligence");
  if (missing.length > 0) {
    throw new Error(
      `Triangulation needs all three base reports first. Missing: ${missing.join(", ")}.`
    );
  }

  const report = await runTriangulation(
    {
      candidate: {
        full_name: candidateQ.data.full_name,
        current_title: candidateQ.data.current_title,
        current_company: candidateQ.data.current_company,
        archetype: candidateQ.data.archetype,
      },
      role: {
        title: projectQ.data.calibration_model?.role_title ?? null,
        company_name: projectQ.data.company_name,
      },
      company_intelligence: companyIntelligence!,
      candidate_intelligence: candidateIntelligence!,
      hm_intelligence: hmIntelligence!,
    },
    {
      projectId,
      candidateId,
      organizationId: projectQ.data.organization_id,
    }
  );

  await rpcSetCvField(candidateId, projectId, TRIANGULATION_KEY, report);
  revalidatePath(`/app/projects/${projectId}/candidates/${candidateId}`);
  return report;
}
