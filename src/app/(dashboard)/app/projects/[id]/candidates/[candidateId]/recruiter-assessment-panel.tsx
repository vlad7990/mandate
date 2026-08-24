"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { IconCheck, IconRefresh } from "@/components/icons";
import { PANEL_BODY, Panel } from "@/components/projects/panel";
import { TIER_BANDS, TIER_ORDER, type Tier } from "@/lib/ranking/tiers";
import {
  DIMENSION_VERDICTS,
  DIMENSION_VERDICT_LABELS,
  PRESENT_DECISIONS,
  PRESENT_DECISION_LABELS,
  type DimensionNotes,
  type DimensionVerdict,
  type PresentDecision,
  type RecruiterAssessment,
} from "@/lib/recruiter-assessment";
import {
  DIMENSION_KEYS,
  type DimensionKey,
} from "@/lib/ai/onboarding-analysis";
import {
  TierComparison,
  tierToneClass,
} from "@/components/ui/tier-comparison";
import { updateRecruiterAssessment } from "./actions";
import { unwrap } from "@/lib/actions/result";

// Recruiter override layer rendered below the AI evaluation report on
// the candidate profile. Captures tier, present-decision, observed
// strengths, and free-form fit notes. Saves are explicit (Save button)
// rather than auto-on-blur because edits often happen as a single
// session — a recruiter touches multiple fields then commits.

const PRESENT_TONE: Record<PresentDecision, string> = {
  yes: "border-secondary-fixed-dim/60 bg-secondary-fixed-dim/10 text-secondary-fixed-dim",
  maybe: "border-tertiary/60 bg-tertiary/10 text-tertiary",
  no: "border-error/60 bg-error/10 text-error",
};

const DIMENSION_LABELS: Record<DimensionKey, string> = {
  technical: "Technical",
  domain: "Domain",
  leadership: "Leadership",
  regulatory: "Regulatory",
  transformation: "Transformation",
};

const VERDICT_TONE: Record<DimensionVerdict, string> = {
  strong:
    "border-secondary-fixed-dim/60 bg-secondary-fixed-dim/10 text-secondary-fixed-dim",
  adequate: "border-primary-container/60 bg-primary-container/10 text-primary",
  gap: "border-error/60 bg-error/10 text-error",
  unknown: "border-outline bg-surface-container-low text-on-surface-variant",
};

