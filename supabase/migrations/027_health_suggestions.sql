-- AI-generated actionable suggestions surfaced when project health
-- is stalled or at_risk. Stored as JSONB on the project row so the
-- dashboard can render the latest set without re-running the agent
-- on every visit.
--
-- Shape (see src/lib/ai/search-health-agent.ts):
-- {
--   generated_at: string,
--   health_status: "stalled" | "at_risk",
--   summary: string,
--   suggestions: Array<{
--     id: string,                      // stable per-suggestion uuid
--     action: string,                  // headline action phrase
--     rationale: string,
--     priority: "high" | "medium" | "low",
--     category: "sourcing" | "calibration" | "feedback" | "outreach" | "other",
--     applicable_slot?: SlotKey,       // when category=sourcing
--     applicable_dimension?: DimensionKey,  // when category=calibration
--     applicable_payload?: jsonb,      // free-form for the apply action
--     dismissed?: boolean              // recruiter dismissed this one
--   }>
-- }

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS health_suggestions jsonb;

COMMENT ON COLUMN public.projects.health_suggestions IS
  'AI-generated health remediation suggestions. See src/lib/ai/search-health-agent.ts for the shape. Generated on demand; cached until next regenerate.';
