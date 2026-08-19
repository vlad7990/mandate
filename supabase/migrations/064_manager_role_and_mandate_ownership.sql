-- The manager role, and mandate ownership.
--
-- Second persona programme (Recruiting Manager; plan in
-- docs/handoffs/NEXT-recruiting-manager.md, decisions D1–D4 confirmed by
-- the founder 2026-08-19). Two things change:
--
--   * A fifth role, `manager` — the person who runs the desk. Same writes
--     as a recruiter, plus the desk oversight surfaces and the one
--     management action (reassigning a mandate), minus org settings and
--     member administration. This is the roles.ts "coinciding
--     capabilities diverge" case arriving on schedule: a firm wants
--     someone who sees the whole desk and the money without being able to
--     suspend accounts.
--
--   * `projects.lead_recruiter_id` — whose mandate is this. `created_by`
--     is authorship and stays what it is; the lead is an assignment that
--     can move. Nullable on purpose: an unassigned mandate is a real
--     state the desk must surface, not an error.
--
-- ## Why the diff is small
--
-- 046 put the role lists inside predicate functions precisely so a new
-- role is "one function and not a hundred IN (...) clauses". Every
-- role-tiered policy in the product reads those predicates, so extending
-- the predicates extends all of them at once. The only hand-written parts
-- are the ownership column and its guards.
--
-- ## Why a trigger and not a composite FK for the lead
--
-- Same reasoning as 057: a composite (organization_id, lead_recruiter_id)
-- FK would break the two operations the author check deliberately
-- preserves — moving a member between organisations and clearing a
-- departed member's org. The in-org rule rides the existing
-- `guard_author_in_org` trigger (re-attached below with both columns);
-- the who-may-change-it and capable-role rules live in their own guard,
-- because RLS cannot restrict which columns an UPDATE touches — the same
-- limitation that produced `guard_user_privilege_changes` in 046.


-- ---------------------------------------------------------------------------
-- 1. The role joins the vocabulary
-- ---------------------------------------------------------------------------

ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_role_check;

ALTER TABLE public.users
  ADD CONSTRAINT users_role_check
  CHECK (role IN ('admin', 'manager', 'recruiter', 'researcher', 'viewer'));

-- The signup trigger keeps writing 'viewer'; a manager is promoted from
-- the members screen like every other role. Nothing to change there.


-- ---------------------------------------------------------------------------
-- 2. The predicates learn about it
-- ---------------------------------------------------------------------------

-- A manager writes what a recruiter writes. The desk is additive.

CREATE OR REPLACE FUNCTION public.can_write_candidates()
RETURNS boolean LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT public.current_user_role() IN ('admin', 'manager', 'recruiter', 'researcher')
$$;

CREATE OR REPLACE FUNCTION public.can_write_mandates()
RETURNS boolean LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT public.current_user_role() IN ('admin', 'manager', 'recruiter')
$$;

CREATE OR REPLACE FUNCTION public.can_share_clients()
RETURNS boolean LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT public.current_user_role() IN ('admin', 'manager', 'recruiter')
$$;

CREATE OR REPLACE FUNCTION public.can_read_fees()
RETURNS boolean LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT public.current_user_role() IN ('admin', 'manager', 'recruiter')
$$;

-- The desk: cross-recruiter oversight and reassignment. Admin holds it for
-- the same reason admin holds everything; `is_org_admin()` stays admin-only
-- because member administration is exactly what a manager does not get.
--
-- Coalesced, unlike the 046 predicates, and the difference is load-bearing:
-- those are only read by RLS, which treats a NULL predicate as false. This
-- one is also read NEGATED by `guard_lead_recruiter_changes` below, and
-- `NOT NULL` is NULL — an IF that silently does not fire. For a suspended
-- account `current_user_role()` is NULL, so without the coalesce the
-- trigger's refusal is vacuous exactly for the principals it must refuse.
-- Found by invariant (11) of manager_desk_invariants.sql on its first run.
CREATE OR REPLACE FUNCTION public.can_manage_desk()
RETURNS boolean LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT coalesce(public.current_user_role() IN ('admin', 'manager'), false)
$$;

REVOKE ALL ON FUNCTION public.can_manage_desk() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_desk() TO authenticated, service_role;


