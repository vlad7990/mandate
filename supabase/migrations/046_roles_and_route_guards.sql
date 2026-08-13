-- Roles: give public.users.role a meaning.
--
-- The column has existed since 001 with a default of 'recruiter', and the
-- signup trigger in 002 has been writing 'admin' or 'recruiter' into it
-- ever since. Nothing compared it against anything. Authorization was
-- `is_founder`, `status`, and org-scoped RLS — which means every member of
-- an organization had identical power over every row in it.
--
-- Four roles, mirrored in src/lib/auth/roles.ts:
--
--   admin       everything, plus org settings, member roles, skills studio
--   recruiter   mandates end to end — sourcing, evaluation, shortlists,
--               client exports, outreach
--   researcher  sourcing and evaluation only. Cannot open a mandate,
--               publish a shortlist, or contact a candidate
--   viewer      read-only. Writes nothing anywhere
--
-- `is_founder` stays orthogonal: it is the platform-operator flag that
-- gates Mandate's own waitlist and cross-org administration, not a tier of
-- customer role.
--
-- ## Why this migration is large
--
-- Every domain table carried a single `FOR ALL` policy whose only test was
-- the organization. A `FOR ALL` policy cannot distinguish a read from a
-- write, so role enforcement is impossible without splitting each one into
-- SELECT and per-command write policies. That is 24 tables × 4 policies,
-- generated in a loop from an explicit table→tier map, plus seven tables
-- whose policies are not uniform and are written out by hand below.
--
-- ## Why RLS and not just the app
--
-- A signed-in user holds their own anon key and session cookie, so
-- PostgREST is reachable from a browser console. Route guards and server
-- action checks describe the product; this file is the boundary.
--
-- ## Second thing this fixes
--
-- The old policies never looked at `status`. A suspended user kept their
-- `organization_id`, so RLS kept letting them read and write — only the
-- dashboard layout's redirect stopped them, and that is not a boundary
-- either. `current_user_role()` below returns NULL unless the account is
-- active, and every policy here requires a non-null role.


-- ---------------------------------------------------------------------------
-- 1. Constrain the column
-- ---------------------------------------------------------------------------

-- Anything outside the vocabulary — including NULL, which the column
-- allowed — resolves to the least privilege, not the most. A role nobody
-- can read is not a reason to grant write access. This affects zero rows
-- today: the single account in the table is a valid 'admin'.
UPDATE public.users
   SET role = 'viewer'
 WHERE role IS NULL
    OR role NOT IN ('admin', 'recruiter', 'researcher', 'viewer');

-- The column default changes from 'recruiter' to 'viewer' for the same
-- reason the signup trigger does in section 5 — an account that arrives
-- without a stated role should not arrive able to write.
ALTER TABLE public.users
  ALTER COLUMN role SET DEFAULT 'viewer',
  ALTER COLUMN role SET NOT NULL;

ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_role_check;

ALTER TABLE public.users
  ADD CONSTRAINT users_role_check
  CHECK (role IN ('admin', 'recruiter', 'researcher', 'viewer'));


-- ---------------------------------------------------------------------------
-- 2. Predicates
-- ---------------------------------------------------------------------------

-- SECURITY DEFINER for the same reason `is_current_user_founder` is: a
-- policy on public.users that reads public.users recurses otherwise.
--
-- The `status = 'active'` test is inside the function, not at the call
-- sites, so that a pending or suspended account has no role at all and
-- every capability predicate below fails for them without each policy
-- having to remember.
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role
    FROM public.users
   WHERE id = (SELECT auth.uid())
     AND status = 'active'
$$;

REVOKE ALL ON FUNCTION public.current_user_role() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated, service_role;

-- The capability tiers, as predicates rather than inline role lists, so a
-- change of policy is one function and not a hundred `IN (...)` clauses.
-- Names match the capabilities in src/lib/auth/roles.ts.

CREATE OR REPLACE FUNCTION public.can_read_org()
RETURNS boolean LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT public.current_user_role() IS NOT NULL
$$;

CREATE OR REPLACE FUNCTION public.can_write_candidates()
RETURNS boolean LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT public.current_user_role() IN ('admin', 'recruiter', 'researcher')
$$;

CREATE OR REPLACE FUNCTION public.can_write_mandates()
RETURNS boolean LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT public.current_user_role() IN ('admin', 'recruiter')
$$;

CREATE OR REPLACE FUNCTION public.can_share_clients()
RETURNS boolean LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT public.current_user_role() IN ('admin', 'recruiter')
$$;

