import { after, NextResponse } from "next/server";
import { getServiceRoleSupabaseClient } from "@/lib/supabase-service-role";
import {
  parseSubmissionBody,
  persistHmSubmission,
  runHmFeedbackPipeline,
} from "@/lib/hm-portal/submit";

// POST /hm/<token>/api/submit — the token door.
//
// Verifies the token via the SECURITY DEFINER RPC, then hands the parsed
// body to the shared submission pipeline (src/lib/hm-portal/submit.ts,
// also used by the signed-in /portal door). The review row stays
// label-only on this path: a token holder has no account, which is the
// D5 point of keeping the token portal at all.

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value
  );
}

export async function POST(
  request: Request,
  context: { params: Promise<{ token: string }> }
): Promise<Response> {
  const { token } = await context.params;
  if (!isUuid(token)) {
    return new NextResponse("Invalid token format.", { status: 400 });
  }

  const supabase = getServiceRoleSupabaseClient();

  const { data: verifyRows, error: verifyErr } = await supabase.rpc(
    "verify_hm_token",
    { p_token: token }
  );
  if (verifyErr) {
    console.error("[hm/submit] token verification failed", verifyErr);
    return new NextResponse("Could not verify token.", { status: 500 });
  }
  type VerifyRow = {
    project_id: string;
    organization_id: string;
    label: string;
  };
  const verified = (verifyRows as VerifyRow[] | null)?.[0] ?? null;
  if (!verified) {
    return new NextResponse("Token invalid, expired, or revoked.", {
      status: 403,
    });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new NextResponse("Body must be JSON.", { status: 400 });
  }

  const parsed = parseSubmissionBody(body);
  if (!parsed.ok) {
    return new NextResponse(parsed.error, { status: 400 });
  }

  // Resolve the token id (verification already bumped last_used_at; this
  // second lookup links the review row back to the share link).
  const { data: tokenRow } = await supabase
    .from("hiring_manager_tokens")
    .select("id")
    .eq("token", token)
    .maybeSingle<{ id: string }>();

  const persisted = await persistHmSubmission({
    supabase,
    projectId: verified.project_id,
    organizationId: verified.organization_id,
    parsed: parsed.value,
    tokenId: tokenRow?.id ?? null,
  });

  if (!persisted.ok) {
    return new NextResponse(persisted.error, { status: persisted.status });
  }

  // Background: interpretation + recalibration after the HM already has
  // their 200. Errors are logged, never surfaced to the HM — they'll be
  // visible to the recruiter on the project's feedback page.
  if (persisted.insertedFeedback.length > 0) {
    const rows = persisted.insertedFeedback;
    after(async () => {
      await runHmFeedbackPipeline({
        projectId: verified.project_id,
        rows,
        topConcern: parsed.value.top_concern,
        hmLabel: parsed.value.hm_label,
      });
    });
  }

  return NextResponse.json({ ok: true });
}
