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
import { runAction } from "@/lib/actions/run";
import type { ActionResult } from "@/lib/actions/result";
import { recordActivity } from "@/lib/activity/record";

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

/**
 * Upload a CV file to the cvs storage bucket and parse it via the
 * combined CV-Parsing + Candidate-Review agent. Returns the new
 * candidate's id; the upload form navigates to the profile.
 *
 * Synchronous: the action waits for both upload and Anthropic to land
 * before returning. UI shows a loading state.
 */
export async function uploadAndParseCv(
  formData: FormData
): Promise<ActionResult<{ candidateId: string }>> {
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
    // user can only insert under their own org folder.
    const fileBytes = new Uint8Array(await file.arrayBuffer());
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
        return { candidateId };
      }
      // A real parse failure keeps today's contract: the row carries the
      // error (the seam wrote it) and the recruiter sees the sentence.
      throw new Error(result.reason);
    }

    // userId reserved for a future audit-trail column on candidates.
    void userId;

    // Navigation is the client's job — see submitOnboarding for the
    // revalidate-plus-redirect hang this replaces.
    revalidatePath(`/app/projects/${projectId}/candidates`);
    return { candidateId };
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
