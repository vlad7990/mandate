import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import {
  type Archetype,
  type CandidateProfile,
} from "@/lib/ai/cv-parsing";
import { type CandidateEvaluation } from "@/lib/ai/candidate-evaluation";
import type { CalibrationModel } from "@/lib/ai/role-analysis";
import { TIER_BANDS, TIER_ORDER, type Tier } from "@/lib/ranking/scoring-engine";
import {
  buildMarketInsight,
  type ComparisonContext,
  type ComparisonRow,
  type DimensionWeights,
  type MarketInsight,
} from "@/lib/comparison/comparison-export";
import { cn } from "@/lib/utils";
import { BreadcrumbRail } from "@/components/ui/breadcrumb-rail";
import { MastHead, type MastTone } from "@/components/ui/mast-head";
import { StatusChip, type ChipTone } from "@/components/ui/status-chip";
import { MasterScoringTable } from "./master-table";
import { ComparisonExportActions } from "./export-actions";
import {
  IconAnalytics,
  IconGlobe,
  IconIntelligence,
  IconLeaderboard,
  type IconProps,
} from "@/components/icons";

type ProjectRow = {
  id: string;
  title: string;
  company_name: string;
  calibration_model: Partial<CalibrationModel> | null;
};

type CandidateRow = {
  id: string;
  full_name: string;
  current_title: string | null;
  current_company: string | null;
  archetype: string | null;
  cv_processing: boolean;
  cv_structured: unknown;
};

type ScoreRow = {
  candidate_id: string;
  technical_score: number | null;
  domain_score: number | null;
  leadership_score: number | null;
  regulatory_score: number | null;
  transformation_score: number | null;
  overall_score: number | null;
  tier: string | null;
  rank_position: number | null;
};

const TIER_TONE: Record<Tier, ChipTone> = {
  tier_1: "secondary",
  tier_2: "primary",
  tier_3: "warn",
  tier_4: "danger",
};

const TIER_BAR: Record<Tier, string> = {
  tier_1: "bg-secondary-fixed-dim",
  tier_2: "bg-primary-container",
  tier_3: "bg-tertiary",
  tier_4: "bg-error",
};

