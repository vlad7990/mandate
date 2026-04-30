"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { regenerateEvaluationAction } from "./actions";

// Manual retry trigger for the executive evaluation. Lives on the
// pending panel — when generation has failed at least once, recruiters
// reach for this rather than refreshing the whole page (which would
// only retry on the *next* visit because the gate is idempotent).

export function RetryEvaluationButton({
  candidateId,
  projectId,
  variant = "primary",
}: {
  candidateId: string;
  projectId: string;
  variant?: "primary" | "ghost";
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const handle = () => {
    if (pending) return;
    start(async () => {
      try {
        await regenerateEvaluationAction(candidateId, projectId);
        toast.success("Evaluation regenerated");
        router.refresh();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Retry failed.";
        toast.error(msg);
      }
    });
  };

  return (
    <button
      type="button"
      onClick={handle}
      disabled={pending}
      aria-busy={pending ? true : undefined}
      className={cn(
        "px-3 py-1.5 font-mono-label text-mono-label uppercase tracking-widest flex items-center gap-1.5 transition-[filter,colors,transform] disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
        variant === "primary"
          ? "bg-primary-container text-on-primary-container hover:brightness-110 active:scale-[0.98]"
          : "border border-outline-variant text-on-surface-variant hover:border-primary hover:text-primary"
      )}
    >
      <span
        className={cn(
          "material-symbols-outlined text-[14px]",
          pending && "animate-spin"
        )}
        aria-hidden
      >
        {pending ? "progress_activity" : "refresh"}
      </span>
      {pending ? "Retrying" : "Retry Evaluation"}
    </button>
  );
}
