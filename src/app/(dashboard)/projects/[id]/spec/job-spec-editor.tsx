"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  diffSections,
  SECTION_DEFS,
  type JobSpecSections,
  type SectionDef,
  type SectionKey,
} from "@/lib/ai/job-spec-analysis";
import type { CalibrationModel, CompanyContext } from "@/lib/ai/role-analysis";
import { SAVE_DRAFT_FINALIZED_MESSAGE } from "@/lib/constants/job-spec-constants";
import {
  createNewVersion,
  markAsFinal,
  markGenerationTimedOut,
  requestRegenerate,
  saveDraft,
} from "./actions";
import type { SpecVersionSummary } from "./page";

type Props = {
  projectId: string;
  roleTitle: string;
  companyName: string;
  oneLineInput: string;
  currentSpecId: string;
  currentVersion: number;
  currentIsFinal: boolean;
  currentUpdatedAt: string;
  sections: JobSpecSections;
  finalSections: JobSpecSections | null;
  finalVersion: number | null;
  finalSpecId: string | null;
  versions: SpecVersionSummary[];
  companyContext: Partial<CompanyContext>;
  calibration: Partial<CalibrationModel>;
  /**
   * A generation in flight for this project (latest is_generating=true row).
   * Surfaced as a polling banner above the editor — the editor body keeps
   * showing the latest healthy spec underneath. When generation lands the
   * next refresh promotes it to editorRow and the banner clears.
   */
  activeGeneration: { specId: string; version: number } | null;
  /**
   * A failed generation that hasn't been resolved (latest row with
   * generation_error set, when an editor row is also available). Surfaced
   * as a dismissible banner with a retry CTA — losing this row to a
   * dismiss keeps the editor accessible without forcing the user into the
   * full retry view.
   */
  failedGeneration: {
    specId: string;
    version: number;
    error: string;
  } | null;
};

type Tab = "draft" | "history";

