"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { RankChangeReason } from "./rank-change-types";
import {
  IconAnalytics,
  IconArrowDown,
  IconArrowUp,
  IconMinus,
} from "@/components/icons";

type Movement =
  | { kind: "new" }
  | { kind: "same" }
  | { kind: "up"; delta: number }
  | { kind: "down"; delta: number };

function movementSummary(
  current: number | null,
  previous: number | null
): Movement {
  if (current == null || previous == null) return { kind: "new" };
  if (current === previous) return { kind: "same" };
  const delta = previous - current;
  if (delta > 0) return { kind: "up", delta };
  return { kind: "down", delta: -delta };
}

const TRIGGER_LABELS: Record<string, string> = {
  feedback: "Feedback received",
  recalibration: "Recalibration applied",
  weights_edit: "Weights manually edited",
  new_candidate: "New candidate added",
  scoring_run: "Scoring run",
};

export function RankMovementButton({
  currentRank,
  previousRank,
  changedAt,
  reason,
  candidateName,
}: {
  currentRank: number;
  previousRank: number | null;
  changedAt: string | null;
  reason: RankChangeReason | null;
  candidateName: string;
}) {
  const [open, setOpen] = useState(false);
  const movement = movementSummary(currentRank, previousRank);
  const hasReason = reason !== null;

  return (
    <>
      <button
        type="button"
        onClick={() => hasReason && setOpen(true)}
        disabled={!hasReason}
        aria-label={
          hasReason
            ? "Show rank change explanation"
            : "No rank change to explain"
        }
        title={
          hasReason
            ? "Click for rank change explanation"
            : "Rank stable since last scoring run"
        }
        className={cn(
          "font-mono-label text-mono-label uppercase tracking-widest tabular-nums flex items-center gap-1 w-14 shrink-0 disabled:cursor-default",
          movement.kind === "new"
            ? "text-primary"
            : movement.kind === "same"
              ? "text-outline"
              : movement.kind === "up"
                ? "text-secondary-fixed-dim"
                : "text-error",
          hasReason &&
            "hover:bg-surface-container-high focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary cursor-pointer"
        )}
      >
        {movement.kind === "new" && (
          <>
            NEW
          </>
        )}
        {movement.kind === "same" && (
          <>
            <IconMinus size={14} />
            FLAT
          </>
        )}
        {movement.kind === "up" && (
          <>
            <IconArrowUp size={14} />
            +{movement.delta}
          </>
        )}
        {movement.kind === "down" && (
          <>
            <IconArrowDown size={14} />
            −{movement.delta}
          </>
        )}
      </button>

      {open && reason && (
        <ExplanationModal
          onClose={() => setOpen(false)}
          movement={movement}
          reason={reason}
          changedAt={changedAt}
          candidateName={candidateName}
        />
      )}
    </>
  );
}

