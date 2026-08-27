import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyTurnstile, turnstileConfigured } from "@/lib/turnstile";
import { clientIpFrom, limitClosed } from "@/lib/rate-limit/server";
import { getServiceRoleSupabaseClient } from "@/lib/supabase-service-role";
import { PDF_MIME, DOCX_MIME } from "@/lib/ai/parse-cv";
import { runCvParseAndPersist } from "@/lib/candidates/agent-parser";
import { ensureCandidateEvaluation } from "@/lib/ai/generate-evaluation";
import type { CalibrationModel, CompanyContext } from "@/lib/ai/role-analysis";
import { assertCalibrationMatchesSpec } from "@/lib/calibration/spec-drift";

/**
 * §190 — the apply door's write half. Order is deliberate and each gate
 * fails CLOSED:
 *
 *   1. Turnstile keys absent → 403 before anything is read. The page
 *      shows the closed state in that case, so a POST arriving anyway
 *      is a script, not a person.
 *   2. Rate limit — Tier 1 (money: parse + evaluation + refuter per
 *      submission), so an unreachable limiter REFUSES.
 *   3. Turnstile verification of the submitted token.
 *   4. File checks, then `submit_application` (SECURITY DEFINER, the
 *      token re-validated inside, §177's door mirrored inside).
 *   5. Storage via the service client under the org prefix — the 073
 *      shape: the applicant holds no storage grant and never touches
 *      the bucket directly.
 *   6. after(): the agent chain — parse, evaluation, refuter, and the
 *      §188 ledger — exactly what a recruiter upload gets.
 */

const MAX_CV_BYTES = 10 * 1024 * 1024;

function anonClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  if (!turnstileConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Applications are not open." },
      { status: 403 }
    );
  }

  const ip = clientIpFrom(req.headers);
  const rate = await limitClosed("apply", ip);
  if (!rate.allowed) {
    return NextResponse.json(
      { ok: false, error: "Too many submissions — try again later." },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } }
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "Bad request." }, { status: 400 });
  }

  const captcha = await verifyTurnstile(
    String(form.get("cf-turnstile-response") ?? "") || undefined,
    ip
  );
  if (!captcha.ok) {
    return NextResponse.json(
      { ok: false, error: "Verification failed — reload and try again." },
      { status: 403 }
    );
  }

  const fullName = String(form.get("full_name") ?? "").trim();
  const email = String(form.get("email") ?? "").trim();
  const file = form.get("cv");
  if (!fullName || !(file instanceof File) || file.size === 0) {
    return NextResponse.json(
      { ok: false, error: "Name and a CV file are required." },
      { status: 400 }
    );
  }
  if (file.type !== PDF_MIME && file.type !== DOCX_MIME) {
    return NextResponse.json(
      { ok: false, error: "Only PDF and DOCX files are accepted." },
      { status: 400 }
    );
  }
  if (file.size > MAX_CV_BYTES) {
    return NextResponse.json(
      { ok: false, error: "Keep the file under 10 MB." },
      { status: 400 }
    );
  }
  const ext = file.type === PDF_MIME ? "pdf" : "docx";

  // The row, minted by the definer under the token's authority.
  const { data: created, error: subErr } = await anonClient()
    .rpc("submit_application", {
      p_token: token,
      p_full_name: fullName,
      p_email: email,
      p_ext: ext,
    })
    .maybeSingle<{
      candidate_id: string;
      organization_id: string;
      project_id: string;
      storage_path: string;
    }>();
  if (subErr || !created) {
    return NextResponse.json(
      { ok: false, error: "Applications are not open for this role." },
      { status: 403 }
    );
  }

  // The bytes, under the org prefix, via the service client (073 shape).
  const bytes = new Uint8Array(await file.arrayBuffer());
  const service = getServiceRoleSupabaseClient();
  const { error: upErr } = await service.storage
    .from("cvs")
    .upload(created.storage_path, bytes, { contentType: file.type, upsert: true });
  if (upErr) {
    // Honest failure on the row, not a silent empty profile.
    await service
      .from("candidates")
      .update({
        cv_processing: false,
        cv_parse_error: `Upload failed: ${upErr.message}`,
      })
      .eq("id", created.candidate_id);
    return NextResponse.json(
      { ok: false, error: "The file did not store — try again." },
      { status: 500 }
    );
  }

  // The judgment chain, off the request path. Same seams, same agents,
  // same ledger as a recruiter upload.
  after(async () => {
    try {
      const { data: project } = await service
        .from("projects")
        .select("calibration_model, company_context")
        .eq("id", created.project_id)
        .maybeSingle<{
          calibration_model: Partial<CalibrationModel> | null;
          company_context: Partial<CompanyContext> | null;
        }>();
      // §177's door, at the TS layer too. submit_application mirrored it
      // in SQL at the moment of submission; this holds it again at the
      // moment of judgment, with the same refusal every other scoring
      // seam speaks. door-sites.test.ts demanded this line — correctly.
      await assertCalibrationMatchesSpec(
        service,
        created.project_id,
        project?.calibration_model ?? null
      );
      const parsed = await runCvParseAndPersist({
        candidateId: created.candidate_id,
        projectId: created.project_id,
        organizationId: created.organization_id,
        fileBytes: bytes,
        mimeType: file.type,
        cvPath: created.storage_path,
        calibration: project?.calibration_model ?? {},
        company: project?.company_context ?? {},
        trigger: "upload",
        priorName: fullName,
        // G.1 — this is the one path where the subject declared their own
        // identity, under the Art.13 notice on the form. The CV may not
        // overwrite it; a stale or borrowed file must not be able to
        // rename an applicant or re-address their mail.
        declaredIdentity: { fullName, email: email || null },
      });
      if (parsed.ok) {
        await ensureCandidateEvaluation(created.candidate_id, created.project_id, {
          trigger: "profile_view",
        });
      }
    } catch (err) {
      console.error("[apply] post-submit chain failed", created.candidate_id, err);
    }
  });

  return NextResponse.json({ ok: true });
}
