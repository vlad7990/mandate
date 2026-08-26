import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ClientInterviewQuestion } from "@/lib/ai/client-interview-agent";
import {
  composeClientInterviewContent,
  type ParsedAnswers,
} from "./interview-answers-core";

export {
  parseAnswersBody,
  composeClientInterviewContent,
  type ParsedAnswers,
  type ParseAnswersResult,
} from "./interview-answers-core";

/**
 * The client-interview answer landing (117 gate D4; 127 gate
 * D1(b)/D3(c)). ONE mandate-level `feedback` row per answer:
 * candidate_id NULL, feedback_type 'client_interview', content
 * composing the approved set's questions with the client's answers.
 * The approved set itself is immutable; answers live here ONLY, and
 * ride the existing interpretation pipeline
 * (src/lib/hm-portal/submit.ts → runHmFeedbackPipeline) unchanged.
 *
 * TWO doors now land here, and `submittedByUserId` is what tells them
 * apart:
 *   * the token door passes none — its row is honestly anonymous (069
 *     D5), and token answers accumulate exactly as they did before.
 *   * the signed-in door passes the session's own id — the row is
 *     attributed through `feedback.submitted_by`, which
 *     guard_author_in_org has guarded since 057 and 068 taught to
 *     admit an external of one of the org's clients.
 *
 * D3(c): an attributed author holds at most ONE answer per mandate, so
 * a second submission REPLACES the first in place rather than stacking
 * a second opinion from the same person. The partial unique index in
 * 127 is the authority; the read-then-write below is the courtesy path
 * that keeps the id stable so the interpreter sees an edit, not a new
 * voice.
 */

export type PersistAnswersResult =
  | {
      ok: true;
      feedbackId: string | null;
      answeredCount: number;
      /** True when this replaced the author's own earlier answer. */
      replaced: boolean;
      /** The label the row was stamped with — the body's, or the
       * token's issuance label when the body carried none (§128 F-4,
       * kept). */
      hmLabel: string;
    }
  | { ok: false; status: number; error: string };

/**
 * Write the one mandate-level feedback row. Service-role write on both
 * doors: the token path has no session, and the signed-in path has
 * already proved its access in-database before calling here. Answers
 * matching no question id in the approved set are ignored — the set is
 * the contract.
 */
export async function persistClientInterviewAnswers(args: {
  supabase: SupabaseClient;
  projectId: string;
  organizationId: string;
  questions: ClientInterviewQuestion[];
  version: number;
  parsed: ParsedAnswers;
  fallbackHmLabel?: string | null;
  /** The signed-in door's author. Absent ⇒ the anonymous token door. */
  submittedByUserId?: string | null;
}): Promise<PersistAnswersResult> {
  const { supabase, projectId, organizationId, questions, version, parsed } =
    args;
  const hmLabel =
    parsed.hm_label.trim() || (args.fallbackHmLabel ?? "").trim();
  const submittedBy = args.submittedByUserId ?? null;

  const known = new Set(questions.map((q) => q.id));
  const answered = Object.keys(parsed.answers).filter((id) => known.has(id));
  if (answered.length === 0) {
    return {
      ok: false,
      status: 400,
      error: "Answer at least one question before submitting.",
    };
  }

  // Only what the approved set asked for is kept. A body naming a
  // question that is not in the set would otherwise sit in
  // answers_json forever, prefilling a field that no longer exists.
  const keptAnswers: Record<string, string> = {};
  for (const id of answered) keptAnswers[id] = parsed.answers[id];

  const payload = {
    project_id: projectId,
    organization_id: organizationId,
    candidate_id: null,
    feedback_type: "client_interview",
    content: composeClientInterviewContent(
      questions,
      parsed.answers,
      hmLabel,
      version
    ),
    answers_json: keptAnswers,
    interpreted: {},
    triggered_recalibration: false,
  };

  // D3(c): an attributed author edits their standing answer. Looked up
  // rather than upserted because the uniqueness is a PARTIAL index and
  // ON CONFLICT cannot name one without repeating its predicate here —
  // the same-thing-twice rule, and the index stays the single
  // authority either way.
  let existingId: string | null = null;
  if (submittedBy) {
    const { data: prior } = await supabase
      .from("feedback")
      .select("id")
      .eq("project_id", projectId)
      .eq("feedback_type", "client_interview")
      .eq("submitted_by", submittedBy)
      .maybeSingle<{ id: string }>();
    existingId = prior?.id ?? null;
  }

  const write = existingId
    ? supabase
        .from("feedback")
        .update(payload)
        .eq("id", existingId)
        .select("id")
        .single<{ id: string }>()
    : supabase
        .from("feedback")
        .insert({ ...payload, submitted_by: submittedBy })
        .select("id")
        .single<{ id: string }>();

  const { data: row, error } = await write;

  if (error) {
    console.error("[hm/interview-answers] failed to persist answers", error);
    return { ok: false, status: 500, error: "Failed to save your answers." };
  }

  return {
    ok: true,
    feedbackId: row?.id ?? null,
    answeredCount: answered.length,
    replaced: existingId != null,
    hmLabel,
  };
}
