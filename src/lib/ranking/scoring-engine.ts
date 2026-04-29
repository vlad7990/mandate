import "server-only";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import type { CalibrationModel } from "@/lib/ai/role-analysis";
import type {
  CandidateProfile,
  FitDimensions,
} from "@/lib/ai/cv-parsing";

export type Tier = "tier_1" | "tier_2" | "tier_3" | "tier_4";

export const TIER_BANDS: Record<Tier, { min: number; max: number; label: string }> = {
  tier_1: { min: 8, max: 10, label: "Tier 1 · Optimal" },
  tier_2: { min: 6, max: 7.99, label: "Tier 2 · Strong" },
  tier_3: { min: 4, max: 5.99, label: "Tier 3 · Stretch" },
  tier_4: { min: 0, max: 3.99, label: "Tier 4 · Below Bar" },
};

export const TIER_ORDER: Tier[] = ["tier_1", "tier_2", "tier_3", "tier_4"];

export type ScoredCandidate = {
  scoreRowId: string | null;
  candidateId: string;
  technical: number;
  domain: number;
  leadership: number;
  regulatory: number;
  transformation: number;
  overall: number;        // 0–10 weighted average
  tier: Tier;
  rank: number;           // 1-indexed
  previousRank: number | null;
};

type CalibrationWeights = NonNullable<CalibrationModel["dimension_weights"]>;

/** Map a 0–10 overall score to a tier band per the user-spec'd cutoffs. */
export function tierForScore(overall: number): Tier {
  if (overall >= 8) return "tier_1";
  if (overall >= 6) return "tier_2";
  if (overall >= 4) return "tier_3";
  return "tier_4";
}

/**
 * Weighted average of per-dimension scores using the project's
 * calibration_model.dimension_weights. Falls back to a flat average when
 * weights are missing or all-zero so candidates always get a score.
 */
export function weightedOverall(
  fit: FitDimensions,
  weights: CalibrationWeights | null | undefined
): number {
  const dims: Array<keyof FitDimensions> = [
    "technical",
    "domain",
    "leadership",
    "regulatory",
    "transformation",
  ];
  if (!weights) {
    const sum = dims.reduce((acc, d) => acc + clamp10(fit[d]), 0);
    return round2(sum / dims.length);
  }
  let weightedSum = 0;
  let weightTotal = 0;
  for (const d of dims) {
    const score = clamp10(fit[d]);
    const weight = clamp10(weights[d] ?? 0);
    weightedSum += score * weight;
    weightTotal += weight;
  }
  if (weightTotal === 0) {
    const sum = dims.reduce((acc, d) => acc + clamp10(fit[d]), 0);
    return round2(sum / dims.length);
  }
  return round2(weightedSum / weightTotal);
}

/**
 * Recompute scores for every parsed candidate on a project and persist a
 * canonical row per candidate in candidate_scores. Tracks rank_position
 * and previous_rank so the ranking page can render up/down arrows.
 *
 * Idempotent: re-running takes the latest fit_dimensions from each
 * candidate's cv_structured, recomputes against the current
 * dimension_weights, and updates the row in place. previous_rank is
 * captured from the existing row before the update so the UI can show
 * movement vs. the prior scoring run.
 */
export async function computeAndStoreScores(
  projectId: string
): Promise<ScoredCandidate[]> {
  const supabase = await createServerSupabaseClient();

  // Project context — calibration weights drive the overall score.
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("organization_id, calibration_model")
    .eq("id", projectId)
    .single<{
      organization_id: string;
      calibration_model: Partial<CalibrationModel> | null;
    }>();

  if (projectError || !project) {
    throw new Error(
      `Failed to load project for scoring: ${projectError?.message ?? "not found"}`
    );
  }
  const weights = project.calibration_model?.dimension_weights ?? null;

  // Pull all candidates that have a parsed profile. Unparsed rows
  // (cv_processing=true or cv_structured = '{}') are excluded — they have
  // no fit_dimensions to score against.
  const { data: candidates, error: candidatesError } = await supabase
    .from("candidates")
    .select("id, cv_structured")
    .eq("project_id", projectId)
    .eq("cv_processing", false);

  if (candidatesError) {
    throw new Error(
      `Failed to load candidates for scoring: ${candidatesError.message}`
    );
  }

  const parsed = (candidates ?? [])
    .map((row) => {
      const profile = (row.cv_structured ?? {}) as Partial<CandidateProfile>;
      const fit = profile.fit_dimensions;
      if (!fit) return null;
      return { id: row.id as string, fit };
    })
    .filter(
      (x): x is { id: string; fit: FitDimensions } =>
        x != null && hasAllDims(x.fit)
    );

  // Pull existing score rows so we can capture previous_rank before
  // overwriting it. RLS scopes by org.
  const { data: existing } = await supabase
    .from("candidate_scores")
    .select("id, candidate_id, rank_position")
    .eq("project_id", projectId);

  const previousRanks = new Map<string, number | null>();
  const existingIds = new Map<string, string>();
  for (const row of existing ?? []) {
    if (row.candidate_id) {
      previousRanks.set(row.candidate_id, row.rank_position ?? null);
      existingIds.set(row.candidate_id, row.id);
    }
  }

  // Compute scores + tier per candidate, then sort to assign ranks.
  const scored: ScoredCandidate[] = parsed
    .map((c) => {
      const overall = weightedOverall(c.fit, weights ?? undefined);
      return {
        scoreRowId: existingIds.get(c.id) ?? null,
        candidateId: c.id,
        technical: clamp10(c.fit.technical),
        domain: clamp10(c.fit.domain),
        leadership: clamp10(c.fit.leadership),
        regulatory: clamp10(c.fit.regulatory),
        transformation: clamp10(c.fit.transformation),
        overall,
        tier: tierForScore(overall),
        rank: 0, // assigned below
        previousRank: previousRanks.get(c.id) ?? null,
      };
    })
    .sort((a, b) => b.overall - a.overall)
    .map((row, i) => ({ ...row, rank: i + 1 }));

  if (scored.length === 0) return scored;

  // Upsert one canonical row per candidate. The unique
  // (project_id, candidate_id) index from migration 015 keeps each
  // candidate to a single row in this table.
  const now = new Date().toISOString();
  const rows = scored.map((s) => ({
    candidate_id: s.candidateId,
    project_id: projectId,
    organization_id: project.organization_id,
    technical_score: s.technical,
    domain_score: s.domain,
    leadership_score: s.leadership,
    regulatory_score: s.regulatory,
    transformation_score: s.transformation,
    overall_score: s.overall,
    tier: s.tier,
    rank_position: s.rank,
    previous_rank: s.previousRank,
    analysis: {
      weights_snapshot: weights,
      computed_at: now,
    },
    updated_at: now,
  }));

  const { error: upsertError } = await supabase
    .from("candidate_scores")
    .upsert(rows, { onConflict: "project_id,candidate_id" });

  if (upsertError) {
    throw new Error(`Failed to upsert candidate scores: ${upsertError.message}`);
  }

  return scored;
}

function clamp10(v: unknown): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(10, Math.round(v)));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function hasAllDims(fit: Partial<FitDimensions>): fit is FitDimensions {
  return (
    typeof fit.technical === "number" &&
    typeof fit.domain === "number" &&
    typeof fit.leadership === "number" &&
    typeof fit.regulatory === "number" &&
    typeof fit.transformation === "number"
  );
}