CREATE OR REPLACE FUNCTION public.is_org_admin()
RETURNS boolean LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT public.current_user_role() = 'admin'
$$;

REVOKE ALL ON FUNCTION public.can_read_org() FROM public, anon;
REVOKE ALL ON FUNCTION public.can_write_candidates() FROM public, anon;
REVOKE ALL ON FUNCTION public.can_write_mandates() FROM public, anon;
REVOKE ALL ON FUNCTION public.can_share_clients() FROM public, anon;
REVOKE ALL ON FUNCTION public.is_org_admin() FROM public, anon;

GRANT EXECUTE ON FUNCTION public.can_read_org() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_write_candidates() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_write_mandates() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_share_clients() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_org_admin() TO authenticated, service_role;


-- ---------------------------------------------------------------------------
-- 3. The uniform domain tables
-- ---------------------------------------------------------------------------
--
-- Every table below is org-scoped on a nullable-or-not `organization_id`,
-- allows the full CRUD set, and belongs to exactly one write tier. The loop
-- drops whatever policy the table currently has and writes four.
--
-- The read policy is the same for all four roles: if you are in the org and
-- your account is active, you can read it. The product is a shared
-- workspace and a viewer exists precisely to read. The tier only governs
-- writes.
--
-- Every predicate call is wrapped in `(SELECT ...)` so the planner hoists it
-- to an InitPlan and evaluates it once per statement rather than once per
-- row — the same trick migration 004 applied to `auth.uid()`.

DO $do$
DECLARE
  v_tables text[];
  v_tier   text;
  v_table  text;
  v_pol    record;
  v_org    text := 'organization_id IS NOT NULL AND organization_id = (SELECT public.current_user_org_id())';
BEGIN
  FOR v_tier, v_tables IN
    SELECT * FROM (VALUES
      -- Sourcing and screening. A researcher's whole job.
      ('can_write_candidates', ARRAY[
        'candidates',
        'candidate_notes',
        'candidate_scores',
        'sourcing_runs',
        'sourcing_run_results',
        'sourcing_run_candidates'
      ]),
      -- Opening and shaping a search. Recruiter and above.
      ('can_write_mandates', ARRAY[
        'projects',
        'job_specs',
        'boolean_queries',
        'feedback',
        'role_success_profiles',
        'executive_searches',
        'executive_search_candidates',
        'executive_search_competencies',
        'executive_assessments',
        'executive_interview_plans',
        'executive_risk_reviews'
      ]),
      -- Anything that leaves the building.
      ('can_share_clients', ARRAY[
        'shortlists',
        'hiring_manager_tokens',
        'hiring_manager_reviews',
        'project_reports',
        'candidate_outreach',
        'candidate_notifications'
      ]),
      -- A skill rewrites how every candidate in the org is scored.
      ('is_org_admin', ARRAY[
        'skills'
      ])
    ) AS t(tier, tables)
  LOOP
    FOREACH v_table IN ARRAY v_tables LOOP
      -- Drop by introspection rather than by name: the existing policies
      -- were named inconsistently across fifteen migrations, and a
      -- `DROP POLICY IF EXISTS` on a guessed name silently leaves the real
      -- one in place, where it would OR with the new ones and grant back
      -- everything this migration takes away.
      FOR v_pol IN
        SELECT polname FROM pg_policy WHERE polrelid = format('public.%I', v_table)::regclass
      LOOP
        EXECUTE format('DROP POLICY %I ON public.%I', v_pol.polname, v_table);
      END LOOP;

      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (%s AND (SELECT public.can_read_org()))',
        v_table || '_role_select', v_table, v_org);

      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (%s AND (SELECT public.%I()))',
        v_table || '_role_insert', v_table, v_org, v_tier);

      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (%s AND (SELECT public.%I())) WITH CHECK (%s AND (SELECT public.%I()))',
        v_table || '_role_update', v_table, v_org, v_tier, v_org, v_tier);

      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (%s AND (SELECT public.%I()))',
        v_table || '_role_delete', v_table, v_org, v_tier);
    END LOOP;
  END LOOP;
END
$do$;


-- ---------------------------------------------------------------------------
-- 4. The tables that are not uniform
-- ---------------------------------------------------------------------------

-- 4a. calibration_history — append-only by design (029). It records what the
--     calibration model looked like at each point, so an UPDATE or DELETE
--     policy would be a way to rewrite history. There is deliberately
--     neither. Insert follows the mandate tier, because calibrating is a
--     mandate act.
DROP POLICY IF EXISTS calibration_history_org_select ON public.calibration_history;
DROP POLICY IF EXISTS calibration_history_org_insert ON public.calibration_history;

