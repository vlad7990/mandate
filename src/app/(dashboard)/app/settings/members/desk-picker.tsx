"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { setMemberManagerAction } from "./actions";
import { IconRefresh } from "@/components/icons";
import { unwrap } from "@/lib/actions/result";

export type DeskHead = { id: string; label: string };

/**
 * Whose desk this member sits on (§200, migration 140).
 *
 * Same shape as the role picker beside it, and for the same reason:
 * explicit Apply, never save-on-change, because a native select fires
 * `change` on arrow-key navigation and this one decides which CVs an
 * agent reads on someone's behalf.
 *
 * The list offers only active managers and admins — the database refuses
 * anyone else (140) and offering a choice the DB will reject is the
 * "disabled button" defect wearing a dropdown.
 */
export function DeskPicker({
  userId,
  displayName,
  currentManagerId,
  heads,
  disabled,
  disabledReason,
}: {
  userId: string;
  displayName: string;
  currentManagerId: string | null;
  heads: DeskHead[];
  disabled?: boolean;
  disabledReason?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selected, setSelected] = useState<string>(currentManagerId ?? "");

  const dirty = (selected || null) !== currentManagerId;
  const currentLabel =
    heads.find((h) => h.id === currentManagerId)?.label ?? "—";

  if (disabled) {
    return (
      <span
        className="font-mono-label text-mono-label uppercase tracking-wider text-outline"
        title={disabledReason}
      >
        {currentLabel}
        <span className="sr-only">
          {disabledReason ? ` — ${disabledReason}` : " — not editable"}
        </span>
      </span>
    );
  }

  // A desk head cannot report to themselves, so they never appear in
  // their own list. The DB refuses it too; this just never offers it.
  const options = heads.filter((h) => h.id !== userId);

  const apply = () => {
    startTransition(async () => {
      try {
        unwrap(await setMemberManagerAction(userId, selected || null));
        toast.success(
          selected
            ? `${displayName} is on ${
                options.find((h) => h.id === selected)?.label ?? "that"
              }'s desk.`
            : `${displayName} is not on anyone's desk.`
        );
        router.refresh();
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Could not change the desk.";
        console.error("[settings/members] desk change failed:", err);
        toast.error(message);
        setSelected(currentManagerId ?? "");
      }
    });
  };

  return (
    <div className="flex items-center justify-end gap-2">
      <label className="sr-only" htmlFor={`desk-${userId}`}>
        Desk for {displayName}
      </label>
      <select
        id={`desk-${userId}`}
        value={selected}
        disabled={isPending}
        onChange={(e) => setSelected(e.target.value)}
        className="border border-outline-variant bg-surface-container-low px-2 py-1.5 font-mono-label text-mono-label uppercase tracking-wider text-on-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-60"
      >
        <option value="">— No desk —</option>
        {options.map((head) => (
          <option key={head.id} value={head.id}>
            {head.label}
          </option>
        ))}
      </select>

      <button
        type="button"
        onClick={apply}
        disabled={!dirty || isPending}
        aria-busy={isPending ? true : undefined}
        className="flex items-center gap-1.5 border border-outline-variant px-3 py-1.5 font-mono-label text-mono-label uppercase tracking-widest text-on-surface-variant transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-outline-variant disabled:hover:text-on-surface-variant"
      >
        {isPending && <IconRefresh size={14} className="animate-spin" />}
        Apply
      </button>
    </div>
  );
}
