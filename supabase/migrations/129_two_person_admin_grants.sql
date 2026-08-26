-- 129 — TWO-PERSON APPROVAL FOR ADMIN GRANTS
--
-- Gate: docs/superpowers/specs/2026-08-26-two-person-admin-grants-gate.md,
-- confirmed by the founder 2026-08-26 — D1(a) through D8.
--
-- `admin` was self-propagating: one admin could mint another
-- unilaterally, through either the role picker or an admin-role
-- invitation, and the new admin held the full tier immediately. That is
-- the classic privilege-escalation move that makes an intrusion
-- permanent. It now takes two people.
--
-- ## What this does NOT buy, stated here so nobody over-trusts it
--
-- A single admin still holds, alone and immediately: fees:read,
-- models:write, skills:write, desk:manage, mandates:write,
-- candidates:write, clients:share, and the power to SUSPEND other
-- members. This closes one door in a room with several.
--
-- ## D1(a) — the bootstrap threshold
--
-- Two-person control is arithmetically impossible with one person, and
-- every org — this one included — starts with exactly one admin. So the
-- rule engages only once an organisation already has TWO OR MORE active
-- admins. Below that the sole admin grants alone: there is nobody to
-- collude with and nobody to ask. The 1 -> 2 transition is therefore
-- unprotected by arithmetic, not by omission.
--
-- ## D2(a) — grants only, never removals
--
-- Requiring two people to REMOVE an admin would mean a compromised
-- admin could not be revoked quickly by the one honest admin awake at
-- 3am. The existing last-admin floor (046) already prevents emptying
-- the org. Slow the door in, not the door out.
--
-- ## D5 — the database refuses it, not merely the server action
--
-- Both paths are guarded by triggers, because an admin holds a session
-- and can call PostgREST from a browser console. This is the same
-- reasoning that produced the column-scoped policy stopping an admin
-- setting `is_founder` on themselves. A feature enforced only in a
-- server action is a suggestion.
--
-- Acceptance of an invitation is deliberately NOT guarded:
-- `redeem_staff_invitation` runs under the service role, where
-- `auth.uid()` is NULL and guard_user_privilege_changes already returns
-- early. By the time a token is redeemed the grant has been approved —
-- guarding it again would only break joining.
--
-- The trail writes at 'admin' visibility, NOT 'members': the database
-- allows only org | fees | admin, and `members` is an APP-LEVEL UI
-- scope in src/lib/activity/types.ts. Writing 'members' here was
-- rejected by the visibility CHECK and SILENTLY SWALLOWED by
-- write_activity_event's exception handler — the events simply never
-- appeared. Caught by reading the trail back after the drive rather
-- than assuming a fire-and-forget write landed.
--
-- Counts: anon roster stays TWELVE (every function below is
-- `authenticated`-granted and revoked from `anon`); agent allowlist
-- stays 29 — no agent touches member administration; intent doors stay
-- 26. Activity CHECK moves 93 -> 97, deliberately, with
-- describe.test.ts bumped in the same commit.

-- ---------------------------------------------------------------------------
-- 1. The pending request
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.admin_grant_requests (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  kind               text NOT NULL CHECK (kind IN ('promotion', 'invitation')),
  -- A promotion names a user; an invitation names an address that has
  -- no user yet. Exactly one, enforced below.
  target_user_id     uuid REFERENCES public.users(id) ON DELETE CASCADE,
  target_email       text,
  target_full_name   text,
  proposed_by        uuid NOT NULL REFERENCES public.users(id),
  status             text NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending', 'approved', 'rejected', 'withdrawn', 'expired')),
  decided_by         uuid REFERENCES public.users(id),
  decided_at         timestamptz,
  expires_at         timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  created_at         timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT admin_grant_target_shape CHECK (
    (kind = 'promotion'  AND target_user_id IS NOT NULL AND target_email IS NULL)
    OR
    (kind = 'invitation' AND target_email IS NOT NULL AND target_user_id IS NULL
                         AND length(btrim(coalesce(target_full_name, ''))) > 0)
  ),
  -- A pending row has not been decided. Anything else has been, except
  -- expiry, which is time deciding rather than a person.
  CONSTRAINT admin_grant_pending_undecided CHECK (
    status <> 'pending' OR (decided_by IS NULL AND decided_at IS NULL)
  )
);

-- One live request per target: without this, two admins each proposing
-- the same person would need two approvals to say one thing.
CREATE UNIQUE INDEX IF NOT EXISTS unique_pending_admin_grant_user
  ON public.admin_grant_requests (organization_id, target_user_id)
  WHERE status = 'pending' AND target_user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS unique_pending_admin_grant_email
  ON public.admin_grant_requests (organization_id, lower(target_email))
  WHERE status = 'pending' AND target_email IS NOT NULL;

