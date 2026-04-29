-- Add a terminal-state error column to job_specs.
--
-- A failure during the final persist step in generate-job-spec.ts could
-- leave a row stranded with is_generating=true forever, because the catch
-- path that clears the flag was only wired for failures BEFORE the final
-- update (project fetch, Anthropic call, JSON parse). The polling UI then
-- spun indefinitely with no in-app recovery.
--
-- generation_error stores the failure reason. The page now routes a row
-- with generation_error set to a dedicated error view with a retry CTA,
-- and markGenerationFailed clears is_generating + writes the error in one
-- update so the row is always reachable.
ALTER TABLE public.job_specs
  ADD COLUMN IF NOT EXISTS generation_error text;
