"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ASSESSMENT_DISCLAIMER,
  EVIDENCE_RATINGS,
  EVIDENCE_RATING_LABELS,
  PROFILE_STATUS_LABELS,
  type AssessmentContent,
  type CompetencyAssessment,
  type EvidenceRating,
  type ProfileStatus,
} from "@/lib/executive/types";
import {
  computeEvidenceRollup,
  computeWeightedEvidenceStrength,
  type OperationalWeight,
} from "@/lib/executive/assessment-scoring";
import { formatTimestampUtc } from "@/lib/executive/format";
import {
  IconArrowLeft,
  IconBalance,
  IconPlus,
  IconSave,
  IconVerified,
  type IconProps,
} from "@/components/icons";
import {
  approveAssessment,
  createAssessmentNewVersion,
  saveAssessmentDraft,
} from "./actions";

export type AssessmentVersionSummary = {
  id: string;
  version: number;
  status: ProfileStatus;
};

type Props = {
  searchId: string;
  candidateId: string;
  candidateName: string;
  assessmentId: string;
  version: number;
  status: ProfileStatus;
  approvedAt: string | null;
  approverName: string | null;
  updatedAt: string;
  content: AssessmentContent;
  versions: AssessmentVersionSummary[];
};

const textareaClass =
  "w-full bg-surface-container-lowest border border-outline-variant px-3 py-2 text-body-main text-on-surface placeholder:text-outline-variant outline-none focus:border-primary transition-colors resize-y disabled:opacity-60 disabled:cursor-not-allowed";

const RATING_ACCENT: Record<EvidenceRating, string> = {
  strong: "border-primary/60 text-primary bg-primary-container/20",
  moderate: "border-secondary-fixed-dim/60 text-secondary-fixed-dim bg-surface-container",
  limited: "border-outline-variant text-on-surface-variant bg-surface-container",
  none: "border-outline-variant text-outline bg-surface-container-lowest",
};

/** Labels + weights for the competency rows, derived from the stored (server-
 * computed) rollup so ordering and weighting match the operational source of
 * truth. Falls back to the recorded assessments if a legacy row lacks a rollup. */
function deriveWeights(content: AssessmentContent): OperationalWeight[] {
  if (content.evidence_rollup.length > 0) {
    return content.evidence_rollup.map((r) => ({
      competency_key: r.competency_key,
      label: r.label,
      weight: r.weight,
    }));
  }
  return content.competency_assessments.map((c) => ({
    competency_key: c.competency_key,
    label: c.competency_key,
    weight: 0,
  }));
}

