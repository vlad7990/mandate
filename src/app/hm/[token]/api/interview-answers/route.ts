import { after, NextResponse } from "next/server";
import { getServiceRoleSupabaseClient } from "@/lib/supabase-service-role";
import { normalizeClientInterview } from "@/lib/ai/client-interview-agent";
import {
  parseAnswersBody,
  persistClientInterviewAnswers,
} from "@/lib/hm-portal/interview-answers";
import { runHmFeedbackPipeline } from "@/lib/hm-portal/submit";
import { clientIpFrom, limitClosed } from "@/lib/rate-limit/server";
import { retryPhrase } from "@/lib/rate-limit/core";

// POST /hm/<token>/api/interview-answers — the client-interview answer
// door (117, gate D4). The ONE new token door of the slice: verifies
// the share token, requires the mandate's APPROVED question set, lands
// ONE mandate-level feedback row, records the sessionless
// `client_interview_answered` trail event via the SECURITY DEFINER
// entry point, then hands interpretation to the existing Feedback
// Interpreter pipeline in after().

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

  // Rate limits before the token is even verified (088): a submission
  // triggers a paid interpreter run in after(), so this door is
  // anonymous and billed — it FAILS CLOSED. Two keys, exactly the
  // hm_submit pair's shape: the token and the caller's IP.
  const tokenVerdict = await limitClosed("client_interview_token", token);
  const verdict = tokenVerdict.allowed
    ? await limitClosed("client_interview_ip", clientIpFrom(request.headers))
    : tokenVerdict;
  if (!verdict.allowed) {
    const message =
      verdict.reason === "key" && !tokenVerdict.allowed
        ? "Answers for this link have been submitted several times in the " +
          `last hour. Your answers are safe — try again in ${retryPhrase(verdict.retryAfterSeconds)}.`
        : `Too many submissions right now. Try again in ${retryPhrase(verdict.retryAfterSeconds)}.`;
    return NextResponse.json(
      { ok: false, error: message },
      {
        status: 429,
        headers: { "Retry-After": String(verdict.retryAfterSeconds) },
      }
    );
  }

  const supabase = getServiceRoleSupabaseClient();

  const { data: verifyRows, error: verifyErr } = await supabase.rpc(
    "verify_hm_token",
    { p_token: token }
  );
  if (verifyErr) {
    console.error("[hm/interview-answers] token verification failed", verifyErr);
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

  const parsed = parseAnswersBody(body);
  if (!parsed.ok) {
    return new NextResponse(parsed.error, { status: 400 });
  }

  // The contract is the mandate's APPROVED set — reads scoped to the
  // verified project only. The body must name the same row the portal
  // rendered: a mismatch means the desk approved a newer version while
  // this page sat open, and silently mapping old answer ids onto new
  // questions would attribute words the client never said.
  const { data: interview } = await supabase
    .from("client_interviews")
    .select("id, version, content_json")
    .eq("project_id", verified.project_id)
    .eq("status", "approved")
    .maybeSingle<{ id: string; version: number; content_json: unknown }>();

  if (!interview) {
    return new NextResponse(
      "This mandate has no approved question set to answer.",
      { status: 409 }
    );
  }
  if (interview.id !== parsed.value.interview_id) {
    return new NextResponse(
      "The question set has been updated since this page loaded — refresh to see the current questions.",
      { status: 409 }
    );
  }

  const content = normalizeClientInterview(interview.content_json);

  const persisted = await persistClientInterviewAnswers({
    supabase,
    projectId: verified.project_id,
    organizationId: verified.organization_id,
    questions: content.questions,
    version: interview.version,
    parsed: parsed.value,
    fallbackHmLabel: verified.label,
  });

  if (!persisted.ok) {
    return new NextResponse(persisted.error, { status: persisted.status });
  }

  // The sessionless trail event (063's shape): the client's act is
  // history even when the interpreter below is suspended and the
  // interpretation is honestly skipped. Fire-and-forget — a trail
  // write must never block or break the door.
  supabase
    .rpc("record_client_interview_answered", {
      p_token: token,
      p_interview_id: interview.id,
      p_answered: persisted.answeredCount,
    })
    .then(({ error }: { error: { message: string } | null }) => {
      if (error) {
        console.error("[hm/interview-answers] answered event failed", error);
      }
    });

  // Background: interpretation + recalibration after the client already
  // has their 200 — the EXISTING pipeline, run by the Feedback
  // Interpreter under its own session; the row's feedback_type tells it
  // these are interview answers. No review row exists on this door;
  // the answered trail event above is the trigger record.
  if (persisted.feedbackId) {
    const feedbackId = persisted.feedbackId;
    const hmLabel = persisted.hmLabel;
    after(async () => {
      await runHmFeedbackPipeline({
        projectId: verified.project_id,
        reviewId: null,
        rows: [{ id: feedbackId, candidate_id: null }],
        topConcern: "",
        hmLabel,
      });
    });
  }

  return NextResponse.json({ ok: true });
}
