-- Self-service: one's own name, by one's own hand.
--
-- Portal-settings slice (plan in docs/handoffs/NEXT-portal-settings.md,
-- D1–D5 confirmed by the founder 2026-08-19). Before this file, nobody
-- below org admin could fix a typo in their own full_name: staff writes
-- are admin-only (046/058/059) and external writes are staff-or-
-- client_admin (067) — there was no self-update reach at all. A name set
-- wrong at signup or by whoever typed the invitation was permanent
-- without founder SQL.
--
-- Two halves, same shape as every users rule since 046: RLS decides
-- which rows are in reach, the privilege guard decides which columns —
-- because RLS cannot restrict which columns an UPDATE touches (fourth
-- occurrence of that limitation).
--
-- Password change is deliberately absent here: it is GoTrue's
-- `updateUser`, no schema.

-- ---------------------------------------------------------------------------
-- 1. The reach: everyone's own row
-- ---------------------------------------------------------------------------

-- Deliberately not status-gated: a pending user fixing their name before
-- approval is fine (D2), and a suspended account renaming itself changes
-- nothing anyone else relies on. What a non-active account must NOT do —
-- self-activate, self-assign a role — is refused by the guard below, and
-- refused *because* the account is not active: both privileged predicates
-- resolve through current_user_role(), which is NULL off-active.
DROP POLICY IF EXISTS users_update_self ON public.users;

CREATE POLICY users_update_self ON public.users
  FOR UPDATE TO authenticated
  USING (id = (SELECT auth.uid()))
  WITH CHECK (id = (SELECT auth.uid()));

-- ---------------------------------------------------------------------------
-- 2. The guard learns the self branch (D4)
-- ---------------------------------------------------------------------------

-- Extends 067's guard_user_privilege_changes. One new branch, placed
-- after the founder-only column rules (is_founder / organization_id /
-- client_id stay founder territory on one's own row too) and *above* the
-- external-administration block — before this file, a hiring manager
-- updating their own row would have been refused as "only a client admin
-- may administer client accounts", the wrong sentence for the right
-- refusal. Everything after the new branch is byte-identical to 067.
--
-- The branch: on a self-update by anyone who is not an active org admin,
-- only full_name may change — with one carried power: a client_admin's
-- 067 right to change status on any account of their company includes
-- their own row, and this branch keeps it rather than silently removing
-- it. An org admin editing their own row falls through and keeps their
-- current powers; the last-admin rules below still guard self-demotion
-- and self-suspension.
CREATE OR REPLACE FUNCTION public.guard_user_privilege_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_other_admins int;
BEGIN
  -- No JWT: the service-role client, or the SECURITY DEFINER signup
  -- trigger inserting the row in the first place. Both are trusted paths.
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

  -- Self-service (071). coalesce(), not a bare NOT: is_org_admin()
  -- resolves through current_user_role(), which is NULL for a pending or
  -- suspended account. Read negated uncoalesced, a pending signup would
  -- skip this branch, fall past the external block (no client_id) and
  -- the last-admin rules (not an admin), and RETURN NEW with any column
  -- it liked — free to write its own role. The invariant-11 lesson,
  -- third application; self_service_invariants.sql pins it with a
  -- pending-signup escalation attempt, and its control run simulates
  -- exactly this regression.
  IF OLD.id = (SELECT auth.uid())
     AND NOT coalesce(public.is_org_admin(), false) THEN
    -- role and email never move by one's own hand; status moves only
    -- for a client_admin (their 067 power over every account of their
    -- company, own row included — kept). is_client_admin() is coalesced
    -- at the source (067) and active-only, so a suspended external
    -- cannot self-reactivate through the carried power.
    IF NEW.role IS DISTINCT FROM OLD.role
       OR NEW.email IS DISTINCT FROM OLD.email
       OR (NEW.status IS DISTINCT FROM OLD.status
           AND NOT public.is_client_admin()) THEN
      RAISE EXCEPTION 'only your name may be changed on your own account'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN NEW;
  END IF;

  -- External rows: column discipline for non-founder updaters. Reach is
  -- users_update_client_externals' job; which columns is this one's.
  IF OLD.client_id IS NOT NULL THEN
    IF (SELECT public.current_user_client_id()) IS NOT NULL THEN
      -- An external updating an external. is_client_admin() is coalesced —
      -- read negated here, the invariant-11 shape.
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

  -- Demoting the last admin. Counted among active members only, because an
  -- org whose only other admin is suspended is an org with no admin.
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

  -- Same rule when the last admin is suspended rather than demoted.
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
$$;

REVOKE ALL ON FUNCTION public.guard_user_privilege_changes() FROM public, anon;

-- The trigger itself is unchanged from 046 and stays attached; only the
-- function body moved.
