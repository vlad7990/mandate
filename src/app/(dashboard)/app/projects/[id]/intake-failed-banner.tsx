"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { IconRefresh } from "@/components/icons";
import { PANEL_BUTTON } from "@/components/projects/panel";
import { retryIntakeAnalysisAction } from "./actions";
import { unwrap } from "@/lib/actions/result";

/**
 * The honest failed state (090: D6) — rendered in place of the pulsing
 * skeleton once projects.intake_error is set. The sentence comes from
 * the row verbatim (only authored or safeFailureMessage-filtered text
 * ever lands there); the Retry button is capability-gated by the
 * caller, and a refused retry surfaces its D5 sentence in a toast —
 * the click has a reader present, unlike the fire-and-forget create.
 */
export function IntakeFailedBanner({
  projectId,
  sentence,
  canRetry,
}: {
  projectId: string;
  sentence: string;
  canRetry: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const handleRetry = () => {
    if (pending) return;
    start(async () => {
      try {
        const { started } = unwrap(await retryIntakeAnalysisAction(projectId));
        toast.success(
          started
            ? "Retry started — analyzing the brief again."
            : "A retry is already running — watching for it to land."
        );
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Retry failed.");
      }
    });
  };

  return (
    <div
      role="alert"
      className="mt-5 border border-error/60 bg-error/5 px-5 py-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 flex-1 basis-[320px]">
          <p className="font-mono-label text-[11px] font-semibold uppercase tracking-[0.1em] text-error">
            Intake analysis failed
          </p>
          <p className="mt-1.5 text-sm leading-relaxed text-on-surface-variant">
            {sentence}
          </p>
        </div>
        {canRetry && (
          <button
            type="button"
            onClick={handleRetry}
            disabled={pending}
            className={PANEL_BUTTON}
          >
            <IconRefresh
              size={14}
              className={pending ? "animate-spin" : undefined}
            />
            {pending ? "Retrying…" : "Retry analysis"}
          </button>
        )}
      </div>
    </div>
  );
}
