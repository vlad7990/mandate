"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  STAGE_LIST_FIELDS,
  STAGE_TEXT_FIELDS,
  type InterviewPlanContent,
  type InterviewStage,
} from "@/lib/ai/executive-interview-architect-agent";
import {
  DECISION_SUPPORT_DISCLAIMER,
  PROFILE_STATUS_LABELS,
  type ProfileStatus,
} from "@/lib/executive/types";
import { formatTimestampUtc } from "@/lib/executive/format";
import {
  IconArrowLeft,
  IconBalance,
  IconBlock,
  IconCheckCircle,
  IconIntelligence,
  IconPlus,
  IconSave,
  IconVerified,
  type IconProps,
} from "@/components/icons";
import {
  approveInterviewPlan,
  createInterviewPlanNewVersion,
  requestInterviewPlanGeneration,
  saveInterviewPlanDraft,
} from "./actions";

export type PlanVersionSummary = {
  id: string;
  version: number;
  status: ProfileStatus;
  is_generating: boolean;
  generation_error: string | null;
};

type Props = {
  searchId: string;
  candidateId: string;
  candidateName: string;
  planId: string;
  version: number;
  status: ProfileStatus;
  promptVersion: string | null;
  modelVersion: string | null;
  approvedAt: string | null;
  approverName: string | null;
  updatedAt: string;
  content: InterviewPlanContent;
  versions: PlanVersionSummary[];
  activeGeneration: { version: number } | null;
  failedGeneration: { version: number; error: string } | null;
};

const textareaClass =
  "w-full bg-surface-container-lowest border border-outline-variant px-3 py-2 text-body-main text-on-surface placeholder:text-outline-variant outline-none focus:border-primary transition-colors resize-y disabled:opacity-60 disabled:cursor-not-allowed";
const smallInputClass =
  "bg-surface-container-lowest border border-outline-variant px-2 py-1.5 text-body-main text-on-surface outline-none focus:border-primary transition-colors disabled:opacity-60 disabled:cursor-not-allowed";

