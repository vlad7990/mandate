-- 058 — the Supabase advisor sweep.
--
-- The sweep had not been run since 054. 055 added 68 composite foreign keys
-- and ~84 indexes, 056 two catalogue flags with four keys, 057 one function
-- and 28 triggers. This is the first time any of that has been through the
-- linter. Both reports were read in full; what is *not* here, and why, is
-- recorded in the handoff.
--
-- Four parts, in ascending order of how much they could break:
--
--   1. `search_path` pinned on 24 older Executive Intelligence and sourcing
--      functions.
--   2. EXECUTE revoked from the callable roles on `rls_auto_enable`.
--   3. The `users` policies consolidated — three permissive SELECT policies
--      into one, two UPDATE policies into one — and every helper call
--      wrapped as `(select ...)`.
--   4. Three covering indexes, out of the fifteen the linter asked for.
--
-- Part 3 is the one with teeth, and it is meant to be *exactly*
-- equivalent — no caller can tell the difference. That claim is proven, not
-- asserted: `supabase/tests/users_policy_invariants.sql` was run against
-- the live database before this migration and again after it, and passes
-- identically both times. Nineteen assertions across all four roles, a
-- founder, a suspended account, a pending account, and anon.


-- ---------------------------------------------------------------------------
-- 1. Mutable search_path on the pre-046 functions.
--
--    Every function 046-057 added already carries `SET search_path`; these
--    24 predate the convention. All of them are SECURITY INVOKER, so the
--    exposure is narrower than the linter's generic wording suggests — a
--    caller cannot use this to acquire privileges they do not already have.
--    It is still a real defect: the caller controls name resolution, so a
--    caller with a hostile `search_path` decides which `candidates` table
--    the function writes to.
--
--    Each body was read before the ALTER rather than after. Every table
--    reference in all 24 is already `public.`-qualified; the only
--    cross-schema call is `auth.uid()`, which is qualified too. Everything
--    else they resolve unqualified — now(), clock_timestamp(), set_config(),
--    current_setting(), gen_random_uuid(), jsonb_array_elements(), count() —
--    lives in pg_catalog, which is searched ahead of anything named here.
--    pgcrypto and uuid-ossp are installed into `extensions`, not `public`,
--    so nothing in these bodies resolves through the schema being pinned.
--    That is why `public` is safe as a one-line change and no body needed
--    rewriting to go with it.

-- Job specs.
ALTER FUNCTION public.next_job_spec_version(uuid) SET search_path = public;
ALTER FUNCTION public.finalize_job_spec(uuid, uuid) SET search_path = public;
ALTER FUNCTION public.allocate_and_insert_job_spec(uuid, uuid, text, jsonb, boolean, boolean, uuid) SET search_path = public;

-- Role success profiles.
ALTER FUNCTION public.guard_role_success_profiles() SET search_path = public;
ALTER FUNCTION public.allocate_and_insert_success_profile(uuid, uuid, jsonb, boolean, uuid, text, text) SET search_path = public;
ALTER FUNCTION public.approve_success_profile(uuid, uuid) SET search_path = public;

-- Interview plans.
ALTER FUNCTION public.guard_executive_interview_plans() SET search_path = public;
ALTER FUNCTION public.allocate_and_insert_interview_plan(uuid, uuid, uuid, uuid, jsonb, boolean, uuid, text, text) SET search_path = public;
ALTER FUNCTION public.approve_interview_plan(uuid, uuid, uuid) SET search_path = public;

-- Assessments.
ALTER FUNCTION public.guard_executive_assessments() SET search_path = public;
ALTER FUNCTION public.allocate_and_insert_assessment(uuid, uuid, uuid, uuid, jsonb, uuid) SET search_path = public;
ALTER FUNCTION public.approve_assessment(uuid, uuid, uuid) SET search_path = public;

-- Risk reviews.
ALTER FUNCTION public.guard_executive_risk_reviews() SET search_path = public;
ALTER FUNCTION public.allocate_and_insert_risk_review(uuid, uuid, uuid, uuid, uuid, jsonb, boolean, uuid, text, text) SET search_path = public;
ALTER FUNCTION public.approve_risk_review(uuid, uuid, uuid) SET search_path = public;

