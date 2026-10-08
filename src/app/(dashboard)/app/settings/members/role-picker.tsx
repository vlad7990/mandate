"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { setMemberRoleAction } from "./actions";
import { STAFF_ROLES, ROLE_LABELS, type Role } from "@/lib/auth/roles";
import { IconRefresh } from "@/components/icons";
import { unwrap } from "@/lib/actions/result";
import { SelectField } from "@/components/ui/select";

/**
 * Role picker for one member.
 *
 * A select plus an explicit Apply, rather than saving on change. Changing
 * someone's role is not a filter — it takes access away from a colleague
 * mid-search — so the write wants a deliberate second act, not a side
 * effect of browsing the list.
 *
 * The original reason was narrower: a native select fires `change` on
 * arrow-key navigation, so save-on-change would have demoted whoever you
 * scrolled past. The styled select commits only on selection, so that
 * particular hazard is gone — but the Apply stays, because the reason
 * above never depended on it.
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
        // 129 — the action reports what it DID, and admin may only have
        // been proposed. Announcing "is now Admin" over a pending
        // request tells the proposer the job is done when the tier has
        // not moved and a colleague still has to agree. Drive 117
        // caught exactly that.
        const outcome = unwrap(await setMemberRoleAction(userId, selected));
        if (outcome === "pending") {
          toast.success(
            `Proposed — ${displayName} becomes Admin once a second admin approves.`
          );
        } else {
          toast.success(`${displayName} is now ${ROLE_LABELS[selected]}.`);
        }
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
      <label id={`role-${userId}-label`} className="sr-only" htmlFor={`role-${userId}`}>
        Role for {displayName}
      </label>
      {/* Staff roles only: the members screen administers the org's own
          people, and an external role on a staff row is a contradiction
          the 067 XOR CHECK would refuse anyway. */}
      <SelectField
        id={`role-${userId}`}
        aria-labelledby={`role-${userId}-label`}
        value={selected}
        disabled={isPending}
        onValueChange={(role) => setSelected(role as Role)}
        options={STAFF_ROLES.map((role) => ({
          value: role,
          label: ROLE_LABELS[role],
        }))}
        className="w-auto min-w-32 px-2"
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