CREATE POLICY calibration_history_role_select ON public.calibration_history
  FOR SELECT TO authenticated
  USING (organization_id = (SELECT public.current_user_org_id())
         AND (SELECT public.can_read_org()));

CREATE POLICY calibration_history_role_insert ON public.calibration_history
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = (SELECT public.current_user_org_id())
              AND (SELECT public.can_write_mandates()));


-- 4b. executive_audit_events — append-only, and the actor must be the caller
--     (032). Insert sits at the mandate tier because every audited action in
--     the EI module is itself a mandate-tier write; a tier that could not
--     perform the action has no audit row to file.
DROP POLICY IF EXISTS exec_audit_select ON public.executive_audit_events;
DROP POLICY IF EXISTS exec_audit_insert ON public.executive_audit_events;

CREATE POLICY exec_audit_role_select ON public.executive_audit_events
  FOR SELECT TO authenticated
  USING (organization_id IS NOT NULL
         AND organization_id = (SELECT public.current_user_org_id())
         AND (SELECT public.can_read_org()));

CREATE POLICY exec_audit_role_insert ON public.executive_audit_events
  FOR INSERT TO authenticated
  WITH CHECK (organization_id IS NOT NULL
              AND organization_id = (SELECT public.current_user_org_id())
              AND actor_id = (SELECT auth.uid())
              AND (SELECT public.can_write_mandates()));


-- 4c/d. executive_competencies and executive_role_templates — rows with a
--       NULL organization_id are the seeded global library (033), readable by
--       every org and writable by none. Org-owned rows are the customer's own
--       additions, and authoring them changes how every executive search
--       scores, so they sit with the admin alongside skills.
DROP POLICY IF EXISTS exec_competencies_select ON public.executive_competencies;
DROP POLICY IF EXISTS exec_competencies_write ON public.executive_competencies;

CREATE POLICY exec_competencies_role_select ON public.executive_competencies
  FOR SELECT TO authenticated
  USING ((organization_id IS NULL OR organization_id = (SELECT public.current_user_org_id()))
         AND (SELECT public.can_read_org()));

CREATE POLICY exec_competencies_role_insert ON public.executive_competencies
  FOR INSERT TO authenticated
  WITH CHECK (organization_id IS NOT NULL
              AND organization_id = (SELECT public.current_user_org_id())
              AND (SELECT public.is_org_admin()));

CREATE POLICY exec_competencies_role_update ON public.executive_competencies
  FOR UPDATE TO authenticated
  USING (organization_id IS NOT NULL
         AND organization_id = (SELECT public.current_user_org_id())
         AND (SELECT public.is_org_admin()))
  WITH CHECK (organization_id IS NOT NULL
              AND organization_id = (SELECT public.current_user_org_id())
              AND (SELECT public.is_org_admin()));

CREATE POLICY exec_competencies_role_delete ON public.executive_competencies
  FOR DELETE TO authenticated
  USING (organization_id IS NOT NULL
         AND organization_id = (SELECT public.current_user_org_id())
         AND (SELECT public.is_org_admin()));

DROP POLICY IF EXISTS exec_templates_select ON public.executive_role_templates;
DROP POLICY IF EXISTS exec_templates_write ON public.executive_role_templates;

CREATE POLICY exec_templates_role_select ON public.executive_role_templates
  FOR SELECT TO authenticated
  USING ((organization_id IS NULL OR organization_id = (SELECT public.current_user_org_id()))
         AND (SELECT public.can_read_org()));

CREATE POLICY exec_templates_role_insert ON public.executive_role_templates
  FOR INSERT TO authenticated
  WITH CHECK (organization_id IS NOT NULL
              AND organization_id = (SELECT public.current_user_org_id())
              AND (SELECT public.is_org_admin()));

CREATE POLICY exec_templates_role_update ON public.executive_role_templates
  FOR UPDATE TO authenticated
  USING (organization_id IS NOT NULL
         AND organization_id = (SELECT public.current_user_org_id())
         AND (SELECT public.is_org_admin()))
  WITH CHECK (organization_id IS NOT NULL
              AND organization_id = (SELECT public.current_user_org_id())
              AND (SELECT public.is_org_admin()));

CREATE POLICY exec_templates_role_delete ON public.executive_role_templates
  FOR DELETE TO authenticated
  USING (organization_id IS NOT NULL
         AND organization_id = (SELECT public.current_user_org_id())
         AND (SELECT public.is_org_admin()));


