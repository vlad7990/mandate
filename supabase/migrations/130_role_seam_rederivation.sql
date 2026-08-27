-- ---------------------------------------------------------------------------
-- 130 — §177 (F-A): the role seam gets a trail event.
--
-- §175 found that there are TWO sources of role truth and the
-- highest-stakes consumer reads only the one that is never updated:
-- `job_specs` holds the spec the recruiter finalised, while
-- `projects.calibration_model.role_title` holds what the Intake Agent
-- inferred from a one-line brief. Nothing reconciled them. In
-- production a candidate was scored down for lacking exactly what the
-- finalised spec says is NOT required, and returned `do_not_include`.
--
-- The fix is a door (evaluation and ranking refuse when the calibration
-- did not come from the final spec) plus a remedy the recruiter invokes
-- explicitly. This migration carries only the trail's half of it.
--
-- WHY THERE IS NO DDL BEYOND THIS CHECK (ruling A.2): the staleness
-- stamp lives INSIDE the calibration_model JSONB as
-- `derived_from_spec_id`, not in a column. A real FK
-- `projects -> job_specs` would close a cycle against
-- `job_specs.project_id -> projects` — the exact shape that produces
-- PGRST201 ambiguity on bare embeds, which this codebase has shipped to
-- production twice — and would force an AMBIGUOUS_PAIRS regeneration in
-- embed-ambiguity.test.ts. The referential integrity that trade gives
-- up is bought back in spec-drift.ts, which treats ANY value that is
-- not the live final spec's id as stale and refuses. It fails closed.
--
-- Ruling A.6: ONE new event, written by the CALIBRATION AGENT through
-- record_agent_event under its own session — so it is NOT added to
-- APP_RECORDABLE_EVENTS. Refusals record nothing, matching sourcing's
-- no_final_spec, which records nothing either.
--
-- Counts: anon roster stays TWELVE — this migration creates no
-- function, so nothing can inherit PUBLIC EXECUTE. Agent allowlist
-- stays 29: the Calibration Agent is already a principal and
-- job_specs_agent_select already makes its read of the spec lawful.
-- Intent doors stay 26 — the refusal is a plain throw in the action,
-- like sourcing's, not a new door. Activity CHECK moves 97 -> 98, with
-- describe.test.ts bumped in the same commit.
-- ---------------------------------------------------------------------------

ALTER TABLE public.activity_events
  DROP CONSTRAINT IF EXISTS activity_events_type_known;

ALTER TABLE public.activity_events
  ADD CONSTRAINT activity_events_type_known CHECK (event_type IN (
    'placement_recorded', 'placement_status_changed', 'placement_signoff_changed',
    'placement_deleted', 'fee_recorded', 'fee_updated', 'fee_line_earned',
    'fee_line_cancelled', 'fee_reversed', 'fee_terms_created', 'fee_terms_updated',
    'fee_terms_deleted', 'client_contact_added', 'client_contact_updated',
    'client_contact_removed', 'member_role_changed', 'member_status_changed',
    'member_founder_changed', 'member_org_changed', 'shortlist_published',
    'report_exported', 'hm_portal_opened', 'mandate_reassigned', 'external_invited',
    'external_invitation_revoked', 'external_invitation_resent', 'external_joined',
    'external_role_changed', 'external_status_changed', 'mandate_shared',
    'mandate_unshared', 'external_access_granted', 'external_access_revoked',
    'candidate_portal_link_issued', 'candidate_portal_link_revoked',
    'candidate_self_updated', 'candidate_withdrew', 'candidate_erasure_requested',
    'candidate_cv_submitted', 'feedback_interpreted', 'candidates_ranked',
    'candidate_parsed', 'candidate_evaluated', 'candidate_positioned',
    'candidate_researched', 'candidate_triangulated', 'candidate_profiled',
    'desk_digest_generated', 'company_researched', 'hm_researched',
    'culture_profiled', 'sourcing_queries_generated', 'intake_analyzed',
    'health_suggested', 'weekly_report_generated', 'calibration_derived',
    'job_spec_generated', 'shortlist_report_generated', 'copilot_answered',
    'success_profile_generated', 'interview_plan_generated',
    'executive_context_researched', 'candidate_search_answered',
    'sourcing_search_executed', 'outreach_strategy_drafted', 'relationship_updated',
    'network_dnc_set', 'network_dnc_cleared', 'engagement_updated',
    'prescreen_updated', 'skill_created', 'skill_updated', 'skill_paused',
    'skill_activated', 'skill_deleted', 'candidate_stage_changed', 'task_assigned',
    'task_completed', 'objective_created', 'objective_closed',
    'interview_plan_generation_requested', 'interview_plan_generation_failed',
    'interview_plan_approved', 'client_interview_generation_requested',
    'client_interview_generation_failed', 'client_interview_approved',
    'client_interview_answered', 'model_provider_added', 'model_assignment_changed',
    'invoice_created', 'invoice_issued', 'invoice_voided', 'invoice_sent',
    -- 129:
    'admin_grant_proposed', 'admin_grant_approved', 'admin_grant_rejected',
    'admin_grant_expired',
    -- 130: which role, as distinct from calibration_derived's what matters.
    'calibration_rederived'
  ));
