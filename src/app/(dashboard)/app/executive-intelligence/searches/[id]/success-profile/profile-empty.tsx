"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { requestProfileGeneration } from "./actions";
import { DECISION_SUPPORT_DISCLAIMER } from "@/lib/executive/types";

type Props = {
  searchId: string;
  roleTitle: string;
  companyName: string;
  companyContextReady: boolean;
};

/**
 * Empty state — no profile versions exist yet. The CTA is the only path
 * that creates a placeholder + AI call, so prefetch/scrapers can't burn
 * AI spend.
 */
export function ProfileEmpty({
  searchId,
  roleTitle,
  companyName,
  companyContextReady,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleGenerate = () => {
    startTransition(async () => {
      try {
        await requestProfileGeneration(searchId);
        router.refresh();
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Generation failed to start.";
        console.error("[success-profile] generate failed:", e);
        toast.error(msg);
      }
    });
  };

  return (
    <div className="min-h-full bg-surface text-on-surface">
      <div className="max-w-3xl mx-auto px-8 py-10 space-y-10">
        <div className="flex items-center gap-3 font-mono-label text-mono-label uppercase tracking-widest text-outline">
          <Link
            href={`/app/executive-intelligence/searches/${searchId}`}
            prefetch={false}
            className="hover:text-on-surface transition-colors flex items-center gap-1.5"
          >
            <span className="material-symbols-outlined text-[14px]">arrow_back</span>
            Search Workspace
          </Link>
          <span className="text-outline-variant">/</span>
          <span className="text-on-surface-variant">Success Profile</span>
        </div>

        <div className="bg-surface-container-low border border-outline-variant p-12 flex flex-col items-center text-center space-y-6">
          <div className="w-16 h-16 rounded-full bg-primary-container/20 border border-primary-container/60 flex items-center justify-center">
            <span className="material-symbols-outlined text-[28px] text-primary">
              architecture
            </span>
          </div>

          <div className="space-y-2 max-w-md">
            <h1 className="font-h1 text-h1">No Success Profile yet</h1>
            <p className="text-body-main text-on-surface-variant">
              The Executive Role Architect drafts a structured Success Profile for{" "}
              <span className="text-on-surface">{roleTitle}</span> @{" "}
              <span className="text-on-surface">{companyName}</span> from the intake
              brief, company research, and the competency library. You review, edit,
              and approve it — nothing is final without human sign-off.
            </p>
            {!companyContextReady && (
              <p className="text-body-main text-on-surface-variant">
                Company research is not ready yet — you can generate now from the
                intake alone, or wait for the research to complete for a
                better-grounded draft.
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={handleGenerate}
            disabled={isPending}
            aria-busy={isPending ? true : undefined}
            className="px-8 py-3 bg-primary-container text-on-primary-container font-mono-label text-mono-label uppercase tracking-widest hover:brightness-110 active:scale-[0.98] transition-all flex items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
          >
            <span
              className={`material-symbols-outlined text-[16px] ${isPending ? "animate-spin" : ""}`}
            >
              {isPending ? "progress_activity" : "neurology"}
            </span>
            {isPending ? "Starting" : "Generate Success Profile"}
          </button>

          <p className="font-mono-label text-mono-label text-outline uppercase tracking-wider max-w-md">
            {DECISION_SUPPORT_DISCLAIMER}
          </p>
        </div>
      </div>
    </div>
  );
}
