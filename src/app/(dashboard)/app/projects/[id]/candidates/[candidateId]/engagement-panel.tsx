"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  IconAlert,
  IconCheckCircle,
  IconIntelligence,
  IconRefresh,
  IconSend,
} from "@/components/icons";
import type { EngagementDraft } from "@/lib/ai/engagement";
import {
  dismissEngagementDraftAction,
  resolveEscalationAction,
  sendEngagementDraftAction,
  updateEngagementAction,
} from "./engagement-actions";
import { unwrap } from "@/lib/actions/result";

export type EngagementLaneRow = {
  id: string;
  state: string;
  escalation_reason: string | null;
  next_follow_up_at: string | null;
  draft: Partial<EngagementDraft> | null;
  updated_at: string;
};

const STATE_LABELS: Record<string, string> = {
  awaiting_reply: "Awaiting reply",
  replied: "They replied",
  responding: "In conversation",
  timing_follow_up: "Follow-up scheduled",
  declined: "Declined",
  interested: "Interested",
  escalated: "Escalated",
  closed: "Closed",
};

const RESOLUTIONS: Array<{ value: string; label: string }> = [
  { value: "responding", label: "I'm taking the thread" },
  { value: "replied", label: "Back to their reply" },
  { value: "timing_follow_up", label: "Follow-up scheduled" },
  { value: "interested", label: "Interested" },
  { value: "declined", label: "Declined" },
  { value: "closed", label: "Closed" },
];

/**
 * The Candidate Engagement Agent's surface — the conversation lane.
 * The agent maintains state and proposes the next move; every
 * consequential act here is the recruiter's: resolving an escalation,
 * dismissing a proposal, and the send itself (through the comms
 * service, under the recruiter's own name).
 */