export function JobSpecEditor({
  projectId,
  roleTitle,
  companyName,
  oneLineInput,
  currentSpecId,
  currentVersion,
  currentIsFinal,
  currentUpdatedAt,
  sections: initialSections,
  finalSections,
  finalVersion,
  finalSpecId,
  versions,
  companyContext,
  calibration,
  activeGeneration,
  failedGeneration,
}: Props) {
  const router = useRouter();
  const [sections, setSections] = useState<JobSpecSections>(initialSections);
  const [dirty, setDirty] = useState(false);
  const [tab, setTab] = useState<Tab>("draft");
  const [isSaving, startSave] = useTransition();
  const [isVersioning, startVersion] = useTransition();
  const [isFinalizing, startFinalize] = useTransition();
  const [isRegenerating, startRegenerate] = useTransition();
  const [confirmFinalOpen, setConfirmFinalOpen] = useState(false);

  const diffs = useMemo(
    () => diffSections(sections, finalSections),
    [sections, finalSections]
  );
  const changedCount = diffs.filter((d) => d.changed).length;

  const update = <K extends SectionKey>(key: K, value: JobSpecSections[K]) => {
    setSections((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  const handleSaveDraft = () => {
    if (!dirty) {
      toast.info("No unsaved changes.");
      return;
    }
    if (currentIsFinal) {
      toast.error(
        "This version is finalised. Use 'New Version' to keep editing."
      );
      return;
    }
    startSave(async () => {
      try {
        await saveDraft(currentSpecId, projectId, sections);
        setDirty(false);
        toast.success(`Draft saved · V${String(currentVersion).padStart(2, "0")}`);
        router.refresh();
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Save failed.";
        console.error("[spec] save draft failed:", e);
        toast.error(msg);
        // The finalized-conflict sentinel means another session finalised
        // this spec between our last read and the write. Force a refresh so
        // the editor flips to read-only / FINAL state instead of leaving the
        // recruiter editing a stale copy.
        if (msg === SAVE_DRAFT_FINALIZED_MESSAGE) {
          router.refresh();
        }
      }
    });
  };

  const handleNewVersion = () => {
    startVersion(async () => {
      try {
        const result = await createNewVersion(projectId, sections);
        setDirty(false);
        toast.success(
          `Snapshotted as V${String(result.version).padStart(2, "0")}`
        );
        router.refresh();
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Snapshot failed.";
        console.error("[spec] new version failed:", e);
        toast.error(msg);
      }
    });
  };

  const handleFinalize = () => {
    setConfirmFinalOpen(false);
    startFinalize(async () => {
      try {
        // If there are unsaved edits, snapshot first so we finalise the
        // exact text on screen rather than the previously-saved row.
        let targetId = currentSpecId;
        if (dirty) {
          const snap = await createNewVersion(projectId, sections);
          targetId = snap.specId;
        }
        await markAsFinal(targetId, projectId);
        setDirty(false);
        toast.success("Job spec marked as final.");
        router.refresh();
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Finalise failed.";
        console.error("[spec] finalize failed:", e);
        toast.error(msg);
      }
    });
  };

  const handleRegenerate = () => {
    startRegenerate(async () => {
      try {
        const result = await requestRegenerate(projectId);
        if (result.wasExisting) {
          toast.info(
            `Already compiling V${String(result.version).padStart(2, "0")} — polling for the result.`
          );
        } else {
          toast.success(
            `AI is drafting V${String(result.version).padStart(2, "0")}.`
          );
        }
        router.refresh();
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Regenerate failed.";
        console.error("[spec] regenerate failed:", e);
        toast.error(msg);
      }
    });
  };

  const busy = isSaving || isVersioning || isFinalizing || isRegenerating;
  const versionLabel = `${currentIsFinal ? "FINAL" : "DRAFT"}_V${String(
    currentVersion
  ).padStart(2, "0")}`;

  return (
    <div className="min-h-full bg-surface text-on-surface">
      <div className="max-w-7xl mx-auto px-8 py-10 space-y-6">
        {/* breadcrumb */}
        <div className="flex items-center gap-3 font-mono-label text-mono-label uppercase tracking-widest text-outline">
          <Link
            href={`/projects/${projectId}`}
            className="hover:text-on-surface transition-colors flex items-center gap-1.5"
          >
            <span className="material-symbols-outlined text-[14px]">arrow_back</span>
            Mandate
          </Link>
          <span className="text-outline-variant">/</span>
          <span className="text-on-surface-variant">{roleTitle}</span>
          <span className="text-outline-variant">/</span>
          <span className="text-primary">Job Spec</span>
        </div>

        {/* header */}
        <header className="space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
              Job Spec Generator //
            </span>
            <h1 className="font-h2 text-h2 text-on-surface">{roleTitle}</h1>
            <span
              className={cn(
                "px-2 py-0.5 border font-mono-label text-mono-label uppercase tracking-wider",
                currentIsFinal
                  ? "border-secondary-fixed-dim/40 bg-secondary-fixed-dim/10 text-secondary-fixed-dim"
                  : "border-primary-container bg-primary-container/10 text-primary"
              )}
            >
              {versionLabel}
            </span>
            {dirty && !currentIsFinal && (
              <span className="px-2 py-0.5 border border-tertiary/40 bg-tertiary/10 text-tertiary font-mono-label text-mono-label uppercase tracking-wider">
                UNSAVED
              </span>
            )}
            <span className="ml-auto font-mono-label text-mono-label text-outline uppercase tracking-wider">
              UPDATED {formatRelative(currentUpdatedAt)}
            </span>
          </div>
          <div className="flex items-center gap-3 text-on-surface-variant text-body-main">
            <span>{companyName}</span>
            <span className="text-outline">·</span>
            <span className="font-mono-label text-mono-label text-outline uppercase tracking-wider truncate">
              {oneLineInput}
            </span>
          </div>
        </header>

        {/* generation-state banners — surface in-flight or failed background
            generations without taking over the route from the editor body */}
        {activeGeneration && (
          <ActiveGenerationBanner
            specId={activeGeneration.specId}
            version={activeGeneration.version}
            projectId={projectId}
          />
        )}
        {failedGeneration && (
          <FailedGenerationBanner
            specId={failedGeneration.specId}
            version={failedGeneration.version}
            error={failedGeneration.error}
            projectId={projectId}
          />
        )}

        {/* tab + actions row */}
        <div className="flex items-center justify-between gap-4 flex-wrap border-y border-outline-variant/60 py-3">
          <div className="flex bg-surface-container-lowest p-1 gap-1">
            <TabButton active={tab === "draft"} onClick={() => setTab("draft")}>
              {versionLabel}
            </TabButton>
            <TabButton
              active={tab === "history"}
              onClick={() => setTab("history")}
            >
              History · {versions.length}
            </TabButton>
          </div>
          <div className="flex gap-2 flex-wrap">
            <ActionButton
              tone="ghost"
              onClick={handleRegenerate}
              busy={isRegenerating}
              icon="auto_awesome"
              disabled={busy}
            >
              {isRegenerating ? "Regenerating" : "Re-run AI"}
            </ActionButton>
            <ActionButton
              tone="ghost"
              onClick={handleSaveDraft}
              busy={isSaving}
              icon="save"
              disabled={busy || currentIsFinal}
            >
              {isSaving ? "Saving" : "Save Draft"}
            </ActionButton>
            <ActionButton
              tone="ghost"
              onClick={handleNewVersion}
              busy={isVersioning}
              icon="commit"
              disabled={busy}
            >
              {isVersioning ? "Snapshotting" : "New Version"}
            </ActionButton>
            <ActionButton
              tone="primary"
              onClick={() => setConfirmFinalOpen(true)}
              busy={isFinalizing}
              icon="verified"
              disabled={busy || currentIsFinal}
            >
              {currentIsFinal ? "Already Final" : "Mark as Final"}
            </ActionButton>
          </div>
        </div>

        {/* main grid */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
          <main className="space-y-4">
            {tab === "draft" ? (
              <>
                {SECTION_DEFS.map((def) => (
                  <SectionCard
                    key={def.key}
                    def={def}
                    sections={sections}
                    diffEntry={diffs.find((d) => d.key === def.key)}
                    onChange={update}
                    readonly={currentIsFinal}
                  />
                ))}
              </>
            ) : (
              <HistoryView
                versions={versions}
                currentSpecId={currentSpecId}
                finalSpecId={finalSpecId}
              />
            )}
          </main>

          <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
            <DiffSummaryCard
              diffs={diffs}
              changedCount={changedCount}
              finalVersion={finalVersion}
              currentVersion={currentVersion}
              currentIsFinal={currentIsFinal}
            />
            <CompanyContextCard
              companyName={companyName}
              context={companyContext}
              calibration={calibration}
            />
          </aside>
        </div>

        {/* footer */}
        <footer className="pt-4 border-t border-outline-variant/60 flex items-center justify-between flex-wrap gap-3">
          <Link
            href={`/projects/${projectId}`}
            className="flex items-center gap-2 text-outline font-mono-label text-mono-label uppercase tracking-widest hover:text-on-surface transition-colors"
          >
            <span className="material-symbols-outlined text-[14px]">arrow_back</span>
            Return to Mandate
          </Link>
          <div className="font-mono-label text-mono-label text-outline uppercase tracking-wider">
            {changedCount > 0 && finalSections
              ? `${changedCount} of ${SECTION_DEFS.length} sections diverge from FINAL_V${String(finalVersion).padStart(2, "0")}`
              : finalSections
                ? "In sync with final"
                : "No final version yet"}
          </div>
        </footer>
      </div>

      {confirmFinalOpen && (
        <FinalizeConfirm
          onCancel={() => setConfirmFinalOpen(false)}
          onConfirm={handleFinalize}
          dirty={dirty}
          currentVersion={currentVersion}
          previousFinalVersion={finalVersion}
        />
      )}
    </div>
  );
}

/**
 * Banner shown when a regeneration is in flight while the editor still has
 * a usable version on screen. Polls router.refresh() so the editor body
 * picks up the new version when generation lands.
 *
 * Mirrors the timeout pattern in JobSpecGenerating: after 60s without the
 * placeholder being completed, calls markGenerationTimedOut to transition
 * the row to a terminal failed state. The next refresh routes through
 * generation_error → the dismissible failed banner with retry CTA.
 *
 * Without this timeout, a dropped after() callback (process kill, deploy)
 * would leave the project permanently wedged: the unique_generating_per_
 * project index would block fresh placeholders, and the idempotency check
 * in allocate_and_insert_job_spec would coalesce all retries onto the
 * stale in-flight row. Recovery would require manual DB intervention.
 */
function ActiveGenerationBanner({
  specId,
  version,
  projectId,
}: {
  specId: string;
  version: number;
  projectId: string;
}) {
  const router = useRouter();
  const startedAtRef = useRef<number | null>(null);
  const timedOutRef = useRef(false);

  useEffect(() => {
    const POLL_INTERVAL_MS = 1500;
    const TIMEOUT_MS = 60_000;
    if (startedAtRef.current == null) {
      startedAtRef.current = Date.now();
    }
    const id = setInterval(async () => {
      if (
        startedAtRef.current != null &&
        Date.now() - startedAtRef.current > TIMEOUT_MS
      ) {
        clearInterval(id);
        // Run-once guard: re-mounts (fast refresh, parent re-render)
        // shouldn't fire the timeout marker repeatedly.
        if (timedOutRef.current) return;
        timedOutRef.current = true;
        try {
          await markGenerationTimedOut(specId, projectId);
        } catch (err) {
          console.error("[spec/banner] timeout marker failed", err);
        }
        // Refresh in either case — even if the timeout marker failed we
        // want the user to see whatever the server now considers current.
        router.refresh();
        return;
      }
      router.refresh();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [router, specId, projectId]);

  return (
    <div
      data-spec-id={specId}
      className="flex items-center gap-3 px-4 py-3 border border-primary-container/50 bg-primary-container/10"
    >
      <span className="material-symbols-outlined text-[18px] text-primary animate-spin">
        progress_activity
      </span>
      <div className="flex-1 min-w-0">
        <div className="font-mono-label text-mono-label text-primary uppercase tracking-widest">
          AI compiling V{String(version).padStart(2, "0")}
        </div>
        <div className="text-body-main text-on-surface-variant">
          The editor below stays editable on the latest healthy version. The
          new draft will swap in automatically once it lands.
        </div>
      </div>
      <span className="font-mono-label text-mono-label text-primary uppercase tracking-wider flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
        LIVE
      </span>
    </div>
  );
}

/**
 * Banner shown when a previous generation failed but the recruiter still
 * has a usable editor row underneath. Dismissible client-side (the row
 * stays in the DB for history); the dismiss does not clear the
 * generation_error column so the next refresh resurfaces the banner —
 * this is intentional: the user must explicitly retry, dismiss the row
 * permanently via a future admin path, or wait for the row to age out.
 */
function FailedGenerationBanner({
  specId,
  version,
  error,
  projectId,
}: {
  specId: string;
  version: number;
  error: string;
  projectId: string;
}) {
  const router = useRouter();
  const [hidden, setHidden] = useState(false);
  const [isRetrying, startRetry] = useTransition();

  if (hidden) return null;

  const handleRetry = () => {
    startRetry(async () => {
      try {
        const result = await requestRegenerate(projectId);
        if (result.wasExisting) {
          toast.info(
            `Already compiling V${String(result.version).padStart(2, "0")}.`
          );
        } else {
          toast.success(
            `Retrying — drafting V${String(result.version).padStart(2, "0")}.`
          );
        }
        router.refresh();
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Retry failed.";
        console.error("[spec] failed-banner retry failed:", e);
        toast.error(msg);
      }
    });
  };

  return (
    <div
      data-spec-id={specId}
      className="flex items-start gap-3 px-4 py-3 border border-error/40 bg-error-container/10"
    >
      <span
        className="material-symbols-outlined text-[18px] text-error mt-0.5"
        style={{ fontVariationSettings: "'FILL' 1" }}
      >
        error
      </span>
      <div className="flex-1 min-w-0 space-y-1">
        <div className="font-mono-label text-mono-label text-error uppercase tracking-widest">
          V{String(version).padStart(2, "0")} generation failed
        </div>
        <p className="text-body-main text-on-surface-variant break-words">
          {error}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={handleRetry}
          disabled={isRetrying}
          aria-busy={isRetrying ? true : undefined}
          className="px-3 py-1.5 border border-error/40 text-error font-mono-label text-mono-label uppercase tracking-widest hover:bg-error-container/20 transition-colors flex items-center gap-1.5 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <span
            className={cn(
              "material-symbols-outlined text-[14px]",
              isRetrying && "animate-spin"
            )}
          >
            {isRetrying ? "progress_activity" : "refresh"}
          </span>
          {isRetrying ? "Retrying" : "Retry"}
        </button>
        <button
          type="button"
          onClick={() => setHidden(true)}
          aria-label="Dismiss failed generation banner"
          className="p-1.5 text-outline hover:text-on-surface transition-colors"
        >
          <span className="material-symbols-outlined text-[14px]">close</span>
        </button>
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "px-3 py-1.5 font-mono-label text-mono-label uppercase tracking-widest transition-colors",
        active
          ? "bg-primary-container text-on-primary-container"
          : "text-outline hover:text-on-surface hover:bg-surface-container-low"
      )}
    >
      {children}
    </button>
  );
}

function ActionButton({
  tone,
  onClick,
  busy,
  icon,
  disabled,
  children,
}: {
  tone: "ghost" | "primary";
  onClick: () => void;
  busy?: boolean;
  icon: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  const base =
    "px-4 py-2 font-mono-label text-mono-label uppercase tracking-widest flex items-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed";
  const palette =
    tone === "primary"
      ? "bg-primary-container text-on-primary-container hover:brightness-110 active:scale-[0.98]"
      : "border border-outline-variant text-on-surface-variant hover:border-primary hover:text-primary";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-busy={busy ? true : undefined}
      className={cn(base, palette)}
    >
      <span
        className={cn(
          "material-symbols-outlined text-[14px]",
          busy && "animate-spin"
        )}
      >
        {busy ? "progress_activity" : icon}
      </span>
      {children}
    </button>
  );
}

function SectionCard({
  def,
  sections,
  diffEntry,
  onChange,
  readonly,
}: {
  def: SectionDef;
  sections: JobSpecSections;
  diffEntry: { changed: boolean; wordDelta: number } | undefined;
  onChange: <K extends SectionKey>(key: K, value: JobSpecSections[K]) => void;
  readonly: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const value = sections[def.key];

  return (
    <article
      className={cn(
        "bg-surface-container-low border p-5 space-y-3 transition-colors relative overflow-hidden",
        diffEntry?.changed
          ? "border-tertiary/60"
          : "border-outline-variant"
      )}
    >
      {/* Top-edge accent. Tertiary when this section diverges from the
          final, secondary-dim otherwise — the article reads as
          "instrument panel for one section" rather than a generic card. */}
      <div
        className={cn(
          "absolute left-0 right-0 top-0 h-0.5",
          diffEntry?.changed ? "bg-tertiary/80" : "bg-secondary-fixed-dim/40"
        )}
      />
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "px-2 py-0.5 border font-mono-label text-mono-label uppercase tracking-widest flex items-center gap-1.5",
              "border-secondary-fixed-dim/60 bg-secondary-fixed-dim/10 text-secondary-fixed-dim"
            )}
          >
            <span
              className="material-symbols-outlined text-[12px]"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              {def.icon}
            </span>
            # {def.short}
          </span>
          <span className="text-on-surface text-body-main font-semibold">
            {def.label}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {diffEntry?.changed && (
            <span
              className={cn(
                "px-2 py-0.5 border font-mono-label text-mono-label uppercase tracking-wider tabular-nums",
                diffEntry.wordDelta >= 0
                  ? "border-secondary-fixed-dim/60 bg-secondary-fixed-dim/10 text-secondary-fixed-dim"
                  : "border-error/60 bg-error/10 text-error"
              )}
            >
              {diffEntry.wordDelta >= 0 ? "+" : ""}
              {diffEntry.wordDelta}W vs final
            </span>
          )}
          {!readonly && (
            <button
              type="button"
              onClick={() => setExpanded((e) => !e)}
              className="font-mono-label text-mono-label text-outline uppercase tracking-widest hover:text-primary transition-colors flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-[14px]">
                {expanded ? "close" : "edit"}
              </span>
              {expanded ? "Done" : "Edit"}
            </button>
          )}
        </div>
      </header>

      <p className="font-mono-label text-mono-label text-outline uppercase tracking-wider">
        {def.blurb}
      </p>

      {def.type === "paragraphs" ? (
        <ParagraphField
          value={value as string}
          expanded={expanded || readonly}
          editable={!readonly && expanded}
          onChange={(v) => onChange(def.key, v as JobSpecSections[typeof def.key])}
        />
      ) : (
        <ListField
          values={value as string[]}
          def={def}
          expanded={expanded}
          editable={!readonly && expanded}
          onChange={(v) => onChange(def.key, v as JobSpecSections[typeof def.key])}
        />
      )}
    </article>
  );
}

function ParagraphField({
  value,
  expanded,
  editable,
  onChange,
}: {
  value: string;
  expanded: boolean;
  editable: boolean;
  onChange: (v: string) => void;
}) {
  if (editable) {
    return (
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={Math.max(6, value.split("\n").length + 1)}
        className="w-full bg-surface-container-lowest border border-outline-variant rounded-none px-3 py-3 font-mono-data text-body-main text-on-surface placeholder:text-outline-variant focus:border-primary focus:ring-0 outline-none transition-colors resize-y"
        placeholder="Two to three paragraphs covering scope, mandate, and reporting context."
      />
    );
  }
  if (!value.trim()) {
    return (
      <p className="text-body-main text-outline italic">
        No content yet — click Edit to compose this section.
      </p>
    );
  }
  const paragraphs = value.split(/\n\s*\n/);
  return (
    <div
      className={cn(
        "space-y-3 text-body-main text-on-surface-variant leading-relaxed",
        !expanded && "max-h-40 overflow-hidden relative"
      )}
    >
      {paragraphs.map((p, i) => (
        <p key={i} className="font-mono-data">
          {p}
        </p>
      ))}
    </div>
  );
}

function ListField({
  values,
  def,
  expanded,
  editable,
  onChange,
}: {
  values: string[];
  def: SectionDef;
  expanded: boolean;
  editable: boolean;
  onChange: (v: string[]) => void;
}) {
  const min = def.minItems ?? 1;
  const max = def.maxItems ?? 12;

  if (editable) {
    return (
      <div className="space-y-2">
        {values.map((item, i) => (
          <div key={i} className="flex items-stretch gap-2">
            <span className="bg-surface-container-lowest border border-outline-variant px-3 flex items-center font-mono-label text-mono-label text-outline uppercase">
              {String(i + 1).padStart(2, "0")}
            </span>
            <input
              type="text"
              value={item}
              onChange={(e) => {
                const next = [...values];
                next[i] = e.target.value;
                onChange(next);
              }}
              className="flex-1 bg-surface-container-lowest border border-outline-variant rounded-none px-3 py-2.5 font-mono-data text-body-main text-on-surface placeholder:text-outline-variant focus:border-primary focus:ring-0 outline-none transition-colors"
              placeholder={`Entry ${i + 1}`}
            />
            {values.length > min && (
              <button
                type="button"
                onClick={() => onChange(values.filter((_, j) => j !== i))}
                className="px-3 border border-outline-variant text-outline hover:text-destructive hover:border-destructive transition-colors"
                aria-label={`Remove entry ${i + 1}`}
              >
                <span className="material-symbols-outlined text-[16px]">close</span>
              </button>
            )}
          </div>
        ))}
        <div className="flex items-center justify-between">
          <span className="font-mono-label text-mono-label text-outline uppercase tracking-wider">
            {values.filter((v) => v.trim()).length} / {max} · target {min}–{max}
          </span>
          {values.length < max && (
            <button
              type="button"
              onClick={() => onChange([...values, ""])}
              className="font-mono-label text-mono-label text-primary uppercase tracking-widest flex items-center gap-1.5 hover:brightness-110 transition-colors"
            >
              <span className="material-symbols-outlined text-[14px]">add</span>
              Append entry
            </button>
          )}
        </div>
      </div>
    );
  }

  if (values.length === 0 || values.every((v) => !v.trim())) {
    return (
      <p className="text-body-main text-outline italic">
        No entries yet — click Edit to add {min}–{max} items.
      </p>
    );
  }
  return (
    <ol
      className={cn(
        "space-y-1.5 list-decimal list-inside text-body-main text-on-surface-variant font-mono-data",
        !expanded && "max-h-48 overflow-hidden"
      )}
    >
      {values.map((v, i) =>
        v.trim() ? (
          <li key={i} className="leading-relaxed">
            {v}
          </li>
        ) : null
      )}
    </ol>
  );
}

function DiffSummaryCard({
  diffs,
  changedCount,
  finalVersion,
  currentVersion,
  currentIsFinal,
}: {
  diffs: ReturnType<typeof diffSections>;
  changedCount: number;
  finalVersion: number | null;
  currentVersion: number;
  currentIsFinal: boolean;
}) {
  if (finalVersion == null) {
    return (
      <div className="bg-surface-container border border-outline-variant p-5 space-y-2">
        <h3 className="font-mono-label text-mono-label text-outline uppercase tracking-widest flex items-center gap-2">
          <span className="material-symbols-outlined text-[14px]">flag</span>
          Diff vs Final
        </h3>
        <p className="text-body-main text-outline">
          No final version yet. Use{" "}
          <span className="text-primary">Mark as Final</span> to lock the
          current draft as the canonical version.
        </p>
      </div>
    );
  }
  if (currentIsFinal) {
    return (
      <div className="bg-secondary-fixed-dim/5 border border-secondary-fixed-dim/30 p-5 space-y-2">
        <h3 className="font-mono-label text-mono-label text-secondary-fixed-dim uppercase tracking-widest flex items-center gap-2">
          <span
            className="material-symbols-outlined text-[14px]"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            verified
          </span>
          Final Version
        </h3>
        <p className="text-body-main text-on-surface-variant">
          You are viewing FINAL_V{String(currentVersion).padStart(2, "0")}.
          Create a new version to keep editing.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-surface-container border border-outline-variant p-5 space-y-3">
      <header className="flex items-center justify-between">
        <h3 className="font-mono-label text-mono-label text-tertiary uppercase tracking-widest flex items-center gap-2">
          <span className="material-symbols-outlined text-[14px]">difference</span>
          Diff vs FINAL_V{String(finalVersion).padStart(2, "0")}
        </h3>
        <span
          className={cn(
            "font-mono-label text-mono-label uppercase tracking-wider",
            changedCount > 0 ? "text-tertiary" : "text-outline"
          )}
        >
          {changedCount === 0 ? "IN SYNC" : `${changedCount} CHANGED`}
        </span>
      </header>
      <ul className="space-y-1.5">
        {SECTION_DEFS.map((def) => {
          const d = diffs.find((x) => x.key === def.key);
          const changed = !!d?.changed;
          return (
            <li
              key={def.key}
              className="flex items-center justify-between font-mono-data text-body-main"
            >
              <span
                className={cn(
                  "flex items-center gap-2",
                  changed ? "text-on-surface" : "text-outline"
                )}
              >
                <span
                  className={cn(
                    "w-1.5 h-1.5 rounded-full",
                    changed ? "bg-tertiary" : "bg-outline-variant"
                  )}
                />
                {def.short}
              </span>
              {changed && d ? (
                <span
                  className={cn(
                    "font-mono-label text-mono-label uppercase tracking-wider",
                    d.wordDelta >= 0 ? "text-secondary-fixed-dim" : "text-error"
                  )}
                >
                  {d.wordDelta >= 0 ? "+" : ""}
                  {d.wordDelta} W
                </span>
              ) : (
                <span className="font-mono-label text-mono-label text-outline-variant uppercase tracking-wider">
                  —
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function CompanyContextCard({
  companyName,
  context,
  calibration,
}: {
  companyName: string;
  context: Partial<CompanyContext>;
  calibration: Partial<CalibrationModel>;
}) {
  return (
    <div className="bg-surface-container-low border border-outline-variant p-5 space-y-3">
      <h3 className="font-mono-label text-mono-label text-primary uppercase tracking-widest flex items-center gap-2">
        <span className="material-symbols-outlined text-[14px]">domain</span>
        Org Context
      </h3>
      <div className="space-y-2 text-body-main">
        <Row label="COMPANY" value={companyName} />
        <Row label="INDUSTRY" value={context.industry} />
        <Row label="MODEL" value={context.business_model} />
        <Row label="SENIORITY" value={calibration.role_structure?.seniority} />
        <Row label="FUNCTION" value={calibration.role_structure?.function} />
      </div>
      {calibration.weights_rationale && (
        <p className="text-body-main text-on-surface-variant pt-3 border-t border-outline-variant/40">
          {calibration.weights_rationale}
        </p>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | undefined }) {
  return (
    <div className="flex justify-between items-baseline gap-3">
      <span className="font-mono-label text-mono-label text-outline uppercase tracking-wider">
        {label}
      </span>
      <span className="text-on-surface text-right">{value ?? "—"}</span>
    </div>
  );
}

function HistoryView({
  versions,
  currentSpecId,
  finalSpecId,
}: {
  versions: SpecVersionSummary[];
  currentSpecId: string;
  finalSpecId: string | null;
}) {
  // Tighter list: each entry is a single dense row (py-2) with a left
  // accent rail keyed to its state (final / current / draft / generating)
  // so the eye picks the canonical line out of a long history scroll.
  return (
    <div className="bg-surface-container-low border border-outline-variant p-4 space-y-2">
      <header className="flex items-center justify-between">
        <h3 className="font-mono-label text-mono-label text-primary uppercase tracking-widest flex items-center gap-2">
          <span className="material-symbols-outlined text-[14px]">history</span>
          Version History
        </h3>
        <span className="font-mono-label text-mono-label text-outline uppercase tracking-wider">
          {versions.length} {versions.length === 1 ? "version" : "versions"}
        </span>
      </header>
      <ol className="space-y-1">
        {versions.map((v) => {
          const isCurrent = v.id === currentSpecId;
          const isFinal = v.id === finalSpecId;
          // Left rail tone — final wins over current wins over draft.
          const railTone = isFinal
            ? "border-l-secondary-fixed-dim"
            : isCurrent
              ? "border-l-primary-container"
              : v.is_generating
                ? "border-l-tertiary"
                : "border-l-outline-variant";
          const stateTone = isFinal
            ? "border-secondary-fixed-dim/60 bg-secondary-fixed-dim/10 text-secondary-fixed-dim"
            : isCurrent
              ? "border-primary-container bg-primary-container/10 text-primary"
              : v.is_generating
                ? "border-tertiary/60 bg-tertiary/10 text-tertiary"
                : "border-outline-variant text-outline";
          return (
            <li
              key={v.id}
              className={cn(
                "border-l-2 px-3 py-2 flex items-center justify-between gap-3 bg-surface-container/50 hover:bg-surface-container transition-colors",
                railTone
              )}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className={cn(
                    "font-mono-label text-mono-label uppercase tracking-widest px-2 py-0.5 border tabular-nums",
                    stateTone
                  )}
                >
                  V{String(v.version).padStart(2, "0")}
                </span>
                <span className="font-mono-label text-mono-label text-outline uppercase tracking-wider">
                  {isFinal
                    ? "Final"
                    : isCurrent
                      ? "Current"
                      : v.is_generating
                        ? (
                          <span className="flex items-center gap-1.5 text-tertiary">
                            <span className="w-1.5 h-1.5 rounded-full bg-tertiary animate-pulse" />
                            Generating
                          </span>
                        )
                        : "Draft"}
                </span>
              </div>
              <span className="font-mono-label text-mono-label text-outline uppercase tracking-wider tabular-nums shrink-0">
                {formatRelative(v.updated_at)}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="font-mono-label text-mono-label text-outline uppercase tracking-wider pt-2 border-t border-outline-variant/40">
        Each &ldquo;New Version&rdquo; snapshot creates an immutable history entry. Drafts
        update in place.
      </p>
    </div>
  );
}

function FinalizeConfirm({
  onCancel,
  onConfirm,
  dirty,
  currentVersion,
  previousFinalVersion,
}: {
  onCancel: () => void;
  onConfirm: () => void;
  dirty: boolean;
  currentVersion: number;
  previousFinalVersion: number | null;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-surface/80 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="bg-surface-container border border-outline-variant max-w-md w-full p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2">
          <span
            className="material-symbols-outlined text-secondary-fixed-dim"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            verified
          </span>
          <h2 className="font-h2 text-h2">Mark as Final?</h2>
        </div>
        <div className="space-y-3 text-body-main text-on-surface-variant">
          {dirty && (
            <p className="bg-tertiary/10 border border-tertiary/30 p-3 text-tertiary font-mono-data text-body-main">
              You have unsaved edits. They will be snapshotted as a new version
              before being marked final.
            </p>
          )}
          <p>
            Promote V{String(currentVersion).padStart(2, "0")} to{" "}
            <span className="text-secondary-fixed-dim">FINAL</span>.{" "}
            {previousFinalVersion != null
              ? `This will demote V${String(previousFinalVersion).padStart(2, "0")} from final.`
              : "This will be the first canonical version for this mandate."}
          </p>
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 border border-outline-variant text-on-surface-variant font-mono-label text-mono-label uppercase tracking-widest hover:border-primary hover:text-primary transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-4 py-2 bg-secondary-fixed-dim/20 border border-secondary-fixed-dim/40 text-secondary-fixed-dim font-mono-label text-mono-label uppercase tracking-widest hover:bg-secondary-fixed-dim/30 transition-colors flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-[14px]">verified</span>
            Confirm Finalise
          </button>
        </div>
      </div>
    </div>
  );
}

function formatRelative(iso: string): string {
  const t = new Date(iso).getTime();
  const diffMs = Date.now() - t;
  const min = Math.round(diffMs / 60_000);
  if (min < 1) return "JUST NOW";
  if (min < 60) return `${min}M AGO`;
  const hrs = Math.round(min / 60);
  if (hrs < 24) return `${hrs}H AGO`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}D AGO`;
  return new Date(iso).toISOString().slice(0, 10);
}
