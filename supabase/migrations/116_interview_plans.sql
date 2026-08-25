-- 116 — INTERVIEW PLANS, MAINSTREAM (Interviewer programme slice one,
-- gate confirmed §125, opened on the checklist's close §142)
--
-- The 037 pattern COPIED, never shared: executive_interview_plans is
-- confirmed machinery and stays untouched (gate D2, option b). This
-- table serves every mainstream mandate, keyed (project_id,
-- candidate_id); the sources are the mandate's own — job spec
-- (provenance column), projects.calibration_model.dimension_weights
-- (the five-dimension analogue of EI's operational competency
-- weights), and the candidate profile.
--
-- Differences from 037, each deliberate:
--   * The allocation lock is the CANDIDATE row itself — mainstream
--     candidates link to a project by candidates.project_id, there is
--     no separate linkage table to lock.
--   * The transition flag is mandate.allow_project_plan_transition —
--     dedicated, so mainstream and EI approvals can never interfere.
--   * The RPC names carry _project_ so the EI pair keeps its names.
--
-- The Interviewer (twenty-fifth principal, minted by operator hand —
-- no migration inserts agent rows) writes ONLY its own drafts: the
-- agent pair below is double-pinned status='draft' on both faces,
-- exactly 111's executive pair. Reads it needs (projects, candidates,
-- candidate_scores, job_specs, skills) already exist as is_agent()
-- policies in 111 — no new grants, and the agent event vocabulary is
-- unchanged at TWENTY-NINE: the Interviewer records
-- interview_plan_generated with detail.agent_kind='interviewer',
-- distinguishable from EI's in the same trail.

-- ---------------------------------------------------------------------------
-- 1. Table
-- ---------------------------------------------------------------------------

