-- 060 — a suspended founder stops reading and triaging the waitlist.
--
-- The sweep 059 implied. 059 fixed `users`; the obvious next question was
-- whether anything else had the same shape, so every policy in the database
-- was enumerated and classified by whether *anything* in it consults
-- `status`.
--
-- The answer is narrow and worth writing down, because it says where to
-- look next time rather than just what was fixed:
--
--   * All 39 tables in `public` have RLS enabled. None has zero policies.
--   * Every policy that scopes by `current_user_org_id()` is conjoined with
--     a helper that resolves through `current_user_role()` — `can_read_org`,
--     `can_write_candidates`, `can_write_mandates`, `can_share_clients`,
--     `can_read_fees`, `is_org_admin` — all of which require
--     `status = 'active'`. 046's generated sweep did its job completely.
--   * Every OR-branch is *inside* one of those conjuncts, including the two
--     that looked most likely to escape: the global-catalogue disjunction on
--     `executive_competencies` / `executive_role_templates` (056), and the
--     own-placement fee exception on `placement_fees` /
--     `placement_fee_lines` (050). The latter deserves a note:
--     `is_placement_credited()` itself has no status check, but it is
--     SECURITY INVOKER over `placements`, whose SELECT policy *is*
--     status-checked — so a suspended owner cannot see the placement to be
--     credited on it. Gated transitively, not directly. §5f said as much
--     about cross-org authors; it holds for status too.
--   * The four `cvs` storage policies (047) are status-checked.
--   * The one view, `sourcing_candidate_attribution`, is
--     `security_invoker = true`, so it does not launder RLS.
--   * `record_activity_event` is SECURITY DEFINER and so bypasses RLS by
--     construction — but it already returns early unless `can_read_org()`
--     is true. It was written after 046 and got this right.
--
-- Which leaves `waitlist`, and only `waitlist`. Both hand-written
-- founder-scoped policies from 030:
--
--     EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.is_founder)
--
-- No status, and — the reason the earlier sweeps missed it — no
-- `current_user_org_id()` and no capability helper either, so it matches
-- none of the patterns anyone has grepped for. `users` and `waitlist` are
-- the only two tables scoped by founder or by self rather than by
-- organisation, which is precisely why they are the two 046 did not
-- generate and the two that carried this bug.
--
-- The waitlist is every person who has ever asked for access to Mandate:
-- name, email, company, and their written use case. It is the company's own
-- inbound pipeline, and a suspended founder could read all of it and triage
-- it — approve, reject, annotate.
--
-- Two changes, not one:
--
--   1. `can_read_org()` added, which is the status gate.
--   2. The inline EXISTS replaced with `is_current_user_founder()`. This is
--      not tidying. The old predicate read `public.users` as the calling
--      user, so it was subject to the `users` SELECT policy — meaning the
--      waitlist's meaning depended on the users policy, and 059 changed
--      that policy. Two tables whose access rules are coupled through an
--      implicit RLS dependency is how one gets fixed and the other silently
--      does not. The helper is SECURITY DEFINER and breaks the coupling.
--
-- Also, incidentally, a performance fix of the kind 058 was doing: the
-- inline EXISTS was a correlated subquery over an RLS'd table evaluated per
-- row. It is now two InitPlans.
--
-- Proven by supabase/tests/suspended_account_invariants.sql, which loops
-- every RLS-enabled table in `public` rather than naming them — so the next
-- table with this bug is caught without anyone remembering to add it.
-- Assertions (8) and (9) pin the direction that must keep working: an
-- active founder still reads and still triages.

DROP POLICY IF EXISTS waitlist_founder_select ON public.waitlist;

CREATE POLICY waitlist_founder_select ON public.waitlist
  FOR SELECT TO authenticated
  USING (
    (SELECT public.can_read_org())
    AND (SELECT public.is_current_user_founder())
  );

DROP POLICY IF EXISTS waitlist_founder_update ON public.waitlist;

CREATE POLICY waitlist_founder_update ON public.waitlist
  FOR UPDATE TO authenticated
  USING (
    (SELECT public.can_read_org())
    AND (SELECT public.is_current_user_founder())
  )
  WITH CHECK (
    (SELECT public.can_read_org())
    AND (SELECT public.is_current_user_founder())
  );

-- `waitlist_anon_insert` is deliberately untouched: WITH CHECK (true) TO
-- anon, authenticated is the public /request-access form, and 030's header
-- explains why it grants INSERT and never SELECT. A suspended account can
-- still submit a request, which is exactly what a signed-out stranger can
-- do — no privilege is gained by holding a dead session. The open insert is
-- a rate-limiting problem, and it is already on the pre-launch checklist as
-- one.
