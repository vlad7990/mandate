import * as React from "react";
import { cn } from "@/lib/utils";

// Bloomberg-style instrument tile: a tiny uppercase label, a large
// tabular-nums value, a thin unit line beneath. Optional left edge
// accent and trailing trend indicator (delta arrow / sparkline slot).
//
// Used across the dashboard root, project hero, analytics, and project
// metrics. Variants stay tonal-only — no rounded corners, no dropshadow,
// no chrome that fights the data.

export type KpiAccent = "primary" | "secondary" | "warn" | "danger" | "neutral";

const ACCENT_BAR: Record<KpiAccent, string> = {
  primary: "bg-primary",
  secondary: "bg-secondary-fixed-dim",
  warn: "bg-tertiary",
  danger: "bg-error",
  neutral: "bg-outline-variant",
};

const ACCENT_VALUE: Record<KpiAccent, string> = {
  primary: "text-primary",
  secondary: "text-secondary-fixed-dim",
  warn: "text-tertiary",
  danger: "text-error",
  neutral: "text-on-surface",
};

export type KpiDeltaDirection = "up" | "down" | "flat";

export type KpiDelta = {
  direction: KpiDeltaDirection;
  /** Raw delta string, e.g. "+3", "−1.2pt", "12%". Rendered as-is. */
  label: string;
  /** Optional override for tone: by default up=secondary, down=error. */
  tone?: "secondary" | "danger" | "neutral";
};

const DELTA_TONE: Record<NonNullable<KpiDelta["tone"]> | KpiDeltaDirection, string> = {
  up: "text-secondary-fixed-dim",
  down: "text-error",
  flat: "text-outline",
  secondary: "text-secondary-fixed-dim",
  danger: "text-error",
  neutral: "text-outline",
};

const DELTA_ICON: Record<KpiDeltaDirection, string> = {
  up: "trending_up",
  down: "trending_down",
  flat: "trending_flat",
};

export function KpiTile({
  label,
  value,
  unit,
  accent = "neutral",
  delta,
  className,
}: {
  label: string;
  value: string;
  unit?: string;
  accent?: KpiAccent;
  delta?: KpiDelta;
  className?: string;
}) {
  const deltaTone = delta?.tone
    ? DELTA_TONE[delta.tone]
    : DELTA_TONE[delta?.direction ?? "flat"];

  return (
    <div
      className={cn(
        "relative bg-surface-container-low border border-outline-variant min-h-[96px] p-3 flex flex-col justify-between overflow-hidden",
        className
      )}
    >
      <span
        className={cn("absolute left-0 top-0 bottom-0 w-0.5", ACCENT_BAR[accent])}
        aria-hidden
      />
      <div className="flex items-start justify-between gap-2 pl-1.5">
        <span className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
          {label}
        </span>
        {delta && (
          <span
            className={cn(
              "font-mono-label text-mono-label uppercase tracking-wider tabular-nums flex items-center gap-1 shrink-0",
              deltaTone
            )}
            aria-label={`Change: ${delta.label}`}
          >
            <span
              className="material-symbols-outlined text-[12px]"
              aria-hidden
            >
              {DELTA_ICON[delta.direction]}
            </span>
            {delta.label}
          </span>
        )}
      </div>
      <div className="pl-1.5 flex items-baseline gap-2 leading-none">
        <span
          className={cn(
            "font-h2 text-h2 tabular-nums",
            ACCENT_VALUE[accent]
          )}
        >
          {value}
        </span>
      </div>
      {unit && (
        <span className="pl-1.5 font-mono-label text-mono-label text-outline uppercase tracking-wider">
          {unit}
        </span>
      )}
    </div>
  );
}
