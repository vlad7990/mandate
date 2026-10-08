-- 165 — CLOSE THE AI COST FUNCTIONS TO ANON
--
-- Applied 2026-10-08, minutes after 164, on the same authorisation. This is
-- 164's own defect, found by the advisor sweep CLAUDE.md requires after a
-- migration that adds tables or functions.
--
-- ## What 164 got wrong
--
-- It wrote `REVOKE ALL ON FUNCTION … FROM PUBLIC` on all four of its functions
-- and nothing else. That is not enough on this database. Supabase's
-- ALTER DEFAULT PRIVILEGES grants EXECUTE to `anon` and `authenticated` on
-- every new function in `public` as an EXPLICIT role grant, and revoking from
-- PUBLIC does not touch an explicit grant. Read from pg_proc.proacl after 164:
--
--     ai_budget_verdict → postgres=X  anon=X  authenticated=X  service_role=X
--
-- So `/rest/v1/rpc/ai_budget_verdict` was callable by anyone holding the
-- publishable key, and it returns the platform's GLOBAL 30-day AI spend,
-- thresholds included. 164's own comments argued two functions earlier that a
-- global spend figure must not be reachable by a session — and then shipped it
-- to anon in the same file. Open for the minutes between the two migrations.
--
-- `ai_spend_by_model` and `ai_budget_policy_row` were NOT a disclosure: both
-- RAISE unless `is_current_user_founder()`, which is false for anon. They had
-- no business on the anon surface 158/159 closed, so they are revoked too.
-- `ai_run_cost_usd` is pure arithmetic over its arguments and discloses
-- nothing, but an anon-callable RPC is a free compute endpoint.
--
-- ## Why the §210 tripwire did not catch it
--
-- `src/lib/security/anon-surface.test.ts` folds the migrations and treats a
-- revoke naming EITHER `PUBLIC` or `anon` as closing the door, because its
-- header states that "`anon` inherits PUBLIC". On this database that premise is
-- only half true — anon also holds its own grant — so `FROM PUBLIC` alone
-- satisfied the test while the ACL stayed open.
--
-- Of every function created across 155+ migrations, exactly four were never
-- revoked FROM anon, and all four are 164's. The house convention was already
-- right: 134 writes two lines for claim_evaluation, `FROM PUBLIC` then
-- `FROM anon`. This migration restores that convention, and the same commit
-- tightens the tripwire to require the `anon` revoke so the next omission fails
-- the suite instead of the sweep.

REVOKE EXECUTE ON FUNCTION public.ai_run_cost_usd(
  integer, integer, integer, integer, numeric, numeric
) FROM anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.ai_spend_by_model(integer) FROM anon;

REVOKE EXECUTE ON FUNCTION public.ai_budget_policy_row() FROM anon;

-- service_role ONLY. The inference seam is the only caller, and a global spend
-- figure must not be reachable by any session, signed in or not.
REVOKE EXECUTE ON FUNCTION public.ai_budget_verdict() FROM anon, authenticated;

-- Verified after applying, from pg_proc.proacl:
--   ai_budget_verdict  → postgres=X  service_role=X
--   ai_run_cost_usd    → postgres=X  service_role=X
--   ai_spend_by_model  → postgres=X  authenticated=X  service_role=X
--   ai_budget_policy_row → postgres=X  authenticated=X  service_role=X
-- and the live anon EXECUTE surface is exactly the 12 ruled functions.
