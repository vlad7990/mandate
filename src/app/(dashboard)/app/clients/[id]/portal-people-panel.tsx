"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MastHead } from "@/components/ui/mast-head";
import { unwrap } from "@/lib/actions/result";
import { ROLE_LABELS, type ExternalRole } from "@/lib/auth/roles";
import {
  inviteExternalStaffAction,
  resendInvitationStaffAction,
  revokeInvitationStaffAction,
  setExternalStatusStaffAction,
  setMandateSharedAction,
  setHmGrantAction,
} from "./portal-people-actions";

/**
 * The staff side of the client portal relationship: which mandates are
 * shared (the D2 act), who at the client holds an account, and which
 * hiring managers hold which slates. Writes are drawn only when the
 * reader holds clients:share; the panel itself renders for every org
 * reader, the same split the contacts panel makes.
 */

export type PanelMandate = { id: string; title: string; shared: boolean };
export type PanelExternal = {
  id: string;
  name: string;
  email: string;
  role: ExternalRole;
  status: string;
  grantedProjectIds: string[];
};
export type PanelInvitation = {
  id: string;
  email: string;
  fullName: string;
  role: ExternalRole;
  invitedByLabel: string;
  expiresAt: string;
};

const EXTERNAL_ROLE_OPTIONS: ReadonlyArray<{ value: ExternalRole; hint: string }> = [
  { value: "hiring_manager", hint: "Sees only the mandates you grant below." },
  { value: "client_hr", hint: "Sees every mandate shared with the client." },
  { value: "client_admin", hint: "Everything HR sees, plus managing their own people." },
];

