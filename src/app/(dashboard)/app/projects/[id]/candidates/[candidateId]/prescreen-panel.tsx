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
import type {
  EvidenceEntry,
  InterestProfile,
  PrescreenQuestionSet,
} from "@/lib/ai/prescreen";
import { recruiterReady } from "@/lib/ai/prescreen";
import type { DimensionCoverage } from "@/lib/candidates/evidence-coverage";
import {
  abandonPrescreenAction,
  resolvePrescreenEscalationAction,
  runPrescreenAction,
  sendPrescreenInviteAction,
} from "./prescreen-actions";
import { unwrap } from "@/lib/actions/result";

export type PrescreenRow = {
  id: string;
  status: string;
  question_set: Partial<PrescreenQuestionSet> | null;
  professional_evidence: Partial<Record<string, EvidenceEntry>>;
  interest_profile: Partial<InterestProfile> | null;
  escalation_reason: string | null;
  completed_at: string | null;
  updated_at: string;
};

const STATUS_LABELS: Record<string, string> = {
  proposed: "Proposed",
  invited: "Invited",
  in_progress: "In progress",
  complete: "Complete",
  abandoned: "Abandoned",
  escalated: "Escalated",
};

/**
 * The Pre-Screen Agent's surface — evidence and interest, two tracks,
 * never a grade. The agent computes the gap, drafts the questions and
 * structures the answers; every consequential act here is the
 * recruiter's: sending the invitation, abandoning, resolving an
 * escalation — and the decision the evidence informs.
 */
