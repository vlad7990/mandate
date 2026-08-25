// The pure half of the client-interview answer landing (117): body
// parsing and content composition, importable from tests and client
// code alike. The persist half — service-role writes — lives in
// interview-answers.ts behind `server-only`.

import type { ClientInterviewQuestion } from "@/lib/ai/client-interview-agent";

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value
  );
}

export type ParsedAnswers = {
  /** The approved client_interviews row the answers are against. */
  interview_id: string;
  /** question id → the client's answer text (non-empty entries only). */
  answers: Record<string, string>;
  hm_label: string;
};

export type ParseAnswersResult =
  | { ok: true; value: ParsedAnswers }
  | { ok: false; error: string };

export function parseAnswersBody(input: unknown): ParseAnswersResult {
  if (!input || typeof input !== "object") {
    return { ok: false, error: "Body must be a JSON object." };
  }
  const obj = input as Record<string, unknown>;

  const interviewId = obj.interview_id;
  if (typeof interviewId !== "string" || !isUuid(interviewId)) {
    return { ok: false, error: "interview_id must be a uuid." };
  }

  const answersRaw = obj.answers;
  if (!answersRaw || typeof answersRaw !== "object" || Array.isArray(answersRaw)) {
    return { ok: false, error: "answers must be an object." };
  }
  const answers: Record<string, string> = {};
  for (const [k, v] of Object.entries(answersRaw as Record<string, unknown>)) {
    // Question ids are app-assigned ("q01", …) — accept a conservative
    // shape so a hostile body cannot smuggle arbitrary keys into the
    // composed content.
    if (!/^q\d{2,3}$/.test(k)) continue;
    if (typeof v !== "string") continue;
    const trimmed = v.trim();
    if (trimmed.length === 0) continue;
    answers[k] = trimmed;
  }

  const hm_label = typeof obj.hm_label === "string" ? obj.hm_label : "";

  return { ok: true, value: { interview_id: interviewId, answers, hm_label } };
}

/**
 * Compose the single feedback row's content: every ANSWERED question
 * with its answer, in the set's own order. Unanswered questions are
 * omitted — a client answering three of eight is three answers, not
 * five empty lines.
 */
export function composeClientInterviewContent(
  questions: ClientInterviewQuestion[],
  answers: Record<string, string>,
  hmLabel: string,
  version: number
): string {
  const lines: string[] = [];
  lines.push(`CLIENT INTERVIEW — answers to question set v${version}`);
  if (hmLabel) lines.push(`From: ${hmLabel}`);
  for (const q of questions) {
    const answer = answers[q.id];
    if (!answer) continue;
    lines.push("");
    lines.push(`Q: ${q.question}`);
    lines.push(`A: ${answer}`);
  }
  return lines.join("\n");
}
