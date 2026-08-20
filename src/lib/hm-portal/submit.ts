import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { signInFeedbackInterpreter } from "@/lib/agents/session";
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
      /** The review row just written — the trigger the interpretation
       * names in its trail event (D4). Null only if the insert's
       * returning read failed, which is logged, not fatal. */
      reviewId: string | null;
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

  const { data: reviewRow, error: reviewErr } = await supabase
    .from("hiring_manager_reviews")
    .insert({
      project_id: projectId,
      organization_id: organizationId,
      token_id: args.tokenId ?? null,
      submitted_by_user_id: args.submittedByUserId ?? null,
      candidate_ratings: ratingsObject,
      top_concern: parsed.top_concern,
      priority_order: parsed.priority_order,
      hm_label: parsed.hm_label,
    })
    .select("id")
    .single<{ id: string }>();
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

  return { ok: true, reviewId: reviewRow?.id ?? null, insertedFeedback };
}

/**
 * Background pipeline triggered by after() for HM portal submissions.
 * Runs interpretFeedback per row, persists the interpretation, records
 * the act in the activity trail under the agent's own name, and (when
 * flagged) recalibrates the project's calibration weights.
 *
 * Runs as the FEEDBACK INTERPRETER AGENT — a real principal with role
 * 'agent', signed in from env credentials — not the service role it
 * rode from its first commit until the agents-as-principals programme
 * (074). Its reach is exactly the named `*_agent_*` RLS policies, and
 * the trail can finally say the interpreter acted on the submission
 * rather than wearing a human's face or no face at all.
 *
 * Fails soft per D5: by the time this fires, the review and feedback
 * rows are already persisted by the door that received them. If the
 * agent cannot sign in — suspended from /ops, credentials absent —
 * the interpretation is SKIPPED with the reason logged and the review
 * left in its uninterpreted state. An agent outage degrades the
 * product; it never eats a person's work. There is deliberately no
 * service-role fallback: the fallback IS the bug this seam removed.
 */
export async function runHmFeedbackPipeline(args: {
  projectId: string;
  /** The hiring_manager_reviews row that triggered this run — named in
   * the trail event's detail (D4: the actor is the agent, the trigger
   * is named). */
  reviewId: string | null;
  rows: Array<{ id: string; candidate_id: string }>;
  topConcern: string;
  hmLabel: string;
}): Promise<void> {
  const { projectId, reviewId, rows, topConcern, hmLabel } = args;

  const session = await signInFeedbackInterpreter();
  if (!session.ok) {
    console.error(
      `[hm/submit/after] interpretation skipped: ${session.reason}. ` +
        "The HM's review is saved and remains uninterpreted; a recruiter " +
        "sees the raw feedback on the project's feedback page."
    );
    return;
  }
  const supabase = session.client;

  try {
    await interpretUnderAgentSession({
      supabase,
      projectId,
      reviewId,
      rows,
      topConcern,
      hmLabel,
    });
  } finally {
    // Persist nothing (D3): the throwaway client holds the session in
    // memory only, and this revokes it from GoTrue's ledger.
    await session.signOut();
  }
}

async function interpretUnderAgentSession(args: {
  supabase: SupabaseClient;
  projectId: string;
  reviewId: string | null;
  rows: Array<{ id: string; candidate_id: string }>;
  topConcern: string;
  hmLabel: string;
}): Promise<void> {
  const { supabase, projectId, reviewId, rows, topConcern, hmLabel } = args;

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
      interpretation = await interpretFeedback(
        {
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
        },
        // The agent's session, so the skill injector can read the org's
        // skills lawfully. Under the old service-role after(), no client
        // could be built here (cookies() is unavailable) and every
        // recruiter-authored skill was silently stripped from the run —
        // the agent session is the first time skills reach an HM-portal
        // interpretation at all.
        { skillClient: supabase }
      );
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

    let recalibrated = false;
    if (
      interpretation?.recalibration_needed &&
      interpretation.suggested_weight_adjustments.length > 0
    ) {
      try {
        const result = await applyRecalibration(
          projectId,
          row.id,
          interpretation,
          supabase
        );
        recalibrated = result.applied;
      } catch (err) {
        console.error(
          "[hm/submit/after] recalibration failed for feedback",
          row.id,
          err
        );
      }
    }

    // The trail (D4): the agent is the actor — record_agent_event
    // stamps actor_id from the session and refuses any caller that is
    // not an active agent — and the trigger is named in detail: the
    // review, the feedback row, who submitted it, what followed.
    // Written only for interpretations that actually landed; a failed
    // interpretation is a log line, not history.
    if (interpretation) {
      const { error: eventErr } = await supabase.rpc("record_agent_event", {
        p_event_type: "feedback_interpreted",
        p_project_id: projectId,
        p_candidate_id: row.candidate_id ?? undefined,
        p_detail: {
          agent_kind: "feedback_interpreter",
          review_id: reviewId,
          feedback_id: row.id,
          hm_label: hmLabel || null,
          recalibrated,
        },
      });
      if (eventErr) {
        console.error(
          "[hm/submit/after] failed to record the interpretation event",
          row.id,
          eventErr
        );
      }
    }
  }

  void topConcern;
}
