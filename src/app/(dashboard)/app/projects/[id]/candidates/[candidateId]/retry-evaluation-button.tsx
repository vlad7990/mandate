"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  IconRefresh,
} from "@/components/icons";
import { regenerateWithHonestToast } from "./regenerate-evaluation";

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
    start(() =>
      regenerateWithHonestToast({
        candidateId,
        projectId,
        // The pending panel means no report exists yet — any stamp at
        // all is the retry landing.
        baselineStamp: null,
        onLanded: () => router.refresh(),
      })
    );
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
      <IconRefresh size={14} className={cn(pending && "animate-spin")} />
      {pending ? "Retrying" : "Retry Evaluation"}
    </button>
  );
}
