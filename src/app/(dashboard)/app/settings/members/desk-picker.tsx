"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { setMemberManagerAction } from "./actions";
import { IconRefresh } from "@/components/icons";
import { unwrap } from "@/lib/actions/result";
import { SelectField } from "@/components/ui/select";

export type DeskHead = { id: string; label: string };

/**
 * Whose desk this member sits on (§200, migration 140).
 *
 * Same shape as the role picker beside it, and for the same reason:
 * explicit Apply, never save-on-change, because this one decides which
 * CVs an agent reads on someone's behalf. (It once also guarded against
 * a native select firing `change` on arrow-key navigation; the styled
 * select commits only on selection, so that half of the reason has
 * lapsed and the other half has not.)
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
      <label id={`desk-${userId}-label`} className="sr-only" htmlFor={`desk-${userId}`}>
        Desk for {displayName}
      </label>
      <SelectField
        id={`desk-${userId}`}
        aria-labelledby={`desk-${userId}-label`}
        tone="text"
        value={selected}
        disabled={isPending}
        onValueChange={setSelected}
        options={[
          { value: "", label: "— No desk —" },
          ...options.map((head) => ({ value: head.id, label: head.label })),
        ]}
        className="w-auto min-w-44 px-2"
      />

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
