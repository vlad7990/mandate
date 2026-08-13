"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { requestInterviewPlanGeneration } from "./actions";
import { DECISION_SUPPORT_DISCLAIMER } from "@/lib/executive/types";
import {
  IconArrowLeft,
  IconChecklist,
  IconIntelligence,
  IconRefresh,
} from "@/components/icons";

type Props = {
  searchId: string;
  candidateId: string;
  candidateName: string;
};

/** Empty state — no plan versions yet. The CTA is the only generation path. */
export function PlanEmpty({ searchId, candidateId, candidateName }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleGenerate = () => {
    startTransition(async () => {
      try {
        await requestInterviewPlanGeneration(searchId, candidateId);
        router.refresh();
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Generation failed to start.";
        console.error("[interview-plan] generate failed:", e);
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
          <span className="text-on-surface-variant">{candidateName}</span>
          <span className="text-outline-variant">/</span>
          <span className="text-on-surface-variant">Interview Plan</span>
        </div>

        <div className="bg-surface-container-low border border-outline-variant p-12 flex flex-col items-center text-center space-y-6">
          <div className="w-16 h-16 bg-primary-container/20 border border-primary-container/60 flex items-center justify-center">
            <IconChecklist size={28} className="text-primary" />
          </div>
          <div className="space-y-2 max-w-md">
            <h1 className="font-h1 text-h1">No interview plan yet</h1>
            <p className="text-body-main text-on-surface-variant">
              The Interview Architect turns this search&rsquo;s approved success
              profile and competency weights into concrete interview stages for{" "}
              <span className="text-on-surface">{candidateName}</span> — questions,
              evidence to listen for, and competency coverage. You review, edit, and
              approve it.
            </p>
          </div>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={isPending}
            aria-busy={isPending ? true : undefined}
            className="px-8 py-3 bg-primary-container text-on-primary-container font-mono-label text-mono-label uppercase tracking-widest hover:brightness-110 active:scale-[0.98] transition-all flex items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {isPending ? (
              <IconRefresh size={16} className="animate-spin" />
            ) : (
              <IconIntelligence size={16} />
            )}
            {isPending ? "Starting" : "Generate Interview Plan"}
          </button>
          <p className="font-mono-label text-mono-label text-outline uppercase tracking-wider max-w-md">
            {DECISION_SUPPORT_DISCLAIMER}
          </p>
        </div>
      </div>
    </div>
  );
}
