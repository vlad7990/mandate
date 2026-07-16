"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  PROFILE_LIST_SECTIONS,
  PROFILE_TEXT_SECTIONS,
  type BusinessOutcome,
  type InterviewStageRecommendation,
  type SuccessProfileContent,
} from "@/lib/ai/executive-role-architect-agent";
import {
  DECISION_SUPPORT_DISCLAIMER,
  PROFILE_STATUS_LABELS,
  type ProfileStatus,
} from "@/lib/executive/types";
import {
  approveProfile,
  createProfileNewVersion,
  requestProfileGeneration,
  saveProfileDraft,
} from "./actions";

export type ProfileVersionSummary = {
  id: string;
  version: number;
  status: ProfileStatus;
  is_generating: boolean;
  generation_error: string | null;
  updated_at: string;
};

type Props = {
  searchId: string;
  roleTitle: string;
  companyName: string;
  profileId: string;
  version: number;
  status: ProfileStatus;
  promptVersion: string | null;
  modelVersion: string | null;
  approvedAt: string | null;
  approverName: string | null;
  updatedAt: string;
  content: SuccessProfileContent;
  versions: ProfileVersionSummary[];
  activeGeneration: { profileId: string; version: number } | null;
  failedGeneration: { version: number; error: string } | null;
};

const textareaClass =
  "w-full bg-surface-container-lowest border border-outline-variant px-3 py-2 text-body-main text-on-surface placeholder:text-outline-variant outline-none focus:border-primary transition-colors resize-y disabled:opacity-60 disabled:cursor-not-allowed";
const smallInputClass =
  "bg-surface-container-lowest border border-outline-variant px-2 py-1.5 text-body-main text-on-surface outline-none focus:border-primary transition-colors disabled:opacity-60 disabled:cursor-not-allowed";

function SectionShell({
  icon,
  label,
  children,
}: {
  icon: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-surface-container-low border border-outline-variant p-5 space-y-3">
      <span className="font-mono-label text-mono-label text-secondary-fixed-dim uppercase tracking-widest flex items-center gap-2">
        <span
          className="material-symbols-outlined text-[14px]"
          style={{ fontVariationSettings: "'FILL' 1" }}
        >
          {icon}
        </span>
        # {label}
      </span>
      {children}
    </section>
  );
}

