import { cn } from "@/lib/utils";
import { TIER_BANDS, type Tier } from "@/lib/ranking/tiers";

// Compact "AI tier vs Recruiter tier" widget used on the candidate
// profile hero, ranking page rows, shortlist builder, and the project
// candidate-search panel. Renders as two tone-coded chips with a small
// separator icon — `swap_horiz` when AI and recruiter disagree,
// `compare_arrows` when they match (or one is missing). Server-safe
// (no "use client") so it can be embedded in either surface.

export type TierComparisonProps = {
  aiTier: Tier | null;
  recruiterTier: Tier | null;
  /** Drop the "AI:" / "REC:" prefixes when space is tight. */
  compact?: boolean;
  className?: string;
};

export function TierComparison({
  aiTier,
  recruiterTier,
  compact = false,
  className,
}: TierComparisonProps) {
  const disagree =
    aiTier && recruiterTier && aiTier !== recruiterTier ? true : false;
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 shrink-0",
        className
      )}
      title={disagree ? "AI and recruiter disagree" : "AI vs recruiter tier"}
    >
      <TierBadge label="AI" tier={aiTier} compact={compact} />
      <span
        className={cn(
          "material-symbols-outlined text-[14px]",
          disagree ? "text-tertiary" : "text-outline"
        )}
        aria-hidden
      >
        {disagree ? "swap_horiz" : "compare_arrows"}
      </span>
      <TierBadge label="REC" tier={recruiterTier} compact={compact} />
    </div>
  );
}

export function TierBadge({
  label,
  tier,
  compact,
}: {
  label: string;
  tier: Tier | null;
  compact?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1">
      {!compact && (
        <span className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
          {label}
        </span>
      )}
      <span
        className={cn(
          "px-1.5 py-0.5 border font-mono-label text-mono-label uppercase tracking-widest tabular-nums",
          tier ? tierToneClass(tier) : "border-outline-variant text-outline"
        )}
      >
        {tier ? TIER_BANDS[tier].label.split(" · ")[0] : "—"}
      </span>
    </span>
  );
}

export function tierToneClass(tier: Tier): string {
  switch (tier) {
    case "tier_1":
      return "border-secondary-fixed-dim/60 bg-secondary-fixed-dim/10 text-secondary-fixed-dim";
    case "tier_2":
      return "border-primary-container/60 bg-primary-container/10 text-primary";
    case "tier_3":
      return "border-tertiary/60 bg-tertiary/10 text-tertiary";
    case "tier_4":
      return "border-error/60 bg-error/10 text-error";
  }
}
