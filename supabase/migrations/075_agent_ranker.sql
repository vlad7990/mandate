-- The second agent principal: the ranker's trail vocabulary.
--
-- Agents-as-principals slice two (plan in docs/handoffs/
-- NEXT-agent-ranker.md, D1–D8 confirmed by the founder 2026-08-20).
-- Slice one built the whole shape — the role, the XOR branch, the
-- grant pool, the guard boundary, the session seam, the /ops face —
-- and per D2 the ranker ADDS NO TABLE GRANTS: everything a scoring
-- run touches (projects SELECT, candidates SELECT, candidate_scores
-- SELECT/INSERT/UPDATE) is already named in 074's pool, whose
-- authority is identical across agent kinds by slice one's confirmed
-- D1. What this file grows is only the trail:
--
--   * `candidates_ranked` joins the event vocabulary — one event per
--     scoring run, org visibility, the trigger named in detail. The
--     trail can finally distinguish "the recruiter clicked refresh"
--     from "the ranker recomputed the leaderboard because of it".
--   * `record_agent_event` admits it — still refusing everything else,
--     still active-agent-only, still stamping org and actor from the
--     session. The allowlist is the forgery boundary:
--     agent_ranker_invariants.sql's control run simulates exactly the
--     regression of that gate going soft.

-- ---------------------------------------------------------------------------
-- 1. The vocabulary
-- ---------------------------------------------------------------------------

-- The list below is the live constraint's list (074's), plus the one
-- new value — the §5h rule, applied at authoring time.
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
    -- 075: the ranker's act, under its own name.
    'candidates_ranked'
  ));

-- ---------------------------------------------------------------------------
-- 2. The agent door admits the second act
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
  IF p_event_type NOT IN ('feedback_interpreted', 'candidates_ranked') THEN
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
