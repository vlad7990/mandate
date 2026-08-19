-- The platform operator becomes a persona (A-slice of the final-personas
-- programme; plan in docs/handoffs/NEXT-final-personas.md, D1–D12
-- confirmed by the founder 2026-08-19).
--
-- D2 as confirmed: `is_founder` STAYS the boundary. No ninth role — a
-- platform operator belongs to neither an org nor a client, and a role
-- value would force the 067 XOR three-way and every staff enumeration to
-- remember to exclude it. What this migration adds is the two things the
-- boolean never had: a complete trail (D4) and a lawful read surface for
-- the administration screens (/ops, D3).
--
-- ## What is already true, verified before writing this file
--
-- - role / status / is_founder changes on any users row are audited by
--   `audit_member_changes` (053, externals routed by 068) with the actor
--   from auth.uid() — operator approvals and suspensions already leave
--   events. The gap is ORGANISATION MOVES: the guard restricts
--   `organization_id` to founder hands (046), but the audit trigger
--   neither fires on that column nor has a branch for it. The one column
--   only the operator can move was the one column that left no record.
-- - Waitlist triage is audited on the row itself (`reviewed_by`,
--   `reviewed_at`, 060) and the waitlist belongs to no organisation, so
--   it has no org trail to land in. That stays the deliberate exception,
--   pinned by the invariants file rather than re-modelled here.
-- - Founders read every users row (002, status-gated since 059) but NOT
--   other organisations' rows in `organizations` or `clients` — /ops
--   could list every account on the platform and not name the org or
--   client it belongs to.
--
-- ## The load-bearing negative (D5)
--
-- The two new policies below are SELECT on `organizations` and `clients`,
-- and nothing else. No founder policy is added to any recruiting-data
-- table — candidates, scores, fees, placements stay exactly as reachable
-- to the operator as they were yesterday. The invariants file pins this
-- mechanically: no policy on those tables may mention the founder
-- predicate at all.

-- ---------------------------------------------------------------------------
-- 1. The vocabulary learns the one act it was missing
-- ---------------------------------------------------------------------------

ALTER TABLE public.activity_events
  DROP CONSTRAINT IF EXISTS activity_events_type_known;

ALTER TABLE public.activity_events
  ADD CONSTRAINT activity_events_type_known CHECK (event_type IN (
    'placement_recorded', 'placement_status_changed',
    'placement_signoff_changed', 'placement_deleted',
    'fee_recorded', 'fee_updated', 'fee_line_earned', 'fee_line_cancelled',
    'fee_reversed', 'fee_terms_created', 'fee_terms_updated',
    'fee_terms_deleted',
    'client_contact_added', 'client_contact_updated', 'client_contact_removed',
    'member_role_changed', 'member_status_changed', 'member_founder_changed',
    'member_org_changed',
    'shortlist_published', 'report_exported', 'hm_portal_opened',
    'mandate_reassigned',
    'external_invited', 'external_invitation_revoked',
    'external_invitation_resent', 'external_joined',
    'external_role_changed', 'external_status_changed',
    'mandate_shared', 'mandate_unshared',
    'external_access_granted', 'external_access_revoked'
  ));

-- ---------------------------------------------------------------------------
-- 2. audit_member_changes learns organisation moves
-- ---------------------------------------------------------------------------

-- Byte-identical to the 068 body except the new org-move branch (staff
-- rows only — the external block above it returns early, and an external
-- has no organisation to move between). The event is written to BOTH
-- sides when both exist: the org that lost the member and the org that
-- gained them each remember it in their own trail. An approval that
-- assigns a first organisation (OLD.organization_id NULL) writes one
-- event in the gaining org, alongside the member_status_changed the
-- status flip already writes — two events because two things happened.
CREATE OR REPLACE FUNCTION public.audit_member_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid := coalesce(NEW.organization_id, OLD.organization_id);
  v_member text := coalesce(nullif(btrim(NEW.full_name), ''), NEW.email);
  v_from_name text;
  v_to_name text;
