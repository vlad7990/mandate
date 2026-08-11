"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type {
  HealthSuggestion,
  HealthSuggestionsBlob,
} from "@/lib/ai/search-health-agent";
import {
  applySourcingSuggestionAction,
  dismissHealthSuggestionAction,
  generateHealthSuggestionsAction,
} from "./actions";

const PRIORITY_TONE: Record<HealthSuggestion["priority"], string> = {
  high: "border-error/60 bg-error/10 text-error",
  medium: "border-tertiary/60 bg-tertiary/10 text-tertiary",
  low: "border-outline-variant bg-surface-container-high text-on-surface-variant",
};

const CATEGORY_ICON: Record<HealthSuggestion["category"], string> = {
  sourcing: "travel_explore",
  calibration: "tune",
  feedback: "rate_review",
  outreach: "outgoing_mail",
  other: "lightbulb",
};

export function HealthSuggestionsPanel({
  projectId,
  initial,
  healthStatus,
}: {
  projectId: string;
  initial: HealthSuggestionsBlob | null;
  healthStatus: "healthy" | "stalled" | "at_risk";
}) {
  const router = useRouter();
  const [blob, setBlob] = useState<HealthSuggestionsBlob | null>(initial);
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);

  const ready = healthStatus === "stalled" || healthStatus === "at_risk";
  const visible =
    blob?.suggestions.filter((s) => !s.dismissed) ?? [];

  const handleGenerate = () => {
    if (pending) return;
    start(async () => {
      try {
        const next = await generateHealthSuggestionsAction(projectId);
        setBlob(next);
        toast.success(`${next.suggestions.length} suggestions ready`);
        router.refresh();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Generation failed.";
        toast.error(msg);
      }
    });
  };

  const handleDismiss = (suggestionId: string) => {
    if (busy) return;
    setBusy(suggestionId);
    start(async () => {
      try {
        await dismissHealthSuggestionAction(projectId, suggestionId);
        setBlob((b) =>
          b
            ? {
                ...b,
                suggestions: b.suggestions.map((s) =>
                  s.id === suggestionId ? { ...s, dismissed: true } : s
                ),
              }
            : b
        );
        toast.success("Suggestion dismissed");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Dismiss failed.");
      } finally {
        setBusy(null);
      }
    });
  };

  const handleApply = (suggestion: HealthSuggestion) => {
    if (busy) return;
    setBusy(suggestion.id);
    start(async () => {
      try {
        const result = await applySourcingSuggestionAction(
          projectId,
          suggestion.id
        );
        toast.success(
          `${suggestion.applicable_slot} now at v${result.version}`
        );
        // Reflect dismissal locally; the action also dismisses
        // server-side so the next generate doesn't repeat the
        // suggestion.
        setBlob((b) =>
          b
            ? {
                ...b,
                suggestions: b.suggestions.map((s) =>
                  s.id === suggestion.id ? { ...s, dismissed: true } : s
                ),
              }
            : b
        );
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Apply failed.");
      } finally {
        setBusy(null);
      }
    });
  };

  if (!ready && !blob) return null;

  return (
    <article className="bg-surface-container-low border border-tertiary/30 overflow-hidden">
      <header className="bg-tertiary/10 px-4 py-2.5 border-b border-tertiary/30 flex items-center justify-between gap-2 flex-wrap">
        <span className="font-mono-label text-mono-label text-tertiary uppercase tracking-widest flex items-center gap-2">
          <span
            className="material-symbols-outlined text-[14px]"
            style={{ fontVariationSettings: "'FILL' 1" }}
            aria-hidden
          >
            tips_and_updates
          </span>
          AI Health Suggestions
          {visible.length > 0 && (
            <span className="font-mono-label text-mono-label text-outline tabular-nums">
              · {visible.length} active
            </span>
          )}
        </span>
        <div className="flex items-center gap-2">
          {blob && (
            <span className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
              {formatRelative(blob.generated_at)}
            </span>
          )}
          <button
            type="button"
            onClick={handleGenerate}
            disabled={pending || !ready}
            aria-busy={pending ? true : undefined}
            title={
              ready
                ? undefined
                : "Health is currently healthy — no suggestions needed."
            }
            className="px-3 py-1.5 bg-primary-container text-on-primary-container font-mono-label text-mono-label uppercase tracking-widest hover:brightness-110 active:scale-[0.98] transition-[filter,transform] flex items-center gap-1.5 disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <span
              className={cn(
                "material-symbols-outlined text-[14px]",
                pending && "animate-spin"
              )}
              aria-hidden
            >
              {pending ? "progress_activity" : blob ? "refresh" : "auto_awesome"}
            </span>
            {pending
              ? "Analysing"
              : blob
                ? "Refresh suggestions"
                : "Get AI Suggestions"}
          </button>
        </div>
      </header>

      {!blob ? (
        <div className="px-5 py-6 text-center">
          <p className="text-body-main text-on-surface-variant max-w-2xl mx-auto">
            Health is currently <strong>{healthStatus.replace("_", " ")}</strong>.
            Run the agent to get 3–5 levers you can pull this week — boolean
            edits, calibration nudges, feedback follow-ups — each anchored on a
            concrete signal from the project state.
          </p>
        </div>
      ) : (
        <div className="p-4 space-y-3">
          {blob.summary && (
            <p className="text-on-surface text-body-main leading-relaxed">
              {blob.summary}
            </p>
          )}
          {visible.length === 0 ? (
            <p className="font-mono-label text-mono-label text-outline italic uppercase tracking-widest text-center py-4">
              All suggestions dismissed. Refresh to get a new set.
            </p>
          ) : (
            <ol className="space-y-2">
              {visible.map((s) => (
                <SuggestionRow
                  key={s.id}
                  suggestion={s}
                  busy={busy === s.id}
                  onDismiss={() => handleDismiss(s.id)}
                  onApply={() => handleApply(s)}
                />
              ))}
            </ol>
          )}
        </div>
      )}
    </article>
  );
}

