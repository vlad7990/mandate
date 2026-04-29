import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import {
  ARCHETYPES,
  PIPELINE_LABELS,
  type Archetype,
  type CandidateProfile,
  type FitDimensions,
  type PipelineStage,
} from "@/lib/ai/cv-parsing";
import {
  computeAndStoreScores,
  TIER_BANDS,
  TIER_ORDER,
  type Tier,
} from "@/lib/ranking/scoring-engine";
import type { CalibrationModel } from "@/lib/ai/role-analysis";
import { cn } from "@/lib/utils";
import { RefreshScoresButton } from "./refresh-button";

type ProjectRow = {
  id: string;
  title: string;
  company_name: string;
  calibration_model: Partial<CalibrationModel> | null;
};

type CandidateBase = {
  id: string;
  full_name: string;
  current_title: string | null;
  current_company: string | null;
  archetype: string | null;
  pipeline_stage: string | null;
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
  previous_rank: number | null;
  updated_at: string | null;
};

const DIMENSIONS: Array<{
  key: keyof FitDimensions;
  scoreField: keyof ScoreRow;
  label: string;
  short: string;
}> = [
  {
    key: "technical",
    scoreField: "technical_score",
    label: "Technical",
    short: "TECH",
  },
  {
    key: "domain",
    scoreField: "domain_score",
    label: "Domain",
    short: "DOMAIN",
  },
  {
    key: "leadership",
    scoreField: "leadership_score",
    label: "Leadership",
    short: "LEAD",
  },
  {
    key: "regulatory",
    scoreField: "regulatory_score",
    label: "Regulatory",
    short: "REGUL",
  },
  {
    key: "transformation",
    scoreField: "transformation_score",
    label: "Transformation",
    short: "XFORM",
  },
];

const TIER_TONES: Record<Tier, string> = {
  tier_1: "border-secondary-fixed-dim/60 bg-secondary-fixed-dim/10 text-secondary-fixed-dim",
  tier_2: "border-primary-container/60 bg-primary-container/10 text-primary",
  tier_3: "border-tertiary/40 bg-tertiary/5 text-tertiary",
  tier_4: "border-error/40 bg-error/5 text-error",
};

const ARCHETYPE_TONES: Record<Archetype, string> = {
  Builder: "border-primary-container/40 text-primary",
  Operator: "border-secondary-fixed-dim/40 text-secondary-fixed-dim",
  Transformer: "border-tertiary/40 text-tertiary",
  Infrastructure: "border-outline-variant text-on-surface-variant",
};

void ARCHETYPES; // keep enum imported for type narrowing usage below

