-- 110 — THE GRANTS PASS (gate: docs/superpowers/specs/2026-08-25-grants-pass-gate.md, §123)
-- Closed-form diff: exactly nine functions change. service_role untouched everywhere.
--
-- D1 — seven TRIGGER functions lose every session grant. Postgres never checks
-- the invoking session's EXECUTE when a trigger fires, so no caller loses
-- anything; this completes the house pattern already live on
-- guard_author_in_org (057) and the audit_* family (068).
REVOKE ALL ON FUNCTION public.guard_task_assignee_changes() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_objective_owner_changes() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_financial_key_results() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_lead_recruiter_changes() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_auth_user() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_skill_version() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.candidates_link_network_profile() FROM public, anon, authenticated;

-- D2 — the two machine doors drop their surplus AUTHENTICATED grant only.
-- Their anon grants are LOAD-BEARING — verified in code, do not "fix" them:
--   * record_email_delivery_event: the Resend webhook client
--     (src/app/api/webhooks/resend/route.ts) is built with the ANON key;
--     the svix signature is the auth, at the app layer.
--   * run_guarantee_maintenance: the Vercel cron route
--     (src/app/api/cron/maintenance/route.ts) uses the anon cookie client;
--     CRON_SECRET is the auth, at the app layer.
-- A signed-in browser session has no business at either door.
REVOKE EXECUTE ON FUNCTION public.record_email_delivery_event(text, text, text, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.run_guarantee_maintenance() FROM authenticated;

-- R1 — NOT touched, load-bearing anon grants (eleven): verify_hm_token,
-- verify_invitation, the six candidate_portal_* functions, and:
--   * check_rate_limit(text, text) keeps BOTH anon and authenticated —
--     /request-access is signed-out (src/lib/rate-limit/server.ts cookie
--     client = anon) and signed-in flows rate-limit through the same helper.
--     The limiter FAILS CLOSED (088): a revoked grant would present as
--     "everything rate-limited", i.e. as safety, not as breakage.
--   * record_email_delivery_event / run_guarantee_maintenance anon grants
--     stay, per D2 above.