-- Sourcing.
ALTER FUNCTION public.guard_sourcing_runs() SET search_path = public;
ALTER FUNCTION public.allocate_and_insert_sourcing_run(uuid, uuid, uuid, text, jsonb, uuid, text, text) SET search_path = public;
ALTER FUNCTION public.mark_sourcing_run_executed(uuid, integer) SET search_path = public;
ALTER FUNCTION public.purge_staged_results_for_candidate() SET search_path = public;
ALTER FUNCTION public.promote_sourcing_results(uuid, jsonb) SET search_path = public;

-- Outreach and Art. 14 notifications.
ALTER FUNCTION public.guard_subject_notified() SET search_path = public;
ALTER FUNCTION public.log_candidate_outreach(uuid, text, text, text, text, boolean, timestamptz) SET search_path = public;
ALTER FUNCTION public.record_notification_sent(uuid, text, text, text, text, text, text, timestamptz) SET search_path = public;
ALTER FUNCTION public.record_notification_failed(uuid, text, text, text, text, text, text) SET search_path = public;


-- ---------------------------------------------------------------------------
-- 2. rls_auto_enable.
--
--    A SECURITY DEFINER function that `anon` may execute. It is the body of
--    the `ensure_rls` event trigger — the standing guard that turns RLS on
--    for any table created in `public`, so that forgetting to enable it is
--    not a way to ship a readable table.
--
--    The exposure is theoretical: it returns the `event_trigger`
--    pseudo-type, so PostgREST will not expose it and Postgres refuses a
--    direct call outright. But the revoke costs nothing and the trigger
--    does not need the grant — EXECUTE is checked when an event trigger is
--    created, not each time it fires, which is the same reasoning 048 used
--    for the ordinary trigger functions. Revoked from `public` as well, so
--    a role added later does not inherit it.
REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM public, anon, authenticated;


-- ---------------------------------------------------------------------------
-- 3. The users policies: five permissive policies down to two.
--
--    The linter raised two things here, and they compound. `auth_rls_initplan`
--    on `users_can_read_self` — `auth.uid()` re-evaluated once per row, which
--    046 had already fixed everywhere else and missed here. And
--    `multiple_permissive_policies` for both SELECT and UPDATE: Postgres
--    evaluates *every* permissive policy on a table and ORs the results, so
--    three SELECT policies meant three predicates per row, each one calling a
--    helper that reads `public.users` again.
--
--    Consolidating is safe for a reason worth writing down rather than
--    trusting: permissive policies are OR'd, and USING and WITH CHECK are
--    OR'd *separately*. A row passes UPDATE if any policy's USING admits it
--    and any policy's WITH CHECK admits the result — not necessarily the
--    same policy for both. So one policy whose USING is the disjunction of
--    the old USINGs, and whose WITH CHECK is the disjunction of the old
--    WITH CHECKs, is exactly the old behaviour and not merely close to it.
--
--    What this migration deliberately does NOT change:
--
--      * The self-read stays. A pending account has no organisation and
--        must still render /auth/pending, which reads its own row.
--      * The founder branch stays unconditional. Reading the waitlist means
--        reading rows that belong to no organisation, and there is no
--        org-scoped predicate that can express that.
--      * There is still no self-UPDATE. Only an org admin and a founder may
--        write this table; a member cannot rename themselves. That was true
--        before and is asserted in the invariants file so that it stays a
--        decision rather than an accident.
--      * `guard_user_privilege_changes` (046) is untouched and remains the
--        only thing standing between an admin and `is_founder`. RLS cannot
--        restrict *which columns* an update touches, so an admin is inside
--        this policy for their own row by design.
--
--    One property that is NOT preserved and was never intended to be: a
--    suspended account still reads its organisation's member list, because
--    `current_user_org_id()` — unlike `current_user_role()` — has no status
--    check. That is a pre-existing gap, it is not this migration's to close,
--    and it is written up in the handoff rather than fixed here so that this
--    migration's equivalence claim stays a clean yes.

DROP POLICY IF EXISTS founders_can_read_all_users ON public.users;
DROP POLICY IF EXISTS users_can_read_self ON public.users;
DROP POLICY IF EXISTS users_see_own_org_users ON public.users;

