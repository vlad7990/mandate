"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { approveUserAction, rejectUserAction } from "./actions";
import { IconCheck, IconClose, IconRefresh } from "@/components/icons";
import { unwrap } from "@/lib/actions/result";

type Props = {
  userId: string;
  fullName: string;
  /** The row's current status. The verbs on these buttons follow it:
   * a pending signup is approved or rejected; an existing account is
   * suspended or restored. Same actions underneath — only the words
   * stop wearing their waitlist-era names on rows where the act is
   * something else (§30's observation, confirmed §40). */
  status: string;
};

export function UserStatusActions({ userId, fullName, status }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const pending = status === "pending";
  const downLabel = pending ? "Reject" : "Suspend";
  const upLabel = pending ? "Approve" : "Restore";
  const downToast = pending ? "rejected" : "suspended";
  const upToast = pending ? "approved" : "restored";

  const run = (action: "approve" | "reject") => {
    startTransition(async () => {
      try {
        if (action === "approve") {
          unwrap(await approveUserAction(userId));
          toast.success(`${fullName} ${upToast}.`);
        } else {
          unwrap(await rejectUserAction(userId));
          toast.success(`${fullName} ${downToast}.`);
        }
        router.refresh();
      } catch (err) {
        const msg = err instanceof Error ? err.message : `${action} failed.`;
        console.error(`[settings] ${action} failed:`, err);
        toast.error(msg);
      }
    });
  };

  return (
    <div className="flex items-center gap-2 justify-end">
      <button
        type="button"
        onClick={() => run("reject")}
        disabled={isPending}
        aria-busy={isPending ? true : undefined}
        className="px-3 py-1.5 border border-outline-variant text-on-surface-variant font-mono-label text-mono-label uppercase tracking-widest hover:border-error hover:text-error transition-colors flex items-center gap-1.5 disabled:opacity-60 disabled:cursor-not-allowed"
      >
        <IconClose size={14} />
        {downLabel}
      </button>
      <button
        type="button"
        onClick={() => run("approve")}
        disabled={isPending}
        aria-busy={isPending ? true : undefined}
        className={cn(
          "px-3 py-1.5 btn-notch bg-primary-container text-on-primary-container font-mono-label text-mono-label uppercase tracking-widest hover:brightness-110 active:scale-[0.98] transition-all flex items-center gap-1.5 disabled:opacity-60 disabled:cursor-not-allowed"
        )}
      >
        {isPending ? (
          <IconRefresh size={14} className="animate-spin" />
        ) : (
          <IconCheck size={14} />
        )}
        {upLabel}
      </button>
    </div>
  );
}
