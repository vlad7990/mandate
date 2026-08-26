-- 125 — the grants pass, completed (110's doctrine, 121's lesson,
-- found by the pre-launch advisor sweep on 2026-08-26).
--
-- Migration 110 established the rule and 121 restated it: Postgres
-- grants EXECUTE to PUBLIC on every new function, so every function
-- arrives with an open door whether or not anyone meant to open one.
-- 110 swept the trigger functions that existed then; 121 swept the two
-- that 120 had just added. Nothing swept the ones in between, and this
-- sweep found ELEVEN grants that no ruling ever asked for.
--
-- ## The ruled twelve are intact
--
-- The anon roster is TWELVE NAMED grants and they are all still
-- exactly what 110 and 113 ruled: the six candidate-portal entry
-- points, `check_rate_limit` (the limiter), `record_email_delivery_event`
-- (the Resend webhook), `run_guarantee_maintenance` (the cron), and the
-- three token verifiers — `verify_hm_token`, `verify_invitation`,
-- `verify_staff_invitation`. Every one is SECURITY DEFINER, takes a
-- token or a secret, and is load-bearing for a route that has no
-- session by design. None of them is touched here.
--
-- ## What drifted in, and why each is closed
--
-- 1. **Ten trigger functions, executable by anon over PostgREST.** A
--    trigger function has no caller: the trigger machinery invokes it
--    as the table owner, so the grant buys nothing and exposes an RPC
--    endpoint that can be POSTed at. 121 proved the revoke is free —
--    it swept two guards and drive 107 went green straight after.
--    `service_role` is left alone on principle (110), though it never
--    calls these either.
--
-- 2. **`can_write_okrs`, executable by anon.** A capability predicate,
--    not a door. Every other one since 046 is revoked from anon in the
--    same breath it is created — `can_read_fees`, `can_write_mandates`,
--    `can_manage_desk`. This one was created in 107 without the
--    revoke. It is harmless in effect (an anon caller has no row in
--    `public.users`, so `current_user_role()` is null and the predicate
--    is false) and wrong in shape: the roster is a ruled list, and a
--    thirteenth member nobody ruled is drift whether or not it bites.
--
-- ## And six functions gain a pinned search_path
--
-- None is SECURITY DEFINER, so none is the escalation shape that makes
-- a mutable search_path dangerous — but `SET search_path` is what the
-- rest of the schema does, the advisor flags the absence, and the
-- pre-launch checklist asks for a clean sweep rather than a sweep with
-- a footnote.

-- ---------------------------------------------------------------------------
-- 1. The ten trigger functions — the 110/121 doctrine, applied to the
--    ones both passes missed.
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.guard_client_interviews() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_executive_assessments() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_executive_interview_plans() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_executive_risk_reviews() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_interview_plans() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_network_dnc() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_role_success_profiles() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_sourcing_runs() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_subject_notified() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.purge_staged_results_for_candidate() FROM public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. The predicate that should never have been a door.
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.can_write_okrs() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.can_write_okrs() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Pinned search_path on the six that lacked one. ALTER rather than
--    CREATE OR REPLACE: the bodies are correct and rewriting them here
--    would fork them from the migrations that own them (116, 117).
-- ---------------------------------------------------------------------------

ALTER FUNCTION public.allocate_and_insert_client_interview(
  p_project_id uuid, p_organization_id uuid, p_content_json jsonb,
  p_is_generating boolean, p_created_by uuid, p_prompt_version text,
  p_model_version text) SET search_path = public;
ALTER FUNCTION public.allocate_and_insert_project_interview_plan(
  p_project_id uuid, p_candidate_id uuid, p_organization_id uuid,
  p_source_spec_id uuid, p_content_json jsonb, p_is_generating boolean,
  p_created_by uuid, p_prompt_version text, p_model_version text)
  SET search_path = public;
ALTER FUNCTION public.approve_client_interview(p_interview_id uuid, p_project_id uuid)
  SET search_path = public;
ALTER FUNCTION public.approve_project_interview_plan(
  p_plan_id uuid, p_project_id uuid, p_candidate_id uuid) SET search_path = public;
ALTER FUNCTION public.guard_client_interviews() SET search_path = public;
ALTER FUNCTION public.guard_interview_plans() SET search_path = public;
