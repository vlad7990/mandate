-- Refactor org-scoping policies on the six org-owned tables to use
-- public.current_user_org_id() (SECURITY DEFINER) instead of an inline
-- subquery against public.users.
--
-- Two improvements per policy:
--   1. Replace the per-row subquery with a single STABLE function call.
--   2. Add WITH CHECK (the original FOR ALL policies had USING but no
--      WITH CHECK, which silently blocked all writes).

DO $$
DECLARE
  tables text[] := ARRAY['projects','candidates','candidate_scores','feedback','job_specs','boolean_queries'];
  policies text[] := ARRAY['org_projects_only','org_candidates_only','org_scores_only','org_feedback_only','org_job_specs_only','org_queries_only'];
  i int;
BEGIN
  FOR i IN 1..array_length(tables,1) LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', policies[i], tables[i]);
  END LOOP;
END
$$;

CREATE POLICY org_projects_only ON public.projects
  FOR ALL TO authenticated
  USING (organization_id IS NOT NULL AND organization_id = public.current_user_org_id())
  WITH CHECK (organization_id IS NOT NULL AND organization_id = public.current_user_org_id());

CREATE POLICY org_candidates_only ON public.candidates
  FOR ALL TO authenticated
  USING (organization_id IS NOT NULL AND organization_id = public.current_user_org_id())
  WITH CHECK (organization_id IS NOT NULL AND organization_id = public.current_user_org_id());

CREATE POLICY org_scores_only ON public.candidate_scores
  FOR ALL TO authenticated
  USING (organization_id IS NOT NULL AND organization_id = public.current_user_org_id())
  WITH CHECK (organization_id IS NOT NULL AND organization_id = public.current_user_org_id());

CREATE POLICY org_feedback_only ON public.feedback
  FOR ALL TO authenticated
  USING (organization_id IS NOT NULL AND organization_id = public.current_user_org_id())
  WITH CHECK (organization_id IS NOT NULL AND organization_id = public.current_user_org_id());

CREATE POLICY org_job_specs_only ON public.job_specs
  FOR ALL TO authenticated
  USING (organization_id IS NOT NULL AND organization_id = public.current_user_org_id())
  WITH CHECK (organization_id IS NOT NULL AND organization_id = public.current_user_org_id());

CREATE POLICY org_queries_only ON public.boolean_queries
  FOR ALL TO authenticated
  USING (organization_id IS NOT NULL AND organization_id = public.current_user_org_id())
  WITH CHECK (organization_id IS NOT NULL AND organization_id = public.current_user_org_id());
