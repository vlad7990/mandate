"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { unwrap } from "@/lib/actions/result";
import {
  inviteColleagueAction,
  resendInvitationAction,
  revokeInvitationAction,
  setColleagueStatusAction,
  grantAccessAction,
  revokeAccessAction,
} from "./actions";

export type SharedMandate = { projectId: string; title: string };

const ROLE_OPTIONS = [
  {
    value: "hiring_manager",
    label: "Hiring Manager",
    hint: "Sees only the searches you pick below.",
  },
  {
    value: "client_hr",
    label: "HR",
    hint: "Sees every search shared with your company.",
  },
  {
    value: "client_admin",
    label: "Client Admin",
    hint: "Everything HR sees, plus this People screen.",
  },
] as const;

export function InviteColleagueForm({
  sharedMandates,
}: {
  sharedMandates: SharedMandate[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<string>("hiring_manager");
  const [projectIds, setProjectIds] = useState<string[]>([]);

  const submit = () => {
    if (pending) return;
    start(async () => {
      try {
        const outcome = unwrap(
          await inviteColleagueAction({
            email: email.trim(),
            fullName: fullName.trim(),
            role,
            projectIds: role === "hiring_manager" ? projectIds : [],
          })
        );
        if (outcome.emailSent) {
          toast.success(`Invitation sent to ${email.trim()}.`);
        } else {
          // Delivery honesty: the invitation exists, the email did not go.
          toast.warning(
            "Invitation created, but the email could not be sent. Ask your search team to pass the link on.",
            { description: outcome.emailDetail ?? undefined, duration: 10000 }
          );
        }
        setFullName("");
        setEmail("");
        setProjectIds([]);
        router.refresh();
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "The invitation failed."
        );
      }
    });
  };

  const selectedRole = ROLE_OPTIONS.find((r) => r.value === role);

  return (
    <div className="space-y-4 border border-outline-variant bg-surface-container px-5 py-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1">
          <span className="font-mono-label text-mono-label uppercase tracking-wider text-outline">
            Name
          </span>
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Jane Whitfield"
            className="w-full border border-outline-variant bg-surface-container-low px-3 py-2 text-body-main text-on-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
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
            placeholder="jane@yourcompany.com"
            className="w-full border border-outline-variant bg-surface-container-low px-3 py-2 text-body-main text-on-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          />
        </label>
      </div>

      <fieldset className="space-y-2">
        <legend className="font-mono-label text-mono-label uppercase tracking-wider text-outline">
          Role
        </legend>
        <div className="flex flex-wrap gap-2">
          {ROLE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setRole(option.value)}
              aria-pressed={role === option.value}
              className={`border px-3 py-1.5 font-mono-label text-mono-label uppercase tracking-wider transition-colors ${
                role === option.value
                  ? "border-primary text-primary"
                  : "border-outline-variant text-on-surface-variant hover:border-primary hover:text-primary"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        {selectedRole && (
          <p className="text-body-main text-on-surface-variant">{selectedRole.hint}</p>
        )}
      </fieldset>

      {role === "hiring_manager" && (
        <fieldset className="space-y-2">
          <legend className="font-mono-label text-mono-label uppercase tracking-wider text-outline">
            Searches they can open
          </legend>
          {sharedMandates.length === 0 ? (
            <p className="text-body-main text-on-surface-variant">
              No searches are shared with your company yet — you can invite
              them now and grant access once a search is shared.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {sharedMandates.map((m) => {
                const on = projectIds.includes(m.projectId);
                return (
                  <button
                    key={m.projectId}
                    type="button"
                    onClick={() =>
                      setProjectIds((prev) =>
                        on
                          ? prev.filter((id) => id !== m.projectId)
                          : [...prev, m.projectId]
                      )
                    }
                    aria-pressed={on}
                    className={`border px-3 py-1.5 text-body-main transition-colors ${
                      on
                        ? "border-primary text-primary"
                        : "border-outline-variant text-on-surface-variant hover:border-primary hover:text-primary"
                    }`}
                  >
                    {m.title}
                  </button>
                );
              })}
            </div>
          )}
        </fieldset>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={pending || !email.trim() || !fullName.trim()}
        aria-busy={pending ? true : undefined}
        className="border border-primary px-4 py-2 font-mono-label text-mono-label uppercase tracking-widest text-primary transition-colors hover:bg-primary hover:text-on-primary disabled:cursor-not-allowed disabled:opacity-40"
      >
        {pending ? "Inviting…" : "Send invitation"}
      </button>
    </div>
  );
}

export function InvitationRow({
  invitation,
}: {
  invitation: {
    id: string;
    email: string;
    fullName: string;
    roleLabel: string;
    invitedByLabel: string;
    expiresAt: string;
    revoked: boolean;
  };
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const revoke = () => {
    start(async () => {
      try {
        unwrap(await revokeInvitationAction(invitation.id));
        toast.success(`Invitation for ${invitation.email} revoked.`);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not revoke.");
      }
    });
  };

  const resend = () => {
    start(async () => {
      try {
        const outcome = unwrap(await resendInvitationAction(invitation.id));
        if (outcome.emailSent) {
          toast.success(
            `Invitation re-sent to ${invitation.email} — good for 14 more days.`
          );
        } else {
          toast.warning(
            "Clock refreshed, but the email could not be sent. Ask your search team to pass the link on.",
            { description: outcome.emailDetail ?? undefined, duration: 10000 }
          );
        }
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not resend.");
      }
    });
  };

  return (
    <li className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-5 py-3">
      <span className="text-on-surface">{invitation.fullName}</span>
      <span className="text-body-main text-on-surface-variant">{invitation.email}</span>
      <span className="font-mono-label text-mono-label uppercase tracking-wider text-outline">
        {invitation.roleLabel}
      </span>
      <span className="ml-auto font-mono-label text-mono-label uppercase tracking-wider text-on-surface-variant">
        {invitation.revoked
          ? "Revoked"
          : `Expires ${new Date(invitation.expiresAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`}
      </span>
      {!invitation.revoked && (
        <>
          <button
            type="button"
            onClick={resend}
            disabled={pending}
            className="font-mono-label text-mono-label uppercase tracking-wider text-outline transition-colors hover:text-primary disabled:opacity-40"
          >
            Resend
          </button>
          <button
            type="button"
            onClick={revoke}
            disabled={pending}
            className="font-mono-label text-mono-label uppercase tracking-wider text-outline transition-colors hover:text-error disabled:opacity-40"
          >
            Revoke
          </button>
        </>
      )}
    </li>
  );
}

export function ColleagueRow({
  person,
  sharedMandates,
}: {
  person: {
    id: string;
    name: string;
    email: string;
    roleLabel: string;
    isHiringManager: boolean;
    status: string;
    isSelf: boolean;
    grantedProjectIds: string[];
  };
  sharedMandates: SharedMandate[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const suspended = person.status === "suspended";

  const setStatus = (next: "active" | "suspended") => {
    start(async () => {
      try {
        unwrap(await setColleagueStatusAction(person.id, next));
        toast.success(
          next === "suspended"
            ? `${person.name}'s access is suspended.`
            : `${person.name}'s access is restored.`
        );
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "The change failed.");
      }
    });
  };

  const toggleGrant = (projectId: string, granted: boolean) => {
    start(async () => {
      try {
        if (granted) {
          unwrap(await revokeAccessAction(projectId, person.id));
        } else {
          unwrap(await grantAccessAction(projectId, person.id));
        }
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "The change failed.");
      }
    });
  };

  return (
    <li className="space-y-2 px-5 py-3">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className={suspended ? "text-outline line-through" : "text-on-surface"}>
          {person.name}
        </span>
        <span className="text-body-main text-on-surface-variant">{person.email}</span>
        <span className="font-mono-label text-mono-label uppercase tracking-wider text-outline">
          {person.roleLabel}
          {person.isSelf ? " · you" : ""}
        </span>
        {suspended && (
          <span className="font-mono-label text-mono-label uppercase tracking-wider text-error">
            Suspended
          </span>
        )}
        {!person.isSelf && (
          <button
            type="button"
            onClick={() => setStatus(suspended ? "active" : "suspended")}
            disabled={pending}
            className="ml-auto font-mono-label text-mono-label uppercase tracking-wider text-outline transition-colors hover:text-error disabled:opacity-40"
          >
            {suspended ? "Restore access" : "Suspend"}
          </button>
        )}
      </div>

      {person.isHiringManager && sharedMandates.length > 0 && !suspended && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono-label text-mono-label uppercase tracking-wider text-outline">
            Searches
          </span>
          {sharedMandates.map((m) => {
            const granted = person.grantedProjectIds.includes(m.projectId);
            return (
              <button
                key={m.projectId}
                type="button"
                onClick={() => toggleGrant(m.projectId, granted)}
                disabled={pending}
                aria-pressed={granted}
                title={granted ? "Click to revoke access" : "Click to grant access"}
                className={`border px-2 py-1 text-sm transition-colors disabled:opacity-40 ${
                  granted
                    ? "border-primary text-primary"
                    : "border-outline-variant text-outline hover:border-primary hover:text-primary"
                }`}
              >
                {m.title}
              </button>
            );
          })}
        </div>
      )}
    </li>
  );
}
