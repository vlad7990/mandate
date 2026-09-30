-- §210 — THE ANON SURFACE IS EXACTLY WHAT WE RULED
--
-- Before vulnerability testing, the attack surface has to be a stated fact
-- rather than an inference. Three counts disagreed: the ruled roster said
-- 12, the Supabase linter said 14 SECURITY DEFINER functions callable by
-- `anon`, and a direct count said 15. All three are now reconciled:
--
--   · 14 functions are DELIBERATELY granted to anon — the portal's six
--     token doors, the three load-bearing ones named in 110's comments
--     (limiter / webhook / cron), the apply pair, and the four token
--     verifiers. That is the linter's list, and it is the ruled surface.
--   · The 15th is `relationship_warmth`, which nobody granted to anybody.
--   · The roster's "12" is stale bookkeeping: `check_demo_rate_limit` was
--     granted in 088 and DROPPED in 089, so a text scan of the migrations
--     over-counts by one unless it models drops.
--
-- THE FINDING. Postgres grants EXECUTE on a new function to PUBLIC by
-- default, and `anon` inherits PUBLIC. This codebase has answered that 155
-- times — every function created in a migration is followed by a REVOKE.
-- `relationship_warmth` (143) is the one that was not, so it has been
-- callable at /rest/v1/rpc/relationship_warmth by anybody with the
-- publishable key ever since.
--
-- It leaks NOTHING: `LANGUAGE sql IMMUTABLE`, not SECURITY DEFINER, and its
-- whole body is a CASE over a text literal — it reads no table and takes no
-- id. The cost is not disclosure, it is that the surface a tester enumerates
-- is not the surface we ruled, which makes every finding on it arguable.
--
-- Its four callers are all SECURITY DEFINER functions running as the owner
-- (`merge_network_profiles` and its ancestors), so they are unaffected; the
-- app does not call it over RPC at all — `src/lib/network/merge-people.ts`
-- mirrors it in TypeScript. Same posture as every other pure helper
-- (compare `governing_network_suppression` in 154).
--
-- No new table, no new policy, no new grant, no event type. This migration
-- REMOVES reach and adds nothing.

REVOKE ALL ON FUNCTION public.relationship_warmth(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.relationship_warmth(text)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.relationship_warmth(text) IS
  '§203 — ranks the four relationship temperatures so a merge can keep the warmer one; non-temperatures rank -1. §210: revoked from PUBLIC. It was the only one of 156 functions created in these migrations that never was, which made it the only unruled entry on the anon RPC surface. Pure and data-free, so nothing was disclosed — but the surface a tester enumerates must be the surface we ruled.';
