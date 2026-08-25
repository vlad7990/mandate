-- 109: pre-launch checklist, sweep one — the advisor's unindexed
-- foreign keys (27, INFO) and the two mutable-search_path functions
-- (WARN). Advisor read live 2026-08-25 (§121; the checklist is the
-- CLAUDE.md standing order).
--
-- Every index is a plain single-column CREATE INDEX IF NOT EXISTS:
-- several of these columns already sit inside composite indexes led
-- by organization_id, which serves the app's read paths but not the
-- FK's own lookup (cascade and delete checks scan by the column
-- alone). Purely additive; nothing here changes a policy, a grant or
-- a behaviour.

CREATE INDEX IF NOT EXISTS candidate_erasure_requests_requested_via_token_idx
  ON public.candidate_erasure_requests (requested_via_token);
CREATE INDEX IF NOT EXISTS candidate_erasure_requests_resolved_by_idx
  ON public.candidate_erasure_requests (resolved_by);
CREATE INDEX IF NOT EXISTS candidate_notes_created_by_idx
  ON public.candidate_notes (created_by);
CREATE INDEX IF NOT EXISTS candidate_notes_project_id_idx
  ON public.candidate_notes (project_id);
CREATE INDEX IF NOT EXISTS candidate_portal_tokens_issued_by_idx
  ON public.candidate_portal_tokens (issued_by);
CREATE INDEX IF NOT EXISTS clients_created_by_idx
  ON public.clients (created_by);
CREATE INDEX IF NOT EXISTS desk_digests_created_by_idx
  ON public.desk_digests (created_by);
CREATE INDEX IF NOT EXISTS executive_role_templates_created_by_idx
  ON public.executive_role_templates (created_by);
CREATE INDEX IF NOT EXISTS feedback_submitted_by_idx
  ON public.feedback (submitted_by);
CREATE INDEX IF NOT EXISTS hiring_manager_reviews_token_id_idx
  ON public.hiring_manager_reviews (token_id);
CREATE INDEX IF NOT EXISTS hiring_manager_tokens_created_by_idx
  ON public.hiring_manager_tokens (created_by);
CREATE INDEX IF NOT EXISTS job_specs_created_by_idx
  ON public.job_specs (created_by);
CREATE INDEX IF NOT EXISTS okr_key_results_attested_by_idx
  ON public.objective_key_results (attested_by);
CREATE INDEX IF NOT EXISTS objectives_closed_by_idx
  ON public.objectives (closed_by);
CREATE INDEX IF NOT EXISTS objectives_created_by_idx
  ON public.objectives (created_by);
CREATE INDEX IF NOT EXISTS objectives_owner_user_id_idx
  ON public.objectives (owner_user_id);
CREATE INDEX IF NOT EXISTS objectives_project_id_idx
  ON public.objectives (project_id);
CREATE INDEX IF NOT EXISTS project_reports_generated_by_idx
  ON public.project_reports (generated_by);
CREATE INDEX IF NOT EXISTS projects_created_by_idx
  ON public.projects (created_by);
CREATE INDEX IF NOT EXISTS projects_lead_recruiter_id_idx
  ON public.projects (lead_recruiter_id);
CREATE INDEX IF NOT EXISTS shortlists_created_by_idx
  ON public.shortlists (created_by);
CREATE INDEX IF NOT EXISTS shortlists_submitted_by_idx
  ON public.shortlists (submitted_by);
CREATE INDEX IF NOT EXISTS skills_created_by_idx
  ON public.skills (created_by);
CREATE INDEX IF NOT EXISTS tasks_assignee_id_idx
  ON public.tasks (assignee_id);
CREATE INDEX IF NOT EXISTS tasks_completed_by_idx
  ON public.tasks (completed_by);
CREATE INDEX IF NOT EXISTS tasks_created_by_idx
  ON public.tasks (created_by);
CREATE INDEX IF NOT EXISTS tasks_project_id_idx
  ON public.tasks (project_id);

-- The two functions the linter flags with a mutable search_path.
-- Neither is SECURITY DEFINER, so this is hygiene rather than a
-- boundary — but hygiene the launch sweep should not leave behind.
ALTER FUNCTION public.candidate_identity_key(p_email text, p_linkedin_url text, p_full_name text, p_current_company text)
  SET search_path = public;
ALTER FUNCTION public.complete_candidate_send(p_outreach_id uuid, p_provider_message_id text, p_recipient text, p_template_key text, p_template_version text, p_notice_version text, p_notice_idempotency_key text)
  SET search_path = public;
