-- Add onboarding_responses jsonb column to public.projects.
-- Captures the answers from the dynamic onboarding questionnaire
-- (origin, must-haves, anti-patterns, stakeholders, priority signals)
-- before they are distilled into calibration_model.dimension_weights.
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS onboarding_responses jsonb NOT NULL DEFAULT '{}'::jsonb;
