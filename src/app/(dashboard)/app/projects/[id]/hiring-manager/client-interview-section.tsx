"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { IconSend } from "@/components/icons";

// The client-interview section of the portal (117 gate D3/D4; 127 gate
// D1(b)/D3(c)). Renders ONLY an APPROVED question set — approval is the
// human gate; drafts never reach this component.
//
// TWO doors can answer, and the component is told which by `door`:
//   * the token door (/hm/[token]) — anonymous, so it asks for a name,
//     and locks after one submission because the page is a one-shot
//     link with nobody to come back as.
//   * the signed-in door (/portal) — the caller is already named, so
//     the name field is not asked for and cannot be spoofed, and the
//     form stays editable because D3(c) rules that a principal holds
//     ONE answer per mandate which re-answering edits in place.
// The founder preview passes no door and stays read-only.

export type PortalClientInterviewQuestion = {
  id: string;
  question: string;
  why_it_matters: string;
};

export type PortalClientInterview = {
  id: string;
  version: number;
  intro: string;
  questions: PortalClientInterviewQuestion[];
};

/** Present ⇒ this door may answer. Absent ⇒ the section is read-only. */
export type ClientInterviewAnswerDoor = {
  /** Where answers POST. */
  path: string;
  /**
   * True when the door already knows who is answering (the signed-in
   * portal). The name field is then neither asked for nor trusted —
   * the route stamps the session's own identity.
   */
  identityKnown: boolean;
  /**
   * The caller's OWN previous answers, for edit-in-place under D3(c).
   * Without this a client returning to correct one answer would
   * silently drop the others, because a re-answer replaces the row.
   */
  previous: { answers: Record<string, string>; answeredAt: string } | null;
};

