-- 090 — the stuck-mandate retry surface (§55's standing gap; D1).
--
-- One nullable column, no policies, no grants. NULL means "no terminal
-- intake failure recorded"; a sentence here means the analysis failed
-- or was refused and the page owes the recruiter honesty instead of a
-- pulsing skeleton. Every write rides EXISTING update policies:
-- the failure markers are the recruiter's own bookkeeping (the human
-- half of the seam and the poller's timeout marker — the
-- markGenerationFailed precedent from job_specs), and the Intake
-- Agent's success UPDATE clears it atomically with the title landing,
-- so a slow run arriving after a timeout marker leaves no stale
-- sentence. Only authored or safeFailureMessage-filtered text is ever
-- stored — never the brief, never a provider body.

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS intake_error text;

COMMENT ON COLUMN public.projects.intake_error IS
  'Terminal intake-analysis failure sentence, rendered verbatim with a '
  'retry CTA. NULL while analyzing and after success (the success '
  'UPDATE clears it). Written only by the human half: the seam''s '
  'failure bookkeeping and the poller''s guarded timeout marker. '
  'Sanitised via safeFailureMessage — provider payloads never land here.';
