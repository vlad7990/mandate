import { after, NextResponse } from "next/server";
import { getServiceRoleSupabaseClient } from "@/lib/supabase-service-role";
import {
  HM_RATINGS,
  type HmRating,
} from "@/app/(dashboard)/app/projects/[id]/hiring-manager/feedback-constants";
import { interpretFeedback } from "@/lib/ai/interpret-feedback";
import { applyRecalibration } from "@/lib/recalibration/recalibrate";
import type { CalibrationModel } from "@/lib/ai/role-analysis";
import type { OnboardingResponses } from "@/lib/ai/onboarding-analysis";
import type { CandidateProfile } from "@/lib/ai/cv-parsing";
import type {
  FeedbackInterpretation,
  FeedbackType,
} from "@/lib/ai/feedback-analysis";

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

  let insertedFeedback: Array<{ id: string; candidate_id: string }> = [];
  if (feedbackRows.length > 0) {
    const { data, error: fbErr } = await supabase
      .from("feedback")
      .insert(feedbackRows)
      .select("id, candidate_id");
    if (fbErr) {
      // Non-fatal: the structured review was saved, the recruiter can
      // still see it. Log so we can debug feedback-table schema drift.
      console.error("[hm/submit] failed to mirror feedback rows", fbErr);
    } else {
      insertedFeedback = (data ?? []) as Array<{
        id: string;
        candidate_id: string;
      }>;
    }
  }

  // Background: run the Feedback Interpretation Agent on every newly
  // inserted feedback row, persist the interpretation, and recalibrate
  // when the agent flags it. The HM has already received their 200 by
  // the time this fires (after() runs post-response). Errors are
  // logged but never surface to the HM — they'll be visible to the
  // recruiter on the project's feedback page.
  if (insertedFeedback.length > 0) {
    after(async () => {
      await runHmFeedbackPipeline({
        projectId: verified.project_id,
        rows: insertedFeedback,
        topConcern: parsed.value.top_concern,
        hmLabel: parsed.value.hm_label,
      });
    });
  }

  return NextResponse.json({ ok: true });
}

/**
 * Background pipeline triggered by after() for HM portal submissions.
 * Runs interpretFeedback per row, persists the interpretation, and
 * (when flagged) recalibrates the project's calibration weights.
 *
 * Uses the service-role client throughout because the public route
 * has no Supabase session — RLS would otherwise block both the
 * project read and the feedback updates.
 */
