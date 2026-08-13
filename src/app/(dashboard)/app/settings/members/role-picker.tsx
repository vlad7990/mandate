"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { setMemberRoleAction } from "./actions";
import { ROLES, ROLE_LABELS, type Role } from "@/lib/auth/roles";
import { IconRefresh } from "@/components/icons";

/**
 * Role picker for one member.
 *
 * A select plus an explicit Apply, rather than saving on change. Changing
 * someone's role is not a filter — it takes access away from a colleague
 * mid-search — and a native select fires `change` on arrow-key navigation,
 * so save-on-change would demote whoever you scrolled past.
 */
export function RolePicker({
  userId,
  displayName,
  currentRole,
  disabled,
  disabledReason,
}: {
  userId: string;
  displayName: string;
  currentRole: Role | null;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Role>(currentRole ?? "viewer");

  const dirty = selected !== currentRole;

  if (disabled) {
    return (
      <span
        className="font-mono-label text-mono-label uppercase tracking-wider text-outline"
        title={disabledReason}
      >
        {currentRole ? ROLE_LABELS[currentRole] : "—"}
        <span className="sr-only">
          {disabledReason ? ` — ${disabledReason}` : " — not editable"}
        </span>
      </span>
    );
  }

  const apply = () => {
    startTransition(async () => {
      try {
        await setMemberRoleAction(userId, selected);
        toast.success(`${displayName} is now ${ROLE_LABELS[selected]}.`);
        router.refresh();
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Could not change the role.";
        console.error("[settings/members] role change failed:", err);
        toast.error(message);
        // Put the control back where the server still says it is, so the
        // row does not keep showing a role that was refused.
        setSelected(currentRole ?? "viewer");
      }
    });
  };

  return (
    <div className="flex items-center justify-end gap-2">
      <label className="sr-only" htmlFor={`role-${userId}`}>
        Role for {displayName}
      </label>
      <select
        id={`role-${userId}`}
        value={selected}
        disabled={isPending}
        onChange={(e) => setSelected(e.target.value as Role)}
        className="border border-outline-variant bg-surface-container-low px-2 py-1.5 font-mono-label text-mono-label uppercase tracking-wider text-on-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-60"
      >
        {ROLES.map((role) => (
          <option key={role} value={role}>
            {ROLE_LABELS[role]}
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
