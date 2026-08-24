"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  FEEDBACK_TYPES,
  FEEDBACK_TYPE_LABELS,
  type FeedbackType,
} from "@/lib/ai/feedback-analysis";
import { submitFeedbackAction } from "./actions";
import { IconPencil, IconRefresh, IconSend } from "@/components/icons";
import { unwrap } from "@/lib/actions/result";

export type CandidateOption = {
  id: string;
  full_name: string;
  current_title: string | null;
  current_company: string | null;
  rank: number | null;
  overall: number | null;
};

type Props = {
  projectId: string;
  candidates: CandidateOption[];
  initialCandidateId?: string | null;
};

export function FeedbackForm({
  projectId,
  candidates,
  initialCandidateId,
}: Props) {
  const router = useRouter();
  const [feedbackType, setFeedbackType] = useState<FeedbackType>(
    "recruiter_note"
  );
  const [candidateId, setCandidateId] = useState<string>(
    initialCandidateId ?? ""
  );
  const [content, setContent] = useState("");
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (content.trim().length < 4) {
      toast.error("Feedback is too short. Add at least a sentence of context.");
      return;
    }
    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.set("projectId", projectId);
        formData.set("feedbackType", feedbackType);
        formData.set("candidateId", candidateId);
        formData.set("content", content);
        unwrap(await submitFeedbackAction(formData));
        toast.success(
          "Feedback submitted — interpretation + recalibration in flight."
        );
        setContent("");
        router.refresh();
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Submit failed.";
        console.error("[feedback] submit failed", err);
        toast.error(msg);
      }
    });
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-surface-container-low border border-outline-variant p-5 space-y-4"
    >
      <header className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="font-mono-label text-mono-label text-primary uppercase tracking-widest flex items-center gap-2">
          <IconPencil size={14} />
          Submit Feedback
        </h2>
        <span className="font-mono-label text-mono-label text-outline uppercase tracking-wider">
          Auto-interpreted by Claude · may trigger recalibration
        </span>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="space-y-1.5 block">
          <span className="font-mono-label text-mono-label text-outline uppercase tracking-widest block">
            Feedback type
          </span>
          <div className="flex flex-wrap gap-1">
            {FEEDBACK_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setFeedbackType(t)}
                className={cn(
                  "px-3 py-1.5 border font-mono-label text-mono-label uppercase tracking-widest transition-colors",
                  feedbackType === t
                    ? "border-primary-container bg-primary-container/10 text-primary"
                    : "border-outline-variant text-outline hover:text-on-surface hover:border-outline"
                )}
                aria-pressed={feedbackType === t}
              >
                {FEEDBACK_TYPE_LABELS[t]}
              </button>
            ))}
          </div>
        </label>

        <label className="space-y-1.5 block">
          <span className="font-mono-label text-mono-label text-outline uppercase tracking-widest block">
            About candidate (optional)
          </span>
          <select
            value={candidateId}
            onChange={(e) => setCandidateId(e.target.value)}
            disabled={isPending}
            className="w-full bg-surface-container-lowest border border-outline-variant rounded-none px-3 py-2 font-mono-data text-body-main text-on-surface focus:border-primary focus:ring-0 outline-none transition-colors"
          >
            <option value="" className="bg-surface text-on-surface">
              {candidates.length === 0
                ? "No candidates yet"
                : "Project-wide (no candidate)"}
            </option>
            {candidates.map((c) => (
              <option
                key={c.id}
                value={c.id}
                className="bg-surface text-on-surface"
              >
                {c.full_name}
                {c.rank != null ? ` · #${c.rank}` : ""}
                {c.overall != null ? ` · ${c.overall.toFixed(1)}` : ""}
                {c.current_title ? ` — ${c.current_title}` : ""}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="space-y-1.5 block">
        <span className="font-mono-label text-mono-label text-outline uppercase tracking-widest block">
          Feedback
        </span>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={5}
          placeholder="e.g. We actually need someone with deeper regulatory experience — the calibration weighted transformation too high. Marcus is strong but his exposure to FCA reporting is thin."
          disabled={isPending}
          className="w-full bg-surface-container-lowest border border-outline-variant rounded-none px-3 py-3 font-mono-data text-body-main text-on-surface placeholder:text-outline-variant focus:border-primary focus:ring-0 outline-none transition-colors resize-y"
        />
        <span className="font-mono-label text-mono-label text-outline uppercase tracking-wider">
          {content.trim().length} chars · directional language (&ldquo;advance&rdquo;,
          &ldquo;reject&rdquo;) usually doesn&rsquo;t recalibrate; preference-shift
          language (&ldquo;we actually need…&rdquo;) usually does.
        </span>
      </label>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={isPending || content.trim().length < 4}
          aria-busy={isPending ? true : undefined}
          className="px-6 py-3 btn-notch bg-primary-container text-on-primary-container font-mono-label text-mono-label uppercase tracking-widest hover:brightness-110 active:scale-[0.98] transition-all flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {isPending ? (
            <IconRefresh size={14} className="animate-spin" />
          ) : (
            <IconSend size={14} />
          )}
          {isPending ? "Interpreting" : "Submit + Sync"}
        </button>
      </div>
    </form>
  );
}
