-- ---------------------------------------------------------------------------
-- 134 — §190: the inbound apply link + the evaluation claim.
--
-- The last structural gap between "system of record" and "assistant
-- that fills its own pipeline": a per-mandate public apply page. The
-- candidate submits their OWN CV; parse, evaluation, refuter and the
-- §188 ledger all fire on arrival. Under §187's ruling this is also
-- the evidence engine — every applicant is a CV the machine did not
-- pick, judged live, scored against its outcome.
--
-- FAIL-CLOSED BY DESIGN: the page and the route both refuse when the
-- founder's Turnstile keys are absent (the Deep Infra precedent — the
-- capability is built, wired, and honestly dark until the key lands).
-- verifyTurnstile()'s fail-open 'disabled' mode is for the marketing
-- form; a public CV-upload endpoint does not inherit it.
--
-- THE ANON ROSTER GROWS 12 -> 14, DELIBERATELY AND NAMED:
--   verify_apply_token   — the public page's only read
--   submit_application   — the public door's only write
-- Both are token-gated inside (the token IS the credential, 073's
-- shape) and neither returns a byte of org-internal data beyond the
-- role's public title. Every other function below is revoked from
-- anon per the 129 lesson.
--
-- Doors stay 26 (the route is a token door, not an intent door);
-- CHECK stays 99 (submission reuses candidate_cv_submitted with
-- detail.source='apply'); allowlist stays 31.
-- ---------------------------------------------------------------------------

-- 1. The switch: NULL = applications closed. Minted/cleared by a
--    mandates:write action under the existing projects_role_update RLS.
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS apply_token uuid;

CREATE UNIQUE INDEX IF NOT EXISTS projects_apply_token_idx
  ON public.projects (apply_token) WHERE apply_token IS NOT NULL;

-- 2. The public read. Returns ONLY what a stranger may see: the role's
--    title and company, and whether the door is open. Mirrors §177's
--    door in SQL: a calibration that predates the final spec closes
--    applications too — an applicant must not be judged against a role
--    the spec has superseded.
CREATE OR REPLACE FUNCTION public.verify_apply_token(p_token uuid)
RETURNS TABLE(role_title text, company_name text, open boolean)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
STABLE
AS $function$
  SELECT
    coalesce(p.calibration_model->>'role_title', p.title),
    p.company_name,
    (
      p.status = 'active'
      AND NOT EXISTS (
        SELECT 1 FROM public.job_specs js
         WHERE js.project_id = p.id AND js.is_final = true
           AND js.id::text IS DISTINCT FROM p.calibration_model->>'derived_from_spec_id'
      )
    )
  FROM public.projects p
  WHERE p.apply_token = p_token AND p_token IS NOT NULL;
$function$;

-- 3. The public write. Re-validates everything the read promised
--    (token, open, door), inserts the candidate with the applicant's
--    own consent stamped (the Art.13 notice is ON the page, so
--    subject_notified_at is NOW — the one row-creation path where the
--    subject already knows), and writes the trail through the same
--    event the portal's CV submission uses.
CREATE OR REPLACE FUNCTION public.submit_application(
  p_token uuid,
  p_full_name text,
  p_email text,
  p_ext text
)
RETURNS TABLE(candidate_id uuid, organization_id uuid, project_id uuid, storage_path text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_project public.projects%ROWTYPE;
  v_open boolean;
  v_id uuid;
  v_path text;
BEGIN
  IF p_token IS NULL THEN RAISE EXCEPTION 'invalid token'; END IF;
  IF p_ext NOT IN ('pdf','docx') THEN RAISE EXCEPTION 'invalid file type'; END IF;
  IF coalesce(btrim(p_full_name),'') = '' THEN RAISE EXCEPTION 'name required'; END IF;

  SELECT * INTO v_project FROM public.projects WHERE apply_token = p_token;
  IF NOT FOUND THEN RAISE EXCEPTION 'invalid token'; END IF;

  SELECT open INTO v_open FROM public.verify_apply_token(p_token);
  IF NOT coalesce(v_open, false) THEN RAISE EXCEPTION 'applications closed'; END IF;

  v_id := gen_random_uuid();
  v_path := v_project.organization_id || '/' || v_project.id || '/' || v_id || '/cv.' || p_ext;

  INSERT INTO public.candidates (
    id, organization_id, project_id, full_name, email,
    pipeline_stage, cv_processing, source, cv_url, subject_notified_at
  ) VALUES (
    v_id, v_project.organization_id, v_project.id,
    btrim(p_full_name), nullif(btrim(p_email), ''),
    'found', true, 'apply', v_path, now()
  );

  PERFORM public.write_activity_event(
    p_organization_id => v_project.organization_id,
    p_event_type      => 'candidate_cv_submitted',
    p_visibility      => 'org',
    p_project_id      => v_project.id,
    p_candidate_id    => v_id,
    p_detail          => jsonb_build_object('source', 'apply')
  );

  RETURN QUERY SELECT v_id, v_project.organization_id, v_project.id, v_path;
END;
$function$;

-- 4. The evaluation claim (§183's cost artifact, fixed here): two
--    concurrent page loads each scheduled a generation, so one
--    candidate cost two sonnet-5 calls. The claim is an atomic
--    conditional stamp — first caller wins, the loser skips. Five-
--    minute TTL so a crashed generation does not wedge the candidate.
--    Agent-called (the Evaluator's session), NOT anon.
CREATE OR REPLACE FUNCTION public.claim_evaluation(p_candidate_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_claimed boolean;
BEGIN
  UPDATE public.candidates
     SET cv_structured = coalesce(cv_structured, '{}'::jsonb)
                         || jsonb_build_object('evaluation_claim', now())
   WHERE id = p_candidate_id
     AND (
       cv_structured->>'evaluation_claim' IS NULL
       OR (cv_structured->>'evaluation_claim')::timestamptz < now() - interval '5 minutes'
     )
  RETURNING true INTO v_claimed;
  RETURN coalesce(v_claimed, false);
END;
$function$;

-- 5. Rate policy for the door: a money scope (parse + evaluation +
--    refuter per submission), so Tier 1 — the limiter being
--    unreachable REFUSES. 5 per IP-hour, 50 across everyone per day.
INSERT INTO public.rate_limit_policy (scope, window_seconds, per_key_limit, global_daily_limit)
VALUES ('apply', 3600, 5, 50)
ON CONFLICT (scope) DO NOTHING;

-- 6. Grants. The two public doors to anon+authenticated; the claim to
--    authenticated only; everything revoked from PUBLIC first.
REVOKE ALL ON FUNCTION public.verify_apply_token(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_apply_token(uuid) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.submit_application(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_application(uuid, text, text, text) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.claim_evaluation(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_evaluation(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.claim_evaluation(uuid) TO authenticated;
