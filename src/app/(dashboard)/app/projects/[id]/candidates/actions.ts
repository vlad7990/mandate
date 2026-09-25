"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { requireActionContext } from "@/lib/auth/access";
import { PDF_MIME, DOCX_MIME } from "@/lib/ai/parse-cv";
import {
  runCvParseAndPersist,
  PARSER_UNAVAILABLE_MESSAGE,
} from "@/lib/candidates/agent-parser";
import {
  PIPELINE_STAGES,
  type PipelineStage,
} from "@/lib/ai/cv-parsing";
import type { CalibrationModel, CompanyContext } from "@/lib/ai/role-analysis";
import { assertCalibrationMatchesSpec } from "@/lib/calibration/spec-drift";
import { runAction } from "@/lib/actions/run";
import type { ActionResult } from "@/lib/actions/result";
import { recordActivity } from "@/lib/activity/record";
import {
  sha256Hex,
  matchFile,
  classifyAgainstMandate,
  describeSkippedFile,
  describeDiscard,
  describeAmbiguous,
  describeOtherMandate,
  type PoolCandidate,
  type UploadReport,
} from "@/lib/candidates/dedupe";

/** Sentence subject for a failure this file did not author. See `runAction`. */
const SUBJECT = "The candidate update";

const PIPELINE_VALUES = PIPELINE_STAGES as readonly string[];

type AuthContext = {
  userId: string;
  organizationId: string;
};

async function requireAuth(): Promise<AuthContext> {
  return requireActionContext("candidates:write");
}

const ACCEPTED_MIME_TYPES = new Set([PDF_MIME, DOCX_MIME]);
const MAX_FILE_BYTES = 10 * 1024 * 1024; // mirrors the bucket's file_size_limit

/** The columns both dedupe checks read. One shape, one select list. */
const POOL_COLUMNS =
  "id, project_id, full_name, email, linkedin_url, current_company, pipeline_stage";

export type UploadAndParseResult = UploadReport & {
  /**
   * The row that now represents this person in this mandate — the new one
   * when the parse stood, the SURVIVING one when the upload was skipped or
   * discarded. The single-file form navigates here, so a recruiter whose
   * duplicate was dropped lands on the real record rather than a 404.
   */
  candidateId: string;
};

/**
 * Upload a CV file to the cvs storage bucket and parse it via the
 * combined CV-Parsing + Candidate-Review agent. Returns the candidate's
 * id and what happened to the upload.
 *
 * Synchronous: the action waits for both upload and Anthropic to land
 * before returning. UI shows a loading state.
 *
 * ## Dedupe (141, gate 2026-09-25)
 *
 * Two checks, because identity is only known after the parse:
 *
 * · BEFORE anything is created — the SHA-256 of the bytes. A byte-identical
 *   file already in this mandate is refused with nothing spent, no row and
 *   no stored object, in the same place §177's spec-drift door sits and for
 *   the same reason. The same file in ANOTHER mandate is reported and
 *   parsed anyway (D4) — that is reuse, not duplication.
 *
 * · AFTER the parse — `identityKey` against the rest of this mandate. A
 *   STRONG match (email or LinkedIn) discards the row that was just made
 *   (D2); a name|company-only match keeps both rows and flags one for a
 *   human (D3), because two people really do share a name at one employer.
 */
