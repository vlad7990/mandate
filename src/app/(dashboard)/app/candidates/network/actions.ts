"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { requireActionContext } from "@/lib/auth/access";
import { parseCv, PDF_MIME, DOCX_MIME } from "@/lib/ai/parse-cv";
import type { CandidateProfile } from "@/lib/ai/cv-parsing";
import {
  type CalibrationModel,
  type CompanyContext,
} from "@/lib/ai/role-analysis";
import { runRankerScoring } from "@/lib/ranking/agent-ranker";
import { runAction } from "@/lib/actions/run";
import type { ActionResult } from "@/lib/actions/result";

/** Sentence subject for a failure this file did not author. See `runAction`. */
const SUBJECT = "The candidate copy";

type AuthContext = {
  userId: string;
  organizationId: string;
};

async function requireActiveUser(): Promise<AuthContext> {
  return requireActionContext("candidates:write");
}

/**
 * Copy a candidate from any project in the org into a target project.
 * Creates a brand-new candidate row in the target project, copies the
 * CV file in storage so deletes on the source don't break the target,
 * and schedules an `after()` re-parse so fit_dimensions calibrate
 * against the target project's weights and company context.
 *
 * The source candidate row is left untouched. The target project
 * acquires a new candidate id; this is intentional — each
 * (project, person) pair tracks its own pipeline stage, score, and
 * recruiter assessment.
 */
export async function addPersonToProjectAction(
  sourceCandidateId: string,
  targetProjectId: string
): Promise<ActionResult<{ candidateId: string }>> {
  return runAction(SUBJECT, async () => {
    if (!sourceCandidateId || !targetProjectId) {
      throw new Error("Missing source candidate or target project.");
    }

    const auth = await requireActiveUser();
    const supabase = await createServerSupabaseClient();

    const [sourceQ, targetQ] = await Promise.all([
      supabase
        .from("candidates")
        .select(
          "id, project_id, full_name, email, linkedin_url, twitter_url, github_url, website_url, phone, location, current_title, current_company, archetype, cv_url, cv_structured"
        )
        .eq("id", sourceCandidateId)
        .single<{
          id: string;
          project_id: string | null;
          full_name: string;
          email: string | null;
          linkedin_url: string | null;
          twitter_url: string | null;
          github_url: string | null;
          website_url: string | null;
          phone: string | null;
          location: string | null;
          current_title: string | null;
          current_company: string | null;
          archetype: string | null;
          cv_url: string | null;
          cv_structured: unknown;
        }>(),
      supabase
        .from("projects")
        .select("id, organization_id, calibration_model, company_context")
        .eq("id", targetProjectId)
        .single<{
          id: string;
          organization_id: string | null;
          calibration_model: Partial<CalibrationModel> | null;
          company_context: Partial<CompanyContext> | null;
        }>(),
    ]);

    if (sourceQ.error || !sourceQ.data) {
      throw new Error("Source candidate not found.");
    }
    if (targetQ.error || !targetQ.data) {
      throw new Error("Target project not found.");
    }
    const source = sourceQ.data;
    const target = targetQ.data;

    if (target.organization_id !== auth.organizationId) {
      throw new Error("Target project belongs to a different organisation.");
    }

    // Reject when the same person is already in this project. Identity
    // proxy mirrors the network aggregator: email > linkedin > name.
    const dupKey = identityKey(source);
    const { data: existingRows } = await supabase
      .from("candidates")
      .select("id, full_name, email, linkedin_url, current_company")
      .eq("project_id", targetProjectId);
    type ExistingRow = {
      id: string;
      full_name: string;
      email: string | null;
      linkedin_url: string | null;
      current_company: string | null;
    };
    const dup = ((existingRows ?? []) as ExistingRow[]).find(
      (r) => identityKey(r) === dupKey
    );
    if (dup) {
      throw new Error(
        `${source.full_name} is already in this project (existing row ${dup.id}).`
      );
    }

    // Strip project-specific overlays from cv_structured before copying
    // — evaluation, positioning_kit, psychology, recruiter notes etc.
    // are calibrated against the source project. fit_dimensions stays
    // as a starting estimate; the after() re-parse overwrites it with
    // values calibrated to the target.
    const sourceCv = (source.cv_structured ?? {}) as Record<string, unknown>;
    const cleanCv: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(sourceCv)) {
      if (
        k === "evaluation" ||
        k === "positioning_kit" ||
        k === "psychology" ||
        k === "psychology_notes" ||
        k === "psychology_flags" ||
        k === "psychology_confidence_overrides" ||
        k === "psychology_context"
      ) {
        continue;
      }
      cleanCv[k] = v;
    }

    // Create the new candidate row. cv_processing=true so the profile
    // page and ranking views show a "parse in flight" placeholder until
    // the after() re-parse lands.
    const { data: inserted, error: insertErr } = await supabase
      .from("candidates")
      .insert({
        organization_id: auth.organizationId,
        project_id: targetProjectId,
        full_name: source.full_name,
        email: source.email,
        linkedin_url: source.linkedin_url,
        twitter_url: source.twitter_url,
        github_url: source.github_url,
        website_url: source.website_url,
        phone: source.phone,
        location: source.location,
        current_title: source.current_title,
        current_company: source.current_company,
        archetype: source.archetype,
        pipeline_stage: "found",
        cv_url: null,
        cv_structured: cleanCv,
        cv_processing: !!source.cv_url,
        source: "network_copy",
      })
      .select("id")
      .single<{ id: string }>();

    if (insertErr || !inserted) {
      throw new Error(
        `Failed to copy candidate: ${insertErr?.message ?? "no row"}`
      );
    }

    // Copy the CV file into the target project's path so the new
    // candidate owns its own copy. After this lands the after()
    // callback re-parses against the target's calibration.
    if (source.cv_url) {
      after(async () => {
        try {
          await replicateCvAndReparse({
            organizationId: auth.organizationId,
            newCandidateId: inserted.id,
            targetProjectId,
            sourceCvPath: source.cv_url!,
            calibration: target.calibration_model ?? {},
            company: target.company_context ?? {},
          });
          // Re-score the project after the new candidate's
          // fit_dimensions land — under the RANKER's session (075):
          // this after() previously built a client from whatever the
          // triggering recruiter's cookies gave it, so the run wore
          // their face when it ran at all. The copy itself is already
          // persisted; a refused ranker skips with the reason logged.
          try {
            await runRankerScoring(targetProjectId, {
              trigger: { trigger: "new_candidate", candidate_id: inserted.id },
            });
          } catch (err) {
            console.error("[network-copy] scoring re-run failed", err);
          }
        } catch (err) {
          console.error("[network-copy] re-parse failed", err);
          // Best-effort: surface the failure on the row so the
          // candidate page can show a retry banner.
          try {
            const sb = await createServerSupabaseClient();
            await sb
              .from("candidates")
              .update({
                cv_processing: false,
                cv_parse_error:
                  err instanceof Error
                    ? err.message
                    : "Re-parse failed during network copy.",
                updated_at: new Date().toISOString(),
              })
              .eq("id", inserted.id);
          } catch (markErr) {
            console.error("[network-copy] failed to mark row as failed", markErr);
          }
        }
      });
    }

    revalidatePath("/app/candidates/network");
    revalidatePath(`/app/projects/${targetProjectId}/candidates`);
    revalidatePath(`/app/projects/${targetProjectId}/ranking`);
    return { candidateId: inserted.id };
  });
}