export default async function RankingPage({
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

  // Pull every parsed candidate. Score rows pivot off these.
  const { data: rawCandidates } = await supabase
    .from("candidates")
    .select(
      "id, full_name, current_title, current_company, archetype, pipeline_stage, cv_processing, cv_structured"
    )
    .eq("project_id", id);

  const candidates = (rawCandidates ?? []) as CandidateBase[];
  const parsedCount = candidates.filter(
    (c) => !c.cv_processing && hasFitDimensions(c.cv_structured)
  ).length;

  // Auto-score on first visit if there are parsed candidates with no
  // canonical score row yet. The compute uses the existing rows to
  // capture previous_rank for movement tracking; for first-run there
  // are no prior ranks so movement is "new".
  const { data: existingScoresHead } = await supabase
    .from("candidate_scores")
    .select("id")
    .eq("project_id", id)
    .limit(1);

  const needsInitialScore =
    parsedCount > 0 && (existingScoresHead?.length ?? 0) === 0;

  if (needsInitialScore) {
    try {
      await computeAndStoreScores(id);
    } catch (err) {
      console.error("[ranking] initial scoring failed", err);
    }
  }

  const { data: scoreRows } = await supabase
    .from("candidate_scores")
    .select(
      "candidate_id, technical_score, domain_score, leadership_score, regulatory_score, transformation_score, overall_score, tier, rank_position, previous_rank, updated_at"
    )
    .eq("project_id", id)
    .order("rank_position", { ascending: true });

  const scoresByCandidate = new Map<string, ScoreRow>();
  for (const row of (scoreRows ?? []) as ScoreRow[]) {
    scoresByCandidate.set(row.candidate_id, row);
  }

  // Group ranked candidates by tier in rank order. Unscored candidates
  // (still parsing or missing fit_dimensions) are surfaced separately.
  const ranked: Array<{ base: CandidateBase; score: ScoreRow }> = [];
  const unscored: CandidateBase[] = [];
  for (const c of candidates) {
    const score = scoresByCandidate.get(c.id);
    if (score && score.tier && score.rank_position) {
      ranked.push({ base: c, score });
    } else {
      unscored.push(c);
    }
  }
  ranked.sort(
    (a, b) =>
      (a.score.rank_position ?? 999) - (b.score.rank_position ?? 999)
  );

  const byTier: Record<Tier, typeof ranked> = {
    tier_1: [],
    tier_2: [],
    tier_3: [],
    tier_4: [],
  };
  for (const r of ranked) {
    if (TIER_ORDER.includes(r.score.tier as Tier)) {
      byTier[r.score.tier as Tier].push(r);
    }
  }

  const lastUpdated = ranked
    .map((r) => r.score.updated_at)
    .filter((u): u is string => !!u)
    .sort()
    .pop();

  return (
    <div className="min-h-full bg-surface text-on-surface">
      <div className="max-w-7xl mx-auto px-6 py-10 space-y-6">
        <div className="flex items-center gap-3 font-mono-label text-mono-label uppercase tracking-widest text-outline">
          <Link
            href={`/projects/${project.id}`}
            prefetch={false}
            className="hover:text-on-surface transition-colors flex items-center gap-1.5"
          >
            <span className="material-symbols-outlined text-[14px]">arrow_back</span>
            Mandate
          </Link>
          <span className="text-outline-variant">/</span>
          <span className="text-on-surface-variant">{project.title}</span>
          <span className="text-outline-variant">/</span>
          <span className="text-primary">Ranking</span>
        </div>

        <header className="flex justify-between items-end gap-4 flex-wrap">
          <div>
            <h1 className="font-h1 text-h1 text-primary">RANK_LEADERBOARD</h1>
            <p className="font-mono-label text-mono-label text-outline uppercase tracking-widest mt-1">
              {ranked.length} ranked · {unscored.length} pending parse ·{" "}
              {project.company_name}
              {lastUpdated ? ` · last computed ${formatRelative(lastUpdated)}` : ""}
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <RefreshScoresButton projectId={project.id} />
            <Link
              href={`/projects/${project.id}/ranking/compare`}
              prefetch={false}
              className="px-4 py-2 bg-primary-container text-on-primary-container font-mono-label text-mono-label uppercase tracking-widest hover:brightness-110 active:scale-[0.98] transition-all flex items-center gap-2"
            >
              <span className="material-symbols-outlined text-[14px]">
                compare_arrows
              </span>
              Compare 2–3
            </Link>
          </div>
        </header>

        {ranked.length === 0 ? (
          <EmptyState
            projectId={project.id}
            parsedCount={parsedCount}
            hasCandidates={candidates.length > 0}
          />
        ) : (
          TIER_ORDER.map((tier) => {
            const list = byTier[tier];
            if (list.length === 0) return null;
            return (
              <TierSection
                key={tier}
                tier={tier}
                projectId={project.id}
                rows={list}
              />
            );
          })
        )}

        {unscored.length > 0 && (
          <UnscoredSection projectId={project.id} candidates={unscored} />
        )}
      </div>
    </div>
  );
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

function EmptyState({
  projectId,
  parsedCount,
  hasCandidates,
}: {
  projectId: string;
  parsedCount: number;
  hasCandidates: boolean;
}) {
  return (
    <div className="bg-surface-container-low border border-outline-variant p-12 flex flex-col items-center text-center space-y-4">
      <div className="w-16 h-16 rounded-full bg-primary-container/10 border border-primary-container/40 flex items-center justify-center">
        <span
          className="material-symbols-outlined text-[28px] text-primary"
          style={{ fontVariationSettings: "'FILL' 1" }}
        >
          leaderboard
        </span>
      </div>
      <div className="space-y-2 max-w-md">
        <h2 className="font-h2 text-h2">Nothing to rank yet</h2>
        <p className="text-body-main text-on-surface-variant">
          {hasCandidates
            ? parsedCount === 0
              ? "Candidates exist but none have a parsed CV with fit_dimensions yet. Wait for the parsing agent to finish."
              : "Scores will compute on the next visit."
            : "Upload a candidate CV first — the ranking engine scores parsed profiles against the role's calibration weights."}
        </p>
      </div>
      <Link
        href={`/projects/${projectId}/candidates/new`}
        prefetch={false}
        className="px-6 py-3 bg-primary-container text-on-primary-container font-mono-label text-mono-label uppercase tracking-widest hover:brightness-110 active:scale-[0.98] transition-all flex items-center gap-2"
      >
        <span className="material-symbols-outlined text-[16px]">upload_file</span>
        Add Candidate
      </Link>
    </div>
  );
}

function TierSection({
  tier,
  projectId,
  rows,
}: {
  tier: Tier;
  projectId: string;
  rows: Array<{ base: CandidateBase; score: ScoreRow }>;
}) {
  const band = TIER_BANDS[tier];
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <span
          className={cn(
            "font-mono-label text-mono-label uppercase tracking-widest border px-3 py-1.5",
            TIER_TONES[tier]
          )}
        >
          {band.label} · {rows.length} candidate{rows.length === 1 ? "" : "s"}
        </span>
        <span className="font-mono-label text-mono-label text-outline uppercase tracking-wider">
          OVERALL {band.min}–{band.max === 7.99 ? "7.99" : band.max === 5.99 ? "5.99" : band.max === 3.99 ? "3.99" : band.max}
        </span>
      </div>
      <ul className="space-y-2">
        {rows.map(({ base, score }) => (
          <CandidateRow
            key={base.id}
            projectId={projectId}
            candidate={base}
            score={score}
          />
        ))}
      </ul>
    </section>
  );
}

function CandidateRow({
  projectId,
  candidate,
  score,
}: {
  projectId: string;
  candidate: CandidateBase;
  score: ScoreRow;
}) {
  const archetype = candidate.archetype as Archetype | null;
  const stage = (candidate.pipeline_stage ?? "found") as PipelineStage;
  const movement = movementSummary(score.rank_position, score.previous_rank);
  const overall = typeof score.overall_score === "number" ? score.overall_score : 0;

  return (
    <li>
      <Link
        href={`/projects/${projectId}/candidates/${candidate.id}`}
        prefetch={false}
        className="block bg-surface-container-low border border-outline-variant p-4 hover:bg-surface-container-high transition-colors group"
      >
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <span className="font-h2 text-h2 text-primary tabular-nums w-12 text-right">
              #{String(score.rank_position).padStart(2, "0")}
            </span>
            <RankMovement movement={movement} />
            <span className="w-10 h-10 rounded bg-surface-container-high border border-outline-variant flex items-center justify-center font-mono-data text-mono-data text-on-surface uppercase shrink-0">
              {initials(candidate.full_name)}
            </span>
            <div className="min-w-0">
              <div className="text-on-surface text-body-main font-semibold truncate">
                {candidate.full_name}
              </div>
              <div className="font-mono-data text-body-main text-on-surface-variant truncate">
                {candidate.current_title ?? "—"}
                {candidate.current_company ? ` @ ${candidate.current_company}` : ""}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <div className="text-right">
              <div className="font-mono-label text-mono-label text-outline uppercase tracking-wider">
                Overall
              </div>
              <div className="font-h2 text-h2 text-primary tabular-nums">
                {overall.toFixed(1)}
              </div>
            </div>
            <span
              className={cn(
                "px-2 py-0.5 border font-mono-label text-mono-label uppercase tracking-wider",
                TIER_TONES[score.tier as Tier]
              )}
            >
              {TIER_BANDS[score.tier as Tier].label.split(" ")[0]} {TIER_BANDS[score.tier as Tier].label.split(" ")[1]}
            </span>
            {archetype && (
              <span
                className={cn(
                  "hidden md:inline px-2 py-0.5 border font-mono-label text-mono-label uppercase tracking-wider",
                  ARCHETYPE_TONES[archetype]
                )}
              >
                {archetype}
              </span>
            )}
            <span className="hidden lg:inline px-2 py-0.5 border border-outline-variant text-outline font-mono-label text-mono-label uppercase tracking-wider">
              {PIPELINE_LABELS[stage]}
            </span>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-4 pt-4 border-t border-outline-variant/40">
          {DIMENSIONS.map((dim) => (
            <DimensionBar
              key={dim.key}
              label={dim.short}
              value={(score[dim.scoreField] as number | null) ?? 0}
            />
          ))}
        </div>
      </Link>
    </li>
  );
}

function DimensionBar({ label, value }: { label: string; value: number }) {
  const v = Math.max(0, Math.min(10, value));
  const tone =
    v >= 7
      ? "bg-secondary-fixed-dim text-secondary-fixed-dim"
      : v >= 4
        ? "bg-primary text-primary"
        : "bg-tertiary text-tertiary";
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between">
        <span className="font-mono-label text-mono-label text-outline uppercase tracking-wider">
          {label}
        </span>
        <span className={cn("font-mono-data text-mono-data tabular-nums", tone.split(" ")[1])}>
          {v}
        </span>
      </div>
      <div className="grid grid-cols-10 gap-0.5">
        {Array.from({ length: 10 }).map((_, i) => (
          <div
            key={i}
            className={cn(
              "h-1",
              i < v ? tone.split(" ")[0] : "bg-surface-container-high"
            )}
          />
        ))}
      </div>
    </div>
  );
}