-- 4e. organizations — keyed on `id`, not `organization_id`. The previous
--     `FOR ALL` policy let any member rename the organization. Reading stays
--     open to the org; renaming is an admin act. There is no INSERT or DELETE
--     policy because orgs are created by the SECURITY DEFINER signup trigger,
--     which bypasses RLS, and are never deleted from the product.
DROP POLICY IF EXISTS users_see_own_org ON public.organizations;

CREATE POLICY organizations_role_select ON public.organizations
  FOR SELECT TO authenticated
  USING (id = (SELECT public.current_user_org_id())
         AND (SELECT public.can_read_org()));

CREATE POLICY organizations_role_update ON public.organizations
  FOR UPDATE TO authenticated
  USING (id = (SELECT public.current_user_org_id()) AND (SELECT public.is_org_admin()))
  WITH CHECK (id = (SELECT public.current_user_org_id()) AND (SELECT public.is_org_admin()));


-- 4f. users — the four existing policies stay as they are (read self, read
--     org colleagues, founder reads all, founder updates all). What is new is
--     that an org admin can administer their own org's members without being
--     a Mandate founder, which is what makes the role assignable by a
--     customer rather than only by us.
--
--     RLS cannot restrict *which columns* an update touches, so the policy
--     alone would let an admin set `is_founder = true` on themselves. The
--     trigger in 4g is the actual guard; this policy only decides which rows
--     are in reach.
DROP POLICY IF EXISTS admins_can_update_org_users ON public.users;

CREATE POLICY admins_can_update_org_users ON public.users
  FOR UPDATE TO authenticated
  USING (organization_id IS NOT NULL
         AND organization_id = (SELECT public.current_user_org_id())
         AND (SELECT public.is_org_admin()))
  WITH CHECK (organization_id IS NOT NULL
              AND organization_id = (SELECT public.current_user_org_id())
              AND (SELECT public.is_org_admin()));


-- 4g. The privilege-escalation guard on public.users.
--
--     Three things a non-founder must not be able to do, none of which RLS
--     can express:
--
--       * grant themselves `is_founder`, which would hand them the waitlist
--         and every other org's user list;
--       * move a row to another organization, which is how you would read
--         another customer's data — set your own org_id and every org-scoped
--         policy in this file follows you there;
--       * leave the organization with no admin, which locks member
--         administration out of the product with no in-app way back.
--
--     Runs as SECURITY DEFINER so the last-admin count is not itself
--     filtered by the RLS policies above.
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

DROP TRIGGER IF EXISTS guard_user_privilege_changes ON public.users;
CREATE TRIGGER guard_user_privilege_changes
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.guard_user_privilege_changes();


-- ---------------------------------------------------------------------------
-- 5. New members join as viewers, not recruiters
-- ---------------------------------------------------------------------------
--
-- `handle_new_auth_user` (002) writes 'recruiter' for every non-founder
-- signup. That was harmless while the column meant nothing. Now it means a
-- stranger who signs up and is later approved lands with the power to open
-- mandates and export to clients. The safe default for an unknown account is
-- the role that can do nothing, and an admin promotes them deliberately.
--
-- Founders still get 'admin' and their own active Mandate HQ org, unchanged.
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_founder_emails text[] := ARRAY[
    'vbreygin@gmail.com',
    'v.breygin7990@gmail.com',
    'filmreecon@gmail.com'
  ];
  v_is_founder boolean;
  v_org_id uuid;
  v_role text;
  v_status text;
  v_full_name text;
BEGIN
  v_is_founder := lower(NEW.email) = ANY(v_founder_emails);
  v_full_name := NULLIF(NEW.raw_user_meta_data->>'full_name', '');

  IF v_is_founder THEN
    SELECT id INTO v_org_id FROM public.organizations WHERE slug = 'mandate-hq';
    IF v_org_id IS NULL THEN
      INSERT INTO public.organizations (name, slug)
      VALUES ('Mandate HQ', 'mandate-hq')
      RETURNING id INTO v_org_id;
    END IF;
    v_role   := 'admin';
    v_status := 'active';
  ELSE
    v_org_id := NULL;
    v_role   := 'viewer';
    v_status := 'pending';
  END IF;

  INSERT INTO public.users (id, email, full_name, organization_id, role, is_founder, status)
  VALUES (NEW.id, NEW.email, v_full_name, v_org_id, v_role, v_is_founder, v_status);

  RETURN NEW;
END;
$$;