function SuggestionRow({
  suggestion,
  busy,
  onDismiss,
  onApply,
}: {
  suggestion: HealthSuggestion;
  busy: boolean;
  onDismiss: () => void;
  onApply: () => void;
}) {
  const isApplyable =
    suggestion.category === "sourcing" &&
    typeof suggestion.applicable_payload?.replacement === "string" &&
    (suggestion.applicable_payload.replacement as string).trim().length > 0;
  return (
    <li className="bg-surface-container border border-outline-variant px-3 py-2.5 space-y-2">
      <div className="flex items-baseline gap-2 flex-wrap">
        <span
          className={cn(
            "px-1.5 py-0.5 border font-mono-label text-mono-label uppercase tracking-widest",
            PRIORITY_TONE[suggestion.priority]
          )}
        >
          {suggestion.priority}
        </span>
        <span className="font-mono-label text-mono-label text-outline uppercase tracking-widest flex items-center gap-1">
          <span className="material-symbols-outlined text-[12px]" aria-hidden>
            {CATEGORY_ICON[suggestion.category]}
          </span>
          {suggestion.category}
          {suggestion.applicable_slot && (
            <span className="text-on-surface-variant ml-1">
              · {suggestion.applicable_slot}
            </span>
          )}
          {suggestion.applicable_dimension && (
            <span className="text-on-surface-variant ml-1">
              · {suggestion.applicable_dimension}
            </span>
          )}
        </span>
        <span className="font-mono-data text-body-main text-on-surface font-semibold flex-1 min-w-0">
          {suggestion.action}
        </span>
      </div>
      <p className="font-mono-data text-body-main text-on-surface-variant leading-relaxed">
        {suggestion.rationale}
      </p>
      {isApplyable && typeof suggestion.applicable_payload?.replacement === "string" && (
        <details className="group">
          <summary className="font-mono-label text-mono-label text-primary uppercase tracking-widest cursor-pointer hover:brightness-110 flex items-center gap-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
            <span
              className="material-symbols-outlined text-[12px] group-open:rotate-90 transition-transform"
              aria-hidden
            >
              chevron_right
            </span>
            Preview replacement query
          </summary>
          <pre className="bg-surface-container-lowest border border-outline-variant text-on-surface font-mono-data text-mono-data px-3 py-2 mt-2 leading-relaxed whitespace-pre-wrap break-words max-h-[240px] overflow-auto">
            {String(suggestion.applicable_payload.replacement)}
          </pre>
        </details>
      )}
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onDismiss}
          disabled={busy}
          className="px-2 py-1 border border-outline-variant text-outline hover:text-error hover:border-error font-mono-label text-mono-label uppercase tracking-widest transition-colors disabled:opacity-60"
        >
          Dismiss
        </button>
        {isApplyable && (
          <button
            type="button"
            onClick={onApply}
            disabled={busy}
            aria-busy={busy ? true : undefined}
            className="px-3 py-1 bg-primary-container text-on-primary-container font-mono-label text-mono-label uppercase tracking-widest hover:brightness-110 active:scale-[0.98] transition-[filter,transform] flex items-center gap-1.5 disabled:opacity-60"
          >
            <span
              className={cn(
                "material-symbols-outlined text-[14px]",
                busy && "animate-spin"
              )}
              aria-hidden
            >
              {busy ? "progress_activity" : "auto_fix_high"}
            </span>
            Apply
          </button>
        )}
      </div>
    </li>
  );
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return iso;
  const delta = Date.now() - then;
  const min = Math.round(delta / 60000);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.round(hr / 24)}d ago`;
}
