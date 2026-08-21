-- The twelfth agent principal: the Boolean Search Agent's grants and
-- trail vocabulary — the sourcing-side opener, and the first
-- NEW-GRANT slice since 082.
--
-- Agents-as-principals slice twelve (plan in docs/handoffs/
-- NEXT-agent-boolean.md, D1–D8 confirmed by the founder 2026-08-21).
-- Per D2 three policies are minted, all org-scoped, all
-- is_agent()-gated:
--
--   * `job_specs_agent_select` — the canonical brief is READ-ONLY to
--     the agent: the final spec is the judgment's primary input.
--   * `boolean_queries_agent_select` — the current draft IS model
--     input on the regen path (unlike the digest's blind insert),
--     and the next version number comes from MAX(version).
--   * `boolean_queries_agent_insert` — the versioned append, WITH
--     CHECK pinning organization_id to the agent's own org (the
--     tenant pin — this slice's control run drops exactly that
--     conjunct and the harness must catch the cross-tenant landing).
--   * NO UPDATE, NO DELETE — the version history is immutable to the
--     agent; the recruiter's edit (saveQueryEdit) and restore acts
--     keep their existing human policies untouched. boolean_queries
--     has no created_by column; the trail event is the attribution.
--   * `sourcing_queries_generated` joins the vocabulary — detail
--     carries the trigger, slot enum, counts, and a
--     has_recruiter_feedback boolean; free text never rides the
--     trail. The allowlist at thirteen.

-- ---------------------------------------------------------------------------
-- 1. The grants (D2) — and nothing else
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS job_specs_agent_select ON public.job_specs;
CREATE POLICY job_specs_agent_select ON public.job_specs
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_agent())
    AND organization_id = (SELECT public.current_user_org_id())
  );

DROP POLICY IF EXISTS boolean_queries_agent_select ON public.boolean_queries;
CREATE POLICY boolean_queries_agent_select ON public.boolean_queries
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_agent())
    AND organization_id = (SELECT public.current_user_org_id())
  );

DROP POLICY IF EXISTS boolean_queries_agent_insert ON public.boolean_queries;
CREATE POLICY boolean_queries_agent_insert ON public.boolean_queries
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.is_agent())
    AND organization_id = (SELECT public.current_user_org_id())
  );

-- ---------------------------------------------------------------------------
-- 2. The vocabulary
-- ---------------------------------------------------------------------------

-- The live constraint's list (read from pg_constraint this session,
-- identical to 084's), plus the one new value — §5h.
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
    -- 085: the Boolean Search Agent's act, under its own name.
    'sourcing_queries_generated'
  ));

-- ---------------------------------------------------------------------------
-- 3. The agent door admits the twelfth principal's act
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
                          'sourcing_queries_generated') THEN
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
