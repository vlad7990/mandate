"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import {
  PIPELINE_LABELS,
  type Archetype,
  type FitDimensions,
  type PipelineStage,
} from "@/lib/ai/cv-parsing";
import {
  TIER_BANDS,
  TIER_ORDER,
  type Tier,
} from "@/lib/ranking/tiers";
import { tierForScore, weightedOverall } from "@/lib/ranking/scoring-math";
import type { CalibrationModel } from "@/lib/ai/role-analysis";
import { MastHead, type MastTone } from "@/components/ui/mast-head";
import { StatusChip, type ChipTone } from "@/components/ui/status-chip";
import { TierComparison } from "@/components/ui/tier-comparison";
import {
  normaliseRecruiterAssessment,
} from "@/lib/recruiter-assessment";
import { RankMovementButton } from "./rank-movement-button";
import type { RankChangeReason } from "./rank-change-types";

// ────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────

export type LeaderboardCandidate = {
  id: string;
  full_name: string;
  current_title: string | null;
  current_company: string | null;
  archetype: string | null;
  pipeline_stage: string | null;
  recruiter_assessment: unknown;
};

export type LeaderboardScore = {
  candidate_id: string;
  technical_score: number;
  domain_score: number;
  leadership_score: number;
  regulatory_score: number;
  transformation_score: number;
  overall_score: number;
  /** Saved tier from the calibrated run. Other perspectives recompute. */
  tier: Tier;
  /** Saved rank from the calibrated run. */
  rank_position: number;
  previous_rank: number | null;
  rank_changed_at: string | null;
  rank_change_reason: RankChangeReason | null;
  updated_at: string | null;
};

export type LeaderboardEntry = {
  candidate: LeaderboardCandidate;
  score: LeaderboardScore;
};

// ────────────────────────────────────────────────────────────────────────
// Perspectives
// ────────────────────────────────────────────────────────────────────────

type Perspective = {
  key: "calibrated" | "technical_first" | "low_risk" | "transformation";
  label: string;
  short: string;
  description: string;
  icon: string;
};

const PERSPECTIVES: Perspective[] = [
  {
    key: "calibrated",
    label: "Calibrated",
    short: "CALIBRATED",
    description: "The project's saved weighted model.",
    icon: "tune",
  },
  {
    key: "technical_first",
    label: "Technical-First",
    short: "TECHNICAL",
    description: "Technical and domain depth maxed.",
    icon: "build",
  },
  {
    key: "low_risk",
    label: "Low-Risk",
    short: "LOW_RISK",
    description: "Regulatory + leadership maxed; gaps penalised.",
    icon: "shield",
  },
  {
    key: "transformation",
    label: "Transformation",
    short: "XFORM",
    description: "Transformation and leadership maxed.",
    icon: "autorenew",
  },
];

type PerspectiveKey = Perspective["key"];

const PERSPECTIVE_WEIGHTS: Record<
  Exclude<PerspectiveKey, "calibrated">,
  Record<keyof FitDimensions, number>
> = {
  technical_first: {
    technical: 10,
    domain: 9,
    leadership: 4,
    regulatory: 3,
    transformation: 4,
  },
  low_risk: {
    technical: 5,
    domain: 6,
    leadership: 9,
    regulatory: 10,
    transformation: 4,
  },
  transformation: {
    technical: 5,
    domain: 5,
    leadership: 9,
    regulatory: 4,
    transformation: 10,
  },
};

const DIMENSIONS: Array<{
  key: keyof FitDimensions;
  scoreField: keyof Pick<
    LeaderboardScore,
    | "technical_score"
    | "domain_score"
    | "leadership_score"
    | "regulatory_score"
    | "transformation_score"
  >;
  short: string;
}> = [
  { key: "technical", scoreField: "technical_score", short: "TECH" },
  { key: "domain", scoreField: "domain_score", short: "DOMAIN" },
  { key: "leadership", scoreField: "leadership_score", short: "LEAD" },
  { key: "regulatory", scoreField: "regulatory_score", short: "REGUL" },
  {
    key: "transformation",
    scoreField: "transformation_score",
    short: "XFORM",
  },
];

