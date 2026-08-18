import * as React from "react";
import { cn } from "@/lib/utils";
import { PANEL_BODY, Panel, PanelMeta } from "@/components/projects/panel";
import { MastHead } from "@/components/ui/mast-head";
import { StatusChip, type ChipTone } from "@/components/ui/status-chip";
import {
  IconArrowDown,
  IconArrowUp,
  IconBlock,
  IconCheck,
  IconTrendFlat,
  IconVerified,
} from "@/components/icons";
import {
  ALIGNMENT_LIGHT_LABELS,
  RECOMMENDATION_LABELS,
  VERDICT_TIER_LABELS,
  type AlignmentLight,
  type CandidateEvaluation,
  type DimensionRow,
  type Recommendation,
  type VerdictTier,
} from "@/lib/ai/candidate-evaluation";
import { type DimensionKey } from "@/lib/ai/onboarding-analysis";
import { EvaluationActions } from "./evaluation-actions";

// ────────────────────────────────────────────────────────────────────────
// Tonal mappings
// ────────────────────────────────────────────────────────────────────────

const ALIGNMENT_TONE: Record<AlignmentLight, ChipTone> = {
  green: "secondary",
  amber: "warn",
  red: "danger",
};

const ALIGNMENT_DOT: Record<AlignmentLight, string> = {
  green: "bg-secondary-fixed-dim",
  amber: "bg-tertiary",
  red: "bg-error",
};

const ALIGNMENT_DESCRIPTOR: Record<AlignmentLight, string> = {
  green: "Direct, recent, multi-instance evidence",
  amber: "Partial / adjacent / older evidence",
  red: "Absent or contradicted",
};

const VERDICT_TONE: Record<VerdictTier, ChipTone> = {
  tier_1: "secondary",
  tier_2: "primary",
  tier_3: "warn",
  tier_4: "danger",
};

const VERDICT_TEXT: Record<VerdictTier, string> = {
  tier_1: "text-secondary-fixed-dim",
  tier_2: "text-primary",
  tier_3: "text-tertiary",
  tier_4: "text-error",
};

const RECOMMENDATION_TONE: Record<Recommendation, ChipTone> = {
  primary: "secondary",
  secondary: "primary",
  do_not_include: "danger",
};

const RECOMMENDATION_INTENSITY: Record<
  Recommendation,
  "filled" | "strong"
> = {
  primary: "strong",
  secondary: "filled",
  do_not_include: "strong",
};

const DIMENSION_LABEL: Record<DimensionKey, string> = {
  technical: "Technical",
  domain: "Domain",
  leadership: "Leadership",
  regulatory: "Regulatory",
  transformation: "Transformation",
};

// ────────────────────────────────────────────────────────────────────────
// Top-level entry
// ────────────────────────────────────────────────────────────────────────

export function EvaluationReport({
  evaluation,
  candidateId,
  candidateName,
  candidateTitle,
  candidateCompany,
  projectId,
}: {
  evaluation: CandidateEvaluation;
  candidateId: string;
  candidateName: string;
  candidateTitle: string | null;
  candidateCompany: string | null;
  projectId: string;
}) {
  return (
    <Panel
      title="Evaluation report"
      meta={
        <PanelMeta>
          {evaluation.role_title} · {evaluation.company_name} · drafted{" "}
          {evaluation.generated_at.slice(0, 10)}
        </PanelMeta>
      }
      action={
        <EvaluationActions
          evaluation={evaluation}
          candidateId={candidateId}
          candidateName={candidateName}
          candidateTitle={candidateTitle}
          candidateCompany={candidateCompany}
          projectId={projectId}
        />
      }
    >
      <div className={cn(PANEL_BODY, "flex flex-col gap-6")}>
        <ScoringTable rows={evaluation.scoring_table} />

        <ProfileSummarySection summary={evaluation.profile_summary} />

        <AlignmentTestSection test={evaluation.alignment_test} />

        <StrengthsSection strengths={evaluation.strengths} />

        <GapsSection gaps={evaluation.gaps} />

        <ComparisonSection comparison={evaluation.comparison} />

        <FinalVerdictSection
          verdict={evaluation.final_verdict}
          recommendation={evaluation.recommendation}
          rationale={evaluation.recommendation_rationale}
        />

        <PositioningSection positioning={evaluation.positioning} />
      </div>
    </Panel>
  );
}

