"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  SLOTS,
  type SlotDef,
  type SlotKey,
  type SourcingQueries,
} from "@/lib/ai/sourcing-analysis";
import type { CalibrationModel, CompanyContext } from "@/lib/ai/role-analysis";
import { regenerateOneAction, saveQueryEditAction } from "./actions";
import type { SlotState } from "./page";

type Props = {
  projectId: string;
  roleTitle: string;
  companyName: string;
  finalSpecVersion: number;
  slotStates: Record<SlotKey, SlotState | null>;
  initialQueries: SourcingQueries;
  calibration: Partial<CalibrationModel>;
  companyContext: Partial<CompanyContext>;
};

type LinkedInTab =
  | "linkedin_exact"
  | "linkedin_broad"
  | "linkedin_adjacent"
  | "linkedin_competitor";

const LINKEDIN_TABS: LinkedInTab[] = [
  "linkedin_exact",
  "linkedin_broad",
  "linkedin_adjacent",
  "linkedin_competitor",
];

export function SourcingEditor({
  projectId,
  roleTitle,
  companyName,
  finalSpecVersion,
  slotStates,
  initialQueries,
  calibration,
  companyContext,
}: Props) {
  const router = useRouter();
  const [queries, setQueries] = useState<SourcingQueries>(initialQueries);
  const [linkedinTab, setLinkedinTab] = useState<LinkedInTab>("linkedin_exact");

  const slotsByGroup = useMemo(() => groupSlots(), []);

  const updateQuery = (slot: SlotKey, value: string) => {
    setQueries((q) => ({ ...q, [slot]: value }));
  };

  const linkedinSlot =
    SLOTS.find((s) => s.key === linkedinTab) ?? SLOTS[0];

  return (
    <div className="min-h-full bg-surface text-on-surface">
      <div className="max-w-7xl mx-auto px-8 py-10 space-y-6">
        {/* breadcrumb */}
        <div className="flex items-center gap-3 font-mono-label text-mono-label uppercase tracking-widest text-outline">
          <Link
            href={`/app/projects/${projectId}`}
            prefetch={false}
            className="hover:text-on-surface transition-colors flex items-center gap-1.5"
          >
            <span className="material-symbols-outlined text-[14px]">arrow_back</span>
            Mandate
          </Link>
          <span className="text-outline-variant">/</span>
          <span className="text-on-surface-variant">{roleTitle}</span>
          <span className="text-outline-variant">/</span>
          <span className="text-primary">Sourcing Intel</span>
        </div>

        {/* header — Stitch "BOOLEAN SEARCH GEN" eyebrow */}
        <header className="flex justify-between items-end">
          <div>
            <h2 className="font-h1 text-h1 text-primary">BOOLEAN SEARCH GEN</h2>
            <p className="font-mono-label text-mono-label text-outline uppercase tracking-widest mt-1">
              Automated string synthesis engine
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <span className="bg-secondary-fixed-dim/10 border border-secondary-fixed-dim/30 text-secondary-fixed-dim font-mono-label text-mono-label uppercase tracking-wider px-2 py-1">
              OPTIMIZATION: ACTIVE
            </span>
            <span className="font-mono-label text-mono-label text-outline uppercase tracking-wider">
              ANCHORED ON FINAL_V{String(finalSpecVersion).padStart(2, "0")}
            </span>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
          <main className="space-y-4">
            {/* LinkedIn card with 4 variants as tabs */}
            <SlotCard
              header={{
                eyebrow: "LINKEDIN_STR",
                title: "LinkedIn Boolean",
                icon: "link",
              }}
            >
              <div className="flex flex-wrap gap-1 mb-4">
                {LINKEDIN_TABS.map((key) => {
                  const slot = SLOTS.find((s) => s.key === key)!;
                  const state = slotStates[key];
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setLinkedinTab(key)}
                      className={cn(
                        "px-3 py-1.5 font-mono-label text-mono-label uppercase tracking-widest border transition-colors",
                        linkedinTab === key
                          ? "bg-primary-container text-on-primary-container border-primary-container"
                          : "border-outline-variant text-outline hover:text-on-surface hover:border-outline"
                      )}
                    >
                      {slot.short}
                      {state && state.version > 1 && (
                        <span className="ml-2 text-[9px] opacity-70">
                          V{String(state.version).padStart(2, "0")}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              <SlotEditor
                key={linkedinTab}
                projectId={projectId}
                slot={linkedinSlot}
                state={slotStates[linkedinTab]}
                value={queries[linkedinTab]}
                onChange={(v) => updateQuery(linkedinTab, v)}
                onAfterMutation={() => router.refresh()}
              />
            </SlotCard>

            {/* Google X-Ray + ATS — single-slot cards stacked */}
            {slotsByGroup
              .filter((g) => g.group !== "linkedin")
              .map((g) => {
                const slot = g.slots[0];
                return (
                  <SlotCard
                    key={slot.key}
                    header={{
                      eyebrow: slot.short,
                      title: slot.label,
                      icon: slot.icon,
                    }}
                  >
                    <SlotEditor
                      projectId={projectId}
                      slot={slot}
                      state={slotStates[slot.key]}
                      value={queries[slot.key]}
                      onChange={(v) => updateQuery(slot.key, v)}
                      onAfterMutation={() => router.refresh()}
                    />
                  </SlotCard>
                );
              })}
          </main>

          {/* Right rail */}
          <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
            <ContextCard
              roleTitle={roleTitle}
              companyName={companyName}
              calibration={calibration}
              context={companyContext}
            />
            <HistoryCard slotStates={slotStates} />
          </aside>
        </div>

        <footer className="pt-4 border-t border-outline-variant/60 flex items-center justify-between flex-wrap gap-3">
          <Link
            href={`/app/projects/${projectId}`}
            prefetch={false}
            className="flex items-center gap-2 text-outline font-mono-label text-mono-label uppercase tracking-widest hover:text-on-surface transition-colors"
          >
            <span className="material-symbols-outlined text-[14px]">arrow_back</span>
            Return to Mandate
          </Link>
          <div className="font-mono-label text-mono-label text-outline uppercase tracking-wider">
            6 channels · 4 LinkedIn variants · 1 X-Ray · 1 ATS
          </div>
        </footer>
      </div>
    </div>
  );
}

function groupSlots(): { group: string; slots: SlotDef[] }[] {
  const groups = new Map<string, SlotDef[]>();
  for (const slot of SLOTS) {
    const arr = groups.get(slot.group) ?? [];
    arr.push(slot);
    groups.set(slot.group, arr);
  }
  return Array.from(groups.entries()).map(([group, slots]) => ({ group, slots }));
}

function SlotCard({
  header,
  children,
}: {
  header: { eyebrow: string; title: string; icon: string };
  children: React.ReactNode;
}) {
  return (
    <article className="bg-surface-container-low border border-outline-variant p-5 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span
            className="material-symbols-outlined text-[16px] text-secondary-fixed-dim"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            {header.icon}
          </span>
          <span className="font-mono-label text-mono-label text-secondary-fixed-dim uppercase tracking-widest">
            # {header.eyebrow}
          </span>
          <span className="text-on-surface text-body-main font-semibold">
            {header.title}
          </span>
        </div>
      </div>
      {children}
    </article>
  );
}

function SlotEditor({
  projectId,
  slot,
  state,
  value,
  onChange,
  onAfterMutation,
}: {
  projectId: string;
  slot: SlotDef;
  state: SlotState | null;
  value: string;
  onChange: (v: string) => void;
  onAfterMutation: () => void;
}) {
  const [isSaving, startSave] = useTransition();
  const [isRegenerating, startRegenerate] = useTransition();
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedback, setFeedback] = useState("");

  const dirty = state ? value.trim() !== state.content.trim() : false;
  const empty = !state;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${slot.short} copied to clipboard.`);
    } catch (e) {
      console.error("[sourcing] copy failed", e);
      toast.error("Couldn't copy to clipboard.");
    }
  };

  const handleSave = () => {
    if (!dirty) {
      toast.info("No unsaved changes.");
      return;
    }
    if (empty) {
      toast.error("Generate the sourcing set before editing.");
      return;
    }
    startSave(async () => {
      try {
        await saveQueryEditAction(projectId, slot.key, value);
        toast.success(`${slot.short} saved.`);
        onAfterMutation();
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Save failed.";
        console.error("[sourcing] save failed", e);
        toast.error(msg);
      }
    });
  };

  const handleRegenerate = () => {
    if (empty) {
      toast.error("Generate the sourcing set before regenerating individual queries.");
      return;
    }
    startRegenerate(async () => {
      try {
        await regenerateOneAction(projectId, slot.key, feedback.trim());
        toast.success(`Regenerating ${slot.short}…`);
        setFeedback("");
        setFeedbackOpen(false);
        onAfterMutation();
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Regenerate failed.";
        console.error("[sourcing] regenerate failed", e);
        toast.error(msg);
      }
    });
  };

  return (
    <div className="space-y-3">
      <p className="font-mono-label text-mono-label text-outline uppercase tracking-wider">
        {slot.blurb}
      </p>

      <div className="bg-surface-container-lowest border border-outline-variant p-4 relative">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-primary font-mono-data text-mono-data">&gt;</span>
          <span className="font-mono-label text-mono-label text-outline uppercase tracking-wider">
            Primary Directive · V{String(state?.version ?? 1).padStart(2, "0")}
          </span>
          {dirty && !empty && (
            <span className="px-2 py-0.5 border border-tertiary/40 bg-tertiary/10 text-tertiary font-mono-label text-mono-label uppercase tracking-wider">
              UNSAVED
            </span>
          )}
        </div>
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={
            empty
              ? "Run 'Build Sourcing Queries' to generate this slot."
              : 'e.g. ("Head of IT Ops" OR "VP Infrastructure") AND ("FS" OR "Bank")…'
          }
          rows={5}
          className="w-full bg-transparent border-none focus:ring-0 outline-none font-mono-data text-body-main text-on-surface placeholder:text-outline-variant resize-y break-all leading-relaxed"
        />
      </div>

      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex gap-2 flex-wrap">
          <ActionButton
            tone="ghost"
            icon="content_copy"
            onClick={handleCopy}
            disabled={!value.trim()}
          >
            Copy
          </ActionButton>
          <ActionButton
            tone="ghost"
            icon="save"
            onClick={handleSave}
            busy={isSaving}
            disabled={!dirty || empty}
          >
            {isSaving ? "Saving" : "Save Edit"}
          </ActionButton>
          <ActionButton
            tone="ghost"
            icon="forum"
            onClick={() => setFeedbackOpen((o) => !o)}
            disabled={empty}
          >
            {feedbackOpen ? "Hide Feedback" : "Add Feedback"}
          </ActionButton>
          <ActionButton
            tone="primary"
            icon="refresh"
            onClick={handleRegenerate}
            busy={isRegenerating}
            disabled={empty}
          >
            {isRegenerating ? "Regenerating" : "Regenerate"}
          </ActionButton>
        </div>
        <span className="font-mono-label text-mono-label text-outline uppercase tracking-wider">
          {state ? `Updated ${formatRelative(state.updated_at)}` : "Not yet generated"}
        </span>
      </div>

      {feedbackOpen && !empty && (
        <div className="bg-surface-container-lowest border border-outline-variant p-3 space-y-2">
          <span className="font-mono-label text-mono-label text-outline uppercase tracking-wider block">
            Feedback for the regen prompt (optional)
          </span>
          <textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="e.g. too narrow on title; widen to include 'SRE' and 'Platform' synonyms"
            rows={3}
            className="w-full bg-surface-container-low border border-outline-variant rounded-none px-3 py-2 font-mono-data text-body-main text-on-surface placeholder:text-outline-variant focus:border-primary focus:ring-0 outline-none transition-colors resize-y"
          />
          <p className="font-mono-label text-mono-label text-outline uppercase tracking-wider">
            Click <span className="text-primary">Regenerate</span> to apply.
          </p>
        </div>
      )}
    </div>
  );
}

function ActionButton({
  tone,
  icon,
  onClick,
  busy,
  disabled,
  children,
}: {
  tone: "ghost" | "primary";
  icon: string;
  onClick: () => void;
  busy?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  const base =
    "px-3 py-1.5 font-mono-label text-mono-label uppercase tracking-widest flex items-center gap-1.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed";
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

function ContextCard({
  roleTitle,
  companyName,
  calibration,
  context,
}: {
  roleTitle: string;
  companyName: string;
  calibration: Partial<CalibrationModel>;
  context: Partial<CompanyContext>;
}) {
  return (
    <div className="bg-surface-container-low border border-outline-variant p-5 space-y-3">
      <h3 className="font-mono-label text-mono-label text-primary uppercase tracking-widest flex items-center gap-2">
        <span className="material-symbols-outlined text-[14px]">target</span>
        Search Anchor
      </h3>
      <div className="space-y-2 text-body-main">
        <Row label="ROLE" value={roleTitle} />
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

function HistoryCard({
  slotStates,
}: {
  slotStates: Record<SlotKey, SlotState | null>;
}) {
  const totalVersions = Object.values(slotStates).reduce(
    (acc, s) => acc + (s?.history.length ?? 0),
    0
  );
  return (
    <div className="bg-surface-container-low border border-outline-variant p-5 space-y-3">
      <header className="flex items-center justify-between">
        <h3 className="font-mono-label text-mono-label text-primary uppercase tracking-widest flex items-center gap-2">
          <span className="material-symbols-outlined text-[14px]">history</span>
          Historical Queries
        </h3>
        <span className="font-mono-label text-mono-label text-outline uppercase tracking-wider">
          {totalVersions} TOTAL
        </span>
      </header>
      <div className="space-y-3 max-h-80 overflow-y-auto">
        {SLOTS.map((slot) => {
          const state = slotStates[slot.key];
          if (!state) return null;
          return (
            <div key={slot.key} className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-mono-label text-mono-label text-on-surface uppercase tracking-widest">
                  # {slot.short}
                </span>
                <span className="font-mono-label text-mono-label text-outline uppercase tracking-wider">
                  {state.history.length} VERSION{state.history.length === 1 ? "" : "S"}
                </span>
              </div>
              {state.history.slice(0, 3).map((h) => (
                <div
                  key={h.rowId}
                  className="font-mono-data text-body-main text-on-surface-variant border-l-2 border-outline-variant/40 pl-2 truncate"
                >
                  <span className="text-outline">
                    V{String(h.version).padStart(2, "0")}
                  </span>{" "}
                  {h.content || "(empty)"}
                </div>
              ))}
              {state.history.length > 3 && (
                <span className="font-mono-label text-mono-label text-outline uppercase tracking-wider block pl-2">
                  +{state.history.length - 3} earlier
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
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
