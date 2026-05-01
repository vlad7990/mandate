-- Hiring-manager psychology / preference model.
--
-- A per-project JSONB blob the Client Psychology Agent populates by
-- reading the project's feedback rows + hiring_manager_reviews. It
-- captures stated vs revealed preferences, bias patterns, and
-- deal-breaker signals so the recruiter can predict which candidates
-- will land with the client. Refreshes on every new feedback row past
-- the 3-item threshold.
--
-- Distinct from `recalibration_summary` (last applied weight delta)
-- and `calibration_model` (the live scoring weights). This column is
-- pure intelligence — never feeds the candidate scorer.

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS client_psychology jsonb;

COMMENT ON COLUMN public.projects.client_psychology IS
  'Hiring-manager preference model derived from feedback patterns. See src/lib/ai/client-psychology-agent.ts for the shape.';
