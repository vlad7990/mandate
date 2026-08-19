-- External roles, and the client boundary.
--
-- Third persona programme (External Identity: HM login + Hiring Company
-- HR + Hiring Company Admin; plan in docs/handoffs/NEXT-external-identity.md,
-- decisions D1–D6 confirmed by the founder 2026-08-19). This migration is
-- the identity half: who an external is and what fails closed. Invitations
-- arrive in 068; shares, grants and the portal read surface in 069.
--
-- Three roles join the vocabulary — `hiring_manager`, `client_hr`,
-- `client_admin` — and they are principals in `public.users` like everyone
-- else (D1): same auth stack, same password floor, same status lifecycle.
-- What separates them from staff is the boundary column: an external
-- belongs to a `client`, never to an organisation.
--
-- ## The fail-open trap this file exists to close
--
-- `can_read_org()` has meant "any role at all" since 046 — it was written
-- when every role was a staff role, and every org-scoped SELECT policy in
-- the product resolves through it. An external role in the same vocabulary
-- plus an `organization_id` on the same row would open the entire org to
-- a client's hiring manager. Both halves get closed, and either alone
-- would hold:
--
--   1. The XOR CHECK below: staff carry `organization_id` and never
--      `client_id`; externals carry `client_id` and never
--      `organization_id`. With org NULL, every org-scoped policy fails on
--      `organization_id = current_user_org_id()` before any predicate is
--      consulted.
--   2. `can_read_org()` stops meaning "any role" and enumerates the five
--      staff roles.
--
-- Belt and braces on purpose — §19's invariant-11 found the last fail-open
-- in a predicate everyone had read.
--
-- ## What externals can reach after this file
--
-- Nothing, except their own users row (002/059's self-read branch, which
-- pending and suspended accounts also need) — and, for a client_admin,
-- their own company's external roster. Every domain table keeps refusing
-- them: org-scoped policies fail on the NULL org, and no external policy
-- is added to any base table. The portal read surface is deliberately not
-- RLS — it will be SECURITY DEFINER RPCs in 069, because "the slate" is a
-- computed shape RLS cannot express without exposing the whole pool.
--
-- ## `guard_author_in_org` needs no change
--
-- It refuses any author whose `organization_id` differs from the row's,
-- and an external's is NULL — so an external accidentally named in a staff
-- author column is refused today, which is correct. External attribution
-- lives on columns 069 adds, checked by the RPCs that write them.


-- ---------------------------------------------------------------------------
-- 1. The vocabulary and the boundary column
-- ---------------------------------------------------------------------------

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES public.clients(id);

-- RESTRICT semantics via the plain FK (no ON DELETE action): a client with
-- external accounts cannot be deleted until those accounts are dealt with.
-- SET NULL would strand an external role with no client, which the CHECK
-- below forbids — better the delete is refused with a straight answer than
-- fails on a constraint two steps removed.

CREATE INDEX IF NOT EXISTS users_client_id_idx
  ON public.users (client_id) WHERE client_id IS NOT NULL;

ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_role_check;

ALTER TABLE public.users
  ADD CONSTRAINT users_role_check
  CHECK (role IN ('admin', 'manager', 'recruiter', 'researcher', 'viewer',
                  'hiring_manager', 'client_hr', 'client_admin'));

-- The XOR. Staff may have org NULL (a pending signup awaiting approval);
-- an external must have a client and must not have an org. Because the
-- role CHECK admits exactly these eight values, every row falls into
-- exactly one branch — and a role change across the staff/external line
-- without the columns moving in the same statement is refused here, not
-- in a trigger someone has to remember.
ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_client_boundary_check;

ALTER TABLE public.users
  ADD CONSTRAINT users_client_boundary_check
  CHECK (
    (role IN ('admin', 'manager', 'recruiter', 'researcher', 'viewer')
      AND client_id IS NULL)
    OR
    (role IN ('hiring_manager', 'client_hr', 'client_admin')
      AND organization_id IS NULL
      AND client_id IS NOT NULL)
  );


-- ---------------------------------------------------------------------------
-- 2. can_read_org() learns what "org" means
-- ---------------------------------------------------------------------------

-- Uncoalesced like the other 046 predicates, and for the same reason: it
-- is only ever read by RLS (NULL filters like false) and by
-- `record_activity_event`'s `IS NOT TRUE` (NULL-safe). Nothing reads it
-- negated in plpgsql.
CREATE OR REPLACE FUNCTION public.can_read_org()
RETURNS boolean LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT public.current_user_role()
         IN ('admin', 'manager', 'recruiter', 'researcher', 'viewer')
$$;