BEGIN
  IF NEW.client_id IS NOT NULL THEN
    IF OLD.client_id IS NULL THEN
      RETURN NEW;
    END IF;

    v_org := public.client_org(NEW.client_id);

    IF NEW.role IS DISTINCT FROM OLD.role THEN
      PERFORM public.write_activity_event(
        p_organization_id => v_org,
        p_event_type      => 'external_role_changed',
        p_visibility      => 'org',
        p_client_id       => NEW.client_id,
        p_target_user_id  => NEW.id,
        p_detail          => jsonb_build_object(
                               'from', OLD.role, 'to', NEW.role,
                               'member', v_member));
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status THEN
      PERFORM public.write_activity_event(
        p_organization_id => v_org,
        p_event_type      => 'external_status_changed',
        p_visibility      => 'org',
        p_client_id       => NEW.client_id,
        p_target_user_id  => NEW.id,
        p_detail          => jsonb_build_object(
                               'from', OLD.status, 'to', NEW.status,
                               'member', v_member));
    END IF;

    RETURN NEW;
  END IF;

  -- Organisation moves (072). Founder-only by the 046 guard; remembered
  -- here. Names resolved at write time so the trail stays readable even
  -- if an org is later renamed or deleted.
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    SELECT name INTO v_from_name FROM public.organizations WHERE id = OLD.organization_id;
    SELECT name INTO v_to_name   FROM public.organizations WHERE id = NEW.organization_id;

    IF OLD.organization_id IS NOT NULL THEN
      -- No p_target_user_id on the losing side: this trigger runs AFTER
      -- the move, so the member already belongs to the other org, and
      -- guard_author_in_org rightly refuses a foreign user reference in
      -- an org's trail (write_activity_event's catch then swallowed the
      -- whole event — found by operator_invariants' first run, not by
      -- reasoning). The departed member is carried in detail instead.
      PERFORM public.write_activity_event(
        p_organization_id => OLD.organization_id,
        p_event_type      => 'member_org_changed',
        p_visibility      => 'admin',
        p_detail          => jsonb_build_object(
                               'from', v_from_name, 'to', v_to_name,
                               'member', v_member, 'member_id', NEW.id::text));
    END IF;

    IF NEW.organization_id IS NOT NULL THEN
      PERFORM public.write_activity_event(
        p_organization_id => NEW.organization_id,
        p_event_type      => 'member_org_changed',
        p_visibility      => 'admin',
        p_target_user_id  => NEW.id,
        p_detail          => jsonb_build_object(
                               'from', v_from_name, 'to', v_to_name,
                               'member', v_member));
    END IF;
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role THEN
    PERFORM public.write_activity_event(
      p_organization_id => v_org,
      p_event_type      => 'member_role_changed',
      p_visibility      => 'admin',
      p_target_user_id  => NEW.id,
      p_detail          => jsonb_build_object(
                             'from', OLD.role, 'to', NEW.role,
                             'member', v_member));
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM public.write_activity_event(
      p_organization_id => v_org,
      p_event_type      => 'member_status_changed',
      p_visibility      => 'admin',
      p_target_user_id  => NEW.id,
      p_detail          => jsonb_build_object(
                             'from', OLD.status, 'to', NEW.status,
                             'member', v_member));
  END IF;

  IF NEW.is_founder IS DISTINCT FROM OLD.is_founder THEN
    PERFORM public.write_activity_event(
      p_organization_id => v_org,
      p_event_type      => 'member_founder_changed',
      p_visibility      => 'admin',
      p_target_user_id  => NEW.id,
      p_detail          => jsonb_build_object(
                             'from', OLD.is_founder, 'to', NEW.is_founder,
                             'member', v_member));
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.audit_member_changes() FROM public, anon, authenticated;

-- The trigger must now also fire when only organization_id moves — the
-- 053 column list was exactly why the one founder-only column change was
-- the one that left no record.
DROP TRIGGER IF EXISTS users_audit ON public.users;
CREATE TRIGGER users_audit
  AFTER UPDATE OF role, status, is_founder, organization_id ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.audit_member_changes();

-- ---------------------------------------------------------------------------
-- 3. The operator's read surface: org and client NAMES, nothing else
-- ---------------------------------------------------------------------------

-- Status-gated like 059's users policies: can_read_org() resolves through
-- current_user_role(), which is NULL for a pending or suspended account —
-- a suspended founder reads nothing here. The invariants file pins that
-- with a forged suspended founder, and its control run simulates exactly
-- this conjunct going missing.
DROP POLICY IF EXISTS organizations_founder_select ON public.organizations;

CREATE POLICY organizations_founder_select ON public.organizations
  FOR SELECT TO authenticated
  USING (
    (SELECT public.can_read_org())
    AND (SELECT public.is_current_user_founder())
  );

DROP POLICY IF EXISTS clients_founder_select ON public.clients;

CREATE POLICY clients_founder_select ON public.clients
  FOR SELECT TO authenticated
  USING (
    (SELECT public.can_read_org())
    AND (SELECT public.is_current_user_founder())
  );

-- Deliberately absent, restated from the header: founder policies on any
-- recruiting-data table. The operator administers accounts and
-- organisations, not searches.
