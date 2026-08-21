-- The fourteenth agent principal: the Search Health Agent's one grant
-- and trail vocabulary — the LAST of the fourteen-agent map. One
-- principal, two judgments: health suggestions and the weekly report
-- (the company-intelligence precedent).
--
-- Agents-as-principals slice fourteen (plan in docs/handoffs/
-- NEXT-agent-metrics.md, D1–D8 confirmed by the founder 2026-08-21).
-- Per D2 exactly ONE policy is minted:
--
--   * `project_reports_agent_insert` — INSERT only, is_agent() + org +
--     **generated_by PINNED to auth.uid()**: the report can NEVER wear
--     a human's name (the digest's created_by pin, applied to the
--     client-facing artifact table). NO SELECT — the seam mints the
--     row's id itself and inserts BLIND (082's RETURNING doctrine
--     applied constructively); NO UPDATE, NO DELETE — landed reports
--     are the recruiter's records. This slice's control run drops
--     exactly the generated_by conjunct and the harness must catch an
--     agent's report landing under a RECRUITER's name — the inverse of
--     086's null-actor drift: attribution fraud by impersonation
--     rather than anonymity.
--   * The health judgment adds ZERO grants: every read is in the pool
--     (074's projects/candidates/candidate_scores/feedback S, 085's
--     boolean_queries S, 074's skills S) and the merge-write rides
--     074's projects UPDATE. dismissHealthSuggestionAction — the
--     recruiter's overlay act on the same blob — stays human.
--   * `health_suggested` and `weekly_report_generated` join the
--     vocabulary — trigger `on_demand` now, with `scheduled` RESERVED
--     for the future cron sweep (D4/D8: same principal, same kill
--     switch, no new migration when the channel exists). Detail
--     carries counts, enums, and dates — never names or free text.
--     The allowlist at sixteen.

-- ---------------------------------------------------------------------------
-- 1. The grant (D2) — and nothing else
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS project_reports_agent_insert ON public.project_reports;
CREATE POLICY project_reports_agent_insert ON public.project_reports
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.is_agent())
    AND organization_id = (SELECT public.current_user_org_id())
    AND generated_by = (SELECT auth.uid())
  );

-- ---------------------------------------------------------------------------
-- 2. The vocabulary
-- ---------------------------------------------------------------------------

-- The live constraint's list (read from pg_constraint this session,
-- identical to 086's), plus the two new values — §5h.
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
    'intake_analyzed',
    -- 087: the Search Health Agent's two acts, under its own name.
    'health_suggested',
    'weekly_report_generated'
  ));

-- ---------------------------------------------------------------------------
-- 3. The agent door admits the fourteenth principal's acts
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
                          'sourcing_queries_generated', 'intake_analyzed',
                          'health_suggested', 'weekly_report_generated') THEN
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
