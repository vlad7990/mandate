"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
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
import { generateCompanyCultureAction } from "./actions";

export function CultureIntelligencePanel({
  projectId,
  initial,
}: {
  projectId: string;
  initial: CultureProfile | null;
}) {
  const router = useRouter();
  const [profile, setProfile] = useState<CultureProfile | null>(initial);
  const [pending, start] = useTransition();

  const handleGenerate = () => {
    if (pending) return;
    start(async () => {
      try {
        const next = await generateCompanyCultureAction(projectId);
        setProfile(next);
        toast.success("Culture profile generated");
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
            corporate_fare
          </span>
          CULTURE_INTELLIGENCE
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
              {pending
                ? "progress_activity"
                : profile
                  ? "refresh"
                  : "auto_awesome"}
            </span>
            {pending ? "Analysing" : profile ? "Refresh" : "Analyze Culture Fit"}
          </button>
        </div>
      </header>

      {!profile ? (
        <div className="px-5 py-6 text-center">
          <p className="text-body-main text-on-surface-variant max-w-xl mx-auto">
            The Culture Agent reads company context, the recruiter&rsquo;s
            onboarding answers, and feedback patterns to produce a four-axis
            culture profile (risk appetite, decision speed, leadership
            preference, change readiness). Used to score candidate culture-fit
            alongside technical fit.
          </p>
        </div>
      ) : (
        <div className="p-4 space-y-4">
          <p className="text-on-surface text-body-main leading-relaxed">
            {profile.summary}
          </p>

          <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <AxisCard
              label="Risk appetite"
              value={
                CULTURE_RISK_APPETITE_LABELS[
                  profile.risk_appetite.value as CultureRiskAppetite
                ]
              }
              evidence={profile.risk_appetite.evidence}
              confidence={profile.risk_appetite.confidence}
            />
            <AxisCard
              label="Decision speed"
              value={
                DECISION_SPEED_LABELS[
                  profile.decision_speed.value as DecisionSpeed
                ]
              }
              evidence={profile.decision_speed.evidence}
              confidence={profile.decision_speed.confidence}
            />
            <AxisCard
              label="Leadership preference"
              value={
                LEADERSHIP_PREFERENCE_LABELS[
                  profile.leadership_preference.value as LeadershipPreference
                ]
              }
              evidence={profile.leadership_preference.evidence}
              confidence={profile.leadership_preference.confidence}
            />
            <AxisCard
              label="Change readiness"
              value={
                CHANGE_READINESS_LABELS[
                  profile.change_readiness.value as ChangeReadiness
                ]
              }
              evidence={profile.change_readiness.evidence}
              confidence={profile.change_readiness.confidence}
            />
          </ul>

          {profile.red_flags.length > 0 && (
            <section className="space-y-2">
              <h3 className="font-mono-label text-mono-label text-error uppercase tracking-widest">
                Culture red flags
              </h3>
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
                      <span className="font-mono-data text-body-main text-on-surface font-semibold">
                        {r.label}
                      </span>
                    </div>
                    <p className="font-mono-data text-body-main text-on-surface-variant">
                      {r.detail}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div className="bg-primary-container/10 border-l-2 border-l-primary-container px-3 py-2">
            <span className="font-mono-label text-mono-label text-primary uppercase tracking-widest">
              Candidate-facing pitch
            </span>
            <p className="text-on-surface text-body-main leading-relaxed mt-1">
              {profile.candidate_facing_pitch}
            </p>
          </div>
        </div>
      )}
    </article>
  );
}

function AxisCard({
  label,
  value,
  evidence,
  confidence,
}: {
  label: string;
  value: string;
  evidence: string;
  confidence: number;
}) {
  const tone =
    confidence >= 80
      ? "bg-secondary-fixed-dim"
      : confidence >= 50
        ? "bg-primary"
        : "bg-tertiary";
  return (
    <li className="bg-surface-container-low border border-outline-variant p-3 space-y-2">
      <div className="flex items-baseline justify-between">
        <span className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
          {label}
        </span>
        <span className="font-mono-label text-mono-label text-outline uppercase tracking-widest tabular-nums">
          {confidence}%
        </span>
      </div>
      <div className="font-h2 text-h2 text-on-surface uppercase tracking-tight">
        {value}
      </div>
      <p className="font-mono-data text-body-main text-on-surface-variant leading-relaxed">
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
