"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { IconCheck, IconFlag, IconRefresh, IconSpark } from "@/components/icons";
import {
  PANEL_BODY,
  PANEL_BUTTON,
  PANEL_BUTTON_QUIET,
  Panel,
  PanelMeta,
} from "@/components/projects/panel";
import {
  CHANGE_READINESS_LABELS,
  CULTURE_RISK_APPETITE_LABELS,
  DECISION_SPEED_LABELS,
  LEADERSHIP_PREFERENCE_LABELS,
  type ChangeReadiness,
  type CultureProfile,
  type CultureRiskAppetite,
  type DecisionSpeed,
  type LeadershipPreference,
} from "@/lib/ai/company-culture-agent";
import type { AnnotationMap } from "@/lib/intelligence/overlays";
import {
  generateCompanyCultureAction,
  saveCultureAnnotationAction,
  toggleCultureFlagAction,
} from "./actions";

const CULTURE_SECTION_KEYS = {
  summary: "summary",
  axes: "axes",
  red_flags: "red_flags",
  pitch: "pitch",
} as const;

const CULTURE_AXIS_KEYS = {
  risk_appetite: "risk_appetite",
  decision_speed: "decision_speed",
  leadership_preference: "leadership_preference",
  change_readiness: "change_readiness",
} as const;

type CultureAxisKey =
  (typeof CULTURE_AXIS_KEYS)[keyof typeof CULTURE_AXIS_KEYS];

