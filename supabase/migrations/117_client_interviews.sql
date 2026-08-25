-- 117 — CLIENT INTERVIEWS (Interviewer programme, client-interview
-- slice, gate confirmed against
-- docs/superpowers/specs/2026-08-25-interviewer-client-interview-gate.md)
--
-- The 037/116 pattern copied a FOURTH time, never shared: the
-- Interviewer composes a structured question set for the CLIENT from
-- what the mandate provably lacks — the calibration's own
-- missing_information residue and the provable calibration gaps, both
-- computed SERVER-side before the agent runs (gate D2: the agent
-- phrases, it cannot invent). Keyed by the MANDATE alone: there is no
-- candidate axis — this is the mandate interviewing its own client.
--
-- Differences from 116, each deliberate:
--   * The allocation lock is the PROJECT row itself — there is no
--     candidate to lock.
--   * The transition flag is mandate.allow_client_interview_transition —
--     dedicated, so client-interview approvals can never interfere with
--     EI's (037) or the per-candidate plans' (116).
--   * Answers do NOT live here. An approved set is immutable; the
--     client's answers land as `feedback` rows (type
--     'client_interview', candidate_id NULL — the CHECK widens below)
--     and ride the EXISTING Feedback Interpreter pipeline unchanged.
--
-- The Interviewer (the twenty-fifth principal, 116) writes ONLY its own
-- drafts: the agent pair below is double-pinned status='draft' on both
-- faces. Its reads (projects incl. calibration_model, job_specs,
-- skills) already exist as 111 is_agent() policies — no new grants. Its
-- own act REUSES interview_plan_generated with
-- detail.plan_scope='client_interview' — the agent allowlist in
-- record_agent_event is untouched at TWENTY-NINE (ruled).
--
-- The anon grant roster stays at its ruled TWELVE: the one new
-- SECURITY DEFINER entry point (record_client_interview_answered) is
-- EXECUTE-revoked from everyone — its only caller is the token door's
-- route, which holds the service-role client (063's shape).

-- ---------------------------------------------------------------------------
-- 1. Table
-- ---------------------------------------------------------------------------

CREATE TABLE public.client_interviews (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id       uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  organization_id  uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
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

CREATE UNIQUE INDEX unique_client_interview_version_per_project
  ON public.client_interviews (project_id, version);
CREATE UNIQUE INDEX unique_generating_client_interview_per_project
  ON public.client_interviews (project_id) WHERE is_generating;
CREATE UNIQUE INDEX unique_approved_client_interview_per_project
  ON public.client_interviews (project_id) WHERE status = 'approved';
CREATE INDEX client_interviews_project_version_idx
  ON public.client_interviews (project_id, version DESC);
CREATE INDEX client_interviews_org_idx
  ON public.client_interviews (organization_id);
CREATE INDEX client_interviews_created_by_idx
  ON public.client_interviews (created_by);
CREATE INDEX client_interviews_approved_by_idx
  ON public.client_interviews (approved_by);

ALTER TABLE public.client_interviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY client_interviews_org_only ON public.client_interviews
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
-- UPDATE is double-pinned to drafts on both faces so an approved set
-- is out of the agent's reach even mid-statement.
CREATE POLICY client_interviews_agent_select ON public.client_interviews
  FOR SELECT TO authenticated
  USING ((SELECT public.is_agent()));

CREATE POLICY client_interviews_agent_update ON public.client_interviews
  FOR UPDATE TO authenticated
  USING ((SELECT public.is_agent()) AND status = 'draft')
  WITH CHECK ((SELECT public.is_agent()) AND status = 'draft');

-- ---------------------------------------------------------------------------
-- 2. Immutability guard — 037's shape, dedicated flag.
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.guard_client_interviews()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_transition_allowed boolean :=
    COALESCE(current_setting('mandate.allow_client_interview_transition', true), '') = 'on';
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'draft' AND NOT v_transition_allowed THEN
      RAISE EXCEPTION 'Client interviews are created as drafts. Use approve_client_interview() to approve.'
        USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status IN ('approved', 'archived') AND NOT v_transition_allowed THEN
    RAISE EXCEPTION 'Client interview % is % and immutable. Create a new version instead.', OLD.id, OLD.status
      USING ERRCODE = 'P0001';
  END IF;

  IF NEW.status = 'approved'
     AND OLD.status IS DISTINCT FROM 'approved'
     AND NOT v_transition_allowed THEN
    RAISE EXCEPTION 'Use approve_client_interview() to approve a client interview.'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER client_interviews_guard
  BEFORE INSERT OR UPDATE ON public.client_interviews
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_client_interviews();

-- ---------------------------------------------------------------------------
-- 3. RPC: atomic version allocation + insert, idempotent for generation.
--    The lock is the PROJECT row — held FOR UPDATE it serializes
--    concurrent generation for the mandate. Not SECURITY DEFINER, so the
--    caller's RLS decides whether the project is visible at all: a
--    cross-org caller finds no row and is refused.
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.allocate_and_insert_client_interview(
  p_project_id      uuid,
  p_organization_id uuid,
  p_content_json    jsonb,
  p_is_generating   boolean,
  p_created_by      uuid,
  p_prompt_version  text,
  p_model_version   text
)
RETURNS TABLE (id uuid, version int, was_existing boolean)
LANGUAGE plpgsql
AS $$
DECLARE
  v_locked_project uuid;
  v_existing_id    uuid;
  v_existing_ver   int;
  v_next_version   int;
  v_inserted_id    uuid;
BEGIN
  SELECT p.id
    INTO v_locked_project
    FROM public.projects AS p
   WHERE p.id = p_project_id
     AND p.organization_id = p_organization_id
   FOR UPDATE;

  IF v_locked_project IS NULL THEN
    RAISE EXCEPTION 'Project % is not accessible in organization %.', p_project_id, p_organization_id
      USING ERRCODE = 'P0002';
  END IF;

  IF p_is_generating THEN
    SELECT ci.id, ci.version
      INTO v_existing_id, v_existing_ver
      FROM public.client_interviews AS ci
     WHERE ci.project_id = p_project_id
       AND ci.is_generating = true
     ORDER BY ci.version DESC
     LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
      RETURN QUERY SELECT v_existing_id, v_existing_ver, true::boolean;
      RETURN;
    END IF;
  END IF;

  SELECT COALESCE(MAX(ci.version), 0) + 1
    INTO v_next_version
    FROM public.client_interviews AS ci
   WHERE ci.project_id = p_project_id;

  INSERT INTO public.client_interviews (
    project_id, organization_id, version, content_json, status,
    is_generating, created_by, prompt_version, model_version
  )
  VALUES (
    p_project_id, p_organization_id, v_next_version, p_content_json, 'draft',
    p_is_generating, p_created_by, p_prompt_version, p_model_version
  )
  RETURNING client_interviews.id INTO v_inserted_id;

  RETURN QUERY SELECT v_inserted_id, v_next_version, false::boolean;
END;
$$;

REVOKE ALL ON FUNCTION public.allocate_and_insert_client_interview(
  uuid, uuid, jsonb, boolean, uuid, text, text
) FROM public, anon;

GRANT EXECUTE ON FUNCTION public.allocate_and_insert_client_interview(
  uuid, uuid, jsonb, boolean, uuid, text, text
) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. RPC: approve a draft set, archive the previously approved one.
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.approve_client_interview(
  p_interview_id uuid,
  p_project_id   uuid
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_actor     uuid := auth.uid();
  v_target_id uuid;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required to approve a client interview.'
      USING ERRCODE = 'P0001';
  END IF;

  PERFORM set_config('mandate.allow_client_interview_transition', 'on', true);

  SELECT ci.id
    INTO v_target_id
    FROM public.client_interviews AS ci
   WHERE ci.id = p_interview_id
     AND ci.project_id = p_project_id
     AND ci.is_generating = false
     AND ci.generation_error IS NULL
     AND ci.status IN ('draft', 'archived')
   FOR UPDATE;

  IF v_target_id IS NULL THEN
    RAISE EXCEPTION 'Client interview % could not be approved (not found, not accessible, or not a healthy draft).', p_interview_id
      USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.client_interviews AS ci
     SET status = 'archived', updated_at = now()
   WHERE ci.project_id = p_project_id
     AND ci.status = 'approved'
     AND ci.id <> p_interview_id;

  UPDATE public.client_interviews AS ci
     SET status = 'approved',
         approved_by = v_actor,
         approved_at = now(),
         updated_at = now()
   WHERE ci.id = p_interview_id;

  PERFORM set_config('mandate.allow_client_interview_transition', '', true);
END;
$$;

REVOKE ALL ON FUNCTION public.approve_client_interview(uuid, uuid)
  FROM public, anon;

GRANT EXECUTE ON FUNCTION public.approve_client_interview(uuid, uuid)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. The feedback vocabulary widens 4 → 5. The client's answers are a
--    new KIND of feedback, not a new pipeline: 'client_interview' rows
--    are mandate-level (candidate_id NULL, which the table has always
--    allowed) and ride interpretFeedback → recalibration → trail
--    exactly as 'hm_portal' rows do. A distinct value so the desk can
--    say "the client answered the mandate's questions" instead of
--    disguising it as a slate review (gate D4).
-- ---------------------------------------------------------------------------

ALTER TABLE public.feedback
  DROP CONSTRAINT IF EXISTS feedback_feedback_type_check;

ALTER TABLE public.feedback
  ADD CONSTRAINT feedback_feedback_type_check
  CHECK (
    feedback_type = ANY (
      ARRAY[
        'recruiter_note',
        'hiring_manager',
        'interview_outcome',
        'hm_portal',
        'client_interview'
      ]
    )
  );

-- ---------------------------------------------------------------------------
-- 6. The trail. CHECK rebuilt from 116's list (83 values) + the three
--    human-side client-interview events + the sessionless answered
--    event = 87. The agent allowlist in record_agent_event is untouched
--    at TWENTY-NINE — the Interviewer's composing act reuses
--    interview_plan_generated with detail.plan_scope.
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
    'interview_plan_approved',
    'client_interview_generation_requested',
    'client_interview_generation_failed',
    'client_interview_approved',
    'client_interview_answered'
  ));

-- The intent door widens 17 → 20. Requesting, failing and approving a
-- client interview are mandate-writer acts (can_write_mandates: admin +
-- recruiter), gated per type exactly like 116's plan intents.
-- `client_interview_answered` is deliberately NOT admitted here: it has
-- no session to speak through the door — it enters only via the
-- SECURITY DEFINER function below.

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
                          'interview_plan_approved',
                          'client_interview_generation_requested',
                          'client_interview_generation_failed',
                          'client_interview_approved') THEN
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

  -- 116 + 117: both interview lifecycles are a mandate-writer's act.
  IF p_event_type IN ('interview_plan_generation_requested',
                      'interview_plan_generation_failed',
                      'interview_plan_approved',
                      'client_interview_generation_requested',
                      'client_interview_generation_failed',
                      'client_interview_approved')
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

