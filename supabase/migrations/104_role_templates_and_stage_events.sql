-- 104: the role-template creator's schema touches + the Kanban
-- eventing rider (product-pass slice three; §107 ruling, D-gate
-- confirmed 2026-08-25).
--
-- Four parts:
--   1. activity_events CHECK rebuilt from the LIVE list (75 values,
--      read from pg_constraint 2026-08-25) + candidate_stage_changed
--      = 76. A recruiter's pipeline move — the dropdown shipped
--      months ago and the board's drag — recorded nothing until now
--      (§106's finding).
--   2. record_activity_event grows the type, WITH a family gate:
--      candidate_stage_changed is a candidates:write act, and
--      can_write_candidates() already exists in SQL — the 102
--      skill_% precedent. A viewer cannot forge a stage-change
--      event through the intent door.
--   3. executive_audit_events CHECK + template_created / updated /
--      deleted — org-authored template acts belong in the module's
--      own ledger (D3(b), founder's word). search_id is nullable;
--      these events carry none.
--   4. executive_role_templates gains created_by — the table
--      predates authoring; the 8 global seeds stay NULL. updated_at
--      stays app-stamped like every other surface (no house
--      trigger exists to reuse — deviation from the D-gate's
--      wording, recorded in §108).

-- 1 ────────────────────────────────────────────────────────────────
ALTER TABLE public.activity_events
  DROP CONSTRAINT IF EXISTS activity_events_type_known;

ALTER TABLE public.activity_events
  ADD CONSTRAINT activity_events_type_known CHECK (event_type IN (
    'placement_recorded', 'placement_status_changed',
    'placement_signoff_changed', 'placement_deleted',
    'fee_recorded', 'fee_updated', 'fee_line_earned',
    'fee_line_cancelled', 'fee_reversed', 'fee_terms_created',
    'fee_terms_updated', 'fee_terms_deleted',
    'client_contact_added', 'client_contact_updated',
    'client_contact_removed',
    'member_role_changed', 'member_status_changed',
    'member_founder_changed', 'member_org_changed',
    'shortlist_published', 'report_exported', 'hm_portal_opened',
    'mandate_reassigned',
    'external_invited', 'external_invitation_revoked',
    'external_invitation_resent', 'external_joined',
    'external_role_changed', 'external_status_changed',
    'mandate_shared', 'mandate_unshared',
    'external_access_granted', 'external_access_revoked',
    'candidate_portal_link_issued', 'candidate_portal_link_revoked',
    'candidate_self_updated', 'candidate_withdrew',
    'candidate_erasure_requested', 'candidate_cv_submitted',
    'feedback_interpreted', 'candidates_ranked', 'candidate_parsed',
    'candidate_evaluated', 'candidate_positioned',
    'candidate_researched', 'candidate_triangulated',
    'candidate_profiled', 'desk_digest_generated',
    'company_researched', 'hm_researched', 'culture_profiled',
    'sourcing_queries_generated', 'intake_analyzed',
    'health_suggested', 'weekly_report_generated',
    'calibration_derived', 'job_spec_generated',
    'shortlist_report_generated', 'copilot_answered',
    'success_profile_generated', 'interview_plan_generated',
    'executive_context_researched', 'candidate_search_answered',
    'sourcing_search_executed', 'outreach_strategy_drafted',
    'relationship_updated', 'network_dnc_set', 'network_dnc_cleared',
    'engagement_updated', 'prescreen_updated',
    'skill_created', 'skill_updated', 'skill_paused',
    'skill_activated', 'skill_deleted',
    'candidate_stage_changed'
  ));

-- 2 ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.record_activity_event(
  p_event_type   text,
  p_project_id   uuid DEFAULT NULL,
  p_candidate_id uuid DEFAULT NULL,
  p_client_id    uuid DEFAULT NULL,
  p_detail       jsonb DEFAULT '{}'::jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_org uuid := (SELECT public.current_user_org_id());
BEGIN
  IF p_event_type NOT IN ('shortlist_published', 'report_exported',
                          'hm_portal_opened', 'mandate_reassigned',
                          'skill_created', 'skill_updated', 'skill_paused',
                          'skill_activated', 'skill_deleted',
                          'candidate_stage_changed') THEN
    RAISE EXCEPTION 'record_activity_event: % is not an app-recordable event', p_event_type;
  END IF;

  IF p_event_type LIKE 'skill\_%'
     AND (SELECT public.is_org_admin()) IS NOT TRUE THEN
    RAISE EXCEPTION 'record_activity_event: % is an admin act', p_event_type
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- A stage change is a candidates:write act. Without this, any
  -- reader could stamp the trail with moves nobody made.
  IF p_event_type = 'candidate_stage_changed'
     AND (SELECT public.can_write_candidates()) IS NOT TRUE THEN
    RAISE EXCEPTION 'record_activity_event: % is a candidate-writer act', p_event_type
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_org IS NULL OR (SELECT public.can_read_org()) IS NOT TRUE THEN
    RETURN;
  END IF;
  PERFORM public.write_activity_event(
    p_organization_id => v_org,
    p_event_type      => p_event_type,
    p_visibility      => 'org',
    p_project_id      => p_project_id,
    p_candidate_id    => p_candidate_id,
    p_client_id       => p_client_id,
    p_detail          => p_detail
  );
END;
$$;

-- CREATE OR REPLACE resets grants; re-declare the door's audience.
REVOKE ALL ON FUNCTION public.record_activity_event(text, uuid, uuid, uuid, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.record_activity_event(text, uuid, uuid, uuid, jsonb) TO authenticated, service_role;

-- 3 ────────────────────────────────────────────────────────────────
ALTER TABLE public.executive_audit_events
  DROP CONSTRAINT IF EXISTS executive_audit_events_event_type_check;

ALTER TABLE public.executive_audit_events
  ADD CONSTRAINT executive_audit_events_event_type_check CHECK (event_type IN (
    'search_created', 'search_updated',
    'profile_generation_requested', 'profile_generated',
    'profile_generation_failed', 'profile_edited',
    'profile_new_version', 'profile_regenerated', 'profile_approved',
    'candidate_linked', 'candidate_unlinked', 'candidate_stage_changed',
    'interview_plan_generation_requested', 'interview_plan_generated',
    'interview_plan_generation_failed', 'interview_plan_edited',
    'interview_plan_new_version', 'interview_plan_regenerated',
    'interview_plan_approved',
    'assessment_created', 'assessment_edited',
    'assessment_new_version', 'assessment_approved',
    'risk_review_generation_requested', 'risk_review_generated',
    'risk_review_generation_failed', 'risk_review_edited',
    'risk_review_new_version', 'risk_review_regenerated',
    'risk_review_approved',
    'template_created', 'template_updated', 'template_deleted'
  ));

-- 4 ────────────────────────────────────────────────────────────────
ALTER TABLE public.executive_role_templates
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.users(id);

COMMENT ON COLUMN public.executive_role_templates.created_by IS
  'The admin who authored an org template. NULL on the global seeds.';
