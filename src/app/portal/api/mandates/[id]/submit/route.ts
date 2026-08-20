import { after, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getServiceRoleSupabaseClient } from "@/lib/supabase-service-role";
import {
  parseSubmissionBody,
  persistHmSubmission,
  runHmFeedbackPipeline,
} from "@/lib/hm-portal/submit";

// POST /portal/api/mandates/<id>/submit — the signed-in door.
//
// Access is decided in-database: `can_view_portal_mandate` runs under the
// caller's own session, so a forged request from a console carries the
// same identity and gets the same answer. The writes then ride the
// service-role client like the token door — the attribution column
// (069's submitted_by_user_id) is guarded by the 057 author trigger, and
// the review states who submitted rather than trusting a label.

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
    return new NextResponse("Sign in to submit feedback.", { status: 401 });
  }

  const { data: allowed, error: accessErr } = await session.rpc(
    "can_view_portal_mandate",
    { p_project_id: projectId }
  );
  if (accessErr) {
    console.error("[portal/submit] access check failed", accessErr);
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

  const parsed = parseSubmissionBody(body);
  if (!parsed.ok) {
    return new NextResponse(parsed.error, { status: 400 });
  }

  // The submitter's identity comes from the session, never the body. The
  // display label is their profile name — the same string the recruiter
  // sees on the review — with whatever they typed as a fallback only.
  const service = getServiceRoleSupabaseClient();
  const { data: profile } = await service
    .from("users")
    .select("full_name, email, organization_id, client_id")
    .eq("id", user.id)
    .maybeSingle<{
      full_name: string | null;
      email: string;
      organization_id: string | null;
      client_id: string | null;
    }>();

  const { data: project } = await service
    .from("projects")
    .select("organization_id")
    .eq("id", projectId)
    .single<{ organization_id: string | null }>();

  if (!project?.organization_id) {
    return new NextResponse("Mandate not found.", { status: 404 });
  }

  const hmLabel =
    profile?.full_name?.trim() || profile?.email || parsed.value.hm_label;

  const persisted = await persistHmSubmission({
    supabase: service,
    projectId,
    organizationId: project.organization_id,
    parsed: { ...parsed.value, hm_label: hmLabel },
    submittedByUserId: user.id,
  });

  if (!persisted.ok) {
    return new NextResponse(persisted.error, { status: persisted.status });
  }

  if (persisted.insertedFeedback.length > 0) {
    const rows = persisted.insertedFeedback;
    const reviewId = persisted.reviewId;
    after(async () => {
      await runHmFeedbackPipeline({
        projectId,
        reviewId,
        rows,
        topConcern: parsed.value.top_concern,
        hmLabel,
      });
    });
  }

  return NextResponse.json({ ok: true });
}
