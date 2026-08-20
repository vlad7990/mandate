import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import type { CalibrationModel } from "@/lib/ai/role-analysis";
import type {
  CandidateProfile,
  FitDimensions,
} from "@/lib/ai/cv-parsing";
import { TIER_BANDS, TIER_ORDER, type Tier } from "./tiers";
import {
  clamp10,
  tierForScore,
  weightedOverall,
} from "./scoring-math";

// Re-export the client-safe tier vocabulary + scoring math so existing
// server-side callers can keep importing from
// "@/lib/ranking/scoring-engine" without breaking. New client-side
// callers should import directly from ./scoring-math to avoid pulling
// the server-only Supabase client into the browser bundle.
export { TIER_BANDS, TIER_ORDER, tierForScore, weightedOverall };
export type { Tier };

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

/**
 * Why this scoring run was triggered. Stored on
 * candidate_scores.rank_change_reason so the ranking-explanation modal
 * can render plain-English context for any rank movement.
 */
export type ScoringTrigger =
  | { trigger: "feedback"; feedback_id: string; summary?: string }
  | { trigger: "recalibration"; feedback_id?: string; summary?: string }
  | { trigger: "weights_edit"; summary?: string }
  | { trigger: "new_candidate"; candidate_id?: string; summary?: string }
  | { trigger: "scoring_run"; summary?: string };

export type ScoringOptions = {
  /** Why the recompute was triggered. Captured as `rank_change_reason`
   * on rows whose rank moved during this run. Defaults to a generic
   * "scoring_run" when omitted. */
  trigger?: ScoringTrigger;
};


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
  projectId: string,
  client?: SupabaseClient,
  options?: ScoringOptions
): Promise<ScoredCandidate[]> {
  // Optional client lets cookie-less server contexts pass their own
  // session — the HM portal's after() pipeline passes the feedback
  // interpreter agent's session (074). Default path resolves the SSR
  // client tied to the caller's session, which is what every
  // recruiter-facing flow expects.
  const supabase = client ?? (await createServerSupabaseClient());

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

  // Pull existing score rows so we can capture previous_rank +
  // previous per-dimension scores before overwriting them. The deltas
  // feed the rank-change explanation modal. RLS scopes by org.
  const { data: existing } = await supabase
    .from("candidate_scores")
    .select(
      "id, candidate_id, rank_position, technical_score, domain_score, leadership_score, regulatory_score, transformation_score, overall_score"
    )
    .eq("project_id", projectId);

  type ExistingRow = {
    id: string;
    candidate_id: string;
    rank_position: number | null;
    technical_score: number | null;
    domain_score: number | null;
    leadership_score: number | null;
    regulatory_score: number | null;
    transformation_score: number | null;
    overall_score: number | null;
  };
  const previousRanks = new Map<string, number | null>();
  const existingIds = new Map<string, string>();
  const previousDimensions = new Map<string, ExistingRow>();
  for (const row of (existing ?? []) as ExistingRow[]) {
    if (row.candidate_id) {
      previousRanks.set(row.candidate_id, row.rank_position ?? null);
      existingIds.set(row.candidate_id, row.id);
      previousDimensions.set(row.candidate_id, row);
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
  const trigger = options?.trigger ?? { trigger: "scoring_run" };
  const rows = scored.map((s) => {
    const moved = s.previousRank != null && s.previousRank !== s.rank;
    const isNew = s.previousRank == null;
    const prev = previousDimensions.get(s.candidateId);
    const dimDeltas = prev
      ? buildDimensionDeltas(prev, s)
      : null;

    // Capture rank_change_reason whenever the candidate is new OR
    // their rank moved. Static rows keep their previous reason — the
    // modal would have nothing fresh to show otherwise.
    const reason =
      moved || isNew
        ? {
            ...trigger,
            previous_rank: s.previousRank,
            new_rank: s.rank,
            previous_overall: prev?.overall_score ?? null,
            new_overall: s.overall,
            dimension_score_deltas: dimDeltas,
          }
        : undefined;

    return {
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
      ...(reason !== undefined
        ? {
            rank_change_reason: reason,
            rank_changed_at: now,
          }
        : {}),
      analysis: {
        weights_snapshot: weights,
        computed_at: now,
      },
      updated_at: now,
    };
  });

  const { error: upsertError } = await supabase
    .from("candidate_scores")
    .upsert(rows, { onConflict: "project_id,candidate_id" });

  if (upsertError) {
    throw new Error(`Failed to upsert candidate scores: ${upsertError.message}`);
  }

  return scored;
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

/**
 * Per-dimension before/after pairs for the rank-change-explanation
 * modal. Only emits dimensions that actually moved — keeps the JSON
 * compact and the UI focused on what changed.
 */
function buildDimensionDeltas(
  prev: {
    technical_score: number | null;
    domain_score: number | null;
    leadership_score: number | null;
    regulatory_score: number | null;
    transformation_score: number | null;
  },
  next: ScoredCandidate
): Array<{ dimension: keyof FitDimensions; before: number; after: number }> {
  const pairs: Array<{
    dimension: keyof FitDimensions;
    before: number;
    after: number;
  }> = [];
  const dims: Array<{
    key: keyof FitDimensions;
    prev: number | null;
    next: number;
  }> = [
    { key: "technical", prev: prev.technical_score, next: next.technical },
    { key: "domain", prev: prev.domain_score, next: next.domain },
    { key: "leadership", prev: prev.leadership_score, next: next.leadership },
    { key: "regulatory", prev: prev.regulatory_score, next: next.regulatory },
    {
      key: "transformation",
      prev: prev.transformation_score,
      next: next.transformation,
    },
  ];
  for (const d of dims) {
    if (d.prev == null) continue;
    if (d.prev !== d.next) {
      pairs.push({ dimension: d.key, before: d.prev, after: d.next });
    }
  }
  return pairs;
}
