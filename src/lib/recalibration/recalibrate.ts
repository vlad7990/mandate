import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import {
  DIMENSION_KEYS,
  type DimensionKey,
  type DimensionWeights,
} from "@/lib/ai/onboarding-analysis";
import type { CalibrationModel } from "@/lib/ai/role-analysis";
import type {
  FeedbackInterpretation,
  WeightAdjustment,
} from "@/lib/ai/feedback-analysis";
import { computeAndStoreScores } from "@/lib/ranking/scoring-engine";

export type RecalibrationResult = {
  applied: boolean;
  before: DimensionWeights;
  after: DimensionWeights;
  appliedAdjustments: WeightAdjustment[];
  reason: string;
};

/**
 * Apply the AI-suggested weight adjustments to the project's
 * calibration_model.dimension_weights, persist the new model, and
 * re-run candidate scoring so the leaderboard reflects the shift.
 *
 * Bounds every dimension to [0, 10] before persisting (the schema
 * itself only enforces this on candidate_scores, not on the weights
 * inside calibration_model jsonb, but we mirror the convention so the
 * fit calculator stays consistent).
 *
 * Idempotent: if no current weights exist, the recalibration is skipped
 * — there's nothing to delta against.
 */
export async function applyRecalibration(
  projectId: string,
  feedbackId: string,
  interpretation: FeedbackInterpretation,
  client?: SupabaseClient
): Promise<RecalibrationResult> {
  // Optional client lets unauthenticated callers (HM portal after()
  // callback) pass a service-role client; default path resolves the
  // SSR client bound to the recruiter's session.
  const supabase = client ?? (await createServerSupabaseClient());

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("calibration_model")
    .eq("id", projectId)
    .single<{ calibration_model: Partial<CalibrationModel> | null }>();

  if (projectError || !project) {
    throw new Error(
      `Failed to load project for recalibration: ${projectError?.message ?? "not found"}`
    );
  }

  const before = project.calibration_model?.dimension_weights;
  if (!before) {
    // No baseline weights yet (calibration step not finished). Skip
    // recalibration but don't raise — recruiter can still view the
    // interpretation in the audit log.
    const empty = emptyWeights();
    return {
      applied: false,
      before: empty,
      after: empty,
      appliedAdjustments: [],
      reason: "No calibration_model.dimension_weights to adjust yet.",
    };
  }

  const { after, applied } = applyAdjustments(
    before,
    interpretation.suggested_weight_adjustments
  );

  // Persist the new weights inside calibration_model.
  const updatedCalibration: Partial<CalibrationModel> = {
    ...(project.calibration_model ?? {}),
    dimension_weights: after,
  };

  const summary = {
    feedback_id: feedbackId,
    summary: interpretation.summary,
    applied_adjustments: applied,
    before,
    after,
    applied_at: new Date().toISOString(),
  };

  const { error: updateError } = await supabase
    .from("projects")
    .update({
      calibration_model: updatedCalibration,
      recalibration_summary: summary,
      updated_at: new Date().toISOString(),
    })
    .eq("id", projectId);

  if (updateError) {
    throw new Error(
      `Failed to persist recalibrated weights: ${updateError.message}`
    );
  }

  // Re-run scoring so the ranking page reflects the new weights and the
  // previous_rank column captures the pre-recalibration order. Scoring
  // failures are logged but do not roll back the calibration update —
  // the next ranking-page visit will auto-score from the fresh weights.
  try {
    await computeAndStoreScores(projectId, client);
  } catch (err) {
    console.error(
      "[recalibrate] scoring re-run failed (calibration kept)",
      err
    );
  }

  // Mark the feedback row so the audit log can highlight it.
  const { error: feedbackUpdateError } = await supabase
    .from("feedback")
    .update({ triggered_recalibration: true })
    .eq("id", feedbackId);

  if (feedbackUpdateError) {
    console.error(
      "[recalibrate] failed to mark feedback as recalibration trigger",
      feedbackUpdateError
    );
  }

  return {
    applied: applied.length > 0,
    before,
    after,
    appliedAdjustments: applied,
    reason: interpretation.summary,
  };
}

function applyAdjustments(
  before: DimensionWeights,
  raw: WeightAdjustment[]
): { after: DimensionWeights; applied: WeightAdjustment[] } {
  const after: DimensionWeights = { ...before };
  const applied: WeightAdjustment[] = [];

  // De-duplicate by dimension; if the AI emitted multiple deltas for the
  // same dimension we sum them and keep the longest reason.
  const merged = new Map<DimensionKey, WeightAdjustment>();
  for (const adj of raw ?? []) {
    if (!DIMENSION_KEYS.includes(adj.dimension)) continue;
    if (!Number.isFinite(adj.delta) || adj.delta === 0) continue;
    const existing = merged.get(adj.dimension);
    if (existing) {
      existing.delta += Math.round(adj.delta);
      if (adj.reason.length > existing.reason.length) {
        existing.reason = adj.reason;
      }
    } else {
      merged.set(adj.dimension, {
        dimension: adj.dimension,
        delta: Math.round(adj.delta),
        reason: adj.reason,
      });
    }
  }

  for (const adj of merged.values()) {
    const next = clamp10((before[adj.dimension] ?? 0) + adj.delta);
    if (next !== before[adj.dimension]) {
      after[adj.dimension] = next;
      applied.push({
        dimension: adj.dimension,
        delta: next - (before[adj.dimension] ?? 0),
        reason: adj.reason,
      });
    }
  }

  return { after, applied };
}

function clamp10(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(10, Math.round(n)));
}

function emptyWeights(): DimensionWeights {
  return {
    technical: 0,
    domain: 0,
    leadership: 0,
    regulatory: 0,
    transformation: 0,
  };
}
