"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { IconRefresh } from "@/components/icons";
import { retryParseAction } from "./actions";
import { unwrap } from "@/lib/actions/result";

// The §36-accepted retry for a failed CV parse. Lives on the failure
// banner, whose sentence ("retry when the agent is restored") used to
// promise a retry the UI made the recruiter re-upload for. Re-reads the
// STORED file and hands the bytes back to the CV Parsing Agent's seam —
// same shape as RetryEvaluationButton, same house toast contract.

export function RetryParseButton({
  candidateId,
  projectId,
}: {
  candidateId: string;
  projectId: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const handle = () => {
    if (pending) return;
    start(async () => {
      try {
        unwrap(await retryParseAction(candidateId, projectId));
        toast.success("CV parsed.");
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
        "mt-2 px-3 py-1.5 font-mono-label text-mono-label uppercase tracking-widest flex items-center gap-1.5 border border-error/60 text-error transition-colors hover:bg-error/10 disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-error"
      )}
    >
      <IconRefresh size={14} className={cn(pending && "animate-spin")} />
      {pending ? "Parsing" : "Retry Parse"}
    </button>
  );
}
