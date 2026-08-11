"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { IconChevronRight, IconRefresh, IconSpark } from "@/components/icons";
import {
  PANEL_BODY,
  PANEL_BUTTON,
  PANEL_BUTTON_QUIET,
  Panel,
  PanelMeta,
} from "@/components/projects/panel";
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
    <Panel
      title="Health suggestions"
      tone="notice"
      meta={
        <PanelMeta>
          {[
            visible.length > 0 ? `${visible.length} active` : null,
            blob ? formatRelative(blob.generated_at) : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </PanelMeta>
      }
      action={
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
          className={PANEL_BUTTON}
        >
          {pending || blob ? (
            <IconRefresh size={14} className={cn(pending && "animate-spin")} />
          ) : (
            <IconSpark size={14} />
          )}
          {pending ? "Analysing" : blob ? "Refresh" : "Get suggestions"}
        </button>
      }
    >
      {!blob ? (
        <div className={PANEL_BODY}>
          <p className="max-w-[70ch] text-[13px] leading-relaxed text-on-surface-variant">
            Health is currently <strong>{healthStatus.replace("_", " ")}</strong>.
            Run the agent to get 3–5 levers you can pull this week — boolean
            edits, calibration nudges, feedback follow-ups — each anchored on a
            concrete signal from the project state.
          </p>
        </div>
      ) : (
        <div className={cn(PANEL_BODY, "flex flex-col gap-3")}>
          {blob.summary && (
            <p className="text-[13px] leading-relaxed text-on-surface">
              {blob.summary}
            </p>
          )}
          {visible.length === 0 ? (
            <p className="text-[13px] leading-relaxed text-outline">
              All suggestions dismissed. Refresh to get a new set.
            </p>
          ) : (
            <ol className="flex flex-col gap-2">
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
    </Panel>
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
    <li className="flex flex-col gap-2 rounded-[10px] border border-outline-variant bg-surface-container px-3.5 py-3">
      <div className="flex items-baseline gap-2 flex-wrap">
        <span
          className={cn(
            "rounded-md border px-1.5 py-0.5 font-mono-label text-[10px] font-bold uppercase tracking-[0.1em]",
            PRIORITY_TONE[suggestion.priority]
          )}
        >
          {suggestion.priority}
        </span>
        <span className="flex items-center gap-1 font-mono-label text-[10px] uppercase tracking-[0.1em] text-outline">
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
        <span className="min-w-0 flex-1 text-[13px] font-semibold text-on-surface">
          {suggestion.action}
        </span>
      </div>
      <p className="text-[13px] leading-relaxed text-on-surface-variant">
        {suggestion.rationale}
      </p>
      {isApplyable && typeof suggestion.applicable_payload?.replacement === "string" && (
        <details className="group">
          <summary className="flex cursor-pointer items-center gap-1 font-mono-label text-[11px] font-semibold uppercase tracking-[0.08em] text-primary hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
            <IconChevronRight
              size={12}
              className="transition-transform group-open:rotate-90"
            />
            Preview replacement query
          </summary>
          <pre className="mt-2 max-h-[240px] overflow-auto whitespace-pre-wrap break-words rounded-md border border-outline-variant bg-surface-container-lowest px-3 py-2 font-mono-data text-mono-data leading-relaxed text-on-surface">
            {String(suggestion.applicable_payload.replacement)}
          </pre>
        </details>
      )}
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onDismiss}
          disabled={busy}
          className={cn(PANEL_BUTTON_QUIET, "hover:border-error hover:text-error")}
        >
          Dismiss
        </button>
        {isApplyable && (
          <button
            type="button"
            onClick={onApply}
            disabled={busy}
            aria-busy={busy ? true : undefined}
            className={PANEL_BUTTON}
          >
            {busy ? (
              <IconRefresh size={14} className="animate-spin" />
            ) : (
              <IconSpark size={14} />
            )}
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
