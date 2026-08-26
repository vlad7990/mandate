-- 121 — the 120 guards join the 110 grants-pass doctrine (found by the
-- post-DDL advisor sweep in drive 107, same gate as 120).
--
-- Postgres grants EXECUTE to PUBLIC on every new function; 120's two
-- trigger guards therefore surfaced as anon/authenticated-executable
-- SECURITY DEFINER RPCs via PostgREST. A trigger function has no
-- caller — the trigger machinery invokes it as the table owner — so
-- the full revoke costs nothing and closes the door, exactly as 110
-- did for the seven trigger functions it swept. service_role is
-- untouched on principle (110), though it too never calls these.

REVOKE ALL ON FUNCTION public.guard_provider_model_status() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_assignment_active_model() FROM public, anon, authenticated;
