-- The third agent principal: the CV parser's one additive grant.
--
-- Agents-as-principals slice three (plan in docs/handoffs/
-- NEXT-agent-cv-parser.md, D1–D9 confirmed by the founder 2026-08-20).
-- The first slice that WIDENS the role's pool, and by exactly one
-- surface: candidates UPDATE — the parser persists what it concluded
-- about a person (cv_structured, fit_dimensions, and the identity
-- columns it overwrites), and per slice one's confirmed D1 the
-- interpreter and ranker gain the same reach in the same moment.
-- Stated in the plan rather than hidden; per-kind tiers reopen only
-- when an agent needs a grant the others must NOT hold.
--
-- Deliberately absent, per D2/D8: any storage policy (both call sites
-- hold the file bytes in memory at parse time — the seam takes bytes,
-- the agent never touches storage), any DELETE anywhere, any INSERT on
-- candidates (the placeholder row is the recruiter's act). The
-- invariants pin the delete and storage negatives by effect, and the
-- control run simulates 'agent' slipping into can_write_candidates() —
-- the write-side enumeration regression, whose delete reach is exactly
-- what an agent must never inherit by accident.

-- ---------------------------------------------------------------------------
-- 1. The grant
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS candidates_agent_update ON public.candidates;
CREATE POLICY candidates_agent_update ON public.candidates
  FOR UPDATE TO authenticated
  USING (
    (SELECT public.is_agent())
    AND organization_id = (SELECT public.current_user_org_id())
  )
  WITH CHECK (
    (SELECT public.is_agent())
    AND organization_id = (SELECT public.current_user_org_id())
  );

-- ---------------------------------------------------------------------------
-- 2. The vocabulary
-- ---------------------------------------------------------------------------

-- The live constraint's list (075's), plus the one new value — §5h.
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
    -- 076: the parser's act, under its own name.
    'candidate_parsed'
  ));

-- ---------------------------------------------------------------------------
-- 3. The agent door admits the third act
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
  IF p_event_type NOT IN ('feedback_interpreted', 'candidates_ranked', 'candidate_parsed') THEN
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
