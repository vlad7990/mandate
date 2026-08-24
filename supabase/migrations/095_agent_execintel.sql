-- 095 — the Executive Intelligence Agent's doors and vocabulary (the
-- executive-generator cluster; D3/D4 of NEXT-execintel-agent.md,
-- D1–D8 confirmed 2026-08-24).
--
-- ONE principal, THREE judgments (the §50 companyintel precedent),
-- and the LARGEST grant cluster since 074. Two artifact doors are
-- double-pinned on the editorial state (the 092 shape, twice):
-- status = 'draft' in BOTH USING and WITH CHECK — the agent can
-- neither touch an approved (or archived) artifact nor move one out
-- of draft; approval stays the recruiter's act forever. The
-- executive ledger's agent door is impersonation-pinned (the 087
-- shape): actor_id must be the agent's own auth.uid(). The
-- executive_searches UPDATE has no state pin — the intake fields'
-- survival under the context merge is the invariants' pin (the 074
-- projects S+U precedent for column discipline). NO INSERT on
-- either artifact table (allocation is the human's act), NO DELETE
-- anywhere. Three event types join the CHECK (rebuilt from the LIVE
-- pg_constraint list, 59 values) and the allowlist grows to
-- TWENTY-THREE.

-- The search row: the context blob's landing place, and every
-- judgment's grounding read.
DROP POLICY IF EXISTS executive_searches_agent_select ON public.executive_searches;
CREATE POLICY executive_searches_agent_select ON public.executive_searches
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_agent())
    AND organization_id = (SELECT public.current_user_org_id())
  );

DROP POLICY IF EXISTS executive_searches_agent_update ON public.executive_searches;
CREATE POLICY executive_searches_agent_update ON public.executive_searches
  FOR UPDATE TO authenticated
  USING (
    (SELECT public.is_agent())
    AND organization_id = (SELECT public.current_user_org_id())
  )
  WITH CHECK (
    (SELECT public.is_agent())
    AND organization_id = (SELECT public.current_user_org_id())
  );

-- The success profile: draft-only, both faces.
DROP POLICY IF EXISTS role_success_profiles_agent_select ON public.role_success_profiles;
CREATE POLICY role_success_profiles_agent_select ON public.role_success_profiles
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_agent())
    AND organization_id = (SELECT public.current_user_org_id())
  );

DROP POLICY IF EXISTS role_success_profiles_agent_update ON public.role_success_profiles;
CREATE POLICY role_success_profiles_agent_update ON public.role_success_profiles
  FOR UPDATE TO authenticated
  USING (
    (SELECT public.is_agent())
    AND organization_id = (SELECT public.current_user_org_id())
    AND status = 'draft'
  )
  WITH CHECK (
    (SELECT public.is_agent())
    AND organization_id = (SELECT public.current_user_org_id())
    AND status = 'draft'
  );

-- The interview plan: draft-only, both faces.
DROP POLICY IF EXISTS executive_interview_plans_agent_select ON public.executive_interview_plans;
CREATE POLICY executive_interview_plans_agent_select ON public.executive_interview_plans
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_agent())
    AND organization_id = (SELECT public.current_user_org_id())
  );

DROP POLICY IF EXISTS executive_interview_plans_agent_update ON public.executive_interview_plans;
CREATE POLICY executive_interview_plans_agent_update ON public.executive_interview_plans
  FOR UPDATE TO authenticated
  USING (
    (SELECT public.is_agent())
    AND organization_id = (SELECT public.current_user_org_id())
    AND status = 'draft'
  )
  WITH CHECK (
    (SELECT public.is_agent())
    AND organization_id = (SELECT public.current_user_org_id())
    AND status = 'draft'
  );

-- The grounding library reads. executive_competencies carries global
-- rows (organization_id NULL) plus org rows — mirror that reach.
DROP POLICY IF EXISTS executive_competencies_agent_select ON public.executive_competencies;
CREATE POLICY executive_competencies_agent_select ON public.executive_competencies
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_agent())
    AND (organization_id IS NULL
         OR organization_id = (SELECT public.current_user_org_id()))
  );

DROP POLICY IF EXISTS executive_search_competencies_agent_select ON public.executive_search_competencies;
CREATE POLICY executive_search_competencies_agent_select ON public.executive_search_competencies
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_agent())
    AND organization_id = (SELECT public.current_user_org_id())
  );

-- The executive ledger: INSERT only, blind, and the agent signs its
-- OWN name — actor_id pinned to auth.uid() (the 087 impersonation
-- precedent). The human request/edit/approve events keep the role
-- policy.
DROP POLICY IF EXISTS executive_audit_events_agent_insert ON public.executive_audit_events;
CREATE POLICY executive_audit_events_agent_insert ON public.executive_audit_events
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.is_agent())
    AND organization_id = (SELECT public.current_user_org_id())
    AND actor_id = (SELECT auth.uid())
  );

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
    -- 095: the Executive Intelligence Agent's three acts.
    'success_profile_generated', 'interview_plan_generated',
    'executive_context_researched'
  ));

CREATE OR REPLACE FUNCTION public.record_agent_event(
  p_event_type   text,
  p_project_id   uuid DEFAULT NULL,
  p_candidate_id uuid DEFAULT NULL,
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
  IF p_event_type NOT IN ('feedback_interpreted', 'candidates_ranked',
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
                          'executive_context_researched') THEN
    RAISE EXCEPTION 'record_agent_event: % is not an agent-recordable event', p_event_type;
  END IF;

  -- is_agent() is coalesced at the source — read negated here, the
  -- invariant-11 shape.
  IF NOT public.is_agent() THEN
    RAISE EXCEPTION 'record_agent_event: only an active agent principal may record agent events'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_org IS NULL THEN
    RETURN;   -- unreachable for a lawful agent row (the XOR requires an org)
  END IF;

  PERFORM public.write_activity_event(
    p_organization_id => v_org,
    p_event_type      => p_event_type,
    p_visibility      => 'org',
    p_project_id      => p_project_id,
    p_candidate_id    => p_candidate_id,
    p_detail          => coalesce(p_detail, '{}'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_agent_event(text, uuid, uuid, jsonb)
  FROM public, anon;
GRANT EXECUTE ON FUNCTION public.record_agent_event(text, uuid, uuid, jsonb)
  TO authenticated;
