-- 101 — the Engage arc, slice five: the Pre-Screen Agent (#23 — the
-- TWENTY-FOURTH principal). D1–D8 of NEXT-prescreen-agent.md,
-- confirmed 2026-08-25; spec §9/§11, the §12 counsel boundary drawn
-- in scope (D2): at the shipped ceiling the agent COMPUTES the
-- evidence gap, DRAFTS the invitation and questions, and STRUCTURES
-- what came back — humans conduct the conversation and send every
-- message (through the 099 service, the #22 D8b loop).
--
--   * `prescreens` — one live row per candidate+project lane
--     (partial UNIQUE where status <> 'abandoned'). Two named
--     deviations from the spec's column list (the D8b family):
--     `question_set` jsonb — the proposed invitation the human
--     sends or it dies unsent; `escalation_reason` with 100's
--     BIDIRECTIONAL coherence CHECK. Status/stamp coherence:
--     complete carries completed_at, and only complete does.
--   * THE NO-VERDICT DOCTRINE holds by construction: no verdict,
--     score, pass or percentage column exists; the clamp strips
--     score-shaped keys before persistence; the harness probes the
--     landed jsonb (spec §9 — "there is NO verdict field").
--     Recruiter-ready is DERIVED in code, never stored.
--   * RLS per the confirmed D5: org S; human U
--     (can_write_candidates — mark invited on send, abandon,
--     resolve escalations); #23 INSERT pinned status='proposed';
--     #23 UPDATE double-pinned BOTH faces — USING admits only
--     proposed/invited/in_progress (complete is TERMINAL to the
--     agent after completed_at; abandoned and escalated rows are
--     the human's), WITH CHECK refuses 'abandoned' (abandonment is
--     a human act). NO DELETE for anyone.
--
-- Vocabulary: `prescreen_updated` (counts only). CHECK rebuilt from
-- the LIVE pg_constraint list, 69 → 70; allowlist TWENTY-NINE.

-- ---------------------------------------------------------------------------
-- 1. prescreens
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.prescreens (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id            uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  candidate_id          uuid NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  -- Waits for Scout (spec §4). Nothing reads or writes it in 101.
  mission_id            uuid,
  status                text NOT NULL DEFAULT 'proposed'
                          CHECK (status IN
                            ('proposed', 'invited', 'in_progress',
                             'complete', 'abandoned', 'escalated')),
  -- The proposed invitation + one question per unknown (D3a): the
  -- human approves and sends it through the comms service, or it
  -- dies unsent. Recruiter-block text only — the Art. 14 notice and
  -- the AI-disclosure block are composed at send time, system-side.
  question_set          jsonb,
  -- The turns, verbatim — copied deterministically from the thread
  -- at capture time, never the model's to write from memory.
  transcript            jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Per dimension: {value, status: validated|partial|unknown, source}.
  professional_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- interest, motivation, timing, location, comp context, notice,
  -- constraints, questions[]. NO verdict field exists on this table.
  interest_profile      jsonb NOT NULL DEFAULT '{}'::jsonb,
  escalation_reason     text,
  completed_at          timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  -- An escalation without a reason is not a record; a reason cannot
  -- outlive its escalation (the 100 family, both directions).
  CONSTRAINT prescreens_escalation_recorded CHECK (
    (status = 'escalated') = (escalation_reason IS NOT NULL)
  ),
  -- Completion is a stamped fact, and only completion carries it.
  CONSTRAINT prescreens_completion_stamped CHECK (
    (status = 'complete') = (completed_at IS NOT NULL)
  )
);

-- ONE live pre-screen per lane; an abandoned one may be re-proposed.
CREATE UNIQUE INDEX IF NOT EXISTS prescreens_one_live_lane
  ON public.prescreens (candidate_id, project_id)
  WHERE status <> 'abandoned';

CREATE INDEX IF NOT EXISTS prescreens_org_idx
  ON public.prescreens (organization_id);
CREATE INDEX IF NOT EXISTS prescreens_project_idx
  ON public.prescreens (project_id);
CREATE INDEX IF NOT EXISTS prescreens_candidate_idx
  ON public.prescreens (candidate_id, created_at DESC);

ALTER TABLE public.prescreens ENABLE ROW LEVEL SECURITY;

CREATE POLICY prescreens_role_select ON public.prescreens
  FOR SELECT TO authenticated
  USING (
    organization_id = (SELECT public.current_user_org_id())
    AND (SELECT public.can_read_org())
  );

-- The human's door: mark invited on the send, abandon, resolve an
-- escalation. Candidate-editorial, the engagement-lane predicate.
CREATE POLICY prescreens_role_update ON public.prescreens
  FOR UPDATE TO authenticated
  USING (
    organization_id = (SELECT public.current_user_org_id())
    AND (SELECT public.can_write_candidates())
  )
  WITH CHECK (
    organization_id = (SELECT public.current_user_org_id())
    AND (SELECT public.can_write_candidates())
  );

CREATE POLICY prescreens_agent_select ON public.prescreens
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_agent())
    AND organization_id = (SELECT public.current_user_org_id())
  );

-- The pre-screen is born a PROPOSAL — the agent cannot birth one
-- already invited, in progress, or decided.
CREATE POLICY prescreens_agent_insert ON public.prescreens
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.is_agent())
    AND organization_id = (SELECT public.current_user_org_id())
    AND status = 'proposed'
  );

-- Double-pinned BOTH faces (the confirmed D5): USING admits only the
-- working states — a COMPLETE pre-screen is terminal to the agent
-- (the record of what the candidate said never silently changes),
-- and abandoned/escalated rows are the human's. WITH CHECK refuses
-- 'abandoned' — walking away from a conversation is a human act.
CREATE POLICY prescreens_agent_update ON public.prescreens
  FOR UPDATE TO authenticated
  USING (
    (SELECT public.is_agent())
    AND organization_id = (SELECT public.current_user_org_id())
    AND status IN ('proposed', 'invited', 'in_progress')
  )
  WITH CHECK (
    (SELECT public.is_agent())
    AND organization_id = (SELECT public.current_user_org_id())
    AND status <> 'abandoned'
  );

-- NO DELETE policies for anyone: what a candidate told a search firm
-- is a record (the 098/100 family).

-- ---------------------------------------------------------------------------
-- 2. Vocabulary: prescreen_updated. CHECK rebuilt from the LIVE
--    pg_constraint list (69 values), allowlist to TWENTY-NINE.
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
    -- 101: the Pre-Screen Agent's one act.
    'prescreen_updated'
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
                          'relationship_updated', 'engagement_updated',
                          'prescreen_updated') THEN
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
