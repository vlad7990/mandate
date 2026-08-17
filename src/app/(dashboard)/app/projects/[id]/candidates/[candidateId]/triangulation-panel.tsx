"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  IconCheck,
  IconClose,
  IconRefresh,
  IconSpark,
} from "@/components/icons";
import {
  PANEL_BUTTON,
  Panel,
  PanelMeta,
} from "@/components/projects/panel";
import type { TriangulationReport } from "@/lib/ai/triangulation-agent";
import { generateTriangulationAction } from "./actions";
import { unwrap } from "@/lib/actions/result";

type Readiness = {
  company: boolean;
  candidate: boolean;
  hm: boolean;
};

export function TriangulationPanel({
  candidateId,
  projectId,
  candidateName,
  companyName,
  hmName,
  readiness,
  initial,
}: {
  candidateId: string;
  projectId: string;
  candidateName: string;
  companyName: string;
  hmName: string | null;
  readiness: Readiness;
  initial: TriangulationReport | null;
}) {
  const router = useRouter();
  const [report, setReport] = useState<TriangulationReport | null>(initial);
  const [pending, start] = useTransition();

  const allReady = readiness.company && readiness.candidate && readiness.hm;
  const missing: string[] = [];
  if (!readiness.company) missing.push("Company Intelligence");
  if (!readiness.candidate) missing.push("Candidate Intelligence");
  if (!readiness.hm) missing.push("HM Intelligence");

  const handleGenerate = () => {
    if (pending || !allReady) return;
    start(async () => {
      try {
        const next = unwrap(await generateTriangulationAction(
          candidateId,
          projectId
        ));
        setReport(next);
        toast.success("Triangulation report generated");
        router.refresh();
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Generation failed."
        );
      }
    });
  };

  return (
    <Panel
      title="Triangulation"
      meta={
        <PanelMeta>
          {report ? `generated ${formatRelative(report.generated_at)}` : "Not generated"}
        </PanelMeta>
      }
      action={
        <button
          type="button"
          onClick={handleGenerate}
          disabled={pending || !allReady}
          title={!allReady ? `Missing: ${missing.join(", ")}` : undefined}
          className={PANEL_BUTTON}
        >
          {pending || report ? (
            <IconRefresh size={14} className={cn(pending && "animate-spin")} />
          ) : (
            <IconSpark size={14} />
          )}
          {pending
            ? "Synthesising"
            : report
              ? "Regenerate"
              : "Generate report"}
        </button>
      }
    >
      {!allReady ? (
        <ReadinessGate
          readiness={readiness}
          companyName={companyName}
          candidateName={candidateName}
          hmName={hmName}
        />
      ) : !report ? (
        <div className="px-[18px] py-4">
          <p className="max-w-[70ch] text-[13px] leading-relaxed text-on-surface-variant">
            All three base reports are in. Generate the triangulation
            report to fuse them into a decision-grade fit analysis with
            alignment scores, anticipated objections, and a paste-ready
            submission opener.
          </p>
        </div>
      ) : (
        <div className="p-4 space-y-5">
          <AlignmentDashboard
            candidateName={candidateName}
            companyName={companyName}
            hmName={hmName ?? "Hiring Manager"}
            report={report}
          />

          <Section title="Why they will succeed">
            <p className="text-on-surface text-body-main leading-relaxed whitespace-pre-line">
              {report.why_they_will_succeed}
            </p>
          </Section>

          {report.specific_alignment_points.length > 0 && (
            <Section title="Specific alignment points">
              <ul className="space-y-1.5">
                {report.specific_alignment_points.map((p, i) => (
                  <li
                    key={i}
                    className="bg-surface-container-low border-l-2 border-l-primary px-3 py-2"
                  >
                    <div className="font-mono-label text-mono-label text-primary uppercase tracking-widest">
                      {p.dimension}
                    </div>
                    <p className="font-mono-data text-body-main text-on-surface leading-relaxed mt-0.5">
                      {p.evidence}
                    </p>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {report.concerns.length > 0 && (
            <Section title="Concerns">
              <ul className="space-y-1.5">
                {report.concerns.map((c, i) => (
                  <li
                    key={i}
                    className="bg-tertiary/5 border border-outline-variant px-3 py-2 space-y-1"
                  >
                    <div className="flex items-baseline gap-2">
                      <SeverityChip severity={c.severity} />
                      <span className="font-mono-data text-body-main text-on-surface font-semibold">
                        {c.concern}
                      </span>
                    </div>
                    <p className="font-mono-data text-body-main text-on-surface-variant leading-relaxed">
                      <span className="font-mono-label uppercase tracking-widest text-outline mr-1.5">
                        Mitigate:
                      </span>
                      {c.mitigation}
                    </p>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {report.chemistry_risks.length > 0 && (
            <Section title="Chemistry risks">
              <ul className="space-y-1">
                {report.chemistry_risks.map((r, i) => (
                  <li
                    key={i}
                    className="font-mono-data text-body-main text-tertiary flex items-start gap-2"
                  >
                    <span aria-hidden>⚠</span>
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {report.anticipated_objections.length > 0 && (
            <Section title="Anticipated objections">
              <ul className="space-y-2">
                {report.anticipated_objections.map((o, i) => (
                  <li
                    key={i}
                    className="border border-outline-variant overflow-hidden"
                  >
                    <div className="bg-surface-container-high px-3 py-1.5 border-b border-outline-variant/60">
                      <span className="font-mono-label text-mono-label text-tertiary uppercase tracking-widest mr-1.5">
                        Objection
                      </span>
                      <span className="font-mono-data text-body-main text-on-surface italic">
                        “{o.objection}”
                      </span>
                    </div>
                    <div className="px-3 py-2">
                      <span className="font-mono-label text-mono-label text-secondary-fixed-dim uppercase tracking-widest mr-1.5">
                        Response
                      </span>
                      <span className="font-mono-data text-body-main text-on-surface leading-relaxed">
                        {o.response}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {report.recommended_talking_points.length > 0 && (
            <Section title="Recommended talking points">
              <ul className="space-y-1">
                {report.recommended_talking_points.map((t, i) => (
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

          <Section title="Likely first question from HM">
            <blockquote className="bg-surface-container-low border-l-2 border-l-primary px-3 py-2 font-mono-data text-body-main text-on-surface italic leading-relaxed">
              “{report.suggested_first_question_from_hm}”
            </blockquote>
          </Section>

          <Section title="Submission opener">
            <div className="bg-surface-container-low border border-outline-variant px-4 py-3">
              <p className="text-on-surface text-body-main leading-relaxed whitespace-pre-line">
                {report.opening_paragraph}
              </p>
            </div>
          </Section>

          {report.key_selling_points.length > 0 && (
            <Section title="Key selling points">
              <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {report.key_selling_points.map((p, i) => (
                  <li
                    key={i}
                    className="bg-secondary-fixed-dim/5 border border-secondary-fixed-dim/30 px-3 py-2 font-mono-data text-body-main text-on-surface"
                  >
                    {p}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          <Section title="How to position">
            <p className="text-on-surface text-body-main leading-relaxed whitespace-pre-line">
              {report.how_to_position}
            </p>
          </Section>
        </div>
      )}
    </Panel>
  );
}

// ────────────────────────────────────────────────────────────────────────
// 3-circle alignment dashboard
//
// Three semi-transparent circles in a triangular layout. Each circle is
// labelled with its participant + a tone-coded fit score. The center
// shows overall_alignment as the dominant number. Pairwise scores
// (candidate↔company, candidate↔HM) annotate the edges.
// ────────────────────────────────────────────────────────────────────────

function AlignmentDashboard({
  candidateName,
  companyName,
  hmName,
  report,
}: {
  candidateName: string;
  companyName: string;
  hmName: string;
  report: TriangulationReport;
}) {
  const overall = clamp100(report.overall_alignment);
  const cc = clamp100(report.candidate_company_fit);
  const ch = clamp100(report.candidate_hm_fit);
  const overallTone = scoreTone(overall);

  return (
    <section className="bg-surface-container-low border border-outline-variant p-4">
      <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
        <h3 className="font-mono-label text-mono-label text-primary uppercase tracking-widest">
          Alignment dashboard
        </h3>
        <span className="font-mono-label text-mono-label text-outline uppercase tracking-widest tabular-nums">
          0–100 scale
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-4 items-center">
        <div className="flex justify-center">
          <VennDiagram
            candidateLabel={candidateName}
            companyLabel={companyName}
            hmLabel={hmName}
            overall={overall}
            candidateCompany={cc}
            candidateHm={ch}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-1 gap-3 min-w-[240px]">
          <ScoreCard
            label="Overall alignment"
            score={overall}
            emphasis="major"
          />
          <ScoreCard
            label="Candidate ↔ Company"
            score={cc}
            emphasis="minor"
          />
          <ScoreCard
            label="Candidate ↔ HM"
            score={ch}
            emphasis="minor"
          />
          <p className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
            <span className={cn("inline-block w-2 h-2 mr-1.5", overallTone.bg)} />
            {overallTone.label}
          </p>
        </div>
      </div>
    </section>
  );
}

function VennDiagram({
  candidateLabel,
  companyLabel,
  hmLabel,
  overall,
  candidateCompany,
  candidateHm,
}: {
  candidateLabel: string;
  companyLabel: string;
  hmLabel: string;
  overall: number;
  candidateCompany: number;
  candidateHm: number;
}) {
  // Three circles arranged on the points of an equilateral-ish triangle.
  // Coordinates are picked so the circles overlap visibly without
  // crowding the labels. Tailwind tokens — fill / stroke handled inline.
  const candidateColor = scoreTone(candidateCompany + candidateHm).hex;
  const companyColor = scoreTone(candidateCompany).hex;
  const hmColor = scoreTone(candidateHm).hex;

  return (
    <svg
      viewBox="0 0 320 280"
      width="320"
      height="280"
      role="img"
      aria-label="Three-way alignment diagram"
      className="max-w-full h-auto"
    >
      {/* Circles */}
      <circle
        cx="160"
        cy="100"
        r="80"
        fill={candidateColor}
        fillOpacity="0.18"
        stroke={candidateColor}
        strokeOpacity="0.6"
        strokeWidth="1.5"
      />
      <circle
        cx="105"
        cy="180"
        r="80"
        fill={companyColor}
        fillOpacity="0.18"
        stroke={companyColor}
        strokeOpacity="0.6"
        strokeWidth="1.5"
      />
      <circle
        cx="215"
        cy="180"
        r="80"
        fill={hmColor}
        fillOpacity="0.18"
        stroke={hmColor}
        strokeOpacity="0.6"
        strokeWidth="1.5"
      />

      {/* Top — Candidate label */}
      <text
        x="160"
        y="34"
        textAnchor="middle"
        className="font-mono-label fill-on-surface"
        style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase" }}
      >
        Candidate
      </text>
      <text
        x="160"
        y="48"
        textAnchor="middle"
        className="font-mono-data fill-on-surface-variant"
        style={{ fontSize: 11 }}
      >
        {truncate(candidateLabel, 22)}
      </text>

      {/* Bottom-left — Company label */}
      <text
        x="48"
        y="244"
        textAnchor="start"
        className="font-mono-label fill-on-surface"
        style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase" }}
      >
        Company
      </text>
      <text
        x="48"
        y="258"
        textAnchor="start"
        className="font-mono-data fill-on-surface-variant"
        style={{ fontSize: 11 }}
      >
        {truncate(companyLabel, 18)}
      </text>

      {/* Bottom-right — HM label */}
      <text
        x="272"
        y="244"
        textAnchor="end"
        className="font-mono-label fill-on-surface"
        style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase" }}
      >
        Hiring Manager
      </text>
      <text
        x="272"
        y="258"
        textAnchor="end"
        className="font-mono-data fill-on-surface-variant"
        style={{ fontSize: 11 }}
      >
        {truncate(hmLabel, 18)}
      </text>

      {/* Pairwise scores on the edges */}
      <PairwiseLabel
        x={130}
        y={138}
        score={candidateCompany}
        anchor="middle"
      />
      <PairwiseLabel
        x={188}
        y={138}
        score={candidateHm}
        anchor="middle"
      />

      {/* Center overall_alignment — the dominant figure */}
      <circle
        cx="160"
        cy="160"
        r="32"
        fill="var(--color-surface-container)"
        stroke={scoreTone(overall).hex}
        strokeWidth="2"
      />
      <text
        x="160"
        y="159"
        textAnchor="middle"
        dominantBaseline="middle"
        className="fill-on-surface"
        style={{ fontSize: 22, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}
      >
        {overall}
      </text>
      <text
        x="160"
        y="178"
        textAnchor="middle"
        className="font-mono-label fill-outline"
        style={{ fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase" }}
      >
        Overall
      </text>
    </svg>
  );
}

function PairwiseLabel({
  x,
  y,
  score,
  anchor,
}: {
  x: number;
  y: number;
  score: number;
  anchor: "start" | "middle" | "end";
}) {
  const tone = scoreTone(score);
  return (
    <g>
      <rect
        x={x - 18}
        y={y - 9}
        width={36}
        height={18}
        rx={2}
        fill="var(--color-surface)"
        stroke={tone.hex}
        strokeWidth="1"
      />
      <text
        x={x}
        y={y}
        textAnchor={anchor}
        dominantBaseline="middle"
        className="fill-on-surface"
        style={{ fontSize: 11, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}
      >
        {score}
      </text>
    </g>
  );
}

function ScoreCard({
  label,
  score,
  emphasis,
}: {
  label: string;
  score: number;
  emphasis: "major" | "minor";
}) {
  const tone = scoreTone(score);
  return (
    <div
      className={cn(
        "border bg-surface-container px-3 py-2 space-y-1",
        emphasis === "major"
          ? "border-primary/60"
          : "border-outline-variant"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
          {label}
        </span>
        <span className={cn("inline-block w-2 h-2", tone.bg)} aria-hidden />
      </div>
      <div className="flex items-baseline gap-1">
        <span
          className={cn(
            "tabular-nums leading-none",
            emphasis === "major" ? "font-h1 text-h1" : "font-h2 text-h2",
            tone.text
          )}
        >
          {score}
        </span>
        <span className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
          /100
        </span>
      </div>
    </div>
  );
}

function SeverityChip({ severity }: { severity: "low" | "medium" | "high" }) {
  const cls =
    severity === "high"
      ? "border-error/60 bg-error/10 text-error"
      : severity === "medium"
        ? "border-tertiary/60 bg-tertiary/10 text-tertiary"
        : "border-outline-variant bg-surface-container-high text-on-surface-variant";
  return (
    <span
      className={cn(
        "px-1.5 py-0 border font-mono-label text-mono-label uppercase tracking-widest",
        cls
      )}
    >
      {severity}
    </span>
  );
}

function ReadinessGate({
  readiness,
  companyName,
  candidateName,
  hmName,
}: {
  readiness: Readiness;
  companyName: string;
  candidateName: string;
  hmName: string | null;
}) {
  return (
    <div className="p-5 space-y-3">
      <p className="text-body-main text-on-surface-variant max-w-2xl">
        Triangulation needs all three base intelligence reports first.
        Run any missing agent below, then come back to fuse them.
      </p>
      <ul className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <ReadinessCard
          label="Company"
          name={companyName}
          ready={readiness.company}
          actionHint="Run from the Company Intelligence panel on the project page."
        />
        <ReadinessCard
          label="Candidate"
          name={candidateName}
          ready={readiness.candidate}
          actionHint="Run from the Candidate Intelligence panel above."
        />
        <ReadinessCard
          label="Hiring Manager"
          name={hmName ?? "—"}
          ready={readiness.hm}
          actionHint={
            hmName
              ? "Run from the HM Intelligence panel on the project page."
              : "Add the HM as a stakeholder in onboarding first."
          }
        />
      </ul>
    </div>
  );
}

function ReadinessCard({
  label,
  name,
  ready,
  actionHint,
}: {
  label: string;
  name: string;
  ready: boolean;
  actionHint: string;
}) {
  return (
    <li
      className={cn(
        "border p-3 space-y-1.5",
        ready
          ? "border-secondary-fixed-dim/40 bg-secondary-fixed-dim/5"
          : "border-tertiary/40 bg-tertiary/5"
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
          {label}
        </span>
        <span
          className={cn(
            "inline-flex items-center gap-1 font-mono-label text-mono-label uppercase tracking-widest tabular-nums",
            ready ? "text-secondary-fixed-dim" : "text-tertiary"
          )}
        >
          {ready ? (
            <>
              <IconCheck size={11} />
              Ready
            </>
          ) : (
            <>
              <IconClose size={11} />
              Missing
            </>
          )}
        </span>
      </div>
      <div className="font-mono-data text-body-main text-on-surface truncate">
        {name}
      </div>
      {!ready && (
        <p className="font-mono-data text-body-main text-on-surface-variant leading-snug">
          {actionHint}
        </p>
      )}
    </li>
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

function clamp100(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

type ScoreTone = {
  /** Tailwind background utility for the dot indicator. */
  bg: string;
  /** Tailwind text utility for big numbers. */
  text: string;
  /** Hex string for SVG fills/strokes — Tailwind utilities don't apply
   * to SVG attributes inline, so we mirror the same palette here. */
  hex: string;
  label: string;
};

function scoreTone(raw: number): ScoreTone {
  const n = clamp100(raw);
  if (n >= 70) {
    return {
      bg: "bg-secondary-fixed-dim",
      text: "text-secondary-fixed-dim",
      hex: "#3aae3f", // matches the Mandate `secondary-fixed-dim` tone for a green read
      label: "Strong fit",
    };
  }
  if (n >= 45) {
    return {
      bg: "bg-tertiary",
      text: "text-tertiary",
      hex: "#d97706", // amber for moderate
      label: "Moderate fit",
    };
  }
  return {
    bg: "bg-error",
    text: "text-error",
    hex: "#d33", // red for risk
    label: "Risk — likely misfit",
  };
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
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