const TIER_MAST: Record<Tier, MastTone> = {
  tier_1: "secondary",
  tier_2: "primary",
  tier_3: "tertiary",
  tier_4: "error",
};

const ARCHETYPE_TONE: Record<Archetype, ChipTone> = {
  Builder: "primary",
  Operator: "secondary",
  Transformer: "warn",
  Infrastructure: "neutral",
};

// ────────────────────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────────────────────

export function PerspectiveLeaderboard({
  projectId,
  calibrationWeights,
  entries,
}: {
  projectId: string;
  calibrationWeights: CalibrationModel["dimension_weights"] | null;
  entries: LeaderboardEntry[];
}) {
  const [perspective, setPerspective] = useState<PerspectiveKey>("calibrated");

  // Re-rank under the active perspective. Calibrated reuses the saved
  // values so the page keeps its source-of-truth feel; non-calibrated
  // perspectives recompute overall + tier client-side.
  const rerankedEntries = useMemo(() => {
    if (perspective === "calibrated") {
      return [...entries].sort(
        (a, b) => a.score.rank_position - b.score.rank_position
      );
    }
    const weights = PERSPECTIVE_WEIGHTS[perspective];
    return entries
      .map((e) => {
        const fit: FitDimensions = {
          technical: e.score.technical_score,
          domain: e.score.domain_score,
          leadership: e.score.leadership_score,
          regulatory: e.score.regulatory_score,
          transformation: e.score.transformation_score,
        };
        const overall = weightedOverall(fit, weights);
        return {
          entry: e,
          overall,
          tier: tierForScore(overall),
        };
      })
      .sort((a, b) => b.overall - a.overall)
      .map((row, i) => ({ ...row, rank: i + 1 }));
  }, [perspective, entries]);

  // Movements relative to the calibrated leaderboard — what's actually
  // useful to surface ("X moved from #3 to #1 under Technical-first").
  const calibratedRankById = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of entries) m.set(e.candidate.id, e.score.rank_position);
    return m;
  }, [entries]);

  type MoverRow = {
    row: {
      entry: LeaderboardEntry;
      overall: number;
      tier: Tier;
      rank: number;
    };
    delta: number;
    calibrated: number;
  };

  const movers = useMemo<MoverRow[]>(() => {
    if (perspective === "calibrated") return [];
    const arr = rerankedEntries as Array<{
      entry: LeaderboardEntry;
      overall: number;
      tier: Tier;
      rank: number;
    }>;
    const list: MoverRow[] = [];
    for (const row of arr) {
      const calibrated = calibratedRankById.get(row.entry.candidate.id);
      if (calibrated == null) continue;
      const delta = calibrated - row.rank;
      if (delta === 0) continue;
      list.push({ row, delta, calibrated });
    }
    list.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
    return list.slice(0, 4);
  }, [perspective, rerankedEntries, calibratedRankById]);

  // Group calibrated rows by their saved tier; non-calibrated rows by
  // their recomputed tier. Both end up in the same byTier shape so
  // the render path is unified.
  const grouped = useMemo(() => {
    const byTier: Record<Tier, Array<{
      candidate: LeaderboardCandidate;
      score: LeaderboardScore;
      perspectiveOverall: number;
      perspectiveRank: number;
      perspectiveTier: Tier;
      calibratedRank: number;
    }>> = {
      tier_1: [],
      tier_2: [],
      tier_3: [],
      tier_4: [],
    };
    if (perspective === "calibrated") {
      for (const e of rerankedEntries as LeaderboardEntry[]) {
        const t = e.score.tier;
        if (TIER_ORDER.includes(t)) {
          byTier[t].push({
            candidate: e.candidate,
            score: e.score,
            perspectiveOverall: e.score.overall_score,
            perspectiveRank: e.score.rank_position,
            perspectiveTier: t,
            calibratedRank: e.score.rank_position,
          });
        }
      }
    } else {
      const arr = rerankedEntries as Array<{
        entry: LeaderboardEntry;
        overall: number;
        tier: Tier;
        rank: number;
      }>;
      for (const row of arr) {
        const t = row.tier;
        byTier[t].push({
          candidate: row.entry.candidate,
          score: row.entry.score,
          perspectiveOverall: row.overall,
          perspectiveRank: row.rank,
          perspectiveTier: t,
          calibratedRank:
            calibratedRankById.get(row.entry.candidate.id) ?? row.rank,
        });
      }
    }
    return byTier;
  }, [perspective, rerankedEntries, calibratedRankById]);

  return (
    <div className="space-y-4">
      <PerspectiveTabs
        active={perspective}
        onChange={setPerspective}
        calibratedAvailable={Boolean(calibrationWeights)}
      />

      {perspective !== "calibrated" && movers.length > 0 && (
        <MoversBanner perspective={perspective} movers={movers} />
      )}

      <div className="space-y-6">
        {TIER_ORDER.map((tier) => {
          const list = grouped[tier];
          if (list.length === 0) return null;
          return (
            <TierSection
              key={tier}
              tier={tier}
              projectId={projectId}
              perspective={perspective}
              rows={list}
            />
          );
        })}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Sub-components
// ────────────────────────────────────────────────────────────────────────

function PerspectiveTabs({
  active,
  onChange,
  calibratedAvailable,
}: {
  active: PerspectiveKey;
  onChange: (next: PerspectiveKey) => void;
  calibratedAvailable: boolean;
}) {
  return (
    <nav aria-label="Ranking perspective" className="space-y-2">
      <div className="flex divide-x divide-outline-variant border border-outline-variant overflow-x-auto">
        {PERSPECTIVES.map((p) => {
          const isActive = active === p.key;
          const disabled = p.key === "calibrated" && !calibratedAvailable;
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => onChange(p.key)}
              disabled={disabled}
              aria-pressed={isActive}
              className={cn(
                "flex-1 min-w-[140px] px-4 py-2.5 font-mono-label text-mono-label uppercase tracking-widest flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-primary",
                isActive
                  ? "bg-primary-container text-on-primary-container"
                  : "bg-surface-container-low text-on-surface-variant hover:text-on-surface hover:bg-surface-container"
              )}
            >
              <span className="material-symbols-outlined text-[14px]" aria-hidden>
                {p.icon}
              </span>
              {p.short}
            </button>
          );
        })}
      </div>
      <p className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
        {PERSPECTIVES.find((p) => p.key === active)?.description}{" "}
        {active !== "calibrated" && (
          <span className="text-tertiary">
            · Display-only · saved ranking is unchanged
          </span>
        )}
      </p>
    </nav>
  );
}

