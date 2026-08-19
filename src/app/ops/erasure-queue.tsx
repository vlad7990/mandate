"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { unwrap } from "@/lib/actions/result";
import { closeErasureRequestAction } from "./erasure-actions";

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

  const close = (row: ErasureRow, outcome: "resolved" | "declined") => {
    const note = window.prompt(
      outcome === "resolved"
        ? `Resolving ${row.requester_label}'s request. Note what was erased (the erasure itself is founder SQL):`
        : `Declining ${row.requester_label}'s request. Note why:`
    );
    if (note === null) return;
    start(async () => {
      try {
        unwrap(await closeErasureRequestAction(row.id, outcome, note));
        toast.success(
          outcome === "resolved" ? "Request resolved." : "Request declined."
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
              onClick={() => close(r, "declined")}
              className="border border-outline-variant px-3 py-1.5 font-mono-label text-mono-label uppercase tracking-widest text-on-surface-variant transition-colors hover:border-error hover:text-error disabled:opacity-40"
            >
              Decline
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
