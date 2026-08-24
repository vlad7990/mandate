"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  notificationLabel,
  notificationState,
  type NotifiableCandidate,
} from "@/lib/candidates/notification";
import {
  IconAlert,
  IconCheckCircle,
  IconMail,
  IconRefresh,
  IconSend,
} from "@/components/icons";
import { logOutreachAction } from "./outreach-actions";
import {
  OUTREACH_CHANNELS,
  type OutreachChannel,
  type OutreachDirection,
} from "./outreach-constants";
import { unwrap } from "@/lib/actions/result";

export type OutreachEntry = {
  id: string;
  channel: string;
  direction: string;
  subject: string | null;
  body: string | null;
  includes_privacy_notice: boolean;
  occurred_at: string;
};

/**
 * The contact record for one candidate, and the Art. 14 duty attached to it.
 *
 * There is deliberately no "this message carried the notice" checkbox. It used
 * to stamp subject_notified_at, which made the record an attestation: the
 * person was marked as told because someone said so. Migration 044 moved that
 * to a completed-send event, so this panel records CONTACT only and the
 * notification is recorded when Mandate sends the notice and the provider
 * confirms it.
 */
export function OutreachPanel({
  projectId,
  candidateId,
  candidate,
  entries,
}: {
  projectId: string;
  candidateId: string;
  candidate: NotifiableCandidate;
  entries: OutreachEntry[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [channel, setChannel] = useState<OutreachChannel>("email");
  const [direction, setDirection] = useState<OutreachDirection>("outbound");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  const state = notificationState(candidate, new Date());
  const label = notificationLabel(state);
  const noticeAlreadyGiven = state.status === "notified";

  const submit = () => {
    if (pending) return;
    start(async () => {
      try {
        unwrap(await logOutreachAction(projectId, candidateId, {
          channel,
          direction,
          subject,
          body,
          includesPrivacyNotice: false,
        }));
        toast.success("Contact logged");
        setSubject("");
        setBody("");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Nothing was logged.");
      }
    });
  };

  return (
    <div className="space-y-4">
      <NotificationBanner
        status={state.status}
        label={label}
        notifiedAt={candidate.subject_notified_at}
      />

      <section className="bg-surface-container-low border border-outline-variant">
        <header className="bg-surface-container-high px-4 py-2.5 border-b border-outline-variant font-mono-label text-mono-label text-on-surface-variant uppercase tracking-widest">
          Log contact
        </header>
        <div className="p-4 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={channel}
              onChange={(e) => setChannel(e.target.value as OutreachChannel)}
              disabled={pending}
              className="px-2 py-1.5 bg-surface-container-lowest border border-outline-variant font-mono-label text-mono-label text-on-surface uppercase tracking-widest"
            >
              {OUTREACH_CHANNELS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
            <select
              value={direction}
              onChange={(e) => setDirection(e.target.value as OutreachDirection)}
              disabled={pending}
              className="px-2 py-1.5 bg-surface-container-lowest border border-outline-variant font-mono-label text-mono-label text-on-surface uppercase tracking-widest"
            >
              <option value="outbound">We contacted them</option>
              <option value="inbound">They replied</option>
            </select>
          </div>

          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            disabled={pending}
            placeholder="Subject or summary"
            className="w-full px-3 py-2 bg-surface-container-lowest border border-outline-variant font-mono-data text-body-main text-on-surface placeholder:text-outline focus-visible:outline-none focus-visible:border-primary"
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            disabled={pending}
            rows={4}
            placeholder="What was said. Paste the message, or note the gist of the call."
            className="w-full px-3 py-2 bg-surface-container-lowest border border-outline-variant font-mono-data text-body-main text-on-surface placeholder:text-outline resize-y focus-visible:outline-none focus-visible:border-primary"
          />

          {direction === "outbound" && !noticeAlreadyGiven && (
            <p className="font-mono-data text-body-main text-on-surface-variant leading-snug border-l-2 border-tertiary/50 pl-3">
              Logging contact here does not discharge the Art. 14 notice. The
              notification is recorded only when Mandate sends the notice itself
              and the provider confirms delivery — so the record reflects what
              actually reached them, not what was intended.
            </p>
          )}

          <button
            type="button"
            onClick={submit}
            disabled={pending}
            className="px-3 py-1.5 btn-notch bg-primary-container text-on-primary-container font-mono-label text-mono-label uppercase tracking-widest hover:brightness-110 active:scale-[0.98] transition-[filter,transform] flex items-center gap-1.5 disabled:opacity-60"
          >
            {pending ? (
              <IconRefresh size={14} className="animate-spin" />
            ) : (
              <IconSend size={14} />
            )}
            Log contact
          </button>
        </div>
      </section>

      <section className="bg-surface-container-low border border-outline-variant">
        <header className="bg-surface-container-high px-4 py-2.5 border-b border-outline-variant font-mono-label text-mono-label text-on-surface-variant uppercase tracking-widest tabular-nums">
          Contact history · {entries.length}
        </header>
        {entries.length === 0 ? (
          <p className="px-4 py-6 text-body-main text-on-surface-variant text-center">
            No contact recorded yet.
          </p>
        ) : (
          <ul className="divide-y divide-outline-variant/40">
            {entries.map((e) => (
              <li key={e.id} className="px-4 py-3 space-y-1">
                <div className="flex items-baseline gap-2 flex-wrap font-mono-label text-mono-label uppercase tracking-widest">
                  <span
                    className={cn(
                      "px-1.5 py-0 border",
                      e.direction === "inbound"
                        ? "border-secondary-fixed-dim/50 text-secondary-fixed-dim"
                        : "border-outline-variant text-on-surface-variant"
                    )}
                  >
                    {e.direction === "inbound" ? "Reply" : "Sent"}
                  </span>
                  <span className="text-on-surface-variant">{e.channel}</span>
                  <span className="text-outline tabular-nums">
                    {formatStamp(e.occurred_at)}
                  </span>
                  {e.includes_privacy_notice && (
                    <span className="text-tertiary flex items-center gap-1">
                      <IconCheckCircle size={12} />
                      Carried the notice
                    </span>
                  )}
                </div>
                {e.subject && (
                  <p className="text-body-main text-on-surface font-semibold">
                    {e.subject}
                  </p>
                )}
                {e.body && (
                  <p className="font-mono-data text-body-main text-on-surface-variant leading-snug whitespace-pre-wrap">
                    {e.body}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function NotificationBanner({
  status,
  label,
  notifiedAt,
}: {
  status: string;
  label: string | null;
  notifiedAt: string | null;
}) {
  if (status === "not_required") {
    return (
      <p className="font-mono-data text-body-main text-on-surface-variant">
        This person came to us directly, so there is no Art. 14 notification to
        make — they knew they were sharing their data.
      </p>
    );
  }

  if (status === "notified") {
    return (
      <div className="flex items-center gap-2 border border-secondary-fixed-dim/50 bg-secondary-fixed-dim/10 px-3 py-2 text-secondary-fixed-dim font-mono-label text-mono-label uppercase tracking-widest">
        <IconCheckCircle size={14} />
        Notified {notifiedAt ? formatStamp(notifiedAt) : ""}
      </div>
    );
  }

  const overdue = status === "overdue";
  return (
    <div
      className={cn(
        "flex items-start gap-2 border px-3 py-2",
        overdue
          ? "border-error/50 bg-error/10 text-error"
          : "border-tertiary/50 bg-tertiary/10 text-tertiary"
      )}
    >
      {overdue ? <IconAlert size={14} className="mt-0.5" /> : <IconMail size={14} className="mt-0.5" />}
      <div className="space-y-0.5">
        <div className="font-mono-label text-mono-label uppercase tracking-widest">
          {label}
        </div>
        <p className="font-mono-data text-body-main leading-snug">
          We hold this person&rsquo;s data and they did not give it to us. GDPR
          Art. 14 requires telling them what we hold and where it came from,
          within a month of obtaining it.
        </p>
      </div>
    </div>
  );
}

function formatStamp(iso: string): string {
  return new Date(iso).toISOString().slice(0, 16).replace("T", " ");
}
