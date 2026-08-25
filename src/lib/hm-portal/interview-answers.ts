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
 * The client-interview answer landing (117, gate D4). One door — the
 * token path — and ONE mandate-level `feedback` row per submission:
 * candidate_id NULL, feedback_type 'client_interview', content
 * composing the approved set's questions with the client's answers.
 * The approved set itself is immutable; answers live here ONLY, and
 * ride the existing interpretation pipeline
 * (src/lib/hm-portal/submit.ts → runHmFeedbackPipeline) unchanged.
 */

export type PersistAnswersResult =
  | {
      ok: true;
      feedbackId: string | null;
      answeredCount: number;
      /** The label the row was stamped with — the body's, or the
       * token's issuance label when the body carried none (§128 F-4,
       * kept). */
      hmLabel: string;
    }
  | { ok: false; status: number; error: string };

/**
 * Write the one mandate-level feedback row. Service-role write: the
 * token path has no session. Answers matching no question id in the
 * approved set are ignored — the set is the contract.
 */
export async function persistClientInterviewAnswers(args: {
  supabase: SupabaseClient;
  projectId: string;
  organizationId: string;
  questions: ClientInterviewQuestion[];
  version: number;
  parsed: ParsedAnswers;
  fallbackHmLabel?: string | null;
}): Promise<PersistAnswersResult> {
  const { supabase, projectId, organizationId, questions, version, parsed } =
    args;
  const hmLabel =
    parsed.hm_label.trim() || (args.fallbackHmLabel ?? "").trim();

  const known = new Set(questions.map((q) => q.id));
  const answered = Object.keys(parsed.answers).filter((id) => known.has(id));
  if (answered.length === 0) {
    return {
      ok: false,
      status: 400,
      error: "Answer at least one question before submitting.",
    };
  }

  const { data: row, error } = await supabase
    .from("feedback")
    .insert({
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
      interpreted: {},
      triggered_recalibration: false,
    })
    .select("id")
    .single<{ id: string }>();

  if (error) {
    console.error("[hm/interview-answers] failed to persist answers", error);
    return { ok: false, status: 500, error: "Failed to save your answers." };
  }

  return {
    ok: true,
    feedbackId: row?.id ?? null,
    answeredCount: answered.length,
    hmLabel,
  };
}
