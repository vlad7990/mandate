-- 107: the OKR/KPI domain (programme slice one: Recruiter/Manager;
-- §114 gate — D1–D9 + R1–R4 confirmed 2026-08-25 against
-- docs/superpowers/specs/2026-08-25-okr-kpi-design.md).
--
-- An objective is a period-bound ambition OWNED by the person it
-- measures — an active manager or recruiter, never an admin (R4:
-- admins are support, not subjects) and never an agent (agents hold
-- no goals). Key results are its measurable commitments: financial
-- (fees-tier rows — R1: the money boundary does not move),
-- quantitative (a CHECK'd metric vocabulary computed from data the
-- org already records, D3), or qualitative (a human-attested
-- milestone, D5 — and structurally incapable of naming a candidate:
-- there is no candidate column to put one in, R2). Never deleted
-- (R3 — abandoned is the walk-away and the row is a record). All
-- trigger-read predicates are COALESCED (the 064 lesson).

-- Who may author OKRs (D2). Coalesced at the source like
-- can_manage_desk: the guard trigger and the intent door read it
-- negated, and NOT NULL is NULL.
CREATE OR REPLACE FUNCTION public.can_write_okrs()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT coalesce(public.current_user_role() IN ('admin', 'manager', 'recruiter'), false)
$$;

