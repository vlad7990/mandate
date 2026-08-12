"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { requestInterviewPlanGeneration } from "./actions";
import {
  IconAlert,
  IconArrowLeft,
  IconRefresh,
} from "@/components/icons";

type Props = {
  searchId: string;
  candidateId: string;
  candidateName: string;
  version: number;
  errorMessage: string;
};

/** Terminal failure — generation_error set, no healthy version to fall back to. */
export function PlanError({
  searchId,
  candidateId,
  candidateName,
  version,
  errorMessage,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleRetry = () => {
    startTransition(async () => {
      try {
        await requestInterviewPlanGeneration(searchId, candidateId);
        router.refresh();
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Retry failed.";
        console.error("[interview-plan] retry failed:", e);
        toast.error(msg);
      }
    });
  };

  return (
    <div className="min-h-full bg-surface text-on-surface">
      <div className="max-w-3xl mx-auto px-8 py-10 space-y-10">
        <div className="flex items-center gap-3 font-mono-label text-mono-label uppercase tracking-widest text-outline">
          <Link
            href={`/app/executive-intelligence/searches/${searchId}/candidates`}
            prefetch={false}
            className="hover:text-on-surface transition-colors flex items-center gap-1.5"
          >
            <IconArrowLeft size={14} />
            Candidates
          </Link>
          <span className="text-outline-variant">/</span>
          <span className="text-error">
            {candidateName} — Plan Failed V{String(version).padStart(2, "0")}
          </span>
        </div>

        <div className="bg-surface-container-low border border-error/40 p-12 flex flex-col items-center text-center space-y-6">
          <div className="w-16 h-16 rounded-full bg-error-container/20 border border-error/40 flex items-center justify-center">
            <IconAlert size={28} className="text-error" />
          </div>
          <div className="space-y-2 max-w-md">
            <h1 className="font-h1 text-h1">Interview plan generation failed</h1>
            <p className="text-body-main text-on-surface-variant">
              The draft for{" "}
              <span className="text-on-surface">{candidateName}</span> did not
              complete. Retrying creates a fresh version; the failed one stays in
              history for the audit trail.
            </p>
          </div>
          <div className="w-full max-w-md bg-error-container/10 border border-error/30 px-4 py-3 text-left">
            <span className="font-mono-label text-mono-label text-error uppercase tracking-widest block mb-1">
              Failure detail
            </span>
            <p className="font-mono-data text-body-main text-on-surface-variant break-words">
              {errorMessage}
            </p>
          </div>
          <button
            type="button"
            onClick={handleRetry}
            disabled={isPending}
            aria-busy={isPending ? true : undefined}
            className="px-8 py-3 bg-primary-container text-on-primary-container font-mono-label text-mono-label uppercase tracking-widest hover:brightness-110 active:scale-[0.98] transition-all flex items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
          >
            <IconRefresh
              size={16}
              className={isPending ? "animate-spin" : undefined}
            />
            {isPending ? "Retrying" : "Retry Generation"}
          </button>
        </div>
      </div>
    </div>
  );
}
