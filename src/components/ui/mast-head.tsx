import * as React from "react";
import { cn } from "@/lib/utils";

// Reusable mast-header pattern: a tone-coded chip on the left, a tinted
// horizontal rule running edge-to-edge across the section, and optional
// meta content on the right. Establishes a strong "chapter break" inside
// scrolls of cards or rows. Used across ranking tiers, shortlist
// sections, feedback cards, and the job spec editor.

export type MastTone = "primary" | "secondary" | "tertiary" | "error" | "neutral";

const CHIP_TONES: Record<MastTone, string> = {
  primary:
    "border-primary-container/60 bg-primary-container/10 text-primary",
  secondary:
    "border-secondary-fixed-dim/60 bg-secondary-fixed-dim/10 text-secondary-fixed-dim",
  tertiary: "border-tertiary/60 bg-tertiary/10 text-tertiary",
  error: "border-error/60 bg-error/10 text-error",
  neutral: "border-outline-variant text-on-surface-variant",
};

const RULE_TONES: Record<MastTone, string> = {
  primary: "bg-primary-container/40",
  secondary: "bg-secondary-fixed-dim/40",
  tertiary: "bg-tertiary/40",
  error: "bg-error/40",
  neutral: "bg-outline-variant",
};

export function MastHead({
  tone = "primary",
  label,
  meta,
  className,
}: {
  tone?: MastTone;
  label: React.ReactNode;
  meta?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-3 flex-wrap", className)}>
      <span
        className={cn(
          "min-w-0 px-3 py-1.5 border font-mono-label text-mono-label uppercase tracking-widest flex items-center gap-2",
          CHIP_TONES[tone]
        )}
      >
        {label}
      </span>
      <div className={cn("flex-1 h-px", RULE_TONES[tone])} />
      {/*
        Not `shrink-0`. Callers pass arbitrary prose here — Skills Studio
        sends "Org-wide rules captured from a client's ..." — and an
        unshrinkable box around a sentence overflows the section at any
        width narrower than the sentence. `min-w-0` lets it wrap instead,
        which is what a caption should do.
      */}
      {meta != null && (
        <span className="min-w-0 font-mono-label text-mono-label text-outline uppercase tracking-wider">
          {meta}
        </span>
      )}
    </div>
  );
}