export function PlanEditor({
  searchId,
  candidateId,
  candidateName,
  planId,
  version,
  status,
  promptVersion,
  modelVersion,
  approvedAt,
  approverName,
  updatedAt,
  content: initialContent,
  versions,
  activeGeneration,
  failedGeneration,
}: Props) {
  const router = useRouter();
  const [content, setContent] = useState<InterviewPlanContent>(initialContent);
  const [isDirty, setIsDirty] = useState(false);
  const [isPending, startTransition] = useTransition();

  const isDraft = status === "draft";
  const readOnly = !isDraft || isPending;

  const updateStage = (index: number, patch: Partial<InterviewStage>) => {
    setContent((prev) => ({
      ...prev,
      stages: prev.stages.map((s, i) => (i === index ? { ...s, ...patch } : s)),
    }));
    setIsDirty(true);
  };

  const updateOverview = (value: string) => {
    setContent((prev) => ({ ...prev, overview: value }));
    setIsDirty(true);
  };

  const run = (label: string, fn: () => Promise<void>) => {
    startTransition(async () => {
      try {
        await fn();
        router.refresh();
      } catch (e) {
        const msg = e instanceof Error ? e.message : `${label} failed.`;
        console.error(`[interview-plan] ${label} failed:`, e);
        toast.error(msg);
      }
    });
  };

  const handleSave = () =>
    run("Save", async () => {
      await saveInterviewPlanDraft(planId, searchId, candidateId, content);
      setIsDirty(false);
      toast.success("Draft saved.");
    });

  const handleNewVersion = () =>
    run("New version", async () => {
      const res = await createInterviewPlanNewVersion(searchId, candidateId, content);
      setIsDirty(false);
      toast.success(`Version ${res.version} created as a new draft.`);
    });

  const handleApprove = () => {
    if (
      !window.confirm(
        `Approve version ${version}? Approval is recorded with your name, and this version becomes immutable — future changes require a new version.`
      )
    ) {
      return;
    }
    run("Approve", async () => {
      if (isDirty) {
        await saveInterviewPlanDraft(planId, searchId, candidateId, content);
        setIsDirty(false);
      }
      await approveInterviewPlan(planId, searchId, candidateId);
      toast.success(`Version ${version} approved.`);
    });
  };

  const handleRegenerate = () => {
    if (
      !window.confirm(
        "Regenerate with the Interview Architect? A fresh AI draft is created as a new version — this version is preserved."
      )
    ) {
      return;
    }
    run("Regenerate", async () => {
      await requestInterviewPlanGeneration(searchId, candidateId);
    });
  };

  const covered = content.competency_coverage.filter((c) => c.covered_by.length > 0);
  const uncovered = content.competency_coverage.filter((c) => c.covered_by.length === 0);

  return (
    <div className="min-h-full bg-surface text-on-surface">
      <div className="max-w-6xl mx-auto px-8 py-10 space-y-6">
        <div className="flex items-center gap-3 font-mono-label text-mono-label uppercase tracking-widest text-outline">
          <Link
            href={`/app/executive-intelligence/searches/${searchId}/candidates`}
            prefetch={false}
            className="hover:text-on-surface transition-colors flex items-center gap-1.5"
          >
            <IconArrowLeft size={14} />
            Candidates
          </Link>
          <span className="text-outline-variant">/</span>
          <span className="text-on-surface-variant">{candidateName}</span>
          <span className="text-outline-variant">/</span>
          <span className={status === "approved" ? "text-primary" : "text-on-surface-variant"}>
            Interview Plan V{String(version).padStart(2, "0")}
          </span>
        </div>

        <header className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-h1 text-h1">
              Interview Plan{" "}
              <span className="text-on-surface-variant">— {candidateName}</span>
            </h1>
            <span
              className={`font-mono-label text-mono-label uppercase tracking-widest px-2.5 py-1 border ${
                status === "approved"
                  ? "border-primary/50 text-primary bg-primary-container/15"
                  : status === "draft"
                    ? "border-outline-variant text-on-surface-variant bg-surface-container"
                    : "border-outline-variant text-outline bg-surface-container"
              }`}
            >
              {PROFILE_STATUS_LABELS[status]}
            </span>
          </div>
          <p className="font-mono-label text-mono-label text-outline uppercase tracking-wider">
            {promptVersion ?? "manual"} · {modelVersion ?? "human-authored"} · updated{" "}
            {formatTimestampUtc(updatedAt)}
            {status === "approved" && approvedAt && (
              <>
                {" "}
                · approved {formatTimestampUtc(approvedAt)}
                {approverName ? ` by ${approverName}` : ""}
              </>
            )}
          </p>
          <div className="border border-outline-variant bg-surface-container-lowest px-4 py-2.5 flex items-start gap-2">
            <IconBalance size={16} className="text-primary mt-0.5 shrink-0" />
            <p className="text-body-main text-on-surface-variant">
              {DECISION_SUPPORT_DISCLAIMER} This plan structures how to gather
              evidence; it does not evaluate the candidate or recommend a decision.
            </p>
          </div>
        </header>

        {activeGeneration && (
          <div className="border border-primary-container/70 bg-surface-container-lowest px-4 py-3 flex items-center gap-3">
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            <p className="text-body-main text-on-surface-variant">
              A new AI draft (V{String(activeGeneration.version).padStart(2, "0")}) is
              generating. It will appear in version history when it lands.
            </p>
          </div>
        )}
        {failedGeneration && (
          <div className="border border-error/40 bg-error-container/10 px-4 py-3">
            <p className="text-body-main text-on-surface-variant">
              <span className="text-error font-mono-label text-mono-label uppercase tracking-widest mr-2">
                V{String(failedGeneration.version).padStart(2, "0")} failed
              </span>
              {failedGeneration.error}
            </p>
          </div>
        )}

        {!isDraft && (
          <div className="border border-outline-variant bg-surface-container px-4 py-3 flex items-center justify-between gap-4">
            <p className="text-body-main text-on-surface-variant">
              This version is {status} and immutable. Create a new version to make
              changes.
            </p>
            <button
              type="button"
              onClick={handleNewVersion}
              disabled={isPending}
              className="shrink-0 px-4 py-2 border border-primary-container/70 text-primary font-mono-label text-mono-label uppercase tracking-widest hover:bg-surface-container-low transition-colors disabled:opacity-60"
            >
              New Version From This
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-6">
          <div className="space-y-4">
            {/* Overview */}
            <section className="bg-surface-container-low border border-outline-variant p-5 space-y-3">
              <span className="font-mono-label text-mono-label text-secondary-fixed-dim uppercase tracking-widest">
                # Plan Overview
              </span>
              <textarea
                value={content.overview}
                onChange={(e) => updateOverview(e.target.value)}
                disabled={readOnly}
                rows={2}
                className={textareaClass}
                aria-label="Plan overview"
              />
            </section>

            {/* Stages */}
            {content.stages.map((stage, i) => (
              <section
                key={i}
                className="bg-surface-container-low border border-outline-variant p-5 space-y-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-mono-label text-mono-label text-primary uppercase tracking-widest">
                    Stage {i + 1}
                  </span>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={0}
                      max={600}
                      value={stage.duration_minutes}
                      onChange={(e) =>
                        updateStage(i, {
                          duration_minutes: Math.min(
                            600,
                            Math.max(0, Number(e.target.value) || 0)
                          ),
                        })
                      }
                      disabled={readOnly}
                      className={`${smallInputClass} w-20 tabular-nums`}
                      aria-label={`Stage ${i + 1} duration in minutes`}
                    />
                    <span className="font-mono-label text-mono-label text-outline uppercase tracking-wider">
                      min
                    </span>
                  </div>
                </div>

                <input
                  type="text"
                  value={stage.stage_name}
                  onChange={(e) => updateStage(i, { stage_name: e.target.value })}
                  disabled={readOnly}
                  placeholder="Stage name"
                  className={`${smallInputClass} w-full text-headline-md`}
                  aria-label={`Stage ${i + 1} name`}
                />

                {STAGE_TEXT_FIELDS.map((f) => (
                  <label key={f.key} className="block space-y-1">
                    <span className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
                      {f.label}
                    </span>
                    <textarea
                      value={stage[f.key] as string}
                      onChange={(e) => updateStage(i, { [f.key]: e.target.value })}
                      disabled={readOnly}
                      rows={2}
                      className={textareaClass}
                    />
                  </label>
                ))}

                {stage.assigned_competencies.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    <span className="font-mono-label text-mono-label text-outline uppercase tracking-widest mr-1">
                      Competencies:
                    </span>
                    {stage.assigned_competencies.map((k) => (
                      <span
                        key={k}
                        className="font-mono-label text-mono-label uppercase tracking-wider px-2 py-0.5 border border-outline-variant text-on-surface-variant"
                      >
                        {k}
                      </span>
                    ))}
                  </div>
                )}

                {STAGE_LIST_FIELDS.map((f) => (
                  <label key={f.key} className="block space-y-1">
                    <span className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
                      {f.label}
                    </span>
                    <textarea
                      value={(stage[f.key] as string[]).join("\n")}
                      onChange={(e) =>
                        updateStage(i, {
                          [f.key]: e.target.value.split("\n"),
                        })
                      }
                      onBlur={(e) =>
                        updateStage(i, {
                          [f.key]: e.target.value
                            .split("\n")
                            .map((l) => l.trim())
                            .filter(Boolean),
                        })
                      }
                      disabled={readOnly}
                      rows={Math.max(2, (stage[f.key] as string[]).length + 1)}
                      placeholder="One item per line"
                      className={textareaClass}
                    />
                  </label>
                ))}
              </section>
            ))}
          </div>

          {/* Right rail */}
          <aside className="space-y-4 lg:sticky lg:top-6 self-start">
            <div className="bg-surface-container-low border border-outline-variant p-4 space-y-2">
              <span className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
                Actions
              </span>
              {isDraft && (
                <>
                  <RailButton
                    icon={IconSave}
                    label={isDirty ? "Save Draft *" : "Save Draft"}
                    onClick={handleSave}
                    disabled={isPending || !isDirty}
                  />
                  <RailButton
                    icon={IconVerified}
                    label="Approve Version"
                    onClick={handleApprove}
                    disabled={isPending}
                    emphasis
                  />
                </>
              )}
              <RailButton
                icon={IconPlus}
                label="Snapshot New Version"
                onClick={handleNewVersion}
                disabled={isPending}
              />
              <RailButton
                icon={IconIntelligence}
                label="Regenerate (AI)"
                onClick={handleRegenerate}
                disabled={isPending || activeGeneration != null}
              />
            </div>

            {/* Competency coverage */}
            <div className="bg-surface-container-low border border-outline-variant p-4 space-y-3">
              <span className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
                Competency Coverage
              </span>
              <div className="space-y-1">
                {covered.map((c) => (
                  <div key={c.competency_key} className="flex items-start gap-1.5">
                    <IconCheckCircle
                      size={15}
                      className="text-primary mt-0.5 shrink-0"
                    />
                    <div className="min-w-0">
                      <p className="text-body-main text-on-surface truncate">
                        {c.competency_name}
                      </p>
                      <p className="font-mono-label text-mono-label text-outline uppercase tracking-wider">
                        w{c.weight} · {c.covered_by.length} stage
                        {c.covered_by.length === 1 ? "" : "s"}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              {uncovered.length > 0 && (
                <div className="space-y-1 border-t border-outline-variant/40 pt-2">
                  <span className="font-mono-label text-mono-label text-error uppercase tracking-widest">
                    Uncovered ({uncovered.length})
                  </span>
                  {uncovered.map((c) => (
                    <div key={c.competency_key} className="flex items-start gap-1.5">
                      <IconBlock size={15} className="text-error mt-0.5 shrink-0" />
                      <p className="text-body-main text-on-surface-variant">
                        {c.competency_name}{" "}
                        <span className="text-outline">(w{c.weight})</span>
                      </p>
                    </div>
                  ))}
                </div>
              )}
              {content.competency_coverage.length === 0 && (
                <p className="text-body-main text-outline">
                  No coverage data on this version.
                </p>
              )}
            </div>

            <div className="bg-surface-container-low border border-outline-variant p-4 space-y-2">
              <span className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
                Version History
              </span>
              <ul className="space-y-1">
                {versions.map((v) => (
                  <li
                    key={v.id}
                    className={`flex items-center justify-between font-mono-label text-mono-label uppercase tracking-wider px-2 py-1.5 ${
                      v.id === planId
                        ? "bg-surface-container text-on-surface"
                        : "text-on-surface-variant"
                    }`}
                  >
                    <span>V{String(v.version).padStart(2, "0")}</span>
                    <span
                      className={
                        v.status === "approved"
                          ? "text-primary"
                          : v.is_generating
                            ? "text-secondary-fixed-dim"
                            : v.generation_error
                              ? "text-error"
                              : "text-outline"
                      }
                    >
                      {v.is_generating
                        ? "generating"
                        : v.generation_error
                          ? "failed"
                          : v.status}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

function RailButton({
  icon: Icon,
  label,
  onClick,
  disabled,
  emphasis = false,
}: {
  icon: (props: IconProps) => React.ReactElement;
  label: string;
  onClick: () => void;
  disabled: boolean;
  emphasis?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`w-full flex items-center gap-2 px-3 py-2 font-mono-label text-mono-label uppercase tracking-widest transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
        emphasis
          ? "bg-primary-container text-on-primary-container hover:brightness-110"
          : "border border-outline-variant text-on-surface-variant hover:bg-surface-container"
      }`}
    >
      <Icon size={16} />
      {label}
    </button>
  );
}
