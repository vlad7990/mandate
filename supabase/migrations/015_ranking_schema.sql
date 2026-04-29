-- Bring candidate_scores in line with the app's dimension naming and add
-- the columns needed for cumulative leaderboard tracking.
--
-- 1. Rename scale_score -> leadership_score (and the CHECK constraint that
--    enforced its 0–10 bound). The rest of the app speaks in terms of
--    'leadership' (CV-parsing fit_dimensions, calibration_model
--    dimension_weights), so the schema mismatch was a footgun. There are
--    no rows in the table today, so the rename is non-destructive.
-- 2. Add previous_rank for rank-movement (up/down arrows) on the ranking page.
-- 3. UNIQUE (project_id, candidate_id) so each candidate has one
--    canonical score row per project. The scoring engine upserts on
--    that key — no row history needed for the leaderboard view.

ALTER TABLE public.candidate_scores
  RENAME COLUMN scale_score TO leadership_score;

ALTER TABLE public.candidate_scores
  RENAME CONSTRAINT candidate_scores_scale_score_check
              TO   candidate_scores_leadership_score_check;

ALTER TABLE public.candidate_scores
  ADD COLUMN IF NOT EXISTS previous_rank integer;

CREATE UNIQUE INDEX IF NOT EXISTS unique_candidate_score_per_project
  ON public.candidate_scores (project_id, candidate_id);

CREATE INDEX IF NOT EXISTS candidate_scores_project_rank_idx
  ON public.candidate_scores (project_id, rank_position ASC);
