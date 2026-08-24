-- 094 — the Copilot Agent's vocabulary (the copilot conversion;
-- D3/D4 of NEXT-copilot-agent.md, D1–D8 confirmed 2026-08-24).
--
-- The FIFTH zero-new-grant conversion: every read the copilot's
-- snapshot makes is already in the pool — projects S (074),
-- candidates S, candidate_scores S, feedback S (074), skills S
-- (074), and shortlists S (093, which completed the coverage). This
-- migration is vocabulary only: `copilot_answered` joins the CHECK
-- (rebuilt from the LIVE pg_constraint list, 58 values) and the
-- record_agent_event allowlist grows to TWENTY. One event per
-- ANSWERED turn, counts only — never the question, never the answer.

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
    'shortlist_report_generated',
    -- 094: the Copilot Agent's one act, under its own name.
    'copilot_answered'
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
                          'shortlist_report_generated', 'copilot_answered') THEN
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