CREATE POLICY users_select_self_org_or_founder ON public.users
  FOR SELECT TO authenticated
  USING (
    -- Yourself: survives having no organisation, which is what /auth/pending
    -- and the suspended sign-in gate both depend on.
    id = (SELECT auth.uid())
    -- The platform operator, across every organisation. This is the waitlist.
    OR (SELECT public.is_current_user_founder())
    -- Your colleagues. `IS NOT NULL` is load-bearing: without it, two
    -- accounts with no organisation would be able to read each other.
    OR (organization_id IS NOT NULL
        AND organization_id = (SELECT public.current_user_org_id()))
  );

DROP POLICY IF EXISTS admins_can_update_org_users ON public.users;
DROP POLICY IF EXISTS founders_can_update_users ON public.users;

CREATE POLICY users_update_org_admin_or_founder ON public.users
  FOR UPDATE TO authenticated
  USING (
    (SELECT public.is_current_user_founder())
    OR (organization_id IS NOT NULL
        AND organization_id = (SELECT public.current_user_org_id())
        AND (SELECT public.is_org_admin()))
  )
  WITH CHECK (
    (SELECT public.is_current_user_founder())
    OR (organization_id IS NOT NULL
        AND organization_id = (SELECT public.current_user_org_id())
        AND (SELECT public.is_org_admin()))
  );


-- ---------------------------------------------------------------------------
-- 4. Covering indexes — three of the fifteen the linter asked for.
--
--    The honest test for an attribution column is whether deleting the
--    parent is a thing that happens, because that is the only operation the
--    index serves. Eleven of the fifteen findings are `created_by`,
--    `submitted_by` or `generated_by` pointing at `users`. The product has
--    no path that deletes a user — none of the 33 server-action files does,
--    and no query anywhere filters on those columns; they are read by
--    embedding the parent, which is a lookup on `users.id`. They are
--    attribution, and they do not earn an index. The three below do, and
--    each for a reason that is not "the linter said so".

-- Earned twice over. It is the filter behind the members page, settings,
-- and the waitlist — `.eq("organization_id", ...)` — and it is the predicate
-- in the org branch of the SELECT policy above, which now runs on every read
-- of this table. It is also the child side of an ON DELETE CASCADE from
-- `organizations`. 055 excluded `users` from the composite-key sweep for
-- reasons in its own header; that exclusion was about foreign keys, not
-- about leaving the hottest filter column in the schema unindexed.
CREATE INDEX IF NOT EXISTS users_organization_id_idx
  ON public.users (organization_id);

-- ON DELETE CASCADE from `candidates`. Neither of the two indexes that
-- mention `candidate_id` leads with it — `(project_id, candidate_id)` and
-- `(organization_id, candidate_id)` — so the cascade seq-scans. Candidate
-- deletion is the one parent delete this schema genuinely anticipates:
-- `purge_staged_results_for_candidate` is a BEFORE DELETE trigger written
-- for exactly that, and an erasure request is ordinary work for a
-- recruiting product.
CREATE INDEX IF NOT EXISTS candidate_scores_candidate_id_idx
  ON public.candidate_scores (candidate_id);

-- Same parent, worse: this key is NO ACTION, so deleting a candidate does
-- not merely cascade, it must prove no feedback references them — a full
-- scan on every attempt, and a blocked delete at the end of it. `feedback`
-- and `candidate_scores` will be the two largest tables in the schema.
CREATE INDEX IF NOT EXISTS feedback_candidate_id_idx
  ON public.feedback (candidate_id);


-- ---------------------------------------------------------------------------
-- The migration checks its own first part. If a function in `public` still
-- has a mutable search_path after this runs, either an ALTER above is
-- missing a signature or something new arrived that this sweep did not see.
-- Either way it should stop here rather than show up in the next report.
DO $verify$
DECLARE
  v_missing text;
BEGIN
  SELECT string_agg(p.proname, ', ' ORDER BY p.proname) INTO v_missing
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND (p.proconfig IS NULL
          OR NOT EXISTS (SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path%'));

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION '058: functions still have a mutable search_path: %', v_missing;
  END IF;
END
$verify$;
