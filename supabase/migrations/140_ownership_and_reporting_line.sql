-- 140 — WHO BROUGHT THIS PERSON IN, AND WHOSE DESK THEY SIT ON
--
-- §200 slice 1. The founder's ask was an agent that trawls "all of the
-- CVs under the user's account, or if a Manager then his recruiters'
-- accounts". Neither half of that sentence was expressible: `candidates`
-- had no owner, and `users` had no reporting line. This adds both.
--
-- RULED (D1, the second question): these two columns govern THE AGENT'S
-- TRAWL — which CVs the reuse suggester draws from — and NOTHING ELSE.
-- Candidate visibility stays organisation-wide, so a colleague working
-- the same mandate still sees every candidate on it, whoever uploaded
-- them. That is deliberate: the alternative hides a shared mandate's own
-- pipeline from the people staffing it, and it would force every agent
-- (which reads under its OWN identity, never yours) to be taught the
-- calling user's scope.
--
-- So NO RLS POLICY CHANGES HERE. If that ever becomes wanted, it is its
-- own programme and this comment is the record that it was considered
-- and deliberately not done.
--
-- RULED (D1 backfill): existing rows keep `created_by = NULL`, and NULL
-- means UNOWNED — in everyone's trawl. Nothing leaves anyone's reach on
-- deploy, and the pool fills with owned rows as people upload. The same
-- rule gives the right behaviour when someone leaves: the FK is ON
-- DELETE SET NULL, so a departing recruiter's CVs revert to the house
-- rather than vanishing from it.

-- 1. Ownership on the candidate row.

ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS created_by uuid
    REFERENCES public.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.candidates.created_by IS
  'Who uploaded/added this candidate. NULL = unowned (pre-140 rows, or '
  'the owner''s account was deleted) and unowned is in EVERY trawl. '
  'Scopes the reuse agent''s search only — never visibility (§200 D1).';

-- The advisor sweep flags unindexed FKs, and this one is read on every
-- trawl and touched by every user delete.
CREATE INDEX IF NOT EXISTS candidates_created_by_idx
  ON public.candidates (created_by);

-- 2. The reporting line.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS manager_id uuid
    REFERENCES public.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.users.manager_id IS
  'Whose desk this member reports to. Read ONE level deep by the reuse '
  'agent: a manager trawls their own CVs plus those of everyone whose '
  'manager_id is them. Not a permission — see 140''s header.';

CREATE INDEX IF NOT EXISTS users_manager_id_idx
  ON public.users (manager_id);

-- 3. The guard.
--
-- THE TRAP THIS CLOSES: `guard_user_privilege_changes` has a self-edit
-- branch — `IF OLD.id = auth.uid() AND NOT is_org_admin()` — which
-- refuses role/email/status and then RETURNS NEW. Every column it does
-- not name is therefore editable by the account itself, so a recruiter
-- could set their own manager_id and, since that governs the trawl,
-- quietly widen the pool their suggestions are drawn from. The check
-- goes in BEFORE that early return.

CREATE OR REPLACE FUNCTION public.guard_user_privilege_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_other_admins int;
  v_mgr_org uuid;
  v_mgr_role text;
  v_mgr_status text;
  v_mgr_manager uuid;
