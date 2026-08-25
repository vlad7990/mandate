-- 102 — Skills Studio gets a trail: the skill-change vocabulary
-- (the §99 review's finding #4, on the founder's word 2026-08-25).
--
-- A skill is the one control surface that changes the behaviour of
-- every agent principal, and until now its changes were invisible in
-- the activity trail: created_by at birth, an updated_at, and
-- nothing else — no who, no when, no what-was-it-called. This
-- migration gives the studio the same property every other
-- consequential surface has: the change writes its own record.
--
--   * FIVE human event types — skill_created / skill_updated /
--     skill_paused / skill_activated / skill_deleted — join the
--     table CHECK (rebuilt from the LIVE pg_constraint list, 70 →
--     75) and the `record_activity_event` intent allowlist.
--   * The skill family is ADMIN-GATED inside the RPC (the 077
--     human-intent-door precedent): only the role that can change a
--     skill (skills:write = admin; RLS is_org_admin) can claim to
--     have changed one. Every other org member — and every agent —
--     is refused by name. The rest of the intent set keeps its
--     existing can_read_org gate unchanged.
--   * The AGENT allowlist (`record_agent_event`) is UNTOUCHED at
--     twenty-nine: a skill change is a human act, and the agent
--     door refuses the family automatically.
--
-- The trail rows carry the skill's NAME, type and scope — never the
-- instructions' text (the standing text-probe doctrine: steering
-- content does not ride the trail).

-- ---------------------------------------------------------------------------
-- 1. The table CHECK — rebuilt from the LIVE list (70 values), + 5.
-- ---------------------------------------------------------------------------

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
    'executive_context_researched',
    'candidate_search_answered', 'sourcing_search_executed',
    'outreach_strategy_drafted',
    'relationship_updated', 'network_dnc_set', 'network_dnc_cleared',
    'engagement_updated',
    'prescreen_updated',
    -- 102: the Skills Studio's five HUMAN acts.
    'skill_created', 'skill_updated', 'skill_paused',
    'skill_activated', 'skill_deleted'
  ));

-- ---------------------------------------------------------------------------
-- 2. record_activity_event — the intent door grows the skill family,
--    admin-gated. Existing intent types keep their existing gate.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.record_activity_event(
  p_event_type   text,
  p_project_id   uuid DEFAULT NULL,
  p_candidate_id uuid DEFAULT NULL,
  p_client_id    uuid DEFAULT NULL,
  p_detail       jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid := (SELECT public.current_user_org_id());
BEGIN
  IF p_event_type NOT IN ('shortlist_published', 'report_exported',
                          'hm_portal_opened', 'mandate_reassigned',
                          'skill_created', 'skill_updated', 'skill_paused',
                          'skill_activated', 'skill_deleted') THEN
    RAISE EXCEPTION 'record_activity_event: % is not an app-recordable event', p_event_type;
  END IF;

  -- The skill family is admin territory: only the role that can
  -- change a skill can claim to have changed one. Agents are 'agent',
  -- not admin — the same refusal covers them.
  IF p_event_type LIKE 'skill\_%'
     AND (SELECT public.is_org_admin()) IS NOT TRUE THEN
    RAISE EXCEPTION 'record_activity_event: % is an admin act', p_event_type
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

REVOKE ALL ON FUNCTION public.record_activity_event(text, uuid, uuid, uuid, jsonb)
  FROM public, anon;
GRANT EXECUTE ON FUNCTION public.record_activity_event(text, uuid, uuid, uuid, jsonb)
  TO authenticated;
