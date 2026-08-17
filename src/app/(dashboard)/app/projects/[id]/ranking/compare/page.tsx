import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import {
  type Archetype,
  type CandidateProfile,
} from "@/lib/ai/cv-parsing";
import {
  generateComparisonAnalysis,
  type ComparisonInputCandidate,
} from "@/lib/ai/generate-comparison";
import type { ComparisonAnalysis } from "@/lib/ai/comparison-analysis";
import type { CalibrationModel } from "@/lib/ai/role-analysis";
import { TIER_BANDS, type Tier } from "@/lib/ranking/scoring-engine";
import { cn } from "@/lib/utils";
import { ComparisonPicker, type PickerCandidate } from "./picker";
import {
  IconArrowLeft,
  IconCompare,
  IconIntelligence,
} from "@/components/icons";
import { isSampleId } from "@/lib/sample";
import { SampleNotBuilt } from "@/components/sample/sample-not-built";

type ProjectRow = {
  id: string;
  title: string;
  company_name: string;
  calibration_model: Partial<CalibrationModel> | null;
  organization_id: string | null;
};

type CandidateRow = {
  id: string;
  full_name: string;
  current_title: string | null;
  current_company: string | null;
  archetype: string | null;
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

const DIMENSIONS: Array<{
  key: "technical" | "domain" | "leadership" | "regulatory" | "transformation";
  scoreField: keyof ScoreRow;
  label: string;
  weightField:
    | "technical"
    | "domain"
    | "leadership"
    | "regulatory"
    | "transformation";
}> = [
  { key: "technical", scoreField: "technical_score", label: "TECHNICAL", weightField: "technical" },
  { key: "domain", scoreField: "domain_score", label: "DOMAIN", weightField: "domain" },
  { key: "leadership", scoreField: "leadership_score", label: "LEADERSHIP", weightField: "leadership" },
  { key: "regulatory", scoreField: "regulatory_score", label: "REGULATORY", weightField: "regulatory" },
  { key: "transformation", scoreField: "transformation_score", label: "TRANSFORMATION", weightField: "transformation" },
];

const TIER_TONES: Record<Tier, string> = {
  tier_1: "border-secondary-fixed-dim/60 text-secondary-fixed-dim",
  tier_2: "border-primary-container/60 text-primary",
  tier_3: "border-tertiary/40 text-tertiary",
  tier_4: "border-error/40 text-error",
};

const ARCHETYPE_TONES: Record<Archetype, string> = {
  Builder: "border-primary-container/40 text-primary",
  Operator: "border-secondary-fixed-dim/40 text-secondary-fixed-dim",
  Transformer: "border-tertiary/40 text-tertiary",
  Infrastructure: "border-outline-variant text-on-surface-variant",
};

export default async function ComparisonPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ids?: string }>;
}) {
  const { id } = await params;

  if (isSampleId(id)) {
    return (
      <SampleNotBuilt
        title="Comparison"
        context="Sample mandate"
        backHref={`/app/projects/${id}`}
        backLabel="Mandate"
        scope="mandate"
      />
    );
  }
  const { ids: idsParam } = await searchParams;
  const supabase = await createServerSupabaseClient();

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id, title, company_name, calibration_model, organization_id")
    .eq("id", id)
    .single<ProjectRow>();

  if (projectError || !project) {
    if (projectError?.code === "PGRST116") notFound();
    redirect("/");
  }

  // All ranked candidates feed the picker; the optional ?ids= subset
  // selects which ones to actually compare.
  const { data: allCandidates } = await supabase
    .from("candidates")
    .select(
      "id, full_name, current_title, current_company, archetype, cv_structured"
    )
    .eq("project_id", id);

  const { data: scoreRows } = await supabase
    .from("candidate_scores")
    .select(
      "candidate_id, technical_score, domain_score, leadership_score, regulatory_score, transformation_score, overall_score, tier, rank_position"
    )
    .eq("project_id", id);

  const candidatesById = new Map<string, CandidateRow>();
  for (const c of (allCandidates ?? []) as CandidateRow[]) {
    candidatesById.set(c.id, c);
  }
  const scoresById = new Map<string, ScoreRow>();
  for (const s of (scoreRows ?? []) as ScoreRow[]) {
    scoresById.set(s.candidate_id, s);
  }

  const pickerCandidates: PickerCandidate[] = (allCandidates ?? [])
    .map((c) => {
      const score = scoresById.get(c.id);
      return {
        id: c.id,
        full_name: c.full_name,
        current_title: c.current_title,
        current_company: c.current_company,
        rank: score?.rank_position ?? null,
        overall: score?.overall_score ?? null,
        tier: score?.tier ?? null,
      };
    })
    .filter((c) => c.rank != null && c.overall != null)
    .sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999));

  const requestedIds = parseIds(idsParam);
  const selected = requestedIds
    .map((cid) => {
      const base = candidatesById.get(cid);
      const score = scoresById.get(cid);
      if (!base || !score) return null;
      return { base, score };
    })
    .filter((x): x is { base: CandidateRow; score: ScoreRow } => x != null)
    .slice(0, 3);

  const showAnalysis = selected.length >= 2;
  let analysis: ComparisonAnalysis | null = null;
  let analysisError: string | null = null;
  if (showAnalysis) {
    try {
      analysis = await generateComparisonAnalysis({
        calibration: project.calibration_model ?? {},
        candidates: selected.map<ComparisonInputCandidate>(({ base, score }) => ({
          candidate_id: base.id,
          full_name: base.full_name,
          current_title: base.current_title,
          current_company: base.current_company,
          archetype: base.archetype,
          profile: (base.cv_structured ?? {}) as Partial<CandidateProfile>,
          rank: score.rank_position,
          overall_score: score.overall_score,
        })),
        skill_context: {
          project_id: project.id,
          organization_id: project.organization_id,
        },
      });
    } catch (err) {
      analysisError =
        err instanceof Error ? err.message : "Comparison analysis failed.";
      console.error("[ranking/compare] analysis failed", err);
    }
  }

  const weights = project.calibration_model?.dimension_weights ?? null;

  return (
    <div className="min-h-full bg-surface text-on-surface">
      <div className="max-w-7xl mx-auto px-6 py-10 space-y-6">
        <div className="flex items-center gap-3 font-mono-label text-mono-label uppercase tracking-widest text-outline">
          <Link
            href={`/app/projects/${project.id}/ranking`}
            prefetch={false}
            className="hover:text-on-surface transition-colors flex items-center gap-1.5"
          >
            <IconArrowLeft size={14} />
            Ranking
          </Link>
          <span className="text-outline-variant">/</span>
          <span className="text-primary">Side-by-side</span>
        </div>

        <header className="flex justify-between items-end gap-4 flex-wrap">
          <div>
            <h1 className="font-h1 text-h1 text-primary">STRATEGIC BENCHMARKING</h1>
            <p className="font-mono-label text-mono-label text-outline uppercase tracking-widest mt-1">
              {selected.length === 0
                ? "Select 2–3 candidates to compare"
                : `Comparing N=${selected.length} · weighted vs ${project.title}`}
            </p>
          </div>
        </header>

        <ComparisonPicker
          projectId={project.id}
          candidates={pickerCandidates}
          initialSelection={selected.map((s) => s.base.id)}
        />

        {selected.length === 1 && (
          <div className="bg-tertiary/10 border border-tertiary/40 px-4 py-3 font-mono-label text-mono-label text-tertiary uppercase tracking-widest">
            Pick at least one more candidate to run the comparison.
          </div>
        )}

        {selected.length >= 2 && (
          <>
            <ComparisonGrid
              projectId={project.id}
              selected={selected}
              weights={weights}
            />
            {analysis ? (
              <TradeoffPanel analysis={analysis} selected={selected} />
            ) : (
              <AnalysisFallback error={analysisError} />
            )}
          </>
        )}
      </div>
    </div>
  );
}

