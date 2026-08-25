-- 100 — the Engage arc, slice four: the Candidate Engagement Agent
-- (#22 — the TWENTY-THIRD principal), stage two of the confirmed
-- 099–100 pair (D4/D8b of NEXT-comms-engagement.md, D1–D8 confirmed
-- 2026-08-25; spec §9/§11).
--
-- One judgment: manage the conversation within policy — at the
-- shipped autonomy ceiling that means MAINTAIN the engagement lane
-- and DRAFT the next move for the human. The service (099) already
-- refuses every agent actor at send time; nothing in this migration
-- lets #22 send anything.
--
--   * `engagement_states` — one row per candidate+project LANE
--     (UNIQUE), born by the agent, maintained by the agent, decided
--     by humans. `draft` jsonb is the proposed follow-up message
--     (D8b — a named deviation from the spec's column list): the
--     human approves it and it leaves through sendCandidateMessage
--     under the HUMAN's name, or it dies unsent.
--   * THE ESCALATED PIN, both faces: the agent's UPDATE cannot see
--     an escalated row (USING — it can raise an escalation, never
--     touch or resolve one; resolution is the human's act), and its
--     WITH CHECK repeats the raise-must-carry-its-reason rule the
--     table CHECK enforces for everyone — the policy alone tells the
--     whole story. The escalation-coherence CHECK is bidirectional:
--     a reason cannot outlive its escalation, one truth, not two.
--   * NO human INSERT (a lane exists because the agent judged the
--     thread), NO DELETE for anyone (the conversation record
--     survives — the 098 family).
--
-- Vocabulary: `engagement_updated` (counts only). CHECK rebuilt from
-- the LIVE pg_constraint list, 68 → 69; the agent allowlist grows to
-- TWENTY-EIGHT.

-- ---------------------------------------------------------------------------
-- 1. engagement_states
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.engagement_states (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id        uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  candidate_id      uuid NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  state             text NOT NULL DEFAULT 'awaiting_reply'
                      CHECK (state IN
                        ('awaiting_reply', 'replied', 'responding',
                         'timing_follow_up', 'declined', 'interested',
                         'escalated', 'closed')),
  escalation_reason text,
  next_follow_up_at date,
  -- The proposed follow-up (D8b): { subject, body } — recruiter-block
  -- text only; the Art. 14 notice is composed at send time by the
  -- service, never the agent's to write. NULL = nothing proposed.
  draft             jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  -- An escalation without a reason is not a record; a reason without
  -- an escalation is a stale claim. One truth, both directions.
  CONSTRAINT engagement_states_escalation_recorded CHECK (
    (state = 'escalated') = (escalation_reason IS NOT NULL)
  ),
  CONSTRAINT engagement_states_lane_unique UNIQUE (candidate_id, project_id)
);

CREATE INDEX IF NOT EXISTS engagement_states_org_idx
  ON public.engagement_states (organization_id);
CREATE INDEX IF NOT EXISTS engagement_states_project_idx
  ON public.engagement_states (project_id);
CREATE INDEX IF NOT EXISTS engagement_states_follow_up_idx
  ON public.engagement_states (organization_id, next_follow_up_at)
  WHERE next_follow_up_at IS NOT NULL;

ALTER TABLE public.engagement_states ENABLE ROW LEVEL SECURITY;

CREATE POLICY engagement_states_role_select ON public.engagement_states
  FOR SELECT TO authenticated
  USING (
    organization_id = (SELECT public.current_user_org_id())
    AND (SELECT public.can_read_org())
  );

-- The human's door: resolve an escalation, close a lane, clear a
-- draft. Candidate-editorial, like the relationship record.
CREATE POLICY engagement_states_role_update ON public.engagement_states
  FOR UPDATE TO authenticated
  USING (
    organization_id = (SELECT public.current_user_org_id())
    AND (SELECT public.can_write_candidates())
  )
  WITH CHECK (
    organization_id = (SELECT public.current_user_org_id())
    AND (SELECT public.can_write_candidates())
  );

CREATE POLICY engagement_states_agent_select ON public.engagement_states
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_agent())
    AND organization_id = (SELECT public.current_user_org_id())
  );

-- The lane is born by the agent — its first judgment of the thread.
CREATE POLICY engagement_states_agent_insert ON public.engagement_states
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.is_agent())
    AND organization_id = (SELECT public.current_user_org_id())
  );

-- THE ESCALATED PIN, both faces. USING: an escalated row is not the
-- agent's to touch — it raised the alarm, and only a human answers
-- it (resolution included). WITH CHECK: a raise must carry its
-- reason — stated here as policy even though the table CHECK binds
-- everyone, so dropping either leaves the other standing.
CREATE POLICY engagement_states_agent_update ON public.engagement_states
  FOR UPDATE TO authenticated
  USING (
    (SELECT public.is_agent())
    AND organization_id = (SELECT public.current_user_org_id())
    AND state <> 'escalated'
  )
  WITH CHECK (
    (SELECT public.is_agent())
    AND organization_id = (SELECT public.current_user_org_id())
    AND (state <> 'escalated' OR escalation_reason IS NOT NULL)
  );

-- NO human INSERT (a lane exists because the agent judged a thread),
-- NO DELETE policies for anyone (the record survives).

-- ---------------------------------------------------------------------------
-- 2. Vocabulary: engagement_updated. CHECK rebuilt from the LIVE
--    pg_constraint list (68 values), allowlist to TWENTY-EIGHT.
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
    -- 100: the Candidate Engagement Agent's one act.
    'engagement_updated'
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
                          'executive_context_researched',
                          'candidate_search_answered', 'sourcing_search_executed',
                          'outreach_strategy_drafted',
                          'relationship_updated', 'engagement_updated') THEN
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
