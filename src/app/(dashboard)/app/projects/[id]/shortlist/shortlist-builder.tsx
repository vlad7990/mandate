"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { BreadcrumbRail } from "@/components/ui/breadcrumb-rail";
import { MastHead } from "@/components/ui/mast-head";
import { StatusChip, type ChipTone } from "@/components/ui/status-chip";
import { TierComparison } from "@/components/ui/tier-comparison";
import type { Tier } from "@/lib/ranking/tiers";
import {
  IconArrowDown,
  IconArrowRight,
  IconArrowUp,
  IconClose,
  IconCopy,
  IconDocument,
  IconPlus,
  IconRefresh,
  IconSave,
  IconSend,
  IconSpark,
} from "@/components/icons";
import {
  type Archetype,
  type FitDimensions,
  type PipelineStage,
} from "@/lib/ai/cv-parsing";
import {
  reportToCopyText,
  type ShortlistReport,
} from "@/lib/ai/shortlist-report";
import {
  addCandidateAction,
  generateReportAction,
  moveCandidateAction,
  removeCandidateAction,
  saveNarrativeAction,
  setSlateSizeAction,
  submitShortlistAction,
} from "./actions";

export type PoolCandidate = {
  id: string;
  full_name: string;
  current_title: string | null;
  current_company: string | null;
  archetype: Archetype | null;
  pipeline_stage: PipelineStage;
  rank: number | null;
  overall: number | null;
  tier: string | null;
  /** Recruiter override tier from candidates.recruiter_assessment. */
  recruiter_tier: string | null;
  fit_dimensions: FitDimensions | null;
  headline: string | null;
};

type Props = {
  projectId: string;
  roleTitle: string;
  companyName: string;
  pool: PoolCandidate[];
  slate: PoolCandidate[];
  slateSize: number;
  narrative: string;
  report: ShortlistReport | null;
  submittedAt: string | null;
};

const SLATE_PRESETS = [
  { value: 3, label: "Top 3" },
  { value: 5, label: "Top 5" },
];

const FIT_DIMENSION_LABELS: Record<keyof FitDimensions, string> = {
  technical: "Technical",
  domain: "Domain",
  leadership: "Leadership",
  regulatory: "Regulatory",
  transformation: "Transformation",
};

const ARCHETYPE_TONE: Record<Archetype, ChipTone> = {
  Builder: "primary",
  Operator: "secondary",
  Transformer: "warn",
  Infrastructure: "neutral",
};

