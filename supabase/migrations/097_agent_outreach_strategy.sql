-- 097 — the Engage arc opens: the Outreach Strategy Agent's tables,
-- doors and vocabulary (Engage slice one; D3/D4 of
-- NEXT-outreach-strategy.md, D1–D8 confirmed 2026-08-24; spec
-- docs/superpowers/specs/2026-08-24-mandate-scout-engagement-design.md §8).
--
-- TWO new tables and ONE new read grant — the first slice since 085
-- that is not a conversion of an existing surface:
--
--   * `outreach_strategies` — the principal's artifact. The agent may
--     INSERT a draft under its own name and UPDATE a row ONLY while
--     status = 'draft', pinned in BOTH directions (the 092 is_final
--     precedent applied to approval): USING refuses the decided row,
--     WITH CHECK refuses a row leaving 'draft'. Approve, decline and
--     supersede are the recruiter's editorial acts forever, gated by
--     can_share_clients — the SAME predicate that gates the contact
--     log, because the act that authorizes contact is pinned like the
--     contact record. approved_by is actor-pinned to the deciding
--     human (the 087 decided_by family).
--   * `org_comms_policy` — communication policy as DATA (the 088
--     caps-as-data pattern). One row per org; admins write it; agents
--     read it (#21 now for disclosure lines, #22 later per spec §11).
--     `linkedin` is excluded from allowed_channels BY CONSTRAINT —
--     the send service will never have a LinkedIn provider
--     (source-policy doctrine), so the data cannot claim otherwise.
--   * `candidate_outreach_agent_select` — the contact-history read.
--     #21 judges approach against what was already said. NO agent
--     write on candidate_outreach: sends stay human in this slice;
--     the comms-service RPC belongs to 099.
--
-- `mission_id` lands nullable and unread — the column waits for Scout
-- (deferred per D8 as confirmed). The event type joins the CHECK
-- (rebuilt from the LIVE pg_constraint list, 64 values) and the
-- record_agent_event allowlist grows to TWENTY-SIX.

-- ---------------------------------------------------------------------------
-- 1. outreach_strategies
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.outreach_strategies (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id      uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  candidate_id    uuid NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  -- Waits for Scout (spec §4). Nothing reads or writes it in 097.
  mission_id      uuid,
  -- angle, career_hook, may_disclose[], must_not_disclose[], channel,
  -- cadence, talking_points[], likely_questions[], draft_subject,
  -- draft_body. The draft_body is RECRUITER-BLOCK text only — the
  -- Art. 14 notice is composed at send time by compose.ts and is
  -- never the agent's to write.
  content         jsonb NOT NULL DEFAULT '{}'::jsonb,
  status          text NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft', 'approved', 'declined', 'superseded')),
  version         int NOT NULL DEFAULT 1 CHECK (version >= 1),
  -- The principal that drafted it (actor-pinned at INSERT).
  created_by      uuid NOT NULL REFERENCES public.users(id),
  -- The deciding human. A decision without a decider is not a record:
  -- approved/declined require both fields; a draft may carry neither.
  approved_by     uuid REFERENCES public.users(id),
  approved_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT outreach_strategies_decision_recorded CHECK (
    (status NOT IN ('approved', 'declined')
       OR (approved_by IS NOT NULL AND approved_at IS NOT NULL))
    AND
    (status <> 'draft'
       OR (approved_by IS NULL AND approved_at IS NULL))
  )
);

-- ONE live draft per candidate-lane: a redraft supersedes first (the
-- human's act — the agent cannot write 'superseded'), then inserts.
CREATE UNIQUE INDEX IF NOT EXISTS outreach_strategies_one_live_draft
  ON public.outreach_strategies (candidate_id, project_id)
  WHERE status = 'draft';

CREATE INDEX IF NOT EXISTS outreach_strategies_candidate_idx
  ON public.outreach_strategies (candidate_id, created_at DESC);
CREATE INDEX IF NOT EXISTS outreach_strategies_project_idx
  ON public.outreach_strategies (project_id);
CREATE INDEX IF NOT EXISTS outreach_strategies_org_idx
  ON public.outreach_strategies (organization_id);
CREATE INDEX IF NOT EXISTS outreach_strategies_created_by_idx
  ON public.outreach_strategies (created_by);
CREATE INDEX IF NOT EXISTS outreach_strategies_approved_by_idx
  ON public.outreach_strategies (approved_by);

ALTER TABLE public.outreach_strategies ENABLE ROW LEVEL SECURITY;

CREATE POLICY outreach_strategies_role_select ON public.outreach_strategies
  FOR SELECT TO authenticated
  USING (
    organization_id IS NOT NULL
    AND organization_id = (SELECT public.current_user_org_id())
    AND (SELECT public.can_read_org())
  );

-- The human's door: approve / edit / decline / supersede. approved_by
-- is pinned to the deciding session — no human signs another's name.
CREATE POLICY outreach_strategies_role_update ON public.outreach_strategies
  FOR UPDATE TO authenticated
  USING (
    organization_id IS NOT NULL
    AND organization_id = (SELECT public.current_user_org_id())
    AND (SELECT public.can_share_clients())
  )
  WITH CHECK (
    organization_id IS NOT NULL
    AND organization_id = (SELECT public.current_user_org_id())
    AND (SELECT public.can_share_clients())
    AND (approved_by IS NULL OR approved_by = (SELECT auth.uid()))
  );

CREATE POLICY outreach_strategies_agent_select ON public.outreach_strategies
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_agent())
    AND organization_id = (SELECT public.current_user_org_id())
  );

