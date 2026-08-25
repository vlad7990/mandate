"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { unwrap } from "@/lib/actions/result";
import { normalizeMainstreamPlan } from "@/lib/ai/interviewer-agent";
import {
  approveInterviewPlanAction,
  requestInterviewPlanAction,
} from "./actions";

export type InterviewPlanRow = {
  id: string;
  version: number;
  status: "draft" | "approved" | "archived";
  content_json: unknown;
  is_generating: boolean;
  generation_error: string | null;
  approved_at: string | null;
};

/**
 * The Interviewer Agent's surface (116, gate §125 slice one). Every
 * reading here is decision support — never a recommendation; the plan
 * binds nothing until a person approves it, and approval goes through
 * the database's own door.
 */
export function InterviewPlanPanel({
  projectId,
  candidateId,
  initial,
  hasCalibration,
}: {
  projectId: string;
  candidateId: string;
  initial: InterviewPlanRow | null;
  hasCalibration: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [approving, startApprove] = useTransition();
  const [requested, setRequested] = useState(false);

  const generate = () => {
    if (pending) return;
    start(async () => {
      try {
        const { wasExisting } = unwrap(
          await requestInterviewPlanAction(candidateId, projectId)
        );
        setRequested(true);
        toast.success(
          wasExisting
            ? "A generation is already running — hold on"
            : "Interview plan requested — the Interviewer Agent is drafting"
        );
        router.refresh();
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "The request failed."
        );
      }
    });
  };

  const approve = () => {
    if (!initial || approving) return;
    if (
      !window.confirm(
        `Approve interview plan v${initial.version}? An approved plan is immutable — later changes need a new version.`
      )
    ) {
      return;
    }
    startApprove(async () => {
      try {
        unwrap(
          await approveInterviewPlanAction(initial.id, candidateId, projectId)
        );
        toast.success("Interview plan approved");
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
          The Interviewer Agent drafts a per-candidate interview plan from
          this mandate&apos;s own record — the job spec, the calibration
          weights, and the candidate&apos;s profile: stages, questions,
          evidence to listen for, red flags. You review and approve it
          before anyone interviews against it.
        </p>
        {!hasCalibration && (
          <p className="font-mono-label text-mono-label uppercase tracking-widest text-outline">
            This mandate has no calibration yet — run intake and the
            onboarding wizard first
          </p>
        )}
        <button
          type="button"
          onClick={generate}
          disabled={pending || !hasCalibration}
          className="px-3 py-1.5 btn-notch bg-primary-container text-on-primary-container font-mono-label text-mono-label uppercase tracking-widest hover:brightness-110 active:scale-[0.98] transition-[filter,transform] disabled:opacity-60"
        >
          {pending ? "Requesting…" : "Draft Interview Plan"}
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

  const plan = normalizeMainstreamPlan(initial.content_json);

  return (
    <section className="bg-surface-container-low border border-outline-variant p-4 space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <PanelHead status={initial.status} version={initial.version} />
        <div className="flex items-center gap-2">
          {initial.status === "draft" && (
            <button
              type="button"
              onClick={approve}
              disabled={approving}
              className="px-3 py-1.5 btn-notch bg-primary-container text-on-primary-container font-mono-label text-mono-label uppercase tracking-widest hover:brightness-110 active:scale-[0.98] transition-[filter,transform] disabled:opacity-60"
            >
              {approving ? "Approving…" : "Approve Plan"}
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

      {plan.overview && (
        <p className="text-body-main text-on-surface leading-relaxed max-w-2xl">
          {plan.overview}
        </p>
      )}

      {plan.dimension_coverage.length > 0 && (
        <div className="space-y-1.5">
          <div className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
            Dimension coverage{" // "}computed against the calibration, not
            the agent&apos;s claims
          </div>
          <ul className="flex flex-wrap gap-2">
            {plan.dimension_coverage.map((c) => (
              <li
                key={c.dimension_key}
                className={cn(
                  "px-2 py-1 border font-mono-label text-mono-label uppercase tracking-widest flex items-center gap-2",
                  c.covered_by.length > 0
                    ? "border-outline-variant text-on-surface-variant"
                    : c.weight >= 3
                      ? "border-error/60 text-error"
                      : "border-outline-variant/60 text-outline"
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "w-1.5 h-1.5 rounded-full",
                    c.covered_by.length > 0 ? "bg-secondary-fixed-dim" : "bg-error"
                  )}
                />
                {c.dimension_name} · w{c.weight} ·{" "}
                {c.covered_by.length > 0
                  ? `${c.covered_by.length} stage${c.covered_by.length === 1 ? "" : "s"}`
                  : "uncovered"}
              </li>
            ))}
          </ul>
        </div>
      )}

      <ol className="space-y-4">
        {plan.stages.map((s, i) => (
          <li
            key={`${s.stage_name}-${i}`}
            className="border border-outline-variant bg-surface-container-lowest p-4 space-y-3"
          >
            <header className="flex items-baseline justify-between gap-3 flex-wrap">
              <h4 className="font-h2 text-h2 text-on-surface tracking-tight">
                <span className="font-mono-data text-outline mr-2">
                  {String(i + 1).padStart(2, "0")}
                </span>
                {s.stage_name}
              </h4>
              <span className="font-mono-label text-mono-label text-outline uppercase tracking-widest tabular-nums">
                {s.recommended_interviewer_role}
                {s.duration_minutes > 0 && ` · ${s.duration_minutes}m`}
              </span>
            </header>
            {s.objective && (
              <p className="text-body-main text-on-surface-variant">
                {s.objective}
              </p>
            )}
            <QuestionList label="Core questions" items={s.core_questions} />
            <QuestionList label="Follow-ups" items={s.follow_up_questions} />
            <QuestionList
              label="Candidate-specific validation"
              items={s.candidate_specific_questions}
            />
            <QuestionList
              label="Evidence to listen for"
              items={s.evidence_to_listen_for}
            />
            <QuestionList
              label="Weak-answer indicators"
              items={s.weak_answer_indicators}
            />
            <QuestionList label="Red flags" items={s.red_flags} tone="error" />
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
        Interview plan
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

function QuestionList({
  label,
  items,
  tone,
}: {
  label: string;
  items: string[];
  tone?: "error";
}) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-1">
      <div
        className={cn(
          "font-mono-label text-mono-label uppercase tracking-widest",
          tone === "error" ? "text-error" : "text-outline"
        )}
      >
        {label}
      </div>
      <ul className="space-y-1">
        {items.map((q) => (
          <li
            key={q}
            className="text-body-main text-on-surface-variant leading-snug pl-3 border-l border-outline-variant/60"
          >
            {q}
          </li>
        ))}
      </ul>
    </div>
  );
}

function NoVerdictLine() {
  return (
    <p className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
      Decision support — never a recommendation. The plan gathers
      evidence; humans decide.
    </p>
  );
}