export function ShortlistBuilder({
  projectId,
  roleTitle,
  companyName,
  pool,
  slate,
  slateSize,
  narrative: serverNarrative,
  report,
  submittedAt,
}: Props) {
  const router = useRouter();
  const [narrative, setNarrative] = useState(serverNarrative);
  const [narrativePending, startNarrativeSave] = useTransition();
  const [mutationPending, startMutation] = useTransition();
  const [reportPending, startReportGen] = useTransition();
  const [submitPending, startSubmit] = useTransition();
  const [customSize, setCustomSize] = useState<string>(
    SLATE_PRESETS.some((p) => p.value === slateSize) ? "" : String(slateSize)
  );

  // Local narrative state is initialised from the server prop once and
  // stays local thereafter. We don't sync from the server prop on
  // subsequent renders — that would silently overwrite the recruiter's
  // unsaved edits. If you need cross-tab sync, refresh the page.

  const slateIds = new Set(slate.map((c) => c.id));
  const remainingPool = pool.filter((c) => !slateIds.has(c.id));
  const slateFull = slate.length >= slateSize;

  const runAction = (
    fn: () => Promise<void>,
    onError: string,
    starter: typeof startMutation = startMutation
  ) => {
    starter(async () => {
      try {
        await fn();
        router.refresh();
      } catch (err) {
        const msg = err instanceof Error ? err.message : onError;
        console.error(`[shortlist] ${onError}:`, err);
        toast.error(msg);
      }
    });
  };

  const handleAdd = (candidateId: string) => {
    if (submittedAt) {
      toast.error("Shortlist already submitted. Re-open to edit (future).");
      return;
    }
    runAction(
      () => addCandidateAction(projectId, candidateId),
      "Add to slate failed"
    );
  };

  const handleRemove = (candidateId: string) => {
    runAction(
      () => removeCandidateAction(projectId, candidateId),
      "Remove from slate failed"
    );
  };

  const handleMove = (candidateId: string, direction: "up" | "down") => {
    runAction(
      () => moveCandidateAction(projectId, candidateId, direction),
      "Reorder failed"
    );
  };

  const handlePresetSize = (size: number) => {
    setCustomSize("");
    runAction(
      () => setSlateSizeAction(projectId, size),
      "Slate size update failed"
    );
  };

  const handleCustomSize = () => {
    const n = Number(customSize);
    if (!Number.isFinite(n) || n < 1 || n > 10) {
      toast.error("Custom slate size must be between 1 and 10.");
      return;
    }
    runAction(
      () => setSlateSizeAction(projectId, n),
      "Slate size update failed"
    );
  };

  const handleSaveNarrative = () => {
    if (narrative === serverNarrative) {
      toast.info("No changes to save.");
      return;
    }
    runAction(
      () => saveNarrativeAction(projectId, narrative),
      "Narrative save failed",
      startNarrativeSave
    );
  };

  const handleGenerateReport = () => {
    if (slate.length === 0) {
      toast.error("Add candidates to the slate first.");
      return;
    }
    runAction(
      async () => {
        // Save narrative first if dirty so the AI prompt sees it.
        if (narrative !== serverNarrative) {
          await saveNarrativeAction(projectId, narrative);
        }
        await generateReportAction(projectId);
      },
      "Report generation failed",
      startReportGen
    );
  };

  const handleSubmit = () => {
    if (slate.length === 0) {
      toast.error("Slate is empty.");
      return;
    }
    runAction(
      async () => {
        if (narrative !== serverNarrative) {
          await saveNarrativeAction(projectId, narrative);
        }
        await submitShortlistAction(projectId);
        toast.success("Slate submitted. Candidates advanced to 'submitted'.");
      },
      "Submit failed",
      startSubmit
    );
  };

  const handleCopyReport = async () => {
    if (!report) return;
    try {
      const text = reportToCopyText(report, {
        role_title: roleTitle,
        company_name: companyName,
        recruiter_narrative: narrative,
      });
      await navigator.clipboard.writeText(text);
      toast.success("Report copied to clipboard.");
    } catch (err) {
      console.error("[shortlist] copy failed:", err);
      toast.error("Could not copy to clipboard.");
    }
  };

  const wordCount = narrative.trim()
    ? narrative.trim().split(/\s+/).length
    : 0;

  return (
    <div className="min-h-full bg-surface text-on-surface">
      <div className="max-w-[1600px] mx-auto px-6 py-6 space-y-5">
        <BreadcrumbRail
          segments={[
            { label: "Mandate", href: "/app/home" },
            { label: roleTitle, href: `/app/projects/${projectId}`, maxChars: 32 },
            { label: "Shortlist" },
          ]}
        />

        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-outline-variant/40 pb-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <StatusChip
                tone={submittedAt ? "secondary" : "primary"}
                intensity="filled"
                dot
                pulse={!submittedAt}
              >
                {submittedAt ? "Submitted" : "Active Slate"}
              </StatusChip>
              <span className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
                {companyName.toUpperCase()}
              </span>
            </div>
            <h1 className="font-h1 text-h1 text-on-surface tracking-tight">
              {roleTitle}
            </h1>
            <p className="font-mono-label text-mono-label text-on-surface-variant uppercase tracking-widest tabular-nums">
              Slate: <span className="text-primary">
                {String(slate.length).padStart(2, "0")}/{String(slateSize).padStart(2, "0")}
              </span>{" "}
              · {String(pool.length).padStart(2, "0")} ranked available
              {submittedAt ? ` · submitted ${formatRelative(submittedAt)}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={handleGenerateReport}
              disabled={slate.length === 0 || reportPending || mutationPending}
              aria-busy={reportPending ? true : undefined}
              className="px-3 py-1.5 border border-outline-variant text-on-surface-variant font-mono-label text-mono-label uppercase tracking-widest hover:border-primary hover:text-primary transition-colors flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              {reportPending ? (
                <IconRefresh size={14} className="animate-spin" />
              ) : (
                <IconSpark size={14} />
              )}
              {reportPending ? "Generating" : report ? "Regenerate Report" : "Generate Report"}
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={
                slate.length === 0 || submitPending || mutationPending
              }
              aria-busy={submitPending ? true : undefined}
              className="px-3 py-1.5 bg-primary-container text-on-primary-container font-mono-label text-mono-label uppercase tracking-widest hover:brightness-110 active:scale-[0.98] transition-[filter,transform] flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              {submitPending ? (
                <IconRefresh size={14} className="animate-spin" />
              ) : (
                <IconSend size={14} />
              )}
              {submitPending
                ? "Submitting"
                : submittedAt
                  ? "Re-submit"
                  : "Finalize Submission"}
            </button>
          </div>
        </header>

        {/* Slate-size segmented control. Buttons share borders so the
            row reads as a single instrument switch rather than three
            stand-alone chips. Custom-N input docks to the right edge as
            a manual override. */}
        <div className="flex items-center gap-3 flex-wrap">
          <span className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
            Slate size
          </span>
          <div
            role="group"
            aria-label="Slate size presets"
            className="inline-flex border border-outline-variant divide-x divide-outline-variant"
          >
            {SLATE_PRESETS.map((preset) => {
              const active = slateSize === preset.value && customSize === "";
              return (
                <button
                  key={preset.value}
                  type="button"
                  onClick={() => handlePresetSize(preset.value)}
                  disabled={mutationPending}
                  aria-pressed={active}
                  className={cn(
                    "px-3 py-1.5 font-mono-label text-mono-label uppercase tracking-widest transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-primary disabled:cursor-not-allowed",
                    active
                      ? "bg-primary-container/15 text-primary"
                      : "text-on-surface-variant hover:bg-surface-container-high hover:text-primary"
                  )}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
          <span className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
            Custom
          </span>
          <div className="inline-flex border border-outline-variant divide-x divide-outline-variant">
            <input
              type="number"
              min={1}
              max={10}
              value={customSize}
              onChange={(e) => setCustomSize(e.target.value)}
              placeholder="N"
              aria-label="Custom slate size"
              className="w-14 bg-surface-container-lowest px-2 py-1.5 font-mono-data text-body-main text-on-surface tabular-nums focus:outline-none focus:bg-surface-container-low transition-colors"
            />
            <button
              type="button"
              onClick={handleCustomSize}
              disabled={!customSize || mutationPending}
              className="px-3 py-1.5 text-on-surface-variant font-mono-label text-mono-label uppercase tracking-widest hover:bg-surface-container-high hover:text-primary transition-colors disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-primary"
            >
              Apply
            </button>
          </div>
        </div>

        {/* Two columns: pool + slate */}
        <div className="grid grid-cols-12 gap-4">
          <section className="col-span-12 lg:col-span-4 bg-surface-container border border-outline-variant p-3 flex flex-col gap-3 h-[calc(100vh-360px)] min-h-[480px]">
            <header className="flex items-center justify-between">
              <h3 className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
                Qualified Pool ({remainingPool.length})
              </h3>
              <span className="font-mono-label text-mono-label text-outline uppercase tracking-wider">
                Sorted by rank
              </span>
            </header>
            <ul className="flex flex-col gap-2 overflow-y-auto pr-1 flex-1">
              {remainingPool.length === 0 ? (
                <li className="text-body-main text-outline italic px-2 py-4">
                  All ranked candidates are in the slate already, or no
                  ranked candidates yet. Add more candidates from{" "}
                  <Link
                    href={`/app/projects/${projectId}/candidates`}
                    prefetch={false}
                    className="text-primary hover:underline"
                  >
                    /candidates
                  </Link>
                  .
                </li>
              ) : (
                remainingPool.map((c) => (
                  <PoolCard
                    key={c.id}
                    candidate={c}
                    onAdd={() => handleAdd(c.id)}
                    disabled={mutationPending || slateFull}
                  />
                ))
              )}
            </ul>
            {slateFull && (
              <p className="font-mono-label text-mono-label text-tertiary uppercase tracking-wider">
                Slate full · remove a candidate or increase slate size
              </p>
            )}
          </section>

          <section className="col-span-12 lg:col-span-8">
            <div className="bg-surface-container-low border border-outline-variant p-4 flex flex-col gap-3 min-h-[400px]">
              <MastHead
                tone="secondary"
                label={
                  <span className="flex items-baseline gap-2 tabular-nums">
                    Final Shortlist
                    <span className="text-outline">· Top {slateSize}</span>
                  </span>
                }
                meta={
                  <span className="flex items-center gap-1.5">
                    <span
                      className="w-1.5 h-1.5 rounded-full bg-secondary-fixed-dim animate-pulse"
                      aria-hidden
                    />
                    Live comparison mode
                  </span>
                }
              />
              <p className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
                Add from the pool. Reorder with up/down arrows.
              </p>
              <div
                className={cn(
                  "grid gap-3 flex-1",
                  slateSize === 1
                    ? "grid-cols-1"
                    : slateSize === 2
                      ? "grid-cols-1 md:grid-cols-2"
                      : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
                )}
              >
                {Array.from({ length: slateSize }).map((_, i) => {
                  const candidate = slate[i] ?? null;
                  if (!candidate) {
                    return <EmptySlot key={`slot-${i}`} index={i + 1} />;
                  }
                  return (
                    <SlateCard
                      key={candidate.id}
                      projectId={projectId}
                      candidate={candidate}
                      slot={i + 1}
                      total={slate.length}
                      onRemove={() => handleRemove(candidate.id)}
                      onMoveUp={() => handleMove(candidate.id, "up")}
                      onMoveDown={() => handleMove(candidate.id, "down")}
                      disabled={mutationPending}
                    />
                  );
                })}
              </div>
            </div>

            {/* Narrative + finalize */}
            <div className="bg-surface-container border border-outline-variant p-4 mt-3 space-y-3">
              <MastHead
                tone="primary"
                label="Submission Narrative"
                meta={`${wordCount} words`}
              />
              <div className="relative">
                <span className="absolute left-3 top-3 font-mono-data text-primary">
                  &gt;
                </span>
                <textarea
                  value={narrative}
                  onChange={(e) => setNarrative(e.target.value)}
                  rows={5}
                  placeholder="Strategic summary for the hiring manager — why this slate covers the role's must-haves and where the trade-offs land."
                  className="w-full bg-surface-container-lowest border border-outline-variant focus:border-primary focus:ring-0 text-on-surface font-mono-data text-body-main p-3 pl-8 outline-none transition-colors resize-y"
                />
                <div className="flex justify-between items-center mt-2 px-1">
                  <span className="font-mono-label text-mono-label text-outline uppercase tracking-wider">
                    Auto-saved on Generate / Submit
                  </span>
                  <button
                    type="button"
                    onClick={handleSaveNarrative}
                    disabled={
                      narrative === serverNarrative || narrativePending
                    }
                    aria-busy={narrativePending ? true : undefined}
                    className="font-mono-label text-mono-label text-primary uppercase tracking-widest hover:brightness-110 transition-colors flex items-center gap-1.5 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {narrativePending ? (
                      <IconRefresh size={14} className="animate-spin" />
                    ) : (
                      <IconSave size={14} />
                    )}
                    {narrativePending ? "Saving" : "Save Draft"}
                  </button>
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* Generated report */}
        {report && (
          <ReportPreview
            report={report}
            roleTitle={roleTitle}
            companyName={companyName}
            onCopy={handleCopyReport}
          />
        )}
      </div>
    </div>
  );
}

function PoolCard({
  candidate,
  onAdd,
  disabled,
}: {
  candidate: PoolCandidate;
  onAdd: () => void;
  disabled?: boolean;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onAdd}
        disabled={disabled}
        className="w-full bg-surface-container-high border border-outline-variant p-3 hover:border-primary transition-colors group disabled:opacity-50 disabled:cursor-not-allowed text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <div className="flex justify-between items-start mb-2">
          <div className="flex items-start gap-2 min-w-0">
            <span className="w-9 h-9 rounded bg-surface-container border border-outline-variant flex items-center justify-center font-mono-data text-mono-data text-on-surface uppercase shrink-0">
              {initials(candidate.full_name)}
            </span>
            <div className="min-w-0">
              <div className="text-on-surface text-body-main font-semibold truncate">
                {candidate.full_name}
              </div>
              <div className="font-mono-data text-body-main text-outline truncate">
                {candidate.current_title ?? "—"}
                {candidate.current_company ? ` @ ${candidate.current_company}` : ""}
              </div>
            </div>
          </div>
          <span className="font-mono-label text-mono-label uppercase tracking-widest text-secondary-fixed-dim shrink-0 tabular-nums">
            #{String(candidate.rank ?? 0).padStart(2, "0")} ·{" "}
            {candidate.overall != null ? candidate.overall.toFixed(1) : "—"}
          </span>
        </div>
        {candidate.fit_dimensions && (
          <div className="grid grid-cols-5 gap-1 mt-3">
            {(
              ["technical", "domain", "leadership", "regulatory", "transformation"] as const
            ).map((d) => {
              const v = clamp10(candidate.fit_dimensions?.[d]);
              return (
                <span
                  key={d}
                  className="h-1 bg-surface-container-low overflow-hidden"
                  title={`${FIT_DIMENSION_LABELS[d]}: ${v}/10`}
                >
                  <span
                    className={cn(
                      "block h-full",
                      v >= 7
                        ? "bg-secondary-fixed-dim"
                        : v >= 4
                          ? "bg-primary"
                          : "bg-tertiary"
                    )}
                    style={{ width: `${(v / 10) * 100}%` }}
                  />
                </span>
              );
            })}
          </div>
        )}
        <div className="flex items-center justify-between mt-2 gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 flex-wrap">
            {candidate.archetype && (
              <StatusChip
                tone={ARCHETYPE_TONE[candidate.archetype]}
                intensity="soft"
              >
                {candidate.archetype}
              </StatusChip>
            )}
            <TierComparison
              aiTier={(candidate.tier as Tier | null) ?? null}
              recruiterTier={(candidate.recruiter_tier as Tier | null) ?? null}
              compact
            />
          </div>
          <span className="font-mono-label text-mono-label text-primary uppercase tracking-widest flex items-center gap-1 group-hover:translate-x-0.5 transition-transform">
            Add
            <IconPlus size={12} />
          </span>
        </div>
      </button>
    </li>
  );
}

function EmptySlot({ index }: { index: number }) {
  return (
    <div
      className="bg-surface-container-lowest border border-dashed border-outline-variant/70 flex flex-col items-center justify-center p-6 text-center min-h-[280px]"
      role="presentation"
    >
      <div className="w-12 h-12 border border-outline-variant flex items-center justify-center mb-4">
        <IconPlus size={20} className="text-outline" />
      </div>
      <span className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
        Assign Candidate
      </span>
      <span className="font-mono-data text-body-main text-outline mt-2 tabular-nums">
        SLOT_{String(index).padStart(2, "0")}_VACANT
      </span>
    </div>
  );
}

function SlateCard({
  projectId,
  candidate,
  slot,
  total,
  onRemove,
  onMoveUp,
  onMoveDown,
  disabled,
}: {
  projectId: string;
  candidate: PoolCandidate;
  slot: number;
  total: number;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  disabled?: boolean;
}) {
  return (
    <article className="bg-surface-container-low border border-outline-variant flex flex-col relative overflow-hidden group">
      <span
        className="absolute top-0 left-0 w-full h-0.5 bg-secondary-fixed-dim"
        aria-hidden
      />
      <div className="p-4 flex-1 space-y-4">
        <header className="flex justify-between items-start gap-2">
          <span
            className="w-11 h-11 bg-surface-container border border-outline-variant flex items-center justify-center font-mono-data text-mono-data text-on-surface uppercase shrink-0"
            aria-hidden
          >
            {initials(candidate.full_name)}
          </span>
          <div className="flex flex-col items-end gap-1.5">
            <span className="font-mono-label text-mono-label text-secondary-fixed-dim uppercase tracking-widest tabular-nums">
              Slot {String(slot).padStart(2, "0")}
            </span>
            <div
              className="inline-flex border border-outline-variant divide-x divide-outline-variant"
              role="group"
              aria-label={`Slate controls for ${candidate.full_name}`}
            >
              <button
                type="button"
                onClick={onMoveUp}
                disabled={disabled || slot === 1}
                aria-label={`Move ${candidate.full_name} up`}
                className="w-7 h-7 text-outline hover:text-primary hover:bg-surface-container-high transition-colors flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-primary"
              >
                <IconArrowUp size={14} />
              </button>
              <button
                type="button"
                onClick={onMoveDown}
                disabled={disabled || slot >= total}
                aria-label={`Move ${candidate.full_name} down`}
                className="w-7 h-7 text-outline hover:text-primary hover:bg-surface-container-high transition-colors flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-primary"
              >
                <IconArrowDown size={14} />
              </button>
              <button
                type="button"
                onClick={onRemove}
                disabled={disabled}
                aria-label={`Remove ${candidate.full_name} from slate`}
                className="w-7 h-7 text-outline hover:text-error hover:bg-error/10 transition-colors flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-error"
              >
                <IconClose size={14} />
              </button>
            </div>
          </div>
        </header>

        <div>
          <Link
            href={`/app/projects/${projectId}/candidates/${candidate.id}`}
            prefetch={false}
            className="font-h2 text-h2 text-on-surface leading-tight hover:text-primary transition-colors focus-visible:outline-none focus-visible:underline"
          >
            {candidate.full_name}
          </Link>
          <div className="font-mono-data text-body-main text-outline">
            {candidate.current_title ?? "—"}
            {candidate.current_company ? ` @ ${candidate.current_company}` : ""}
          </div>
        </div>

        {candidate.fit_dimensions && (
          <div className="space-y-2">
            {(
              ["leadership", "domain", "transformation"] as const
            ).map((d) => {
              const v = clamp10(candidate.fit_dimensions?.[d]);
              return (
                <div key={d} className="space-y-1">
                  <div className="flex justify-between font-mono-label text-mono-label text-outline uppercase tracking-wider">
                    <span>{FIT_DIMENSION_LABELS[d]}</span>
                    <span
                      className={cn(
                        "tabular-nums",
                        v >= 7 ? "text-secondary-fixed-dim" : "text-on-surface"
                      )}
                    >
                      {v.toFixed(1)}
                    </span>
                  </div>
                  <div className="h-1 bg-surface-container-low w-full overflow-hidden">
                    <span
                      className={cn(
                        "block h-full",
                        v >= 7
                          ? "bg-secondary-fixed-dim"
                          : v >= 4
                            ? "bg-primary"
                            : "bg-tertiary"
                      )}
                      style={{ width: `${(v / 10) * 100}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {candidate.headline && (
          <div className="border-t border-outline-variant/40 pt-3">
            <div className="font-mono-label text-mono-label text-outline uppercase tracking-widest mb-1">
              Key value prop
            </div>
            <p className="font-mono-data text-body-main text-on-surface-variant italic leading-snug">
              &ldquo;{candidate.headline}&rdquo;
            </p>
          </div>
        )}

        <div className="flex items-center justify-between font-mono-label text-mono-label text-outline uppercase tracking-widest pt-2 border-t border-outline-variant/40 gap-2 flex-wrap">
          <span className="tabular-nums">
            Rank #{String(candidate.rank ?? 0).padStart(2, "0")} ·{" "}
            {candidate.overall != null ? `${candidate.overall.toFixed(1)}/10` : "—"}
          </span>
          {candidate.archetype && (
            <StatusChip
              tone={ARCHETYPE_TONE[candidate.archetype]}
              intensity="soft"
            >
              {candidate.archetype}
            </StatusChip>
          )}
        </div>
        <div className="pt-2 border-t border-outline-variant/40">
          <TierComparison
            aiTier={(candidate.tier as Tier | null) ?? null}
            recruiterTier={(candidate.recruiter_tier as Tier | null) ?? null}
            compact
          />
        </div>
        <Link
          href={`/app/projects/${projectId}/candidates/${candidate.id}`}
          prefetch={false}
          className="font-mono-label text-mono-label text-primary uppercase tracking-widest flex items-center gap-1 hover:brightness-110 transition-colors focus-visible:outline-none focus-visible:underline"
        >
          View profile
          <IconArrowRight size={12} />
        </Link>
      </div>
    </article>
  );
}

function ReportPreview({
  report,
  roleTitle,
  companyName,
  onCopy,
}: {
  report: ShortlistReport;
  roleTitle: string;
  companyName: string;
  onCopy: () => void;
}) {
  return (
    <article className="bg-surface-container border border-outline-variant relative overflow-hidden">
      {/* Document accent — a thin primary band at the top sets the
          "submission deliverable" tone vs the rest of the working
          surface. */}
      <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-primary-container via-primary to-primary-container/40" />

      <header className="px-6 pt-6 pb-4 border-b border-outline-variant/60 flex items-start justify-between gap-3 flex-wrap">
        <div className="space-y-2 min-w-0">
          <div className="font-mono-label text-mono-label text-primary uppercase tracking-widest flex items-center gap-2">
            <IconDocument size={14} />
            Submission Document
          </div>
          <h2 className="font-h1 text-h1 text-on-surface tracking-tight">
            {roleTitle}
          </h2>
          <div className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
            {companyName} · {report.candidates.length} candidate{report.candidates.length === 1 ? "" : "s"} · drafted {new Date().toISOString().slice(0, 10)}
          </div>
        </div>
        <button
          type="button"
          onClick={onCopy}
          className="px-4 py-2 bg-primary-container text-on-primary-container font-mono-label text-mono-label uppercase tracking-widest hover:brightness-110 active:scale-[0.98] transition-all flex items-center gap-2 shrink-0"
        >
          <IconCopy size={14} />
          Copy Report
        </button>
      </header>

      <div className="px-6 py-5 space-y-6">
        {/* Executive summary as a blockquote-style block — pulls the
            recruiter's eye to the headline takeaway first. */}
        <section className="border-l-2 border-primary-container/60 pl-4 space-y-2">
          <div className="font-mono-label text-mono-label text-primary uppercase tracking-widest">
            Executive summary
          </div>
          <p className="text-h2 font-h2 text-on-surface leading-snug tracking-tight">
            {report.executive_summary}
          </p>
        </section>

        <section className="space-y-2">
          <MastHead
            tone="neutral"
            label="Slate rationale"
          />
          <p className="text-body-main text-on-surface-variant leading-relaxed">
            {report.slate_rationale}
          </p>
        </section>

        <section className="space-y-3">
          <MastHead
            tone="primary"
            label="Candidate briefs"
            meta={`${report.candidates.length} brief${report.candidates.length === 1 ? "" : "s"}`}
          />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {report.candidates.map((c) => (
              <CandidateBriefCard key={c.candidate_id} brief={c} />
            ))}
          </div>
        </section>

        {report.scenarios.length > 0 && (
          <section className="space-y-3">
            <MastHead
              tone="tertiary"
              label="Scenarios"
              meta={`${report.scenarios.length} trade-off${report.scenarios.length === 1 ? "" : "s"}`}
            />
            <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {report.scenarios.map((s, i) => (
                <li
                  key={i}
                  className="bg-surface-container-low border-l-2 border-tertiary/60 px-3 py-2"
                >
                  <div className="font-mono-label text-mono-label text-tertiary uppercase tracking-widest">
                    {s.headline}
                  </div>
                  <p className="text-body-main text-on-surface-variant mt-1 leading-snug">
                    {s.detail}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="bg-secondary-fixed-dim/5 border border-secondary-fixed-dim/40 px-4 py-3 flex items-start gap-3">
          <IconArrowRight
            size={18}
            className="text-secondary-fixed-dim mt-0.5 shrink-0"
          />
          <div className="min-w-0">
            <div className="font-mono-label text-mono-label text-secondary-fixed-dim uppercase tracking-widest">
              Recommended next step
            </div>
            <p className="text-body-main text-on-surface mt-1">{report.next_step}</p>
          </div>
        </section>
      </div>
    </article>
  );
}

function CandidateBriefCard({
  brief,
}: {
  brief: ShortlistReport["candidates"][number];
}) {
  const recTone: ChipTone =
    brief.recommendation === "advance"
      ? "secondary"
      : brief.recommendation === "pause"
        ? "warn"
        : "neutral";
  return (
    <article className="bg-surface-container-low border border-outline-variant p-4 space-y-3">
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h4 className="text-on-surface text-body-main font-semibold truncate">
            {brief.full_name}
          </h4>
          <p className="font-mono-label text-mono-label text-outline uppercase tracking-widest tabular-nums">
            {brief.rank != null ? `#${String(brief.rank).padStart(2, "0")}` : "—"}
            {brief.overall_score != null ? ` · ${brief.overall_score.toFixed(1)}/10` : ""}
          </p>
        </div>
        <StatusChip tone={recTone} intensity="filled">
          {brief.recommendation}
        </StatusChip>
      </header>
      <p className="text-body-main text-on-surface-variant leading-snug">
        {brief.headline}
      </p>
      <div className="space-y-1">
        <h5 className="font-mono-label text-mono-label text-secondary-fixed-dim uppercase tracking-widest">
          Strengths
        </h5>
        <ul className="space-y-0.5">
          {brief.strengths.map((s, i) => (
            <li
              key={i}
              className="font-mono-data text-body-main text-on-surface-variant flex gap-2"
            >
              <span className="text-secondary-fixed-dim">+</span>
              {s}
            </li>
          ))}
        </ul>
      </div>
      <div className="space-y-1">
        <h5 className="font-mono-label text-mono-label text-error uppercase tracking-widest">
          Risks
        </h5>
        <ul className="space-y-0.5">
          {brief.risks.map((r, i) => (
            <li
              key={i}
              className="font-mono-data text-body-main text-on-surface-variant flex gap-2"
            >
              <span className="text-error">!</span>
              {r}
            </li>
          ))}
        </ul>
      </div>
      <div className="border-t border-outline-variant/40 pt-2">
        <h5 className="font-mono-label text-mono-label text-outline uppercase tracking-widest mb-1">
          Trade-off
        </h5>
        <p className="font-mono-data text-body-main text-on-surface-variant leading-snug italic">
          {brief.tradeoff}
        </p>
      </div>
    </article>
  );
}

function clamp10(v: number | null | undefined): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(10, v));
}

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase() ?? "")
      .join("") || "??"
  );
}

function formatRelative(iso: string): string {
  const t = new Date(iso).getTime();
  const diffMs = Date.now() - t;
  const min = Math.round(diffMs / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hrs = Math.round(min / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toISOString().slice(0, 10);
}