-- ---------------------------------------------------------------------------
-- 3. Mandate ownership
-- ---------------------------------------------------------------------------

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS lead_recruiter_id uuid REFERENCES public.users(id);

-- The desk groups by it on every load; the FK also wants the index the
-- advisor would otherwise flag.
CREATE INDEX IF NOT EXISTS idx_projects_lead_recruiter
  ON public.projects (organization_id, lead_recruiter_id);

-- In-org enforcement rides the author trigger: both attribution columns,
-- one mechanism, one set of invariants (057's file already proves the
-- member-move and departed-author operations survive).
DROP TRIGGER IF EXISTS projects_author_in_org ON public.projects;
CREATE TRIGGER projects_author_in_org BEFORE INSERT OR UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.guard_author_in_org('created_by', 'lead_recruiter_id');


-- ---------------------------------------------------------------------------
-- 4. Who may assign, and to whom
-- ---------------------------------------------------------------------------

-- Two rules RLS cannot express:
--
--   * Reassignment is the manager's action (D3). A recruiter holds
--     mandates:write and could otherwise hand their mandate to a colleague
--     by editing the row — the column-level restriction needs a trigger,
--     exactly like `guard_user_privilege_changes`.
--   * The lead must be someone who can actually run a mandate: an active
--     member holding admin, manager or recruiter. Assigning a viewer is a
--     desk that lies about who is working.
--
-- On INSERT the creator may claim themselves (the ordinary "I opened this
-- mandate" path) without holding the desk capability; claiming someone
-- else at creation is the same act as reassignment and takes the same
-- capability.
CREATE OR REPLACE FUNCTION public.guard_lead_recruiter_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead_role   text;
  v_lead_status text;
BEGIN
  -- No JWT: service-role paths and definer functions. Trusted, as in 046.
  IF (SELECT auth.uid()) IS NULL THEN
    RETURN NEW;
  END IF;

  IF public.is_current_user_founder() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.lead_recruiter_id IS NOT DISTINCT FROM OLD.lead_recruiter_id THEN
    RETURN NEW;
  END IF;

  -- Clearing the lead (to unassigned) is also a management act.
  IF TG_OP = 'UPDATE' AND NOT public.can_manage_desk() THEN
    RAISE EXCEPTION 'only a manager or admin can reassign a mandate'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF TG_OP = 'INSERT'
     AND NEW.lead_recruiter_id IS NOT NULL
     AND NEW.lead_recruiter_id <> (SELECT auth.uid())
     AND NOT public.can_manage_desk() THEN
    RAISE EXCEPTION 'only a manager or admin can assign a mandate to someone else'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NEW.lead_recruiter_id IS NOT NULL THEN
    SELECT u.role, u.status INTO v_lead_role, v_lead_status
      FROM public.users u
     WHERE u.id = NEW.lead_recruiter_id;

    -- Membership/org agreement is guard_author_in_org's job; this one only
    -- asks whether the person can carry the mandate.
    IF v_lead_role IS NOT NULL
       AND (v_lead_status <> 'active'
            OR v_lead_role NOT IN ('admin', 'manager', 'recruiter')) THEN
      RAISE EXCEPTION 'the lead recruiter must be an active admin, manager or recruiter'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_lead_recruiter_changes() FROM public, anon;

DROP TRIGGER IF EXISTS guard_lead_recruiter_changes ON public.projects;
CREATE TRIGGER guard_lead_recruiter_changes
  BEFORE INSERT OR UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.guard_lead_recruiter_changes();


-- ---------------------------------------------------------------------------
-- 5. Backfill: authorship becomes ownership where it still makes sense
-- ---------------------------------------------------------------------------

-- Only where the creator is an active member of the same organisation in a
-- role that can carry a mandate. Everything else stays NULL — the desk
-- shows those as unassigned, which is the truth.
UPDATE public.projects p
   SET lead_recruiter_id = p.created_by
  FROM public.users u
 WHERE p.lead_recruiter_id IS NULL
   AND u.id = p.created_by
   AND u.organization_id = p.organization_id
   AND u.status = 'active'
   AND u.role IN ('admin', 'manager', 'recruiter');
