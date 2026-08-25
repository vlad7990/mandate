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
  DIMENSION_KEYS,
  type DimensionWeights,
} from "@/lib/ai/onboarding-analysis";
import {
  applyCalibrationSuggestionAction,
  applySourcingSuggestionAction,
  dismissHealthSuggestionAction,
  generateHealthSuggestionsAction,
} from "./actions";
import { unwrap } from "@/lib/actions/result";

const PRIORITY_TONE: Record<HealthSuggestion["priority"], string> = {
  high: "border-error/60 bg-error/10 text-error",
  medium: "border-warn/60 bg-warn/10 text-warn",
  low: "border-outline-variant bg-surface-container-high text-on-surface-variant",
};

export function HealthSuggestionsPanel({
  projectId,
  initial,
  healthStatus,
  weights = null,
}: {
  projectId: string;
  initial: HealthSuggestionsBlob | null;
  healthStatus: "healthy" | "stalled" | "at_risk";
  /**
   * Current calibration weights, for the calibration-apply preview.
   * Without them the calibration Apply is not offered — a preview
   * that cannot say before → after would be a blind write.
   */
  weights?: DimensionWeights | null;
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
        const next = unwrap(await generateHealthSuggestionsAction(projectId));
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
        unwrap(await dismissHealthSuggestionAction(projectId, suggestionId));
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

  const handleApplyCalibration = (
    suggestion: HealthSuggestion,
    preview: { dimension: string; from: number; to: number }
  ) => {
    if (busy) return;
    // The apply family's one destructive in-place write — said plainly
    // before it happens (the confirmed D2 ruling).
    if (
      !window.confirm(
        `Apply ${preview.dimension} ${preview.from} → ${preview.to}? This re-scores every candidate in this search.`
      )
    ) {
      return;
    }
    setBusy(suggestion.id);
    start(async () => {
      try {
        const result = unwrap(
          await applyCalibrationSuggestionAction(projectId, suggestion.id)
        );
        toast.success(
          `${result.dimension} ${result.from} → ${result.to} · re-scoring`
        );
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

  const handleApply = (suggestion: HealthSuggestion) => {
    if (busy) return;
    setBusy(suggestion.id);
    start(async () => {
      try {
        const result = unwrap(await applySourcingSuggestionAction(
          projectId,
          suggestion.id
        ));
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
                  weights={weights}
                  busy={busy === s.id}
                  onDismiss={() => handleDismiss(s.id)}
                  onApply={() => handleApply(s)}
                  onApplyCalibration={(preview) =>
                    handleApplyCalibration(s, preview)
                  }
                />
              ))}
            </ol>
          )}
        </div>
      )}
    </Panel>
  );
}

/**
 * The calibration preview, computed the way the server will: rounded
 * delta, [0,10] clamp, refused (null) when the category, dimension,
 * delta, or baseline is unusable, or the clamp makes it a no-op.
 * Mirrors bridgeCalibrationSuggestion — the server remains the
 * authority; this only decides whether to OFFER the act.
 */
function calibrationPreview(
  suggestion: HealthSuggestion,
  weights: DimensionWeights | null
): { dimension: string; from: number; to: number } | null {
  if (suggestion.category !== "calibration" || !weights) return null;
  const dimension = suggestion.applicable_dimension;
  if (!dimension || !DIMENSION_KEYS.includes(dimension)) return null;
  const raw = suggestion.applicable_payload?.delta;
  if (typeof raw !== "number" || !Number.isFinite(raw)) return null;
  const delta = Math.round(raw);
  if (delta === 0 || Math.abs(delta) > 3) return null;
  const from = weights[dimension] ?? 0;
  const to = Math.max(0, Math.min(10, Math.round(from + delta)));
  if (to === from) return null;
  return { dimension, from, to };
}

function SuggestionRow({
  suggestion,
  weights,
  busy,
  onDismiss,
  onApply,
  onApplyCalibration,
}: {
  suggestion: HealthSuggestion;
  weights: DimensionWeights | null;
  busy: boolean;
  onDismiss: () => void;
  onApply: () => void;
  onApplyCalibration: (preview: {
    dimension: string;
    from: number;
    to: number;
  }) => void;
}) {
  const isApplyable =
    suggestion.category === "sourcing" &&
    typeof suggestion.applicable_payload?.replacement === "string" &&
    (suggestion.applicable_payload.replacement as string).trim().length > 0;
  const preview = calibrationPreview(suggestion, weights);
  return (
    <li className="flex flex-col gap-2 border border-outline-variant bg-surface-container px-3.5 py-3">
      <div className="flex items-baseline gap-2 flex-wrap">
        <span
          className={cn(
            "border px-1.5 py-0.5 font-mono-label text-[10px] font-bold uppercase tracking-[0.1em]",
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
          <pre className="mt-2 max-h-[240px] overflow-auto whitespace-pre-wrap break-words border border-outline-variant bg-surface-container-lowest px-3 py-2 font-mono-data text-mono-data leading-relaxed text-on-surface">
            {String(suggestion.applicable_payload.replacement)}
          </pre>
        </details>
      )}
      {preview && (
        <details className="group">
          <summary className="flex cursor-pointer items-center gap-1 font-mono-label text-[11px] font-semibold uppercase tracking-[0.08em] text-primary hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
            <IconChevronRight
              size={12}
              className="transition-transform group-open:rotate-90"
            />
            Preview weight change
          </summary>
          <p className="mt-2 border border-outline-variant bg-surface-container-lowest px-3 py-2 font-mono-data text-mono-data leading-relaxed text-on-surface">
            {preview.dimension} {preview.from} → {preview.to}
            <span className="block text-on-surface-variant">
              Applying re-scores every candidate in this search.
            </span>
          </p>
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
        {preview && (
          <button
            type="button"
            onClick={() => onApplyCalibration(preview)}
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
