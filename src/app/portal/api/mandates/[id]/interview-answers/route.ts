import { after, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getServiceRoleSupabaseClient } from "@/lib/supabase-service-role";
import { normalizeClientInterview } from "@/lib/ai/client-interview-agent";
import {
  parseAnswersBody,
  persistClientInterviewAnswers,
} from "@/lib/hm-portal/interview-answers";
import { runHmFeedbackPipeline } from "@/lib/hm-portal/submit";
import { clientIpFrom, limitClosed } from "@/lib/rate-limit/server";
import { retryPhrase } from "@/lib/rate-limit/core";

// POST /portal/api/mandates/<id>/interview-answers — the SIGNED-IN
// client-interview answer door (127, gate D1(b)).
//
// The token door's twin, differing only where identity differs. It
// follows the shape of its neighbour /portal/api/mandates/[id]/submit
// exactly: identity from the session, rate limits after identity and
// before access, access decided IN-DATABASE by can_view_portal_mandate
// under the caller's own session — so a forged request from a browser
// console carries the same identity and gets the same answer — and only
// then the service-role write.
//
// The author is never taken from the body. `hm_label` still arrives
// (the shared client component sends it) and is deliberately ignored
// here: on this door the name is the session's, and honouring a
// body-supplied one would be a way to sign a colleague's name to your
// words.

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value
  );
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id: projectId } = await context.params;
  if (!isUuid(projectId)) {
    return new NextResponse("Invalid mandate id.", { status: 400 });
  }

  const session = await createServerSupabaseClient();
  const {
    data: { user },
  } = await session.auth.getUser();
  if (!user) {
    return new NextResponse("Sign in to answer these questions.", {
      status: 401,
    });
  }

  // Tier 1, FAILS CLOSED: a submission triggers a paid interpreter run.
  // Keyed on the signed-in identity and the IP, the portal_submit pair's
  // shape with its own buckets (127).
  const identityVerdict = await limitClosed(
    "portal_interview_identity",
    user.id
  );
  const verdict = identityVerdict.allowed
    ? await limitClosed("portal_interview_ip", clientIpFrom(request.headers))
    : identityVerdict;
  if (!verdict.allowed) {
    const message =
      verdict.reason === "key" && !identityVerdict.allowed
        ? "These questions have been answered several times in the last " +
          `hour. Your answers are safe — try again in ${retryPhrase(verdict.retryAfterSeconds)}.`
        : `Too many submissions right now. Try again in ${retryPhrase(verdict.retryAfterSeconds)}.`;
    return NextResponse.json(
      { ok: false, error: message },
      {
        status: 429,
        headers: { "Retry-After": String(verdict.retryAfterSeconds) },
      }
    );
  }

  const { data: allowed, error: accessErr } = await session.rpc(
    "can_view_portal_mandate",
    { p_project_id: projectId }
  );
  if (accessErr) {
    console.error("[portal/interview-answers] access check failed", accessErr);
    return new NextResponse("Could not verify access.", { status: 500 });
  }
  if (allowed !== true) {
    return new NextResponse("This search is not shared with you.", {
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

  const service = getServiceRoleSupabaseClient();

  // The contract is the mandate's APPROVED set, and the body must name
  // the same row the page rendered — the token door's rule, for the
  // same reason: silently mapping old answer ids onto a newer question
  // set would attribute words the client never said.
  const { data: interview } = await service
    .from("client_interviews")
    .select("id, version, content_json")
    .eq("project_id", projectId)
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

  const { data: project } = await service
    .from("projects")
    .select("organization_id")
    .eq("id", projectId)
    .single<{ organization_id: string | null }>();

  if (!project?.organization_id) {
    return new NextResponse("Mandate not found.", { status: 404 });
  }

  // The label is the profile's, with the body's ignored entirely —
  // the same string the recruiter already sees on this person's
  // reviews, so the trail reads consistently across both surfaces.
  const { data: profile } = await service
    .from("users")
    .select("full_name, email")
    .eq("id", user.id)
    .maybeSingle<{ full_name: string | null; email: string }>();

  const hmLabel = profile?.full_name?.trim() || profile?.email || "";

  const content = normalizeClientInterview(interview.content_json);

  const persisted = await persistClientInterviewAnswers({
    supabase: service,
    projectId,
    organizationId: project.organization_id,
    questions: content.questions,
    version: interview.version,
    parsed: { ...parsed.value, hm_label: hmLabel },
    submittedByUserId: user.id,
  });

  if (!persisted.ok) {
    return new NextResponse(persisted.error, { status: persisted.status });
  }

  // The trail event rides the caller's SESSION, not the service-role
  // client: write_activity_event stamps auth.uid() itself (053), so a
  // service-role call would record an actorless answer on a door whose
  // whole point is that the author is known. Fire-and-forget — a trail
  // write must never block or break the door.
  session
    .rpc("record_portal_client_interview_answered", {
      p_project_id: projectId,
      p_interview_id: interview.id,
      p_answered: persisted.answeredCount,
    })
    .then(({ error }: { error: { message: string } | null }) => {
      if (error) {
        console.error(
          "[portal/interview-answers] answered event failed",
          error
        );
      }
    });

  if (persisted.feedbackId) {
    const rows = [{ id: persisted.feedbackId, candidate_id: null }];
    after(async () => {
      await runHmFeedbackPipeline({
        projectId,
        reviewId: null,
        rows,
        topConcern: "",
        hmLabel,
      });
    });
  }

  return NextResponse.json({ ok: true, replaced: persisted.replaced });
}
