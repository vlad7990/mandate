-- 089 — the demo wrapper retires (§62's confirmed verdict).
--
-- 088 kept `check_demo_rate_limit` as a thin wrapper so the deployed
-- /api/demo route kept working mid-rollout, and left 061's
-- `demo_rate_limit` table in place with nothing writing to it. That
-- release has settled: the route now calls the shared helper
-- (`limitClosed("demo_ip", ip)` → `check_rate_limit`), so both the
-- wrapper and the orphaned table go. The `demo_ip` policy row and its
-- numbers (10/hr/IP, 200/day) are untouched — the caps were never the
-- wrapper's; they are 088's data.

DROP FUNCTION IF EXISTS public.check_demo_rate_limit(text);
DROP TABLE IF EXISTS public.demo_rate_limit;
