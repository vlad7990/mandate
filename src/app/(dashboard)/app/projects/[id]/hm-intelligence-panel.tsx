"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  IconCheck,
  IconChevronDown,
  IconRefresh,
  IconSpark,
} from "@/components/icons";
import {
  PANEL_BODY,
  PANEL_BUTTON,
  Panel,
  PanelMeta,
} from "@/components/projects/panel";
import type { HiringManagerIntelligenceReport } from "@/lib/ai/hiring-manager-research-agent";
import { overrideFor } from "@/lib/ai/hm-override";
import { researchHiringManagerAction } from "./actions";
import { unwrap } from "@/lib/actions/result";

const HM_RESEARCH_STEPS = [
  "Verifying identity",
  "Reading career arc",
  "Searching interviews",
  "Synthesising",
] as const;

export type HmStakeholder = { name: string; role: string | null };

export function HMIntelligencePanel({
  projectId,
  stakeholders,
  initial,
}: {
  projectId: string;
  /** Valid stakeholders from onboarding, in captured order — the first
   * is the default subject. Empty when none captured. */
  stakeholders: HmStakeholder[];
  initial: HiringManagerIntelligenceReport | null;
}) {
  const router = useRouter();
  const [report, setReport] = useState<HiringManagerIntelligenceReport | null>(
    initial
  );
  const [pending, start] = useTransition();
  const [runId, setRunId] = useState(0);
  const [sourcesOpen, setSourcesOpen] = useState(false);

  // Default the selection to the stored report's subject when it still
  // matches a stakeholder — so "Re-research" refreshes the dossier the
  // panel is showing — else the first stakeholder (today's behaviour).
  const [selected, setSelected] = useState<string | null>(() => {
    const subject = initial?.hm_name?.trim().toLowerCase();
    const match = subject
      ? stakeholders.find((s) => s.name.trim().toLowerCase() === subject)
      : undefined;
    return match?.name ?? stakeholders[0]?.name ?? null;
  });

  const noStakeholder = stakeholders.length === 0;
  const target =
    stakeholders.find((s) => s.name === selected) ?? stakeholders[0] ?? null;

  const handleResearch = () => {
    if (pending || noStakeholder) return;
    setRunId((r) => r + 1);
    start(async () => {
      try {
        const next = unwrap(
          await researchHiringManagerAction(
            projectId,
            // The D3 rule: the name rides only when the selection
            // differs from the default, so the trail's
            // stakeholder_override keeps meaning "the recruiter chose".
            overrideFor(selected, stakeholders)
          )
        );
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
    <Panel
      title="Hiring manager intelligence"
      meta={
        <PanelMeta>
          {[
            // The REPORT's subject, not the default stakeholder — a
            // dossier on the second HM must not wear the first's name
            // (D4: replacement is a legible act).
            report ? report.hm_name : target?.name ?? null,
            report ? `researched ${formatRelative(report.generated_at)}` : null,
            noStakeholder ? "No hiring manager on record" : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </PanelMeta>
      }
      action={
        <div className="flex flex-wrap items-center gap-2">
          {stakeholders.length >= 2 && (
            <select
              value={selected ?? ""}
              onChange={(e) => setSelected(e.target.value)}
              disabled={pending}
              aria-label="Stakeholder to research"
              className="border border-outline-variant bg-surface-container-low px-2 py-1.5 font-mono-label text-mono-label uppercase tracking-widest text-on-surface-variant transition-colors focus:border-primary focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
            >
              {stakeholders.map((s) => (
                <option key={s.name} value={s.name}>
                  {s.name}
                  {s.role ? ` — ${s.role}` : ""}
                </option>
              ))}
            </select>
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
            className={PANEL_BUTTON}
          >
            {pending || report ? (
              <IconRefresh size={14} className={cn(pending && "animate-spin")} />
            ) : (
              <IconSpark size={14} />
            )}
            {pending ? "Researching" : report ? "Re-research" : "Research HM"}
          </button>
        </div>
      }
    >
      {pending && <ProgressTracker key={runId} />}

      {noStakeholder ? (
        <div className={PANEL_BODY}>
          <p className="max-w-[70ch] text-[13px] leading-relaxed text-on-surface-variant">
            No hiring manager captured yet. Add the HM as a stakeholder in
            the onboarding step before running this agent.
          </p>
        </div>
      ) : !report && !pending ? (
        <div className={PANEL_BODY}>
          <p className="max-w-[70ch] text-[13px] leading-relaxed text-on-surface-variant">
            Run real-time web research on{" "}
            <span className="text-on-surface font-semibold">
              {target?.name}
            </span>
            {target?.role && (
              <span className="text-on-surface-variant"> ({target.role})</span>
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
              />
            )}
            {report.rapport_builders.length > 0 && (
              <SignalColumn
                title="Rapport builders"
                items={report.rapport_builders}
                tone="positive"
              />
            )}
          </div>

          {report.red_lines.length > 0 && (
            <Section title="Red lines">
              <ul className="space-y-1">
                {report.red_lines.map((r, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 border border-error/40 bg-error/5 px-3 py-2 text-[13px] leading-relaxed text-on-surface"
                  >
                    <span className="mt-px shrink-0 font-mono-label text-[10px] font-bold uppercase tracking-[0.1em] text-error">
                      Flag
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
    </Panel>
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
              {done ? (
                <IconCheck size={13} />
              ) : active ? (
                <IconRefresh size={13} className="animate-spin" />
              ) : (
                <span
                  aria-hidden
                  className="h-[7px] w-[7px] border border-current"
                />
              )}
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
            "flex items-center gap-1.5 border px-2 py-1 text-[13px]",
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
}: {
  title: string;
  items: string[];
  tone: "warn" | "positive";
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
        {title}
      </h4>
      <ul className="space-y-1">
        {items.map((s, i) => (
          <li
            key={i}
            className="text-[13px] leading-relaxed text-on-surface-variant"
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
        <IconChevronDown
          size={13}
          className={cn("transition-transform", open && "rotate-180")}
        />
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
                className="break-all font-mono-data text-[12px] text-on-surface-variant underline-offset-2 transition-colors hover:text-primary hover:underline"
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