-- ---------------------------------------------------------------------------
-- 7. The sessionless answered event — 063's shape. The token is the
--    credential: the function re-validates it, requires the interview
--    to be the token's project's APPROVED set, and derives org/project
--    from the rows — it trusts nothing else from the caller. detail
--    carries the issuance label because the actor columns are NULL by
--    construction and the label is the only honest answer to "who
--    answered". No debounce: unlike a page refresh, each submission is
--    a real act (the door above it is rate-limited).
--
--    EXECUTE revoked from everyone. The only caller is the token
--    door's route, which runs on the service role; service_role
--    bypasses grants, so no grant is needed and the ruled anon roster
--    stays at TWELVE.
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.record_client_interview_answered(
  p_token        uuid,
  p_interview_id uuid,
  p_answered     integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tok record;
  v_int record;
BEGIN
  SELECT id, project_id, organization_id, label
    INTO v_tok
  FROM public.hiring_manager_tokens
  WHERE token = p_token
    AND revoked_at IS NULL
    AND expires_at > now();
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  SELECT id, version
    INTO v_int
  FROM public.client_interviews
  WHERE id = p_interview_id
    AND project_id = v_tok.project_id
    AND status = 'approved';
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  PERFORM public.write_activity_event(
    p_organization_id => v_tok.organization_id,
    p_event_type      => 'client_interview_answered',
    p_visibility      => 'org',
    p_project_id      => v_tok.project_id,
    p_candidate_id    => NULL,
    p_client_id       => NULL,
    p_placement_id    => NULL,
    p_target_user_id  => NULL,
    p_detail          => jsonb_build_object(
                           'label', v_tok.label,
                           'token_id', v_tok.id,
                           'interview_id', v_int.id,
                           'version', v_int.version,
                           'answered_count', GREATEST(0, COALESCE(p_answered, 0))));
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.record_client_interview_answered(uuid, uuid, integer)
  FROM public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 8. Two new rate-limit buckets — caps as data (088). The answer door
--    is anonymous and billed (a submission triggers a paid interpreter
--    run), so it is Tier 1 and FAILS CLOSED app-side; the numbers
--    mirror the hm_submit pair.
-- ---------------------------------------------------------------------------

INSERT INTO public.rate_limit_policy (scope, per_key_limit, window_seconds, global_daily_limit) VALUES
  ('client_interview_token',  5, 3600, 300),
  ('client_interview_ip',    30, 3600, NULL)
ON CONFLICT (scope) DO UPDATE
  SET per_key_limit = EXCLUDED.per_key_limit,
      window_seconds = EXCLUDED.window_seconds,
      global_daily_limit = EXCLUDED.global_daily_limit;