export function PrescreenPanel({
  projectId,
  candidateId,
  prescreen,
  coverage,
}: {
  projectId: string;
  candidateId: string;
  prescreen: PrescreenRow | null;
  coverage: DimensionCoverage[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [act, setAct] = useState<string | null>(null);
  const [resolution, setResolution] = useState("in_progress");

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

  const escalated = prescreen?.status === "escalated";
  const terminal =
    prescreen != null &&
    ["complete", "abandoned", "escalated"].includes(prescreen.status);
  const questions = (prescreen?.question_set?.questions ?? []).filter(
    (q) => typeof q === "string" && q.trim() !== ""
  );
  const showProposal =
    prescreen?.status === "proposed" &&
    (questions.length > 0 || (prescreen?.question_set?.body ?? "").trim() !== "");
  const evidence = prescreen?.professional_evidence ?? {};
  const interest = prescreen?.interest_profile ?? null;
  const ready = prescreen
    ? recruiterReady({
        status: prescreen.status,
        interest: interest?.interest,
        escalationOpen: escalated,
      })
    : false;

  return (
    <section className="bg-surface-container-low border border-outline-variant">
      <header className="bg-surface-container-high px-4 py-2.5 border-b border-outline-variant flex items-center gap-2 font-mono-label text-mono-label text-on-surface-variant uppercase tracking-widest">
        <IconIntelligence size={14} className="text-primary" />
        Pre-screen
        {prescreen && (
          <span
            className={cn(
              "px-1.5 py-0 border",
              escalated && "border-error/50 text-error",
              prescreen.status === "complete" &&
                "border-secondary-fixed-dim/50 text-secondary-fixed-dim",
              !escalated &&
                prescreen.status !== "complete" &&
                "border-tertiary/50 text-tertiary"
            )}
          >
            {STATUS_LABELS[prescreen.status] ?? prescreen.status}
          </span>
        )}
        {ready && (
          <span className="px-1.5 py-0 border border-secondary-fixed-dim/50 text-secondary-fixed-dim">
            Recruiter-ready
          </span>
        )}
      </header>

      <div className="p-4 space-y-4">
        {/* The gap — computed from the CV before any model call. */}
        <div className="space-y-1">
          <p className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
            Evidence coverage
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            {coverage.map((c) => (
              <span
                key={c.dimension}
                title={c.evidence ? `${c.evidence} (${c.source})` : "no evidence on file"}
                className={cn(
                  "px-1.5 py-0 border font-mono-label text-mono-label uppercase tracking-widest",
                  c.status === "strong" &&
                    "border-secondary-fixed-dim/50 text-secondary-fixed-dim",
                  c.status === "partial" && "border-tertiary/50 text-tertiary",
                  c.status === "unknown" && "border-outline-variant text-outline"
                )}
              >
                {c.dimension} · {c.status}
              </span>
            ))}
          </div>
        </div>

        {!prescreen && (
          <p className="font-mono-data text-body-main text-on-surface-variant leading-snug">
            The Pre-Screen Agent reads the coverage gap and the thread,
            drafts one question per unknown for your approval, and
            structures the answers into evidence and interest — two
            tracks, never a grade. You conduct the conversation; it keeps
            the record.
          </p>
        )}

        {escalated && prescreen && (
          <div className="border border-error/50 bg-error/10 px-3 py-2.5 space-y-2">
            <div className="flex items-start gap-2 text-error">
              <IconAlert size={14} className="mt-0.5 shrink-0" />
              <div className="space-y-0.5">
                <p className="font-mono-label text-mono-label uppercase tracking-widest">
                  Escalated — this one is yours
                </p>
                <p className="font-mono-data text-body-main leading-snug">
                  {prescreen.escalation_reason}
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
                <option value="in_progress">I&rsquo;ve handled it — continue</option>
                <option value="abandoned">Abandon the pre-screen</option>
              </select>
              <button
                type="button"
                onClick={() =>
                  run(
                    "resolve",
                    async () =>
                      unwrap(
                        await resolvePrescreenEscalationAction(
                          projectId,
                          candidateId,
                          prescreen.id,
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

        {showProposal && prescreen && (
          <div className="bg-surface-container-lowest border border-outline-variant">
            <div className="px-3 py-2 border-b border-outline-variant font-mono-label text-mono-label text-on-surface-variant uppercase tracking-widest">
              Proposed invitation
            </div>
            <div className="p-3 space-y-2">
              {prescreen.question_set?.subject && (
                <p className="text-body-main text-on-surface font-semibold">
                  {prescreen.question_set.subject}
                </p>
              )}
              {prescreen.question_set?.body && (
                <p className="font-mono-data text-body-main text-on-surface-variant leading-snug whitespace-pre-wrap">
                  {prescreen.question_set.body}
                </p>
              )}
              {questions.length > 0 && (
                <ol className="space-y-1">
                  {questions.map((q, i) => (
                    <li
                      key={i}
                      className="font-mono-data text-body-main text-on-surface-variant leading-snug pl-3 border-l border-outline-variant"
                    >
                      {i + 1}. {q}
                    </li>
                  ))}
                </ol>
              )}
              <p className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
                Proposed by the agent — it goes nowhere until you send it.
                The Art. 14 notice and the AI-disclosure line are appended
                by Mandate at send time.
              </p>
              <div className="flex items-center gap-2 flex-wrap pt-1">
                <button
                  type="button"
                  onClick={() =>
                    run(
                      "send",
                      async () =>
                        unwrap(
                          await sendPrescreenInviteAction(
                            projectId,
                            candidateId,
                            prescreen.id
                          )
                        ),
                      "Invitation sent — the contact record is stamped"
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
                  Send invitation via Mandate
                </button>
              </div>
            </div>
          </div>
        )}

        {prescreen && Object.keys(evidence).length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <p className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
                Professional evidence
              </p>
              <ul className="space-y-1">
                {Object.entries(evidence).map(([dim, entry]) =>
                  entry ? (
                    <li
                      key={dim}
                      className="font-mono-data text-body-main text-on-surface-variant leading-snug pl-3 border-l border-outline-variant"
                    >
                      <span className="uppercase tracking-widest font-mono-label text-mono-label">
                        {dim} · {entry.status}
                      </span>
                      {entry.value && <> — {entry.value}</>}
                      {entry.source && (
                        <span className="text-outline"> ({entry.source})</span>
                      )}
                    </li>
                  ) : null
                )}
              </ul>
            </div>
            <div className="space-y-1">
              <p className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
                Interest
              </p>
              <ul className="space-y-1 font-mono-data text-body-main text-on-surface-variant leading-snug">
                {interest?.interest && (
                  <li className="pl-3 border-l border-outline-variant">
                    <span className="uppercase tracking-widest font-mono-label text-mono-label">
                      interest
                    </span>{" "}
                    — {interest.interest}
                  </li>
                )}
                {(
                  [
                    ["motivation", interest?.motivation],
                    ["timing", interest?.timing],
                    ["location", interest?.location],
                    ["comp context", interest?.comp_context],
                    ["notice", interest?.notice],
                    ["constraints", interest?.constraints],
                  ] as Array<[string, string | null | undefined]>
                ).map(([label, value]) =>
                  value ? (
                    <li key={label} className="pl-3 border-l border-outline-variant">
                      <span className="uppercase tracking-widest font-mono-label text-mono-label">
                        {label}
                      </span>{" "}
                      — {value}
                    </li>
                  ) : null
                )}
                {(interest?.questions ?? []).map((q, i) => (
                  <li key={`q-${i}`} className="pl-3 border-l border-tertiary/50">
                    <span className="uppercase tracking-widest font-mono-label text-mono-label text-tertiary">
                      they asked
                    </span>{" "}
                    — {q}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() =>
              run(
                "run",
                async () =>
                  unwrap(await runPrescreenAction(projectId, candidateId)),
                "Pre-screen updated"
              )
            }
            disabled={pending || terminal}
            className="px-3 py-1.5 border border-outline-variant text-on-surface-variant font-mono-label text-mono-label uppercase tracking-widest hover:bg-surface-container-high transition-colors flex items-center gap-1.5 disabled:opacity-60"
          >
            {pending && act === "run" ? (
              <IconRefresh size={14} className="animate-spin" />
            ) : (
              <IconIntelligence size={14} />
            )}
            {prescreen ? "Update pre-screen" : "Start pre-screen"}
          </button>
          {prescreen && !terminal && (
            <button
              type="button"
              onClick={() =>
                run(
                  "abandon",
                  async () =>
                    unwrap(
                      await abandonPrescreenAction(
                        projectId,
                        candidateId,
                        prescreen.id
                      )
                    ),
                  "Pre-screen abandoned"
                )
              }
              disabled={pending}
              className="px-3 py-1.5 border border-outline-variant text-on-surface-variant font-mono-label text-mono-label uppercase tracking-widest hover:bg-surface-container-high transition-colors disabled:opacity-60"
            >
              Abandon
            </button>
          )}
          {prescreen?.status === "complete" && (
            <span className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
              Complete — the record is final to the agent.
            </span>
          )}
        </div>
      </div>
    </section>
  );
}