export default async function ComparisonDashboardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id, title, company_name, calibration_model")
    .eq("id", id)
    .single<ProjectRow>();

  if (projectError || !project) {
    if (projectError?.code === "PGRST116") notFound();
    redirect("/");
  }

  const [candidatesQ, scoresQ] = await Promise.all([
    supabase
      .from("candidates")
      .select(
        "id, full_name, current_title, current_company, archetype, cv_processing, cv_structured"
      )
      .eq("project_id", id),
    supabase
      .from("candidate_scores")
      .select(
        "candidate_id, technical_score, domain_score, leadership_score, regulatory_score, transformation_score, overall_score, tier, rank_position"
      )
      .eq("project_id", id)
      .order("rank_position", { ascending: true }),
  ]);

  const candidates = (candidatesQ.data ?? []) as CandidateRow[];
  const scores = (scoresQ.data ?? []) as ScoreRow[];

  const scoresByCandidate = new Map<string, ScoreRow>();
  for (const s of scores) scoresByCandidate.set(s.candidate_id, s);

  const totalParsed = candidates.filter(
    (c) => !c.cv_processing && hasFitDimensions(c.cv_structured)
  ).length;

  const rows: ComparisonRow[] = candidates
    .map((c) => {
      const score = scoresByCandidate.get(c.id);
      if (
        !score ||
        score.tier == null ||
        score.rank_position == null ||
        score.overall_score == null
      ) {
        return null;
      }
      const profile = (c.cv_structured ?? {}) as Partial<CandidateProfile> & {
        evaluation?: CandidateEvaluation;
      };
      const evaluation = profile.evaluation ?? null;
      return {
        candidate_id: c.id,
        full_name: c.full_name,
        current_title: c.current_title,
        current_company: c.current_company,
        archetype: c.archetype,
        rank: score.rank_position,
        overall: score.overall_score,
        tier: score.tier as Tier,
        technical: score.technical_score ?? 0,
        domain: score.domain_score ?? 0,
        leadership: score.leadership_score ?? 0,
        regulatory: score.regulatory_score ?? 0,
        transformation: score.transformation_score ?? 0,
        evaluation,
        headline: extractHeadline(profile),
      } satisfies ComparisonRow;
    })
    .filter((r): r is ComparisonRow => r != null)
    .sort((a, b) => a.rank - b.rank);

  const weights: DimensionWeights | null =
    project.calibration_model?.dimension_weights ?? null;

  const context: ComparisonContext = {
    project_title: project.title,
    company_name: project.company_name,
    generated_at: new Date().toISOString(),
  };

  const insight = buildMarketInsight(rows, weights, totalParsed, context);

  // Slate carving — top 4 = primary, next 3 = backup. Slip if pool is
  // smaller than 7 — primary always reads "top {n}" so the recruiter knows
  // they're seeing everything ranked.
  const primaryCount = Math.min(4, rows.length);
  const primary = rows.slice(0, primaryCount);
  const backup = rows.slice(primaryCount, primaryCount + 3);

  return (
    <div className="px-6 py-6 space-y-5 max-w-[1600px] mx-auto">
      <BreadcrumbRail
        segments={[
          { label: "Mandate", href: "/app/home" },
          { label: project.title, href: `/app/projects/${project.id}`, maxChars: 32 },
          { label: "Ranking", href: `/app/projects/${project.id}/ranking` },
          { label: "Full Comparison" },
        ]}
      />

      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div className="space-y-2 min-w-0">
          <h1 className="font-h1 text-h1 text-on-surface tracking-tight">
            COMPARATIVE_MARKET_REPORT
          </h1>
          <p className="font-mono-label text-mono-label text-on-surface-variant uppercase tracking-widest tabular-nums">
            <span className="text-primary">
              {String(rows.length).padStart(2, "0")}
            </span>{" "}
            scored ·{" "}
            <span className="text-secondary-fixed-dim">
              {String(insight.tier_counts.tier_1 + insight.tier_counts.tier_2).padStart(2, "0")}
            </span>{" "}
            viable · {project.company_name} · {project.title}
          </p>
        </div>
        <ComparisonExportActions
          rows={rows}
          weights={weights}
          insight={insight}
          context={context}
        />
      </header>

      {rows.length === 0 ? (
        <EmptyState projectId={project.id} hasCandidates={candidates.length > 0} />
      ) : (
        <>
          <MarketInsightPanel insight={insight} weights={weights} />

          <Section
            tone="primary"
            label="Master Scoring Table"
            meta={
              <span className="tabular-nums">
                Sortable · {String(rows.length).padStart(2, "0")} candidate
                {rows.length === 1 ? "" : "s"}
              </span>
            }
          >
            <MasterScoringTable projectId={project.id} rows={rows} />
          </Section>

          <Section
            tone="secondary"
            label="Tiered Market View"
            meta={
              <span className="tabular-nums">
                {TIER_ORDER.filter((t) => insight.tier_counts[t] > 0).length} tier
                {TIER_ORDER.filter((t) => insight.tier_counts[t] > 0).length === 1
                  ? ""
                  : "s"}{" "}
                populated
              </span>
            }
          >
            <div className="space-y-4">
              {TIER_ORDER.map((tier) => {
                const list = rows.filter((r) => r.tier === tier);
                if (list.length === 0) return null;
                return (
                  <TierGroup
                    key={tier}
                    tier={tier}
                    rows={list}
                    projectId={project.id}
                  />
                );
              })}
            </div>
          </Section>

          <Section
            tone="primary"
            label="Recommended Slate"
            meta={
              <span className="tabular-nums">
                Primary {primary.length} · Backup {backup.length}
              </span>
            }
          >
            <div className="space-y-4">
              <SlateGroup
                title="Primary Slate"
                subtitle={`Top ${primary.length} — leading the market`}
                rows={primary}
                variant="primary"
                projectId={project.id}
              />
              {backup.length > 0 && (
                <SlateGroup
                  title="Backup Slate"
                  subtitle={`Next ${backup.length} — held in reserve`}
                  rows={backup}
                  variant="backup"
                  projectId={project.id}
                />
              )}
              <RealityPanel
                reality={insight.reality_statement}
                partner={insight.partner_take}
              />
            </div>
          </Section>
        </>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Sub-components
// ────────────────────────────────────────────────────────────────────────

function Section({
  tone,
  label,
  meta,
  children,
}: {
  tone: MastTone;
  label: string;
  meta?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <MastHead tone={tone} label={label} meta={meta} />
      {children}
    </section>
  );
}

function MarketInsightPanel({
  insight,
  weights,
}: {
  insight: MarketInsight;
  weights: DimensionWeights | null;
}) {
  const viable = insight.tier_counts.tier_1 + insight.tier_counts.tier_2;
  return (
    <section className="bg-surface-container-low border border-outline-variant relative overflow-hidden">
      <div
        className="absolute inset-0 terminal-grid opacity-10 pointer-events-none"
        aria-hidden
      />
      <div className="relative p-5 grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-5">
        <div className="space-y-3">
          <div className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
            Market Pool
          </div>
          <div className="grid grid-cols-2 gap-3">
            <KpiTile
              label="Scored"
              value={insight.total_scored}
              tone="primary"
            />
            <KpiTile
              label="Viable"
              value={viable}
              tone={viable > 0 ? "secondary" : "warn"}
            />
            <KpiTile
              label="Stretch"
              value={insight.tier_counts.tier_3}
              tone="tertiary"
            />
            <KpiTile
              label="Off"
              value={insight.tier_counts.tier_4}
              tone="error"
            />
          </div>
          {insight.total_parsed > insight.total_scored && (
            <div className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
              {insight.total_parsed - insight.total_scored} pending parse
            </div>
          )}
          {weights && insight.top_weighted.length > 0 && (
            <div className="pt-3 border-t border-outline-variant/40">
              <div className="font-mono-label text-mono-label text-outline uppercase tracking-widest mb-1.5">
                Dominant weights
              </div>
              <ul className="space-y-1">
                {insight.top_weighted.map((w) => (
                  <li
                    key={w.dimension}
                    className="flex items-baseline justify-between gap-2"
                  >
                    <span className="font-mono-data text-body-main text-on-surface capitalize">
                      {w.dimension}
                    </span>
                    <span className="font-mono-data text-mono-data text-secondary-fixed-dim tabular-nums">
                      {w.weight}/10
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <div className="space-y-3">
          <div className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
            Market Reality
          </div>
          <p className="font-mono-data text-body-main text-on-surface leading-relaxed">
            {insight.reality_statement}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-1.5 pt-3 border-t border-outline-variant/40">
            {TIER_ORDER.map((tier) => (
              <TierBar
                key={tier}
                tier={tier}
                count={insight.tier_counts[tier]}
                total={insight.total_scored}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function KpiTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "primary" | "secondary" | "tertiary" | "warn" | "error";
}) {
  const tones: Record<typeof tone, string> = {
    primary: "text-primary border-primary-container/40",
    secondary: "text-secondary-fixed-dim border-secondary-fixed-dim/40",
    tertiary: "text-tertiary border-tertiary/40",
    warn: "text-tertiary border-tertiary/40",
    error: "text-error border-error/40",
  };
  return (
    <div className={cn("border bg-surface-container-lowest p-3", tones[tone])}>
      <div className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
        {label}
      </div>
      <div className={cn("font-h2 text-h2 tabular-nums leading-none mt-1", tones[tone].split(" ")[0])}>
        {String(value).padStart(2, "0")}
      </div>
    </div>
  );
}

function TierBar({
  tier,
  count,
  total,
}: {
  tier: Tier;
  count: number;
  total: number;
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between">
        <span className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
          {TIER_BANDS[tier].label.split(" · ")[0]}
        </span>
        <span className="font-mono-data text-mono-data tabular-nums text-on-surface-variant">
          {count} · {pct}%
        </span>
      </div>
      <div
        className="h-1.5 bg-surface-container-high overflow-hidden"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={total || 1}
        aria-valuenow={count}
        aria-label={`${TIER_BANDS[tier].label}: ${count} of ${total}`}
      >
        <div
          className={cn("h-full transition-[width] duration-300", TIER_BAR[tier])}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function TierGroup({
  tier,
  rows,
  projectId,
}: {
  tier: Tier;
  rows: ComparisonRow[];
  projectId: string;
}) {
  return (
    <article className="bg-surface-container-low border border-outline-variant">
      <header
        className={cn(
          "flex items-center justify-between gap-3 px-4 py-2.5 border-b text-on-surface",
          tier === "tier_1" &&
            "bg-secondary-fixed-dim/15 border-secondary-fixed-dim/40",
          tier === "tier_2" &&
            "bg-primary-container/15 border-primary-container/40",
          tier === "tier_3" && "bg-tertiary/15 border-tertiary/40",
          tier === "tier_4" && "bg-error/15 border-error/40"
        )}
      >
        <div className="flex items-baseline gap-3 min-w-0">
          <span className="font-h2 text-h2 text-on-surface uppercase tracking-tight">
            {TIER_BANDS[tier].label.split(" · ")[0]}
          </span>
          <span className="font-mono-label text-mono-label text-outline uppercase tracking-widest truncate">
            {TIER_BANDS[tier].label.split(" · ")[1] ?? ""} · Overall{" "}
            {TIER_BANDS[tier].min.toFixed(2)}–{TIER_BANDS[tier].max.toFixed(2)}
          </span>
        </div>
        <StatusChip tone={TIER_TONE[tier]}>
          {String(rows.length).padStart(2, "0")} candidate
          {rows.length === 1 ? "" : "s"}
        </StatusChip>
      </header>
      <ul className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 p-3">
        {rows.map((r) => (
          <li key={r.candidate_id}>
            <Link
              href={`/app/projects/${projectId}/candidates/${r.candidate_id}`}
              prefetch={false}
              className="block bg-surface-container border border-outline-variant hover:border-primary hover:bg-surface-container-high transition-colors p-3 h-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <div className="flex items-baseline justify-between gap-2 mb-2">
                <span className="font-mono-label text-mono-label text-outline uppercase tracking-widest tabular-nums">
                  Rank #{String(r.rank).padStart(2, "0")}
                </span>
                <span className="font-h2 text-h2 text-primary tabular-nums leading-none">
                  {r.overall.toFixed(1)}
                </span>
              </div>
              <div className="font-h2 text-h2 text-on-surface truncate">
                {r.full_name}
              </div>
              <div className="font-mono-label text-mono-label text-on-surface-variant uppercase tracking-widest truncate">
                {r.current_title ?? "—"}
                {r.current_company ? ` · ${r.current_company}` : ""}
              </div>
              {r.archetype && (
                <div className="mt-2">
                  <StatusChip
                    tone={archetypeTone(r.archetype as Archetype)}
                    intensity="soft"
                  >
                    {r.archetype}
                  </StatusChip>
                </div>
              )}
              {r.headline && (
                <p className="mt-2 text-body-main text-on-surface-variant line-clamp-3">
                  {r.headline}
                </p>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </article>
  );
}

function SlateGroup({
  title,
  subtitle,
  rows,
  variant,
  projectId,
}: {
  title: string;
  subtitle: string;
  rows: ComparisonRow[];
  variant: "primary" | "backup";
  projectId: string;
}) {
  return (
    <article
      className={cn(
        "bg-surface-container-low border",
        variant === "primary"
          ? "border-primary-container/60"
          : "border-outline-variant"
      )}
    >
      <header
        className={cn(
          "flex items-baseline justify-between gap-3 px-4 py-2.5 border-b",
          variant === "primary"
            ? "bg-primary-container/15 border-primary-container/40"
            : "bg-surface-container-high border-outline-variant"
        )}
      >
        <div>
          <h3 className="font-h2 text-h2 text-on-surface uppercase tracking-tight">
            {title}
          </h3>
          <p className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
            {subtitle}
          </p>
        </div>
        <StatusChip
          tone={variant === "primary" ? "primary" : "neutral"}
          intensity={variant === "primary" ? "strong" : "soft"}
        >
          {String(rows.length).padStart(2, "0")} candidate
          {rows.length === 1 ? "" : "s"}
        </StatusChip>
      </header>
      <ol className="divide-y divide-outline-variant/40">
        {rows.map((r, i) => (
          <li key={r.candidate_id}>
            <Link
              href={`/app/projects/${projectId}/candidates/${r.candidate_id}`}
              prefetch={false}
              className="grid grid-cols-[64px_1fr_auto] items-start gap-4 px-4 py-3 hover:bg-surface-container-high transition-colors focus-visible:outline-none focus-visible:bg-surface-container-high focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-primary"
            >
              <span
                className={cn(
                  "font-h1 text-h1 tabular-nums leading-none",
                  variant === "primary" ? "text-primary" : "text-on-surface-variant"
                )}
                aria-label={`Slot ${i + 1}`}
              >
                #{String(i + 1).padStart(2, "0")}
              </span>
              <div className="min-w-0 space-y-1">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="font-h2 text-h2 text-on-surface truncate">
                    {r.full_name}
                  </span>
                  <StatusChip tone={TIER_TONE[r.tier]}>
                    {TIER_BANDS[r.tier].label.split(" · ")[0]}
                  </StatusChip>
                  <span className="font-mono-label text-mono-label text-outline uppercase tracking-widest tabular-nums">
                    Rank #{r.rank}
                  </span>
                </div>
                <div className="font-mono-data text-body-main text-on-surface-variant truncate">
                  {r.current_title ?? "—"}
                  {r.current_company ? ` @ ${r.current_company}` : ""}
                </div>
                {r.evaluation?.final_verdict.narrative && (
                  <p className="text-body-main text-on-surface-variant line-clamp-2">
                    {r.evaluation.final_verdict.narrative}
                  </p>
                )}
              </div>
              <div className="text-right shrink-0">
                <div className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
                  Overall
                </div>
                <div
                  className={cn(
                    "font-h1 text-h1 tabular-nums leading-none mt-0.5",
                    variant === "primary"
                      ? "text-primary"
                      : "text-on-surface-variant"
                  )}
                >
                  {r.overall.toFixed(1)}
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ol>
    </article>
  );
}

function RealityPanel({
  reality,
  partner,
}: {
  reality: string;
  partner: string;
}) {
  return (
    <article className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      <PanelBlock
        label="Market Reality"
        icon={IconGlobe}
        tone="primary"
        body={reality}
      />
      <PanelBlock
        label="Final Partner Take"
        icon={IconIntelligence}
        tone="secondary"
        body={partner}
      />
    </article>
  );
}

function PanelBlock({
  label,
  icon: Icon,
  tone,
  body,
}: {
  label: string;
  icon: (props: IconProps) => React.ReactElement;
  tone: "primary" | "secondary";
  body: string;
}) {
  return (
    <div
      className={cn(
        "bg-surface-container-low border-l-2 border-y border-r border-outline-variant p-4 space-y-2",
        tone === "primary" ? "border-l-primary-container" : "border-l-secondary-fixed-dim"
      )}
    >
      <header
        className={cn(
          "flex items-center gap-2 font-mono-label text-mono-label uppercase tracking-widest",
          tone === "primary" ? "text-primary" : "text-secondary-fixed-dim"
        )}
      >
        <Icon size={14} />
        {label}
      </header>
      <p className="font-mono-data text-body-main text-on-surface leading-relaxed">
        {body}
      </p>
    </div>
  );
}

function EmptyState({
  projectId,
  hasCandidates,
}: {
  projectId: string;
  hasCandidates: boolean;
}) {
  return (
    <div className="bg-surface-container-low border border-outline-variant px-8 py-12 flex flex-col items-center text-center space-y-4 relative overflow-hidden">
      <div
        className="absolute inset-0 terminal-grid opacity-10 pointer-events-none"
        aria-hidden
      />
      <div className="relative w-16 h-16 border border-primary-container/40 bg-primary-container/10 flex items-center justify-center">
        <IconAnalytics size={28} className="text-primary" />
      </div>
      <div className="relative space-y-2 max-w-md">
        <h2 className="font-h2 text-h2 text-on-surface">
          Nothing to compare yet
        </h2>
        <p className="text-body-main text-on-surface-variant">
          {hasCandidates
            ? "Candidates exist but no scores have been computed. Visit the ranking page to trigger scoring."
            : "Upload at least one candidate CV. The comparison report aggregates scored, parsed profiles into a single market view."}
        </p>
      </div>
      <Link
        href={`/app/projects/${projectId}/ranking`}
        prefetch={false}
        className="relative px-4 py-2 bg-primary-container text-on-primary-container font-mono-label text-mono-label uppercase tracking-widest hover:brightness-110 active:scale-[0.98] transition-[filter,transform] flex items-center gap-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <IconLeaderboard size={16} />
        Go to Ranking
      </Link>
    </div>
  );
}

function archetypeTone(archetype: Archetype): ChipTone {
  const map: Record<Archetype, ChipTone> = {
    Builder: "primary",
    Operator: "secondary",
    Transformer: "warn",
    Infrastructure: "neutral",
  };
  return map[archetype];
}

function hasFitDimensions(raw: unknown): boolean {
  if (!raw || typeof raw !== "object") return false;
  const profile = raw as Partial<CandidateProfile>;
  const fit = profile.fit_dimensions;
  return (
    !!fit &&
    typeof fit.technical === "number" &&
    typeof fit.domain === "number" &&
    typeof fit.leadership === "number" &&
    typeof fit.regulatory === "number" &&
    typeof fit.transformation === "number"
  );
}

function extractHeadline(profile: Partial<CandidateProfile>): string | null {
  const summary = profile.summary;
  if (!summary) return null;
  const first = summary.split(/(?<=[.!?])\s+/)[0];
  return first ? first.trim() : null;
}
