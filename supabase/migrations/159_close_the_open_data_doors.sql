-- §211 — CLOSE THE OPEN DATA DOORS
--
-- Gate: docs/superpowers/specs/2026-09-30-close-the-open-data-doors-gate.md
-- Rulings: D1 service_role ONLY (revoke anon AND authenticated — founder's
-- word), D2 existing service-role client in the routes, D3/D4 declined,
-- D5 pin 14→12 + guard model fix, D6 fold in the email_suppressions grant.
--
-- The finding (vuln assessment 56a2d10): webhook/cron AUTHENTICITY is enforced
-- at the Next route (Svix / CRON_SECRET) while the underlying RPC is granted
-- to anon AND authenticated, so a direct RPC call bypasses the route's check.
--
--   · record_email_delivery_event — a confused deputy: SECURITY DEFINER, so it
--     bypasses the _admin_insert-only RLS on email_suppressions and writes a
--     suppression (caller-supplied address) that the caller could not write
--     directly. Precondition met by normal org membership → a low-privilege
--     member suppresses arbitrary addresses; reversal is privileged.
--   · run_guarantee_maintenance — an unguarded anon write (low impact, but the
--     same open-door class).
--
-- Revoking only `anon` would NOT close Finding 1: its PRIMARY vector is the
-- insider (an ordinary `authenticated` member). So both come off anon AND
-- authenticated; only service_role — the role the routes use AFTER their own
-- auth check — keeps EXECUTE. No function body changes (D3/D4).
--
-- DOCTRINE: 110 named three load-bearing anon grants (limiter/webhook/cron).
-- After this, only the limiter (check_rate_limit) stays anon — it alone runs
-- before a session exists. The webhook and cron carry their own route secrets
-- and now use service_role. This TIGHTENS 110's doctrine.

-- ---------------------------------------------------------------------------
-- 1. The webhook write — service_role only (Finding 1, D1)
-- ---------------------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION public.record_email_delivery_event(text, text, text, text)
  FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_email_delivery_event(text, text, text, text)
  TO service_role;

COMMENT ON FUNCTION public.record_email_delivery_event(text, text, text, text) IS
  '099/126 — records a Resend delivery event and suppresses genuine bounces. §211: service_role ONLY. It is SECURITY DEFINER and bypasses the _admin_insert-only RLS on email_suppressions, so an anon/authenticated caller could write a suppression it was forbidden to write (confused deputy, vuln finding 1). Authenticity now lives where it belongs — the webhook route verifies the Svix signature, then calls this as service_role.';

-- ---------------------------------------------------------------------------
-- 2. The cron write — service_role only (Finding 2, D1)
-- ---------------------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION public.run_guarantee_maintenance()
  FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_guarantee_maintenance()
  TO service_role;

COMMENT ON FUNCTION public.run_guarantee_maintenance() IS
  '062 — earns guarantee_passed instalments past their date. §211: service_role ONLY. It is an unguarded SECURITY DEFINER write; the CRON_SECRET at /api/cron/maintenance is the authenticity boundary, and the route now calls this as service_role rather than leaving the RPC open to anon.';

-- ---------------------------------------------------------------------------
-- 3. The suppression list — no bare anon read (Finding 4, D6)
-- ---------------------------------------------------------------------------
--
-- Rows were already RLS-gated (anon has no org → no rows), so nothing leaked;
-- a bare SELECT grant to anon on a suppression list is needless surface.
-- The org-scoped read for `authenticated` stays (email_suppressions_role_select).

REVOKE SELECT ON public.email_suppressions FROM anon;