-- The agent drafts under its own name, and ONLY drafts: status is
-- pinned at birth, created_by is pinned to the signing session.
CREATE POLICY outreach_strategies_agent_insert ON public.outreach_strategies
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.is_agent())
    AND organization_id = (SELECT public.current_user_org_id())
    AND status = 'draft'
    AND created_by = (SELECT auth.uid())
  );

-- Double-pinned BOTH faces (the 092 family): USING refuses the
-- decided row, WITH CHECK refuses a row leaving 'draft'. The agent
-- can revise its draft; it can never decide, supersede, or touch a
-- decision.
CREATE POLICY outreach_strategies_agent_update ON public.outreach_strategies
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
    AND created_by = (SELECT auth.uid())
  );

-- ---------------------------------------------------------------------------
-- 2. org_comms_policy — policy as data, one row per org.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.org_comms_policy (
  organization_id            uuid PRIMARY KEY
                               REFERENCES public.organizations(id) ON DELETE CASCADE,
  -- SEND channels only (the contact LOG keeps its full vocabulary).
  -- 'linkedin' is absent by constraint: the send service has no
  -- LinkedIn provider by design and never will.
  allowed_channels           text[] NOT NULL DEFAULT '{email}'
                               CHECK (allowed_channels <@ ARRAY['email','phone','other']::text[]),
  -- Caps are named now, enforced by the comms service in 099 (the
  -- 088 pattern: caps as data, refusals honest).
  daily_send_cap             int CHECK (daily_send_cap > 0),
  per_candidate_weekly_cap   int CHECK (per_candidate_weekly_cap > 0),
  client_identity_disclosure text NOT NULL DEFAULT 'after_approval'
                               CHECK (client_identity_disclosure IN
                                 ('never', 'after_approval', 'after_nda', 'open')),
  compensation_discussion    text NOT NULL DEFAULT 'human_only'
                               CHECK (compensation_discussion IN
                                 ('human_only', 'range_allowed')),
  -- Named by the spec, read by NOTHING in this slice: no auto-approval
  -- of strategies exists at any level by default (spec §16).
  auto_approve_strategies    boolean NOT NULL DEFAULT false,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.org_comms_policy ENABLE ROW LEVEL SECURITY;

CREATE POLICY org_comms_policy_role_select ON public.org_comms_policy
  FOR SELECT TO authenticated
  USING (
    organization_id = (SELECT public.current_user_org_id())
    AND (SELECT public.can_read_org())
  );

CREATE POLICY org_comms_policy_admin_insert ON public.org_comms_policy
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = (SELECT public.current_user_org_id())
    AND (SELECT public.is_org_admin())
  );

CREATE POLICY org_comms_policy_admin_update ON public.org_comms_policy
  FOR UPDATE TO authenticated
  USING (
    organization_id = (SELECT public.current_user_org_id())
    AND (SELECT public.is_org_admin())
  )
  WITH CHECK (
    organization_id = (SELECT public.current_user_org_id())
    AND (SELECT public.is_org_admin())
  );

CREATE POLICY org_comms_policy_agent_select ON public.org_comms_policy
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_agent())
    AND organization_id = (SELECT public.current_user_org_id())
  );

-- Every existing org gets the defaults; an absent row reads as the
-- defaults in the app (deterministic fallback, no silent write).
INSERT INTO public.org_comms_policy (organization_id)
SELECT id FROM public.organizations
ON CONFLICT (organization_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3. The contact-history read — #21 judges approach against what was
--    already said. Read-only: sends stay human until 099.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS candidate_outreach_agent_select ON public.candidate_outreach;
CREATE POLICY candidate_outreach_agent_select ON public.candidate_outreach
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_agent())
    AND organization_id = (SELECT public.current_user_org_id())
  );

-- ---------------------------------------------------------------------------
-- 4. Vocabulary: outreach_strategy_drafted. CHECK rebuilt from the
--    LIVE pg_constraint list (64 values), allowlist to TWENTY-SIX.
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
    -- 097: the Outreach Strategy Agent's one act, under its own name.
    'outreach_strategy_drafted'
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
                          'outreach_strategy_drafted') THEN
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