BEGIN
  -- Reporting lines are an administrative act, and they are checked for
  -- EVERY caller including the founder: these are structural rules (a
  -- desk in another org, a cycle), not privilege rules.
  IF NEW.manager_id IS DISTINCT FROM OLD.manager_id THEN
    IF NEW.manager_id IS NOT NULL THEN
      IF NEW.manager_id = NEW.id THEN
        RAISE EXCEPTION 'a member cannot report to themselves'
          USING ERRCODE = 'check_violation';
      END IF;

      SELECT organization_id, role, status, manager_id
        INTO v_mgr_org, v_mgr_role, v_mgr_status, v_mgr_manager
        FROM public.users
       WHERE id = NEW.manager_id;

      IF v_mgr_org IS DISTINCT FROM NEW.organization_id THEN
        RAISE EXCEPTION 'a member can only report to someone in the same organization'
          USING ERRCODE = 'check_violation';
      END IF;

      IF v_mgr_role NOT IN ('manager', 'admin') THEN
        RAISE EXCEPTION 'only a manager or an admin can head a desk'
          USING ERRCODE = 'check_violation';
      END IF;

      IF v_mgr_status <> 'active' THEN
        RAISE EXCEPTION 'a desk cannot be headed by a suspended account'
          USING ERRCODE = 'check_violation';
      END IF;

      -- One level is all the trawl reads, so a cycle cannot hang it —
      -- but a pair reporting to each other is nonsense on a screen and
      -- would make "whose desk is this" unanswerable.
      IF v_mgr_manager = NEW.id THEN
        RAISE EXCEPTION 'those two would report to each other'
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;

    IF (SELECT auth.uid()) IS NOT NULL
       AND NOT public.is_current_user_founder()
       AND NOT coalesce(public.is_org_admin(), false) THEN
      RAISE EXCEPTION 'reporting lines are set by an admin from Settings / Members'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  IF (SELECT auth.uid()) IS NULL THEN
    RETURN NEW;
  END IF;

  IF public.is_current_user_founder() THEN
    RETURN NEW;
  END IF;

  IF NEW.is_founder IS DISTINCT FROM OLD.is_founder THEN
    RAISE EXCEPTION 'is_founder can only be changed by a founder'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    RAISE EXCEPTION 'organization_id can only be changed by a founder'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NEW.client_id IS DISTINCT FROM OLD.client_id THEN
    RAISE EXCEPTION 'client_id can only be changed by a founder'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF (NEW.role = 'agent') IS DISTINCT FROM (OLD.role = 'agent') THEN
    RAISE EXCEPTION 'the agent role can only be granted or removed by a founder'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NEW.role = 'admin' AND OLD.role IS DISTINCT FROM 'admin' THEN
    IF coalesce(current_setting('mandate.allow_admin_grant', true), '') <> 'on'
       AND public.active_admin_count(OLD.organization_id) >= 2 THEN
      RAISE EXCEPTION
        'granting admin requires approval by a second admin — propose it from Settings / Members'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  IF OLD.id = (SELECT auth.uid())
     AND NOT coalesce(public.is_org_admin(), false) THEN
    IF NEW.role IS DISTINCT FROM OLD.role
       OR NEW.email IS DISTINCT FROM OLD.email
       OR (NEW.status IS DISTINCT FROM OLD.status
           AND NOT public.is_client_admin()) THEN
      RAISE EXCEPTION 'only your name may be changed on your own account'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.client_id IS NOT NULL THEN
    IF (SELECT public.current_user_client_id()) IS NOT NULL THEN
      IF NOT public.is_client_admin() THEN
        RAISE EXCEPTION 'only a client admin may administer client accounts'
          USING ERRCODE = 'insufficient_privilege';
      END IF;
      IF NEW.role IS DISTINCT FROM OLD.role
         OR NEW.email IS DISTINCT FROM OLD.email
         OR NEW.full_name IS DISTINCT FROM OLD.full_name THEN
        RAISE EXCEPTION 'a client admin may only change account status'
          USING ERRCODE = 'insufficient_privilege';
      END IF;
    ELSE
      IF NEW.email IS DISTINCT FROM OLD.email THEN
        RAISE EXCEPTION 'email can only be changed by a founder'
          USING ERRCODE = 'insufficient_privilege';
      END IF;
    END IF;
  END IF;

  IF OLD.role = 'admin' AND NEW.role IS DISTINCT FROM 'admin' THEN
    SELECT count(*) INTO v_other_admins
      FROM public.users
     WHERE organization_id = OLD.organization_id
       AND id <> OLD.id
       AND role = 'admin'
       AND status = 'active';
    IF v_other_admins = 0 THEN
      RAISE EXCEPTION 'an organization must keep at least one active admin'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  IF OLD.role = 'admin' AND OLD.status = 'active' AND NEW.status IS DISTINCT FROM 'active' THEN
    SELECT count(*) INTO v_other_admins
      FROM public.users
     WHERE organization_id = OLD.organization_id
       AND id <> OLD.id
       AND role = 'admin'
       AND status = 'active';
    IF v_other_admins = 0 THEN
      RAISE EXCEPTION 'an organization must keep at least one active admin'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- 4. The trail's vocabulary: 99 -> 100.
--
-- Who reports to whom decides which CVs an agent reads on someone's
-- behalf, so moving a desk is a governance act and belongs in the trail
-- beside the role and status changes it sits next to on the same screen.

ALTER TABLE public.activity_events
  DROP CONSTRAINT IF EXISTS activity_events_type_known;