export function AssessmentEditor({
  searchId,
  candidateId,
  candidateName,
  assessmentId,
  version,
  status,
  approvedAt,
  approverName,
  updatedAt,
  content: initialContent,
  versions,
}: Props) {
  const router = useRouter();
  const [content, setContent] = useState<AssessmentContent>(initialContent);
  const [isDirty, setIsDirty] = useState(false);
  const [isPending, startTransition] = useTransition();

  const isDraft = status === "draft";
  const readOnly = !isDraft || isPending;

  const weights = useMemo(() => deriveWeights(initialContent), [initialContent]);
  const labelByKey = useMemo(() => {
    const m = new Map<string, { label: string; weight: number }>();
    for (const w of weights) m.set(w.competency_key, { label: w.label, weight: w.weight });
    return m;
  }, [weights]);

  // Live evidence strength recomputed from current edits for immediate feedback.
  // The server recomputes authoritatively on save.
  const liveStrength = useMemo(() => {
    const rollup = computeEvidenceRollup(weights, content.competency_assessments);
    return computeWeightedEvidenceStrength(rollup);
  }, [weights, content.competency_assessments]);

  const updateCompetency = (
    index: number,
    patch: Partial<CompetencyAssessment>
  ) => {
    setContent((prev) => ({
      ...prev,
      competency_assessments: prev.competency_assessments.map((c, i) =>
        i === index ? { ...c, ...patch } : c
      ),
    }));
    setIsDirty(true);
  };

  const updateSummary = (value: string) => {
    setContent((prev) => ({ ...prev, overall_summary: value }));
    setIsDirty(true);
  };

  const run = (label: string, fn: () => Promise<void>) => {
    startTransition(async () => {
      try {
        await fn();
        router.refresh();
      } catch (e) {
        const msg = e instanceof Error ? e.message : `${label} failed.`;
        console.error(`[assessment] ${label} failed:`, e);
        toast.error(msg);
      }
    });
  };

  const handleSave = () =>
    run("Save", async () => {
      await saveAssessmentDraft(assessmentId, searchId, candidateId, content);
      setIsDirty(false);
      toast.success("Draft saved.");
    });

  const handleNewVersion = () =>
    run("New version", async () => {
      const res = await createAssessmentNewVersion(searchId, candidateId, content);
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
        await saveAssessmentDraft(assessmentId, searchId, candidateId, content);
        setIsDirty(false);
      }
      await approveAssessment(assessmentId, searchId, candidateId);
      toast.success(`Version ${version} approved.`);
    });
  };

  const strengthPct = Math.round(liveStrength * 100);

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
            Assessment V{String(version).padStart(2, "0")}
          </span>
        </div>

        <header className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-h1 text-h1">
              Assessment{" "}
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
            human-authored · updated {formatTimestampUtc(updatedAt)}
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
              {ASSESSMENT_DISCLAIMER}
            </p>
          </div>
        </header>

        {!isDraft && (
          <div className="border border-outline-variant bg-surface-container px-4 py-3 flex flex-wrap items-center justify-between gap-4">
            <p className="text-body-main text-on-surface-variant">
              This version is {status} and immutable. Create a new version to make
              changes.
            </p>
            <div className="flex shrink-0 flex-wrap items-center gap-3">
              {/*
                The approved assessment is the last of the three records the
                report compiles from, so this is where the recruiter is when
                the document becomes available. Shown on approval only — from a
                draft it would lead straight to the gate.
              */}
              {status === "approved" && (
                <Link
                  href={`/app/executive-intelligence/searches/${searchId}/candidates/${candidateId}/report`}
                  className="px-4 py-2 bg-primary-container text-on-primary-container font-mono-label text-mono-label uppercase tracking-widest hover:brightness-110 transition-all"
                >
                  Open Report
                </Link>
              )}
              <button
                type="button"
                onClick={handleNewVersion}
                disabled={isPending}
                className="px-4 py-2 border border-primary-container/70 text-primary font-mono-label text-mono-label uppercase tracking-widest hover:bg-surface-container-low transition-colors disabled:opacity-60"
              >
                New Version From This
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-6">
          <div className="space-y-4">
            {/* Overall summary */}
            <section className="bg-surface-container-low border border-outline-variant p-5 space-y-3">
              <span className="font-mono-label text-mono-label text-secondary-fixed-dim uppercase tracking-widest">
                # Overall Evidence Summary
              </span>
              <textarea
                value={content.overall_summary}
                onChange={(e) => updateSummary(e.target.value)}
                disabled={readOnly}
                rows={3}
                placeholder="Synthesis of the evidence gathered — not a verdict or recommendation."
                className={textareaClass}
                aria-label="Overall evidence summary"
              />
            </section>

            {/* Per-competency evidence rows */}
            {content.competency_assessments.map((row, i) => {
              const meta = labelByKey.get(row.competency_key);
              return (
                <section
                  key={row.competency_key}
                  className="bg-surface-container-low border border-outline-variant p-5 space-y-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="text-headline-md text-on-surface">
                        {meta?.label ?? row.competency_key}
                      </h2>
                      {meta && (
                        <span className="font-mono-label text-mono-label text-outline uppercase tracking-wider">
                          weight {meta.weight}
                        </span>
                      )}
                    </div>
                  </div>

                  {row.source_stages.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 items-center">
                      <span className="font-mono-label text-mono-label text-outline uppercase tracking-widest mr-1">
                        Assessed in:
                      </span>
                      {row.source_stages.map((s) => (
                        <span
                          key={s}
                          className="font-mono-label text-mono-label uppercase tracking-wider px-2 py-0.5 border border-outline-variant text-on-surface-variant"
                        >
                          {s}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Evidence rating — 4-level scale */}
                  <div
                    className="flex flex-wrap gap-2"
                    role="radiogroup"
                    aria-label={`Evidence rating for ${meta?.label ?? row.competency_key}`}
                  >
                    {EVIDENCE_RATINGS.map((r) => {
                      const active = row.rating === r;
                      return (
                        <button
                          key={r}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          onClick={() => updateCompetency(i, { rating: r })}
                          disabled={readOnly}
                          className={`px-3 py-1.5 border font-mono-label text-mono-label uppercase tracking-wider transition-all disabled:cursor-not-allowed ${
                            active
                              ? RATING_ACCENT[r]
                              : "border-outline-variant text-outline hover:text-on-surface-variant disabled:opacity-60"
                          }`}
                        >
                          {EVIDENCE_RATING_LABELS[r]}
                        </button>
                      );
                    })}
                  </div>

                  <label className="block space-y-1">
                    <span className="font-mono-label text-mono-label text-outline uppercase tracking-widest flex items-center gap-1.5">
                      Observed Evidence
                    </span>
                    <textarea
                      value={row.evidence}
                      onChange={(e) => updateCompetency(i, { evidence: e.target.value })}
                      disabled={readOnly}
                      rows={2}
                      placeholder="What was observed that supports this rating — specific, behavioral, evidence-based."
                      className={textareaClass}
                    />
                  </label>
                </section>
              );
            })}

            {content.competency_assessments.length === 0 && (
              <p className="text-body-main text-outline">
                No competencies on this version.
              </p>
            )}
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
            </div>

            {/* Evidence strength — coverage of the weighted competencies, NOT a
                score of the candidate. */}
            <div className="bg-surface-container-low border border-outline-variant p-4 space-y-3">
              <span className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
                Evidence Strength
              </span>
              <div className="flex items-baseline gap-2">
                <span className="text-h1 font-h1 tabular-nums text-on-surface">
                  {strengthPct}%
                </span>
                <span className="font-mono-label text-mono-label text-outline uppercase tracking-wider">
                  weighted coverage
                </span>
              </div>
              <div className="h-1.5 w-full bg-surface-container-highest/50 overflow-hidden">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${strengthPct}%` }}
                />
              </div>
              <p className="text-body-main text-on-surface-variant">
                How much of the role&rsquo;s weighted competencies have supporting
                evidence recorded. This measures evidence coverage, not the
                candidate&rsquo;s quality, and is not a recommendation.
              </p>
              <div className="space-y-1 border-t border-outline-variant/40 pt-2">
                {content.competency_assessments.map((row) => {
                  const meta = labelByKey.get(row.competency_key);
                  return (
                    <div
                      key={row.competency_key}
                      className="flex items-center justify-between gap-2"
                    >
                      <span className="text-body-main text-on-surface-variant truncate">
                        {meta?.label ?? row.competency_key}
                      </span>
                      <span
                        className={`font-mono-label text-mono-label uppercase tracking-wider shrink-0 ${
                          row.rating === "none" ? "text-outline" : "text-on-surface"
                        }`}
                      >
                        {EVIDENCE_RATING_LABELS[row.rating]}
                      </span>
                    </div>
                  );
                })}
              </div>
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
                      v.id === assessmentId
                        ? "bg-surface-container text-on-surface"
                        : "text-on-surface-variant"
                    }`}
                  >
                    <span>V{String(v.version).padStart(2, "0")}</span>
                    <span className={v.status === "approved" ? "text-primary" : "text-outline"}>
                      {v.status}
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
