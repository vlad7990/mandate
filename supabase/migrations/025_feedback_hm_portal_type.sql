-- Allow `feedback_type = 'hm_portal'` on feedback rows.
--
-- The hiring-manager portal submit handler (/hm/[token]/api/submit)
-- mirrors each rated candidate into the existing `feedback` table so
-- the recalibration loop fires. It tags those rows with
-- `feedback_type = 'hm_portal'` so the feedback page can later filter
-- portal-sourced submissions distinctly from in-app recruiter or
-- hiring-manager entries.
--
-- The original CHECK from migration 016 only allowed:
--   recruiter_note | hiring_manager | interview_outcome
-- which silently rejected the portal mirror writes (the route logged
-- the error and returned 200, so the HM saw "submitted!" but no row
-- ever landed in feedback). This migration adds 'hm_portal' to the
-- allowed set.

ALTER TABLE public.feedback
  DROP CONSTRAINT IF EXISTS feedback_feedback_type_check;

ALTER TABLE public.feedback
  ADD CONSTRAINT feedback_feedback_type_check
  CHECK (
    feedback_type = ANY (
      ARRAY[
        'recruiter_note',
        'hiring_manager',
        'interview_outcome',
        'hm_portal'
      ]
    )
  );
