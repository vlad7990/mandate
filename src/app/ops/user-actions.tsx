"use client";

import { useState, useTransition } from "react";
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
  /** §134 D4: an org-less signup needs an EXPLICIT organisation choice —
   * the silent file-into-HQ default is gone. */
  needsOrg?: boolean;
  organizations?: Array<{ id: string; name: string }>;
};

export function UserStatusActions({
  userId,
  fullName,
  status,
  needsOrg,
  organizations,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [orgChoice, setOrgChoice] = useState("");

  const pending = status === "pending";
  const downLabel = pending ? "Reject" : "Suspend";
  const upLabel = pending ? "Approve" : "Restore";
  const downToast = pending ? "rejected" : "suspended";
  const upToast = pending ? "approved" : "restored";

  const run = (action: "approve" | "reject") => {
    if (action === "approve" && needsOrg && !orgChoice) {
      toast.error("Choose an organisation to approve this account into.");
      return;
    }
    startTransition(async () => {
      try {
        if (action === "approve") {
          unwrap(await approveUserAction(userId, needsOrg ? orgChoice : undefined));
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
      {needsOrg && (
        <select
          value={orgChoice}
          onChange={(e) => setOrgChoice(e.target.value)}
          aria-label={`Organisation for ${fullName}`}
          className="border border-outline-variant bg-surface-container-lowest px-2 py-1.5 font-mono-label text-mono-label uppercase tracking-widest text-on-surface-variant focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <option value="">Choose organisation…</option>
          {(organizations ?? []).map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      )}
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
