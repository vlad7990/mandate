"use client";

import { useState } from "react";
import { SAMPLE_DISMISSED_COOKIE } from "@/lib/sample";
import { IconClose, IconInfo } from "@/components/icons";

/**
 * Marks a screen as showing the sample workspace.
 *
 * Sits above the content rather than floating over it, because a
 * dismissible overlay that covers the thing it describes teaches
 * nothing. It is the first element in the content region, so a screen
 * reader meets it before the invented figures rather than after.
 *
 * Dismissal writes a cookie so the server can honour it on the next
 * render without a flash of sample content.
 */
export function SampleBanner({
  scope = "workspace",
}: {
  /** What is being sampled — "dashboard", "mandate", "candidate". */
  scope?: string;
}) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  function dismiss() {
    // One year. The user is telling us they know what the product looks
    // like; asking again next week would be noise.
    document.cookie = `${SAMPLE_DISMISSED_COOKIE}=1; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    setDismissed(true);
  }

  return (
    <div
      role="note"
      aria-label="Sample data notice"
      className="flex items-start gap-3 border border-primary/40 bg-primary/[0.06] px-4 py-3"
    >
      <IconInfo size={16} className="mt-0.5 shrink-0 text-primary" />

      <div className="min-w-0 flex-1">
        <p className="font-mono-label text-mono-label uppercase tracking-widest text-primary">
          Sample {scope}
        </p>
        <p className="mt-1 text-body-main leading-relaxed text-on-surface-variant">
          An example account, so you can see how Mandate works before you
          have your own searches running.{" "}
          <span className="text-on-surface">None of this is your data</span> —
          nothing here is stored, counted or exported.
        </p>
      </div>

      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss sample data and show my own workspace"
        className="-m-2 flex h-11 w-11 shrink-0 items-center justify-center text-outline transition-colors hover:text-on-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
      >
        <IconClose size={16} />
      </button>
    </div>
  );
}
