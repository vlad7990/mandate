"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { IconRefresh, IconSpark } from "@/components/icons";
import {
  PANEL_BODY,
  PANEL_BUTTON,
  Panel,
  PanelMeta,
} from "@/components/projects/panel";
import type { ClientPsychology } from "@/lib/ai/client-psychology-agent";
import { generateClientPsychologyAction } from "./actions";
import { unwrap } from "@/lib/actions/result";

export function ClientIntelligencePanel({
  projectId,
  initial,
  feedbackCount,
}: {
  projectId: string;
  initial: ClientPsychology | null;
  feedbackCount: number;
}) {
  const router = useRouter();
  const [profile, setProfile] = useState<ClientPsychology | null>(initial);
  const [pending, start] = useTransition();
  const ready = feedbackCount >= 3;

  const handleGenerate = () => {
    if (pending || !ready) return;
    start(async () => {
      try {
        const next = unwrap(await generateClientPsychologyAction(projectId));
        setProfile(next);
        toast.success("Client intelligence updated");
        router.refresh();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Generation failed.";
        toast.error(msg);
      }
    });
  };

  return (
    <Panel
      title="Client intelligence"
      meta={
        <PanelMeta>
          {profile
            ? `${profile.feedback_count} feedback events · ${formatRelative(profile.generated_at)}`
            : ready
              ? "Not generated"
              : `Needs ${3 - feedbackCount} more feedback row${3 - feedbackCount === 1 ? "" : "s"}`}
        </PanelMeta>
      }
      action={
        <button
          type="button"
          onClick={handleGenerate}
          disabled={pending || !ready}
          aria-busy={pending ? true : undefined}
          title={
            ready
              ? undefined
              : `Need ${3 - feedbackCount} more feedback rows before patterns emerge.`
          }
          className={PANEL_BUTTON}
        >
          {pending || profile ? (
            <IconRefresh size={14} className={cn(pending && "animate-spin")} />
          ) : (
            <IconSpark size={14} />
          )}
          {pending ? "Analysing" : profile ? "Refresh" : "Generate"}
        </button>
      }
    >
      {!profile ? (
        <div className={PANEL_BODY}>
          <p className="max-w-[70ch] text-[13px] leading-relaxed text-on-surface-variant">
            The Client Psychology Agent reads the project&rsquo;s feedback
            history and HM portal reviews to surface what the hiring manager
            actually values, the gap between stated and revealed preferences,
            bias patterns, deal-breakers, and predictions for upcoming
            candidates. Available once {3 - feedbackCount > 0
              ? `${3 - feedbackCount} more feedback row${3 - feedbackCount === 1 ? "" : "s"} land`
              : "feedback patterns are detectable"}.
          </p>
        </div>
      ) : (
        <div className={cn(PANEL_BODY, "flex flex-col gap-4")}>
          <p className="text-[13px] leading-relaxed text-on-surface">
            {profile.summary}
          </p>

          {profile.stated_vs_revealed && (
            <div className="bg-tertiary/10 border-l-2 border-l-tertiary px-3 py-2 space-y-1">
              <span className="font-mono-label text-mono-label text-tertiary uppercase tracking-widest">
                Stated vs Revealed
              </span>
              <p className="text-body-main text-on-surface-variant leading-relaxed">
                <span className="font-mono-label uppercase tracking-widest text-outline mr-1">
                  Said:
                </span>
                {profile.stated_vs_revealed.stated}
              </p>
              <p className="text-body-main text-on-surface-variant leading-relaxed">
                <span className="font-mono-label uppercase tracking-widest text-outline mr-1">
                  Did:
                </span>
                {profile.stated_vs_revealed.revealed}
              </p>
              <p className="text-body-main text-on-surface italic leading-relaxed">
                {profile.stated_vs_revealed.delta}
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Section title="Revealed preferences">
              <ul className="flex flex-col gap-3">
                {profile.revealed_preferences.map((p, i) => (
                  /*
                    Was a three-column grid with the topic inside an 80px
                    chip: every topic longer than a word overflowed its box
                    and printed on top of the detail text. The direction is
                    the chip — two values, one word each — and the topic is
                    the row's heading, which is what it reads as.
                  */
                  <li key={i} className="flex flex-col gap-1">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span
                        className={cn(
                          "shrink-0 border px-1.5 py-0.5 font-mono-label text-[10px] font-bold uppercase tracking-[0.1em]",
                          p.direction === "favours"
                            ? "border-secondary-fixed-dim/60 bg-secondary-fixed-dim/10 text-secondary-fixed-dim"
                            : "border-error/60 bg-error/10 text-error"
                        )}
                      >
                        {p.direction}
                      </span>
                      <span className="min-w-0 flex-1 text-[13px] font-semibold text-on-surface">
                        {p.topic}
                      </span>
                      <span className="shrink-0 font-mono-data text-[11px] tabular-nums text-outline">
                        {p.confidence}%
                      </span>
                    </div>
                    <p className="text-[13px] leading-relaxed text-on-surface-variant">
                      {p.detail}
                    </p>
                  </li>
                ))}
              </ul>
            </Section>

            <Section title="Bias flags">
              {profile.bias_flags.length === 0 ? (
                <p className="font-mono-label text-mono-label text-outline italic uppercase tracking-widest">
                  None detected at this confidence.
                </p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {profile.bias_flags.map((b, i) => (
                    <li key={i} className="space-y-0.5">
                      <div className="flex items-baseline gap-2">
                        <SeverityChip severity={b.severity} />
                        <span className="text-[13px] leading-relaxed text-on-surface font-semibold">
                          {b.label}
                        </span>
                      </div>
                      <p className="text-[13px] leading-relaxed text-on-surface-variant">
                        {b.detail}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </div>

          <Section title="Deal-breakers">
            {profile.deal_breakers.length === 0 ? (
              <p className="font-mono-label text-mono-label text-outline italic uppercase tracking-widest">
                No consistent reject patterns yet.
              </p>
            ) : (
              <ul className="flex flex-col gap-3">
                {profile.deal_breakers.map((d, i) => (
                  <li
                    key={i}
                    className="grid grid-cols-[1fr_auto] gap-2 items-baseline"
                  >
                    <div>
                      <span className="text-[13px] leading-relaxed text-on-surface font-semibold">
                        {d.pattern}
                      </span>
                      <p className="text-[13px] leading-relaxed text-on-surface-variant">
                        {d.detail}
                      </p>
                    </div>
                    <span className="font-mono-label text-mono-label text-outline uppercase tracking-widest tabular-nums">
                      {d.confidence}%
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Predictions">
            <ul className="space-y-2">
              {profile.predictions.map((p, i) => (
                <li
                  key={i}
                  className="bg-surface-container-low border border-outline-variant px-3 py-2 space-y-0.5"
                >
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <OutcomeChip outcome={p.likely_outcome} />
                    <span className="text-[13px] leading-relaxed text-on-surface font-semibold">
                      {p.scenario}
                    </span>
                    <span className="ml-auto font-mono-label text-mono-label text-outline uppercase tracking-widest tabular-nums">
                      {p.confidence}%
                    </span>
                  </div>
                  <p className="text-[13px] leading-relaxed text-on-surface-variant">
                    {p.rationale}
                  </p>
                </li>
              ))}
            </ul>
          </Section>

          <div className="bg-primary-container/10 border-l-2 border-l-primary-container px-3 py-2">
            <span className="font-mono-label text-mono-label text-primary uppercase tracking-widest">
              Next slate guidance
            </span>
            <p className="text-on-surface text-body-main leading-relaxed mt-1">
              {profile.next_slate_guidance}
            </p>
          </div>
        </div>
      )}
    </Panel>
  );
}

function SeverityChip({
  severity,
}: {
  severity: "low" | "medium" | "high";
}) {
  const tone =
    severity === "high"
      ? "border-error/60 bg-error/10 text-error"
      : severity === "medium"
        ? "border-tertiary/60 bg-tertiary/10 text-tertiary"
        : "border-outline-variant bg-surface-container-high text-on-surface-variant";
  return (
    <span
      className={cn(
        "px-1.5 py-0.5 border font-mono-label text-mono-label uppercase tracking-widest",
        tone
      )}
    >
      {severity}
    </span>
  );
}

function OutcomeChip({
  outcome,
}: {
  outcome: "approve" | "reject" | "maybe";
}) {
  const tone =
    outcome === "approve"
      ? "border-secondary-fixed-dim/60 bg-secondary-fixed-dim/10 text-secondary-fixed-dim"
      : outcome === "reject"
        ? "border-error/60 bg-error/10 text-error"
        : "border-tertiary/60 bg-tertiary/10 text-tertiary";
  return (
    <span
      className={cn(
        "px-1.5 py-0.5 border font-mono-label text-mono-label uppercase tracking-widest",
        tone
      )}
    >
      {outcome}
    </span>
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
    <section className="space-y-2">
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
  return `${Math.round(hr / 24)}d ago`;
}
