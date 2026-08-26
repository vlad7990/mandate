"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { unwrap } from "@/lib/actions/result";
import { decideAdminGrantAction } from "./actions";

/**
 * Admin grants waiting on a second pair of eyes (129).
 *
 * The panel exists because the rule is invisible otherwise: an admin who
 * proposes a promotion sees "proposed" once and then nothing, and the
 * OTHER admin — the one whose agreement the rule actually depends on —
 * has no way to learn there is anything to agree to. A two-person
 * control with no shared surface is a one-person control with a delay.
 *
 * Every refusal here is the database's, passed through verbatim: the
 * proposer cannot approve their own, only the proposer may withdraw, and
 * an expired request has to be proposed again.
 */

export type PendingGrantRow = {
  id: string;
  kind: "promotion" | "invitation";
  /** The person or address that would become an admin. */
  target: string;
  proposedByLabel: string;
  /** True when the signed-in admin is the one who proposed it. */
  mine: boolean;
  expiresAt: string;
};

export function PendingGrantsPanel({ rows }: { rows: PendingGrantRow[] }) {
  if (rows.length === 0) return null;

  return (
    <section className="space-y-3">
      <div>
        <h2 className="font-mono-label text-mono-label uppercase tracking-widest text-outline">
          Admin grants awaiting approval
        </h2>
        <p className="mt-1 text-body-main text-on-surface-variant">
          Making someone an admin takes two admins. These are proposed and
          not yet in effect.
        </p>
      </div>

      <ul className="divide-y divide-outline-variant border border-outline-variant bg-surface-container">
        {rows.map((row) => (
          <PendingGrantItem key={row.id} row={row} />
        ))}
      </ul>
    </section>
  );
}

function PendingGrantItem({ row }: { row: PendingGrantRow }) {
  const [pending, start] = useTransition();

  const decide = (decision: "approve" | "reject" | "withdraw") => {
    start(async () => {
      try {
        unwrap(await decideAdminGrantAction(row.id, decision));
        toast.success(
          decision === "approve"
            ? `${row.target} is now an admin.`
            : decision === "withdraw"
              ? "Proposal withdrawn."
              : "Proposal declined."
        );
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "That could not be decided."
        );
      }
    });
  };

  return (
    <li className="flex flex-wrap items-baseline gap-x-4 gap-y-2 px-5 py-4">
      <span className="font-medium text-on-surface">{row.target}</span>
      <span className="font-mono-label text-mono-label uppercase tracking-wider text-outline">
        {row.kind === "invitation" ? "New invitation" : "Promotion"}
      </span>
      <span className="font-mono-label text-mono-label uppercase tracking-wider text-on-surface-variant">
        Proposed by {row.proposedByLabel}
      </span>
      <span className="font-mono-label text-mono-label uppercase tracking-wider text-outline">
        Expires {formatDate(row.expiresAt)}
      </span>

      <div className="ml-auto flex items-center gap-2">
        {row.mine ? (
          <>
            {/* Deliberately no Approve button on your own proposal. The
                database refuses it either way; showing a control that
                cannot work would be a worse explanation than its
                absence. */}
            <span className="font-mono-label text-mono-label uppercase tracking-wider text-outline">
              Yours — another admin must approve
            </span>
            <button
              type="button"
              disabled={pending}
              onClick={() => decide("withdraw")}
              className="border border-outline-variant px-3 py-1.5 font-mono-label text-mono-label uppercase tracking-widest text-on-surface-variant transition-colors hover:border-error hover:text-error disabled:opacity-40"
            >
              Withdraw
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              disabled={pending}
              onClick={() => decide("reject")}
              className="border border-outline-variant px-3 py-1.5 font-mono-label text-mono-label uppercase tracking-widest text-on-surface-variant transition-colors hover:border-error hover:text-error disabled:opacity-40"
            >
              Decline
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => decide("approve")}
              className="btn-notch bg-primary-container px-3 py-1.5 font-mono-label text-mono-label uppercase tracking-widest text-on-primary-container transition-[filter] hover:brightness-110 disabled:opacity-40"
            >
              Approve
            </button>
          </>
        )}
      </div>
    </li>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}
