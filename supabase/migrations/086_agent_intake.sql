-- The thirteenth agent principal: the Intake Agent's trail vocabulary
-- — the fourteen-agent map's first agent, converted thirteenth, and
-- the third ZERO-NEW-GRANT slice.
--
-- Agents-as-principals slice thirteen (plan in docs/handoffs/
-- NEXT-agent-intake.md, D1–D8 confirmed by the founder 2026-08-21).
-- Per D2 there are NO new policies: the judgment's landing is one
-- projects UPDATE under 074's pool. The clients registry — the
-- resolve_client find-or-create, the client_id link, the context
-- promotion — stays entirely in the RECRUITER's after() context (the
-- parser split, inverted: the agent hands its analysis BACK for the
-- human bookkeeping it enables). The negative matrix is untouched:
--
--   * `intake_analyzed` joins the vocabulary — detail carries
--     input_chars and a company_identified boolean; the brief's TEXT
--     never rides the trail, and client resolution is deliberately
--     absent from the agent's detail (the trail must not claim the
--     recruiter's act for the agent).
--   * `record_agent_event` admits it — the allowlist at fourteen.

-- ---------------------------------------------------------------------------
-- 1. The vocabulary
-- ---------------------------------------------------------------------------

-- The live constraint's list (read from pg_constraint this session,
-- identical to 085's), plus the one new value — §5h.
ALTER TABLE public.activity_events
  DROP CONSTRAINT IF EXISTS activity_events_type_known;

ALTER TABLE public.activity_events
  ADD CONSTRAINT activity_events_type_known CHECK (event_type IN (
    'placement_recorded',
    'placement_status_changed',
    'placement_signoff_changed',
    'placement_deleted',
    'fee_recorded',
    'fee_updated',
    'fee_line_earned',
    'fee_line_cancelled',
    'fee_reversed',
    'fee_terms_created',
    'fee_terms_updated',
    'fee_terms_deleted',
    'client_contact_added',
    'client_contact_updated',
    'client_contact_removed',
    'member_role_changed',
    'member_status_changed',
    'member_founder_changed',
    'member_org_changed',
    'shortlist_published',
    'report_exported',
    'hm_portal_opened',
    'mandate_reassigned',
    'external_invited',
    'external_invitation_revoked',
    'external_invitation_resent',
    'external_joined',
    'external_role_changed',
    'external_status_changed',
    'mandate_shared',
    'mandate_unshared',
    'external_access_granted',
    'external_access_revoked',
    'candidate_portal_link_issued',
    'candidate_portal_link_revoked',
    'candidate_self_updated',
    'candidate_withdrew',
    'candidate_erasure_requested',
    'candidate_cv_submitted',
    'feedback_interpreted',
    'candidates_ranked',
    'candidate_parsed',
    'candidate_evaluated',
    'candidate_positioned',
    'candidate_researched',
    'candidate_triangulated',
    'candidate_profiled',
    'desk_digest_generated',
    'company_researched',
    'hm_researched',
    'culture_profiled',
    'sourcing_queries_generated',
    -- 086: the Intake Agent's act, under its own name.
    'intake_analyzed'
  ));

-- ---------------------------------------------------------------------------
-- 2. The agent door admits the thirteenth principal's act
-- ---------------------------------------------------------------------------

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
                          'sourcing_queries_generated', 'intake_analyzed') THEN
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
