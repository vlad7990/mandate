"use client";

import { useEffect } from "react";
import Link from "next/link";
import { IconAlert, IconRefresh, IconArrowLeft } from "@/components/icons";

/**
 * Route-level error boundary for every dashboard page.
 *
 * Before this existed, an error thrown in any server component fell
 * through to Next's built-in error page: unstyled, outside the shell,
 * and with no way back except the browser's back button. A recruiter
 * mid-search saw the product disappear.
 *
 * Sitting inside the (dashboard) group means the rail and topbar stay
 * mounted — only the content region is replaced, so navigating away is
 * always one click. `reset()` re-renders the segment, which is enough
 * to recover from a transient query failure without a full reload.
 *
 * The digest is surfaced deliberately: it is the only handle a user can
 * quote back to us for a server error whose message Next redacts in
 * production.
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Until error monitoring lands, the console is the only record.
    console.error("[dashboard] route error", error);
  }, [error]);

  return (
    <div className="min-h-full bg-surface text-on-surface">
      <div className="mx-auto max-w-2xl space-y-8 px-8 py-16">
        <header className="space-y-3">
          <div className="flex items-center gap-3">
            <span className="h-px w-8 bg-error" />
            <span className="font-mono-label text-mono-label uppercase tracking-widest text-error">
              Something broke
            </span>
          </div>
          <h1 className="font-h1 text-h1">This page didn&apos;t load</h1>
          <p className="max-w-xl text-body-main text-on-surface-variant">
            The error was on our side, not yours. Nothing you were working on
            has been lost — retrying reloads just this page.
          </p>
        </header>

        <div className="flex items-start gap-3 border border-outline-variant bg-surface-container-low p-5">
          <IconAlert size={18} />
          <div className="min-w-0 space-y-2">
            <p className="font-mono-label text-mono-label uppercase tracking-widest text-outline">
              Reference
            </p>
            <p className="break-all font-mono-label text-mono-label text-on-surface-variant">
              {error.digest ?? "no-digest"}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-2 border border-primary px-4 py-2 font-mono-label text-mono-label uppercase tracking-widest text-primary transition-colors hover:bg-primary hover:text-on-primary"
          >
            <IconRefresh size={14} />
            Try again
          </button>
          <Link
            href="/app/home"
            className="inline-flex items-center gap-2 px-4 py-2 font-mono-label text-mono-label uppercase tracking-widest text-outline transition-colors hover:text-on-surface"
          >
            <IconArrowLeft size={14} />
            Back to portfolio
          </Link>
        </div>
      </div>
    </div>
  );
}
