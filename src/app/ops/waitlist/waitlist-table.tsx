"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { IconCheck } from "@/components/icons";
import { useHydrated } from "@/lib/use-hydrated";
import { STAFF_ROLES, ROLE_LABELS, type StaffRole } from "@/lib/auth/roles";
import { deriveOrgSlug } from "@/lib/orgs/provision-rules";
import {
  approveWaitlistRequestAction,
  rejectWaitlistRequestAction,
  saveWaitlistNoteAction,
  type ApprovalProvision,
} from "./actions";
import { unwrap } from "@/lib/actions/result";

export type WaitlistInvitation = {
  token: string;
  role: string;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
  organization: { name: string } | null;
};

export type WaitlistRow = {
  id: string;
  full_name: string;
  email: string;
  company: string | null;
  role: string | null;
  referral_source: string | null;
  use_case: string | null;
  status: "pending" | "approved" | "rejected";
  notes: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  staff_invitation: WaitlistInvitation | null;
};

type Organization = { id: string; name: string };

const STATUS_TONE: Record<WaitlistRow["status"], string> = {
  pending: "border-primary/60 bg-primary-container/15 text-primary",
  approved:
    "border-secondary-fixed-dim/60 bg-secondary-fixed-dim/10 text-secondary-fixed-dim",
  rejected: "border-error/60 bg-error/10 text-error",
};

export function WaitlistTable({
  rows,
  organizations,
}: {
  rows: WaitlistRow[];
  organizations: Organization[];
}) {
  const [filter, setFilter] = useState<"all" | WaitlistRow["status"]>("pending");
  const filtered =
    filter === "all" ? rows : rows.filter((r) => r.status === filter);

  return (
    <div className="space-y-3">
      <nav className="flex border border-outline-variant divide-x divide-outline-variant">
        {(["pending", "approved", "rejected", "all"] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setFilter(s)}
            aria-pressed={filter === s}
            className={cn(
              "flex-1 px-3 py-1.5 font-mono-label text-mono-label uppercase tracking-widest transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-primary",
              filter === s
                ? "btn-notch bg-primary-container text-on-primary-container"
                : "bg-surface-container-low text-on-surface-variant hover:text-on-surface hover:bg-surface-container"
            )}
          >
            {s}
          </button>
        ))}
      </nav>

      {filtered.length === 0 ? (
        <p className="bg-surface-container-low border border-outline-variant px-4 py-6 text-center text-body-main text-on-surface-variant">
          No requests in this state.
        </p>
      ) : (
        <ul className="space-y-2">
          {filtered.map((r) => (
            <RequestCard key={r.id} row={r} organizations={organizations} />
          ))}
        </ul>
      )}
    </div>
  );
}