CREATE TABLE IF NOT EXISTS public.objectives (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  -- NULL means the objective spans the owner's whole desk or book;
  -- a real FK when it commits to one mandate (the 053/106 precedent).
  project_id      uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  -- Whose objective this is. NOT NULL on purpose — an OKR nobody owns
  -- measures nobody, which is the failure mode the programme exists
  -- to prevent.
  owner_user_id   uuid NOT NULL REFERENCES public.users(id),
  title           text NOT NULL,
  detail          text NOT NULL DEFAULT '',
  -- An objective without a period is a wish.
  period_start    date NOT NULL,
  period_end      date NOT NULL,
  status          text NOT NULL DEFAULT 'active'
                    CHECK (status IN ('draft', 'active', 'closed', 'abandoned')),
  created_by      uuid NOT NULL REFERENCES public.users(id),
  closed_at       timestamptz,
  closed_by       uuid REFERENCES public.users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT objectives_period_ordered CHECK (period_end >= period_start),
  -- Closed is stamped and signed, or it is not closed. Abandoned is
  -- unstamped on purpose — it is the walk-away, not an achievement.
  CONSTRAINT objectives_closed_is_stamped CHECK ((status = 'closed') = (closed_at IS NOT NULL)),
  CONSTRAINT objectives_closed_is_signed  CHECK ((status = 'closed') = (closed_by IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS objectives_org_owner_status_idx
  ON public.objectives (organization_id, owner_user_id, status);
CREATE INDEX IF NOT EXISTS objectives_org_project_idx
  ON public.objectives (organization_id, project_id);

-- The author and the named members belonged to this org when written (057).
CREATE TRIGGER objectives_author_in_org BEFORE INSERT OR UPDATE ON public.objectives
  FOR EACH ROW EXECUTE FUNCTION public.guard_author_in_org('created_by', 'owner_user_id', 'closed_by');

-- What RLS cannot say about columns: attribution never rewrites, only
-- the desk hands an objective to someone else, and the owner must be
-- a person the programme measures — an ACTIVE manager or recruiter.
-- The admin refusal is R4 made structural rather than habitual.
CREATE OR REPLACE FUNCTION public.guard_objective_owner_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role   text;
  v_status text;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'an objective''s author does not change';
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.owner_user_id IS DISTINCT FROM OLD.owner_user_id
     AND coalesce(public.can_manage_desk(), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'only the desk hands an objective to someone else';
  END IF;

  IF TG_OP = 'INSERT'
     AND NEW.owner_user_id IS DISTINCT FROM (SELECT auth.uid())
     AND coalesce(public.can_manage_desk(), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'only the desk sets an objective''s owner to someone else';
  END IF;

  IF TG_OP = 'INSERT' OR NEW.owner_user_id IS DISTINCT FROM OLD.owner_user_id THEN
    SELECT role, status INTO v_role, v_status
      FROM public.users WHERE id = NEW.owner_user_id;
    IF v_role IS NULL
       OR coalesce(v_status, '') <> 'active'
       OR v_role NOT IN ('manager', 'recruiter') THEN
      RAISE EXCEPTION 'an objective''s owner must be an active manager or recruiter — admins are support, not subjects';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_objective_owner_changes() FROM public, anon;

CREATE TRIGGER objectives_guard_owner BEFORE INSERT OR UPDATE ON public.objectives
  FOR EACH ROW EXECUTE FUNCTION public.guard_objective_owner_changes();

ALTER TABLE public.objectives ENABLE ROW LEVEL SECURITY;

-- Org-wide read (the 097/106 shape): a goal the desk is measured by
-- is visible work. The MONEY inside a financial key result is the
-- restricted thing, and it lives on the KR row, not here.
CREATE POLICY objectives_role_select ON public.objectives
  FOR SELECT TO authenticated
  USING (
    organization_id = (SELECT public.current_user_org_id())
    AND (SELECT public.can_read_org())
  );

-- D2: okr writers create; the creator signs their own name (087).
CREATE POLICY objectives_role_insert ON public.objectives
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = (SELECT public.current_user_org_id())
    AND coalesce((SELECT public.can_write_okrs()), false)
    AND created_by = (SELECT auth.uid())
  );

-- The desk, or the objective's own owner. WITH CHECK adds the close
-- pin: nobody signs another's close.
CREATE POLICY objectives_role_update ON public.objectives
  FOR UPDATE TO authenticated
  USING (
    organization_id = (SELECT public.current_user_org_id())
    AND (
      coalesce((SELECT public.can_manage_desk()), false)
      OR owner_user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    organization_id = (SELECT public.current_user_org_id())
    AND (
      coalesce((SELECT public.can_manage_desk()), false)
      OR owner_user_id = (SELECT auth.uid())
    )
    AND (closed_by IS NULL OR closed_by = (SELECT auth.uid()))
  );

-- R3: no DELETE policy, for anyone. Abandoned is the walk-away.

CREATE TABLE IF NOT EXISTS public.objective_key_results (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  objective_id    uuid NOT NULL REFERENCES public.objectives(id) ON DELETE CASCADE,
  kind            text NOT NULL
                    CHECK (kind IN ('financial', 'quantitative', 'qualitative')),
  label           text NOT NULL,
  -- Which computation measures this. A CHECK'd vocabulary, not free
  -- text: every slug maps to a deterministic query in
  -- src/lib/okrs/progress.ts, extensible only by migration (D3/D4).
  metric_source   text,
  target_value    numeric(14, 2),
  -- Money without a currency is a defect class (050); everything
  -- that is not money carries none.
  currency        text CHECK (currency ~ '^[A-Z]{3}$'),
  direction       text NOT NULL DEFAULT 'at_least'
                    CHECK (direction IN ('at_least', 'at_most')),
  -- The qualitative milestone's stamp and signature (D5). Quantitative
  -- and financial rows never carry one — their progress is computed,
  -- not claimed.
  attested_at     timestamptz,
  attested_by     uuid REFERENCES public.users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  -- R2, structurally: there is no candidate column in this table. A
  -- key result cannot take a person as its subject.
  CONSTRAINT okr_metric_matches_kind CHECK (
    CASE kind
      WHEN 'quantitative' THEN metric_source IN (
        'candidates_added', 'stage_moves', 'submissions', 'interviews',
        'offers', 'hires', 'placements_started', 'feedback_captured',
        'weekly_velocity')
      WHEN 'financial' THEN metric_source IN (
        'fees_earned', 'fees_billed_forecast')
      ELSE metric_source IS NULL
    END
  ),
  -- A measured kind commits to a number; a milestone commits to a fact.
  CONSTRAINT okr_target_matches_kind CHECK ((kind = 'qualitative') = (target_value IS NULL)),
  CONSTRAINT okr_currency_is_financial CHECK ((kind = 'financial') = (currency IS NOT NULL)),
  CONSTRAINT okr_attestation_is_qualitative CHECK (
    kind = 'qualitative' OR (attested_at IS NULL AND attested_by IS NULL)
  ),
  -- Attested is stamped and signed together, or not at all.
  CONSTRAINT okr_attested_is_signed CHECK ((attested_at IS NULL) = (attested_by IS NULL))
);

CREATE INDEX IF NOT EXISTS okr_key_results_objective_idx
  ON public.objective_key_results (objective_id);
CREATE INDEX IF NOT EXISTS okr_key_results_org_kind_idx
  ON public.objective_key_results (organization_id, kind);

CREATE TRIGGER okr_key_results_author_in_org BEFORE INSERT OR UPDATE ON public.objective_key_results
  FOR EACH ROW EXECUTE FUNCTION public.guard_author_in_org('attested_by');

ALTER TABLE public.objective_key_results ENABLE ROW LEVEL SECURITY;

-- Org-wide read EXCEPT the money (R1): a financial key result is
-- readable exactly where the fee tables are — can_read_fees(). The
-- per-placement credited exception deliberately does NOT apply: a
-- financial KR aggregates a period's book, so there is no single
-- placement whose credit could honestly anchor the exception.
CREATE POLICY okr_key_results_role_select ON public.objective_key_results
  FOR SELECT TO authenticated
  USING (
    organization_id = (SELECT public.current_user_org_id())
    AND (SELECT public.can_read_org())
    AND (kind <> 'financial' OR (SELECT public.can_read_fees()))
  );

-- The objective's owner or the desk writes its key results; a
-- financial row additionally requires the fees tier on the WRITE side
-- (the 054 lesson: nobody authors a row they cannot then read).
CREATE POLICY okr_key_results_role_insert ON public.objective_key_results
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = (SELECT public.current_user_org_id())
    AND coalesce((SELECT public.can_write_okrs()), false)
    AND EXISTS (
      SELECT 1 FROM public.objectives o
       WHERE o.id = objective_id
         AND o.organization_id = objective_key_results.organization_id
         AND (
           o.owner_user_id = (SELECT auth.uid())
           OR coalesce((SELECT public.can_manage_desk()), false)
         )
    )
    AND (kind <> 'financial' OR (SELECT public.can_read_fees()))
  );

-- WITH CHECK adds the attestation pin: nobody signs another's
-- attestation.
CREATE POLICY okr_key_results_role_update ON public.objective_key_results
  FOR UPDATE TO authenticated
  USING (
    organization_id = (SELECT public.current_user_org_id())
    AND coalesce((SELECT public.can_write_okrs()), false)
    AND EXISTS (
      SELECT 1 FROM public.objectives o
       WHERE o.id = objective_id
         AND o.organization_id = objective_key_results.organization_id
         AND (
           o.owner_user_id = (SELECT auth.uid())
           OR coalesce((SELECT public.can_manage_desk()), false)
         )
    )
  )
  WITH CHECK (
    organization_id = (SELECT public.current_user_org_id())
    AND coalesce((SELECT public.can_write_okrs()), false)
    AND EXISTS (
      SELECT 1 FROM public.objectives o
       WHERE o.id = objective_id
         AND o.organization_id = objective_key_results.organization_id
         AND (
           o.owner_user_id = (SELECT auth.uid())
           OR coalesce((SELECT public.can_manage_desk()), false)
         )
    )
    AND (kind <> 'financial' OR (SELECT public.can_read_fees()))
    AND (attested_by IS NULL OR attested_by = (SELECT auth.uid()))
  );

-- R3 again: no DELETE policy on key results either. A mis-entered
-- key result is edited in place; the record survives its author.

-- ── Vocabulary ────────────────────────────────────────────────────
-- CHECK rebuilt from the LIVE list (78 values, pg_constraint read
-- 2026-08-25) + objective_created + objective_closed = 80.

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
    'objective_created', 'objective_closed'
  ));

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
                          'objective_created', 'objective_closed') THEN
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
