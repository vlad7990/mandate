"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { initiateJobSpec } from "./actions";

type Props = {
  projectId: string;
  roleTitle: string;
  companyName: string;
};

/**
 * First-visit empty state. The placeholder + AI generation kickoff used to
 * happen during the page's server-component render, which let Next.js link
 * prefetch silently provision job_specs rows and burn AI spend before any
 * user click. Generation is now an explicit mutation behind this CTA.
 */
export function JobSpecEmpty({ projectId, roleTitle, companyName }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleGenerate = () => {
    startTransition(async () => {
      try {
        await initiateJobSpec(projectId);
        // The action revalidates /projects/[id]/spec and inserts a row with
        // is_generating=true, so refreshing flips the page to the polling view.
        router.refresh();
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed to start generation.";
        console.error("[spec] initiate failed:", e);
        toast.error(msg);
      }
    });
  };

  return (
    <div className="min-h-full bg-surface text-on-surface">
      <div className="max-w-3xl mx-auto px-8 py-10 space-y-10">
        <div className="flex items-center gap-3 font-mono-label text-mono-label uppercase tracking-widest text-outline">
          <Link
            href={`/app/projects/${projectId}`}
            prefetch={false}
            className="hover:text-on-surface transition-colors flex items-center gap-1.5"
          >
            <span className="material-symbols-outlined text-[14px]">arrow_back</span>
            Mandate
          </Link>
          <span className="text-outline-variant">/</span>
          <span className="text-on-surface-variant">{roleTitle}</span>
          <span className="text-outline-variant">/</span>
          <span className="text-primary">Job Spec</span>
        </div>

        <div className="bg-surface-container-low border border-outline-variant p-12 flex flex-col items-center text-center space-y-6">
          <div className="w-16 h-16 rounded-full bg-primary-container/10 border border-primary-container/40 flex items-center justify-center">
            <span
              className="material-symbols-outlined text-[28px] text-primary"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              description
            </span>
          </div>

          <div className="space-y-2 max-w-md">
            <h1 className="font-h1 text-h1">No job spec yet</h1>
            <p className="text-body-main text-on-surface-variant">
              Generate an AI-powered job spec from your calibration model.
              The spec will draw on the role analysis, company context, and
              calibration weights for{" "}
              <span className="text-on-surface">{roleTitle}</span> @{" "}
              <span className="text-on-surface">{companyName}</span>.
            </p>
          </div>

          <button
            type="button"
            onClick={handleGenerate}
            disabled={isPending}
            aria-busy={isPending ? true : undefined}
            className="px-8 py-3 bg-primary-container text-on-primary-container font-mono-label text-mono-label uppercase tracking-widest hover:brightness-110 active:scale-[0.98] transition-all flex items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
          >
            <span
              className={`material-symbols-outlined text-[16px] ${
                isPending ? "animate-spin" : ""
              }`}
            >
              {isPending ? "progress_activity" : "auto_awesome"}
            </span>
            {isPending ? "Initiating compile" : "Generate Job Spec"}
          </button>

          <p className="font-mono-label text-mono-label text-outline uppercase tracking-wider">
            ~5–10 seconds · Claude Sonnet 4.6 · Five-section structured output
          </p>
        </div>
      </div>
    </div>
  );
}
