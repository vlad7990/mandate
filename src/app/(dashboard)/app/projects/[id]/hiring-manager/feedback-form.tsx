"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { TIER_BANDS, type Tier } from "@/lib/ranking/tiers";
import {
  IconArrowDown,
  IconArrowUp,
  IconRefresh,
  IconSend,
} from "@/components/icons";
import {
  HM_RATINGS,
  HM_RATING_LABELS,
  type HmRating,
} from "./feedback-constants";

// Structured feedback form rendered inside the HM portal. In founder
// mode the form is a preview (disabled, no submission). In hiring-
// manager mode the submit handle is the share token and the action
// goes through the public /hm/[token] route's POST handler.

export type HmFeedbackCandidate = {
  id: string;
  full_name: string;
  current_title: string | null;
  current_company: string | null;
  ai_tier: Tier | null;
  recruiter_tier: Tier | null;
};

type Mode = "founder" | "hiring_manager";

const RATING_TONE: Record<HmRating, string> = {
  strong_yes:
    "border-secondary-fixed-dim/60 bg-secondary-fixed-dim/10 text-secondary-fixed-dim",
  yes: "border-primary-container/60 bg-primary-container/10 text-primary",
  maybe: "border-tertiary/60 bg-tertiary/10 text-tertiary",
  no: "border-error/60 bg-error/10 text-error",
};

