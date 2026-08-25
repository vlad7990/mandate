"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { IconAlert, IconIntelligence, IconRefresh } from "@/components/icons";
import type { RelationshipProfile } from "@/lib/network/profile-resolver";
import {
  clearDncAction,
  setDncAction,
  updateRelationshipAction,
} from "./relationship-actions";
import { unwrap } from "@/lib/actions/result";

/**
 * The durable relationship overlay on a network person (#24, 098).
 * The agent maintains the record; the humans own every consequential
 * act: suppression (with a mandatory reason), and — founder only —
 * the un-suppression.
 */
export function RelationshipCard({
  profile,
  isFounder,
}: {
  profile: RelationshipProfile | null;
  isFounder: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [act, setAct] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  if (!profile) {
    return (
      <div className="border-t border-outline-variant px-4 py-3">
        <p className="font-mono-data text-body-main text-on-surface-variant">
          No durable relationship record yet — it is created the next time
          this person&rsquo;s candidate record is touched.
        </p>
      </div>
    );
  }

  const run = (
    label: string,
    action: () => Promise<unknown>,
    successMessage: string
  ) => {
    if (pending) return;
    setAct(label);
    start(async () => {
      try {
        await action();
        toast.success(successMessage);
        setReason("");
        router.refresh();
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "The act did not land."
        );
      } finally {
        setAct(null);
      }
    });
  };

  const d = profile.disposition ?? {};
  const dispositionLines: Array<[string, string]> = (
    [
      ["Summary", d.summary],
      ["Timing", d.timing],
      ["Motivation", d.motivation],
      ["Location", d.location_constraints],
      ["Compensation", d.compensation_context],
      ["Notice", d.notice_period],
    ] as Array<[string, unknown]>
  ).filter((x): x is [string, string] => typeof x[1] === "string" && x[1].length > 0);
  const openQuestions = Array.isArray(d.open_questions)
    ? (d.open_questions as string[])
    : [];

  return (
    <div className="border-t border-outline-variant px-4 py-3 space-y-3">
      <div className="flex items-center gap-2 flex-wrap font-mono-label text-mono-label uppercase tracking-widest">
        <span className="text-on-surface-variant">Relationship</span>
        <span
          className={cn(
            "px-1.5 py-0 border",
            profile.dnc
              ? "border-error/60 text-error"
              : profile.relationship_state === "cold"
                ? "border-outline-variant text-on-surface-variant"
                : "border-secondary-fixed-dim/50 text-secondary-fixed-dim"
          )}
        >
          {profile.relationship_state.replace(/_/g, " ")}
        </span>
        {profile.last_meaningful_contact_at && (
          <span className="text-outline tabular-nums">
            Last contact {profile.last_meaningful_contact_at.slice(0, 10)}
          </span>
        )}
        {profile.follow_up_at && (
          <span className="text-tertiary tabular-nums">
            Follow up {profile.follow_up_at}
          </span>
        )}
      </div>

      {profile.dnc && (
        <div className="flex items-start gap-2 border border-error/50 bg-error/10 px-3 py-2 text-error">
          <IconAlert size={14} className="mt-0.5" />
          <div className="space-y-0.5">
            <p className="font-mono-label text-mono-label uppercase tracking-widest">
              Do not contact
            </p>
            <p className="font-mono-data text-body-main leading-snug">
              {profile.dnc_reason ?? "No reason recorded."}
              {profile.dnc_set_by === null && " Set by the system."}
              {" Only a founder-level act with a recorded reason can clear this."}
            </p>
          </div>
        </div>
      )}

      {dispositionLines.length > 0 && (
        <dl className="space-y-1">
          {dispositionLines.map(([label, value]) => (
            <div key={label} className="flex gap-2 items-baseline">
              <dt className="font-mono-label text-mono-label text-outline uppercase tracking-widest w-28 shrink-0">
                {label}
              </dt>
              <dd className="font-mono-data text-body-main text-on-surface-variant leading-snug">
                {value}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {openQuestions.length > 0 && (
        <div className="space-y-1">
          <p className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
            Open questions
          </p>
          <ul className="space-y-0.5">
            {openQuestions.map((q, i) => (
              <li
                key={i}
                className="font-mono-data text-body-main text-on-surface-variant leading-snug"
              >
                · {q}
              </li>
            ))}
          </ul>
        </div>
      )}
      {profile.follow_up_note && (
        <p className="font-mono-data text-body-main text-on-surface-variant leading-snug border-l-2 border-tertiary/50 pl-3">
          {profile.follow_up_note}
        </p>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={() =>
            run(
              "update",
              async () => unwrap(await updateRelationshipAction(profile.id)),
              "Relationship record updated"
            )
          }
          disabled={pending}
          className="px-3 py-1.5 btn-notch bg-primary-container text-on-primary-container font-mono-label text-mono-label uppercase tracking-widest hover:brightness-110 active:scale-[0.98] transition-[filter,transform] flex items-center gap-1.5 disabled:opacity-60"
        >
          {pending && act === "update" ? (
            <IconRefresh size={14} className="animate-spin" />
          ) : (
            <IconIntelligence size={14} />
          )}
          Update relationship
        </button>

        {!profile.dnc && (
          <span className="flex items-center gap-2">
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={pending}
              placeholder="Reason (required to suppress)"
              className="px-2 py-1.5 bg-surface-container-lowest border border-outline-variant font-mono-data text-body-main text-on-surface placeholder:text-outline focus-visible:outline-none focus-visible:border-primary w-56"
            />
            <button
              type="button"
              onClick={() =>
                run(
                  "dnc",
                  async () =>
                    unwrap(await setDncAction(profile.id, reason)),
                  "Marked do-not-contact"
                )
              }
              disabled={pending || reason.trim().length === 0}
              className="px-3 py-1.5 border border-error/50 text-error font-mono-label text-mono-label uppercase tracking-widest hover:bg-error/10 transition-colors disabled:opacity-60"
            >
              Do not contact
            </button>
          </span>
        )}

        {profile.dnc && isFounder && (
          <span className="flex items-center gap-2">
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={pending}
              placeholder="Reason (required to clear)"
              className="px-2 py-1.5 bg-surface-container-lowest border border-outline-variant font-mono-data text-body-main text-on-surface placeholder:text-outline focus-visible:outline-none focus-visible:border-primary w-56"
            />
            <button
              type="button"
              onClick={() =>
                run(
                  "clear",
                  async () =>
                    unwrap(await clearDncAction(profile.id, reason)),
                  "Suppression cleared"
                )
              }
              disabled={pending || reason.trim().length === 0}
              className="px-3 py-1.5 border border-outline-variant text-on-surface-variant font-mono-label text-mono-label uppercase tracking-widest hover:bg-surface-container-high transition-colors disabled:opacity-60"
            >
              Clear suppression
            </button>
          </span>
        )}
      </div>
    </div>
  );
}
