import { cn } from "@/lib/utils";

/**
 * Loading placeholder. Matches the idiom the generating views already use
 * (`bg-surface-container-high`, `rounded-sm`, `animate-pulse`) so a route
 * skeleton and an agent's drafting skeleton read as the same system.
 *
 * `delay` staggers rows so a stack of bars pulses as a wave rather than
 * flashing in unison — the same 80ms step the plan/profile views use.
 */
export function Skeleton({
  className,
  width,
  delay = 0,
}: {
  className?: string;
  width?: string;
  delay?: number;
}) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "h-3 rounded-sm bg-surface-container-high animate-pulse",
        className
      )}
      style={{ width, animationDelay: delay ? `${delay}ms` : undefined }}
    />
  );
}

/**
 * A card of skeleton bars — the repeating unit of every route skeleton.
 * `lines` bars at decreasing widths, so the block reads as prose rather
 * than a solid slab.
 */
export function SkeletonCard({
  lines = 3,
  label,
  index = 0,
}: {
  lines?: number;
  label?: string;
  index?: number;
}) {
  return (
    <div className="space-y-3 border border-outline-variant bg-surface-container-low p-5">
      {label ? (
        <div className="flex items-center justify-between">
          <span className="font-mono-label text-mono-label uppercase tracking-widest text-secondary-fixed-dim">
            {label}
          </span>
          <span className="font-mono-label text-mono-label uppercase tracking-wider text-outline">
            LOADING…
          </span>
        </div>
      ) : null}
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton
          key={i}
          width={`${88 - i * 12}%`}
          delay={index * 80 + i * 40}
        />
      ))}
    </div>
  );
}
