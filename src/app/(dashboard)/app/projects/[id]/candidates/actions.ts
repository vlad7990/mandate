"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { requireActionContext } from "@/lib/auth/access";
import { parseCv, PDF_MIME, DOCX_MIME } from "@/lib/ai/parse-cv";
import {
  PIPELINE_STAGES,
  type CandidateProfile,
  type PipelineStage,
} from "@/lib/ai/cv-parsing";
import type { CalibrationModel, CompanyContext } from "@/lib/ai/role-analysis";

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
 * combined CV-Parsing + Candidate-Review agent. Returns nothing —
 * redirects to the new candidate's profile on success.
 *
 * Synchronous: the action waits for both upload and Anthropic to land
 * before redirecting. Parse takes ~5–10s; UI shows a loading state.
 */
export async function uploadAndParseCv(formData: FormData): Promise<void> {
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

  // Parse — wrap in try/finally so cv_processing always clears.
  let parsed: CandidateProfile;
  try {
    parsed = await parseCv(fileBytes, file.type, {
      calibration: project.calibration_model ?? {},
      company: project.company_context ?? {},
      projectId,
      organizationId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "CV parsing failed.";
    await markCandidateFailed(candidateId, message);
    throw new Error(message);
  }

  // Persist parsed profile + typed columns.
  const { error: updateError } = await supabase
    .from("candidates")
    .update({
      cv_url: storagePath,
      full_name: parsed.full_name || fallbackName,
      email: parsed.email,
      linkedin_url: parsed.linkedin_url,
      current_title: parsed.current_title,
      current_company: parsed.current_company,
      archetype: parsed.archetype,
      cv_structured: parsed,
      cv_processing: false,
      cv_parse_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", candidateId);

  if (updateError) {
    await markCandidateFailed(
      candidateId,
      `Failed to persist parsed profile: ${updateError.message}`
    );
    throw new Error(`Failed to persist parsed profile: ${updateError.message}`);
  }

  // userId reserved for a future audit-trail column on candidates.
  void userId;

  revalidatePath(`/app/projects/${projectId}/candidates`);
  redirect(`/app/projects/${projectId}/candidates/${candidateId}`);
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
 */
export async function updatePipelineStage(
  candidateId: string,
  projectId: string,
  stage: PipelineStage
): Promise<void> {
  await requireAuth();
  if (!PIPELINE_VALUES.includes(stage)) {
    throw new Error(`Invalid pipeline stage: ${stage}`);
  }

  const supabase = await createServerSupabaseClient();
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

  revalidatePath(`/app/projects/${projectId}/candidates`);
  revalidatePath(`/app/projects/${projectId}/candidates/${candidateId}`);
}
