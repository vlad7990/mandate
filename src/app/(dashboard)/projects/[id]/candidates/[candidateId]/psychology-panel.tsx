"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
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
import { generatePsychologyAction } from "./actions";

export function PsychologyPanel({
  candidateId,
  projectId,
  initial,
  cultureMatch,
}: {
  candidateId: string;
  projectId: string;
  initial: CandidatePsychology | null;
  cultureMatch: CultureMatch | null;
}) {
  const router = useRouter();
  const [profile, setProfile] = useState<CandidatePsychology | null>(initial);
  const [pending, start] = useTransition();

  const handleGenerate = () => {
    if (pending) return;
    start(async () => {
      try {
        const next = await generatePsychologyAction(candidateId, projectId);
        setProfile(next);
        toast.success("Psychology profile generated");
        router.refresh();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Generation failed.";
        toast.error(msg);
      }
    });
  };

  return (
    <article className="bg-surface-container border border-outline-variant overflow-hidden">
      <header className="bg-surface-container-high px-4 py-2.5 border-b border-outline-variant flex items-center justify-between gap-2 flex-wrap">
        <span className="font-mono-label text-mono-label text-primary uppercase tracking-widest flex items-center gap-2">
          <span className="material-symbols-outlined text-[14px]" aria-hidden>
            psychology_alt
          </span>
          PSYCHOLOGY
        </span>
        <div className="flex items-center gap-2">
          {profile && (
            <span className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
              {formatRelative(profile.generated_at)}
            </span>
          )}
          <button
            type="button"
            onClick={handleGenerate}
            disabled={pending}
            aria-busy={pending ? true : undefined}
            className="px-3 py-1.5 bg-primary-container text-on-primary-container font-mono-label text-mono-label uppercase tracking-widest hover:brightness-110 active:scale-[0.98] transition-[filter,transform] flex items-center gap-1.5 disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <span
              className={cn(
                "material-symbols-outlined text-[14px]",
                pending && "animate-spin"
              )}
              aria-hidden
            >
              {pending ? "progress_activity" : profile ? "refresh" : "auto_awesome"}
            </span>
            {pending ? "Analysing" : profile ? "Regenerate" : "Generate Profile"}
          </button>
        </div>
      </header>

      {!profile ? (
        <div className="px-5 py-6 text-center">
          <p className="text-body-main text-on-surface-variant max-w-xl mx-auto">
            The Psychology Agent reads the parsed CV, the executive evaluation,
            and any recruiter notes to produce a calibrated behavioural
            profile — leadership style, risk tolerance, change orientation,
            collaboration signals, and cultural-fit indicators.
          </p>
        </div>
      ) : (
        <div className="p-4 space-y-4">
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

          <Section title="Leadership style">
            <RatingChips
              rows={[
                {
                  label: "Style",
                  value: LEADERSHIP_STYLE_LABELS[
                    profile.leadership_style.value as LeadershipStyle
                  ],
                  evidence: profile.leadership_style.evidence,
                  confidence: profile.leadership_style.confidence,
                },
                {
                  label: "Risk tolerance",
                  value: RISK_TOLERANCE_LABELS[
                    profile.risk_tolerance.value as RiskTolerance
                  ],
                  evidence: profile.risk_tolerance.evidence,
                  confidence: profile.risk_tolerance.confidence,
                },
                {
                  label: "Change orientation",
                  value: CHANGE_ORIENTATION_LABELS[
                    profile.change_orientation.value as ChangeOrientation
                  ],
                  evidence: profile.change_orientation.evidence,
                  confidence: profile.change_orientation.confidence,
                },
              ]}
            />
          </Section>

          <Section title="Behavioural patterns">
            <p className="text-body-main text-on-surface-variant leading-relaxed mb-2">
              <span className="font-mono-label uppercase tracking-widest text-outline mr-1">
                Adversity:
              </span>
              {profile.adversity_response}
            </p>
            <RatingChips
              rows={[
                {
                  label: "Role pattern",
                  value: ROLE_PATTERN_LABELS[
                    profile.role_pattern.value as RolePattern
                  ],
                  evidence: profile.role_pattern.evidence,
                  confidence: profile.role_pattern.confidence,
                },
                {
                  label: "Collaboration",
                  value: COLLABORATION_STYLE_LABELS[
                    profile.collaboration_style.value as CollaborationStyle
                  ],
                  evidence: profile.collaboration_style.evidence,
                  confidence: profile.collaboration_style.confidence,
                },
              ]}
            />
          </Section>

          <Section title="Cultural fit indicators">
            <RatingChips
              rows={[
                {
                  label: "Hierarchy",
                  value: HIERARCHY_PREFERENCE_LABELS[
                    profile.hierarchy_preference.value as HierarchyPreference
                  ],
                  evidence: profile.hierarchy_preference.evidence,
                  confidence: profile.hierarchy_preference.confidence,
                },
                {
                  label: "Pace",
                  value: PACE_PREFERENCE_LABELS[
                    profile.pace_preference.value as PacePreference
                  ],
                  evidence: profile.pace_preference.evidence,
                  confidence: profile.pace_preference.confidence,
                },
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
            <Section title="Culture fit (vs. company profile)">
              <CultureMatchView match={cultureMatch} />
            </Section>
          )}
        </div>
      )}
    </article>
  );
}

function RatingChips({
  rows,
}: {
  rows: Array<{
    label: string;
    value: string;
    evidence: string;
    confidence: number;
  }>;
}) {
  return (
    <ul className="space-y-2">
      {rows.map((r, i) => (
        <li
          key={i}
          className="grid grid-cols-1 md:grid-cols-[160px_1fr_auto] gap-2 items-baseline"
        >
          <span className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
            {r.label}
          </span>
          <div className="min-w-0">
            <div className="font-mono-data text-body-main text-on-surface font-semibold">
              {r.value}
            </div>
            <div className="font-mono-data text-body-main text-on-surface-variant leading-relaxed">
              {r.evidence}
            </div>
          </div>
          <ConfidenceBar value={r.confidence} />
        </li>
      ))}
    </ul>
  );
}

function ConfidenceBar({ value }: { value: number }) {
  const v = Math.max(0, Math.min(100, value));
  const tone =
    v >= 80
      ? "bg-secondary-fixed-dim"
      : v >= 50
        ? "bg-primary"
        : "bg-tertiary";
  return (
    <div className="w-24">
      <div className="flex items-baseline justify-between font-mono-label text-mono-label text-outline uppercase tracking-widest tabular-nums">
        <span>Conf</span>
        <span>{v}</span>
      </div>
      <div className="h-1 bg-surface-container-high overflow-hidden">
        <span
          className={cn("block h-full transition-[width]", tone)}
          style={{ width: `${v}%` }}
        />
      </div>
    </div>
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
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2 border-t border-outline-variant/40 pt-3 first:border-t-0 first:pt-0">
      <h3 className="font-mono-label text-mono-label text-primary uppercase tracking-widest">
        {title}
      </h3>
      {children}
    </section>
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