function RequestCard({
  row,
  organizations,
}: {
  row: WaitlistRow;
  organizations: Organization[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [notesDraft, setNotesDraft] = useState(row.notes ?? "");
  const [notesEditing, setNotesEditing] = useState(false);
  const [approving, setApproving] = useState(false);
  const [issuedUrl, setIssuedUrl] = useState<string | null>(null);

  const saveNotes = () => {
    if (pending) return;
    start(async () => {
      try {
        unwrap(await saveWaitlistNoteAction(row.id, notesDraft));
        toast.success("Notes saved");
        setNotesEditing(false);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Save failed.");
      }
    });
  };

  const reject = () => {
    if (pending) return;
    if (!window.confirm(`Reject ${row.full_name}?`)) return;
    start(async () => {
      try {
        unwrap(await rejectWaitlistRequestAction(row.id));
        toast.success("Rejected");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Reject failed.");
      }
    });
  };

  const isPending = row.status === "pending";

  return (
    <article className="bg-surface-container-low border border-outline-variant p-4 space-y-3">
      <header className="flex items-baseline justify-between gap-3 flex-wrap">
        <div className="space-y-0.5 min-w-0 flex-1">
          <div className="flex items-baseline gap-2 flex-wrap">
            <h3 className="font-h2 text-h2 text-on-surface tracking-tight">
              {row.full_name}
            </h3>
            <span
              className={cn(
                "px-1.5 py-0 border font-mono-label text-mono-label uppercase tracking-widest",
                STATUS_TONE[row.status]
              )}
            >
              {row.status}
            </span>
          </div>
          <p className="font-mono-data text-body-main text-on-surface-variant">
            {row.email}
            {row.company && ` · ${row.company}`}
            {row.role && ` · ${row.role}`}
          </p>
        </div>
        <span className="font-mono-label text-mono-label text-outline uppercase tracking-widest tabular-nums">
          {formatRelative(row.created_at)}
        </span>
      </header>

      {row.referral_source && (
        <KV label="Heard about" value={row.referral_source} />
      )}
      {row.use_case && <KV label="Use case" value={row.use_case} />}

      {row.staff_invitation && (
        <InvitationState invitation={row.staff_invitation} />
      )}

      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
            Founder notes
          </span>
          {!notesEditing && (
            <button
              type="button"
              onClick={() => setNotesEditing(true)}
              className="font-mono-label text-mono-label text-outline uppercase tracking-widest hover:text-primary transition-colors"
            >
              {row.notes ? "Edit" : "Add note"}
            </button>
          )}
        </div>
        {notesEditing ? (
          <div className="space-y-2">
            <textarea
              value={notesDraft}
              onChange={(e) => setNotesDraft(e.target.value)}
              rows={3}
              disabled={pending}
              className="w-full bg-surface-container-lowest border border-outline-variant px-3 py-2 font-mono-data text-body-main text-on-surface focus:border-primary focus:outline-none transition-colors resize-y"
            />
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setNotesEditing(false);
                  setNotesDraft(row.notes ?? "");
                }}
                disabled={pending}
                className="px-3 py-1 border border-outline-variant text-on-surface-variant font-mono-label text-mono-label uppercase tracking-widest hover:border-primary hover:text-primary transition-colors disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveNotes}
                disabled={pending}
                className="px-3 py-1 btn-notch bg-primary-container text-on-primary-container font-mono-label text-mono-label uppercase tracking-widest hover:brightness-110 active:scale-[0.98] transition-[filter,transform] disabled:opacity-60"
              >
                Save
              </button>
            </div>
          </div>
        ) : row.notes ? (
          <p className="font-mono-data text-body-main text-on-surface-variant italic leading-relaxed">
            {row.notes}
          </p>
        ) : (
          <p className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
            No notes yet
          </p>
        )}
      </div>

      {issuedUrl && <IssuedLink url={issuedUrl} />}

      {isPending && !approving && !issuedUrl && (
        <footer className="pt-3 border-t border-outline-variant/40 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={reject}
            disabled={pending}
            className="px-3 py-1.5 border border-outline-variant text-on-surface-variant font-mono-label text-mono-label uppercase tracking-widest hover:border-error hover:text-error transition-colors disabled:opacity-60"
          >
            Reject
          </button>
          <button
            type="button"
            onClick={() => setApproving(true)}
            disabled={pending}
            className="px-3 py-1.5 btn-notch bg-primary-container text-on-primary-container font-mono-label text-mono-label uppercase tracking-widest hover:brightness-110 active:scale-[0.98] transition-[filter,transform] flex items-center gap-1.5 disabled:opacity-60"
          >
            <IconCheck size={14} />
            Approve
          </button>
        </footer>
      )}

      {isPending && approving && !issuedUrl && (
        <ApprovalPanel
          row={row}
          organizations={organizations}
          onCancel={() => setApproving(false)}
          onIssued={(url) => {
            setIssuedUrl(url);
            setApproving(false);
            router.refresh();
          }}
        />
      )}
    </article>
  );
}

/**
 * The provisioning choice (§137 D1) — explicit, never defaulted: a new
 * organisation with the requester as its admin, or a seat in an existing
 * one at a chosen role. Approval issues an invitation, never an account;
 * nothing is emailed — the founder hands the link over.
 */