-- The write predicates (can_write_candidates, can_write_mandates,
-- can_share_clients, can_read_fees, can_manage_desk, is_org_admin) already
-- enumerate staff roles and need no change — an external role is simply
-- not in their lists.


-- ---------------------------------------------------------------------------
-- 3. The external predicates
-- ---------------------------------------------------------------------------

-- Same active-only contract as current_user_role(): a pending or suspended
-- external has no client, and everything reading this fails closed.
CREATE OR REPLACE FUNCTION public.current_user_client_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT client_id
    FROM public.users
   WHERE id = (SELECT auth.uid())
     AND status = 'active'
$$;

-- Coalesced, unlike the 046 predicates: this one is read NEGATED inside
-- guard_user_privilege_changes below, where a NULL would make the refusal
-- vacuous exactly for the principals it must refuse — the lesson
-- invariant (11) of manager_desk_invariants.sql taught can_manage_desk().
CREATE OR REPLACE FUNCTION public.is_client_admin()
RETURNS boolean LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT coalesce(public.current_user_role() = 'client_admin', false)
$$;

-- Which organisation a client belongs to, bypassing clients RLS — policies
-- and triggers on other tables need the answer for rows the caller cannot
-- necessarily read.
CREATE OR REPLACE FUNCTION public.client_org(p_client_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id FROM public.clients WHERE id = p_client_id
$$;

REVOKE ALL ON FUNCTION public.current_user_client_id() FROM public, anon;
REVOKE ALL ON FUNCTION public.is_client_admin() FROM public, anon;
REVOKE ALL ON FUNCTION public.client_org(uuid) FROM public, anon;

GRANT EXECUTE ON FUNCTION public.current_user_client_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_client_admin() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.client_org(uuid) TO authenticated, service_role;


-- ---------------------------------------------------------------------------
-- 4. Who can see and administer an external account
-- ---------------------------------------------------------------------------

-- Staff of the owning org read their clients' external roster the way they
-- read client contacts — it is client-relationship data. can_read_org() is
-- staff-only as of section 2, so this policy grants an external nothing.
-- A client_admin reads their own company's roster and no one else's; an
-- hiring_manager or client_hr has no roster — they hold only the 059
-- self-read branch.
DROP POLICY IF EXISTS users_select_client_externals ON public.users;

CREATE POLICY users_select_client_externals ON public.users
  FOR SELECT TO authenticated
  USING (
    client_id IS NOT NULL
    AND (
      ((SELECT public.can_read_org())
        AND public.client_org(client_id) = (SELECT public.current_user_org_id()))
      OR ((SELECT public.is_client_admin())
        AND client_id = (SELECT public.current_user_client_id()))
    )
  );

-- Writes: staff at the clients:share tier (managing who stands in front of
-- the client is the "anything that leaves the building" tier), or the
-- client's own admin. This policy only decides which rows are in reach —
-- the column rules live in the trigger below, because RLS cannot restrict
-- which columns an UPDATE touches (the 046 limitation, third occurrence).
DROP POLICY IF EXISTS users_update_client_externals ON public.users;

CREATE POLICY users_update_client_externals ON public.users
  FOR UPDATE TO authenticated
  USING (
    client_id IS NOT NULL
    AND (
      ((SELECT public.can_share_clients())
        AND public.client_org(client_id) = (SELECT public.current_user_org_id()))
      OR ((SELECT public.is_client_admin())
        AND client_id = (SELECT public.current_user_client_id()))
    )
  )
  WITH CHECK (
    client_id IS NOT NULL
    AND (
      ((SELECT public.can_share_clients())
        AND public.client_org(client_id) = (SELECT public.current_user_org_id()))
      OR ((SELECT public.is_client_admin())
        AND client_id = (SELECT public.current_user_client_id()))
    )
  );


-- ---------------------------------------------------------------------------
-- 5. The privilege guard learns the boundary
-- ---------------------------------------------------------------------------

-- Extends 046's guard_user_privilege_changes. New rules:
--
--   * `client_id` moves only by founder hand, like `organization_id` —
--     moving an external between clients is how you would read another
--     client's slates.
--   * On an external row, a non-founder staff updater may not touch
--     `email` (it mirrors auth.users and nothing in the product edits it).
--     Role changes stay inside the external vocabulary by the XOR CHECK,
--     with no trigger clause to drift.
--   * An external updater must be a client_admin, and may change *only*
--     `status` — suspending and reactivating colleagues is the one
--     people-management act the client side holds (D4). Roles are set by
--     the invitation and changed by staff.
--
-- Deliberately NOT enforced: a last-active-client_admin rule. Unlike an
-- organisation, a client with no admin is not locked out of
-- administration — the recruiting firm is always there (the staff branch
-- above), so the org's last-admin reasoning does not transfer.
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
