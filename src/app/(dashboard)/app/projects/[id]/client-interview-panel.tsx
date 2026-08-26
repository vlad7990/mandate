"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { unwrap } from "@/lib/actions/result";
import { normalizeClientInterview } from "@/lib/ai/client-interview-agent";
import { PrintPanelButton } from "@/components/ui/print-report-button";
import {
  approveClientInterviewAction,
  requestClientInterviewAction,
} from "./actions";

export type ClientInterviewRow = {
  id: string;
  version: number;
  status: "draft" | "approved" | "archived";
  content_json: unknown;
  is_generating: boolean;
  generation_error: string | null;
  approved_at: string | null;
};

/**
 * The Interviewer Agent's CLIENT face (117). The set is composed from
 * what the mandate provably lacks — the "Information required" rail
 * this panel sits beside, plus the provable calibration gaps — and it
 * binds nothing until a person approves it through the database's own
 * door. Only an approved set renders on the client's portal (R2).
 */
export function ClientInterviewPanel({
  projectId,
  initial,
  hasCalibration,
  gapCount,
  answeredCount,
}: {
  projectId: string;
  initial: ClientInterviewRow | null;
  hasCalibration: boolean;
  /** Server-computed count of provable gaps — 0 means honest refusal. */
  gapCount: number;
  /** Answer submissions landed as client_interview feedback rows. */
  answeredCount: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [approving, startApprove] = useTransition();
  const [requested, setRequested] = useState(false);

  const canCompose = hasCalibration && gapCount > 0;

  const generate = () => {
    if (pending) return;
    start(async () => {
      try {
        const { wasExisting } = unwrap(
          await requestClientInterviewAction(projectId)
        );
        setRequested(true);
        toast.success(
          wasExisting
            ? "A generation is already running — hold on"
            : "Client questions requested — the Interviewer Agent is drafting"
        );
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "The request failed.");
      }
    });
  };

  const approve = () => {
    if (!initial || approving) return;
    if (
      !window.confirm(
        `Approve question set v${initial.version}? An approved set is immutable and renders on the client's portal — later changes need a new version.`
      )
    ) {
      return;
    }
    startApprove(async () => {
      try {
        unwrap(await approveClientInterviewAction(initial.id, projectId));
        toast.success("Question set approved — it is now on the client portal");
        router.refresh();
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "The approval failed."
        );
      }
    });
  };

  if (!initial && !requested) {
    return (
      <section className="bg-surface-container-low border border-outline-variant p-4 space-y-3">
        <PanelHead status={null} version={null} />
        <p className="text-body-main text-on-surface-variant max-w-2xl">
          The Interviewer Agent turns what this mandate provably lacks —
          the &ldquo;Information required&rdquo; list and the calibration&apos;s own
          gaps — into a short question set for your client. You review
          and approve it; only then does it appear on the hiring-manager
          portal, and answers come back as feedback for the interpreter.
        </p>
        <div className="border border-dashed border-outline-variant/70 px-3 py-2.5 space-y-1">
          <div className="font-mono-label text-mono-label uppercase tracking-widest text-outline">
            Illustrative example — not this mandate&apos;s data
          </div>
          <p className="text-body-main text-on-surface-variant leading-snug">
            &ldquo;What is the approved compensation range for this role,
            including any flexibility for an exceptional candidate?&rdquo;
          </p>
          <p className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
            Addresses: compensation range missing from intake
          </p>
        </div>
        {!hasCalibration && (
          <p className="font-mono-label text-mono-label uppercase tracking-widest text-outline">
            This mandate has no calibration yet — run intake first
          </p>
        )}
        {hasCalibration && gapCount === 0 && (
          <p className="font-mono-label text-mono-label uppercase tracking-widest text-outline">
            No provable gaps — intake left no missing information and the
            calibration is established. There is nothing to ask the client
          </p>
        )}
        <button
          type="button"
          onClick={generate}
          disabled={pending || !canCompose}
          className="px-3 py-1.5 btn-notch bg-primary-container text-on-primary-container font-mono-label text-mono-label uppercase tracking-widest hover:brightness-110 active:scale-[0.98] transition-[filter,transform] disabled:opacity-60"
        >
          {pending ? "Requesting…" : "Draft Client Questions"}
        </button>
        <NoVerdictLine />
      </section>
    );
  }

  if (!initial || initial.is_generating) {
    return (
      <section className="bg-surface-container-low border border-outline-variant p-4 space-y-3">
        <PanelHead status="generating" version={initial?.version ?? null} />
        <p className="text-body-main text-on-surface-variant">
          The Interviewer Agent is drafting. This usually takes under a
          minute — refresh to check.
        </p>
        <button
          type="button"
          onClick={() => router.refresh()}
          className="px-3 py-1.5 border border-outline-variant text-on-surface-variant font-mono-label text-mono-label uppercase tracking-widest hover:border-primary hover:text-primary transition-colors"
        >
          Refresh
        </button>
      </section>
    );
  }

  if (initial.generation_error) {
    return (
      <section className="bg-surface-container-low border border-outline-variant p-4 space-y-3">
        <PanelHead status="failed" version={initial.version} />
        <p className="text-body-main text-error">{initial.generation_error}</p>
        <button
          type="button"
          onClick={generate}
          disabled={pending}
          className="px-3 py-1.5 btn-notch bg-primary-container text-on-primary-container font-mono-label text-mono-label uppercase tracking-widest hover:brightness-110 active:scale-[0.98] transition-[filter,transform] disabled:opacity-60"
        >
          {pending ? "Requesting…" : "Retry"}
        </button>
      </section>
    );
  }

  const content = normalizeClientInterview(initial.content_json);

  return (
    // This one does not use `Panel` (it never has), so it opts into the
    // print pass by hand: the same id + `m-report-doc` that the Panel
    // `printId` prop applies. The APPROVED set is the document — it is
    // the version the client sees, so it is the version worth printing.
    <section
      id="client-interview-set"
      className="m-report-doc bg-surface-container-low border border-outline-variant p-4 space-y-5"
    >
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <PanelHead status={initial.status} version={initial.version} />
        <div className="flex items-center gap-2">
          {initial.status === "approved" && (
            <PrintPanelButton scopeId="client-interview-set" />
          )}
          {initial.status === "draft" && (
            <button
              type="button"
              onClick={approve}
              disabled={approving}
              className="px-3 py-1.5 btn-notch bg-primary-container text-on-primary-container font-mono-label text-mono-label uppercase tracking-widest hover:brightness-110 active:scale-[0.98] transition-[filter,transform] disabled:opacity-60"
            >
              {approving ? "Approving…" : "Approve for Portal"}
            </button>
          )}
          <button
            type="button"
            onClick={generate}
            disabled={pending}
            className="px-3 py-1.5 border border-outline-variant text-on-surface-variant font-mono-label text-mono-label uppercase tracking-widest hover:border-primary hover:text-primary transition-colors disabled:opacity-60"
          >
            {pending ? "Requesting…" : "Regenerate (new version)"}
          </button>
        </div>
      </div>

      {initial.status === "draft" && (
        <p className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
          Draft — the client cannot see this until you approve it
        </p>
      )}
      {initial.status === "approved" && (
        <p className="font-mono-label text-mono-label text-secondary-fixed-dim uppercase tracking-widest">
          Live on the hiring-manager portal
          {answeredCount > 0 &&
            ` // ${answeredCount} answer submission${answeredCount === 1 ? "" : "s"} received`}
        </p>
      )}

      {content.intro && (
        <p className="text-body-main text-on-surface leading-relaxed max-w-2xl">
          {content.intro}
        </p>
      )}

      {content.gap_coverage.length > 0 && (
        <div className="space-y-1.5">
          <div className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
            Gap coverage{" // "}computed against the mandate&apos;s record, not
            the agent&apos;s claims
          </div>
          <ul className="flex flex-wrap gap-2">
            {content.gap_coverage.map((g) => (
              <li
                key={g.gap_id}
                className={cn(
                  "px-2 py-1 border font-mono-label text-mono-label uppercase tracking-widest flex items-center gap-2 max-w-full",
                  g.question_ids.length > 0
                    ? "border-outline-variant text-on-surface-variant"
                    : "border-error/60 text-error"
                )}
                title={g.gap_label}
              >
                <span
                  aria-hidden
                  className={cn(
                    "w-1.5 h-1.5 rounded-full shrink-0",
                    g.question_ids.length > 0 ? "bg-secondary-fixed-dim" : "bg-error"
                  )}
                />
                <span className="truncate">{g.gap_label}</span>
                <span className="shrink-0">
                  {g.question_ids.length > 0
                    ? `${g.question_ids.length}q`
                    : "uncovered"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ol className="space-y-3">
        {content.questions.map((q, i) => (
          <li
            key={q.id}
            className="border border-outline-variant bg-surface-container-lowest p-3 space-y-1.5"
          >
            <p className="text-body-main text-on-surface leading-snug">
              <span className="font-mono-data text-outline mr-2">
                {String(i + 1).padStart(2, "0")}
              </span>
              {q.question}
            </p>
            {q.why_it_matters && (
              <p className="text-body-main text-on-surface-variant leading-snug pl-3 border-l border-outline-variant/60">
                {q.why_it_matters}
              </p>
            )}
            {q.gap_label && (
              <p className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
                Addresses: {q.gap_label}
              </p>
            )}
          </li>
        ))}
      </ol>

      <NoVerdictLine />
    </section>
  );
}

function PanelHead({
  status,
  version,
}: {
  status: "draft" | "approved" | "archived" | "generating" | "failed" | null;
  version: number | null;
}) {
  return (
    <div className="flex items-baseline gap-2 flex-wrap">
      <h3 className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
        Client interview
      </h3>
      {status && (
        <span
          className={cn(
            "px-1.5 py-0 border font-mono-label text-mono-label uppercase tracking-widest",
            status === "approved" &&
              "border-secondary-fixed-dim/60 bg-secondary-fixed-dim/10 text-secondary-fixed-dim",
            status === "draft" &&
              "border-primary/60 bg-primary-container/15 text-primary",
            (status === "failed" || status === "archived") &&
              "border-error/60 bg-error/10 text-error",
            status === "generating" &&
              "border-outline-variant text-on-surface-variant"
          )}
        >
          {status}
          {version != null && ` v${version}`}
        </span>
      )}
    </div>
  );
}

function NoVerdictLine() {
  return (
    <p className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
      Decision support — questions about the mandate, never about a
      candidate&apos;s worth. Humans approve before the client sees it.
    </p>
  );
}