export function CultureIntelligencePanel({
  projectId,
  initial,
  initialContext,
  notes,
  flags,
}: {
  projectId: string;
  initial: CultureProfile | null;
  initialContext: string | null;
  notes: AnnotationMap;
  flags: string[];
}) {
  const router = useRouter();
  const [profile, setProfile] = useState<CultureProfile | null>(initial);
  const [savedContext, setSavedContext] = useState<string | null>(
    initialContext
  );
  const [regenOpen, setRegenOpen] = useState(false);
  const [contextDraft, setContextDraft] = useState("");
  const [pending, start] = useTransition();

  const flagSet = new Set(flags);
  const flagCount = flagSet.size;

  const handleGenerate = () => {
    if (pending) return;
    const ctx = contextDraft.trim();
    start(async () => {
      try {
        const next = await generateCompanyCultureAction(
          projectId,
          ctx.length > 0 ? ctx : undefined
        );
        setProfile(next);
        setSavedContext(ctx.length > 0 ? ctx : null);
        setContextDraft("");
        setRegenOpen(false);
        toast.success(
          ctx.length > 0
            ? "Profile regenerated with your context"
            : "Culture profile generated"
        );
        router.refresh();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Generation failed.";
        toast.error(msg);
      }
    });
  };

  return (
    <Panel
      title="Culture intelligence"
      meta={
        <>
          <PanelMeta>
            {profile ? formatRelative(profile.generated_at) : "Not generated"}
          </PanelMeta>
          {flagCount > 0 && (
            /* Was a 🚩 emoji. An emoji is not an icon — it renders in the
               system font, at the system's colour, and reads aloud as
               "triangular flag on post". */
            <span className="rounded-md border border-tertiary/60 bg-tertiary/10 px-1.5 py-0.5 font-mono-label text-[10px] font-bold uppercase tracking-[0.1em] text-tertiary tabular-nums">
              {flagCount} flagged
            </span>
          )}
        </>
      }
      action={
        <button
          type="button"
          onClick={() => {
            setContextDraft(savedContext ?? "");
            setRegenOpen((o) => !o);
          }}
          disabled={pending}
          className={PANEL_BUTTON}
        >
          {pending || profile ? (
            <IconRefresh size={14} className={cn(pending && "animate-spin")} />
          ) : (
            <IconSpark size={14} />
          )}
          {pending ? "Analysing" : profile ? "Regenerate" : "Analyse culture fit"}
        </button>
      }
    >


      {regenOpen && (
        <RegenerateContextPanel
          draft={contextDraft}
          savedContext={savedContext}
          onChange={setContextDraft}
          onCancel={() => {
            setRegenOpen(false);
            setContextDraft("");
          }}
          onSubmit={handleGenerate}
          pending={pending}
          placeholder='e.g. "Client prefers flat org structure", "Recently rejected three transformation-CV candidates"'
        />
      )}

      {!profile ? (
        <div className={PANEL_BODY}>
          <p className="max-w-[70ch] text-[13px] leading-relaxed text-on-surface-variant">
            The Culture Agent reads company context, the recruiter&rsquo;s
            onboarding answers, and feedback patterns to produce a four-axis
            culture profile (risk appetite, decision speed, leadership
            preference, change readiness). Used to score candidate culture-fit
            alongside technical fit.
          </p>
        </div>
      ) : (
        <div className={cn(PANEL_BODY, "flex flex-col gap-4")}>
          {savedContext && (
            <div className="bg-surface-container-low border-l-2 border-l-primary-container px-3 py-2">
              <span className="font-mono-label text-[10px] font-bold uppercase tracking-[0.12em] text-primary">
                Recruiter context that shaped this read
              </span>
              <p className="mt-1 text-[13px] leading-relaxed text-on-surface-variant">
                {savedContext}
              </p>
            </div>
          )}

          <Section
            title="Summary"
            sectionKey={CULTURE_SECTION_KEYS.summary}
            projectId={projectId}
            annotation={notes[CULTURE_SECTION_KEYS.summary] ?? null}
          >
            <p className="text-on-surface text-body-main leading-relaxed">
              {profile.summary}
            </p>
          </Section>

          <Section
            title="Culture axes"
            sectionKey={CULTURE_SECTION_KEYS.axes}
            projectId={projectId}
            annotation={notes[CULTURE_SECTION_KEYS.axes] ?? null}
          >
            <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <AxisCard
                axisKey={CULTURE_AXIS_KEYS.risk_appetite}
                label="Risk appetite"
                value={
                  CULTURE_RISK_APPETITE_LABELS[
                    profile.risk_appetite.value as CultureRiskAppetite
                  ]
                }
                evidence={profile.risk_appetite.evidence}
                confidence={profile.risk_appetite.confidence}
                projectId={projectId}
                flagged={flagSet.has(CULTURE_AXIS_KEYS.risk_appetite)}
              />
              <AxisCard
                axisKey={CULTURE_AXIS_KEYS.decision_speed}
                label="Decision speed"
                value={
                  DECISION_SPEED_LABELS[
                    profile.decision_speed.value as DecisionSpeed
                  ]
                }
                evidence={profile.decision_speed.evidence}
                confidence={profile.decision_speed.confidence}
                projectId={projectId}
                flagged={flagSet.has(CULTURE_AXIS_KEYS.decision_speed)}
              />
              <AxisCard
                axisKey={CULTURE_AXIS_KEYS.leadership_preference}
                label="Leadership preference"
                value={
                  LEADERSHIP_PREFERENCE_LABELS[
                    profile.leadership_preference
                      .value as LeadershipPreference
                  ]
                }
                evidence={profile.leadership_preference.evidence}
                confidence={profile.leadership_preference.confidence}
                projectId={projectId}
                flagged={flagSet.has(
                  CULTURE_AXIS_KEYS.leadership_preference
                )}
              />
              <AxisCard
                axisKey={CULTURE_AXIS_KEYS.change_readiness}
                label="Change readiness"
                value={
                  CHANGE_READINESS_LABELS[
                    profile.change_readiness.value as ChangeReadiness
                  ]
                }
                evidence={profile.change_readiness.evidence}
                confidence={profile.change_readiness.confidence}
                projectId={projectId}
                flagged={flagSet.has(CULTURE_AXIS_KEYS.change_readiness)}
              />
            </ul>
          </Section>

          {profile.red_flags.length > 0 && (
            <Section
              title="Culture red flags"
              sectionKey={CULTURE_SECTION_KEYS.red_flags}
              projectId={projectId}
              annotation={notes[CULTURE_SECTION_KEYS.red_flags] ?? null}
            >
              <ul className="space-y-1.5">
                {profile.red_flags.map((r, i) => (
                  <li
                    key={i}
                    className="bg-error/5 border-l-2 border-l-error px-3 py-2 space-y-0.5"
                  >
                    <div className="flex items-baseline gap-2">
                      <span
                        className={cn(
                          "px-1.5 py-0.5 border font-mono-label text-mono-label uppercase tracking-widest",
                          r.severity === "high"
                            ? "border-error/60 bg-error/10 text-error"
                            : r.severity === "medium"
                              ? "border-tertiary/60 bg-tertiary/10 text-tertiary"
                              : "border-outline-variant bg-surface-container-high text-on-surface-variant"
                        )}
                      >
                        {r.severity}
                      </span>
                      <span className="text-[13px] font-semibold text-on-surface">
                        {r.label}
                      </span>
                    </div>
                    <p className="text-[13px] text-on-surface-variant">
                      {r.detail}
                    </p>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          <Section
            title="Candidate-facing pitch"
            sectionKey={CULTURE_SECTION_KEYS.pitch}
            projectId={projectId}
            annotation={notes[CULTURE_SECTION_KEYS.pitch] ?? null}
          >
            <div className="bg-primary-container/10 border-l-2 border-l-primary-container px-3 py-2">
              <p className="text-on-surface text-body-main leading-relaxed">
                {profile.candidate_facing_pitch}
              </p>
            </div>
          </Section>
        </div>
      )}
    </Panel>
  );
}

function AxisCard({
  axisKey,
  label,
  value,
  evidence,
  confidence,
  projectId,
  flagged,
}: {
  axisKey: CultureAxisKey;
  label: string;
  value: string;
  evidence: string;
  confidence: number;
  projectId: string;
  flagged: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const tone =
    confidence >= 80
      ? "bg-secondary-fixed-dim"
      : confidence >= 50
        ? "bg-primary"
        : "bg-tertiary";

  const toggleFlag = () => {
    if (pending) return;
    start(async () => {
      try {
        await toggleCultureFlagAction(projectId, axisKey);
        toast.success(flagged ? "Flag removed" : "Flagged for review");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Flag failed.");
      }
    });
  };

  return (
    <li
      className={cn(
        "border p-3 space-y-2 transition-colors",
        flagged
          ? "border-tertiary/60 bg-tertiary/5"
          : "bg-surface-container-low border-outline-variant"
      )}
    >
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <span className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
          {label}
        </span>
        <div className="flex items-center gap-1">
          <span className="font-mono-label text-mono-label text-outline uppercase tracking-widest tabular-nums">
            {confidence}%
          </span>
          <button
            type="button"
            onClick={toggleFlag}
            disabled={pending}
            aria-label={flagged ? "Remove flag" : "Flag this assessment"}
            title={flagged ? "Remove flag" : "Flag this assessment"}
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-md border transition-colors disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary",
              flagged
                ? "border-tertiary/60 bg-tertiary/10 text-tertiary"
                : "border-outline-variant text-outline hover:border-tertiary hover:text-tertiary"
            )}
          >
            <IconFlag size={13} />
          </button>
        </div>
      </div>
      <div className="font-h2 text-h2 text-on-surface uppercase tracking-tight">
        {value}
      </div>
      {flagged && (
        <span className="inline-flex items-center gap-1.5 rounded-md border border-tertiary/60 bg-tertiary/10 px-1.5 py-0.5 font-mono-label text-[10px] font-bold uppercase tracking-[0.1em] text-tertiary">
          <IconFlag size={11} />
          Recruiter flagged
        </span>
      )}
      <p className="text-[13px] leading-relaxed text-on-surface-variant">
        {evidence}
      </p>
      <div className="h-1 bg-surface-container-high overflow-hidden">
        <span
          className={cn("block h-full transition-[width]", tone)}
          style={{ width: `${confidence}%` }}
        />
      </div>
    </li>
  );
}

function Section({
  title,
  sectionKey,
  projectId,
  annotation,
  children,
}: {
  title: string;
  sectionKey: string;
  projectId: string;
  annotation: { note: string; updated_at: string } | null;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(annotation?.note ?? "");
  const [pending, start] = useTransition();

  const beginEdit = () => {
    setDraft(annotation?.note ?? "");
    setEditing(true);
  };

  const save = () => {
    if (pending) return;
    start(async () => {
      try {
        await saveCultureAnnotationAction(projectId, sectionKey, draft);
        toast.success(
          draft.trim().length === 0
            ? "Observation cleared"
            : "Observation saved"
        );
        setEditing(false);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Save failed.");
      }
    });
  };

  return (
    <section className="space-y-2 border-t border-outline-variant/40 pt-3 first:border-t-0 first:pt-0">
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <h3 className="font-mono-label text-mono-label text-primary uppercase tracking-widest">
          {title}
        </h3>
        {!editing && (
          <button
            type="button"
            onClick={beginEdit}
            className="font-mono-label text-mono-label text-outline uppercase tracking-widest hover:text-primary transition-colors flex items-center gap-1 focus-visible:outline-none focus-visible:underline"
          >
            {annotation ? "Edit observation" : "Add observation"}
          </button>
        )}
      </div>
      {children}
      {annotation && !editing && (
        <div className="bg-surface-container-low border-l-2 border-l-primary-container px-3 py-2">
          <span className="font-mono-label text-[10px] font-bold uppercase tracking-[0.12em] text-primary">
            Your observation
          </span>
          <p className="mt-1 text-[13px] leading-relaxed text-on-surface-variant">
            {annotation.note}
          </p>
        </div>
      )}
      {editing && (
        <div className="bg-surface-container-low border border-outline-variant px-3 py-2 space-y-2">
          <textarea
            value={draft}
            disabled={pending}
            rows={3}
            placeholder="What does this section miss? What did you learn that the AI didn't see?"
            onChange={(e) => setDraft(e.target.value)}
            className="w-full resize-y rounded-md border border-outline-variant bg-surface-container-lowest px-3 py-2 text-[13px] leading-relaxed text-on-surface transition-colors focus:border-primary focus:outline-none"
          />
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setEditing(false)}
              disabled={pending}
              className={PANEL_BUTTON_QUIET}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={pending}
              className={PANEL_BUTTON}
            >
              {pending ? (
                <IconRefresh size={14} className="animate-spin" />
              ) : (
                <IconCheck size={14} />
              )}
              {pending ? "Saving" : "Save"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function RegenerateContextPanel({
  draft,
  savedContext,
  onChange,
  onCancel,
  onSubmit,
  pending,
  placeholder,
}: {
  draft: string;
  savedContext: string | null;
  onChange: (v: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
  pending: boolean;
  placeholder: string;
}) {
  return (
    <div className="border-b border-outline-variant bg-surface-container-low px-4 py-3 space-y-2">
      <div className="font-mono-label text-[10px] font-bold uppercase tracking-[0.12em] text-primary">
        Add context for the AI (optional)
      </div>
      <textarea
        value={draft}
        rows={3}
        disabled={pending}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full resize-y rounded-md border border-outline-variant bg-surface-container-lowest px-3 py-2 text-[13px] leading-relaxed text-on-surface transition-colors focus:border-primary focus:outline-none"
      />
      <p className="font-mono-label text-mono-label text-outline uppercase tracking-widest leading-snug">
        Treated as informed prior knowledge — the AI must still ground every
        reading in the underlying evidence. Saved alongside the result so you
        always know what shaped this read.
        {savedContext && (
          <>
            {" · "}
            <span className="text-tertiary">
              Last context: &ldquo;{savedContext.slice(0, 80)}
              {savedContext.length > 80 ? "…" : ""}&rdquo;
            </span>
          </>
        )}
      </p>
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className={PANEL_BUTTON_QUIET}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onSubmit}
          disabled={pending}
          aria-busy={pending ? true : undefined}
          className={PANEL_BUTTON}
        >
          {pending ? (
            <IconRefresh size={14} className="animate-spin" />
          ) : (
            <IconSpark size={14} />
          )}
          {pending ? "Generating" : "Run"}
        </button>
      </div>
    </div>
  );
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return iso;
  const delta = Date.now() - then;
  const min = Math.round(delta / 60000);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.round(hr / 24)}d ago`;
}
