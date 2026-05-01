import { NextResponse } from "next/server";
import { getServiceRoleSupabaseClient } from "@/lib/supabase-service-role";
import {
  HM_RATINGS,
  type HmRating,
} from "@/app/(dashboard)/projects/[id]/hiring-manager/feedback-constants";

// POST /hm/<token>/api/submit
// Body: {
//   candidate_ratings: { [candidateId]: rating | null },
//   candidate_feedback: { [candidateId]: string },
//   top_concern: string,
//   priority_order: string[],
//   hm_label: string,
// }
//
// The handler verifies the token via the SECURITY DEFINER RPC, then
// uses the service-role client to write a hiring_manager_reviews row
// + N feedback rows (one per rated candidate) so the existing
// recalibration loop fires on submission.

const RATING_VALUES = new Set<HmRating>(HM_RATINGS);

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

  const parsed = parseBody(body);
  if (!parsed.ok) {
    return new NextResponse(parsed.error, { status: 400 });
  }

  // Resolve the token id (we already bumped last_used_at above; this
  // second lookup links the review row back to the share link).
  const { data: tokenRow } = await supabase
    .from("hiring_manager_tokens")
    .select("id")
    .eq("token", token)
    .maybeSingle<{ id: string }>();

  // Persist the structured review.
  const ratingsObject: Record<string, { rating: HmRating; feedback: string }> = {};
  for (const [cid, rating] of Object.entries(parsed.value.candidate_ratings)) {
    if (rating == null) continue;
    ratingsObject[cid] = {
      rating,
      feedback: parsed.value.candidate_feedback[cid] ?? "",
    };
  }

  const ratedCount = Object.keys(ratingsObject).length;
  if (ratedCount === 0) {
    return new NextResponse(
      "Rate at least one candidate before submitting.",
      { status: 400 }
    );
  }

  const { error: reviewErr } = await supabase
    .from("hiring_manager_reviews")
    .insert({
      project_id: verified.project_id,
      organization_id: verified.organization_id,
      token_id: tokenRow?.id ?? null,
      candidate_ratings: ratingsObject,
      top_concern: parsed.value.top_concern,
      priority_order: parsed.value.priority_order,
      hm_label: parsed.value.hm_label,
    });
  if (reviewErr) {
    console.error("[hm/submit] failed to persist review", reviewErr);
    return new NextResponse("Failed to save your feedback.", { status: 500 });
  }

  // Mirror each rated candidate as a feedback row so the existing
  // feedback-interpretation loop fires. We do not run the interpreter
  // synchronously here — recruiters review the structured submission
  // first and trigger interpretation manually from /feedback.
  const feedbackRows = Object.entries(ratingsObject).map(([cid, entry]) => ({
    project_id: verified.project_id,
    organization_id: verified.organization_id,
    candidate_id: cid,
    feedback_type: "hm_portal" as const,
    content: composeFeedbackContent(
      entry.rating,
      entry.feedback,
      parsed.value.top_concern,
      parsed.value.hm_label
    ),
    interpreted: {},
    triggered_recalibration: false,
  }));

  if (feedbackRows.length > 0) {
    const { error: fbErr } = await supabase.from("feedback").insert(feedbackRows);
    if (fbErr) {
      // Non-fatal: the structured review was saved, the recruiter can
      // still see it. Log so we can debug feedback-table schema drift.
      console.error("[hm/submit] failed to mirror feedback rows", fbErr);
    }
  }

  return NextResponse.json({ ok: true });
}

type ParsedBody = {
  candidate_ratings: Record<string, HmRating | null>;
  candidate_feedback: Record<string, string>;
  top_concern: string;
  priority_order: string[];
  hm_label: string;
};

type ParseResult =
  | { ok: true; value: ParsedBody }
  | { ok: false; error: string };

function parseBody(input: unknown): ParseResult {
  if (!input || typeof input !== "object") {
    return { ok: false, error: "Body must be a JSON object." };
  }
  const obj = input as Record<string, unknown>;

  const ratingsRaw = obj.candidate_ratings;
  if (!ratingsRaw || typeof ratingsRaw !== "object" || Array.isArray(ratingsRaw)) {
    return { ok: false, error: "candidate_ratings must be an object." };
  }
  const candidate_ratings: Record<string, HmRating | null> = {};
  for (const [k, v] of Object.entries(ratingsRaw as Record<string, unknown>)) {
    if (!isUuid(k)) continue;
    if (v === null) {
      candidate_ratings[k] = null;
    } else if (typeof v === "string" && RATING_VALUES.has(v as HmRating)) {
      candidate_ratings[k] = v as HmRating;
    } else {
      return { ok: false, error: `Invalid rating for ${k}.` };
    }
  }

  const feedbackRaw = obj.candidate_feedback;
  const candidate_feedback: Record<string, string> = {};
  if (feedbackRaw && typeof feedbackRaw === "object" && !Array.isArray(feedbackRaw)) {
    for (const [k, v] of Object.entries(feedbackRaw as Record<string, unknown>)) {
      if (!isUuid(k)) continue;
      if (typeof v === "string") {
        candidate_feedback[k] = v;
      }
    }
  }

  const top_concern = typeof obj.top_concern === "string" ? obj.top_concern : "";
  const hm_label = typeof obj.hm_label === "string" ? obj.hm_label : "";

  const priority_order = Array.isArray(obj.priority_order)
    ? obj.priority_order.filter(
        (v): v is string => typeof v === "string" && isUuid(v)
      )
    : [];

  return {
    ok: true,
    value: {
      candidate_ratings,
      candidate_feedback,
      top_concern,
      priority_order,
      hm_label,
    },
  };
}

function composeFeedbackContent(
  rating: HmRating,
  candidateFeedback: string,
  topConcern: string,
  hmLabel: string
): string {
  const lines: string[] = [];
  lines.push(`HM PORTAL — ${rating.replace(/_/g, " ").toUpperCase()}`);
  if (hmLabel) lines.push(`From: ${hmLabel}`);
  if (candidateFeedback.trim()) {
    lines.push("");
    lines.push(candidateFeedback.trim());
  }
  if (topConcern.trim()) {
    lines.push("");
    lines.push(`Top concern across slate: ${topConcern.trim()}`);
  }
  return lines.join("\n");
}
