"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { openMailDraft } from "@/lib/mail-draft";
import {
  IconCheckCircle,
  IconMail,
  IconRefresh,
  IconIntelligence,
  IconSend,
} from "@/components/icons";
import type { OutreachStrategyContent } from "@/lib/ai/outreach-strategy";
import {
  approveOutreachStrategyAction,
  declineOutreachStrategyAction,
  draftOutreachStrategyAction,
  redraftOutreachStrategyAction,
  sendApprovedStrategyAction,
} from "./strategy-actions";
import { unwrap } from "@/lib/actions/result";

export type OutreachStrategyRow = {
  id: string;
  status: string;
  version: number;
  content: Partial<OutreachStrategyContent>;
  created_at: string;
  approved_at: string | null;
};

/**
 * The Outreach Strategy Agent's surface — the draft source for the
 * outreach flow. The agent drafts; every consequential act here is the
 * recruiter's: approve, decline, redraft, and the send itself (the
 * approved draft opens in the recruiter's own mail client — level ≤1
 * outreach is the human's hand end to end).
 */
export function OutreachStrategyPanel({
  projectId,
  candidateId,
  candidateEmail,
  strategy,
}: {
  projectId: string;
  candidateId: string;
  candidateEmail: string | null;
  strategy: OutreachStrategyRow | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [act, setAct] = useState<string | null>(null);

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

  const draft = () =>
    run(
      "draft",
      async () => unwrap(await draftOutreachStrategyAction(projectId, candidateId)),
      "Strategy drafted — review it below"
    );

  const content = strategy?.content ?? {};
  const isDraft = strategy?.status === "draft";
  const isApproved = strategy?.status === "approved";

  const canMailto = Boolean(candidateEmail && content.draft_subject != null);

  return (
    <section className="bg-surface-container-low border border-outline-variant">
      <header className="bg-surface-container-high px-4 py-2.5 border-b border-outline-variant flex items-center gap-2 font-mono-label text-mono-label text-on-surface-variant uppercase tracking-widest">
        <IconIntelligence size={14} className="text-primary" />
        Outreach strategy
        {strategy && (
          <>
            <span className="text-outline tabular-nums">v{strategy.version}</span>
            <StatusTag status={strategy.status} />
          </>
        )}
      </header>

      {!strategy && (
        <div className="p-4 space-y-3">
          <p className="font-mono-data text-body-main text-on-surface-variant leading-snug">
            The Outreach Strategy Agent reads the mandate, this
            person&rsquo;s evidence, and the contact history, and drafts an
            approach for your approval. Sending stays your act — the
            approved draft opens in your own mail client.
          </p>
          <button
            type="button"
            onClick={draft}
            disabled={pending}
            className="px-3 py-1.5 btn-notch bg-primary-container text-on-primary-container font-mono-label text-mono-label uppercase tracking-widest hover:brightness-110 active:scale-[0.98] transition-[filter,transform] flex items-center gap-1.5 disabled:opacity-60"
          >
            {pending && act === "draft" ? (
              <IconRefresh size={14} className="animate-spin" />
            ) : (
              <IconIntelligence size={14} />
            )}
            Draft strategy
          </button>
        </div>
      )}

      {strategy && (
        <div className="p-4 space-y-4">
          {content.angle && (
            <p className="text-body-main text-on-surface font-semibold leading-snug">
              {content.angle}
            </p>
          )}
          {content.career_hook && (
            <p className="font-mono-data text-body-main text-on-surface-variant leading-snug border-l-2 border-primary/50 pl-3">
              {content.career_hook}
            </p>
          )}

          {(content.channel || content.cadence) && (
            <p className="font-mono-label text-mono-label text-on-surface-variant uppercase tracking-widest">
              {content.channel && <span>Channel · {content.channel}</span>}
              {content.channel && content.cadence && (
                <span className="text-outline">{" // "}</span>
              )}
              {content.cadence && (
                <span className="normal-case tracking-normal font-mono-data">
                  {content.cadence}
                </span>
              )}
            </p>
          )}

          <StrategyList label="Talking points" items={content.talking_points} />
          <StrategyList
            label="Likely questions"
            items={content.likely_questions}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <DisclosureList
              label="May disclose"
              items={content.may_disclose}
              tone="ok"
            />
            <DisclosureList
              label="Must not disclose"
              items={content.must_not_disclose}
              tone="warn"
            />
          </div>

          {(content.draft_subject || content.draft_body) && (
            <div className="bg-surface-container-lowest border border-outline-variant">
              <div className="px-3 py-2 border-b border-outline-variant font-mono-label text-mono-label text-on-surface-variant uppercase tracking-widest">
                Draft message
              </div>
              <div className="p-3 space-y-2">
                {content.draft_subject && (
                  <p className="text-body-main text-on-surface font-semibold">
                    {content.draft_subject}
                  </p>
                )}
                {content.draft_body && (
                  <p className="font-mono-data text-body-main text-on-surface-variant leading-snug whitespace-pre-wrap">
                    {content.draft_body}
                  </p>
                )}
                <p className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
                  The Art. 14 notice is appended by Mandate at send time —
                  it is not part of this draft.
                </p>
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 flex-wrap">
            {isDraft && (
              <>
                <button
                  type="button"
                  onClick={() =>
                    run(
                      "approve",
                      async () =>
                        unwrap(
                          await approveOutreachStrategyAction(
                            projectId,
                            candidateId,
                            strategy.id
                          )
                        ),
                      "Strategy approved"
                    )
                  }
                  disabled={pending}
                  className="px-3 py-1.5 btn-notch bg-primary-container text-on-primary-container font-mono-label text-mono-label uppercase tracking-widest hover:brightness-110 active:scale-[0.98] transition-[filter,transform] flex items-center gap-1.5 disabled:opacity-60"
                >
                  {pending && act === "approve" ? (
                    <IconRefresh size={14} className="animate-spin" />
                  ) : (
                    <IconCheckCircle size={14} />
                  )}
                  Approve
                </button>
                <button
                  type="button"
                  onClick={() =>
                    run(
                      "decline",
                      async () =>
                        unwrap(
                          await declineOutreachStrategyAction(
                            projectId,
                            candidateId,
                            strategy.id
                          )
                        ),
                      "Strategy declined"
                    )
                  }
                  disabled={pending}
                  className="px-3 py-1.5 border border-outline-variant text-on-surface-variant font-mono-label text-mono-label uppercase tracking-widest hover:bg-surface-container-high transition-colors disabled:opacity-60"
                >
                  Decline
                </button>
                <button
                  type="button"
                  onClick={() =>
                    run(
                      "redraft",
                      async () =>
                        unwrap(
                          await redraftOutreachStrategyAction(
                            projectId,
                            candidateId,
                            strategy.id
                          )
                        ),
                      "Strategy redrafted"
                    )
                  }
                  disabled={pending}
                  className="px-3 py-1.5 border border-outline-variant text-on-surface-variant font-mono-label text-mono-label uppercase tracking-widest hover:bg-surface-container-high transition-colors flex items-center gap-1.5 disabled:opacity-60"
                >
                  {pending && act === "redraft" && (
                    <IconRefresh size={14} className="animate-spin" />
                  )}
                  Redraft
                </button>
              </>
            )}

            {isApproved && (
              <>
                <button
                  type="button"
                  onClick={() =>
                    run(
                      "send",
                      async () => {
                        const out = unwrap(
                          await sendApprovedStrategyAction(
                            projectId,
                            candidateId,
                            strategy.id
                          )
                        );
                        return out;
                      },
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
                {canMailto && (
                  <button
                    type="button"
                    onClick={async () => {
                      const outcome = await openMailDraft({
                        to: candidateEmail ?? undefined,
                        subject: content.draft_subject ?? "",
                        body: content.draft_body ?? "",
                      });
                      if (outcome === "opened_body_on_clipboard") {
                        toast.success("Draft too long for a mail link — body copied, paste it into the email.");
                      } else if (outcome === "too_long_clipboard_unavailable") {
                        toast.error("Draft too long for a mail link and the clipboard is unavailable — use Copy draft instead.");
                      }
                    }}
                    className="px-3 py-1.5 border border-outline-variant text-on-surface-variant font-mono-label text-mono-label uppercase tracking-widest hover:bg-surface-container-high transition-colors flex items-center gap-1.5"
                  >
                    <IconMail size={14} />
                    Open in mail client
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard
                      .writeText(
                        `${content.draft_subject ?? ""}\n\n${content.draft_body ?? ""}`.trim()
                      )
                      .then(() => toast.success("Draft copied"))
                      .catch(() => toast.error("Copy failed"));
                  }}
                  className="px-3 py-1.5 border border-outline-variant text-on-surface-variant font-mono-label text-mono-label uppercase tracking-widest hover:bg-surface-container-high transition-colors"
                >
                  Copy draft
                </button>
              </>
            )}

            {(isApproved ||
              strategy.status === "declined" ||
              strategy.status === "superseded") && (
              <button
                type="button"
                onClick={draft}
                disabled={pending}
                className="px-3 py-1.5 border border-outline-variant text-on-surface-variant font-mono-label text-mono-label uppercase tracking-widest hover:bg-surface-container-high transition-colors flex items-center gap-1.5 disabled:opacity-60"
              >
                {pending && act === "draft" && (
                  <IconRefresh size={14} className="animate-spin" />
                )}
                New draft
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function StatusTag({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "px-1.5 py-0 border",
        status === "approved" &&
          "border-secondary-fixed-dim/50 text-secondary-fixed-dim",
        status === "draft" && "border-tertiary/50 text-tertiary",
        (status === "declined" || status === "superseded") &&
          "border-outline-variant text-on-surface-variant"
      )}
    >
      {status}
    </span>
  );
}

function StrategyList({
  label,
  items,
}: {
  label: string;
  items: string[] | undefined;
}) {
  if (!items || items.length === 0) return null;
  return (
    <div className="space-y-1">
      <p className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
        {label}
      </p>
      <ul className="space-y-1">
        {items.map((item, i) => (
          <li
            key={i}
            className="font-mono-data text-body-main text-on-surface-variant leading-snug pl-3 border-l border-outline-variant"
          >
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function DisclosureList({
  label,
  items,
  tone,
}: {
  label: string;
  items: string[] | undefined;
  tone: "ok" | "warn";
}) {
  if (!items || items.length === 0) return null;
  return (
    <div className="space-y-1">
      <p
        className={cn(
          "font-mono-label text-mono-label uppercase tracking-widest",
          tone === "ok" ? "text-secondary-fixed-dim" : "text-tertiary"
        )}
      >
        {label}
      </p>
      <ul className="space-y-0.5">
        {items.map((item, i) => (
          <li
            key={i}
            className="font-mono-data text-body-main text-on-surface-variant leading-snug"
          >
            · {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