export function ClientInterviewSection({
  interview,
  door,
}: {
  interview: PortalClientInterview;
  door?: ClientInterviewAnswerDoor | null;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>(
    () => door?.previous?.answers ?? {}
  );
  const [label, setLabel] = useState("");
  const [pending, start] = useTransition();
  // Sticky on success, mirroring the feedback form: a vanished toast
  // over a still-live SUBMIT button reads as "did that land?".
  const [submitted, setSubmitted] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(
    door?.previous?.answeredAt ?? null
  );

  const readOnly = !door;
  // The token door is a one-shot link; the signed-in door is a page the
  // author can come back to, so it never locks itself.
  const locked = submitted && !door?.identityKnown;
  const answeredCount = Object.values(answers).filter(
    (v) => v.trim().length > 0
  ).length;

  const submit = () => {
    if (!door || pending || locked) return;
    if (answeredCount === 0) {
      toast.error("Answer at least one question before submitting.");
      return;
    }
    start(async () => {
      try {
        const res = await fetch(door.path, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            interview_id: interview.id,
            answers,
            hm_label: label,
          }),
        });
        if (!res.ok) {
          let message = "Submission failed. Try again.";
          const text = await res.text();
          try {
            const parsed = JSON.parse(text) as { error?: string };
            if (parsed.error) message = parsed.error;
          } catch {
            if (text) message = text;
          }
          throw new Error(message);
        }
        setSubmitted(true);
        setSavedAt(new Date().toISOString());
        toast.success(
          savedAt ? "Answers updated — thank you" : "Answers submitted — thank you"
        );
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Submission failed. Try again."
        );
      }
    });
  };

  return (
    <section className="space-y-3">
      <header className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="font-h2 text-h2 text-on-surface uppercase tracking-tight">
          Questions from the search team
        </h2>
        <span className="font-mono-label text-mono-label text-outline uppercase tracking-widest tabular-nums">
          {interview.questions.length} question
          {interview.questions.length === 1 ? "" : "s"} · v{interview.version}
        </span>
      </header>

      <div className="bg-surface-container-low border border-outline-variant p-4 space-y-4">
        {interview.intro && (
          <p className="text-body-main text-on-surface-variant leading-relaxed max-w-2xl">
            {interview.intro}
          </p>
        )}

        {readOnly && (
          <p className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
            Preview — answers are submitted from the client&apos;s share link
          </p>
        )}

        {/* D3(c) made visible: the author is editing one standing
            answer, not adding another. Saying so before the fields is
            the difference between "add a note" and "change my mind". */}
        {!readOnly && savedAt && (
          <p className="font-mono-label text-mono-label text-secondary-fixed-dim uppercase tracking-widest">
            You answered {formatAnsweredAt(savedAt)} — editing replaces
            your answers
          </p>
        )}

        <ol className="space-y-4">
          {interview.questions.map((q, i) => (
            <li key={q.id} className="space-y-1.5">
              <label
                htmlFor={`ci-${q.id}`}
                className="block text-body-main text-on-surface leading-snug"
              >
                <span className="font-mono-data text-outline mr-2">
                  {String(i + 1).padStart(2, "0")}
                </span>
                {q.question}
              </label>
              {q.why_it_matters && (
                <p className="text-body-main text-on-surface-variant leading-snug pl-3 border-l border-outline-variant/60">
                  {q.why_it_matters}
                </p>
              )}
              <textarea
                id={`ci-${q.id}`}
                rows={2}
                disabled={readOnly || locked}
                value={answers[q.id] ?? ""}
                onChange={(e) =>
                  setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))
                }
                placeholder={readOnly ? "" : "Your answer (optional)"}
                className="w-full bg-surface-container-lowest border border-outline-variant px-3 py-2 text-body-main text-on-surface placeholder:text-outline focus:border-primary focus:outline-none disabled:opacity-60 resize-y"
              />
            </li>
          ))}
        </ol>

        {!readOnly && !locked && (
          <div className="flex items-end justify-between gap-3 flex-wrap border-t border-outline-variant/40 pt-3">
            {/* Asked for only where nobody knows who is typing. On the
                signed-in door the route stamps the session's own
                identity, so a name field here could only ever be a way
                to claim somebody else's words. */}
            {door?.identityKnown ? (
              <span aria-hidden />
            ) : (
              <div className="space-y-1 min-w-0">
                <label
                  htmlFor="ci-label"
                  className="block font-mono-label text-mono-label text-outline uppercase tracking-widest"
                >
                  Your name (optional)
                </label>
                <input
                  id="ci-label"
                  type="text"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="Jane Smith, VP Engineering"
                  className="bg-surface-container-lowest border border-outline-variant px-3 py-1.5 text-body-main text-on-surface placeholder:text-outline focus:border-primary focus:outline-none w-64 max-w-full"
                />
              </div>
            )}
            <button
              type="button"
              onClick={submit}
              disabled={pending || answeredCount === 0}
              className={cn(
                "px-4 py-2 btn-notch bg-primary-container text-on-primary-container font-mono-label text-mono-label uppercase tracking-widest",
                "hover:brightness-110 active:scale-[0.98] transition-[filter,transform] disabled:opacity-60",
                "inline-flex items-center gap-2"
              )}
            >
              <IconSend size={14} />
              {pending
                ? savedAt
                  ? "Updating…"
                  : "Submitting…"
                : savedAt
                  ? `Update ${answeredCount} answer${answeredCount === 1 ? "" : "s"}`
                  : `Submit ${answeredCount > 0 ? `${answeredCount} answer${answeredCount === 1 ? "" : "s"}` : "answers"}`}
            </button>
          </div>
        )}

        {locked && (
          <p className="font-mono-label text-mono-label text-secondary-fixed-dim uppercase tracking-widest border-t border-outline-variant/40 pt-3">
            Answers submitted — the search team has them. You can close
            this page.
          </p>
        )}
      </div>
    </section>
  );
}

/**
 * "You answered 12 Aug 2026, 14:20" — a date the author can recognise
 * as their own visit. Deliberately absolute rather than relative: "3
 * weeks ago" is the wrong precision for deciding whether an answer is
 * still what you think.
 */
function formatAnsweredAt(iso: string): string {
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return iso;
  return when.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
