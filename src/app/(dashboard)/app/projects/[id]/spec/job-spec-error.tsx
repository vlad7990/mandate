"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { requestRegenerate } from "./actions";
import { IconAlert, IconArrowLeft, IconRefresh } from "@/components/icons";
import { unwrap } from "@/lib/actions/result";

type Props = {
  projectId: string;
  roleTitle: string;
  companyName: string;
  version: number;
  errorMessage: string;
};

/**
 * Terminal failure view for a job_specs row whose generation_error column is
 * set. Reached when the AI call returned but the final persist step failed,
 * or when generation itself raised. The retry button calls
 * requestRegenerate, which inserts a fresh placeholder version + kicks off
 * a new Anthropic call; the failed row stays in version history.
 */
export function JobSpecError({
  projectId,
  roleTitle,
  companyName,
  version,
  errorMessage,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleRetry = () => {
    startTransition(async () => {
      try {
        unwrap(await requestRegenerate(projectId));
        // The action revalidates /projects/[id]/spec; refresh re-fetches and
        // the new placeholder (is_generating=true, generation_error=null)
        // becomes the latest version, flipping the page to the polling view.
        router.refresh();
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Retry failed.";
        console.error("[spec] retry failed:", e);
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
            <IconArrowLeft size={14} />
            Mandate
          </Link>
          <span className="text-outline-variant">/</span>
          <span className="text-on-surface-variant">{roleTitle}</span>
          <span className="text-outline-variant">/</span>
          <span className="text-error">
            Job Spec — Failed V{String(version).padStart(2, "0")}
          </span>
        </div>

        <div className="bg-surface-container-low border border-error/40 p-12 flex flex-col items-center text-center space-y-6">
          <div className="w-16 h-16 bg-error-container/20 border border-error/40 flex items-center justify-center">
            <IconAlert size={28} className="text-error" />
          </div>

          <div className="space-y-2 max-w-md">
            <h1 className="font-h1 text-h1">Job spec generation failed. Please try again.</h1>
            <p className="text-body-main text-on-surface-variant">
              The AI compile for{" "}
              <span className="text-on-surface">{roleTitle}</span> @{" "}
              <span className="text-on-surface">{companyName}</span> did not
              complete. Retrying creates a fresh placeholder version; the
              failed version stays in history for reference.
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