export function EngagementPanel({
  projectId,
  candidateId,
  lane,
}: {
  projectId: string;
  candidateId: string;
  lane: EngagementLaneRow | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [act, setAct] = useState<string | null>(null);
  const [resolution, setResolution] = useState("responding");

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

  const update = () =>
    run(
      "update",
      async () => {
        const out = unwrap(
          await updateEngagementAction(projectId, candidateId)
        );
        return out;
      },
      "Engagement lane updated"
    );

  const escalated = lane?.state === "escalated";
  const draft = lane?.draft ?? null;
  const hasDraft = Boolean((draft?.body ?? "").trim());

  return (
    <section className="bg-surface-container-low border border-outline-variant">
      <header className="bg-surface-container-high px-4 py-2.5 border-b border-outline-variant flex items-center gap-2 font-mono-label text-mono-label text-on-surface-variant uppercase tracking-widest">
        <IconIntelligence size={14} className="text-primary" />
        Engagement lane
        {lane && (
          <span
            className={cn(
              "px-1.5 py-0 border",
              escalated && "border-error/50 text-error",
              lane.state === "interested" &&
                "border-secondary-fixed-dim/50 text-secondary-fixed-dim",
              !escalated &&
                lane.state !== "interested" &&
                "border-tertiary/50 text-tertiary"
            )}
          >
            {STATE_LABELS[lane.state] ?? lane.state}
          </span>
        )}
        {lane?.next_follow_up_at && !escalated && (
          <span className="text-outline tabular-nums">
            next touch {lane.next_follow_up_at}
          </span>
        )}
      </header>

      <div className="p-4 space-y-4">
        {!lane && (
          <p className="font-mono-data text-body-main text-on-surface-variant leading-snug">
            The Candidate Engagement Agent reads the thread, the approved
            strategy, and the relationship record, then keeps this lane
            honest: where the conversation stands, when the next touch is
            owed, and a proposed follow-up for your approval. It sends
            nothing — the send is always yours.
          </p>
        )}

        {escalated && lane && (
          <div className="border border-error/50 bg-error/10 px-3 py-2.5 space-y-2">
            <div className="flex items-start gap-2 text-error">
              <IconAlert size={14} className="mt-0.5 shrink-0" />
              <div className="space-y-0.5">
                <p className="font-mono-label text-mono-label uppercase tracking-widest">
                  Escalated — this one is yours
                </p>
                <p className="font-mono-data text-body-main leading-snug">
                  {lane.escalation_reason}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={resolution}
                onChange={(e) => setResolution(e.target.value)}
                disabled={pending}
                className="px-2 py-1.5 bg-surface-container-lowest border border-outline-variant font-mono-label text-mono-label text-on-surface uppercase tracking-widest"
              >
                {RESOLUTIONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() =>
                  run(
                    "resolve",
                    async () =>
                      unwrap(
                        await resolveEscalationAction(
                          projectId,
                          candidateId,
                          lane.id,
                          resolution
                        )
                      ),
                    "Escalation resolved"
                  )
                }
                disabled={pending}
                className="px-3 py-1.5 btn-notch bg-primary-container text-on-primary-container font-mono-label text-mono-label uppercase tracking-widest hover:brightness-110 active:scale-[0.98] transition-[filter,transform] flex items-center gap-1.5 disabled:opacity-60"
              >
                {pending && act === "resolve" ? (
                  <IconRefresh size={14} className="animate-spin" />
                ) : (
                  <IconCheckCircle size={14} />
                )}
                Resolve
              </button>
            </div>
          </div>
        )}

        {hasDraft && lane && !escalated && (
          <div className="bg-surface-container-lowest border border-outline-variant">
            <div className="px-3 py-2 border-b border-outline-variant font-mono-label text-mono-label text-on-surface-variant uppercase tracking-widest">
              Proposed follow-up
            </div>
            <div className="p-3 space-y-2">
              {draft?.subject && (
                <p className="text-body-main text-on-surface font-semibold">
                  {draft.subject}
                </p>
              )}
              <p className="font-mono-data text-body-main text-on-surface-variant leading-snug whitespace-pre-wrap">
                {draft?.body}
              </p>
              <p className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
                Proposed by the agent — it goes nowhere until you send it.
                The Art. 14 notice is appended by Mandate at send time.
              </p>
              <div className="flex items-center gap-2 flex-wrap pt-1">
                <button
                  type="button"
                  onClick={() =>
                    run(
                      "send",
                      async () =>
                        unwrap(
                          await sendEngagementDraftAction(
                            projectId,
                            candidateId,
                            lane.id
                          )
                        ),
                      "Sent — the contact record is stamped"
                    )
                  }
                  disabled={pending}
                  className="px-3 py-1.5 btn-notch bg-primary-container text-on-primary-container font-mono-label text-mono-label uppercase tracking-widest hover:brightness-110 active:scale-[0.98] transition-[filter,transform] flex items-center gap-1.5 disabled:opacity-60"
                >
                  {pending && act === "send" ? (
                    <IconRefresh size={14} className="animate-spin" />
                  ) : (
                    <IconSend size={14} />
                  )}
                  Send via Mandate
                </button>
                <button
                  type="button"
                  onClick={() =>
                    run(
                      "dismiss",
                      async () =>
                        unwrap(
                          await dismissEngagementDraftAction(
                            projectId,
                            candidateId,
                            lane.id
                          )
                        ),
                      "Proposal dismissed"
                    )
                  }
                  disabled={pending}
                  className="px-3 py-1.5 border border-outline-variant text-on-surface-variant font-mono-label text-mono-label uppercase tracking-widest hover:bg-surface-container-high transition-colors disabled:opacity-60"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={update}
            disabled={pending || escalated}
            className="px-3 py-1.5 border border-outline-variant text-on-surface-variant font-mono-label text-mono-label uppercase tracking-widest hover:bg-surface-container-high transition-colors flex items-center gap-1.5 disabled:opacity-60"
          >
            {pending && act === "update" ? (
              <IconRefresh size={14} className="animate-spin" />
            ) : (
              <IconIntelligence size={14} />
            )}
            {lane ? "Update engagement" : "Open engagement lane"}
          </button>
          {escalated && (
            <span className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
              The agent cannot touch an escalated lane — resolve it first.
            </span>
          )}
        </div>
      </div>
    </section>
  );
}
