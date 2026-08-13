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
import type {
  CompanyIntelligenceReport,
  CultureSignals,
  LeadershipPerson,
  RecentContextItem,
} from "@/lib/ai/company-intelligence-agent";
import { researchCompanyAction } from "./actions";

const PROGRESS_STEPS = [
  { key: "scrape", label: "Scraping website" },
  { key: "leadership", label: "Reading leadership" },
  { key: "news", label: "Searching news" },
  { key: "synthesise", label: "Analysing" },
] as const;

const CULTURE_AXIS_LABELS: Array<{
  key: keyof CultureSignals;
  label: string;
  highHint: string;
  lowHint: string;
}> = [
  { key: "pace", label: "Pace", highHint: "Fast", lowHint: "Deliberate" },
  {
    key: "hierarchy",
    label: "Hierarchy",
    highHint: "Flat",
    lowHint: "Layered",
  },
  {
    key: "innovation_appetite",
    label: "Innovation appetite",
    highHint: "High",
    lowHint: "Conservative",
  },
  {
    key: "risk_tolerance",
    label: "Risk tolerance",
    highHint: "High",
    lowHint: "Risk-averse",
  },
];

export function CompanyIntelligencePanel({
  projectId,
  companyName,
  initial,
}: {
  projectId: string;
  companyName: string;
  initial: CompanyIntelligenceReport | null;
}) {
  const router = useRouter();
  const [report, setReport] = useState<CompanyIntelligenceReport | null>(
    initial
  );
  const [pending, start] = useTransition();
  const [sourcesOpen, setSourcesOpen] = useState(false);
  // Bumped each time the user triggers a run so ProgressTracker remounts
  // and its internal step counter resets — avoids synchronously setting
  // state from a useEffect in the parent.
  const [runId, setRunId] = useState(0);

  const handleResearch = () => {
    if (pending) return;
    setRunId((r) => r + 1);
    start(async () => {
      try {
        const next = await researchCompanyAction(projectId);
        setReport(next);
        toast.success("Company intelligence refreshed");
        router.refresh();
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Research failed.";
        toast.error(msg);
      }
    });
  };

  return (
    <Panel
      title="Company intelligence"
      meta={
        <PanelMeta>
          {report ? `researched ${formatRelative(report.generated_at)}` : "Not researched"}
        </PanelMeta>
      }
      action={
        <button
          type="button"
          onClick={handleResearch}
          disabled={pending}
          className={PANEL_BUTTON}
        >
          {pending || report ? (
            <IconRefresh size={14} className={cn(pending && "animate-spin")} />
          ) : (
            <IconSpark size={14} />
          )}
          {pending ? "Researching" : report ? "Re-research" : "Research company"}
        </button>
      }
    >
      {pending && <ProgressTracker key={runId} />}

      {!report && !pending ? (
        <div className={PANEL_BODY}>
          <p className="max-w-[70ch] text-[13px] leading-relaxed text-on-surface-variant">
            Run real-time research on{" "}
            <span className="text-on-surface font-semibold">{companyName}</span>
            : scrapes the company website, leadership, news, and careers
            pages, then searches for AI strategy, transformation
            priorities, and recent leadership changes. Synthesised into a
            grounded Company Intelligence Report you can use to calibrate
            sourcing and pitch.
          </p>
        </div>
      ) : report ? (
        <div className={cn(PANEL_BODY, "flex flex-col gap-4")}>
          <Section title="Executive summary">
            <p className="text-on-surface text-body-main leading-relaxed whitespace-pre-line">
              {report.executive_summary}
            </p>
          </Section>

          {report.leadership_team.length > 0 && (
            <Section title="Leadership team">
              <LeadershipTable people={report.leadership_team} />
            </Section>
          )}

          <Section title="Technology strategy">
            <p className="text-on-surface text-body-main leading-relaxed whitespace-pre-line">
              {report.technology_strategy}
            </p>
          </Section>

          <Section title="AI agenda">
            <p className="text-on-surface text-body-main leading-relaxed whitespace-pre-line">
              {report.ai_agenda}
            </p>
          </Section>

          {report.transformation_priorities.length > 0 && (
            <Section title="Transformation priorities">
              <ul className="flex flex-wrap gap-1.5">
                {report.transformation_priorities.map((t, i) => (
                  <li
                    key={i}
                    className="border border-outline-variant bg-surface-container-low px-2 py-1 text-[13px] text-on-surface"
                  >
                    {t}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          <Section title="Culture signals">
            <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {CULTURE_AXIS_LABELS.map((axis) => (
                <CultureBar
                  key={axis.key}
                  label={axis.label}
                  value={report.culture_signals[axis.key] ?? 50}
                  highHint={axis.highHint}
                  lowHint={axis.lowHint}
                />
              ))}
            </ul>
          </Section>

          <Section title="Ideal candidate profile">
            <p className="text-on-surface text-body-main leading-relaxed whitespace-pre-line">
              {report.ideal_candidate_profile}
            </p>
          </Section>

          {report.red_flags.length > 0 && (
            <Section title="Red flags">
              <ul className="space-y-1.5">
                {report.red_flags.map((r, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 border border-tertiary/40 bg-tertiary/5 px-3 py-2"
                  >
                    <span className="mt-px shrink-0 font-mono-label text-[10px] font-bold uppercase tracking-[0.1em] text-tertiary">
                      Flag
                    </span>
                    <p className="text-[13px] leading-relaxed text-on-surface">
                      {r}
                    </p>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {report.recent_context.length > 0 && (
            <Section title="Recent context">
              <RecentTimeline items={report.recent_context} />
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
  // Initial step set via useState lazy initialiser; subsequent steps
  // come from the interval callback. No synchronous setState in the
  // effect body, which keeps react-hooks/set-state-in-effect happy.
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const interval = window.setInterval(() => {
      setIdx((i) => Math.min(i + 1, PROGRESS_STEPS.length - 1));
    }, 4000);
    return () => window.clearInterval(interval);
  }, []);
  return (
    <div className="border-b border-outline-variant bg-surface-container-low px-4 py-3">
      <ol className="flex items-center justify-between gap-2 flex-wrap">
        {PROGRESS_STEPS.map((step, i) => {
          const done = i < idx;
          const active = i === idx;
          return (
            <li
              key={step.key}
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
              {step.label}
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

function LeadershipTable({ people }: { people: LeadershipPerson[] }) {
  return (
    <div className="border border-outline-variant overflow-hidden">
      <table className="w-full text-left">
        <thead className="bg-surface-container-high">
          <tr>
            <th className="px-3 py-2 font-mono-label text-mono-label text-outline uppercase tracking-widest">
              Name
            </th>
            <th className="px-3 py-2 font-mono-label text-mono-label text-outline uppercase tracking-widest">
              Title
            </th>
            <th className="px-3 py-2 font-mono-label text-mono-label text-outline uppercase tracking-widest">
              Relevance to role
            </th>
          </tr>
        </thead>
        <tbody>
          {people.map((p, i) => (
            <tr
              key={`${p.name}-${i}`}
              className="border-t border-outline-variant/40 align-top"
            >
              <td className="whitespace-nowrap px-3 py-2 text-[13px] font-semibold text-on-surface">
                {p.name}
              </td>
              <td className="px-3 py-2 text-[13px] text-on-surface-variant">
                {p.title}
              </td>
              <td className="px-3 py-2 text-[13px] leading-relaxed text-on-surface">
                {p.relevance_to_role}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CultureBar({
  label,
  value,
  highHint,
  lowHint,
}: {
  label: string;
  value: number;
  highHint: string;
  lowHint: string;
}) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  const tone =
    v >= 70 ? "bg-primary" : v >= 40 ? "bg-secondary-fixed-dim" : "bg-tertiary";
  return (
    <li className="bg-surface-container-low border border-outline-variant p-3 space-y-2">
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <span className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
          {label}
        </span>
        <span className="font-mono-label text-mono-label text-outline uppercase tracking-widest tabular-nums">
          {v}/100
        </span>
      </div>
      <div
        className="h-1.5 bg-surface-container-highest overflow-hidden"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={v}
        aria-label={`${label} score`}
      >
        <span
          className={cn("block h-full transition-[width]", tone)}
          style={{ width: `${v}%` }}
        />
      </div>
      <div className="flex items-center justify-between font-mono-label text-mono-label text-outline uppercase tracking-widest">
        <span>{lowHint}</span>
        <span>{highHint}</span>
      </div>
    </li>
  );
}

function RecentTimeline({ items }: { items: RecentContextItem[] }) {
  return (
    <ol className="space-y-2 border-l border-outline-variant pl-4">
      {items.map((item, i) => (
        <li key={i} className="relative">
          <span
            className="absolute -left-[19px] top-1.5 w-2.5 h-2.5 bg-primary-container border border-primary"
            aria-hidden
          />
          <div className="font-mono-label text-mono-label text-outline uppercase tracking-widest tabular-nums">
            {item.date}
          </div>
          <div className="text-on-surface text-body-main font-semibold mt-0.5">
            {item.headline}
          </div>
          <p className="mt-0.5 text-[13px] leading-relaxed text-on-surface-variant">
            {item.significance}
          </p>
        </li>
      ))}
    </ol>
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
                className="break-all font-mono-data text-[12px] text-on-surface-variant underline-offset-2 transition-colors hover:text-primary hover:underline focus-visible:text-primary focus-visible:underline focus-visible:outline-none"
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
