"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { IconCheck, IconFlag, IconRefresh, IconSpark } from "@/components/icons";
import {
  PANEL_BUTTON,
  Panel,
  PanelMeta,
} from "@/components/projects/panel";
import {
  CHANGE_ORIENTATION_LABELS,
  COLLABORATION_STYLE_LABELS,
  HIERARCHY_PREFERENCE_LABELS,
  LEADERSHIP_STYLE_LABELS,
  MOTIVATION_DRIVER_LABELS,
  PACE_PREFERENCE_LABELS,
  RISK_TOLERANCE_LABELS,
  ROLE_PATTERN_LABELS,
  type CandidatePsychology,
  type ChangeOrientation,
  type CollaborationStyle,
  type HierarchyPreference,
  type LeadershipStyle,
  type MotivationDriver,
  type PacePreference,
  type RiskTolerance,
  type RolePattern,
} from "@/lib/ai/psychology-agent";
import type { CultureMatch } from "@/lib/culture/culture-match";
import type {
  AnnotationMap,
  ConfidenceOverrideMap,
} from "@/lib/intelligence/overlays";
import {
  generatePsychologyAction,
  overridePsychologyConfidenceAction,
  savePsychologyAnnotationAction,
  togglePsychologyFlagAction,
} from "./actions";
import { unwrap } from "@/lib/actions/result";

// Section keys (annotations) and axis keys (flags + confidence
// overrides). Stable strings — they get persisted into the JSONB
// overlays so do not rename without a data migration.

const PSYCHOLOGY_SECTION_KEYS = {
  leadership: "leadership",
  behavioural: "behavioural",
  cultural: "cultural",
  culture_match: "culture_match",
} as const;

const AXIS_KEYS = {
  leadership_style: "leadership_style",
  risk_tolerance: "risk_tolerance",
  change_orientation: "change_orientation",
  role_pattern: "role_pattern",
  collaboration_style: "collaboration_style",
  hierarchy_preference: "hierarchy_preference",
  pace_preference: "pace_preference",
} as const;

type AxisKey = (typeof AXIS_KEYS)[keyof typeof AXIS_KEYS];