export function RecruiterAssessmentPanel({
  candidateId,
  projectId,
  aiTier,
  initial,
}: {
  candidateId: string;
  projectId: string;
  aiTier: Tier | null;
  initial: RecruiterAssessment;
}) {
  const router = useRouter();
  const [tier, setTier] = useState<Tier | null>(initial.tier);
  const [wouldPresent, setWouldPresent] = useState<PresentDecision | null>(
    initial.would_present
  );
  const [fitNotes, setFitNotes] = useState(initial.fit_notes);
  const [strengths, setStrengths] = useState<string[]>(initial.strengths);
  const [newStrength, setNewStrength] = useState("");
  const [dimensionNotes, setDimensionNotes] = useState<DimensionNotes>(
    initial.dimension_notes
  );
  const [pending, start] = useTransition();

  const dirty =
    tier !== initial.tier ||
    wouldPresent !== initial.would_present ||
    fitNotes !== initial.fit_notes ||
    !arraysEqual(strengths, initial.strengths) ||
    JSON.stringify(dimensionNotes) !== JSON.stringify(initial.dimension_notes);

  const setDimension = (
    dimension: DimensionKey,
    patch: Partial<{ verdict: DimensionVerdict; note: string }>
  ) => {
    setDimensionNotes((prev) => {
      const current = prev[dimension] ?? { verdict: "unknown" as const, note: "" };
      return { ...prev, [dimension]: { ...current, ...patch } };
    });
  };

  const handleAddStrength = () => {
    const trimmed = newStrength.trim();
    if (trimmed.length === 0) return;
    if (strengths.includes(trimmed)) {
      toast.error("Already in the list.");
      return;
    }
    setStrengths([...strengths, trimmed]);
    setNewStrength("");
  };

  const handleRemoveStrength = (i: number) => {
    setStrengths(strengths.filter((_, idx) => idx !== i));
  };

  const handleStrengthKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddStrength();
    }
  };

  const handleSave = () => {
    if (pending) return;
    start(async () => {
      try {
        unwrap(await updateRecruiterAssessment(candidateId, projectId, {
          tier,
          fit_notes: fitNotes,
          strengths,
          would_present: wouldPresent,
          dimension_notes: dimensionNotes,
        }));
        toast.success("Recruiter assessment saved");
        router.refresh();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Save failed.";
        toast.error(msg);
      }
    });
  };

  const handleClear = () => {
    if (pending) return;
    if (!window.confirm("Clear your recruiter assessment for this candidate?")) {
      return;
    }
    setTier(null);
    setWouldPresent(null);
    setFitNotes("");
    setStrengths([]);
    setNewStrength("");
    setDimensionNotes({});
    start(async () => {
      try {
        unwrap(await updateRecruiterAssessment(candidateId, projectId, {
          tier: null,
          fit_notes: "",
          strengths: [],
          would_present: null,
          dimension_notes: {},
        }));
        toast.success("Assessment cleared");
        router.refresh();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Clear failed.";
        toast.error(msg);
      }
    });
  };

  return (
    <Panel
      title="Your assessment"
      action={<TierComparison aiTier={aiTier} recruiterTier={tier} />}
    >
      <div className={cn(PANEL_BODY, "flex flex-col gap-5")}>
        {/* Tier selector */}
        <Field
          label="Recruiter tier"
          hint="Your own read on this candidate, independent of the AI score."
        >
          <div className="flex flex-wrap gap-2">
            {TIER_ORDER.map((t) => {
              const active = tier === t;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTier(active ? null : t)}
                  className={cn(
                    "px-3 py-1.5 border font-mono-label text-mono-label uppercase tracking-widest transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
                    active
                      ? tierToneClass(t)
                      : "border-outline-variant text-on-surface-variant hover:border-primary hover:text-primary"
                  )}
                >
                  {TIER_BANDS[t].label}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setTier(null)}
              className={cn(
                "px-3 py-1.5 border font-mono-label text-mono-label uppercase tracking-widest transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
                tier === null
                  ? "border-outline bg-surface-container-low text-on-surface"
                  : "border-outline-variant text-outline hover:text-on-surface-variant"
              )}
            >
              No call
            </button>
          </div>
        </Field>

        {/* Would present? */}
        <Field
          label="Would you present this candidate?"
          hint="Your gut decision after reading the dossier."
        >
          <div className="flex flex-wrap gap-2">
            {PRESENT_DECISIONS.map((d) => {
              const active = wouldPresent === d;
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => setWouldPresent(active ? null : d)}
                  className={cn(
                    "px-3 py-1.5 border font-mono-label text-mono-label uppercase tracking-widest transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
                    active
                      ? PRESENT_TONE[d]
                      : "border-outline-variant text-on-surface-variant hover:border-primary hover:text-primary"
                  )}
                >
                  {PRESENT_DECISION_LABELS[d]}
                </button>
              );
            })}
          </div>
        </Field>

        {/* Per-dimension judgement — what makes this comparable */}
        <Field
          label="Dimension read"
          hint="Your call per dimension. This is the only human judgement the comparison grid can line up candidate against candidate — leave anything you have not assessed as 'Not assessed' rather than guessing."
        >
          <div className="flex flex-col gap-3">
            {DIMENSION_KEYS.map((dimension) => {
              const entry = dimensionNotes[dimension];
              const verdict = entry?.verdict ?? "unknown";
              return (
                <div key={dimension} className="space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono-label text-mono-label text-on-surface-variant uppercase tracking-widest w-28 shrink-0">
                      {DIMENSION_LABELS[dimension]}
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {DIMENSION_VERDICTS.map((v) => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => setDimension(dimension, { verdict: v })}
                          aria-pressed={verdict === v}
                          className={cn(
                            "px-2 py-1 border font-mono-label text-mono-label uppercase tracking-widest transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
                            verdict === v
                              ? VERDICT_TONE[v]
                              : "border-outline-variant text-on-surface-variant hover:border-primary hover:text-primary"
                          )}
                        >
                          {DIMENSION_VERDICT_LABELS[v]}
                        </button>
                      ))}
                    </div>
                  </div>
                  {verdict !== "unknown" && (
                    <input
                      value={entry?.note ?? ""}
                      onChange={(e) =>
                        setDimension(dimension, { note: e.target.value })
                      }
                      placeholder="Optional — what you saw that says so"
                      className="w-full px-3 py-1.5 bg-surface-container-lowest border border-outline-variant font-mono-data text-body-main text-on-surface placeholder:text-outline focus-visible:outline-none focus-visible:border-primary"
                    />
                  )}
                </div>
              );
            })}
          </div>
        </Field>

        {/* Strengths list */}
        <Field
          label="Key observations"
          hint="What you've noticed that the AI may have missed. Press Enter to add."
        >
          <div className="flex items-center gap-2 mb-2">
            <input
              type="text"
              value={newStrength}
              onChange={(e) => setNewStrength(e.target.value)}
              onKeyDown={handleStrengthKey}
              placeholder="e.g. Strong network with FCA seniors; built relationship over 8 years."
              disabled={pending}
              className="flex-1 bg-surface-container-lowest border border-outline-variant px-3 py-2 font-mono-data text-body-main text-on-surface focus:border-primary focus:outline-none transition-colors"
            />
            <button
              type="button"
              onClick={handleAddStrength}
              disabled={pending || newStrength.trim().length === 0}
              className="px-3 py-2 border border-outline-variant text-on-surface-variant font-mono-label text-mono-label uppercase tracking-widest hover:border-primary hover:text-primary transition-colors flex items-center gap-1 disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              Add
            </button>
          </div>
          {strengths.length === 0 ? (
            <p className="font-mono-label text-mono-label text-outline italic uppercase tracking-widest">
              No observations recorded yet.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {strengths.map((s, i) => (
                <li
                  key={i}
                  className="group flex items-start gap-2 font-mono-data text-body-main text-on-surface-variant bg-surface-container-low border border-outline-variant px-3 py-2"
                >
                  <span className="text-secondary-fixed-dim shrink-0" aria-hidden>
                    +
                  </span>
                  <span className="flex-1 min-w-0">{s}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveStrength(i)}
                    disabled={pending}
                    aria-label={`Remove "${s}"`}
                    className="text-outline opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 hover:text-error transition-[opacity,color] disabled:opacity-30 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-error"
                  >
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Field>

        {/* Fit notes */}
        <Field
          label="Fit notes"
          hint="Anything else worth recording — context, concerns, off-the-record signals."
        >
          <textarea
            value={fitNotes}
            onChange={(e) => setFitNotes(e.target.value)}
            rows={5}
            disabled={pending}
            placeholder="Free-form notes the AI didn't see — call summary, reference reads, market intel, salary signals…"
            className="w-full bg-surface-container-lowest border border-outline-variant px-3 py-2 font-mono-data text-body-main text-on-surface focus:border-primary focus:outline-none transition-colors resize-y leading-relaxed"
          />
        </Field>

        <footer className="flex items-center justify-between gap-2 flex-wrap pt-2 border-t border-outline-variant/40">
          <span className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
            {initial.updated_at
              ? `Last saved ${formatRelative(initial.updated_at)}`
              : "Not yet saved"}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleClear}
              disabled={pending}
              className="px-3 py-1.5 border border-outline-variant text-outline hover:border-error hover:text-error font-mono-label text-mono-label uppercase tracking-widest transition-colors disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-error"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={pending || !dirty}
              aria-busy={pending ? true : undefined}
              className="px-4 py-1.5 btn-notch bg-primary-container text-on-primary-container font-mono-label text-mono-label uppercase tracking-widest hover:brightness-110 active:scale-[0.98] transition-[filter,transform] flex items-center gap-1.5 disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              {pending ? (
                <IconRefresh size={14} className="animate-spin" />
              ) : (
                <IconCheck size={14} />
              )}
              {pending ? "Saving" : dirty ? "Save Assessment" : "Saved"}
            </button>
          </div>
        </footer>
      </div>
    </Panel>
  );

  // Local helper used by the validators above.
  function arraysEqual(a: string[], b: string[]): boolean {
    if (a.length !== b.length) return false;
    return a.every((v, i) => v === b[i]);
  }
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="space-y-0.5">
        <h4 className="font-mono-label text-mono-label text-on-surface uppercase tracking-widest">
          {label}
        </h4>
        {hint && (
          <p className="font-mono-label text-mono-label text-outline uppercase tracking-widest leading-snug">
            {hint}
          </p>
        )}
      </div>
      {children}
    </div>
  );
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return iso;
  const delta = Date.now() - then;
  const sec = Math.round(delta / 1000);
  if (sec < 45) return "just now";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}d ago`;
  const month = Math.round(day / 30);
  if (month < 12) return `${month}mo ago`;
  return `${Math.round(month / 12)}y ago`;
}

// Note: TierComparison / TierBadge live in @/components/ui/tier-comparison
// — the candidate hero, ranking, and shortlist views import directly
// from there.
