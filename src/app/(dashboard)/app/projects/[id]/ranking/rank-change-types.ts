// Shape of `candidate_scores.rank_change_reason` (migration 028).
// Populated by computeAndStoreScores when a candidate's rank moves.

import type { FitDimensions } from "@/lib/ai/cv-parsing";

export type RankChangeTrigger =
  | "feedback"
  | "recalibration"
  | "weights_edit"
  | "new_candidate"
  | "scoring_run";

export type RankChangeReason = {
  trigger: RankChangeTrigger;
  feedback_id?: string;
  candidate_id?: string;
  summary?: string;
  previous_rank: number | null;
  new_rank: number;
  previous_overall: number | null;
  new_overall: number;
  dimension_score_deltas: Array<{
    dimension: keyof FitDimensions;
    before: number;
    after: number;
  }> | null;
};
