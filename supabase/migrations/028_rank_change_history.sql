-- F2 — Rank Change Explanation
--
-- Augment candidate_scores so the ranking page can explain WHY a row
-- moved. previous_rank already exists (migration 015); we add a
-- captured-at timestamp and a structured reason blob populated on every
-- computeAndStoreScores() call.

ALTER TABLE public.candidate_scores
  ADD COLUMN IF NOT EXISTS rank_changed_at timestamptz,
  ADD COLUMN IF NOT EXISTS rank_change_reason jsonb;

COMMENT ON COLUMN public.candidate_scores.rank_changed_at IS
  'Set whenever previous_rank != rank_position after a scoring run. Used by the ranking page to show "moved 2h ago".';

COMMENT ON COLUMN public.candidate_scores.rank_change_reason IS
  E'Structured payload describing what triggered the move:\n  { trigger: "feedback" | "recalibration" | "new_candidate" | "weights_edit" | "scoring_run",\n    feedback_id?: uuid,\n    summary?: string,\n    weight_deltas?: { dimension: string, before: int, after: int }[],\n    dimension_score_deltas?: { dimension: string, before: number, after: number }[] }\nAttached during computeAndStoreScores() and downstream callers (recalibrate, manual weight edits).';
