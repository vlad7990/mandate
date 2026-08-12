"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { refreshScoresAction } from "./actions";
import { IconRefresh } from "@/components/icons";

export function RefreshScoresButton({
  projectId,
}: {
  projectId: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleClick = () => {
    startTransition(async () => {
      try {
        await refreshScoresAction(projectId);
        toast.success("Scores refreshed.");
        router.refresh();
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Refresh failed.";
        console.error("[ranking] refresh failed:", e);
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
      className="px-4 py-2 border border-outline-variant text-on-surface-variant font-mono-label text-mono-label uppercase tracking-widest hover:border-primary hover:text-primary transition-colors flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
    >
      <IconRefresh size={14} className={cn(isPending && "animate-spin")} />
      {isPending ? "Recomputing" : "Refresh Scores"}
    </button>
  );
}