async function runHmFeedbackPipeline(args: {
  projectId: string;
  rows: Array<{ id: string; candidate_id: string }>;
  topConcern: string;
  hmLabel: string;
}): Promise<void> {
  const { projectId, rows, topConcern, hmLabel } = args;
  const supabase = getServiceRoleSupabaseClient();

  // Project context — calibration_model, onboarding_responses,
  // company_context drive the interpreter.
  const { data: project, error: projectErr } = await supabase
    .from("projects")
    .select("calibration_model, onboarding_responses, organization_id")
    .eq("id", projectId)
    .single<{
      calibration_model: Partial<CalibrationModel> | null;
      onboarding_responses: Partial<OnboardingResponses> | null;
      organization_id: string | null;
    }>();

  if (projectErr || !project) {
    console.error("[hm/submit/after] failed to load project context", projectErr);
    return;
  }

  // Pull the existing feedback content + tail of prior feedback once
  // (the prior_feedback list is shared across all rows in this run).
  const rowIds = rows.map((r) => r.id);
  const { data: insertedRowsRaw } = await supabase
    .from("feedback")
    .select("id, candidate_id, content")
    .in("id", rowIds);
  const insertedById = new Map<string, { content: string }>();
  for (const r of (insertedRowsRaw ?? []) as Array<{
    id: string;
    candidate_id: string;
    content: string;
  }>) {
    insertedById.set(r.id, { content: r.content });
  }

  const { data: priorRows } = await supabase
    .from("feedback")
    .select(
      "feedback_type, content, candidate_id, interpreted, triggered_recalibration, created_at"
    )
    .eq("project_id", projectId)
    .not("id", "in", `(${rowIds.map((id) => `"${id}"`).join(",")})`)
    .order("created_at", { ascending: false })
    .limit(10);

  type PriorRow = {
    feedback_type: string;
    content: string;
    candidate_id: string | null;
    interpreted: { summary?: string } | null;
    triggered_recalibration: boolean;
    created_at: string;
  };
  const prior_feedback = ((priorRows ?? []) as PriorRow[])
    .reverse()
    .map((r) => ({
      type: r.feedback_type as FeedbackType,
      content: r.content,
      candidate_id: r.candidate_id,
      summary: r.interpreted?.summary ?? null,
      triggered_recalibration: r.triggered_recalibration,
      created_at: r.created_at,
    }));

  // Run each row through the interpreter sequentially. Sequential
  // (not parallel) on purpose: each row's interpretation can apply
  // recalibration that the next row should see in the prior_feedback
  // tail, but we don't refresh prior_feedback per row — the cost of
  // an extra round trip outweighs the benefit for typical 1–5 row
  // submissions. If recalibration fires, downstream rows in this
  // batch use stale weights; that's acceptable — the recruiter will
  // see the final state on the next visit.
  for (const row of rows) {
    const inserted = insertedById.get(row.id);
    if (!inserted) continue;

    let candidate: {
      id: string;
      full_name: string;
      profile: Partial<CandidateProfile>;
    } | null = null;
    if (row.candidate_id) {
      const { data: candRow } = await supabase
        .from("candidates")
        .select("id, full_name, cv_structured")
        .eq("id", row.candidate_id)
        .maybeSingle<{
          id: string;
          full_name: string;
          cv_structured: unknown;
        }>();
      if (candRow) {
        candidate = {
          id: candRow.id,
          full_name: candRow.full_name,
          profile: (candRow.cv_structured ?? {}) as Partial<CandidateProfile>,
        };
      }
    }

    let interpretation: FeedbackInterpretation | null = null;
    try {
      interpretation = await interpretFeedback({
        new_feedback: {
          type: "hm_portal" as FeedbackType,
          content: inserted.content,
          candidate_id: row.candidate_id,
          submitted_role: hmLabel || "hiring_manager",
        },
        prior_feedback,
        calibration: project.calibration_model ?? {},
        onboarding: project.onboarding_responses ?? {},
        candidate,
        skill_context: {
          project_id: projectId,
          organization_id: project.organization_id,
        },
      });
    } catch (err) {
      console.error(
        "[hm/submit/after] interpretation failed for feedback",
        row.id,
        err
      );
    }

    // Persist the interpretation (or a failure marker) onto the row.
    if (interpretation) {
      const { error: updateErr } = await supabase
        .from("feedback")
        .update({ interpreted: interpretation })
        .eq("id", row.id);
      if (updateErr) {
        console.error(
          "[hm/submit/after] failed to persist interpretation",
          row.id,
          updateErr
        );
      }
    } else {
      await supabase
        .from("feedback")
        .update({
          interpreted: {
            summary: "AI interpretation failed — see content above.",
          },
        })
        .eq("id", row.id);
    }

    // Recalibrate when the agent asked for it AND there are real
    // adjustments. Pass the service-role client through so the
    // recalibrator's reads/writes don't trip over the unauthenticated
    // session.
    if (
      interpretation?.recalibration_needed &&
      interpretation.suggested_weight_adjustments.length > 0
    ) {
      try {
        await applyRecalibration(projectId, row.id, interpretation, supabase);
      } catch (err) {
        console.error(
          "[hm/submit/after] recalibration failed for feedback",
          row.id,
          err
        );
      }
    }
  }

  // topConcern is captured in the structured review and the per-row
  // composeFeedbackContent already embeds it; we don't need to do
  // anything else with it here. The reference keeps the callback
  // signature self-documenting and survives future linter sweeps.
  void topConcern;
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
