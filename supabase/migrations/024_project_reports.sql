-- Weekly progress reports — per-project, AI-generated, version-history.
--
-- One row per generated report. The recruiter clicks "Generate Weekly
-- Report"; the action shapes the project state (candidates sourced
-- this week, pipeline movement, ranking deltas, top 3, feedback
-- highlights, market commentary from company_context) and asks
-- Claude for a structured report. The result is stored verbatim so
-- the recruiter can scroll through historical reports without
-- regenerating.

CREATE TABLE IF NOT EXISTS public.project_reports (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  -- Monday of the ISO week the report covers; lets the UI pivot
  -- "weekly archive" without parsing the report content.
  week_starting   date NOT NULL,
  -- Structured report shape (see src/lib/ai/weekly-report-agent.ts).
  -- Stored as JSONB so we can render section-by-section, export to
  -- PDF, copy as markdown, or paste into an email body without
  -- re-parsing the AI output every time.
  content         jsonb NOT NULL,
  generated_at    timestamptz NOT NULL DEFAULT now(),
  generated_by    uuid REFERENCES public.users(id) ON DELETE SET NULL,
  -- Captured for audit + so future re-runs can replay against the same
  -- model when comparing report drift over time.
  ai_model        text NOT NULL DEFAULT '',
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.project_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS org_project_reports_only ON public.project_reports;
CREATE POLICY org_project_reports_only ON public.project_reports
  FOR ALL TO authenticated
  USING (
    organization_id IS NOT NULL
    AND organization_id = public.current_user_org_id()
  )
  WITH CHECK (
    organization_id IS NOT NULL
    AND organization_id = public.current_user_org_id()
  );

CREATE INDEX IF NOT EXISTS project_reports_project_idx
  ON public.project_reports (project_id, generated_at DESC);

CREATE INDEX IF NOT EXISTS project_reports_week_idx
  ON public.project_reports (project_id, week_starting DESC);
