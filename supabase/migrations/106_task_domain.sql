-- 106: the task domain (product-pass slice five, Kanban (b); §111
-- gate, D1–D8 + four rulings confirmed 2026-08-25).
--
-- A task is desk work asked of a member: org-scoped, optionally
-- project-scoped (R2 — the 053 nullable-real-FK precedent), assigned
-- by the desk (R4), completable by its assignee or the desk, never
-- deleted (R3 — cancelled is the human walk-away and the row is a
-- record). Assignees are ACTIVE admin/manager/recruiter/researcher
-- (R1 — the can_write_candidates set), enforced by a guard trigger on
-- the 064 model. All trigger-read predicates are COALESCED (the 064
-- lesson: NOT NULL is NULL, and an IF that silently does not fire).

CREATE TABLE IF NOT EXISTS public.tasks (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id      uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  title           text NOT NULL,
  detail          text NOT NULL DEFAULT '',
  status          text NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open', 'done', 'cancelled')),
  due_on          date,
  -- Unassigned is a real state the desk must surface, not an error (064).
  assignee_id     uuid REFERENCES public.users(id),
  created_by      uuid NOT NULL REFERENCES public.users(id),
  completed_at    timestamptz,
  completed_by    uuid REFERENCES public.users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  -- Done is stamped and signed, or it is not done.
  CONSTRAINT tasks_done_is_stamped CHECK ((status = 'done') = (completed_at IS NOT NULL)),
  CONSTRAINT tasks_done_is_signed  CHECK ((status = 'done') = (completed_by IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS tasks_org_assignee_status_idx
  ON public.tasks (organization_id, assignee_id, status);
CREATE INDEX IF NOT EXISTS tasks_org_project_idx
  ON public.tasks (organization_id, project_id);

-- The author and the named members belonged to this org when written (057).
CREATE TRIGGER tasks_author_in_org BEFORE INSERT OR UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.guard_author_in_org('created_by', 'assignee_id', 'completed_by');

-- What RLS cannot say about columns: only the desk assigns, the
-- assignee must be an active member of the R1 set, and attribution
-- never rewrites.
CREATE OR REPLACE FUNCTION public.guard_task_assignee_changes()
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
    RAISE EXCEPTION 'a task''s author does not change';
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.assignee_id IS DISTINCT FROM OLD.assignee_id
     AND coalesce(public.can_manage_desk(), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'only the desk assigns or reassigns a task';
  END IF;

  IF NEW.assignee_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.assignee_id IS DISTINCT FROM OLD.assignee_id) THEN
    SELECT role, status INTO v_role, v_status
      FROM public.users WHERE id = NEW.assignee_id;
    IF v_role IS NULL
       OR coalesce(v_status, '') <> 'active'
       OR v_role NOT IN ('admin', 'manager', 'recruiter', 'researcher') THEN
      RAISE EXCEPTION 'the assignee must be an active admin, manager, recruiter or researcher';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER tasks_guard_assignee BEFORE INSERT OR UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.guard_task_assignee_changes();

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

-- Org-wide read (097 shape): work asked for is visible work.
CREATE POLICY tasks_role_select ON public.tasks
  FOR SELECT TO authenticated
  USING (
    organization_id = (SELECT public.current_user_org_id())
    AND (SELECT public.can_read_org())
  );

-- R4: the desk creates; the creator signs their own name (087).
CREATE POLICY tasks_role_insert ON public.tasks
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = (SELECT public.current_user_org_id())
    AND coalesce((SELECT public.can_manage_desk()), false)
    AND created_by = (SELECT auth.uid())
  );

-- The desk, or the task's own assignee. WITH CHECK adds the
-- completion pin: nobody signs another's completion.
CREATE POLICY tasks_role_update ON public.tasks
  FOR UPDATE TO authenticated
  USING (
    organization_id = (SELECT public.current_user_org_id())
    AND (
      coalesce((SELECT public.can_manage_desk()), false)
      OR assignee_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    organization_id = (SELECT public.current_user_org_id())
    AND (
      coalesce((SELECT public.can_manage_desk()), false)
      OR assignee_id = (SELECT auth.uid())
    )
    AND (completed_by IS NULL OR completed_by = (SELECT auth.uid()))
  );

-- R3: no DELETE policy, for anyone. Cancelled is the walk-away.

-- ── Vocabulary ────────────────────────────────────────────────────
-- CHECK rebuilt from the LIVE list (76 values, pg_constraint read
-- 2026-08-25) + task_assigned + task_completed = 78.

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
    'task_assigned', 'task_completed'
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
                          'task_assigned', 'task_completed') THEN
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