export function PortalPeoplePanel({
  clientId,
  clientName,
  organizationName,
  mandates,
  externals,
  invitations,
  canShare,
}: {
  clientId: string;
  clientName: string;
  organizationName: string;
  mandates: PanelMandate[];
  externals: PanelExternal[];
  invitations: PanelInvitation[];
  canShare: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const run = (fn: () => Promise<void>) => {
    if (pending) return;
    start(async () => {
      try {
        await fn();
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "The change failed.");
      }
    });
  };

  const sharedMandates = mandates.filter((m) => m.shared);
  const hasAnyone = externals.length > 0 || invitations.length > 0;

  return (
    <section className="space-y-3">
      <MastHead
        tone="neutral"
        label="Client portal"
        meta={
          hasAnyone
            ? `${externals.length} ${externals.length === 1 ? "account" : "accounts"} // ${sharedMandates.length} shared`
            : "Nobody invited yet"
        }
      />

      {/* Shares — nothing leaves the building without one. */}
      <div className="space-y-2 border border-outline-variant bg-surface-container-low px-4 py-3">
        <p className="font-mono-label text-mono-label uppercase tracking-widest text-outline">
          Shared mandates
        </p>
        {mandates.length === 0 ? (
          <p className="text-body-main text-on-surface-variant">
            No mandates at this client yet — sharing starts when a search does.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {mandates.map((m) => (
              <button
                key={m.id}
                type="button"
                disabled={!canShare || pending}
                aria-pressed={m.shared}
                title={
                  !canShare
                    ? "Sharing needs the clients:share capability"
                    : m.shared
                      ? "Shared with the client portal — click to withdraw"
                      : "Not visible to the client — click to share"
                }
                onClick={() =>
                  run(async () => {
                    unwrap(await setMandateSharedAction(clientId, m.id, !m.shared));
                    toast.success(
                      m.shared
                        ? `${m.title} withdrawn from the portal.`
                        : `${m.title} shared with ${clientName}.`
                    );
                  })
                }
                className={`border px-3 py-1.5 text-sm transition-colors disabled:cursor-not-allowed ${
                  m.shared
                    ? "border-primary text-primary"
                    : "border-outline-variant text-on-surface-variant"
                } ${canShare ? "hover:border-primary hover:text-primary" : "opacity-70"}`}
              >
                {m.shared ? "◉ " : "○ "}
                {m.title}
              </button>
            ))}
          </div>
        )}
        <p className="text-sm text-on-surface-variant">
          A confidential search stays invisible to the client side until it is
          shared here or on its own hiring-manager tab.
        </p>
      </div>

      {/* Accounts */}
      {externals.length > 0 && (
        <ul className="divide-y divide-outline-variant border border-outline-variant bg-surface-container-low">
          {externals.map((person) => {
            const suspended = person.status === "suspended";
            return (
              <li key={person.id} className="space-y-2 px-4 py-3">
                <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                  <span className={suspended ? "text-outline line-through" : "text-on-surface"}>
                    {person.name}
                  </span>
                  <span className="text-body-main text-on-surface-variant">{person.email}</span>
                  <span className="font-mono-label text-mono-label uppercase tracking-wider text-outline">
                    {ROLE_LABELS[person.role]}
                  </span>
                  {suspended && (
                    <span className="font-mono-label text-mono-label uppercase tracking-wider text-error">
                      Suspended
                    </span>
                  )}
                  {canShare && (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() =>
                        run(async () => {
                          unwrap(
                            await setExternalStatusStaffAction(
                              clientId,
                              person.id,
                              suspended ? "active" : "suspended"
                            )
                          );
                          toast.success(
                            suspended
                              ? `${person.name}'s portal access is restored.`
                              : `${person.name}'s portal access is suspended.`
                          );
                        })
                      }
                      className="ml-auto font-mono-label text-mono-label uppercase tracking-wider text-outline transition-colors hover:text-error disabled:opacity-40"
                    >
                      {suspended ? "Restore" : "Suspend"}
                    </button>
                  )}
                </div>

                {person.role === "hiring_manager" && sharedMandates.length > 0 && !suspended && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono-label text-mono-label uppercase tracking-wider text-outline">
                      Slates
                    </span>
                    {sharedMandates.map((m) => {
                      const granted = person.grantedProjectIds.includes(m.id);
                      return (
                        <button
                          key={m.id}
                          type="button"
                          disabled={!canShare || pending}
                          aria-pressed={granted}
                          onClick={() =>
                            run(async () => {
                              unwrap(
                                await setHmGrantAction(clientId, m.id, person.id, !granted)
                              );
                            })
                          }
                          className={`border px-2 py-1 text-sm transition-colors disabled:cursor-not-allowed ${
                            granted
                              ? "border-primary text-primary"
                              : "border-outline-variant text-outline"
                          } ${canShare ? "hover:border-primary hover:text-primary" : "opacity-70"}`}
                        >
                          {m.title}
                        </button>
                      );
                    })}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* Open invitations */}
      {invitations.length > 0 && (
        <ul className="divide-y divide-outline-variant border border-outline-variant bg-surface-container-low">
          {invitations.map((inv) => (
            <li key={inv.id} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-4 py-3">
              <span className="text-on-surface">{inv.fullName}</span>
              <span className="text-body-main text-on-surface-variant">{inv.email}</span>
              <span className="font-mono-label text-mono-label uppercase tracking-wider text-outline">
                {ROLE_LABELS[inv.role]} · invited by {inv.invitedByLabel || "—"}
              </span>
              <span className="ml-auto font-mono-label text-mono-label uppercase tracking-wider text-on-surface-variant">
                Expires{" "}
                {new Date(inv.expiresAt).toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "short",
                })}
              </span>
              {canShare && (
                <>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      run(async () => {
                        const outcome = unwrap(
                          await resendInvitationStaffAction({
                            clientId,
                            clientName,
                            organizationName,
                            invitationId: inv.id,
                          })
                        );
                        if (outcome.emailSent) {
                          toast.success(
                            `Invitation re-sent to ${inv.email} — the link is good for 14 more days.`
                          );
                        } else {
                          toast.warning("Clock refreshed, but the email did not send.", {
                            description: outcome.inviteUrl
                              ? `Share the link by hand: ${outcome.inviteUrl}`
                              : (outcome.emailDetail ?? undefined),
                            duration: 15000,
                          });
                          if (outcome.inviteUrl && navigator?.clipboard) {
                            void navigator.clipboard.writeText(outcome.inviteUrl);
                          }
                        }
                      })
                    }
                    className="font-mono-label text-mono-label uppercase tracking-wider text-outline transition-colors hover:text-primary disabled:opacity-40"
                  >
                    Resend
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      run(async () => {
                        unwrap(await revokeInvitationStaffAction(clientId, inv.id));
                        toast.success(`Invitation for ${inv.email} revoked.`);
                      })
                    }
                    className="font-mono-label text-mono-label uppercase tracking-wider text-outline transition-colors hover:text-error disabled:opacity-40"
                  >
                    Revoke
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {canShare && (
        <InviteExternalForm
          clientId={clientId}
          clientName={clientName}
          organizationName={organizationName}
          sharedMandates={sharedMandates}
          allMandates={mandates}
        />
      )}
    </section>
  );
}

function InviteExternalForm({
  clientId,
  clientName,
  organizationName,
  sharedMandates,
  allMandates,
}: {
  clientId: string;
  clientName: string;
  organizationName: string;
  sharedMandates: PanelMandate[];
  allMandates: PanelMandate[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<ExternalRole>("hiring_manager");
  const [projectIds, setProjectIds] = useState<string[]>([]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="border border-outline-variant px-4 py-2 font-mono-label text-mono-label uppercase tracking-widest text-on-surface-variant transition-colors hover:border-primary hover:text-primary"
      >
        + Invite to portal
      </button>
    );
  }

  const submit = () => {
    if (pending) return;
    start(async () => {
      try {
        const outcome = unwrap(
          await inviteExternalStaffAction({
            clientId,
            clientName,
            organizationName,
            email: email.trim(),
            fullName: fullName.trim(),
            role,
            projectIds,
          })
        );
        if (outcome.emailSent) {
          toast.success(`Invitation emailed to ${email.trim()}.`);
        } else {
          // Delivery honesty, with the fallback in hand: the inviter can
          // pass the link on themselves.
          toast.warning("Invitation created, but the email did not send.", {
            description: outcome.inviteUrl
              ? `Share the link by hand: ${outcome.inviteUrl}`
              : (outcome.emailDetail ?? undefined),
            duration: 15000,
          });
          if (outcome.inviteUrl && navigator?.clipboard) {
            void navigator.clipboard.writeText(outcome.inviteUrl);
          }
        }
        setFullName("");
        setEmail("");
        setProjectIds([]);
        setOpen(false);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "The invitation failed.");
      }
    });
  };

  // An HM invitation may grant any of the client's mandates: granting an
  // unshared one shares it in the same act (the RPC's rule for staff).
  const grantable = role === "hiring_manager" ? allMandates : [];

  return (
    <div className="space-y-4 border border-outline-variant bg-surface-container-low px-4 py-4">
      <p className="font-mono-label text-mono-label uppercase tracking-widest text-outline">
        Invite to portal
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1">
          <span className="font-mono-label text-mono-label uppercase tracking-wider text-outline">
            Name
          </span>
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="w-full border border-outline-variant bg-surface-container px-3 py-2 text-body-main text-on-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          />
        </label>
        <label className="space-y-1">
          <span className="font-mono-label text-mono-label uppercase tracking-wider text-outline">
            Work email
          </span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full border border-outline-variant bg-surface-container px-3 py-2 text-body-main text-on-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        {EXTERNAL_ROLE_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setRole(option.value)}
            aria-pressed={role === option.value}
            title={option.hint}
            className={`border px-3 py-1.5 font-mono-label text-mono-label uppercase tracking-wider transition-colors ${
              role === option.value
                ? "border-primary text-primary"
                : "border-outline-variant text-on-surface-variant hover:border-primary hover:text-primary"
            }`}
          >
            {ROLE_LABELS[option.value]}
          </button>
        ))}
      </div>
      <p className="text-sm text-on-surface-variant">
        {EXTERNAL_ROLE_OPTIONS.find((o) => o.value === role)?.hint}
      </p>

      {grantable.length > 0 && (
        <div className="space-y-2">
          <p className="font-mono-label text-mono-label uppercase tracking-wider text-outline">
            Mandates to grant{" "}
            <span className="normal-case tracking-normal">
              (granting an unshared mandate shares it)
            </span>
          </p>
          <div className="flex flex-wrap gap-2">
            {grantable.map((m) => {
              const on = projectIds.includes(m.id);
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() =>
                    setProjectIds((prev) =>
                      on ? prev.filter((id) => id !== m.id) : [...prev, m.id]
                    )
                  }
                  aria-pressed={on}
                  className={`border px-3 py-1.5 text-sm transition-colors ${
                    on
                      ? "border-primary text-primary"
                      : "border-outline-variant text-on-surface-variant hover:border-primary hover:text-primary"
                  }`}
                >
                  {m.title}
                  {!m.shared && " (unshared)"}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={submit}
          disabled={pending || !email.trim() || !fullName.trim()}
          aria-busy={pending ? true : undefined}
          className="border border-primary px-4 py-2 font-mono-label text-mono-label uppercase tracking-widest text-primary transition-colors hover:bg-primary hover:text-on-primary disabled:cursor-not-allowed disabled:opacity-40"
        >
          {pending ? "Inviting…" : "Send invitation"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="px-3 py-2 font-mono-label text-mono-label uppercase tracking-widest text-outline transition-colors hover:text-on-surface"
        >
          Cancel
        </button>
      </div>
      {sharedMandates.length === 0 && role !== "hiring_manager" && (
        <p className="text-sm text-on-surface-variant">
          Nothing is shared with {clientName} yet — they&apos;ll see an empty
          portal until a mandate is shared above.
        </p>
      )}
    </div>
  );
}