function RankMovement({ movement }: { movement: ReturnType<typeof movementSummary> }) {
  if (movement.kind === "new") {
    return (
      <span
        className="font-mono-label text-mono-label text-primary uppercase tracking-wider flex items-center gap-1"
        title="New entry on this scoring run"
      >
        <span className="material-symbols-outlined text-[14px]">fiber_new</span>
        NEW
      </span>
    );
  }
  if (movement.kind === "same") {
    return (
      <span
        className="font-mono-label text-mono-label text-outline uppercase tracking-wider flex items-center gap-1"
        title="Unchanged since last scoring run"
      >
        <span className="material-symbols-outlined text-[14px]">remove</span>
        FLAT
      </span>
    );
  }
  if (movement.kind === "up") {
    return (
      <span
        className="font-mono-label text-mono-label text-secondary-fixed-dim uppercase tracking-wider flex items-center gap-1"
        title={`Up ${movement.delta} from previous run`}
      >
        <span className="material-symbols-outlined text-[14px]">arrow_upward</span>
        +{movement.delta}
      </span>
    );
  }
  return (
    <span
      className="font-mono-label text-mono-label text-error uppercase tracking-wider flex items-center gap-1"
      title={`Down ${movement.delta} from previous run`}
    >
      <span className="material-symbols-outlined text-[14px]">arrow_downward</span>
      −{movement.delta}
    </span>
  );
}

