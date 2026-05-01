"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { HiringManagerIntelligenceReport } from "@/lib/ai/hiring-manager-research-agent";
import { researchHiringManagerAction } from "./actions";

const HM_RESEARCH_STEPS = [
  "Verifying identity",
  "Reading career arc",
  "Searching interviews",
  "Synthesising",
] as const;

export function HMIntelligencePanel({
  projectId,
  hmName,
  hmRole,
  initial,
}: {
  projectId: string;
  /** First stakeholder name from onboarding. Null when none captured. */
  hmName: string | null;
  hmRole: string | null;
  initial: HiringManagerIntelligenceReport | null;
}) {
  const router = useRouter();
  const [report, setReport] = useState<HiringManagerIntelligenceReport | null>(
    initial
  );
  const [pending, start] = useTransition();
  const [runId, setRunId] = useState(0);
  const [sourcesOpen, setSourcesOpen] = useState(false);

  const noStakeholder = !hmName;

  const handleResearch = () => {
    if (pending || noStakeholder) return;
    setRunId((r) => r + 1);
    start(async () => {
      try {
        const next = await researchHiringManagerAction(projectId);
        setReport(next);
        toast.success("HM intelligence refreshed");
        router.refresh();
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Research failed."
        );
      }
    });
  };

  return (
    <article className="bg-surface-container border border-outline-variant overflow-hidden">
      <header className="bg-surface-container-high px-4 py-2.5 border-b border-outline-variant flex items-center justify-between gap-2 flex-wrap">
        <span className="font-mono-label text-mono-label text-primary uppercase tracking-widest flex items-center gap-2">
          <span className="material-symbols-outlined text-[14px]" aria-hidden>
            account_circle
          </span>
          HM_INTELLIGENCE
          {hmName && (
            <span className="text-outline normal-case tracking-normal font-mono-data ml-1">
              · {hmName}
            </span>
          )}
        </span>
        <div className="flex items-center gap-2">
          {report && (
            <span className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
              Last researched {formatRelative(report.generated_at)}
            </span>
          )}
          <button
            type="button"
            onClick={handleResearch}
            disabled={pending || noStakeholder}
            title={
              noStakeholder
                ? "Add a hiring manager via onboarding before researching"
                : undefined
            }
            className="px-3 py-1.5 bg-primary-container text-on-primary-container font-mono-label text-mono-label uppercase tracking-widest hover:brightness-110 active:scale-[0.98] transition-[filter,transform] flex items-center gap-1.5 disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <span
              className={cn(
                "material-symbols-outlined text-[14px]",
                pending && "animate-spin"
              )}
              aria-hidden
            >
              {pending ? "progress_activity" : report ? "refresh" : "auto_awesome"}
            </span>
            {pending
              ? "Researching"
              : report
                ? "Re-research HM"
                : "Research HM"}
          </button>
        </div>
      </header>

      {pending && <ProgressTracker key={runId} />}

      {noStakeholder ? (
        <div className="px-5 py-6 text-center">
          <p className="text-body-main text-on-surface-variant max-w-xl mx-auto">
            No hiring manager captured yet. Add the HM as a stakeholder in
            the onboarding step before running this agent.
          </p>
        </div>
      ) : !report && !pending ? (
        <div className="px-5 py-6 text-center">
          <p className="text-body-main text-on-surface-variant max-w-xl mx-auto">
            Run real-time web research on{" "}
            <span className="text-on-surface font-semibold">{hmName}</span>
            {hmRole && (
              <span className="text-on-surface-variant"> ({hmRole})</span>
            )}
            : reads career trajectory, leadership style signals, public
            priorities, and surfaces likely concerns, rapport-builders, and
            red lines.
          </p>
        </div>
      ) : report ? (
        <div className="p-4 space-y-4">
          <Section title="Background">
            <p className="text-on-surface text-body-main leading-relaxed whitespace-pre-line">
              {report.background_summary}
            </p>
          </Section>

          <Section title="Career trajectory">
            <p className="text-on-surface text-body-main leading-relaxed whitespace-pre-line">
              {report.career_trajectory}
            </p>
          </Section>

          {report.leadership_style_signals.length > 0 && (
            <Section title="Leadership style signals">
              <ChipList items={report.leadership_style_signals} tone="primary" />
            </Section>
          )}

          {report.known_priorities.length > 0 && (
            <Section title="Known priorities">
              <ChipList
                items={report.known_priorities}
                tone="secondary"
                marker="★"
              />
            </Section>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {report.likely_concerns.length > 0 && (
              <SignalColumn
                title="Likely concerns"
                items={report.likely_concerns}
                tone="warn"
                icon="warning"
              />
            )}
            {report.rapport_builders.length > 0 && (
              <SignalColumn
                title="Rapport builders"
                items={report.rapport_builders}
                tone="positive"
                icon="favorite"
              />
            )}
          </div>

          {report.red_lines.length > 0 && (
            <Section title="Red lines">
              <ul className="space-y-1">
                {report.red_lines.map((r, i) => (
                  <li
                    key={i}
                    className="bg-error/5 border-l-2 border-l-error px-3 py-1.5 font-mono-data text-body-main text-on-surface flex items-start gap-2"
                  >
                    <span
                      className="material-symbols-outlined text-error text-[14px] mt-0.5"
                      style={{ fontVariationSettings: "'FILL' 1" }}
                      aria-hidden
                    >
                      block
                    </span>
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {report.sources.length > 0 && (
            <SourcesList
              sources={report.sources}
              open={sourcesOpen}
              onToggle={() => setSourcesOpen((o) => !o)}
            />
          )}
        </div>
      ) : null}
    </article>
  );
}

function ProgressTracker() {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const interval = window.setInterval(() => {
      setIdx((i) => Math.min(i + 1, HM_RESEARCH_STEPS.length - 1));
    }, 4000);
    return () => window.clearInterval(interval);
  }, []);
  return (
    <div className="border-b border-outline-variant bg-surface-container-low px-4 py-3">
      <ol className="flex items-center justify-between gap-2 flex-wrap">
        {HM_RESEARCH_STEPS.map((label, i) => {
          const done = i < idx;
          const active = i === idx;
          return (
            <li
              key={label}
              className={cn(
                "flex items-center gap-1.5 font-mono-label text-mono-label uppercase tracking-widest",
                done
                  ? "text-secondary-fixed-dim"
                  : active
                    ? "text-primary"
                    : "text-outline"
              )}
            >
              <span
                className={cn(
                  "material-symbols-outlined text-[14px]",
                  active && "animate-spin"
                )}
                aria-hidden
              >
                {done
                  ? "check_circle"
                  : active
                    ? "progress_activity"
                    : "circle"}
              </span>
              {label}
            </li>
          );
        })}
      </ol>
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

function ChipList({
  items,
  tone,
  marker,
}: {
  items: string[];
  tone: "primary" | "secondary";
  marker?: string;
}) {
  const cls =
    tone === "secondary"
      ? "border-secondary-fixed-dim/40 bg-secondary-fixed-dim/5 text-on-surface"
      : "border-outline-variant bg-surface-container-low text-on-surface";
  return (
    <ul className="flex flex-wrap gap-1.5">
      {items.map((it, i) => (
        <li
          key={i}
          className={cn(
            "px-2 py-1 border font-mono-data text-body-main flex items-center gap-1.5",
            cls
          )}
        >
          {marker && (
            <span
              className={
                tone === "secondary"
                  ? "text-secondary-fixed-dim"
                  : "text-primary"
              }
              aria-hidden
            >
              {marker}
            </span>
          )}
          {it}
        </li>
      ))}
    </ul>
  );
}

function SignalColumn({
  title,
  items,
  tone,
  icon,
}: {
  title: string;
  items: string[];
  tone: "warn" | "positive";
  icon: string;
}) {
  const headingClass =
    tone === "warn" ? "text-tertiary" : "text-secondary-fixed-dim";
  const ruleClass =
    tone === "warn" ? "border-l-tertiary" : "border-l-secondary-fixed-dim";
  return (
    <div className={cn("p-3 border border-outline-variant border-l-2", ruleClass)}>
      <h4
        className={cn(
          "font-mono-label text-mono-label uppercase tracking-widest mb-2 flex items-center gap-2",
          headingClass
        )}
      >
        <span className="material-symbols-outlined text-[14px]" aria-hidden>
          {icon}
        </span>
        {title}
      </h4>
      <ul className="space-y-1">
        {items.map((s, i) => (
          <li
            key={i}
            className="font-mono-data text-body-main text-on-surface-variant leading-relaxed"
          >
            · {s}
          </li>
        ))}
      </ul>
    </div>
  );
}

function SourcesList({
  sources,
  open,
  onToggle,
}: {
  sources: string[];
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <section className="border-t border-outline-variant/40 pt-3">
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center gap-2 font-mono-label text-mono-label text-primary uppercase tracking-widest hover:text-on-surface transition-colors focus-visible:outline-none focus-visible:underline"
        aria-expanded={open}
      >
        <span className="material-symbols-outlined text-[14px]" aria-hidden>
          {open ? "expand_less" : "expand_more"}
        </span>
        Sources <span className="tabular-nums">({sources.length})</span>
      </button>
      {open && (
        <ul className="mt-2 space-y-1">
          {sources.map((url) => (
            <li key={url}>
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                className="font-mono-data text-body-main text-on-surface-variant hover:text-primary transition-colors break-all underline-offset-2 hover:underline"
              >
                {url}
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return iso;
  const delta = Date.now() - then;
  const min = Math.round(delta / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.round(hr / 24)}d ago`;
}