function parseIds(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 3);
}

function ComparisonGrid({
  projectId,
  selected,
  weights,
}: {
  projectId: string;
  selected: Array<{ base: CandidateRow; score: ScoreRow }>;
  weights:
    | { technical: number; domain: number; leadership: number; regulatory: number; transformation: number }
    | null;
}) {
  const cols = selected.length;
  return (
    <article className="bg-surface-container border border-outline-variant p-4">
      <header className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h2 className="font-h2 text-h2 text-primary uppercase tracking-tight flex items-center gap-2">
          <IconCompare size={20} />
          Strategic Benchmarking
        </h2>
        <span className="font-mono-label text-mono-label text-outline uppercase tracking-wider">
          N={cols} · weighted vs role
        </span>
      </header>
      <div
        className="grid gap-4"
        style={{ gridTemplateColumns: `200px repeat(${cols}, minmax(0, 1fr))` }}
      >
        {/* Header row */}
        <div />
        {selected.map(({ base, score }, i) => (
          <div
            key={base.id}
            className={cn(
              "p-4 bg-surface-container-high",
              i === 0
                ? "border-l-2 border-primary-container"
                : "border-l border-outline-variant"
            )}
          >
            <div className="flex items-center gap-3 mb-3">
              <span className="w-12 h-12 bg-surface-container border border-outline-variant flex items-center justify-center font-mono-data text-mono-data text-on-surface uppercase">
                {initials(base.full_name)}
              </span>
              <div className="min-w-0">
                <h3 className="font-h2 text-h2 text-on-surface leading-tight truncate">
                  <Link
                    href={`/app/projects/${projectId}/candidates/${base.id}`}
                    prefetch={false}
                    className="hover:text-primary transition-colors focus-visible:outline-none focus-visible:underline"
                  >
                    {base.full_name}
                  </Link>
                </h3>
                <div className="font-mono-data text-mono-data text-secondary-fixed-dim uppercase tracking-wider">
                  RANK #{String(score.rank_position ?? 0).padStart(2, "0")} · FIT{" "}
                  {((score.overall_score ?? 0) * 10).toFixed(0)}%
                </div>
              </div>
            </div>
            {base.archetype && (
              <span
                className={cn(
                  "px-2 py-0.5 border font-mono-label text-mono-label uppercase tracking-wider",
                  ARCHETYPE_TONES[base.archetype as Archetype] ??
                    "border-outline-variant text-outline"
                )}
              >
                {base.archetype}
              </span>
            )}
            {score.tier && (
              <span
                className={cn(
                  "ml-2 px-2 py-0.5 border font-mono-label text-mono-label uppercase tracking-wider",
                  TIER_TONES[score.tier as Tier] ??
                    "border-outline-variant text-outline"
                )}
              >
                {TIER_BANDS[score.tier as Tier].label.split(" · ")[0]}
              </span>
            )}
          </div>
        ))}

        {/* Static rows */}
        {selected.length > 0 && (
          <>
            <RowLabel label="Current role" />
            {selected.map(({ base }) => (
              <ValueCell key={`role-${base.id}`}>
                {base.current_title ?? "—"}
                {base.current_company ? ` @ ${base.current_company}` : ""}
              </ValueCell>
            ))}

            <RowLabel label="Years experience" />
            {selected.map(({ base }) => {
              const profile = base.cv_structured as Partial<CandidateProfile> | null;
              const yrs = profile?.years_experience;
              return (
                <ValueCell key={`yrs-${base.id}`}>
                  {typeof yrs === "number" ? `${yrs}Y` : "—"}
                </ValueCell>
              );
            })}

            <RowLabel label="Location" />
            {selected.map(({ base }) => {
              const profile = base.cv_structured as Partial<CandidateProfile> | null;
              return (
                <ValueCell key={`loc-${base.id}`}>
                  {profile?.location ?? "—"}
                </ValueCell>
              );
            })}

            <RowLabel label="Domain" />
            {selected.map(({ base }) => {
              const profile = base.cv_structured as Partial<CandidateProfile> | null;
              return (
                <ValueCell key={`dom-${base.id}`}>
                  {profile?.domain ?? "—"}
                </ValueCell>
              );
            })}

            <RowLabel label="Scale" />
            {selected.map(({ base }) => {
              const profile = base.cv_structured as Partial<CandidateProfile> | null;
              return (
                <ValueCell key={`scale-${base.id}`}>
                  {profile?.scale ?? "—"}
                </ValueCell>
              );
            })}
          </>
        )}

        {/* Score rows */}
        {DIMENSIONS.map((dim) => {
          const weight = weights?.[dim.weightField] ?? null;
          const allScores = selected.map((s) =>
            (s.score[dim.scoreField] as number | null) ?? 0
          );
          const max = Math.max(...allScores);
          return (
            <div
              key={dim.key}
              className="contents"
            >
              <div className="flex items-center justify-between border-t border-outline-variant/40 pt-3">
                <span className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
                  {dim.label}
                </span>
                {weight != null && (
                  <span className="font-mono-label text-mono-label text-tertiary uppercase tracking-wider">
                    W:{weight}
                  </span>
                )}
              </div>
              {selected.map((s, i) => {
                const value = (s.score[dim.scoreField] as number | null) ?? 0;
                const isLeader = value === max && max > 0;
                return (
                  <div
                    key={`${dim.key}-${s.base.id}`}
                    className={cn(
                      "border-t border-outline-variant/40 pt-3 space-y-1.5",
                      i === 0 ? "" : ""
                    )}
                  >
                    <div className="flex items-baseline justify-between">
                      <span className="font-mono-data text-mono-data text-on-surface tabular-nums">
                        {value} / 10
                      </span>
                      {isLeader && (
                        <span className="font-mono-label text-mono-label text-secondary-fixed-dim uppercase tracking-wider">
                          LEADS
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-10 gap-0.5">
                      {Array.from({ length: 10 }).map((_, j) => (
                        <div
                          key={j}
                          className={cn(
                            "h-1",
                            j < value
                              ? value >= 7
                                ? "bg-secondary-fixed-dim"
                                : value >= 4
                                  ? "bg-primary"
                                  : "bg-tertiary"
                              : "bg-surface-container-high"
                          )}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </article>
  );
}

function RowLabel({ label }: { label: string }) {
  return (
    <div className="flex items-center border-b border-outline-variant/40 py-2">
      <span className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
        {label}
      </span>
    </div>
  );
}

function ValueCell({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-b border-outline-variant/40 py-2">
      <span className="font-mono-data text-body-main text-on-surface">
        {children}
      </span>
    </div>
  );
}

function TradeoffPanel({
  analysis,
  selected,
}: {
  analysis: ComparisonAnalysis;
  selected: Array<{ base: CandidateRow; score: ScoreRow }>;
}) {
  const idToName = new Map<string, string>();
  for (const s of selected) idToName.set(s.base.id, s.base.full_name);

  return (
    <article className="bg-surface-container border border-outline-variant p-5 space-y-4">
      <header className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="font-h2 text-h2 text-primary uppercase tracking-tight flex items-center gap-2">
          <IconIntelligence size={20} />
          AI Trade-off Analysis
        </h2>
        <span className="font-mono-label text-mono-label text-outline uppercase tracking-wider">
          Generated against role weights
        </span>
      </header>

      <div className="bg-surface-container-lowest border border-outline-variant p-4 space-y-4 font-mono-data text-body-main leading-relaxed">
        <SynthesisLine
          label="Synthesis"
          tone="primary"
          body={analysis.synthesis}
        />
        <SynthesisLine
          label="Risk vector"
          tone="error"
          body={analysis.risk_vector}
        />
        <SynthesisLine
          label="Optimal pivot"
          tone="secondary"
          body={analysis.optimal_pivot}
        />
      </div>

      <div className="space-y-3">
        <span className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
          Stronger / weaker callouts
        </span>
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {analysis.callouts.map((c, i) => {
            const name = idToName.get(c.candidate_id) ?? "—";
            const isStronger = c.direction === "stronger";
            return (
              <li
                key={i}
                className={cn(
                  "border-l-2 px-3 py-2 bg-surface-container-low",
                  isStronger
                    ? "border-secondary-fixed-dim/60"
                    : "border-error/60"
                )}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-mono-label text-mono-label text-on-surface uppercase tracking-widest">
                    {name}
                  </span>
                  <span
                    className={cn(
                      "font-mono-label text-mono-label uppercase tracking-wider",
                      isStronger ? "text-secondary-fixed-dim" : "text-error"
                    )}
                  >
                    {isStronger ? "STRONGER" : "WEAKER"} · {c.topic}
                  </span>
                </div>
                <p className="text-body-main text-on-surface-variant mt-1">
                  {c.detail}
                </p>
              </li>
            );
          })}
        </ul>
      </div>
    </article>
  );
}

function SynthesisLine({
  label,
  tone,
  body,
}: {
  label: string;
  tone: "primary" | "error" | "secondary";
  body: string;
}) {
  const toneClass =
    tone === "primary"
      ? "text-primary"
      : tone === "error"
        ? "text-error"
        : "text-secondary-fixed-dim";
  return (
    <div className="flex items-start gap-2">
      <span className={cn("font-bold", toneClass)}>&gt;</span>
      <p>
        <span className={cn("font-bold uppercase mr-2", toneClass)}>
          {label}:
        </span>
        <span className="text-on-surface-variant">{body}</span>
      </p>
    </div>
  );
}

function AnalysisFallback({ error }: { error: string | null }) {
  return (
    <article className="bg-tertiary/10 border border-tertiary/40 p-4">
      <span className="font-mono-label text-mono-label text-tertiary uppercase tracking-widest">
        Trade-off analysis unavailable
      </span>
      <p className="text-body-main text-on-surface-variant mt-1">
        {error ?? "Comparison data was insufficient for the AI call."}
      </p>
    </article>
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