// ────────────────────────────────────────────────────────────────────────
// 1. Scoring table
// ────────────────────────────────────────────────────────────────────────

function ScoringTable({ rows }: { rows: DimensionRow[] }) {
  return (
    <section className="space-y-2">
      <MastHead
        tone="primary"
        label="Scoring Table"
        meta={
          <span className="tabular-nums">
            {rows.length.toString().padStart(2, "0")} dimensions
          </span>
        }
      />
      <div className="bg-surface-container-low border border-outline-variant overflow-hidden">
        <table className="w-full border-collapse">
          <caption className="sr-only">
            Per-dimension fit scores, weights, and AI commentary.
          </caption>
          <thead className="bg-surface-container border-b border-outline-variant">
            <tr className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
              <th scope="col" className="px-4 py-2 text-left w-40">
                Dimension
              </th>
              <th scope="col" className="px-4 py-2 text-right w-20 tabular-nums">
                Score
              </th>
              <th scope="col" className="px-4 py-2 text-right w-20 tabular-nums">
                Weight
              </th>
              <th scope="col" className="px-4 py-2 text-left">
                Commentary
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <ScoringRow key={row.dimension} row={row} />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ScoringRow({ row }: { row: DimensionRow }) {
  const score = clamp10(row.score);
  // NOT clamped: weights are relative shares of the calibration model
  // (the five sum to 100), so clamp10 was silently rewriting a weight of
  // 24 into 10 on screen while the PDF printed "24/10". Three surfaces,
  // three different answers — found by rendering with real-shaped data.
  const weight = Math.max(0, Math.round(row.weight));
  const scoreTone =
    score >= 7
      ? "text-secondary-fixed-dim"
      : score >= 4
        ? "text-on-surface"
        : "text-tertiary";
  return (
    <tr className="border-b border-outline-variant/40 last:border-b-0 align-top">
      <th
        scope="row"
        className="px-4 py-3 text-left font-mono-label text-mono-label uppercase tracking-widest text-on-surface"
      >
        {DIMENSION_LABEL[row.dimension]}
      </th>
      <td className="px-4 py-3 text-right">
        <div className="flex flex-col items-end gap-1">
          <span
            className={cn(
              "font-h2 text-h2 tabular-nums leading-none",
              scoreTone
            )}
          >
            {score}
          </span>
          <DotBar value={score} tone={scoreTone} />
        </div>
      </td>
      <td className="px-4 py-3 text-right font-mono-data text-mono-data text-on-surface-variant tabular-nums">
        {weight}
      </td>
      <td className="px-4 py-3 text-body-main text-on-surface-variant leading-snug">
        {row.commentary}
      </td>
    </tr>
  );
}

function DotBar({ value, tone }: { value: number; tone: string }) {
  const fill =
    tone === "text-secondary-fixed-dim"
      ? "bg-secondary-fixed-dim"
      : tone === "text-tertiary"
        ? "bg-tertiary"
        : "bg-primary";
  return (
    <div
      className="grid grid-cols-10 gap-0.5 w-24"
      role="meter"
      aria-valuemin={0}
      aria-valuemax={10}
      aria-valuenow={value}
      aria-hidden
    >
      {Array.from({ length: 10 }).map((_, i) => (
        <div
          key={i}
          className={cn(
            "h-1",
            i < value ? fill : "bg-surface-container-high"
          )}
        />
      ))}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// 2. Profile summary
// ────────────────────────────────────────────────────────────────────────

function ProfileSummarySection({
  summary,
}: {
  summary: CandidateEvaluation["profile_summary"];
}) {
  return (
    <section className="space-y-2">
      <MastHead tone="neutral" label="Profile Summary" />
      <div className="bg-surface-container-low border border-outline-variant px-4 py-4 space-y-3">
        <p className="text-body-main text-on-surface leading-relaxed">
          {summary.executive_summary}
        </p>
        <ul className="space-y-1.5 pt-2 border-t border-outline-variant/40">
          {summary.background_bullets.map((b, i) => (
            <li
              key={i}
              className="flex items-start gap-2 font-mono-data text-body-main text-on-surface-variant"
            >
              <span className="text-primary shrink-0" aria-hidden>
                ▸
              </span>
              <span>{b}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

// ────────────────────────────────────────────────────────────────────────
// 3. Critical role alignment test
// ────────────────────────────────────────────────────────────────────────

function AlignmentTestSection({
  test,
}: {
  test: CandidateEvaluation["alignment_test"];
}) {
  return (
    <section className="space-y-2">
      <MastHead
        tone={
          test.light === "green"
            ? "secondary"
            : test.light === "amber"
              ? "tertiary"
              : "error"
        }
        label="Critical Role Alignment Test"
        meta={
          <span className="flex items-center gap-1.5">
            <span
              className={cn(
                "w-1.5 h-1.5",
                ALIGNMENT_DOT[test.light],
                test.light === "red" && "animate-pulse"
              )}
              aria-hidden
            />
            <span>{ALIGNMENT_LIGHT_LABELS[test.light]}</span>
          </span>
        }
      />
      <div className="bg-surface-container-low border border-outline-variant">
        <div className="px-4 py-3 border-b border-outline-variant/40 bg-surface-container">
          <div className="font-mono-label text-mono-label text-outline uppercase tracking-widest mb-1">
            Question
          </div>
          <p className="text-on-surface text-body-main font-semibold leading-snug">
            {test.question}
          </p>
        </div>
        <div className="px-4 py-3 space-y-3">
          <div>
            <div className="font-mono-label text-mono-label text-outline uppercase tracking-widest mb-1">
              Answer
            </div>
            <p className="text-on-surface-variant text-body-main leading-relaxed">
              {test.answer}
            </p>
          </div>
          <div className="flex items-start gap-3 pt-3 border-t border-outline-variant/40">
            <StatusChip
              tone={ALIGNMENT_TONE[test.light]}
              dot
              pulse={test.light === "red"}
              intensity="filled"
            >
              {ALIGNMENT_LIGHT_LABELS[test.light]}
            </StatusChip>
            <div className="flex-1 min-w-0">
              <p className="text-body-main text-on-surface-variant leading-snug">
                {test.justification}
              </p>
              <p className="font-mono-label text-mono-label text-outline uppercase tracking-wider mt-1">
                {ALIGNMENT_DESCRIPTOR[test.light]}
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ────────────────────────────────────────────────────────────────────────
// 4. Strengths
// ────────────────────────────────────────────────────────────────────────

function StrengthsSection({
  strengths,
}: {
  strengths: CandidateEvaluation["strengths"];
}) {
  return (
    <section className="space-y-2">
      <MastHead
        tone="secondary"
        label="Strengths"
        meta={
          <span className="tabular-nums">
            {strengths.length.toString().padStart(2, "0")} signals
          </span>
        }
      />
      <ol className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {strengths.map((s, i) => (
          <li
            key={i}
            className="bg-surface-container-low border border-outline-variant border-l-2 border-l-secondary-fixed-dim p-4"
          >
            <header className="flex items-start gap-3 mb-2">
              <span className="font-h2 text-h2 text-secondary-fixed-dim tabular-nums leading-none shrink-0">
                {String(i + 1).padStart(2, "0")}
              </span>
              <h4 className="font-mono-data text-body-main text-on-surface font-semibold uppercase tracking-tight leading-snug">
                {s.headline}
              </h4>
            </header>
            <p className="text-body-main text-on-surface-variant leading-relaxed">
              {s.detail}
            </p>
            <div className="mt-3 pt-3 border-t border-outline-variant/40">
              <div className="font-mono-label text-mono-label text-secondary-fixed-dim uppercase tracking-widest mb-1">
                Signal
              </div>
              <p className="font-mono-data text-body-main text-on-surface-variant leading-snug">
                {s.signal}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

// ────────────────────────────────────────────────────────────────────────
// 5. Gaps
// ────────────────────────────────────────────────────────────────────────

function GapsSection({ gaps }: { gaps: CandidateEvaluation["gaps"] }) {
  return (
    <section className="space-y-2">
      <MastHead
        tone="error"
        label="Critical Gaps"
        meta={
          <span className="tabular-nums">
            {gaps.length.toString().padStart(2, "0")} flagged
          </span>
        }
      />
      <ul className="space-y-2">
        {gaps.map((g, i) => (
          <li
            key={i}
            className="border border-error/40 bg-error/5 p-4"
          >
            <header className="mb-2 flex items-start gap-3">
              <span className="mt-px shrink-0 font-mono-label text-[10px] font-bold uppercase tracking-[0.1em] text-error">
                Gap
              </span>
              <h4 className="text-[13px] font-semibold leading-snug text-on-surface">
                {g.headline}
              </h4>
            </header>
            <p className="text-body-main text-on-surface-variant leading-relaxed">
              {g.detail}
            </p>
            <div className="mt-3 pt-3 border-t border-error/30">
              <div className="font-mono-label text-mono-label text-error uppercase tracking-widest mb-1">
                Role mismatch
              </div>
              <p className="font-mono-data text-body-main text-on-surface-variant leading-snug">
                {g.role_mismatch}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ────────────────────────────────────────────────────────────────────────
// 6. Direct comparison
// ────────────────────────────────────────────────────────────────────────

function ComparisonSection({
  comparison,
}: {
  comparison: CandidateEvaluation["comparison"];
}) {
  const hasCompetitors = comparison.competitors.length > 0;
  return (
    <section className="space-y-2">
      <MastHead
        tone="primary"
        label="Direct Comparison"
        meta={
          <span className="tabular-nums">
            vs top {comparison.competitors.length.toString().padStart(2, "0")}
          </span>
        }
      />
      <div className="bg-surface-container-low border border-outline-variant px-4 py-4 space-y-3">
        <p className="text-body-main text-on-surface leading-relaxed">
          {comparison.positioning}
        </p>
        {hasCompetitors ? (
          <ul className="divide-y divide-outline-variant/40 border-t border-outline-variant/40">
            {comparison.competitors.map((c) => (
              <li
                key={c.candidate_id}
                className="grid grid-cols-[1fr_auto] gap-3 py-3 items-start"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-on-surface text-body-main font-semibold truncate">
                      {c.full_name}
                    </span>
                    <StatusChip
                      tone={tierLabelToTone(c.tier_label)}
                      intensity="filled"
                    >
                      {c.tier_label}
                    </StatusChip>
                  </div>
                  <p className="font-mono-data text-body-main text-on-surface-variant leading-snug mt-1">
                    {c.vs_summary}
                  </p>
                </div>
                <DirectionChip direction={c.direction} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="font-mono-label text-mono-label text-outline uppercase tracking-widest italic">
            No other ranked candidates in this slate yet.
          </p>
        )}
      </div>
    </section>
  );
}

function DirectionChip({
  direction,
}: {
  direction: "ahead" | "behind" | "even";
}) {
  if (direction === "ahead") {
    return (
      <StatusChip tone="secondary" icon={IconArrowUp} intensity="filled">
        Ahead
      </StatusChip>
    );
  }
  if (direction === "behind") {
    return (
      <StatusChip tone="danger" icon={IconArrowDown} intensity="filled">
        Behind
      </StatusChip>
    );
  }
  return (
    <StatusChip tone="neutral" icon={IconTrendFlat} intensity="filled">
      Even
    </StatusChip>
  );
}

function tierLabelToTone(label: string): ChipTone {
  // Tier labels arrive from the ranking module as "Tier N · ...".
  if (label.startsWith("Tier 1")) return "secondary";
  if (label.startsWith("Tier 2")) return "primary";
  if (label.startsWith("Tier 3")) return "warn";
  if (label.startsWith("Tier 4")) return "danger";
  return "neutral";
}

// ────────────────────────────────────────────────────────────────────────
// 7 + 9. Final verdict + recommendation
// ────────────────────────────────────────────────────────────────────────

function FinalVerdictSection({
  verdict,
  recommendation,
  rationale,
}: {
  verdict: CandidateEvaluation["final_verdict"];
  recommendation: Recommendation;
  rationale: string;
}) {
  return (
    <section className="space-y-2">
      <MastHead tone="primary" label="Final Verdict" />
      <div className="bg-surface-container-low border border-outline-variant">
        <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-2 gap-4 border-b border-outline-variant/40">
          <div className="space-y-2">
            <div className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
              Tier
            </div>
            <div className="flex items-baseline gap-3">
              <span
                className={cn(
                  "font-h1 text-h1 tracking-tight",
                  VERDICT_TEXT[verdict.tier]
                )}
              >
                {verdict.tier.replace("tier_", "T").toUpperCase()}
              </span>
              <StatusChip tone={VERDICT_TONE[verdict.tier]} intensity="filled">
                {VERDICT_TIER_LABELS[verdict.tier]}
              </StatusChip>
            </div>
          </div>
          <div className="space-y-2">
            <div className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
              Recommendation
            </div>
            <div className="flex items-center gap-3">
              <StatusChip
                tone={RECOMMENDATION_TONE[recommendation]}
                intensity={RECOMMENDATION_INTENSITY[recommendation]}
                icon={
                  recommendation === "primary"
                    ? IconVerified
                    : recommendation === "secondary"
                      ? IconCheck
                      : IconBlock
                }
              >
                {RECOMMENDATION_LABELS[recommendation]}
              </StatusChip>
            </div>
          </div>
        </div>
        <div className="px-4 py-4 space-y-3">
          <p className="text-body-main text-on-surface leading-relaxed">
            {verdict.narrative}
          </p>
          <p className="font-mono-data text-body-main text-on-surface-variant leading-snug border-l-2 border-primary-container/60 pl-3">
            {rationale}
          </p>
        </div>
      </div>
    </section>
  );
}

// ────────────────────────────────────────────────────────────────────────
// 8. How to position
// ────────────────────────────────────────────────────────────────────────

function PositioningSection({
  positioning,
}: {
  positioning: CandidateEvaluation["positioning"];
}) {
  return (
    <section className="space-y-2">
      <MastHead
        tone="secondary"
        label="How to Position"
        meta="Recruiter-ready language"
      />
      <div className="bg-secondary-fixed-dim/5 border border-secondary-fixed-dim/40 px-4 py-4 space-y-3">
        <div>
          <div className="font-mono-label text-mono-label text-secondary-fixed-dim uppercase tracking-widest mb-1.5">
            Opener
          </div>
          <p className="text-on-surface text-body-main leading-relaxed font-mono-data">
            <span className="text-secondary-fixed-dim mr-1.5" aria-hidden>
              &gt;
            </span>
            {positioning.opener}
          </p>
        </div>
        <div className="border-t border-secondary-fixed-dim/30 pt-3">
          <div className="font-mono-label text-mono-label text-secondary-fixed-dim uppercase tracking-widest mb-1.5">
            Talking points
          </div>
          <ul className="space-y-2">
            {positioning.talking_points.map((tp, i) => (
              <li
                key={i}
                className="flex items-start gap-2 font-mono-data text-body-main text-on-surface-variant"
              >
                <span className="text-secondary-fixed-dim shrink-0 tabular-nums">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span>{tp}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="border-t border-secondary-fixed-dim/30 pt-3">
          <div className="font-mono-label text-mono-label text-secondary-fixed-dim uppercase tracking-widest mb-1.5">
            If client objects…
          </div>
          <p className="font-mono-data text-body-main text-on-surface-variant leading-snug italic">
            {positioning.objection_handling}
          </p>
        </div>
      </div>
    </section>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────

function clamp10(v: number): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(10, Math.round(v)));
}
