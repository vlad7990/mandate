"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { unwrap } from "@/lib/actions/result";
import {
  closeErasureRequestAction,
  type DeclineKind,
} from "./erasure-actions";

export type ErasureRow = {
  id: string;
  requester_label: string;
  organization_name: string;
  note: string | null;
  created_at: string;
};

export function ErasureQueue({ rows }: { rows: ErasureRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  /**
   * §207 D5 — the two declines are different acts, so they are two
   * buttons. "Retained" leaves the person suppressed; "Not them" lifts the
   * suppression this request set, because a forwarded portal link means the
   * filer is not always the subject and a real candidate must not be left
   * quietly uncontactable by somebody else's request.
   */
  const close = (
    row: ErasureRow,
    outcome: "resolved" | "declined",
    declineKind?: DeclineKind
  ) => {
    const prompt =
      outcome === "resolved"
        ? `Resolving ${row.requester_label}'s request. Note what was erased (the erasure itself is founder SQL):`
        : declineKind === "not_subject"
          ? `Declining ${row.requester_label}'s request as NOT THE SUBJECT — the suppression it set will be lifted. Note why you are sure:`
          : `Declining ${row.requester_label}'s request — the data is RETAINED and they stay suppressed. Note under what basis:`;
    const note = window.prompt(prompt);
    if (note === null) return;
    start(async () => {
      try {
        unwrap(
          await closeErasureRequestAction(row.id, outcome, note, declineKind)
        );
        toast.success(
          outcome === "resolved"
            ? "Request resolved."
            : declineKind === "not_subject"
              ? "Declined — suppression lifted."
              : "Declined — they stay suppressed."
        );
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "The update failed.");
      }
    });
  };

  return (
    <ul className="divide-y divide-outline-variant border border-outline-variant bg-surface-container">
      {rows.map((r) => (
        <li
          key={r.id}
          className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3"
        >
          <span className="text-on-surface">{r.requester_label}</span>
          <span className="font-mono-label text-mono-label uppercase tracking-wider text-outline">
            {r.organization_name}
          </span>
          {r.note && (
            <span className="text-body-main text-on-surface-variant">
              “{r.note}”
            </span>
          )}
          <span className="ml-auto flex items-center gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() => close(r, "declined", "not_subject")}
              title="The person who filed this was not the subject — a forwarded link. Lifts the suppression this request set."
              className="border border-outline-variant px-3 py-1.5 font-mono-label text-mono-label uppercase tracking-widest text-on-surface-variant transition-colors hover:border-error hover:text-error disabled:opacity-40"
            >
              Decline · not them
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => close(r, "declined", "cannot_erase")}
              title="The data is retained under the retention verdict. They stay suppressed."
              className="border border-outline-variant px-3 py-1.5 font-mono-label text-mono-label uppercase tracking-widest text-on-surface-variant transition-colors hover:border-error hover:text-error disabled:opacity-40"
            >
              Decline · retained
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => close(r, "resolved")}
              className="border border-tertiary px-3 py-1.5 font-mono-label text-mono-label uppercase tracking-widest text-tertiary transition-colors hover:bg-tertiary hover:text-on-tertiary disabled:opacity-40"
            >
              Resolve
            </button>
          </span>
        </li>
      ))}
    </ul>
  );
}
