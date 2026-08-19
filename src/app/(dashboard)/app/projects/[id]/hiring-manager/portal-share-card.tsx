"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { unwrap } from "@/lib/actions/result";
import { setMandateSharedAction } from "@/app/(dashboard)/app/clients/[id]/portal-people-actions";

/**
 * The mandate's own view of the D2 share act. The token card above it is
 * the zero-friction door (D5); this card is the account door — shared or
 * not, and which of the client's hiring managers hold this slate. People
 * are invited from the client page, where the whole roster lives; this
 * card links there rather than repeating the form.
 */
export function PortalShareCard({
  projectId,
  clientId,
  clientName,
  shared,
  grantedHms,
  canShare,
}: {
  projectId: string;
  clientId: string | null;
  clientName: string | null;
  shared: boolean;
  grantedHms: Array<{ id: string; name: string; suspended: boolean }>;
  canShare: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  if (!clientId) {
    return (
      <div className="border border-outline-variant bg-surface-container px-5 py-4">
        <p className="font-mono-label text-mono-label uppercase tracking-widest text-outline">
          Client portal
        </p>
        <p className="mt-1 text-body-main text-on-surface-variant">
          This mandate has no client record yet, so there is no company to
          share it with. The token link above still works.
        </p>
      </div>
    );
  }

  const toggle = () => {
    if (!canShare || pending) return;
    start(async () => {
      try {
        unwrap(await setMandateSharedAction(clientId, projectId, !shared));
        toast.success(
          shared
            ? "Withdrawn from the client portal."
            : `Shared with ${clientName ?? "the client"}'s portal.`
        );
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "The change failed.");
      }
    });
  };

  return (
    <div className="space-y-3 border border-outline-variant bg-surface-container px-5 py-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <p className="font-mono-label text-mono-label uppercase tracking-widest text-outline">
          Client portal
        </p>
        <p
          className={`font-mono-label text-mono-label uppercase tracking-wider ${
            shared ? "text-primary" : "text-on-surface-variant"
          }`}
        >
          {shared
            ? `Shared with ${clientName ?? "the client"}`
            : "Not shared — invisible to the client side"}
        </p>
        {canShare && (
          <button
            type="button"
            onClick={toggle}
            disabled={pending}
            aria-busy={pending ? true : undefined}
            className="ml-auto border border-outline-variant px-3 py-1.5 font-mono-label text-mono-label uppercase tracking-wider text-on-surface-variant transition-colors hover:border-primary hover:text-primary disabled:opacity-40"
          >
            {pending ? "Working…" : shared ? "Withdraw" : "Share with client"}
          </button>
        )}
      </div>

      {shared && (
        <p className="text-body-main text-on-surface-variant">
          {grantedHms.length === 0 ? (
            <>
              No hiring managers hold this slate yet — HR and client-admin
              accounts see it already.{" "}
            </>
          ) : (
            <>
              Held by{" "}
              {grantedHms.map((hm, i) => (
                <span key={hm.id}>
                  {i > 0 && ", "}
                  <span className={hm.suspended ? "text-outline line-through" : "text-on-surface"}>
                    {hm.name}
                  </span>
                </span>
              ))}
              .{" "}
            </>
          )}
          <Link
            href={`/app/clients/${clientId}`}
            className="text-primary underline-offset-2 hover:underline"
          >
            Manage portal people on the client page
          </Link>
          .
        </p>
      )}
    </div>
  );
}