export function PsychologyPanel({
  candidateId,
  projectId,
  initial,
  initialContext,
  notes,
  flags,
  overrides,
  cultureMatch,
}: {
  candidateId: string;
  projectId: string;
  initial: CandidatePsychology | null;
  initialContext: string | null;
  notes: AnnotationMap;
  flags: string[];
  overrides: ConfidenceOverrideMap;
  cultureMatch: CultureMatch | null;
}) {
  const router = useRouter();
  const [profile, setProfile] = useState<CandidatePsychology | null>(initial);
  const [savedContext, setSavedContext] = useState<string | null>(initialContext);
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
        const next = unwrap(await generatePsychologyAction(
          candidateId,
          projectId,
          ctx.length > 0 ? ctx : undefined
        ));
        setProfile(next);
        setSavedContext(ctx.length > 0 ? ctx : null);
        setContextDraft("");
        setRegenOpen(false);
        toast.success(
          ctx.length > 0
            ? "Profile regenerated with your context"
            : "Profile generated"
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
      title="Psychology"
      meta={
        <>
          <PanelMeta>
            {profile ? formatRelative(profile.generated_at) : "Not generated"}
          </PanelMeta>
          {flagCount > 0 && (
            <span className="inline-flex items-center gap-1.5 border border-tertiary/60 bg-tertiary/10 px-1.5 py-0.5 font-mono-label text-[10px] font-bold uppercase tracking-[0.1em] text-tertiary tabular-nums">
              <IconFlag size={11} />
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
          {pending ? "Analysing" : profile ? "Regenerate" : "Analyse"}
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
          placeholder='e.g. "Confirmed directive leader in phone screen", "Has been COO at two listed banks since the CV was written"'
        />
      )}

      {!profile ? (
        <div className="px-[18px] py-4">
          <p className="max-w-[70ch] text-[13px] leading-relaxed text-on-surface-variant">
            The Psychology Agent reads the parsed CV, the executive evaluation,
            and any recruiter notes to produce a calibrated behavioural
            profile — leadership style, risk tolerance, change orientation,
            collaboration signals, and cultural-fit indicators.
          </p>
        </div>
      ) : (
        <div className="p-4 space-y-4">
          {savedContext && (
            <div className="bg-surface-container-low border-l-2 border-l-primary-container px-3 py-2">
              <span className="font-mono-label text-mono-label text-primary uppercase tracking-widest flex items-center gap-1.5">
                Recruiter context that shaped this read
              </span>
              <p className="text-[13px] leading-relaxed text-on-surface-variant mt-1">
                {savedContext}
              </p>
            </div>
          )}

          <p className="text-on-surface text-body-main leading-relaxed">
            {profile.narrative_summary}
          </p>

          {profile.watch_outs.length > 0 && (
            <ul className="bg-tertiary/10 border-l-2 border-l-tertiary px-3 py-2 space-y-1">
              {profile.watch_outs.map((w, i) => (
                <li
                  key={i}
                  className="font-mono-data text-body-main text-tertiary"
                >
                  ⚠ {w}
                </li>
              ))}
            </ul>
          )}

          <Section
            title="Leadership style"
            sectionKey={PSYCHOLOGY_SECTION_KEYS.leadership}
            candidateId={candidateId}
            projectId={projectId}
            annotation={notes[PSYCHOLOGY_SECTION_KEYS.leadership] ?? null}
          >
            <AxisRows
              candidateId={candidateId}
              projectId={projectId}
              flagSet={flagSet}
              overrides={overrides}
              rows={[
                axisRow(
                  AXIS_KEYS.leadership_style,
                  "Style",
                  LEADERSHIP_STYLE_LABELS[
                    profile.leadership_style.value as LeadershipStyle
                  ],
                  profile.leadership_style.evidence,
                  profile.leadership_style.confidence
                ),
                axisRow(
                  AXIS_KEYS.risk_tolerance,
                  "Risk tolerance",
                  RISK_TOLERANCE_LABELS[
                    profile.risk_tolerance.value as RiskTolerance
                  ],
                  profile.risk_tolerance.evidence,
                  profile.risk_tolerance.confidence
                ),
                axisRow(
                  AXIS_KEYS.change_orientation,
                  "Change orientation",
                  CHANGE_ORIENTATION_LABELS[
                    profile.change_orientation.value as ChangeOrientation
                  ],
                  profile.change_orientation.evidence,
                  profile.change_orientation.confidence
                ),
              ]}
            />
          </Section>

          <Section
            title="Behavioural patterns"
            sectionKey={PSYCHOLOGY_SECTION_KEYS.behavioural}
            candidateId={candidateId}
            projectId={projectId}
            annotation={notes[PSYCHOLOGY_SECTION_KEYS.behavioural] ?? null}
          >
            <p className="text-body-main text-on-surface-variant leading-relaxed mb-2">
              <span className="font-mono-label uppercase tracking-widest text-outline mr-1">
                Adversity:
              </span>
              {profile.adversity_response}
            </p>
            <AxisRows
              candidateId={candidateId}
              projectId={projectId}
              flagSet={flagSet}
              overrides={overrides}
              rows={[
                axisRow(
                  AXIS_KEYS.role_pattern,
                  "Role pattern",
                  ROLE_PATTERN_LABELS[
                    profile.role_pattern.value as RolePattern
                  ],
                  profile.role_pattern.evidence,
                  profile.role_pattern.confidence
                ),
                axisRow(
                  AXIS_KEYS.collaboration_style,
                  "Collaboration",
                  COLLABORATION_STYLE_LABELS[
                    profile.collaboration_style.value as CollaborationStyle
                  ],
                  profile.collaboration_style.evidence,
                  profile.collaboration_style.confidence
                ),
              ]}
            />
          </Section>

          <Section
            title="Cultural fit indicators"
            sectionKey={PSYCHOLOGY_SECTION_KEYS.cultural}
            candidateId={candidateId}
            projectId={projectId}
            annotation={notes[PSYCHOLOGY_SECTION_KEYS.cultural] ?? null}
          >
            <AxisRows
              candidateId={candidateId}
              projectId={projectId}
              flagSet={flagSet}
              overrides={overrides}
              rows={[
                axisRow(
                  AXIS_KEYS.hierarchy_preference,
                  "Hierarchy",
                  HIERARCHY_PREFERENCE_LABELS[
                    profile.hierarchy_preference.value as HierarchyPreference
                  ],
                  profile.hierarchy_preference.evidence,
                  profile.hierarchy_preference.confidence
                ),
                axisRow(
                  AXIS_KEYS.pace_preference,
                  "Pace",
                  PACE_PREFERENCE_LABELS[
                    profile.pace_preference.value as PacePreference
                  ],
                  profile.pace_preference.evidence,
                  profile.pace_preference.confidence
                ),
              ]}
            />
            <div className="mt-3 space-y-1.5">
              <h4 className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
                Motivation drivers
              </h4>
              <ul className="space-y-1">
                {profile.motivation_drivers.map((m, i) => (
                  <li
                    key={i}
                    className="flex items-baseline gap-2 font-mono-data text-body-main text-on-surface-variant"
                  >
                    <span className="font-mono-label text-mono-label text-primary uppercase tracking-widest min-w-[80px]">
                      {MOTIVATION_DRIVER_LABELS[m.driver as MotivationDriver]}
                    </span>
                    <span className="tabular-nums text-secondary-fixed-dim">
                      {m.weight}/100
                    </span>
                    <span className="text-on-surface-variant">{m.evidence}</span>
                  </li>
                ))}
              </ul>
            </div>
          </Section>

          {cultureMatch && (
            <Section
              title="Culture fit (vs. company profile)"
              sectionKey={PSYCHOLOGY_SECTION_KEYS.culture_match}
              candidateId={candidateId}
              projectId={projectId}
              annotation={
                notes[PSYCHOLOGY_SECTION_KEYS.culture_match] ?? null
              }
            >
              <CultureMatchView match={cultureMatch} />
            </Section>
          )}
        </div>
      )}
    </Panel>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Sub-components
// ────────────────────────────────────────────────────────────────────────

type AxisRowDef = {
  key: AxisKey;
  label: string;
  value: string;
  evidence: string;
  confidence: number;
};

function axisRow(
  key: AxisKey,
  label: string,
  value: string,
  evidence: string,
  confidence: number
): AxisRowDef {
  return { key, label, value, evidence, confidence };
}

function AxisRows({
  candidateId,
  projectId,
  flagSet,
  overrides,
  rows,
}: {
  candidateId: string;
  projectId: string;
  flagSet: Set<string>;
  overrides: ConfidenceOverrideMap;
  rows: AxisRowDef[];
}) {
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <AxisRowView
          key={r.key}
          candidateId={candidateId}
          projectId={projectId}
          row={r}
          flagged={flagSet.has(r.key)}
          override={overrides[r.key]?.value ?? null}
        />
      ))}
    </ul>
  );
}

