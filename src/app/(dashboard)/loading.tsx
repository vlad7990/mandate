import { SkeletonCard } from "@/components/ui/skeleton";

/**
 * Route-level loading UI for every dashboard page.
 *
 * Before this existed, no route in the app had a loading boundary: a
 * server page blocked on all of its data before Next sent any HTML, so
 * navigation left the PREVIOUS page frozen on screen until the next one
 * was completely ready. On the slower pages that reads as a dead click.
 *
 * This file sits inside the (dashboard) group, so the layout — rail,
 * topbar, copilot — stays mounted and only the content region swaps to
 * the skeleton. Nothing here is route-specific on purpose: a page with a
 * genuinely different shape (the candidate dossier, the report) gets its
 * own loading.tsx next to it, which takes precedence.
 */
export default function DashboardLoading() {
  return (
    <div className="min-h-full bg-surface text-on-surface">
      <div className="mx-auto max-w-6xl space-y-8 px-8 py-10">
        <header className="space-y-3">
          <div className="flex items-center gap-3">
            <span className="h-px w-8 bg-primary" />
            <span className="font-mono-label text-mono-label uppercase tracking-widest text-outline">
              Loading
            </span>
          </div>
          <div className="h-8 w-72 animate-pulse rounded-sm bg-surface-container-high" />
        </header>

        <div className="space-y-4">
          {[0, 1, 2].map((i) => (
            <SkeletonCard key={i} index={i} lines={3} />
          ))}
        </div>
      </div>
    </div>
  );
}