export function HmFeedbackForm({
  candidates,
  submitHandle,
  mode,
}: {
  candidates: HmFeedbackCandidate[];
  submitHandle: string;
  mode: Mode;
}) {
  const router = useRouter();
  const [order, setOrder] = useState<string[]>(candidates.map((c) => c.id));
  const [ratings, setRatings] = useState<Record<string, HmRating | null>>(
    Object.fromEntries(candidates.map((c) => [c.id, null]))
  );
  const [feedbacks, setFeedbacks] = useState<Record<string, string>>(
    Object.fromEntries(candidates.map((c) => [c.id, ""]))
  );
  const [topConcern, setTopConcern] = useState("");
  const [hmLabel, setHmLabel] = useState("");
  const [pending, start] = useTransition();
  const disabled = mode === "founder";

  const ordered = order
    .map((id) => candidates.find((c) => c.id === id))
    .filter((c): c is HmFeedbackCandidate => !!c);

  const move = (index: number, dir: "up" | "down") => {
    if (disabled) return;
    setOrder((prev) => {
      const next = [...prev];
      const swap = dir === "up" ? index - 1 : index + 1;
      if (swap < 0 || swap >= next.length) return prev;
      [next[index], next[swap]] = [next[swap], next[index]];
      return next;
    });
  };

  const setRating = (id: string, rating: HmRating | null) => {
    if (disabled) return;
    setRatings((prev) => ({ ...prev, [id]: rating }));
  };

  const setFeedback = (id: string, text: string) => {
    if (disabled) return;
    setFeedbacks((prev) => ({ ...prev, [id]: text }));
  };

  const ratedCount = Object.values(ratings).filter((r) => r != null).length;

  const handleSubmit = () => {
    if (disabled || pending) return;
    if (ratedCount === 0) {
      toast.error("Rate at least one candidate before submitting.");
      return;
    }
    start(async () => {
      try {
        const response = await fetch(`/hm/${submitHandle}/api/submit`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            candidate_ratings: ratings,
            candidate_feedback: feedbacks,
            top_concern: topConcern.trim(),
            priority_order: order,
            hm_label: hmLabel.trim(),
          }),
        });
        if (!response.ok) {
          const text = await response.text();
          throw new Error(text || `Submit failed (${response.status})`);
        }
        toast.success("Feedback submitted — thanks!");
        router.refresh();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Submit failed.";
        toast.error(msg);
      }
    });
  };

  if (candidates.length === 0) {
    return null;
  }

  return (
    <section className="bg-surface-container-low border border-outline-variant">
      <header className="px-4 py-3 border-b border-outline-variant flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h2 className="font-h2 text-h2 text-on-surface uppercase tracking-tight">
            Your Feedback
          </h2>
          <p className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
            {disabled
              ? "Founder preview — fields are read-only here."
              : "Rate each candidate, share what concerns you most, and reorder by priority."}
          </p>
        </div>
        {!disabled && (
          <span className="font-mono-label text-mono-label text-outline uppercase tracking-widest tabular-nums">
            {ratedCount}/{candidates.length} rated
          </span>
        )}
      </header>

      <div className="p-4 space-y-5">
        <ol className="space-y-3">
          {ordered.map((c, i) => (
            <li
              key={c.id}
              className="bg-surface-container border border-outline-variant"
            >
              <header className="flex items-center justify-between gap-3 px-3 py-2 border-b border-outline-variant/40 flex-wrap">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-h2 text-h2 text-primary tabular-nums w-8 shrink-0">
                    #{i + 1}
                  </span>
                  <div className="min-w-0">
                    <div className="font-mono-data text-body-main text-on-surface font-semibold truncate">
                      {c.full_name}
                    </div>
                    <div className="font-mono-label text-mono-label text-outline uppercase tracking-widest truncate">
                      {c.current_title ?? "—"}
                      {c.current_company ? ` · ${c.current_company}` : ""}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {c.ai_tier && (
                    <span className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
                      AI · {TIER_BANDS[c.ai_tier].label.split(" · ")[0]}
                    </span>
                  )}
                  <ReorderButton
                    direction="up"
                    onClick={() => move(i, "up")}
                    disabled={disabled || i === 0}
                  />
                  <ReorderButton
                    direction="down"
                    onClick={() => move(i, "down")}
                    disabled={disabled || i === ordered.length - 1}
                  />
                </div>
              </header>

              <div className="p-3 space-y-3">
                <div>
                  <h4 className="font-mono-label text-mono-label text-outline uppercase tracking-widest mb-1.5">
                    Rate this candidate
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {HM_RATINGS.map((r) => {
                      const active = ratings[c.id] === r;
                      return (
                        <button
                          key={r}
                          type="button"
                          onClick={() =>
                            setRating(c.id, active ? null : r)
                          }
                          disabled={disabled}
                          className={cn(
                            "px-3 py-1.5 border font-mono-label text-mono-label uppercase tracking-widest transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
                            active
                              ? RATING_TONE[r]
                              : "border-outline-variant text-on-surface-variant hover:border-primary hover:text-primary"
                          )}
                        >
                          {HM_RATING_LABELS[r]}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label
                    htmlFor={`hm-feedback-${c.id}`}
                    className="font-mono-label text-mono-label text-outline uppercase tracking-widest"
                  >
                    Feedback for this candidate
                  </label>
                  <textarea
                    id={`hm-feedback-${c.id}`}
                    value={feedbacks[c.id] ?? ""}
                    onChange={(e) => setFeedback(c.id, e.target.value)}
                    rows={3}
                    disabled={disabled}
                    placeholder="What's standing out? Any concerns? What would shift this from a maybe to a yes?"
                    className="mt-1 w-full bg-surface-container-lowest border border-outline-variant px-3 py-2 font-mono-data text-body-main text-on-surface focus:border-primary focus:outline-none transition-colors resize-y leading-relaxed disabled:opacity-60"
                  />
                </div>
              </div>
            </li>
          ))}
        </ol>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field
            label="What concerns you most?"
            hint="One thing across the slate that gives you pause."
          >
            <textarea
              value={topConcern}
              onChange={(e) => setTopConcern(e.target.value)}
              rows={3}
              disabled={disabled}
              placeholder="Pricing, timeline, a specific gap that runs through the slate, anything…"
              className="w-full bg-surface-container-lowest border border-outline-variant px-3 py-2 font-mono-data text-body-main text-on-surface focus:border-primary focus:outline-none transition-colors resize-y leading-relaxed disabled:opacity-60"
            />
          </Field>
          <Field label="Your name (optional)" hint="So we know who reviewed.">
            <input
              type="text"
              value={hmLabel}
              onChange={(e) => setHmLabel(e.target.value)}
              disabled={disabled}
              placeholder="e.g. Jane Smith, Acme"
              className="w-full bg-surface-container-lowest border border-outline-variant px-3 py-2 font-mono-data text-body-main text-on-surface focus:border-primary focus:outline-none transition-colors disabled:opacity-60"
            />
          </Field>
        </div>

        {!disabled && (
          <footer className="flex items-center justify-end pt-2 border-t border-outline-variant/40">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={pending || ratedCount === 0}
              aria-busy={pending ? true : undefined}
              className="px-4 py-2 bg-primary-container text-on-primary-container font-mono-label text-mono-label uppercase tracking-widest hover:brightness-110 active:scale-[0.98] transition-[filter,transform] flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              {pending ? (
                <IconRefresh size={14} className="animate-spin" />
              ) : (
                <IconSend size={14} />
              )}
              {pending ? "Submitting" : "Submit Feedback"}
            </button>
          </footer>
        )}
      </div>
    </section>
  );
}

function ReorderButton({
  direction,
  onClick,
  disabled,
}: {
  direction: "up" | "down";
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={`Move ${direction}`}
      className="w-7 h-7 border border-outline-variant text-outline hover:text-primary hover:border-primary transition-colors flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary"
    >
      {direction === "up" ? (
        <IconArrowUp size={14} />
      ) : (
        <IconArrowDown size={14} />
      )}
    </button>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <div className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
        {label}
      </div>
      {children}
      {hint && (
        <p className="font-mono-label text-mono-label text-outline uppercase tracking-widest leading-snug">
          {hint}
        </p>
      )}
    </div>
  );
}
