"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createAssessment } from "./actions";
import { ASSESSMENT_DISCLAIMER } from "@/lib/executive/types";

type Props = {
  searchId: string;
  candidateId: string;
  candidateName: string;
};

/** Empty state — no assessment versions yet. The CTA builds the first draft
 * (pre-structured from the approved plan + competency weights). */
export function AssessmentEmpty({ searchId, candidateId, candidateName }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleCreate = () => {
    startTransition(async () => {
      try {
        await createAssessment(searchId, candidateId);
        router.refresh();
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Could not start the assessment.";
        console.error("[assessment] create failed:", e);
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
            <span className="material-symbols-outlined text-[14px]">arrow_back</span>
            Candidates
          </Link>
          <span className="text-outline-variant">/</span>
          <span className="text-on-surface-variant">{candidateName}</span>
          <span className="text-outline-variant">/</span>
          <span className="text-on-surface-variant">Assessment</span>
        </div>

        <div className="bg-surface-container-low border border-outline-variant p-12 flex flex-col items-center text-center space-y-6">
          <div className="w-16 h-16 rounded-full bg-primary-container/20 border border-primary-container/60 flex items-center justify-center">
            <span className="material-symbols-outlined text-[28px] text-primary">
              fact_check
            </span>
          </div>
          <div className="space-y-2 max-w-md">
            <h1 className="font-h1 text-h1">No assessment yet</h1>
            <p className="text-body-main text-on-surface-variant">
              Start an evidence scorecard for{" "}
              <span className="text-on-surface">{candidateName}</span>. It comes
              pre-structured from the approved interview plan — one row per
              competency, with the stages that assess it — so you record observed
              evidence and a rating, and the app weights it into an evidence-strength
              summary.
            </p>
          </div>
          <button
            type="button"
            onClick={handleCreate}
            disabled={isPending}
            aria-busy={isPending ? true : undefined}
            className="px-8 py-3 bg-primary-container text-on-primary-container font-mono-label text-mono-label uppercase tracking-widest hover:brightness-110 active:scale-[0.98] transition-all flex items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
          >
            <span
              className={`material-symbols-outlined text-[16px] ${isPending ? "animate-spin" : ""}`}
            >
              {isPending ? "progress_activity" : "add"}
            </span>
            {isPending ? "Starting" : "Start Assessment"}
          </button>
          <p className="font-mono-label text-mono-label text-outline uppercase tracking-wider max-w-md normal-case">
            {ASSESSMENT_DISCLAIMER}
          </p>
        </div>
      </div>
    </div>
  );
}
