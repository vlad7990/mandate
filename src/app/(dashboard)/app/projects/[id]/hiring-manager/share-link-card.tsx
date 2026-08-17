"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { generateHmTokenAction, revokeHmTokenAction } from "./actions";
import { IconLink, IconRefresh, IconShare } from "@/components/icons";
import { unwrap } from "@/lib/actions/result";

export type HmTokenRow = {
  id: string;
  token: string;
  label: string;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
  last_used_at: string | null;
};

export function ShareLinkCard({
  projectId,
  tokens,
  contacts,
}: {
  projectId: string;
  tokens: HmTokenRow[];
  /**
   * The client's active contacts (054). Empty when the mandate has no client
   * yet, in which case the label field is the only way to name a recipient —
   * which is also every token minted before contacts existed.
   */
  contacts: Array<{ id: string; full_name: string; title: string | null }>;
}) {
  const router = useRouter();
  const [label, setLabel] = useState("");
  const [contactId, setContactId] = useState("");
  const [pending, start] = useTransition();
  const [revoking, startRevoke] = useTransition();

  const baseUrl =
    typeof window !== "undefined" ? window.location.origin : "";

  const handleGenerate = () => {
    if (pending) return;
    start(async () => {
      try {
        unwrap(await generateHmTokenAction(projectId, label.trim(), contactId || undefined));
        toast.success("Share link minted");
        setLabel("");
        setContactId("");
        router.refresh();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Mint failed.";
        toast.error(msg);
      }
    });
  };

  const handleRevoke = (tokenId: string, tokenLabel: string) => {
    if (revoking) return;
    if (
      !window.confirm(
        `Revoke the link for "${tokenLabel || "(unlabelled)"}"? It cannot be reactivated.`
      )
    ) {
      return;
    }
    startRevoke(async () => {
      try {
        unwrap(await revokeHmTokenAction(projectId, tokenId));
        toast.success("Link revoked");
        router.refresh();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Revoke failed.";
        toast.error(msg);
      }
    });
  };

  const copyToClipboard = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
    } catch {
      toast.error("Clipboard unavailable.");
    }
  };

  return (
    <section className="bg-surface-container border border-outline-variant">
      <header className="px-4 py-3 border-b border-outline-variant flex items-center justify-between gap-2 flex-wrap">
        <h2 className="font-mono-label text-mono-label text-primary uppercase tracking-widest flex items-center gap-2">
          <IconShare size={14} />
          Share with Hiring Manager
        </h2>
        <span className="font-mono-label text-mono-label text-outline uppercase tracking-widest tabular-nums">
          {tokens.filter((t) => !t.revoked_at && new Date(t.expires_at) > new Date()).length}{" "}
          active · {tokens.length} total
        </span>
      </header>

      <div className="p-4 space-y-4">
        <div className="flex items-end gap-2 flex-wrap">
          {contacts.length > 0 && (
            <label className="flex-1 min-w-[200px] block space-y-1">
              <span className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
                Contact
              </span>
              <select
                value={contactId}
                onChange={(e) => setContactId(e.target.value)}
                className="w-full min-w-0 bg-surface-container-lowest border border-outline-variant px-3 py-2 text-on-surface focus:border-primary focus:outline-none transition-colors"
              >
                <option value="">Not from the contact list</option>
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title ? `${c.full_name} — ${c.title}` : c.full_name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="flex-1 min-w-[200px] block space-y-1">
            <span className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
              Label (recipient)
            </span>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              // Disabled rather than merely ignored when a contact is chosen:
              // the action derives the label from the contact so the two
              // cannot disagree, and a field whose value is silently dropped
              // is worse than one that says it is not in use.
              disabled={contactId !== ""}
              placeholder={
                contactId ? "Taken from the contact" : "Jane Smith @ Acme"
              }
              className="w-full min-w-0 bg-surface-container-lowest border border-outline-variant px-3 py-2 text-on-surface focus:border-primary focus:outline-none transition-colors disabled:opacity-55"
            />
          </label>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={pending}
            aria-busy={pending ? true : undefined}
            className="px-4 py-2 bg-primary-container text-on-primary-container font-mono-label text-mono-label uppercase tracking-widest hover:brightness-110 active:scale-[0.98] transition-[filter,transform] flex items-center gap-1.5 disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            {pending ? (
              <IconRefresh size={14} className="animate-spin" />
            ) : (
              <IconLink size={14} />
            )}
            {pending ? "Minting" : "Generate Link"}
          </button>
        </div>
        <p className="font-mono-label text-mono-label text-outline uppercase tracking-widest leading-snug">
          Links expire after 30 days. Each recipient should get their own
          labelled link so you can revoke individually.
        </p>

        {tokens.length === 0 ? (
          <p className="font-mono-label text-mono-label text-outline italic uppercase tracking-widest text-center py-4">
            No links generated yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {tokens.map((t) => {
              const url = `${baseUrl}/hm/${t.token}`;
              const status = computeStatus(t);
              return (
                <li
                  key={t.id}
                  className={cn(
                    "bg-surface-container-low border border-outline-variant p-3 space-y-2",
                    status === "revoked" && "opacity-60"
                  )}
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className="font-mono-data text-body-main text-on-surface font-semibold truncate">
                        {t.label || "(unlabelled)"}
                      </span>
                      <StatusPill status={status} />
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => copyToClipboard(url)}
                        disabled={status !== "active"}
                        className="px-2 py-1 border border-outline-variant text-on-surface-variant hover:border-primary hover:text-primary font-mono-label text-mono-label uppercase tracking-widest transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                      >
                        Copy
                      </button>
                      {status !== "revoked" && (
                        <button
                          type="button"
                          onClick={() => handleRevoke(t.id, t.label)}
                          disabled={revoking}
                          className="px-2 py-1 border border-outline-variant text-outline hover:border-error hover:text-error font-mono-label text-mono-label uppercase tracking-widest transition-colors disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-error"
                        >
                          Revoke
                        </button>
                      )}
                    </div>
                  </div>
                  <code className="block font-mono-data text-body-main text-on-surface-variant break-all bg-surface-container-lowest px-2 py-1 border border-outline-variant/60">
                    {url}
                  </code>
                  <div className="font-mono-label text-mono-label text-outline uppercase tracking-widest tabular-nums">
                    Expires {formatDate(t.expires_at)} · Created{" "}
                    {formatDate(t.created_at)}
                    {t.last_used_at && ` · Last used ${formatRelative(t.last_used_at)}`}
                    {t.revoked_at && ` · Revoked ${formatDate(t.revoked_at)}`}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

type Status = "active" | "expired" | "revoked";

function computeStatus(t: HmTokenRow): Status {
  if (t.revoked_at) return "revoked";
  if (new Date(t.expires_at) < new Date()) return "expired";
  return "active";
}

function StatusPill({ status }: { status: Status }) {
  const tone =
    status === "active"
      ? "border-secondary-fixed-dim/60 bg-secondary-fixed-dim/10 text-secondary-fixed-dim"
      : status === "expired"
        ? "border-tertiary/60 bg-tertiary/10 text-tertiary"
        : "border-error/60 bg-error/10 text-error";
  return (
    <span
      className={cn(
        "px-1.5 py-0.5 border font-mono-label text-mono-label uppercase tracking-widest",
        tone
      )}
    >
      {status}
    </span>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
  });
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const delta = Date.now() - then;
  const min = Math.round(delta / 60000);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  return `${day}d ago`;
}