function ApprovalPanel({
  row,
  organizations,
  onCancel,
  onIssued,
}: {
  row: WaitlistRow;
  organizations: Organization[];
  onCancel: () => void;
  onIssued: (url: string) => void;
}) {
  const [pending, start] = useTransition();
  const [mode, setMode] = useState<"new-org" | "existing-org">("new-org");
  const [orgName, setOrgName] = useState(row.company ?? "");
  const [slug, setSlug] = useState(deriveOrgSlug(row.company ?? ""));
  const [slugTouched, setSlugTouched] = useState(false);
  const [orgChoice, setOrgChoice] = useState("");
  const [role, setRole] = useState<StaffRole>("recruiter");

  const submit = () => {
    if (pending) return;
    const provision: ApprovalProvision =
      mode === "new-org"
        ? { kind: "new-org", orgName, orgSlug: slug }
        : { kind: "existing-org", organizationId: orgChoice, role };
    if (mode === "existing-org" && !orgChoice) {
      toast.error("Choose an organisation to approve this request into.");
      return;
    }
    start(async () => {
      try {
        const { url } = unwrap(
          await approveWaitlistRequestAction(row.id, provision)
        );
        toast.success("Approved — hand the link over");
        onIssued(url);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Approve failed.");
      }
    });
  };

  const fieldClass =
    "border border-outline-variant bg-surface-container-lowest px-3 py-1.5 text-body-main text-on-surface placeholder:text-outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

  return (
    <div className="pt-3 border-t border-outline-variant/40 space-y-3">
      <p className="text-body-main text-on-surface-variant">
        Approving <span className="text-on-surface">{row.full_name}</span>{" "}
        issues a staff invitation for{" "}
        <span className="font-mono-data text-on-surface">{row.email}</span>.
        Nothing is emailed — you hand the link over; their account exists
        only once they set a password at the link.
      </p>

      <div className="flex border border-outline-variant divide-x divide-outline-variant w-fit">
        {(
          [
            ["new-org", "New organisation"],
            ["existing-org", "Existing organisation"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setMode(value)}
            aria-pressed={mode === value}
            className={cn(
              "px-3 py-1.5 font-mono-label text-mono-label uppercase tracking-widest transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-primary",
              mode === value
                ? "bg-primary-container text-on-primary-container"
                : "bg-surface-container-low text-on-surface-variant hover:text-on-surface"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === "new-org" ? (
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="font-mono-label text-mono-label uppercase tracking-widest text-outline">
              Organisation name
            </span>
            <input
              type="text"
              value={orgName}
              onChange={(e) => {
                setOrgName(e.target.value);
                if (!slugTouched) setSlug(deriveOrgSlug(e.target.value));
              }}
              placeholder="Acme Search Partners"
              className={fieldClass}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-mono-label text-mono-label uppercase tracking-widest text-outline">
              Slug
            </span>
            <input
              type="text"
              value={slug}
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(e.target.value);
              }}
              placeholder="acme-search"
              className={cn(fieldClass, "font-mono-data")}
            />
          </label>
          <p className="basis-full font-mono-label text-mono-label uppercase tracking-widest text-outline">
            {row.full_name} joins as the organisation&apos;s admin
          </p>
        </div>
      ) : (
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="font-mono-label text-mono-label uppercase tracking-widest text-outline">
              Organisation
            </span>
            <select
              value={orgChoice}
              onChange={(e) => setOrgChoice(e.target.value)}
              className={fieldClass}
            >
              <option value="">Choose organisation…</option>
              {organizations.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-mono-label text-mono-label uppercase tracking-widest text-outline">
              Role
            </span>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as StaffRole)}
              className={fieldClass}
            >
              {STAFF_ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="px-3 py-1.5 border border-outline-variant text-on-surface-variant font-mono-label text-mono-label uppercase tracking-widest hover:border-primary hover:text-primary transition-colors disabled:opacity-60"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={
            pending ||
            (mode === "new-org" ? !orgName.trim() || !slug.trim() : !orgChoice)
          }
          className="px-3 py-1.5 btn-notch bg-primary-container text-on-primary-container font-mono-label text-mono-label uppercase tracking-widest hover:brightness-110 active:scale-[0.98] transition-[filter,transform] flex items-center gap-1.5 disabled:opacity-60"
        >
          <IconCheck size={14} />
          {pending ? "Provisioning…" : "Approve & Issue Invitation"}
        </button>
      </div>
    </div>
  );
}

/** The queue shows which approvals have been handed their door (§137 D1). */
function InvitationState({ invitation }: { invitation: WaitlistInvitation }) {
  const hydrated = useHydrated();
  const origin = hydrated ? window.location.origin : "";
  const url = `${origin}/join/${invitation.token}`;

  const state = invitationState(invitation);

  return (
    <div className="space-y-1">
      <div className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
        Invitation{" // "}
        {invitation.organization?.name ?? "organisation"} · {invitation.role} ·{" "}
        <span
          className={cn(
            state === "accepted" && "text-secondary-fixed-dim",
            state === "live" && "text-primary",
            (state === "revoked" || state === "expired") && "text-error"
          )}
        >
          {state}
        </span>
      </div>
      {state === "live" && (
        <p className="break-all font-mono-data text-body-main text-on-surface">
          {url}
          <button
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(url);
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
  );
}

/** Shown immediately after issuance, before the refresh lands. */
function IssuedLink({ url }: { url: string }) {
  const hydrated = useHydrated();
  const origin = hydrated ? window.location.origin : "";
  return (
    <p className="break-all font-mono-data text-body-main text-on-surface">
      {origin}
      {url}
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(`${origin}${url}`);
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
  );
}

function invitationState(
  invitation: WaitlistInvitation
): "accepted" | "revoked" | "expired" | "live" {
  if (invitation.accepted_at) return "accepted";
  if (invitation.revoked_at) return "revoked";
  if (new Date(invitation.expires_at).getTime() < Date.now()) return "expired";
  return "live";
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-0.5">
      <div className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
        {label}
      </div>
      <p className="font-mono-data text-body-main text-on-surface leading-snug">
        {value}
      </p>
    </div>
  );
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return iso;
  const delta = Date.now() - then;
  const min = Math.round(delta / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.round(hr / 24)}d ago`;
}