/**
 * Download the source CV from storage, upload it under the new
 * candidate's path so it owns an independent copy, then re-parse
 * against the target project's calibration weights and company
 * context. Persists the new cv_structured + typed columns and
 * clears cv_processing.
 */
async function replicateCvAndReparse(args: {
  organizationId: string;
  newCandidateId: string;
  targetProjectId: string;
  sourceCvPath: string;
  calibration: Partial<CalibrationModel>;
  company: Partial<CompanyContext>;
}): Promise<void> {
  const supabase = await createServerSupabaseClient();

  // 1. Download source CV from the cvs bucket.
  const { data: blob, error: downloadErr } = await supabase.storage
    .from("cvs")
    .download(args.sourceCvPath);
  if (downloadErr || !blob) {
    throw new Error(
      `Failed to download source CV: ${downloadErr?.message ?? "no body"}`
    );
  }

  const ext = args.sourceCvPath.toLowerCase().endsWith(".pdf")
    ? "pdf"
    : "docx";
  const mimeType = ext === "pdf" ? PDF_MIME : DOCX_MIME;
  const fileBytes = new Uint8Array(await blob.arrayBuffer());

  // 2. Upload to the new candidate's path so the source row can be
  //    deleted later without leaving the target with a dangling URL.
  const newPath = `${args.organizationId}/${args.targetProjectId}/${args.newCandidateId}/cv.${ext}`;
  const { error: uploadErr } = await supabase.storage
    .from("cvs")
    .upload(newPath, fileBytes, {
      contentType: mimeType,
      upsert: true,
    });
  if (uploadErr) {
    throw new Error(
      `Failed to copy CV file to target: ${uploadErr.message}`
    );
  }

  // 3. Re-parse against the target project's calibration. This
  //    produces fresh fit_dimensions calibrated to the new role.
  const parsed = await parseCv(fileBytes, mimeType, {
    calibration: args.calibration,
    company: args.company,
    projectId: args.targetProjectId,
    organizationId: args.organizationId,
  });

  // 4. Persist the freshly parsed profile + cv_url. Any pre-existing
  //    cv_structured carry-overs are intentionally overwritten — the
  //    new project context produces a more accurate read.
  const { error: updateErr } = await supabase
    .from("candidates")
    .update({
      cv_url: newPath,
      full_name: parsed.full_name || null,
      email: parsed.email,
      linkedin_url: parsed.linkedin_url,
      current_title: parsed.current_title,
      current_company: parsed.current_company,
      archetype: parsed.archetype,
      cv_structured: parsed as unknown as CandidateProfile,
      cv_processing: false,
      cv_parse_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", args.newCandidateId);

  if (updateErr) {
    throw new Error(
      `Failed to persist re-parsed profile: ${updateErr.message}`
    );
  }
}

function identityKey(row: {
  full_name: string;
  email: string | null;
  linkedin_url: string | null;
  current_company: string | null;
}): string {
  if (row.email && row.email.trim().length > 0) {
    return `email:${row.email.trim().toLowerCase()}`;
  }
  if (row.linkedin_url && row.linkedin_url.trim().length > 0) {
    return `linkedin:${row.linkedin_url
      .trim()
      .toLowerCase()
      .replace(/\/$/, "")}`;
  }
  return `name:${row.full_name.trim().toLowerCase()}|${(row.current_company ?? "").trim().toLowerCase()}`;
}