CREATE TABLE public.interview_plans (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id       uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  candidate_id     uuid NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  organization_id  uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  -- Which job spec version the plan was generated from (provenance;
  -- nullable — a mandate can be planned before its spec is final).
  source_spec_id   uuid REFERENCES public.job_specs(id) ON DELETE SET NULL,
  version          integer NOT NULL,
  content_json     jsonb NOT NULL DEFAULT '{}'::jsonb,
  status           text NOT NULL DEFAULT 'draft'
                     CHECK (status IN ('draft', 'approved', 'archived')),
  prompt_version   text,
  model_version    text,
  is_generating    boolean NOT NULL DEFAULT false,
  generation_error text,
  created_by       uuid REFERENCES public.users(id),
  approved_by      uuid REFERENCES public.users(id),
  approved_at      timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX unique_project_plan_version_per_candidate
  ON public.interview_plans (project_id, candidate_id, version);
CREATE UNIQUE INDEX unique_generating_project_plan_per_candidate
  ON public.interview_plans (project_id, candidate_id) WHERE is_generating;
CREATE UNIQUE INDEX unique_approved_project_plan_per_candidate
  ON public.interview_plans (project_id, candidate_id) WHERE status = 'approved';
CREATE INDEX interview_plans_project_candidate_version_idx
  ON public.interview_plans (project_id, candidate_id, version DESC);
CREATE INDEX interview_plans_mainstream_org_idx
  ON public.interview_plans (organization_id);
CREATE INDEX interview_plans_mainstream_candidate_idx
  ON public.interview_plans (candidate_id);
CREATE INDEX interview_plans_source_spec_idx
  ON public.interview_plans (source_spec_id);
CREATE INDEX interview_plans_mainstream_created_by_idx
  ON public.interview_plans (created_by);
CREATE INDEX interview_plans_mainstream_approved_by_idx
  ON public.interview_plans (approved_by);

ALTER TABLE public.interview_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY interview_plans_org_only ON public.interview_plans
  FOR ALL TO authenticated
  USING (
    organization_id IS NOT NULL
    AND organization_id = public.current_user_org_id()
  )
  WITH CHECK (
    organization_id IS NOT NULL
    AND organization_id = public.current_user_org_id()
  );

-- The agent pair (111's executive shape). SELECT is required or the
-- pipeline's own .eq() filters and read-backs see nothing and it
-- inserts blind (the standing RETURNING/WHERE-reads-via-SELECT trap);
-- UPDATE is double-pinned to drafts on both faces so an approved plan
-- is out of the agent's reach even mid-statement.
CREATE POLICY interview_plans_agent_select ON public.interview_plans
  FOR SELECT TO authenticated
  USING ((SELECT public.is_agent()));

CREATE POLICY interview_plans_agent_update ON public.interview_plans
  FOR UPDATE TO authenticated
  USING ((SELECT public.is_agent()) AND status = 'draft')
  WITH CHECK ((SELECT public.is_agent()) AND status = 'draft');

-- ---------------------------------------------------------------------------
-- 2. Immutability guard — 037's shape, dedicated flag.
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.guard_interview_plans()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_transition_allowed boolean :=
    COALESCE(current_setting('mandate.allow_project_plan_transition', true), '') = 'on';
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'draft' AND NOT v_transition_allowed THEN
      RAISE EXCEPTION 'Interview plans are created as drafts. Use approve_project_interview_plan() to approve.'
        USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status IN ('approved', 'archived') AND NOT v_transition_allowed THEN
    RAISE EXCEPTION 'Interview plan % is % and immutable. Create a new version instead.', OLD.id, OLD.status
      USING ERRCODE = 'P0001';
  END IF;

  IF NEW.status = 'approved'
     AND OLD.status IS DISTINCT FROM 'approved'
     AND NOT v_transition_allowed THEN
    RAISE EXCEPTION 'Use approve_project_interview_plan() to approve an interview plan.'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER interview_plans_guard
  BEFORE INSERT OR UPDATE ON public.interview_plans
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_interview_plans();

-- ---------------------------------------------------------------------------
-- 3. RPC: atomic version allocation + insert, idempotent for generation.
--    The lock is the candidate row — held FOR UPDATE it serializes
--    concurrent generation for the (project, candidate) pair, and the
--    project_id equality in the same SELECT enforces the linkage.
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.allocate_and_insert_project_interview_plan(
  p_project_id     uuid,
  p_candidate_id   uuid,
  p_organization_id uuid,
  p_source_spec_id uuid,
  p_content_json   jsonb,
  p_is_generating  boolean,
  p_created_by     uuid,
  p_prompt_version text,
  p_model_version  text
)
RETURNS TABLE (id uuid, version int, was_existing boolean)
LANGUAGE plpgsql
AS $$
DECLARE
  v_locked_candidate uuid;
  v_existing_id      uuid;
  v_existing_ver     int;
  v_next_version     int;
  v_inserted_id      uuid;
BEGIN
  SELECT c.id
    INTO v_locked_candidate
    FROM public.candidates AS c
   WHERE c.id = p_candidate_id
     AND c.project_id = p_project_id
   FOR UPDATE;

  IF v_locked_candidate IS NULL THEN
    RAISE EXCEPTION 'Candidate % does not belong to project % (or is not accessible).', p_candidate_id, p_project_id
      USING ERRCODE = 'P0002';
  END IF;

  IF p_is_generating THEN
    SELECT ip.id, ip.version
      INTO v_existing_id, v_existing_ver
      FROM public.interview_plans AS ip
     WHERE ip.project_id = p_project_id
       AND ip.candidate_id = p_candidate_id
       AND ip.is_generating = true
     ORDER BY ip.version DESC
     LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
      RETURN QUERY SELECT v_existing_id, v_existing_ver, true::boolean;
      RETURN;
    END IF;
  END IF;

  SELECT COALESCE(MAX(ip.version), 0) + 1
    INTO v_next_version
    FROM public.interview_plans AS ip
   WHERE ip.project_id = p_project_id
     AND ip.candidate_id = p_candidate_id;

  INSERT INTO public.interview_plans (
    project_id, candidate_id, organization_id, source_spec_id, version,
    content_json, status, is_generating, created_by, prompt_version, model_version
  )
  VALUES (
    p_project_id, p_candidate_id, p_organization_id, p_source_spec_id, v_next_version,
    p_content_json, 'draft', p_is_generating, p_created_by, p_prompt_version, p_model_version
  )
  RETURNING interview_plans.id INTO v_inserted_id;

  RETURN QUERY SELECT v_inserted_id, v_next_version, false::boolean;
END;
$$;

REVOKE ALL ON FUNCTION public.allocate_and_insert_project_interview_plan(
  uuid, uuid, uuid, uuid, jsonb, boolean, uuid, text, text
) FROM public, anon;

GRANT EXECUTE ON FUNCTION public.allocate_and_insert_project_interview_plan(
  uuid, uuid, uuid, uuid, jsonb, boolean, uuid, text, text
) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. RPC: approve a draft plan, archive the previously approved one.
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.approve_project_interview_plan(
  p_plan_id      uuid,
  p_project_id   uuid,
  p_candidate_id uuid
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_actor     uuid := auth.uid();
  v_target_id uuid;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required to approve an interview plan.'
      USING ERRCODE = 'P0001';
  END IF;

  PERFORM set_config('mandate.allow_project_plan_transition', 'on', true);

  SELECT ip.id
    INTO v_target_id
    FROM public.interview_plans AS ip
   WHERE ip.id = p_plan_id
     AND ip.project_id = p_project_id
     AND ip.candidate_id = p_candidate_id
     AND ip.is_generating = false
     AND ip.generation_error IS NULL
     AND ip.status IN ('draft', 'archived')
   FOR UPDATE;

  IF v_target_id IS NULL THEN
    RAISE EXCEPTION 'Interview plan % could not be approved (not found, not accessible, or not a healthy draft).', p_plan_id
      USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.interview_plans AS ip
     SET status = 'archived', updated_at = now()
   WHERE ip.project_id = p_project_id
     AND ip.candidate_id = p_candidate_id
     AND ip.status = 'approved'
     AND ip.id <> p_plan_id;

  UPDATE public.interview_plans AS ip
     SET status = 'approved',
         approved_by = v_actor,
         approved_at = now(),
         updated_at = now()
   WHERE ip.id = p_plan_id;

  PERFORM set_config('mandate.allow_project_plan_transition', '', true);
END;
$$;

REVOKE ALL ON FUNCTION public.approve_project_interview_plan(uuid, uuid, uuid)
  FROM public, anon;

GRANT EXECUTE ON FUNCTION public.approve_project_interview_plan(uuid, uuid, uuid)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. The trail. CHECK rebuilt from 107's list (80 values) + the three
--    human-side plan events = 83. interview_plan_generated is NOT new —
--    EI's agent 17 has recorded it since 037; the Interviewer shares it
--    and detail.agent_kind tells them apart. The agent allowlist in
--    record_agent_event is untouched at TWENTY-NINE.
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
    'executive_context_researched', 'candidate_search_answered',
    'sourcing_search_executed', 'outreach_strategy_drafted',
    'relationship_updated', 'network_dnc_set', 'network_dnc_cleared',
    'engagement_updated', 'prescreen_updated',
    'skill_created', 'skill_updated', 'skill_paused',
    'skill_activated', 'skill_deleted',
    'candidate_stage_changed',
    'task_assigned', 'task_completed',
    'objective_created', 'objective_closed',
    'interview_plan_generation_requested',
    'interview_plan_generation_failed',
    'interview_plan_approved'
  ));

-- The intent door widens 14 → 17. Requesting, failing and approving a
-- plan are mandate-writer acts (can_write_mandates: admin + recruiter),
-- gated per type exactly like the existing role-scoped intents.

CREATE OR REPLACE FUNCTION public.record_activity_event(
  p_event_type   text,
  p_project_id   uuid DEFAULT NULL,
  p_candidate_id uuid DEFAULT NULL,
  p_client_id    uuid DEFAULT NULL,
  p_detail       jsonb DEFAULT '{}'::jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_org uuid := (SELECT public.current_user_org_id());
BEGIN
  IF p_event_type NOT IN ('shortlist_published', 'report_exported',
                          'hm_portal_opened', 'mandate_reassigned',
                          'skill_created', 'skill_updated', 'skill_paused',
                          'skill_activated', 'skill_deleted',
                          'candidate_stage_changed',
                          'task_assigned', 'task_completed',
                          'objective_created', 'objective_closed',
                          'interview_plan_generation_requested',
                          'interview_plan_generation_failed',
                          'interview_plan_approved') THEN
    RAISE EXCEPTION 'record_activity_event: % is not an app-recordable event', p_event_type;
  END IF;

  IF p_event_type LIKE 'skill\_%'
     AND (SELECT public.is_org_admin()) IS NOT TRUE THEN
    RAISE EXCEPTION 'record_activity_event: % is an admin act', p_event_type
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_event_type = 'candidate_stage_changed'
     AND (SELECT public.can_write_candidates()) IS NOT TRUE THEN
    RAISE EXCEPTION 'record_activity_event: % is a candidate-writer act', p_event_type
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Assigning work is the desk's act; completing rides the actor
  -- stamp (the RLS pin already proved the right to complete).
  IF p_event_type = 'task_assigned'
     AND coalesce((SELECT public.can_manage_desk()), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'record_activity_event: % is a desk act', p_event_type
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- 107: setting or closing an objective is an okr-writer's act. The
  -- detail carries titles, scopes and outcomes — never amounts (R1:
  -- these rows are org-visible and the money is not).
  IF p_event_type IN ('objective_created', 'objective_closed')
     AND coalesce((SELECT public.can_write_okrs()), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'record_activity_event: % is an okr-writer act', p_event_type
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- 116: the interview-plan lifecycle is a mandate-writer's act.
  IF p_event_type IN ('interview_plan_generation_requested',
                      'interview_plan_generation_failed',
                      'interview_plan_approved')
     AND coalesce((SELECT public.can_write_mandates()), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'record_activity_event: % is a mandate-writer act', p_event_type
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_org IS NULL OR (SELECT public.can_read_org()) IS NOT TRUE THEN
    RETURN;
  END IF;
  PERFORM public.write_activity_event(
    p_organization_id => v_org,
    p_event_type      => p_event_type,
    p_visibility      => 'org',
    p_project_id      => p_project_id,
    p_candidate_id    => p_candidate_id,
    p_client_id       => p_client_id,
    p_detail          => p_detail
  );
END;
$$;

-- CREATE OR REPLACE resets grants; re-declare the door's audience.
REVOKE ALL ON FUNCTION public.record_activity_event(text, uuid, uuid, uuid, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.record_activity_event(text, uuid, uuid, uuid, jsonb) TO authenticated, service_role;
