-- 059 — a suspended account stops reading the member roster.
--
-- Not an advisor finding. Found by the invariants file written for 058: the
-- first version of assertion (5) asserted what everyone assumed, that a
-- suspended account reads only its own row, and it failed against the live
-- database with all five of the organisation's members in hand.
--
-- The cause is a one-word asymmetry between two helpers that read the same
-- table:
--
--     current_user_role()    ... WHERE id = auth.uid() AND status = 'active'
--     current_user_org_id()  ... WHERE id = auth.uid()
--
-- 046 closed the write half of this and said so: "No policy anywhere looked
-- at `status`. A suspended account kept its `organization_id`, so RLS kept
-- accepting its reads and writes; only the dashboard layout's redirect
-- stopped it, and a redirect is not a boundary." The fix was to make
-- `current_user_role()` return NULL for a non-active account, and to route
-- every generated policy through `can_read_org()`, which tests it.
--
-- `public.users` never got that treatment, because its policies predate 046
-- — they come from 002/003 — and they reach for `current_user_org_id()`
-- directly. So every other table in the schema refuses a suspended account
-- and this one, the one holding colleagues' names, emails, roles and
-- account statuses, hands the whole list over. A suspended employee holds
-- their own anon key; the dashboard's sign-out gate does not stop a request
-- to PostgREST.
--
-- What this changes, precisely: the org branch and the founder branch now
-- require an active account. The self branch does not, and must not —
-- /auth/pending reads its own row before it has an organisation, and the
-- suspended sign-in gate reads `status` on the way to signing itself out.
-- Take the self-read away and a suspended user cannot be told why they are
-- being signed out.
--
-- Nothing in the product depended on the old behaviour. Every read of
-- `public.users` on a path a suspended or pending account can reach is a
-- self-read — `.eq("id", user.id)` in the dashboard layout, the sign-in
-- action, and /auth/pending. The roster reads (settings, members, waitlist)
-- are behind gates that a suspended account has already failed.
--
-- Proven by supabase/tests/users_policy_invariants.sql, whose assertion (5)
-- now states the rule rather than the bug, and (5b) covers the suspended
-- founder — `is_current_user_founder()` has the same missing status check,
-- and hoisting `can_read_org()` above the disjunction covers both branches
-- with one conjunct rather than editing a helper the 046 trigger also uses.

DROP POLICY IF EXISTS users_select_self_org_or_founder ON public.users;

CREATE POLICY users_select_self_org_or_founder ON public.users
  FOR SELECT TO authenticated
  USING (
    -- Yourself, always. Survives having no organisation and survives being
    -- suspended, because both of those states have a screen that has to
    -- render before the account is turned away.
    id = (SELECT auth.uid())
    OR (
      -- Everything below this line requires an active account.
      (SELECT public.can_read_org())
      AND (
        -- The platform operator, across every organisation. This is the
        -- waitlist, whose rows belong to no organisation.
        (SELECT public.is_current_user_founder())
        -- Your colleagues. `IS NOT NULL` is load-bearing: without it, two
        -- accounts with no organisation would be able to read each other.
        OR (organization_id IS NOT NULL
            AND organization_id = (SELECT public.current_user_org_id()))
      )
    )
  );

DROP POLICY IF EXISTS users_update_org_admin_or_founder ON public.users;

-- The admin branch was already status-checked — `is_org_admin()` resolves
-- through `current_user_role()`. The founder branch was not: a suspended
-- founder could still write any row in the table. Same conjunct, hoisted
-- above the disjunction so it covers both.
CREATE POLICY users_update_org_admin_or_founder ON public.users
  FOR UPDATE TO authenticated
  USING (
    (SELECT public.can_read_org())
    AND (
      (SELECT public.is_current_user_founder())
      OR (organization_id IS NOT NULL
          AND organization_id = (SELECT public.current_user_org_id())
          AND (SELECT public.is_org_admin()))
    )
  )
  WITH CHECK (
    (SELECT public.can_read_org())
    AND (
      (SELECT public.is_current_user_founder())
      OR (organization_id IS NOT NULL
          AND organization_id = (SELECT public.current_user_org_id())
          AND (SELECT public.is_org_admin()))
    )
  );
