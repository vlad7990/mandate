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
import type { CandidateIntelligenceReport } from "@/lib/ai/candidate-research-agent";
import { researchCandidateAction } from "./actions";
import { unwrap } from "@/lib/actions/result";

const RESEARCH_STEPS = [
  "Verifying identity",
  "Reading public profile",
  "Searching publications",
  "Synthesising",
] as const;

export function CandidateIntelligencePanel({
  candidateId,
  projectId,
  candidateName,
  initial,
}: {
  candidateId: string;
  projectId: string;
  candidateName: string;
  initial: CandidateIntelligenceReport | null;
}) {
  const router = useRouter();
  const [report, setReport] = useState<CandidateIntelligenceReport | null>(
    initial
  );
  const [pending, start] = useTransition();
  const [runId, setRunId] = useState(0);
  const [sourcesOpen, setSourcesOpen] = useState(false);

  const handleResearch = () => {
    if (pending) return;
    setRunId((r) => r + 1);
    start(async () => {
      try {
        const next = unwrap(await researchCandidateAction(candidateId, projectId));
        setReport(next);
        toast.success("Candidate intelligence refreshed");
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
      title="Candidate intelligence"
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
          {pending ? "Researching" : report ? "Re-research" : "Research candidate"}
        </button>
      }
    >
      {pending && <ProgressTracker key={runId} />}

      {!report && !pending ? (
        <div className={PANEL_BODY}>
          <p className="max-w-[70ch] text-[13px] leading-relaxed text-on-surface-variant">
            Run real-time web research on{" "}
            <span className="text-on-surface font-semibold">{candidateName}</span>
            : verifies identity, reads public profile + recent activity,
            surfaces publications and talks, flags risk signals, and
            generates talking points for first contact.
          </p>
        </div>
      ) : report ? (
        <div className="p-4 space-y-4">
          <Section title="Web presence">
            <WebPresenceMeter score={report.web_presence_score} />
          </Section>

          <Section title="Public profile">
            <p className="text-on-surface text-body-main leading-relaxed whitespace-pre-line">
              {report.public_profile}
            </p>
          </Section>

          <Section title="Career narrative">
            <p className="text-on-surface text-body-main leading-relaxed whitespace-pre-line">
              {report.career_narrative}
            </p>
          </Section>

          {report.thought_leadership.length > 0 && (
            <Section title="Thought leadership">
              <ul className="space-y-2">
                {report.thought_leadership.map((item, i) => (
                  <li
                    key={i}
                    className="bg-surface-container-low border border-outline-variant px-3 py-2 space-y-1"
                  >
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noreferrer"
                      className="font-mono-data text-body-main text-on-surface font-semibold hover:text-primary transition-colors break-words underline-offset-2 hover:underline"
                    >
                      {item.title}
                    </a>
                    <p className="font-mono-data text-body-main text-on-surface-variant leading-relaxed">
                      {item.summary}
                    </p>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {report.reputation_signals.length > 0 && (
            <Section title="Reputation signals">
              <ul className="space-y-1">
                {report.reputation_signals.map((s, i) => (
                  <li
                    key={i}
                    className="bg-secondary-fixed-dim/5 border-l-2 border-l-secondary-fixed-dim px-3 py-1.5 font-mono-data text-body-main text-on-surface flex items-start gap-2"
                  >
                    <span className="text-secondary-fixed-dim" aria-hidden>
                      +
                    </span>
                    {s}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {report.risk_signals.length > 0 && (
            <Section title="Risk signals">
              <ul className="space-y-1">
                {report.risk_signals.map((s, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 border border-tertiary/40 bg-tertiary/5 px-3 py-2 text-[13px] leading-relaxed text-on-surface"
                  >
                    <span className="mt-px shrink-0 font-mono-label text-[10px] font-bold uppercase tracking-[0.1em] text-tertiary">
                      Signal
                    </span>
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {report.talking_points.length > 0 && (
            <Section title="Talking points">
              <ul className="space-y-1.5">
                {report.talking_points.map((t, i) => (
                  <li
                    key={i}
                    className="bg-primary-container/10 border-l-2 border-l-primary-container px-3 py-1.5 font-mono-data text-body-main text-on-surface flex items-start gap-2"
                  >
                    <span className="text-primary tabular-nums" aria-hidden>
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span>{t}</span>
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
      setIdx((i) => Math.min(i + 1, RESEARCH_STEPS.length - 1));
    }, 4000);
    return () => window.clearInterval(interval);
  }, []);
  return (
    <div className="border-b border-outline-variant bg-surface-container-low px-4 py-3">
      <ol className="flex items-center justify-between gap-2 flex-wrap">
        {RESEARCH_STEPS.map((label, i) => {
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

function WebPresenceMeter({ score }: { score: number }) {
  const v = Math.max(0, Math.min(100, Math.round(score)));
  const tone =
    v >= 70 ? "bg-secondary-fixed-dim" : v >= 40 ? "bg-primary" : "bg-tertiary";
  const label =
    v >= 90
      ? "Prolific public voice"
      : v >= 60
        ? "Findable + credible"
        : v >= 30
          ? "Limited footprint"
          : "Essentially invisible";
  return (
    <div className="bg-surface-container-low border border-outline-variant p-3 space-y-2">
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <span className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
          Web presence score
        </span>
        <span className="font-h2 text-h2 text-on-surface tabular-nums leading-none">
          {v}
          <span className="text-outline text-mono-label font-mono-label uppercase ml-1">
            / 100
          </span>
        </span>
      </div>
      <div
        className="h-1.5 bg-surface-container-highest overflow-hidden"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={v}
        aria-label="Web presence score"
      >
        <span
          className={cn("block h-full transition-[width]", tone)}
          style={{ width: `${v}%` }}
        />
      </div>
      <p className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
        {label}
      </p>
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
