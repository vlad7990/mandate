"use client";

import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { regenerateCompanyContextAction } from "@/app/(dashboard)/app/executive-intelligence/searches/new/actions";
import {
  IconRefresh,
} from "@/components/icons";

const POLL_INTERVAL_MS = 2500;

/**
 * Polls router.refresh() while the Company Context Agent is running, so the
 * search workspace flips to the ready/failed panel without a manual reload.
 * Rendered only when company_context_status === 'generating'; unmounting
 * clears the interval.
 */
export function CompanyContextPoller() {
  const router = useRouter();

  useEffect(() => {
    const id = setInterval(() => router.refresh(), POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [router]);

  return null;
}

/** Retry CTA for a failed (or skipped) company-context generation. */
export function RegenerateContextButton({
  searchId,
  label = "Retry Research",
}: {
  searchId: string;
  label?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleClick = () => {
    startTransition(async () => {
      try {
        await regenerateCompanyContextAction(searchId);
        router.refresh();
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Could not restart research.";
        console.error("[company-context] retry failed:", e);
        toast.error(msg);
      }
    });
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      aria-busy={isPending ? true : undefined}
      className="px-4 py-2 border border-primary-container/70 text-primary font-mono-label text-mono-label uppercase tracking-widest hover:bg-surface-container-low transition-colors flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
    >
      <IconRefresh
        size={16}
        className={isPending ? "animate-spin" : undefined}
      />
      {isPending ? "Restarting" : label}
    </button>
  );
}
