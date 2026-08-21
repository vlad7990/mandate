"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { requireActionContext } from "@/lib/auth/access";
import {
  EVALUATION_KEY,
  ensureCandidateEvaluation,
} from "@/lib/ai/generate-evaluation";
import { runCvParseAndPersist } from "@/lib/candidates/agent-parser";
import {
  normaliseDimensionNotes,
  PRESENT_DECISIONS,
  RECRUITER_TIERS,
  type DimensionNotes,
  type PresentDecision,
  type RecruiterAssessment,
} from "@/lib/recruiter-assessment";
import type { Tier } from "@/lib/ranking/tiers";
import { runPositioningAndPersist } from "@/lib/ai/run-positioning";
import type { PositioningResult } from "@/lib/ai/positioning-agent";
import { runCandidateResearchAndPersist } from "@/lib/ai/run-candidate-research";
import type { CandidateIntelligenceReport } from "@/lib/ai/candidate-research-agent";
import type { CandidatePsychology } from "@/lib/ai/psychology-agent";
import { runTriangulationAndPersist } from "@/lib/ai/run-triangulation";
import type { TriangulationReport } from "@/lib/ai/triangulation-agent";
import { runAction } from "@/lib/actions/run";
import type { ActionResult } from "@/lib/actions/result";

/** Sentence subject for a failure this file did not author. See `runAction`. */
const SUBJECT = "The candidate workspace";

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
  return requireActionContext("candidates:write");
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
// Parse retry
// ────────────────────────────────────────────────────────────────────────

/**
 * Re-run the CV parse from the STORED file — the §36-accepted follow-up
 * to the parser slice's D5: the failure banner's sentence promised a
 * retry, and this is the retry. The recruiter's session does what is
 * lawfully the recruiter's — reading their org's stored CV bytes — and
 * hands them to the CV Parsing Agent's seam, exactly like the upload
 * path. No re-upload, no storage reach for the agent.
 */
export async function retryParseAction(
  candidateId: string,
  projectId: string
): Promise<ActionResult> {
  return runAction(SUBJECT, async () => {
    if (!candidateId || !projectId) {
      throw new Error("Missing candidateId or projectId.");
    }
    const { organizationId } = await requireActiveUser();
    await assertCandidateBelongsToProject(candidateId, projectId);

    const supabase = await createServerSupabaseClient();
    const { data: candidate, error: cErr } = await supabase
      .from("candidates")
      .select("id, full_name, cv_url")
      .eq("id", candidateId)
      .single<{ id: string; full_name: string; cv_url: string | null }>();
    if (cErr || !candidate) throw new Error("Candidate not found.");
    if (!candidate.cv_url) {
      throw new Error("No stored CV file to retry from — upload one instead.");
    }

    const { data: project, error: pErr } = await supabase
      .from("projects")
      .select("calibration_model, company_context")
      .eq("id", projectId)
      .single<{
        calibration_model: Record<string, unknown> | null;
        company_context: Record<string, unknown> | null;
      }>();
    if (pErr || !project) throw new Error("Project not found.");

    const { data: blob, error: dlErr } = await supabase.storage
      .from("cvs")
      .download(candidate.cv_url);
    if (dlErr || !blob) {
      throw new Error(
        `Could not read the stored CV: ${dlErr?.message ?? "no file"}`
      );
    }

    const mimeType = candidate.cv_url.toLowerCase().endsWith(".pdf")
      ? "application/pdf"
      : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

    const result = await runCvParseAndPersist({
      candidateId,
      projectId,
      organizationId,
      fileBytes: new Uint8Array(await blob.arrayBuffer()),
      mimeType,
      cvPath: candidate.cv_url,
      calibration: project.calibration_model ?? {},
      company: project.company_context ?? {},
      trigger: "retry",
      priorName: candidate.full_name,
    });

    if (!result.ok) {
      // Either way the row already carries the honest state; the toast
      // carries the sentence.
      throw new Error(
        result.kind === "agent_unavailable"
          ? "The CV Parsing Agent is still unavailable — an operator has " +
            "suspended it or its credentials are absent. The file is stored; " +
            "retry when it is restored."
          : result.reason
      );
    }

    revalidatePath(`/app/projects/${projectId}/candidates/${candidateId}`);
    revalidatePath(`/app/projects/${projectId}/candidates`);
  });
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
): Promise<ActionResult> {
  return runAction(SUBJECT, async () => {
    if (!candidateId || !projectId) {
      throw new Error("Missing candidateId or projectId.");
    }

    await requireActiveUser();
    await assertCandidateBelongsToProject(candidateId, projectId);

    // No pre-clear (077, D5): the old evaluation stands until the
    // moment the Evaluation Agent's single spread-preserving write
    // replaces it — a refused or failed regenerate destroys nothing.
    // (The pre-clear this action used to run existed for a stale-revive
    // race that only a deleted key could lose; with no deletion, there
    // is no race.)
    const result = await ensureCandidateEvaluation(candidateId, projectId, {
      force: true,
      trigger: "regenerate",
    });

    if (result.status === "agent_unavailable") {
      throw new Error(
        "The Evaluation Agent could not run — an operator has suspended it " +
          "or its credentials are absent. The existing report stands."
      );
    }
    if (result.status !== "ready") {
      throw new Error("Could not generate evaluation. Try again.");
    }

    revalidatePath(`/app/projects/${projectId}/candidates/${candidateId}`);
  });
}

