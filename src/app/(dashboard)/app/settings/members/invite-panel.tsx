"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { unwrap } from "@/lib/actions/result";
import { useHydrated } from "@/lib/use-hydrated";
import { STAFF_ROLES, ROLE_LABELS, type StaffRole } from "@/lib/auth/roles";
import { issueStaffInvitationAction, revokeStaffInvitationAction } from "./actions";

export type OpenInvitationRow = {
  id: string;
  email: string;
  full_name: string;
  role: string;
  invited_by_label: string | null;
  expires_at: string;
};

/**
 * Staff invitations (§134 D1/D2). Nothing is emailed — the admin hands the
 * /join link over, exactly the HM-token contract. The invite IS the
 * approval: whoever redeems it lands active, in this organisation, with the
 * role chosen here.
 */
export function StaffInvitePanel({
  invitations,
}: {
  invitations: OpenInvitationRow[];
}) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<StaffRole>("recruiter");
  const [issuedUrl, setIssuedUrl] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [revoking, startRevoke] = useTransition();

  // Gated on hydration, not `typeof window` (§132's lesson).
  const origin = hydrated ? window.location.origin : "";

  const issue = () => {
    start(async () => {
      try {
        const { url } = unwrap(
          await issueStaffInvitationAction({ email, fullName, role })
        );
        setIssuedUrl(url);
        setFullName("");
        setEmail("");
        toast.success("Invitation issued — hand the link over");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "The invitation failed.");
      }
    });
  };

  const revoke = (id: string, label: string) => {
    if (!window.confirm(`Revoke the invitation for ${label}? It cannot be reactivated.`)) {
      return;
    }
    startRevoke(async () => {
      try {
        unwrap(await revokeStaffInvitationAction(id));
        toast.success("Invitation revoked");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "The revocation failed.");
      }
    });
  };

  return (
    <div className="space-y-4">
      <div className="border border-outline-variant bg-surface-container-low px-4 py-4 space-y-3">
        <p className="text-body-main text-on-surface-variant">
          Invite a colleague onto this organisation&apos;s desk. Nothing is
          emailed — you hand the link over. Whoever redeems it joins{" "}
          <span className="text-on-surface">active</span>, with the role you
          choose here; the link is single-use and expires in fourteen days.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="font-mono-label text-mono-label uppercase tracking-widest text-outline">
              Full name
            </span>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Jane Smith"
              className="border border-outline-variant bg-surface-container-lowest px-3 py-1.5 text-body-main text-on-surface placeholder:text-outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-mono-label text-mono-label uppercase tracking-widest text-outline">
              Email
            </span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="jane@firm.com"
              className="border border-outline-variant bg-surface-container-lowest px-3 py-1.5 text-body-main text-on-surface placeholder:text-outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-mono-label text-mono-label uppercase tracking-widest text-outline">
              Role
            </span>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as StaffRole)}
              className="border border-outline-variant bg-surface-container-lowest px-3 py-1.5 text-body-main text-on-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              {STAFF_ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={issue}
            disabled={pending || !email.trim() || !fullName.trim()}
            className="border border-primary px-3 py-1.5 font-mono-label text-mono-label uppercase tracking-widest text-primary transition-colors hover:bg-primary hover:text-on-primary disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            {pending ? "Issuing…" : "Issue Invitation"}
          </button>
        </div>
        {issuedUrl && (
          <p className="break-all font-mono-data text-body-main text-on-surface">
            {origin}
            {issuedUrl}
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(`${origin}${issuedUrl}`);
                  toast.success("Link copied");
                } catch {
                  toast.error("Clipboard unavailable.");
                }
              }}
              className="ml-3 border border-outline-variant px-2 py-0.5 font-mono-label text-mono-label uppercase tracking-widest text-outline hover:border-primary hover:text-primary transition-colors"
            >
              Copy
            </button>
          </p>
        )}
      </div>

      {invitations.length > 0 && (
        <ul className="space-y-2">
          {invitations.map((inv) => (
            <li
              key={inv.id}
              className="flex flex-wrap items-center justify-between gap-3 border border-outline-variant bg-surface-container-low px-4 py-2.5"
            >
              <div className="min-w-0">
                <p className="text-body-main text-on-surface">
                  {inv.full_name}
                  <span className="ml-2 font-mono-data text-on-surface-variant">
                    {inv.email}
                  </span>
                </p>
                <p className="font-mono-label text-mono-label uppercase tracking-widest text-outline">
                  {inv.role}
                  {inv.invited_by_label ? ` // invited by ${inv.invited_by_label}` : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => revoke(inv.id, inv.full_name || inv.email)}
                disabled={revoking}
                className="px-2 py-1 border border-outline-variant text-outline hover:border-error hover:text-error font-mono-label text-mono-label uppercase tracking-widest transition-colors disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-error"
              >
                Revoke
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