function ExplanationModal({
  onClose,
  movement,
  reason,
  changedAt,
  candidateName,
}: {
  onClose: () => void;
  movement: Movement;
  reason: RankChangeReason;
  changedAt: string | null;
  candidateName: string;
}) {
  const summary = plainEnglishSummary(candidateName, movement, reason);
  const overallDelta =
    reason.previous_overall != null
      ? reason.new_overall - reason.previous_overall
      : null;

  return (
    <div
      className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="rank-change-title"
        className="bg-surface-container border border-outline-variant max-w-2xl w-full max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="bg-surface-container-high px-4 py-3 border-b border-outline-variant flex items-center justify-between gap-2 flex-wrap">
          <h2
            id="rank-change-title"
            className="font-mono-label text-mono-label text-primary uppercase tracking-widest flex items-center gap-2"
          >
            <IconAnalytics size={14} />
            RANK_CHANGE_EXPLAINED
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-7 h-7 border border-outline-variant text-outline hover:text-on-surface hover:border-outline flex items-center justify-center transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary"
          >
            ✕
          </button>
        </header>

        <div className="p-4 space-y-4">
          {/* Plain-English summary at the top */}
          <p className="text-on-surface text-body-main leading-relaxed">
            {summary}
          </p>

          <div className="grid grid-cols-3 gap-2">
            <StatBlock
              label="Previous rank"
              value={
                reason.previous_rank != null
                  ? `#${String(reason.previous_rank).padStart(2, "0")}`
                  : "—"
              }
            />
            <StatBlock
              label="New rank"
              value={`#${String(reason.new_rank).padStart(2, "0")}`}
              tone={
                movement.kind === "up"
                  ? "good"
                  : movement.kind === "down"
                    ? "bad"
                    : "neutral"
              }
            />
            <StatBlock
              label="Overall Δ"
              value={
                overallDelta == null
                  ? "—"
                  : `${overallDelta > 0 ? "+" : ""}${overallDelta.toFixed(1)}`
              }
              tone={
                overallDelta == null
                  ? "neutral"
                  : overallDelta > 0
                    ? "good"
                    : overallDelta < 0
                      ? "bad"
                      : "neutral"
              }
            />
          </div>

          <Section title="Trigger">
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="px-2 py-1 border border-outline-variant bg-surface-container-low font-mono-label text-mono-label uppercase tracking-widest">
                {TRIGGER_LABELS[reason.trigger] ?? reason.trigger}
              </span>
              {changedAt && (
                <span className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
                  {formatRelative(changedAt)}
                </span>
              )}
            </div>
            {reason.summary && (
              <p className="font-mono-data text-body-main text-on-surface-variant leading-relaxed mt-2">
                {reason.summary}
              </p>
            )}
          </Section>

          {reason.dimension_score_deltas &&
            reason.dimension_score_deltas.length > 0 && (
              <Section title="Dimension score changes">
                <ul className="space-y-1.5">
                  {reason.dimension_score_deltas.map((d) => {
                    const delta = d.after - d.before;
                    return (
                      <li
                        key={d.dimension}
                        className="bg-surface-container-low border border-outline-variant px-3 py-2 flex items-baseline justify-between gap-3"
                      >
                        <span className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
                          {d.dimension}
                        </span>
                        <span className="font-mono-data text-body-main tabular-nums flex items-baseline gap-2">
                          <span className="text-on-surface-variant">
                            {d.before}
                          </span>
                          <span className="text-outline">→</span>
                          <span className="text-on-surface font-semibold">
                            {d.after}
                          </span>
                          <span
                            className={cn(
                              "px-1.5 border font-mono-label text-mono-label uppercase tracking-widest",
                              delta > 0
                                ? "border-secondary-fixed-dim/60 bg-secondary-fixed-dim/10 text-secondary-fixed-dim"
                                : "border-error/60 bg-error/10 text-error"
                            )}
                          >
                            {delta > 0 ? "+" : ""}
                            {delta}
                          </span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </Section>
            )}
        </div>

        <footer className="border-t border-outline-variant px-4 py-3 flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 border border-outline-variant text-on-surface-variant font-mono-label text-mono-label uppercase tracking-widest hover:border-primary hover:text-primary transition-colors"
          >
            Close
          </button>
        </footer>
      </div>
    </div>
  );
}

function StatBlock({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "good" | "bad" | "neutral";
}) {
  const cls =
    tone === "good"
      ? "text-secondary-fixed-dim"
      : tone === "bad"
        ? "text-error"
        : "text-on-surface";
  return (
    <div className="bg-surface-container-low border border-outline-variant p-3 space-y-1">
      <div className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
        {label}
      </div>
      <div className={cn("font-h2 text-h2 tabular-nums", cls)}>{value}</div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h3 className="font-mono-label text-mono-label text-primary uppercase tracking-widest">
        {title}
      </h3>
      {children}
    </section>
  );
}

function plainEnglishSummary(
  candidateName: string,
  movement: Movement,
  reason: RankChangeReason
): string {
  const trigger = TRIGGER_LABELS[reason.trigger] ?? reason.trigger;
  const direction =
    movement.kind === "up"
      ? `moved up ${movement.delta} place${movement.delta === 1 ? "" : "s"}`
      : movement.kind === "down"
        ? `moved down ${movement.delta} place${movement.delta === 1 ? "" : "s"}`
        : movement.kind === "new"
          ? "entered the leaderboard"
          : "stayed in place";
  const detail = reason.summary ? ` — ${reason.summary}` : "";
  return `${candidateName} ${direction} after ${trigger.toLowerCase()}${detail}.`;
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return iso;
  const delta = Date.now() - then;
  const min = Math.round(delta / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.round(hr / 24)}d ago`;
}
