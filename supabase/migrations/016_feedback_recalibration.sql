-- Feedback + Recalibration support.
--
-- 1. Rename the feedback_type CHECK to the more descriptive enum the app
--    speaks: recruiter_note / hiring_manager / interview_outcome.
--    The original schema had recruiter / hiring_manager / interview;
--    no rows in production so the rename is non-destructive.
--
-- 2. Add recalibration_summary jsonb to projects so the ranking page can
--    surface a banner pointing at the feedback row that last shifted the
--    dimension_weights. Lives on the project (not on the feedback row)
--    because the *latest* recalibration is what matters to the recruiter
--    landing on the project page.

ALTER TABLE public.feedback
  DROP CONSTRAINT IF EXISTS feedback_feedback_type_check;

ALTER TABLE public.feedback
  ADD CONSTRAINT feedback_feedback_type_check
    CHECK (feedback_type = ANY (ARRAY[
      'recruiter_note'::text,
      'hiring_manager'::text,
      'interview_outcome'::text
    ]));

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS recalibration_summary jsonb;

CREATE INDEX IF NOT EXISTS feedback_project_created_idx
  ON public.feedback (project_id, created_at DESC);
