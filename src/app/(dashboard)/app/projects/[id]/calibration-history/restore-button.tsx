"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { restoreCalibrationSnapshotAction } from "./actions";

export function RestoreCalibrationButton({
  projectId,
  snapshotId,
}: {
  projectId: string;
  snapshotId: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const handleRestore = () => {
    if (pending) return;
    if (
      !window.confirm(
        "Restore this calibration snapshot? Candidate scores will recompute against the restored weights. This is reversible — a new history entry is recorded."
      )
    ) {
      return;
    }
    start(async () => {
      try {
        await restoreCalibrationSnapshotAction(projectId, snapshotId);
        toast.success("Calibration restored");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Restore failed.");
      }
    });
  };

  return (
    <div className="flex items-center justify-end">
      <button
        type="button"
        onClick={handleRestore}
        disabled={pending}
        className={cn(
          "px-3 py-1 border border-outline-variant text-on-surface-variant font-mono-label text-mono-label uppercase tracking-widest hover:border-primary hover:text-primary transition-colors flex items-center gap-1.5 disabled:opacity-60",
          pending && "opacity-60"
        )}
      >
        <span
          className={cn(
            "material-symbols-outlined text-[14px]",
            pending && "animate-spin"
          )}
          aria-hidden
        >
          {pending ? "progress_activity" : "history"}
        </span>
        {pending ? "Restoring" : "Restore this version"}
      </button>
    </div>
  );
}