/**
 * The regenerate poll's read half. A ~90s regenerate can outlive the
 * browser's fetch — the POST dies with "Failed to fetch" while the
 * server finishes and lands the write (§37, observed live on the
 * restore act). A dead fetch proves nothing about the outcome; this
 * stamp does. The client compares it against the report it was looking
 * at when it clicked.
 */
export async function evaluationStampAction(
  candidateId: string,
  projectId: string
): Promise<ActionResult<string | null>> {
  return runAction(SUBJECT, async () => {
    if (!candidateId || !projectId) {
      throw new Error("Missing candidateId or projectId.");
    }

    await requireActiveUser();
    await assertCandidateBelongsToProject(candidateId, projectId);

    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from("candidates")
      .select("cv_structured")
      .eq("id", candidateId)
      .single<{ cv_structured: Record<string, unknown> | null }>();
    if (error || !data) throw new Error("Candidate not found.");

    const evaluation = (data.cv_structured ?? {})[EVALUATION_KEY];
    const stamp =
      evaluation && typeof evaluation === "object"
        ? (evaluation as { generated_at?: unknown }).generated_at
        : null;
    return typeof stamp === "string" ? stamp : null;
  });
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
): Promise<ActionResult<{ value: string | null }>> {
  return runAction(SUBJECT, async () => {
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
  });
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
): Promise<ActionResult> {
  return runAction(SUBJECT, async () => {
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
  });
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
): Promise<ActionResult> {
  return runAction(SUBJECT, async () => {
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
  });
}

// ────────────────────────────────────────────────────────────────────────
// Positioning Agent — generate 3 pitches + 3 email templates
// ────────────────────────────────────────────────────────────────────────

/**
 * Run the Positioning Agent for this candidate against this role. The
 * recruiter's session keeps the gate and the ownership assertion; the
 * judgment — reads, model call, the positioning_kit write, the trail
 * event — runs under the AGENT's own session (078). Returns the
 * generated artefacts so the panel can render them immediately without
 * a re-fetch.
 */
export async function generatePositioningAction(
  candidateId: string,
  projectId: string
): Promise<ActionResult<PositioningResult>> {
  return runAction(SUBJECT, async () => {
    if (!candidateId || !projectId) {
      throw new Error("Missing candidateId or projectId.");
    }

    await requireActiveUser();
    await assertCandidateBelongsToProject(candidateId, projectId);

    const run = await runPositioningAndPersist(candidateId, projectId);

    if (run.status === "agent_unavailable") {
      throw new Error(
        "The Positioning Agent could not run — an operator has suspended it " +
          "or its credentials are absent. The existing kit stands."
      );
    }
    if (run.status === "unavailable") {
      throw new Error("Candidate not found.");
    }
    if (run.status !== "ready") {
      throw new Error("Could not generate the positioning kit. Try again.");
    }

    revalidatePath(`/app/projects/${projectId}/candidates/${candidateId}`);
    return run.result;
  });
}

// ────────────────────────────────────────────────────────────────────────
// Psychology Agent — generate behavioural / cultural-fit profile
// ────────────────────────────────────────────────────────────────────────

/**
 * Run the Psychology Agent for this candidate. The recruiter's
 * session keeps the gate, the ownership assertion, and hands the
 * optional recruiterContext through; the judgment — reads (including
 * the SELECT-only notes grant), the context-wrapped model call, the
 * psychology + psychology_context writes, the trail event — runs
 * under the AGENT's own session (081).
 */
