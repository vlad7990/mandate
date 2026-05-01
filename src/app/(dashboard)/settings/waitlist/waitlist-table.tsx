"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  approveWaitlistRequestAction,
  rejectWaitlistRequestAction,
  saveWaitlistNoteAction,
} from "./actions";

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
};

const STATUS_TONE: Record<WaitlistRow["status"], string> = {
  pending: "border-primary/60 bg-primary-container/15 text-primary",
  approved:
    "border-secondary-fixed-dim/60 bg-secondary-fixed-dim/10 text-secondary-fixed-dim",
  rejected: "border-error/60 bg-error/10 text-error",
};

export function WaitlistTable({ rows }: { rows: WaitlistRow[] }) {
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
                ? "bg-primary-container text-on-primary-container"
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
            <RequestCard key={r.id} row={r} />
          ))}
        </ul>
      )}
    </div>
  );
}

function RequestCard({ row }: { row: WaitlistRow }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [notesDraft, setNotesDraft] = useState(row.notes ?? "");
  const [notesEditing, setNotesEditing] = useState(false);

  const saveNotes = () => {
    if (pending) return;
    start(async () => {
      try {
        await saveWaitlistNoteAction(row.id, notesDraft);
        toast.success("Notes saved");
        setNotesEditing(false);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Save failed.");
      }
    });
  };

  const approve = () => {
    if (pending) return;
    if (!window.confirm(`Approve ${row.full_name} (${row.email})?`)) return;
    start(async () => {
      try {
        await approveWaitlistRequestAction(row.id);
        toast.success("Approved");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Approve failed.");
      }
    });
  };

  const reject = () => {
    if (pending) return;
    if (!window.confirm(`Reject ${row.full_name}?`)) return;
    start(async () => {
      try {
        await rejectWaitlistRequestAction(row.id);
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
                className="px-3 py-1 bg-primary-container text-on-primary-container font-mono-label text-mono-label uppercase tracking-widest hover:brightness-110 active:scale-[0.98] transition-[filter,transform] disabled:opacity-60"
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

      {isPending && (
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
            onClick={approve}
            disabled={pending}
            className="px-3 py-1.5 bg-primary-container text-on-primary-container font-mono-label text-mono-label uppercase tracking-widest hover:brightness-110 active:scale-[0.98] transition-[filter,transform] flex items-center gap-1.5 disabled:opacity-60"
          >
            <span className="material-symbols-outlined text-[14px]" aria-hidden>
              check
            </span>
            Approve
          </button>
        </footer>
      )}
    </article>
  );
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
