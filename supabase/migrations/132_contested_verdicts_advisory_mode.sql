-- ---------------------------------------------------------------------------
-- 132 — §182: contested verdicts + advisory mode.
--
-- Slice R (the contested verdict): before a negative evaluation verdict
-- stands, an independent refuter pass tries to refute it. The refuter's
-- output lives INSIDE cv_structured.evaluation.second_opinion — no DDL.
-- What the database gains is the trail's word for a disagreement:
-- `evaluation_contested`, written by the EVALUATOR through
-- record_agent_event on disagreement ONLY (concurrence is visible on
-- the report itself; an event for every agreement would bury the
-- signal). Activity CHECK 98 -> 99; agent-recordable allowlist 30 -> 31
-- IN THE SAME MIGRATION — the §177/§178 lesson, where the CHECK moved
-- without the allowlist and the event silently never landed.
--
-- Slice F (advisory mode): one org-level flag. `is_founder` is the
-- platform-operator bit, deliberately not a role, so the founder-facing
-- rendering keys on an EXPLICIT toggle rather than an inference from
-- org composition (one role change silently flipping every mandate's
-- rendering is the fragility that was ruled out). Render-only: the flag
-- changes how an evaluation is displayed, never what is stored.
-- `organizations_role_update` (admins, own org) already governs writes;
-- no new policy.
--
-- Counts: anon roster stays TWELVE (record_agent_event is re-granted
-- below with PUBLIC/anon revoked, per the 129 lesson); intent doors
-- stay 26.
-- ---------------------------------------------------------------------------

-- 1. Advisory mode — the founder's explicit switch (F.1).
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS advisory_mode boolean NOT NULL DEFAULT false;

-- 2. The trail's vocabulary: 98 -> 99.
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
    'admin_grant_proposed', 'admin_grant_approved', 'admin_grant_rejected',
    'admin_grant_expired',
    'calibration_rederived',
    -- 132: the refuter disagreed with a negative verdict.
    'evaluation_contested'
  ));

-- 3. The agent-recordable allowlist: 30 -> 31, in the same migration as
--    the CHECK, per the §178 lesson.
CREATE OR REPLACE FUNCTION public.record_agent_event(
  p_event_type text,
  p_project_id uuid DEFAULT NULL::uuid,
  p_candidate_id uuid DEFAULT NULL::uuid,
  p_detail jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_org uuid;
begin
  if p_event_type not in ('feedback_interpreted', 'candidates_ranked',
                          'candidate_parsed', 'candidate_evaluated',
                          'candidate_positioned', 'candidate_researched',
                          'candidate_triangulated', 'candidate_profiled',
                          'desk_digest_generated', 'company_researched',
                          'hm_researched', 'culture_profiled',
                          'sourcing_queries_generated', 'intake_analyzed',
                          'health_suggested', 'weekly_report_generated',
                          'calibration_derived', 'job_spec_generated',
                          'shortlist_report_generated', 'copilot_answered',
                          'success_profile_generated', 'interview_plan_generated',
                          'executive_context_researched',
                          'candidate_search_answered', 'sourcing_search_executed',
                          'outreach_strategy_drafted',
                          'relationship_updated', 'engagement_updated',
                          'prescreen_updated',
                          'calibration_rederived',
                          -- 132 (§182): the refuter's disagreement.
                          'evaluation_contested') then
    raise exception 'record_agent_event: % is not an agent-recordable event', p_event_type;
  end if;

  if not public.is_agent() then
    raise exception 'record_agent_event: only an active agent principal may record agent events'
      using errcode = 'insufficient_privilege';
  end if;

  if p_project_id is not null then
    select organization_id into v_org from public.projects where id = p_project_id;
  end if;
  if v_org is null and p_candidate_id is not null then
    select organization_id into v_org from public.candidates where id = p_candidate_id;
  end if;
  if v_org is null then
    v_org := (select public.current_user_org_id());
  end if;
  if v_org is null then
    return;
  end if;

  perform public.write_activity_event(
    p_organization_id => v_org,
    p_event_type      => p_event_type,
    p_visibility      => 'org',
    p_project_id      => p_project_id,
    p_candidate_id    => p_candidate_id,
    p_detail          => coalesce(p_detail, '{}'::jsonb)
  );
end;
$function$;

-- A replaced function inherits PUBLIC EXECUTE. Revoke, per the 129 lesson.
REVOKE ALL ON FUNCTION public.record_agent_event(text, uuid, uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_agent_event(text, uuid, uuid, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.record_agent_event(text, uuid, uuid, jsonb) TO authenticated;