export async function generatePsychologyAction(
  candidateId: string,
  projectId: string,
  recruiterContext?: string
): Promise<ActionResult<CandidatePsychology>> {
  return runAction(SUBJECT, async () => {
    if (!candidateId || !projectId) {
      throw new Error("Missing candidateId or projectId.");
    }

    await requireActiveUser();
    await assertCandidateBelongsToProject(candidateId, projectId);

    const { runPsychologyAndPersist } = await import("@/lib/ai/run-psychology");
    const run = await runPsychologyAndPersist(
      candidateId,
      projectId,
      recruiterContext
    );

    if (run.status === "agent_unavailable") {
      throw new Error(
        "The Psychology Agent could not run — an operator has suspended it " +
          "or its credentials are absent. The existing profile stands."
      );
    }
    if (run.status === "unavailable") {
      throw new Error("Candidate not found.");
    }
    if (run.status !== "ready") {
      throw new Error("Could not generate the behavioural read. Try again.");
    }

    revalidatePath(`/app/projects/${projectId}/candidates/${candidateId}`);
    return run.profile;
  });
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
): Promise<ActionResult> {
  return runAction(SUBJECT, async () => {
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
  });
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
): Promise<ActionResult> {
  return runAction(SUBJECT, async () => {
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
  });
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
): Promise<ActionResult> {
  return runAction(SUBJECT, async () => {
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
  });
}

// ────────────────────────────────────────────────────────────────────────
// Candidate Web Research Agent — public-presence dossier via web_search
// ────────────────────────────────────────────────────────────────────────

/**
 * Run the Candidate Research Agent for this candidate. The recruiter's
 * session keeps the gate and the ownership assertion; the judgment —
 * reads, the web-searching model call, the candidate_intelligence
 * write, the trail event — runs under the AGENT's own session (079).
 */
export async function researchCandidateAction(
  candidateId: string,
  projectId: string
): Promise<ActionResult<CandidateIntelligenceReport>> {
  return runAction(SUBJECT, async () => {
    if (!candidateId || !projectId) {
      throw new Error("Missing candidateId or projectId.");
    }

    await requireActiveUser();
    await assertCandidateBelongsToProject(candidateId, projectId);

    const run = await runCandidateResearchAndPersist(candidateId, projectId);

    if (run.status === "agent_unavailable") {
      throw new Error(
        "The Candidate Research Agent could not run — an operator has " +
          "suspended it or its credentials are absent. The existing dossier " +
          "stands."
      );
    }
    if (run.status === "unavailable") {
      throw new Error("Candidate not found.");
    }
    if (run.status !== "ready") {
      throw new Error("Could not research the candidate. Try again.");
    }

    revalidatePath(`/app/projects/${projectId}/candidates/${candidateId}`);
    return run.report;
  });
}

// ────────────────────────────────────────────────────────────────────────
// Triangulation — synthesise Company + HM + Candidate intelligence into
// a decision-grade fit report. Gated on all three base reports existing.
// ────────────────────────────────────────────────────────────────────────

/**
 * Run the Triangulation Agent for this candidate. The recruiter's
 * session keeps the gate and the ownership assertion; the judgment —
 * reads, readiness check, synthesis, the triangulation_report write,
 * the trail event — runs under the AGENT's own session (080). The
 * missing-reports refusal is a human-facing precondition and keeps
 * today's exact sentence.
 */
export async function generateTriangulationAction(
  candidateId: string,
  projectId: string
): Promise<ActionResult<TriangulationReport>> {
  return runAction(SUBJECT, async () => {
    if (!candidateId || !projectId) {
      throw new Error("Missing candidateId or projectId.");
    }

    await requireActiveUser();
    await assertCandidateBelongsToProject(candidateId, projectId);

    const run = await runTriangulationAndPersist(candidateId, projectId);

    if (run.status === "agent_unavailable") {
      throw new Error(
        "The Triangulation Agent could not run — an operator has suspended " +
          "it or its credentials are absent. The existing report stands."
      );
    }
    if (run.status === "missing_inputs") {
      throw new Error(
        `Triangulation needs all three base reports first. Missing: ${run.missing.join(", ")}.`
      );
    }
    if (run.status === "unavailable") {
      throw new Error("Candidate not found.");
    }
    if (run.status !== "ready") {
      throw new Error("Could not generate the triangulation report. Try again.");
    }

    revalidatePath(`/app/projects/${projectId}/candidates/${candidateId}`);
    return run.report;
  });
}
