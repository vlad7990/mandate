"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { setAdvisoryModeAction } from "./advisory-actions";
import { unwrap } from "@/lib/actions/result";

/**
 * §182 slice F — the advisory-mode card on /app/settings.
 *
 * One switch, admin-gated (the page only renders this for org:manage
 * holders, and the action + RLS refuse everyone else). The copy says
 * exactly what changes, because a mode that silently re-voices every
 * evaluation is the kind of thing an admin should be able to explain to
 * their team after flipping it.
 */
export function AdvisoryModeCard({ initial }: { initial: boolean }) {
  const [enabled, setEnabled] = useState(initial);
  const [pending, startTransition] = useTransition();

  function toggle() {
    const next = !enabled;
    startTransition(async () => {
      try {
        const result = unwrap(await setAdvisoryModeAction(next));
        setEnabled(result.advisory_mode);
        toast.success(
          result.advisory_mode
            ? "Advisory mode is on — evaluations now lead with interview questions"
            : "Advisory mode is off — evaluations lead with the verdict"
        );
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Could not change advisory mode."
        );
      }
    });
  }

  return (
    <div className="border border-outline-variant bg-surface-container-low p-4 space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h2 className="font-mono-label text-mono-label text-primary uppercase tracking-widest">
            Advisory mode
          </h2>
          <p className="text-body-main text-on-surface-variant leading-relaxed max-w-xl">
            For workspaces reading evaluations without a recruiter&apos;s own
            calibration. When on, every evaluation leads with the questions
            to test at interview; the tier and recommendation remain visible
            but demoted to a &ldquo;based only on the CV&rdquo; line. Nothing
            stored changes — only the emphasis.
          </p>
        </div>
        <button
          type="button"
          onClick={toggle}
          disabled={pending}
          aria-pressed={enabled}
          className={
            enabled
              ? "shrink-0 border border-primary bg-primary/15 px-3 py-1.5 font-mono-label text-mono-label uppercase tracking-widest text-primary transition-colors disabled:opacity-50"
              : "shrink-0 border border-outline-variant px-3 py-1.5 font-mono-label text-mono-label uppercase tracking-widest text-on-surface-variant transition-colors hover:border-primary hover:text-primary disabled:opacity-50"
          }
        >
          {pending ? "Saving…" : enabled ? "On" : "Off"}
        </button>
      </div>
    </div>
  );
}