-- FK indexes, per the pre-launch checklist's standing item.
CREATE INDEX IF NOT EXISTS admin_grant_requests_org_idx
  ON public.admin_grant_requests (organization_id, status);
CREATE INDEX IF NOT EXISTS admin_grant_requests_target_idx
  ON public.admin_grant_requests (target_user_id);
CREATE INDEX IF NOT EXISTS admin_grant_requests_proposed_by_idx
  ON public.admin_grant_requests (proposed_by);
CREATE INDEX IF NOT EXISTS admin_grant_requests_decided_by_idx
  ON public.admin_grant_requests (decided_by);

ALTER TABLE public.admin_grant_requests ENABLE ROW LEVEL SECURITY;

-- Read-only to the org's admins. There is deliberately NO insert or
-- update policy: every write goes through the SECURITY DEFINER entry
-- points below, so the rules cannot be sidestepped by writing the row
-- directly (the 069 doctrine, applied to a staff table).
CREATE POLICY admin_grant_requests_admin_read ON public.admin_grant_requests
  FOR SELECT TO authenticated
  USING (
    organization_id = (SELECT public.current_user_org_id())
    AND coalesce((SELECT public.is_org_admin()), false)
  );

-- ---------------------------------------------------------------------------
-- 2. How many admins does this org actually have?
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.active_admin_count(p_org uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::int
    FROM public.users
   WHERE organization_id = p_org
     AND role = 'admin'
     AND status = 'active'
$$;

REVOKE ALL ON FUNCTION public.active_admin_count(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.active_admin_count(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. The promotion guard — D5, inside the existing privilege trigger
-- ---------------------------------------------------------------------------

-- 046's function, with one new rule. Everything else is byte-identical;
-- the addition is the `NEW.role = 'admin'` block, placed AFTER the
-- founder bypass (a platform operator provisioning a customer's first
-- admin is not the threat this models) and BEFORE the last-admin floor.
CREATE OR REPLACE FUNCTION public.guard_user_privilege_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_other_admins int;
BEGIN
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

  -- 129: granting admin takes two people, once there are two to ask.
  -- The flag is set ONLY by approve_admin_grant / propose_admin_grant,
  -- so a direct PostgREST update from an admin's console lands here.
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

-- ---------------------------------------------------------------------------
-- 4. The invitation guard — the same rule on the other door
-- ---------------------------------------------------------------------------

-- Without this, "invite a new person as admin" is an unguarded path to
-- exactly the thing section 3 refuses.
CREATE OR REPLACE FUNCTION public.guard_admin_invitations()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role <> 'admin' THEN
    RETURN NEW;
  END IF;
  IF (SELECT auth.uid()) IS NULL THEN
    RETURN NEW;               -- service-role provisioning (ops/waitlist)
  END IF;
  IF public.is_current_user_founder() THEN
    RETURN NEW;
  END IF;
  IF coalesce(current_setting('mandate.allow_admin_grant', true), '') <> 'on'
     AND public.active_admin_count(NEW.organization_id) >= 2 THEN
    RAISE EXCEPTION
      'inviting an admin requires approval by a second admin — propose it from Settings / Members'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

-- A NEW trigger function inherits EXECUTE for PUBLIC, and therefore for
-- `anon`. Applying this migration without the revoke below took the
-- ruled anon roster from TWELVE to THIRTEEN — caught by counting it
-- immediately after apply, which is why that count is checked every
-- time. A trigger function needs no direct EXECUTE by anyone: the
-- trigger machinery calls it as its definer.
REVOKE ALL ON FUNCTION public.guard_admin_invitations() FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS staff_invitations_admin_grant ON public.staff_invitations;
CREATE TRIGGER staff_invitations_admin_grant
  BEFORE INSERT ON public.staff_invitations
  FOR EACH ROW EXECUTE FUNCTION public.guard_admin_invitations();

-- ---------------------------------------------------------------------------
-- 5. Propose
-- ---------------------------------------------------------------------------

-- Returns {outcome: 'granted'|'pending', request_id}. 'granted' is the
-- D1(a) threshold case — a sole admin acting alone, which is the only
-- thing arithmetic allows.
CREATE OR REPLACE FUNCTION public.propose_admin_grant(
  p_target_user_id uuid DEFAULT NULL,
  p_target_email   text DEFAULT NULL,
  p_full_name      text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor   uuid := (SELECT auth.uid());
  v_org     uuid := (SELECT public.current_user_org_id());
  v_kind    text;
  v_id      uuid;
  v_label   text;
  v_target  record;
BEGIN
  IF v_actor IS NULL OR v_org IS NULL OR NOT coalesce(public.is_org_admin(), false) THEN
    RAISE EXCEPTION 'Only an admin may propose an admin grant.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF (p_target_user_id IS NULL) = (p_target_email IS NULL) THEN
    RAISE EXCEPTION 'Name either a member to promote or an address to invite, not both.'
      USING ERRCODE = 'P0001';
  END IF;

  v_kind := CASE WHEN p_target_user_id IS NOT NULL THEN 'promotion' ELSE 'invitation' END;

  IF v_kind = 'promotion' THEN
    SELECT id, role, status, organization_id, full_name, email
      INTO v_target
      FROM public.users
     WHERE id = p_target_user_id AND organization_id = v_org;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'That member is not in your organisation.' USING ERRCODE = 'P0002';
    END IF;
    IF v_target.role = 'admin' THEN
      RAISE EXCEPTION 'That member is already an admin.' USING ERRCODE = 'P0001';
    END IF;
    v_label := coalesce(nullif(btrim(v_target.full_name), ''), v_target.email);
  ELSE
    v_label := p_target_email;
  END IF;

  -- D1(a): with fewer than two admins there is no second pair of eyes
  -- to ask, so the grant applies immediately rather than deadlocking.
  IF public.active_admin_count(v_org) < 2 THEN
    IF v_kind = 'promotion' THEN
      PERFORM set_config('mandate.allow_admin_grant', 'on', true);
      UPDATE public.users SET role = 'admin' WHERE id = p_target_user_id;
      PERFORM set_config('mandate.allow_admin_grant', '', true);
    END IF;
    -- An invitation in the sole-admin case is simply allowed through;
    -- the caller issues it, and guard_admin_invitations lets it pass on
    -- the same threshold.
    RETURN jsonb_build_object('outcome', 'granted', 'kind', v_kind);
  END IF;

  INSERT INTO public.admin_grant_requests
    (organization_id, kind, target_user_id, target_email, target_full_name, proposed_by)
  VALUES
    (v_org, v_kind, p_target_user_id, p_target_email, p_full_name, v_actor)
  RETURNING id INTO v_id;

  PERFORM public.write_activity_event(
    p_organization_id => v_org,
    p_event_type      => 'admin_grant_proposed',
    p_visibility      => 'admin',
    p_target_user_id  => p_target_user_id,
    p_detail          => jsonb_build_object(
                           'request_id', v_id, 'kind', v_kind, 'target', v_label));

  RETURN jsonb_build_object('outcome', 'pending', 'request_id', v_id, 'kind', v_kind);
END;
$$;

REVOKE ALL ON FUNCTION public.propose_admin_grant(uuid, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.propose_admin_grant(uuid, text, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. Approve — the second pair of eyes
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.approve_admin_grant(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_org   uuid := (SELECT public.current_user_org_id());
  v_req   public.admin_grant_requests%ROWTYPE;
  v_label text;
BEGIN
  IF v_actor IS NULL OR NOT coalesce(public.is_org_admin(), false) THEN
    RAISE EXCEPTION 'Only an admin may approve an admin grant.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_req FROM public.admin_grant_requests
   WHERE id = p_request_id AND organization_id = v_org
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That request is not yours to decide.' USING ERRCODE = 'P0002';
  END IF;
  IF v_req.status <> 'pending' THEN
    RAISE EXCEPTION 'That request is already %.', v_req.status USING ERRCODE = 'P0001';
  END IF;
  IF v_req.expires_at <= now() THEN
    RAISE EXCEPTION 'That request has expired. Propose it again.' USING ERRCODE = 'P0001';
  END IF;

  -- The whole point: the proposer is not the second pair of eyes.
  IF v_req.proposed_by = v_actor THEN
    RAISE EXCEPTION 'An admin grant must be approved by a different admin.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  PERFORM set_config('mandate.allow_admin_grant', 'on', true);

  IF v_req.kind = 'promotion' THEN
    UPDATE public.users SET role = 'admin' WHERE id = v_req.target_user_id;
    SELECT coalesce(nullif(btrim(full_name), ''), email) INTO v_label
      FROM public.users WHERE id = v_req.target_user_id;
  ELSE
    INSERT INTO public.staff_invitations
      (organization_id, email, full_name, role, invited_by, invited_by_label)
    VALUES
      (v_org, v_req.target_email, v_req.target_full_name, 'admin', v_req.proposed_by,
       (SELECT coalesce(nullif(btrim(full_name), ''), email) FROM public.users WHERE id = v_req.proposed_by));
    v_label := v_req.target_email;
  END IF;

  PERFORM set_config('mandate.allow_admin_grant', '', true);

  UPDATE public.admin_grant_requests
     SET status = 'approved', decided_by = v_actor, decided_at = now()
   WHERE id = p_request_id;

  PERFORM public.write_activity_event(
    p_organization_id => v_org,
    p_event_type      => 'admin_grant_approved',
    p_visibility      => 'admin',
    p_target_user_id  => v_req.target_user_id,
    p_detail          => jsonb_build_object(
                           'request_id', p_request_id, 'kind', v_req.kind,
                           'target', v_label, 'proposed_by', v_req.proposed_by));

  RETURN jsonb_build_object('outcome', 'approved', 'kind', v_req.kind);
END;
$$;

REVOKE ALL ON FUNCTION public.approve_admin_grant(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.approve_admin_grant(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 7. Reject and withdraw
-- ---------------------------------------------------------------------------

-- Rejection is any OTHER admin's veto; withdrawal is the proposer's own
-- second thought. Two verbs because they are two different facts, and
-- the trail should not have to guess which happened.
CREATE OR REPLACE FUNCTION public.decide_admin_grant(
  p_request_id uuid,
  p_decision   text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_org   uuid := (SELECT public.current_user_org_id());
  v_req   public.admin_grant_requests%ROWTYPE;
BEGIN
  IF p_decision NOT IN ('rejected', 'withdrawn') THEN
    RAISE EXCEPTION 'Decision must be rejected or withdrawn.' USING ERRCODE = 'P0001';
  END IF;
  IF v_actor IS NULL OR NOT coalesce(public.is_org_admin(), false) THEN
    RAISE EXCEPTION 'Only an admin may decide an admin grant.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_req FROM public.admin_grant_requests
   WHERE id = p_request_id AND organization_id = v_org
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That request is not yours to decide.' USING ERRCODE = 'P0002';
  END IF;
  IF v_req.status <> 'pending' THEN
    RAISE EXCEPTION 'That request is already %.', v_req.status USING ERRCODE = 'P0001';
  END IF;

  IF p_decision = 'withdrawn' AND v_req.proposed_by <> v_actor THEN
    RAISE EXCEPTION 'Only the admin who proposed it may withdraw it.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE public.admin_grant_requests
     SET status = p_decision, decided_by = v_actor, decided_at = now()
   WHERE id = p_request_id;

  PERFORM public.write_activity_event(
    p_organization_id => v_org,
    p_event_type      => 'admin_grant_rejected',
    p_visibility      => 'admin',
    p_target_user_id  => v_req.target_user_id,
    p_detail          => jsonb_build_object(
                           'request_id', p_request_id, 'kind', v_req.kind,
                           'decision', p_decision,
                           'target', coalesce(v_req.target_email, v_req.target_user_id::text)));

  RETURN jsonb_build_object('outcome', p_decision);
END;
$$;

REVOKE ALL ON FUNCTION public.decide_admin_grant(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.decide_admin_grant(uuid, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 8. Expiry — D6
-- ---------------------------------------------------------------------------

-- Approval already refuses an expired request, so this is bookkeeping
-- rather than enforcement: it turns silent staleness into a visible
-- `expired` row with a trail entry, per the house rule that an absence
-- should say why it is absent. Safe to call repeatedly.
CREATE OR REPLACE FUNCTION public.expire_admin_grants()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.admin_grant_requests%ROWTYPE;
  v_n   integer := 0;
BEGIN
  FOR v_row IN
    SELECT * FROM public.admin_grant_requests
     WHERE status = 'pending' AND expires_at <= now()
     FOR UPDATE
  LOOP
    UPDATE public.admin_grant_requests
       SET status = 'expired' WHERE id = v_row.id;
    PERFORM public.write_activity_event(
      p_organization_id => v_row.organization_id,
      p_event_type      => 'admin_grant_expired',
      p_visibility      => 'admin',
      p_target_user_id  => v_row.target_user_id,
      p_detail          => jsonb_build_object('request_id', v_row.id, 'kind', v_row.kind));
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END;
$$;

REVOKE ALL ON FUNCTION public.expire_admin_grants() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_admin_grants() TO service_role;

-- ---------------------------------------------------------------------------
-- 9. The trail's vocabulary — D7, 93 -> 97
-- ---------------------------------------------------------------------------

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
    'skill_activated', 'skill_deleted', 'candidate_stage_changed', 'task_assigned',
    'task_completed', 'objective_created', 'objective_closed',
    'interview_plan_generation_requested', 'interview_plan_generation_failed',
    'interview_plan_approved', 'client_interview_generation_requested',
    'client_interview_generation_failed', 'client_interview_approved',
    'client_interview_answered', 'model_provider_added', 'model_assignment_changed',
    'invoice_created', 'invoice_issued', 'invoice_voided', 'invoice_sent',
    -- 129:
    'admin_grant_proposed', 'admin_grant_approved', 'admin_grant_rejected',
    'admin_grant_expired'
  ));
