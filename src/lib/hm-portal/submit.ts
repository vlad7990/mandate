import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
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

/**
 * The hiring-manager submission pipeline, shared by its two doors.
 *
 * Extracted from /hm/[token]/api/submit when the External Identity
 * programme added the second door (/portal — a signed-in external instead
 * of a token holder). Body parsing, the review + feedback writes, and the
 * background interpretation/recalibration pipeline are identical either
 * way; what differs is only who the submitter is — a token id and a
 * free-text label, or a real user id (069's `submitted_by_user_id`).
 * Keeping one copy is the §13 same-thing-twice rule: two submit paths
 * that drift is a recalibration loop that fires from one door and not
 * the other.
 */

const RATING_VALUES = new Set<HmRating>(HM_RATINGS);

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value
  );
}

export type ParsedSubmission = {
  candidate_ratings: Record<string, HmRating | null>;
  candidate_feedback: Record<string, string>;
  top_concern: string;
  priority_order: string[];
  hm_label: string;
};

export type ParseResult =
  | { ok: true; value: ParsedSubmission }
  | { ok: false; error: string };

export function parseSubmissionBody(input: unknown): ParseResult {
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

export function composeFeedbackContent(
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

export type PersistResult =
  | {
      ok: true;
      insertedFeedback: Array<{ id: string; candidate_id: string }>;
    }
  | { ok: false; status: number; error: string };

/**
 * Write the structured review and mirror the rated candidates into
 * `feedback` so the recalibration loop fires. Service-role writes for
 * both doors: the token path has no session, and the portal path's
 * attribution column is guarded by the 057 author trigger rather than by
 * RLS. Exactly one of `tokenId` / `submittedByUserId` should be set —
 * the two doors' two identities.
 */
export async function persistHmSubmission(args: {
  supabase: SupabaseClient;
  projectId: string;
  organizationId: string;
  parsed: ParsedSubmission;
  tokenId?: string | null;
  submittedByUserId?: string | null;
}): Promise<PersistResult> {
  const { supabase, projectId, organizationId, parsed } = args;

  const ratingsObject: Record<string, { rating: HmRating; feedback: string }> = {};
  for (const [cid, rating] of Object.entries(parsed.candidate_ratings)) {
    if (rating == null) continue;
    ratingsObject[cid] = {
      rating,
      feedback: parsed.candidate_feedback[cid] ?? "",
    };
  }

  if (Object.keys(ratingsObject).length === 0) {
    return {
      ok: false,
      status: 400,
      error: "Rate at least one candidate before submitting.",
    };
  }

  const { error: reviewErr } = await supabase.from("hiring_manager_reviews").insert({
    project_id: projectId,
    organization_id: organizationId,
    token_id: args.tokenId ?? null,
    submitted_by_user_id: args.submittedByUserId ?? null,
    candidate_ratings: ratingsObject,
    top_concern: parsed.top_concern,
    priority_order: parsed.priority_order,
    hm_label: parsed.hm_label,
  });
  if (reviewErr) {
    console.error("[hm/submit] failed to persist review", reviewErr);
    return { ok: false, status: 500, error: "Failed to save your feedback." };
  }

  const feedbackRows = Object.entries(ratingsObject).map(([cid, entry]) => ({
    project_id: projectId,
    organization_id: organizationId,
    candidate_id: cid,
    feedback_type: "hm_portal" as const,
    content: composeFeedbackContent(
      entry.rating,
      entry.feedback,
      parsed.top_concern,
      parsed.hm_label
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
      insertedFeedback = (data ?? []) as Array<{ id: string; candidate_id: string }>;
    }
  }

  return { ok: true, insertedFeedback };
}

/**
 * Background pipeline triggered by after() for HM portal submissions.
 * Runs interpretFeedback per row, persists the interpretation, and
 * (when flagged) recalibrates the project's calibration weights.
 *
 * Uses the service-role client throughout because neither door has a
 * session by the time this fires — RLS would otherwise block both the
 * project read and the feedback updates.
 */
export async function runHmFeedbackPipeline(args: {
  projectId: string;
  rows: Array<{ id: string; candidate_id: string }>;
  topConcern: string;
  hmLabel: string;
}): Promise<void> {
  const { projectId, rows, topConcern, hmLabel } = args;
  const supabase = getServiceRoleSupabaseClient();

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

  // Sequential (not parallel) on purpose: each row's interpretation can
  // apply recalibration that the next row should see in the
  // prior_feedback tail, but we don't refresh prior_feedback per row —
  // the cost of an extra round trip outweighs the benefit for typical
  // 1–5 row submissions. If recalibration fires, downstream rows in this
  // batch use stale weights; that's acceptable — the recruiter will see
  // the final state on the next visit.
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

  void topConcern;
}
