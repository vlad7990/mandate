"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { unwrap } from "@/lib/actions/result";
import { setMemberStatusAction } from "./actions";

/**
 * The status verbs (§134 D3). Locked rows (founder, agent) render nothing —
 * the role picker beside them already carries the sentence saying why.
 */
export function MemberStatusButtons({
  userId,
  displayName,
  status,
  locked,
  isSelf,
}: {
  userId: string;
  displayName: string;
  status: string;
  locked: boolean;
  isSelf: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  if (locked || isSelf) return null;
  if (status !== "active" && status !== "suspended") return null;

  const suspending = status === "active";
  const label = suspending ? "Suspend" : "Restore";

  const apply = () => {
    if (
      suspending &&
      !window.confirm(
        `Suspend ${displayName}? Their session stops working within one request; nothing is deleted.`
      )
    ) {
      return;
    }
    start(async () => {
      try {
        unwrap(
          await setMemberStatusAction(userId, suspending ? "suspended" : "active")
        );
        toast.success(`${displayName} ${suspending ? "suspended" : "restored"}`);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "The change failed.");
      }
    });
  };

  return (
    <button
      type="button"
      onClick={apply}
      disabled={pending}
      className={`px-2 py-1 border font-mono-label text-mono-label uppercase tracking-widest transition-colors disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 ${
        suspending
          ? "border-outline-variant text-outline hover:border-error hover:text-error focus-visible:outline-error"
          : "border-outline-variant text-outline hover:border-primary hover:text-primary focus-visible:outline-primary"
      }`}
    >
      {pending ? "…" : label}
    </button>
  );
}