export async function uploadAndParseCv(
  formData: FormData
): Promise<ActionResult<UploadAndParseResult>> {
  return runAction(SUBJECT, async () => {
    const projectId = String(formData.get("projectId") ?? "");
    const file = formData.get("cv");
    if (!projectId) throw new Error("Missing projectId.");
    if (!(file instanceof File)) throw new Error("Missing CV file.");

    if (!ACCEPTED_MIME_TYPES.has(file.type)) {
      throw new Error(
        `Unsupported file type: ${file.type || "unknown"}. Upload a PDF or DOCX.`
      );
    }
    if (file.size > MAX_FILE_BYTES) {
      throw new Error(
        `File is ${(file.size / 1024 / 1024).toFixed(1)}MB; maximum is 10MB.`
      );
    }
    if (file.size === 0) {
      throw new Error("File is empty.");
    }

    const { userId, organizationId } = await requireAuth();
    const supabase = await createServerSupabaseClient();

    // Pull the project's calibration / company context so the parser can
    // produce a fit-vs-role analysis in the same call.
    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("id, calibration_model, company_context")
      .eq("id", projectId)
      .single<{
        id: string;
        calibration_model: Partial<CalibrationModel> | null;
        company_context: Partial<CompanyContext> | null;
      }>();

    if (projectError || !project) {
      throw new Error(
        `Failed to load project for parsing: ${projectError?.message ?? "not found"}`
      );
    }

    // §177 (F-A) — the role seam's door, BEFORE anything is created.
    // A refusal must leave no placeholder row and no uploaded bytes
    // behind, so it sits above the insert rather than beside the parse.
    await assertCalibrationMatchesSpec(
      supabase,
      projectId,
      project.calibration_model
    );

    // 141 — the file's own identity, computed from the bytes the SERVER
    // received. The bulk-intake form hashes in the browser too, to skip
    // repeats inside one batch, but that hash is never sent and never
    // trusted: this is the one that decides anything.
    const fileBytes = new Uint8Array(await file.arrayBuffer());
    const fileHash = await sha256Hex(fileBytes);

    const { data: sameFileRows } = await supabase
      .from("candidates")
      .select(POOL_COLUMNS)
      .eq("organization_id", organizationId)
      .eq("cv_sha256", fileHash);

    const fileMatch = matchFile(
      projectId,
      (sameFileRows ?? []) as PoolCandidate[]
    );

    // D1's cheap half. Certain — the same bytes are the same document —
    // and it refuses BEFORE the row and the object exist, so a skipped
    // file leaves nothing behind and costs nothing.
    if (fileMatch.kind === "same_mandate") {
      return {
        candidateId: fileMatch.candidateId,
        outcome: "same_file_skipped",
        message: describeSkippedFile(fileMatch.label),
        ambiguousOf: null,
      };
    }

    // D4: the same file under another mandate is a FACT, not a refusal.
    // Refusing would block a legitimate second search and would save
    // nothing anyway — reuse re-parses against the target's calibration
    // regardless, so the second parse buys a verdict, it is not waste.
    const otherMandateNote =
      fileMatch.kind === "other_mandate"
        ? describeOtherMandate(fileMatch.label)
        : null;

    // Insert the candidate row first so we have an id for the storage path
    // and so the candidate appears in the list (cv_processing=true) while
    // the AI call runs. cv_url is filled in once upload completes.
    const fallbackName = file.name.replace(/\.(pdf|docx)$/i, "").trim() || "Untitled candidate";

    const { data: candidate, error: insertError } = await supabase
      .from("candidates")
      .insert({
        organization_id: organizationId,
        project_id: projectId,
        full_name: fallbackName,
        pipeline_stage: "found",
        cv_processing: true,
        source: "upload",
        // §200 — who brought this person in. Scopes the reuse agent's
        // trawl and nothing else; it never narrows who may read the row.
        created_by: userId,
        // 141 — recorded on the row that is about to hold this file, so
        // the NEXT upload of the same document can be refused for free.
        cv_sha256: fileHash,
      })
      .select("id")
      .single<{ id: string }>();

    if (insertError || !candidate) {
      throw new Error(
        `Failed to create candidate placeholder: ${insertError?.message ?? "no row"}`
      );
    }

    const candidateId = candidate.id;
    const ext = file.type === PDF_MIME ? "pdf" : "docx";
    const storagePath = `${organizationId}/${projectId}/${candidateId}/cv.${ext}`;

    // Upload to storage. RLS on storage.objects scopes to {org}/... so the
    // user can only insert under their own org folder. (The bytes were
    // already read above, to hash them before anything was created.)
    const { error: uploadError } = await supabase.storage
      .from("cvs")
      .upload(storagePath, fileBytes, {
        contentType: file.type,
        upsert: true,
      });

    if (uploadError) {
      await markCandidateFailed(candidateId, `Upload failed: ${uploadError.message}`);
      throw new Error(`Upload failed: ${uploadError.message}`);
    }

    // The judgment runs as the CV PARSING AGENT (076): the model call
    // and the persistence of what it concluded — profile, fit, the
    // identity columns — under the agent's own session and trail name.
    // The recruiter's acts end here: the file is chosen, the row
    // exists, the bytes are stored.
    const result = await runCvParseAndPersist({
      candidateId,
      projectId,
      organizationId,
      fileBytes,
      mimeType: file.type,
      cvPath: storagePath,
      calibration: project.calibration_model ?? {},
      company: project.company_context ?? {},
      trigger: "upload",
      priorName: fallbackName,
    });

    if (!result.ok) {
      if (result.kind === "agent_unavailable") {
        // D5: the upload SUCCEEDS — the file and the row stand; the
        // profile says why it is empty, in the agent's name, and the
        // candidate page's failure affordance offers the retry. Written
        // here under the recruiter's session because the refused agent
        // has none. cv_url is recorded too — the file IS stored, and
        // the Retry Parse button keys on the row knowing where (found
        // live in the evaluator drive: without it the banner promised a
        // retry while hiding the button, the §35 gap reopened one door
        // down).
        await supabase
          .from("candidates")
          .update({
            cv_url: storagePath,
            cv_processing: false,
            cv_parse_error: PARSER_UNAVAILABLE_MESSAGE,
            updated_at: new Date().toISOString(),
          })
          .eq("id", candidateId);
        revalidatePath(`/app/projects/${projectId}/candidates`);
        // No identity was ever read, so there is nothing to compare. The
        // row stands unjudged rather than being guessed at — §139's rule
        // one door down.
        return {
          candidateId,
          outcome: "parsed" as const,
          message: otherMandateNote,
          ambiguousOf: null,
        };
      }
      // A real parse failure keeps today's contract: the row carries the
      // error and the recruiter sees the sentence. Written here as well as
      // in the seam because the agent's own failure write can itself land
      // zero rows (§128 F-1) — the recruiter's session always reaches this
      // row, so the retry affordance never silently vanishes.
      await markCandidateFailed(candidateId, result.reason);
      throw new Error(result.reason);
    }

    // -----------------------------------------------------------------
    // 141 — D1's second half: now we know who this is.
    // -----------------------------------------------------------------
    //
    // The parser has written the identity columns, which means the
    // 098/139 trigger has ALREADY resolved this row's person and filled
    // `network_profile_id`. Nothing below re-derives identity; it reads
    // what the parse produced and asks the one question the database
    // does not answer on its own — is this person twice in THIS mandate.
    const { data: parsedRow } = await supabase
      .from("candidates")
      .select("full_name, email, linkedin_url, current_company")
      .eq("id", candidateId)
      .single<{
        full_name: string;
        email: string | null;
        linkedin_url: string | null;
        current_company: string | null;
      }>();

    if (!parsedRow) {
      // The row was read back as nothing. That is a fact about our read,
      // not about the candidate, so nothing is discarded on the strength
      // of it — the parse stands.
      revalidatePath(`/app/projects/${projectId}/candidates`);
      return {
        candidateId,
        outcome: "parsed" as const,
        message: otherMandateNote,
        ambiguousOf: null,
      };
    }

    const { data: othersHere } = await supabase
      .from("candidates")
      .select(POOL_COLUMNS)
      .eq("project_id", projectId)
      .neq("id", candidateId);

    const person = classifyAgainstMandate(
      parsedRow,
      (othersHere ?? []) as PoolCandidate[]
    );

    // D2 — a strong match. The existing row carries the recruiter's work;
    // this one carries a fresh parse and nothing else. So this one goes,
    // and the sentence says BOTH halves: which record survived, and that
    // the file just uploaded was not kept. Silently dropping a document
    // somebody chose is the failure this refuses to commit.
    if (person.kind === "duplicate") {
      // The object first. If the row went first and this failed, the
      // surviving pointer would be to bytes that are gone, which is the
      // worse of the two half-states. Storage deletes are API-only.
      const { error: removeError } = await supabase.storage
        .from("cvs")
        .remove([storagePath]);
      if (removeError) {
        console.error(
          "[candidates/actions] duplicate discard left its object behind",
          removeError.message
        );
      }

      const { error: deleteError } = await supabase
        .from("candidates")
        .delete()
        .eq("id", candidateId);

      if (deleteError) {
        // The discard failed. Do NOT claim it happened — fall through to
        // the flag, so the recruiter gets a row they can see and act on
        // rather than a sentence about a deletion that did not occur.
        await supabase
          .from("candidates")
          .update({
            identity_review_of: person.candidateId,
            identity_review_label: person.label,
            identity_review_at: new Date().toISOString(),
          })
          .eq("id", candidateId);
        revalidatePath(`/app/projects/${projectId}/candidates`);
        return {
          candidateId,
          outcome: "parsed" as const,
          message: `${person.label} is already in this mandate, but the duplicate record could not be removed: ${deleteError.message}. Both records are here.`,
          ambiguousOf: { candidateId: person.candidateId, label: person.label },
        };
      }

      // ⚠️ The event hangs off the SURVIVING row. `candidate_id` is ON
      // DELETE CASCADE (053), so an event naming the row we just deleted
      // would be deleted by the act it exists to record.
      await recordActivity(supabase, {
        eventType: "candidate_duplicate_discarded",
        projectId,
        candidateId: person.candidateId,
        detail: {
          file_name: file.name,
          matched_on: person.matchedOn,
        },
      });

      revalidatePath(`/app/projects/${projectId}/candidates`);
      return {
        candidateId: person.candidateId,
        outcome: "duplicate_discarded" as const,
        message: describeDiscard(person.label, person.matchedOn, person.stage),
        ambiguousOf: null,
      };
    }

    // D3 — name and employer only, on both sides. Two people really do
    // share a name at one large employer, so both rows stand and the new
    // one carries a flag. Nobody is merged and nothing is deleted on a
    // heuristic; that is §175's defect class, and the importer already
    // rules this way for exactly the same reason.
    if (person.kind === "ambiguous") {
      await supabase
        .from("candidates")
        .update({
          identity_review_of: person.candidateId,
          identity_review_label: person.label,
          identity_review_at: new Date().toISOString(),
        })
        .eq("id", candidateId);

      revalidatePath(`/app/projects/${projectId}/candidates`);
      return {
        candidateId,
        outcome: "parsed" as const,
        message: describeAmbiguous(person.label),
        ambiguousOf: { candidateId: person.candidateId, label: person.label },
      };
    }

    // Navigation is the client's job — see submitOnboarding for the
    // revalidate-plus-redirect hang this replaces.
    revalidatePath(`/app/projects/${projectId}/candidates`);
    return {
      candidateId,
      outcome: "parsed" as const,
      message: otherMandateNote,
      ambiguousOf: null,
    };
  });
}