function UnscoredSection({
  projectId,
  candidates,
}: {
  projectId: string;
  candidates: CandidateBase[];
}) {
  return (
    <section className="space-y-3">
      <span className="font-mono-label text-mono-label uppercase tracking-widest border border-outline-variant text-outline px-3 py-1.5 inline-block">
        Pending parse · {candidates.length}
      </span>
      <ul className="bg-surface-container-low border border-outline-variant divide-y divide-outline-variant/40">
        {candidates.map((c) => (
          <li key={c.id}>
            <Link
              href={`/projects/${projectId}/candidates/${c.id}`}
              prefetch={false}
              className="flex items-center gap-3 px-4 py-3 hover:bg-surface-container-high transition-colors"
            >
              <span className="material-symbols-outlined text-[16px] text-outline animate-spin">
                {c.cv_processing ? "progress_activity" : "hourglass_empty"}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-on-surface text-body-main truncate">
                  {c.full_name}
                </div>
                <div className="font-mono-label text-mono-label text-outline uppercase tracking-wider">
                  {c.cv_processing
                    ? "AI parse in flight"
                    : "Awaiting fit_dimensions — check candidate profile"}
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

type Movement =
  | { kind: "new" }
  | { kind: "same" }
  | { kind: "up"; delta: number }
  | { kind: "down"; delta: number };

function movementSummary(
  current: number | null,
  previous: number | null
): Movement {
  if (current == null) return { kind: "new" };
  if (previous == null) return { kind: "new" };
  if (current === previous) return { kind: "same" };
  // Lower rank_position is better (1 = top). previous - current > 0 → moved up.
  const delta = previous - current;
  if (delta > 0) return { kind: "up", delta };
  return { kind: "down", delta: -delta };
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

function formatRelative(iso: string): string {
  const t = new Date(iso).getTime();
  const diffMs = Date.now() - t;
  const min = Math.round(diffMs / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}M ago`;
  const hrs = Math.round(min / 60);
  if (hrs < 24) return `${hrs}H ago`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}D ago`;
  return new Date(iso).toISOString().slice(0, 10);
}