function MoversBanner({
  perspective,
  movers,
}: {
  perspective: Exclude<PerspectiveKey, "calibrated">;
  movers: Array<{
    row: { entry: LeaderboardEntry; rank: number; overall: number; tier: Tier };
    delta: number;
    calibrated: number;
  }>;
}) {
  const label = PERSPECTIVES.find((p) => p.key === perspective)?.label ?? "";
  return (
    <div className="bg-secondary-fixed-dim/5 border border-secondary-fixed-dim/40 px-4 py-3 space-y-2">
      <div className="font-mono-label text-mono-label text-secondary-fixed-dim uppercase tracking-widest flex items-center gap-2">
        <span className="material-symbols-outlined text-[14px]" aria-hidden>
          swap_vert
        </span>
        Significant moves under {label} lens
      </div>
      <ul className="space-y-1">
        {movers.map((m) => (
          <li
            key={m.row.entry.candidate.id}
            className="font-mono-data text-body-main text-on-surface flex items-baseline gap-2 flex-wrap"
          >
            <span className="font-semibold">
              {m.row.entry.candidate.full_name}
            </span>
            <span className="text-on-surface-variant">
              moves from #{m.calibrated} to #{m.row.rank}
            </span>
            <span
              className={cn(
                "px-1.5 py-0 border font-mono-label text-mono-label uppercase tracking-widest tabular-nums",
                m.delta > 0
                  ? "border-secondary-fixed-dim/60 bg-secondary-fixed-dim/10 text-secondary-fixed-dim"
                  : "border-error/60 bg-error/10 text-error"
              )}
            >
              {m.delta > 0 ? "▲" : "▼"} {Math.abs(m.delta)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TierSection({
  tier,
  projectId,
  perspective,
  rows,
}: {
  tier: Tier;
  projectId: string;
  perspective: PerspectiveKey;
  rows: Array<{
    candidate: LeaderboardCandidate;
    score: LeaderboardScore;
    perspectiveOverall: number;
    perspectiveRank: number;
    perspectiveTier: Tier;
    calibratedRank: number;
  }>;
}) {
  const band = TIER_BANDS[tier];
  return (
    <section className="space-y-2">
      <MastHead
        tone={TIER_MAST[tier]}
        label={
          <span className="flex items-baseline gap-2">
            <span>{band.label}</span>
            <span className="text-outline tabular-nums">
              · {String(rows.length).padStart(2, "0")} candidate
              {rows.length === 1 ? "" : "s"}
            </span>
          </span>
        }
        meta={
          <span className="tabular-nums">
            Overall {band.min.toFixed(2)}–{band.max.toFixed(2)}
          </span>
        }
      />
      <ul className="space-y-2">
        {rows.map((r) => (
          <CandidateRow
            key={r.candidate.id}
            projectId={projectId}
            perspective={perspective}
            row={r}
          />
        ))}
      </ul>
    </section>
  );
}

function CandidateRow({
  projectId,
  perspective,
  row,
}: {
  projectId: string;
  perspective: PerspectiveKey;
  row: {
    candidate: LeaderboardCandidate;
    score: LeaderboardScore;
    perspectiveOverall: number;
    perspectiveRank: number;
    perspectiveTier: Tier;
    calibratedRank: number;
  };
}) {
  const { candidate, score } = row;
  const archetype = candidate.archetype as Archetype | null;
  const stage = (candidate.pipeline_stage ?? "found") as PipelineStage;
  const recruiter = normaliseRecruiterAssessment(candidate.recruiter_assessment);
  const overall = row.perspectiveOverall;
  const isCalibrated = perspective === "calibrated";

  return (
    <li className="bg-surface-container-low border border-outline-variant hover:bg-surface-container-high hover:border-outline transition-colors">
      <div className="flex items-center gap-4 px-4 py-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <Link
            href={`/projects/${projectId}/candidates/${candidate.id}`}
            prefetch={false}
            className="flex items-center gap-3 min-w-0 group flex-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <span
              className="font-h2 text-h2 text-primary tabular-nums w-12 text-right shrink-0"
              aria-label={`Rank position ${row.perspectiveRank}`}
            >
              #{String(row.perspectiveRank).padStart(2, "0")}
            </span>
          </Link>
          {/* Movement chip — clickable on calibrated view to open the
              explanation modal. Non-calibrated views show a perspective
              delta vs. calibrated rather than the saved previous_rank. */}
          {isCalibrated ? (
            <RankMovementButton
              currentRank={score.rank_position}
              previousRank={score.previous_rank}
              changedAt={score.rank_changed_at}
              reason={score.rank_change_reason}
              candidateName={candidate.full_name}
            />
          ) : (
            <PerspectiveDeltaChip
              calibratedRank={row.calibratedRank}
              perspectiveRank={row.perspectiveRank}
            />
          )}
          <Link
            href={`/projects/${projectId}/candidates/${candidate.id}`}
            prefetch={false}
            className="flex items-center gap-3 min-w-0 flex-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <span
              className="w-10 h-10 bg-surface-container-high border border-outline-variant flex items-center justify-center font-mono-data text-mono-data text-on-surface uppercase shrink-0"
              aria-hidden
            >
              {initials(candidate.full_name)}
            </span>
            <div className="min-w-0">
              <div className="text-on-surface text-body-main font-semibold truncate">
                {candidate.full_name}
              </div>
              <div className="font-mono-data text-body-main text-on-surface-variant truncate">
                {candidate.current_title ?? "—"}
                {candidate.current_company
                  ? ` @ ${candidate.current_company}`
                  : ""}
              </div>
            </div>
          </Link>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="text-right">
            <div className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
              Overall
            </div>
            <div className="font-h2 text-h2 text-primary tabular-nums leading-none mt-0.5">
              {overall.toFixed(1)}
            </div>
          </div>
          <TierComparison
            aiTier={row.perspectiveTier}
            recruiterTier={recruiter.tier}
            compact
          />
          {archetype && (
            <span className="hidden md:inline">
              <StatusChip tone={ARCHETYPE_TONE[archetype]} intensity="soft">
                {archetype}
              </StatusChip>
            </span>
          )}
          <span className="hidden lg:inline">
            <StatusChip tone="neutral" intensity="soft">
              {PIPELINE_LABELS[stage]}
            </StatusChip>
          </span>
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 px-4 py-3 border-t border-outline-variant/40 bg-surface-container-lowest/40">
        {DIMENSIONS.map((dim) => (
          <DimensionBar
            key={dim.key}
            label={dim.short}
            value={score[dim.scoreField]}
          />
        ))}
      </div>
    </li>
  );
}

function PerspectiveDeltaChip({
  calibratedRank,
  perspectiveRank,
}: {
  calibratedRank: number;
  perspectiveRank: number;
}) {
  const base =
    "font-mono-label text-mono-label uppercase tracking-widest tabular-nums flex items-center gap-1 w-14 shrink-0";
  if (calibratedRank === perspectiveRank) {
    return (
      <span className={cn(base, "text-outline")} title="Same as calibrated rank">
        <span className="material-symbols-outlined text-[14px]" aria-hidden>
          remove
        </span>
        FLAT
      </span>
    );
  }
  const delta = calibratedRank - perspectiveRank;
  if (delta > 0) {
    return (
      <span
        className={cn(base, "text-secondary-fixed-dim")}
        title={`Up ${delta} vs. calibrated`}
      >
        <span className="material-symbols-outlined text-[14px]" aria-hidden>
          arrow_upward
        </span>
        +{delta}
      </span>
    );
  }
  return (
    <span className={cn(base, "text-error")} title={`Down ${-delta} vs. calibrated`}>
      <span className="material-symbols-outlined text-[14px]" aria-hidden>
        arrow_downward
      </span>
      −{-delta}
    </span>
  );
}

function DimensionBar({ label, value }: { label: string; value: number }) {
  const v = Math.max(0, Math.min(10, value));
  const colorClass =
    v >= 7
      ? "bg-secondary-fixed-dim"
      : v >= 4
        ? "bg-primary"
        : "bg-tertiary";
  const textClass =
    v >= 7
      ? "text-secondary-fixed-dim"
      : v >= 4
        ? "text-primary"
        : "text-tertiary";
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between">
        <span className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
          {label}
        </span>
        <span
          className={cn(
            "font-mono-data text-mono-data tabular-nums",
            textClass
          )}
        >
          {v}
        </span>
      </div>
      <div
        className="grid grid-cols-10 gap-0.5"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={10}
        aria-valuenow={v}
        aria-label={`${label} score`}
      >
        {Array.from({ length: 10 }).map((_, i) => (
          <div
            key={i}
            className={cn(
              "h-1.5",
              i < v ? colorClass : "bg-surface-container-high"
            )}
            aria-hidden
          />
        ))}
      </div>
    </div>
  );
}

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase() ?? "")
      .join("") || "??"
  );
}