ALTER TABLE public.activity_events
  ADD CONSTRAINT activity_events_type_known CHECK (event_type IN (
    'placement_recorded', 'placement_status_changed', 'placement_signoff_changed',
    'placement_deleted', 'fee_recorded', 'fee_updated', 'fee_line_earned',
    'fee_line_cancelled', 'fee_reversed', 'fee_terms_created', 'fee_terms_updated',
    'fee_terms_deleted', 'client_contact_added', 'client_contact_updated',
    'client_contact_removed', 'member_role_changed', 'member_status_changed',
    'member_founder_changed', 'member_org_changed', 'shortlist_published',
    'report_exported', 'hm_portal_opened', 'mandate_reassigned', 'external_invited',
    'external_invitation_revoked', 'external_invitation_resent', 'external_joined',
    'external_role_changed', 'external_status_changed', 'mandate_shared',
    'mandate_unshared', 'external_access_granted', 'external_access_revoked',
    'candidate_portal_link_issued', 'candidate_portal_link_revoked',
    'candidate_self_updated', 'candidate_withdrew', 'candidate_erasure_requested',
    'candidate_cv_submitted', 'feedback_interpreted', 'candidates_ranked',
    'candidate_parsed', 'candidate_evaluated', 'candidate_positioned',
    'candidate_researched', 'candidate_triangulated', 'candidate_profiled',
    'desk_digest_generated', 'company_researched', 'hm_researched',
    'culture_profiled', 'sourcing_queries_generated', 'intake_analyzed',
    'health_suggested', 'weekly_report_generated', 'calibration_derived',
    'job_spec_generated', 'shortlist_report_generated', 'copilot_answered',
    'success_profile_generated', 'interview_plan_generated',
    'executive_context_researched', 'candidate_search_answered',
    'sourcing_search_executed', 'outreach_strategy_drafted', 'relationship_updated',
    'network_dnc_set', 'network_dnc_cleared', 'engagement_updated',
    'prescreen_updated', 'skill_created', 'skill_updated', 'skill_paused',
    'skill_activated', 'skill_deleted', 'candidate_stage_changed',
    'task_assigned', 'task_completed', 'objective_created', 'objective_closed',
    'interview_plan_generation_requested', 'interview_plan_generation_failed',
    'interview_plan_approved', 'client_interview_generation_requested',
    'client_interview_generation_failed', 'client_interview_approved',
    'client_interview_answered', 'model_provider_added',
    'model_assignment_changed', 'invoice_created', 'invoice_issued',
    'invoice_voided', 'invoice_sent', 'admin_grant_proposed',
    'admin_grant_approved', 'admin_grant_rejected', 'admin_grant_expired',
    'calibration_rederived', 'evaluation_contested',
    'member_manager_changed'
  ));

-- 5. The audit trigger learns the new column.
--
-- Names are snapshotted into the detail, exactly as member_org_changed
-- snapshots org names: the event has to stay readable after the manager
-- account is gone.

CREATE OR REPLACE FUNCTION public.audit_member_manager()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_member text := coalesce(nullif(btrim(NEW.full_name), ''), NEW.email);
  v_from text;
  v_to text;
BEGIN
  IF NEW.manager_id IS NOT DISTINCT FROM OLD.manager_id THEN
    RETURN NEW;
  END IF;

  SELECT coalesce(nullif(btrim(full_name), ''), email) INTO v_from
    FROM public.users WHERE id = OLD.manager_id;
  SELECT coalesce(nullif(btrim(full_name), ''), email) INTO v_to
    FROM public.users WHERE id = NEW.manager_id;

  PERFORM public.write_activity_event(
    p_organization_id => coalesce(NEW.organization_id, OLD.organization_id),
    p_event_type      => 'member_manager_changed',
    p_visibility      => 'admin',
    p_target_user_id  => NEW.id,
    p_detail          => jsonb_build_object(
                           'from', v_from, 'to', v_to,
                           'member', v_member));

  RETURN NEW;
END;
$function$;

-- Revoked at birth, per 110/121's doctrine: a trigger function has no
-- business being callable by a session.
REVOKE ALL ON FUNCTION public.audit_member_manager() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS users_manager_audit ON public.users;
CREATE TRIGGER users_manager_audit
  AFTER UPDATE OF manager_id ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.audit_member_manager();