async function markCandidateFailed(
  candidateId: string,
  errorMessage: string
): Promise<void> {
  try {
    const supabase = await createServerSupabaseClient();
    await supabase
      .from("candidates")
      .update({
        cv_processing: false,
        cv_parse_error: errorMessage,
        updated_at: new Date().toISOString(),
      })
      .eq("id", candidateId);
  } catch (err) {
    console.error(
      "[candidates/actions] failed to mark candidate as failed",
      err
    );
  }
}

/**
 * Move a candidate through the recruiter's pipeline. Validates against
 * the schema's CHECK constraint values to avoid round-trip rejections.
 *
 * 104: the move writes its own trail row — stages only ({from, to}),
 * never free text. The prior stage is read first so the event can say
 * where the candidate came from; a no-op move records nothing.
 */
export async function updatePipelineStage(
  candidateId: string,
  projectId: string,
  stage: PipelineStage
): Promise<ActionResult> {
  return runAction(SUBJECT, async () => {
    await requireAuth();
    if (!PIPELINE_VALUES.includes(stage)) {
      throw new Error(`Invalid pipeline stage: ${stage}`);
    }

    const supabase = await createServerSupabaseClient();
    const { data: prior } = await supabase
      .from("candidates")
      .select("pipeline_stage")
      .eq("id", candidateId)
      .eq("project_id", projectId)
      .maybeSingle<{ pipeline_stage: string | null }>();
    const from = prior?.pipeline_stage ?? "found";

    const { error } = await supabase
      .from("candidates")
      .update({
        pipeline_stage: stage,
        updated_at: new Date().toISOString(),
      })
      .eq("id", candidateId)
      .eq("project_id", projectId);

    if (error) {
      throw new Error(`Failed to update pipeline stage: ${error.message}`);
    }

    if (from !== stage) {
      await recordActivity(supabase, {
        eventType: "candidate_stage_changed",
        projectId,
        candidateId,
        detail: { from, to: stage },
      });
    }

    revalidatePath(`/app/projects/${projectId}/candidates`);
    revalidatePath(`/app/projects/${projectId}/candidates/${candidateId}`);
    revalidatePath(`/app/projects/${projectId}/pipeline`);
  });
}