export function ProfileEditor({
  searchId,
  roleTitle,
  companyName,
  profileId,
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
  const [content, setContent] = useState<SuccessProfileContent>(initialContent);
  const [isDirty, setIsDirty] = useState(false);
  const [isPending, startTransition] = useTransition();

  const isDraft = status === "draft";
  const readOnly = !isDraft || isPending;

  const update = <K extends keyof SuccessProfileContent>(
    key: K,
    value: SuccessProfileContent[K]
  ) => {
    setContent((prev) => ({ ...prev, [key]: value }));
    setIsDirty(true);
  };

  const run = (label: string, fn: () => Promise<void>) => {
    startTransition(async () => {
      try {
        await fn();
        router.refresh();
      } catch (e) {
        const msg = e instanceof Error ? e.message : `${label} failed.`;
        console.error(`[success-profile] ${label} failed:`, e);
        toast.error(msg);
      }
    });
  };

  const handleSave = () =>
    run("Save", async () => {
      await saveProfileDraft(profileId, searchId, content);
      setIsDirty(false);
      toast.success("Draft saved.");
    });

  const handleNewVersion = () =>
    run("New version", async () => {
      const res = await createProfileNewVersion(searchId, content);
      setIsDirty(false);
      toast.success(`Version ${res.version} created as a new draft.`);
    });

  const handleApprove = () => {
    if (
      !window.confirm(
        `Approve version ${version}? Approval is recorded with your name in the audit trail, and this version becomes immutable — future changes require a new version.`
      )
    ) {
      return;
    }
    run("Approve", async () => {
      if (isDirty) {
        await saveProfileDraft(profileId, searchId, content);
        setIsDirty(false);
      }
      await approveProfile(profileId, searchId);
      toast.success(`Version ${version} approved.`);
    });
  };

  const handleRegenerate = () => {
    if (
      !window.confirm(
        "Regenerate with the Executive Role Architect? A fresh AI draft is created as a new version — this version is preserved."
      )
    ) {
      return;
    }
    run("Regenerate", async () => {
      await requestProfileGeneration(searchId);
    });
  };

  return (
    <div className="min-h-full bg-surface text-on-surface">
      <div className="max-w-6xl mx-auto px-8 py-10 space-y-6">
        <div className="flex items-center gap-3 font-mono-label text-mono-label uppercase tracking-widest text-outline">
          <Link
            href={`/executive-intelligence/searches/${searchId}`}
            prefetch={false}
            className="hover:text-on-surface transition-colors flex items-center gap-1.5"
          >
            <span className="material-symbols-outlined text-[14px]">arrow_back</span>
            Search Workspace
          </Link>
          <span className="text-outline-variant">/</span>
          <span className="text-on-surface-variant">{roleTitle}</span>
          <span className="text-outline-variant">/</span>
          <span className={status === "approved" ? "text-primary" : "text-on-surface-variant"}>
            Success Profile V{String(version).padStart(2, "0")}
          </span>
        </div>

        <header className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-h1 text-h1">
              {roleTitle} <span className="text-on-surface-variant">@ {companyName}</span>
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
            {new Date(updatedAt).toLocaleString()}
            {status === "approved" && approvedAt && (
              <>
                {" "}
                · approved {new Date(approvedAt).toLocaleString()}
                {approverName ? ` by ${approverName}` : ""}
              </>
            )}
          </p>
          <div className="border border-outline-variant bg-surface-container-lowest px-4 py-2.5 flex items-start gap-2">
            <span className="material-symbols-outlined text-[16px] text-primary mt-0.5">
              balance
            </span>
            <p className="text-body-main text-on-surface-variant">
              {DECISION_SUPPORT_DISCLAIMER}
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

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_240px] gap-6">
          <div className="space-y-4">
            {/* Mission + mandate + paragraph sections */}
            {PROFILE_TEXT_SECTIONS.map((s) => (
              <SectionShell key={s.key} icon={s.icon} label={s.label}>
                <textarea
                  value={content[s.key] as string}
                  onChange={(e) => update(s.key, e.target.value as never)}
                  disabled={readOnly}
                  rows={4}
                  className={textareaClass}
                  aria-label={s.label}
                />
              </SectionShell>
            ))}

            {/* Critical business outcomes — structured rows */}
            <SectionShell icon="verified" label="Critical Business Outcomes">
              <div className="space-y-3">
                {content.critical_business_outcomes.map((o, i) => (
                  <div
                    key={i}
                    className="grid grid-cols-1 md:grid-cols-[1fr_140px_1fr_32px] gap-2 items-start"
                  >
                    <textarea
                      value={o.outcome}
                      onChange={(e) =>
                        update(
                          "critical_business_outcomes",
                          content.critical_business_outcomes.map((row, j) =>
                            j === i ? { ...row, outcome: e.target.value } : row
                          )
                        )
                      }
                      disabled={readOnly}
                      rows={2}
                      placeholder="Outcome"
                      className={textareaClass}
                    />
                    <input
                      type="text"
                      value={o.timeframe}
                      onChange={(e) =>
                        update(
                          "critical_business_outcomes",
                          content.critical_business_outcomes.map((row, j) =>
                            j === i ? { ...row, timeframe: e.target.value } : row
                          )
                        )
                      }
                      disabled={readOnly}
                      placeholder="Timeframe"
                      className={smallInputClass}
                    />
                    <textarea
                      value={o.evidence_of_success}
                      onChange={(e) =>
                        update(
                          "critical_business_outcomes",
                          content.critical_business_outcomes.map((row, j) =>
                            j === i
                              ? { ...row, evidence_of_success: e.target.value }
                              : row
                          )
                        )
                      }
                      disabled={readOnly}
                      rows={2}
                      placeholder="Evidence of success"
                      className={textareaClass}
                    />
                    {!readOnly && (
                      <button
                        type="button"
                        aria-label="Remove outcome"
                        onClick={() =>
                          update(
                            "critical_business_outcomes",
                            content.critical_business_outcomes.filter(
                              (_, j) => j !== i
                            )
                          )
                        }
                        className="text-outline hover:text-error transition-colors pt-2"
                      >
                        <span className="material-symbols-outlined text-[18px]">close</span>
                      </button>
                    )}
                  </div>
                ))}
                {!readOnly && (
                  <AddRowButton
                    label="Add outcome"
                    onClick={() =>
                      update("critical_business_outcomes", [
                        ...content.critical_business_outcomes,
                        {
                          outcome: "",
                          timeframe: "",
                          evidence_of_success: "",
                        } satisfies BusinessOutcome,
                      ])
                    }
                  />
                )}
              </div>
            </SectionShell>

            {/* String-list sections, one item per line */}
            {PROFILE_LIST_SECTIONS.map((s) => (
              <SectionShell key={s.key} icon={s.icon} label={s.label}>
                <textarea
                  value={(content[s.key] as string[]).join("\n")}
                  onChange={(e) =>
                    update(
                      s.key,
                      e.target.value.split("\n") as never
                    )
                  }
                  onBlur={(e) =>
                    update(
                      s.key,
                      e.target.value
                        .split("\n")
                        .map((line) => line.trim())
                        .filter(Boolean) as never
                    )
                  }
                  disabled={readOnly}
                  rows={Math.max(3, (content[s.key] as string[]).length + 1)}
                  placeholder="One item per line"
                  className={textareaClass}
                  aria-label={s.label}
                />
              </SectionShell>
            ))}

            {/* Competency weights — transparent scoring table */}
            <SectionShell icon="tune" label="Recommended Competency Weights">
              <p className="text-body-main text-on-surface-variant">
                Transparent weighting with rationale — every weight is editable and
                traces to the competency library.
              </p>
              <div className="space-y-2">
                {content.recommended_competency_weights.map((w, i) => (
                  <div
                    key={`${w.competency_key}-${i}`}
                    className="grid grid-cols-1 md:grid-cols-[200px_90px_1fr_32px] gap-2 items-start border-b border-outline-variant/40 pb-2"
                  >
                    <div className="pt-1.5">
                      <p className="text-body-main text-on-surface">
                        {w.competency_name || w.competency_key}
                      </p>
                      <p className="font-mono-label text-mono-label text-outline uppercase tracking-wider">
                        {w.competency_key}
                      </p>
                    </div>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={w.weight}
                      onChange={(e) =>
                        update(
                          "recommended_competency_weights",
                          content.recommended_competency_weights.map((row, j) =>
                            j === i
                              ? {
                                  ...row,
                                  weight: Math.min(
                                    100,
                                    Math.max(0, Number(e.target.value) || 0)
                                  ),
                                }
                              : row
                          )
                        )
                      }
                      disabled={readOnly}
                      className={`${smallInputClass} tabular-nums`}
                      aria-label={`Weight for ${w.competency_name}`}
                    />
                    <textarea
                      value={w.rationale}
                      onChange={(e) =>
                        update(
                          "recommended_competency_weights",
                          content.recommended_competency_weights.map((row, j) =>
                            j === i ? { ...row, rationale: e.target.value } : row
                          )
                        )
                      }
                      disabled={readOnly}
                      rows={2}
                      placeholder="Rationale"
                      className={textareaClass}
                    />
                    {!readOnly && (
                      <button
                        type="button"
                        aria-label={`Remove ${w.competency_name}`}
                        onClick={() =>
                          update(
                            "recommended_competency_weights",
                            content.recommended_competency_weights.filter(
                              (_, j) => j !== i
                            )
                          )
                        }
                        className="text-outline hover:text-error transition-colors pt-2"
                      >
                        <span className="material-symbols-outlined text-[18px]">close</span>
                      </button>
                    )}
                  </div>
                ))}
                {content.recommended_competency_weights.length === 0 && (
                  <p className="text-body-main text-outline">
                    No competency weights on this version.
                  </p>
                )}
              </div>
            </SectionShell>

            {/* Interview stages */}
            <SectionShell icon="stairs" label="Recommended Interview Stages">
              <div className="space-y-3">
                {content.recommended_interview_stages.map((st, i) => (
                  <div
                    key={i}
                    className="grid grid-cols-1 md:grid-cols-[180px_1fr_180px_32px] gap-2 items-start"
                  >
                    <input
                      type="text"
                      value={st.stage}
                      onChange={(e) =>
                        update(
                          "recommended_interview_stages",
                          content.recommended_interview_stages.map((row, j) =>
                            j === i ? { ...row, stage: e.target.value } : row
                          )
                        )
                      }
                      disabled={readOnly}
                      placeholder="Stage"
                      className={smallInputClass}
                    />
                    <textarea
                      value={st.focus}
                      onChange={(e) =>
                        update(
                          "recommended_interview_stages",
                          content.recommended_interview_stages.map((row, j) =>
                            j === i ? { ...row, focus: e.target.value } : row
                          )
                        )
                      }
                      disabled={readOnly}
                      rows={2}
                      placeholder="Evidence focus"
                      className={textareaClass}
                    />
                    <input
                      type="text"
                      value={st.format}
                      onChange={(e) =>
                        update(
                          "recommended_interview_stages",
                          content.recommended_interview_stages.map((row, j) =>
                            j === i ? { ...row, format: e.target.value } : row
                          )
                        )
                      }
                      disabled={readOnly}
                      placeholder="Format"
                      className={smallInputClass}
                    />
                    {!readOnly && (
                      <button
                        type="button"
                        aria-label="Remove stage"
                        onClick={() =>
                          update(
                            "recommended_interview_stages",
                            content.recommended_interview_stages.filter(
                              (_, j) => j !== i
                            )
                          )
                        }
                        className="text-outline hover:text-error transition-colors pt-2"
                      >
                        <span className="material-symbols-outlined text-[18px]">close</span>
                      </button>
                    )}
                  </div>
                ))}
                {!readOnly && (
                  <AddRowButton
                    label="Add stage"
                    onClick={() =>
                      update("recommended_interview_stages", [
                        ...content.recommended_interview_stages,
                        {
                          stage: "",
                          focus: "",
                          format: "",
                        } satisfies InterviewStageRecommendation,
                      ])
                    }
                  />
                )}
              </div>
            </SectionShell>
          </div>

          {/* Right rail: actions + version history */}
          <aside className="space-y-4 lg:sticky lg:top-6 self-start">
            <div className="bg-surface-container-low border border-outline-variant p-4 space-y-2">
              <span className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
                Actions
              </span>
              {isDraft && (
                <>
                  <RailButton
                    icon="save"
                    label={isDirty ? "Save Draft *" : "Save Draft"}
                    onClick={handleSave}
                    disabled={isPending || !isDirty}
                  />
                  <RailButton
                    icon="verified_user"
                    label="Approve Version"
                    onClick={handleApprove}
                    disabled={isPending}
                    emphasis
                  />
                </>
              )}
              <RailButton
                icon="library_add"
                label="Snapshot New Version"
                onClick={handleNewVersion}
                disabled={isPending}
              />
              <RailButton
                icon="neurology"
                label="Regenerate (AI)"
                onClick={handleRegenerate}
                disabled={isPending || activeGeneration != null}
              />
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
                      v.id === profileId
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

function AddRowButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1.5 font-mono-label text-mono-label uppercase tracking-widest text-primary hover:brightness-110 transition-all"
    >
      <span className="material-symbols-outlined text-[16px]">add</span>
      {label}
    </button>
  );
}

function RailButton({
  icon,
  label,
  onClick,
  disabled,
  emphasis = false,
}: {
  icon: string;
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
      <span className="material-symbols-outlined text-[16px]">{icon}</span>
      {label}
    </button>
  );
}
