import * as React from "react";
import { cn } from "@/lib/utils";
import type { IconProps } from "@/components/icons";

// Tonal status chip with optional leading dot. Standardises the ad-hoc
// pattern that was reimplemented across pipeline stages, project
// statuses, candidate stages, project health, and shortlist-state. One
// chip type, six tones, three intensities — so a recruiter can glance
// at any screen and read the same visual grammar.

export type ChipTone =
  | "primary"
  | "secondary"
  | "tertiary"
  | "warn"
  | "danger"
  | "neutral";

export type ChipIntensity = "soft" | "filled" | "strong";

const CHIP_PRESETS: Record<ChipTone, Record<ChipIntensity, string>> = {
  primary: {
    soft: "border-primary-container/40 text-primary",
    filled: "border-primary-container/60 bg-primary-container/10 text-primary",
    strong: "border-primary-container bg-primary-container/20 text-primary",
  },
  secondary: {
    soft: "border-secondary-fixed-dim/40 text-secondary-fixed-dim",
    filled:
      "border-secondary-fixed-dim/60 bg-secondary-fixed-dim/10 text-secondary-fixed-dim",
    strong:
      "border-secondary-fixed-dim bg-secondary-fixed-dim/20 text-secondary-fixed-dim",
  },
  tertiary: {
    soft: "border-tertiary/40 text-tertiary",
    filled: "border-tertiary/60 bg-tertiary/10 text-tertiary",
    strong: "border-tertiary bg-tertiary/20 text-tertiary",
  },
  warn: {
    soft: "border-tertiary/40 text-tertiary",
    filled: "border-tertiary/60 bg-tertiary/10 text-tertiary",
    strong: "border-tertiary bg-tertiary/20 text-tertiary",
  },
  danger: {
    soft: "border-error/40 text-error",
    filled: "border-error/60 bg-error/10 text-error",
    strong: "border-error bg-error/20 text-error",
  },
  neutral: {
    soft: "border-outline-variant text-on-surface-variant",
    filled: "border-outline-variant bg-surface-container text-on-surface-variant",
    strong:
      "border-outline bg-surface-container-high text-on-surface",
  },
};

const DOT_TONES: Record<ChipTone, string> = {
  primary: "bg-primary",
  secondary: "bg-secondary-fixed-dim",
  tertiary: "bg-tertiary",
  warn: "bg-tertiary",
  danger: "bg-error",
  neutral: "bg-outline",
};

export function StatusChip({
  children,
  tone = "neutral",
  intensity = "filled",
  dot = false,
  pulse = false,
  icon: Icon,
  className,
}: {
  children: React.ReactNode;
  tone?: ChipTone;
  intensity?: ChipIntensity;
  /** Render a leading status dot. */
  dot?: boolean;
  /** Animate the dot (only valid when `dot` is true). */
  pulse?: boolean;
  /** Leading glyph; takes precedence over the dot. */
  icon?: (props: IconProps) => React.ReactElement;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-0.5 border font-mono-label text-mono-label uppercase tracking-wider whitespace-nowrap",
        CHIP_PRESETS[tone][intensity],
        className
      )}
    >
      {Icon ? (
        <Icon size={12} className="shrink-0" />
      ) : dot ? (
        <span
          className={cn(
            "w-1.5 h-1.5 rounded-full shrink-0",
            DOT_TONES[tone],
            pulse && "animate-pulse"
          )}
          aria-hidden
        />
      ) : null}
      {children}
    </span>
  );
}