function AxisRowView({
  candidateId,
  projectId,
  row,
  flagged,
  override,
}: {
  candidateId: string;
  projectId: string;
  row: AxisRowDef;
  flagged: boolean;
  override: number | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [draft, setDraft] = useState<number>(override ?? row.confidence);

  const toggleFlag = () => {
    if (pending) return;
    start(async () => {
      try {
        unwrap(await togglePsychologyFlagAction(candidateId, projectId, row.key));
        toast.success(flagged ? "Flag removed" : "Flagged for review");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Flag failed.");
      }
    });
  };

  const saveOverride = (value: number | null) => {
    if (pending) return;
    start(async () => {
      try {
        unwrap(await overridePsychologyConfidenceAction(
          candidateId,
          projectId,
          row.key,
          value
        ));
        toast.success(value === null ? "Override cleared" : "Confidence saved");
        setAdjustOpen(false);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Save failed.");
      }
    });
  };

  return (
    <li
      className={cn(
        "border px-3 py-2 grid grid-cols-1 md:grid-cols-[160px_1fr_auto] gap-2 items-baseline transition-colors",
        flagged
          ? "border-tertiary/60 bg-tertiary/5"
          : "border-outline-variant"
      )}
    >
      <span className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
        {row.label}
      </span>
      <div className="min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="font-mono-data text-body-main text-on-surface font-semibold">
            {row.value}
          </span>
          {flagged && (
            <span className="px-1.5 py-0 border border-tertiary/60 bg-tertiary/10 text-tertiary font-mono-label text-mono-label uppercase tracking-widest">
              <IconFlag size={11} />
          Recruiter flagged
            </span>
          )}
        </div>
        <div className="text-[13px] leading-relaxed text-on-surface-variant">
          {row.evidence}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <ConfidencePair
          ai={row.confidence}
          recruiter={override}
          onAdjust={() => setAdjustOpen((o) => !o)}
        />
        <button
          type="button"
          onClick={toggleFlag}
          disabled={pending}
          aria-label={flagged ? "Remove flag" : "Flag this assessment"}
          className={cn(
            "w-7 h-7 border flex items-center justify-center transition-colors disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary",
            flagged
              ? "border-tertiary/60 bg-tertiary/10 text-tertiary"
              : "border-outline-variant text-outline hover:border-tertiary hover:text-tertiary"
          )}
        >
          <IconFlag size={13} />
        </button>
      </div>
      {adjustOpen && (
        <div className="md:col-span-3 mt-2 bg-surface-container-low border border-outline-variant px-3 py-2 space-y-2">
          <div className="flex items-center gap-3 flex-wrap">
            <label className="flex-1 min-w-[200px]">
              <div className="flex items-baseline justify-between font-mono-label text-mono-label text-outline uppercase tracking-widest">
                <span>Your confidence</span>
                <span className="tabular-nums text-on-surface">
                  {draft}/100
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={draft}
                disabled={pending}
                onChange={(e) => setDraft(Number(e.target.value))}
                className="w-full accent-primary"
              />
            </label>
            <button
              type="button"
              onClick={() => saveOverride(draft)}
              disabled={pending}
              className="px-3 py-1.5 bg-primary-container text-on-primary-container font-mono-label text-mono-label uppercase tracking-widest hover:brightness-110 active:scale-[0.98] transition-[filter,transform] flex items-center gap-1.5 disabled:opacity-60"
            >
              Save
            </button>
            {override !== null && (
              <button
                type="button"
                onClick={() => saveOverride(null)}
                disabled={pending}
                className="px-3 py-1.5 border border-outline-variant text-on-surface-variant font-mono-label text-mono-label uppercase tracking-widest hover:border-error hover:text-error transition-colors disabled:opacity-60"
              >
                Clear
              </button>
            )}
            <button
              type="button"
              onClick={() => setAdjustOpen(false)}
              className="px-3 py-1.5 border border-outline-variant text-outline hover:text-on-surface font-mono-label text-mono-label uppercase tracking-widest"
            >
              Close
            </button>
          </div>
          <p className="font-mono-label text-mono-label text-outline uppercase tracking-widest leading-snug">
            AI estimate: {row.confidence}/100. Your override is stored
            separately and shown alongside.
          </p>
        </div>
      )}
    </li>
  );
}

function ConfidencePair({
  ai,
  recruiter,
  onAdjust,
}: {
  ai: number;
  recruiter: number | null;
  onAdjust: () => void;
}) {
  const showBoth = recruiter !== null && recruiter !== ai;
  const display = recruiter ?? ai;
  return (
    <button
      type="button"
      onClick={onAdjust}
      title="Adjust confidence"
      className="group w-32 text-left focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary"
    >
      <div className="flex items-baseline justify-between font-mono-label text-mono-label text-outline uppercase tracking-widest tabular-nums">
        <span>{showBoth ? "AI / You" : "Conf"}</span>
        <span>
          {showBoth ? (
            <>
              <span>{ai}</span>
              <span className="text-outline-variant"> / </span>
              <span className="text-primary">{recruiter}</span>
            </>
          ) : (
            <span>{display}</span>
          )}
        </span>
      </div>
      <div className="h-1 bg-surface-container-high overflow-hidden">
        <span
          className={cn(
            "block h-full transition-[width]",
            display >= 80
              ? "bg-secondary-fixed-dim"
              : display >= 50
                ? "bg-primary"
                : "bg-tertiary"
          )}
          style={{ width: `${display}%` }}
        />
      </div>
      <span className="font-mono-label text-mono-label text-outline group-hover:text-primary transition-colors uppercase tracking-widest inline-flex items-center gap-1 mt-0.5">
        Adjust
      </span>
    </button>
  );
}

function CultureMatchView({ match }: { match: CultureMatch }) {
  const tone =
    match.overall >= 80
      ? "text-secondary-fixed-dim"
      : match.overall >= 50
        ? "text-primary"
        : "text-tertiary";
  return (
    <div className="space-y-2">
      <div className="flex items-baseline gap-3">
        <span className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
          Overall match
        </span>
        <span className={cn("font-h2 text-h2 tabular-nums leading-none", tone)}>
          {match.overall}%
        </span>
      </div>
      <ul className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {match.axes.map((a, i) => (
          <li
            key={i}
            className={cn(
              "border px-2 py-1.5",
              a.is_risk
                ? "border-error/40 bg-error/5"
                : "border-outline-variant"
            )}
          >
            <div className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
              {a.label}
            </div>
            <div className="font-mono-data text-body-main text-on-surface tabular-nums">
              {a.score}%
            </div>
            <div className="font-mono-label text-mono-label text-on-surface-variant uppercase tracking-widest">
              {a.candidate} ↔ {a.company}
            </div>
          </li>
        ))}
      </ul>
      {match.risks.length > 0 && (
        <ul className="space-y-1 pt-1">
          {match.risks.map((r, i) => (
            <li
              key={i}
              className="font-mono-data text-body-main text-error flex items-start gap-2"
            >
              <span aria-hidden>⚠</span>
              <span>{r}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Section({
  title,
  sectionKey,
  candidateId,
  projectId,
  annotation,
  children,
}: {
  title: string;
  sectionKey: string;
  candidateId: string;
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
        unwrap(await savePsychologyAnnotationAction(
          candidateId,
          projectId,
          sectionKey,
          draft
        ));
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
          <span className="font-mono-label text-mono-label text-primary uppercase tracking-widest flex items-center gap-1">
            Your observation
          </span>
          <p className="text-[13px] leading-relaxed text-on-surface-variant leading-relaxed mt-1">
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
            className="w-full bg-surface-container-lowest border border-outline-variant px-3 py-2 font-mono-data text-body-main text-on-surface focus:border-primary focus:outline-none transition-colors resize-y leading-relaxed"
          />
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setEditing(false)}
              disabled={pending}
              className="px-3 py-1 border border-outline-variant text-on-surface-variant font-mono-label text-mono-label uppercase tracking-widest hover:border-primary hover:text-primary transition-colors disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={pending}
              className="px-3 py-1 bg-primary-container text-on-primary-container font-mono-label text-mono-label uppercase tracking-widest hover:brightness-110 active:scale-[0.98] transition-[filter,transform] flex items-center gap-1.5 disabled:opacity-60"
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
      <div className="font-mono-label text-mono-label text-primary uppercase tracking-widest flex items-center gap-1.5">
        Add context for the AI (optional)
      </div>
      <textarea
        value={draft}
        rows={3}
        disabled={pending}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-surface-container-lowest border border-outline-variant px-3 py-2 font-mono-data text-body-main text-on-surface focus:border-primary focus:outline-none transition-colors resize-y leading-relaxed"
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
          className="px-3 py-1.5 border border-outline-variant text-on-surface-variant font-mono-label text-mono-label uppercase tracking-widest hover:border-primary hover:text-primary transition-colors disabled:opacity-60"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onSubmit}
          disabled={pending}
          aria-busy={pending ? true : undefined}
          className="px-4 py-1.5 bg-primary-container text-on-primary-container font-mono-label text-mono-label uppercase tracking-widest hover:brightness-110 active:scale-[0.98] transition-[filter,transform] flex items-center gap-1.5 disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
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
  const day = Math.round(hr / 24);
  return `${day}d ago`;
}
