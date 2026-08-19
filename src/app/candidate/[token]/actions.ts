"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@supabase/supabase-js";
import { getServiceRoleSupabaseClient } from "@/lib/supabase-service-role";
import { runAction } from "@/lib/actions/run";
import type { ActionResult } from "@/lib/actions/result";

/**
 * The candidate portal's actions. The token IS the credential — every
 * call lands in a SECURITY DEFINER RPC (073) that validates it and
 * enforces the column discipline; these actions exist to carry the
 * calls and return readable sentences. The anon client is deliberate:
 * this surface has no session, and giving it one would be a lie about
 * its trust shape.
 */

function anonClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

const PDF_MIME = "application/pdf";
const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const MAX_CV_BYTES = 10 * 1024 * 1024;

export type ContactUpdates = {
  full_name?: string;
  phone?: string;
  location?: string;
  linkedin_url?: string;
  github_url?: string;
  website_url?: string;
  twitter_url?: string;
};

export async function updateContactAction(
  token: string,
  updates: ContactUpdates
): Promise<ActionResult> {
  return runAction("The update", async () => {
    const { error } = await anonClient().rpc("candidate_portal_update_contact", {
      p_token: token,
      p_full_name: updates.full_name ?? null,
      p_phone: updates.phone ?? null,
      p_location: updates.location ?? null,
      p_linkedin_url: updates.linkedin_url ?? null,
      p_github_url: updates.github_url ?? null,
      p_website_url: updates.website_url ?? null,
      p_twitter_url: updates.twitter_url ?? null,
    });
    if (error) throw new Error(error.message);
    revalidatePath(`/candidate/${token}`);
  });
}

export async function withdrawAction(
  token: string,
  projectId: string
): Promise<ActionResult> {
  return runAction("The withdrawal", async () => {
    const { error } = await anonClient().rpc("candidate_portal_withdraw", {
      p_token: token,
      p_project_id: projectId,
    });
    if (error) throw new Error(error.message);
    revalidatePath(`/candidate/${token}`);
  });
}

export async function requestErasureAction(
  token: string,
  note: string
): Promise<ActionResult> {
  return runAction("The erasure request", async () => {
    const { error } = await anonClient().rpc("candidate_portal_request_erasure", {
      p_token: token,
      p_note: note || null,
    });
    if (error) throw new Error(error.message);
    revalidatePath(`/candidate/${token}`);
  });
}

/**
 * The CV lands in storage and the act lands in the trail; the org's
 * parsed profile moves only by the recruiter's own deliberate upload
 * (073's header: re-running paid parsing from an anonymous endpoint is
 * an abuse surface). The portal says exactly that.
 */
export async function submitCvAction(
  token: string,
  formData: FormData
): Promise<ActionResult> {
  return runAction("The CV submission", async () => {
    const file = formData.get("cv");
    if (!(file instanceof File) || file.size === 0) {
      throw new Error("Choose a PDF or DOCX file first.");
    }
    if (file.type !== PDF_MIME && file.type !== DOCX_MIME) {
      throw new Error("Only PDF and DOCX files are accepted.");
    }
    if (file.size > MAX_CV_BYTES) {
      throw new Error("Keep the file under 10 MB.");
    }

    // Validate the token BEFORE any write — a dead link stores nothing.
    const anon = anonClient();
    const { data: ctx, error: ctxError } = await anon.rpc(
      "candidate_portal_context",
      { p_token: token }
    );
    const ctxRow = ((ctx ?? []) as { organization_id: string }[])[0];
    if (ctxError || !ctxRow) {
      throw new Error("This link is not valid.");
    }

    // Under the ORG's storage folder: the cvs_* policies key staff
    // reads and deletes on the {organization_id}/ prefix, and a portal
    // upload outside it would be unreadable and undeletable by the very
    // team meant to review it — including for erasure execution (found
    // in the B3 drive's teardown). The org id comes from the validated
    // token's context, never from the caller.
    const ext = file.type === PDF_MIME ? "pdf" : "docx";
    const storagePath = `${ctxRow.organization_id}/candidate-portal/${token}/cv-${Date.now()}.${ext}`;

    const service = getServiceRoleSupabaseClient();
    const bytes = new Uint8Array(await file.arrayBuffer());
    const { error: uploadError } = await service.storage
      .from("cvs")
      .upload(storagePath, bytes, { contentType: file.type, upsert: true });
    if (uploadError) {
      throw new Error(`The file did not store: ${uploadError.message}`);
    }

    const { error: recordError } = await anon.rpc("candidate_portal_record_cv", {
      p_token: token,
      p_storage_path: storagePath,
    });
    if (recordError) throw new Error(recordError.message);
  });
}
