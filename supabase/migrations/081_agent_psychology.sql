-- The eighth agent principal: the psychology agent's grant and trail
-- vocabulary — closing the candidate-intelligence cluster.
--
-- Agents-as-principals slice eight (plan in docs/handoffs/
-- NEXT-agent-psychology.md, D1–D8 confirmed by the founder
-- 2026-08-21). Per D2 this slice carries THE FIRST POOL WIDENING
-- SINCE 076, and it is deliberately the narrowest kind: a SELECT-only
-- grant on a table humans AUTHOR. The psychology pipeline reads the
-- last ten candidate_notes as behavioural context; the live notes
-- policies require can_read_org(), which excludes agents by 074's own
-- design (the 020 file's blanket policy is superseded — pg_policies
-- is ground truth). The agent may read recruiter testimony as input
-- and may never write, edit, or delete it — the invariants pin the
-- refusals, and this slice's control run regresses exactly this
-- grant (re-created FOR ALL, 020's old blanket drift).
--
--   * `candidate_notes_agent_select` — SELECT only, is_agent() + org.
--   * `candidate_profiled` joins the vocabulary — one event per
--     LANDED profile, trigger named (generate / regenerate),
--     has_recruiter_context as a BOOLEAN (the text lives visibly in
--     cv_structured.psychology_context, never in the trail).
--   * `record_agent_event` admits it — the allowlist at eight.

-- ---------------------------------------------------------------------------
-- 1. The widening: notes readable, never writable
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS candidate_notes_agent_select ON public.candidate_notes;
CREATE POLICY candidate_notes_agent_select ON public.candidate_notes
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_agent())
    AND organization_id IS NOT NULL
    AND organization_id = public.current_user_org_id()
  );

-- ---------------------------------------------------------------------------
-- 2. The vocabulary
-- ---------------------------------------------------------------------------

-- The live constraint's list (read from pg_constraint this session,
-- identical to 080's), plus the one new value — §5h.
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
    -- 081: the psychology agent's act, under its own name.
    'candidate_profiled'
  ));

-- ---------------------------------------------------------------------------
-- 3. The agent door admits the eighth act
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
                          'candidate_triangulated', 'candidate_profiled') THEN
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
