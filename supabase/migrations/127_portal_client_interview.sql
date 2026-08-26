-- 127 — THE CLIENT INTERVIEW REACHES THE SIGNED-IN DOOR
--
-- Client portal programme, slice 1. Gate:
-- docs/superpowers/specs/2026-08-26-client-portal-gate.md, confirmed by
-- the founder 2026-08-26 — D1(b), D2(b), D3(c).
--
-- §144 closed the client-interview slice with ONE answer door: the
-- token path (/hm/[token]). The signed-in client could not answer it,
-- and — contrary to what client-interview-section.tsx documents — could
-- not even SEE the approved set. `portal_get_mandate` (069) never
-- selected from `client_interviews`, and the portal page passed neither
-- prop. So the anonymous token holder could answer, while the
-- authenticated, named, share-verified, grant-checked client could not.
-- That asymmetry is what this migration ends.
--
-- D2(b) asked for a real attribution FK and found one already built:
-- `feedback.submitted_by REFERENCES users(id)`, guarded since 057 by
-- `guard_author_in_org('submitted_by')`, which 068 taught to admit an
-- external principal of one of the organisation's clients. No new
-- column and NO NEW FOREIGN KEY — the AMBIGUOUS_PAIRS list in
-- embed-ambiguity.test.ts is therefore untouched by this migration. The
-- token path keeps writing `submitted_by` NULL: its anonymity is a
-- design fact (069 D5), not a gap to be closed.
--
-- The counts this migration deliberately does not move:
--   * anon roster stays TWELVE — the one new entry point is granted to
--     `authenticated` and revoked from `anon`. It runs under the
--     CALLER's session precisely so `can_view_portal_mandate()` and
--     `auth.uid()` mean what they say; a service-role call would see
--     auth.uid() NULL and fail closed, which is correct.
--   * agent allowlist stays TWENTY-NINE — no agent touches this door.
--   * intent doors stay TWENTY-SIX — externals go through SECURITY
--     DEFINER RPCs, never the staff intent ladder (the 069 doctrine).
--   * activity CHECK stays 93 — a signed-in answer is the same FACT as
--     a token answer (`client_interview_answered`), differing only in
--     attribution, which the trail already carries in `actor_id`.

-- ---------------------------------------------------------------------------
-- 1. The structured source of an answer
-- ---------------------------------------------------------------------------

-- D3(c) rules that re-answering REPLACES your own answer. Replacement
-- without the original in front of you is a footgun: a client who
-- answered five questions and returns to correct one would silently
-- lose the other four. `composeClientInterviewContent` is lossy by
-- design (it writes prose for the interpreter to read) and re-parsing
-- it would be guesswork, so the map the client actually typed is kept
-- beside it.
ALTER TABLE public.feedback
  ADD COLUMN IF NOT EXISTS answers_json jsonb;

COMMENT ON COLUMN public.feedback.answers_json IS
  'Structured source of a composed client-interview answer (127): the '
  'question-id -> answer map the client typed, kept so the author can '
  'EDIT under D3(c) rather than retype. NULL on every other '
  'feedback_type and on every row written before 127.';

-- ---------------------------------------------------------------------------
-- 2. One answer per person per mandate — D3(c)
-- ---------------------------------------------------------------------------

-- Thrash is bounded by headcount, not by clicks: each named principal
-- holds at most one client-interview answer per mandate, and answering
-- again edits it in place. Two people at the same client disagreeing is
-- signal the Feedback Interpreter SHOULD see, so the bound is per
-- person and not per mandate.
--
-- The token path is exempt by construction: it writes submitted_by
-- NULL, which no unique index constrains. Token answers keep
-- accumulating exactly as they did before 127 — no regression on a
-- door this slice does not touch.
CREATE UNIQUE INDEX IF NOT EXISTS unique_client_interview_answer_per_person
  ON public.feedback (project_id, submitted_by)
  WHERE feedback_type = 'client_interview' AND submitted_by IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. portal_get_mandate learns the question set
-- ---------------------------------------------------------------------------

-- Unchanged from 069 except for the two keys at the end. The access
-- check, the slate computation, the scores and the progress counts are
-- byte-for-byte the same shape: a signed-in external still receives
-- only what the page renders, and this function is still assumed
-- reachable from a browser console.
--
-- `client_interview` carries the APPROVED set only — a draft is the
-- desk thinking aloud and must never cross. `my_interview_answer`
-- carries the caller's OWN row and nobody else's, the same rule
-- portal_list_my_reviews states: client_hr sees the mandate's question
-- set, not a colleague's answers to it.
CREATE OR REPLACE FUNCTION public.portal_get_mandate(p_project_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ids      uuid[];
  v_project  jsonb;
  v_result   jsonb;
BEGIN
  IF NOT public.can_view_portal_mandate(p_project_id) THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_build_object(
           'id', p.id, 'title', p.title, 'company_name', p.company_name,
           'status', p.status, 'calibration_model', p.calibration_model)
    INTO v_project
    FROM public.projects p WHERE p.id = p_project_id;

  IF v_project IS NULL THEN
    RETURN NULL;
  END IF;

  v_ids := public.portal_slate_candidate_ids(p_project_id);

  SELECT jsonb_build_object(
    'project', v_project,
    'shortlist', (
      SELECT jsonb_build_object('candidate_ids', to_jsonb(sl.candidate_ids),
                                'updated_at', sl.updated_at)
        FROM public.shortlists sl
       WHERE sl.project_id = p_project_id
       LIMIT 1
    ),
    'candidates', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'id', c.id, 'full_name', c.full_name,
               'current_title', c.current_title,
               'current_company', c.current_company,
               'cv_structured', c.cv_structured,
               'recruiter_assessment', c.recruiter_assessment,
               'pipeline_stage', c.pipeline_stage))
        FROM public.candidates c
       WHERE c.project_id = p_project_id
         AND c.id = ANY(v_ids)
    ), '[]'::jsonb),
    'scores', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'candidate_id', s.candidate_id,
               'rank_position', s.rank_position,
               'overall_score', s.overall_score,
               'tier', s.tier,
               'technical_score', s.technical_score,
               'domain_score', s.domain_score,
               'leadership_score', s.leadership_score,
               'regulatory_score', s.regulatory_score,
               'transformation_score', s.transformation_score))
        FROM public.candidate_scores s
       WHERE s.project_id = p_project_id
         AND s.candidate_id = ANY(v_ids)
    ), '[]'::jsonb),
    -- The stage list mirrors computeProgress in the token portal page;
    -- pinned by the invariants file alongside the slate rule.
    'progress', (
      SELECT jsonb_build_object(
               'candidates_total', count(*),
               'candidates_reviewed', count(*) FILTER (WHERE
                 coalesce(c.pipeline_stage, 'found') IN
                 ('reviewed', 'matched', 'shortlisted', 'submitted',
                  'interviewed', 'passed_rounds', 'finalist', 'offer', 'hired')))
        FROM public.candidates c
       WHERE c.project_id = p_project_id
    ),
    -- 127: the approved question set, drafts excluded in the WHERE.
    'client_interview', (
      SELECT jsonb_build_object(
               'id', ci.id, 'version', ci.version,
               'content_json', ci.content_json)
        FROM public.client_interviews ci
       WHERE ci.project_id = p_project_id
         AND ci.status = 'approved'
       LIMIT 1
    ),
    -- 127: the caller's own answer, so the form opens on what they
    -- said last time rather than on a blank page they must refill.
    'my_interview_answer', (
      SELECT jsonb_build_object(
               'id', f.id,
               'answers_json', f.answers_json,
               'content', f.content,
               'created_at', f.created_at)
        FROM public.feedback f
       WHERE f.project_id = p_project_id
         AND f.feedback_type = 'client_interview'
         AND f.submitted_by = (SELECT auth.uid())
       LIMIT 1
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.portal_get_mandate(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.portal_get_mandate(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. The signed-in answer's trail event
-- ---------------------------------------------------------------------------

-- The session counterpart of record_client_interview_answered (117).
-- Three deliberate differences from its token twin:
--
--   * It takes no token. Access is `can_view_portal_mandate`, evaluated
--     in-database under the caller's own session — a forged call from a
--     browser console carries the same identity and gets the same
--     answer.
--   * It is granted to `authenticated` rather than revoked from
--     everyone, because its caller is the client's own session and not
--     a service-role route. The anon roster is untouched.
--   * The actor is not a parameter. write_activity_event stamps
--     auth.uid() and derives the label itself (053), so a caller cannot
--     attribute their answer to a colleague. `label` is passed only so
--     the existing describer renders the same sentence for both doors.
CREATE OR REPLACE FUNCTION public.record_portal_client_interview_answered(
  p_project_id   uuid,
  p_interview_id uuid,
  p_answered     integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org   uuid;
  v_int   record;
  v_label text;
BEGIN
  IF NOT public.can_view_portal_mandate(p_project_id) THEN
    RETURN false;
  END IF;

  SELECT organization_id INTO v_org
    FROM public.projects WHERE id = p_project_id;
  IF v_org IS NULL THEN
    RETURN false;
  END IF;

  SELECT id, version
    INTO v_int
    FROM public.client_interviews
   WHERE id = p_interview_id
     AND project_id = p_project_id
     AND status = 'approved';
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  SELECT coalesce(nullif(btrim(full_name), ''), email)
    INTO v_label
    FROM public.users
   WHERE id = (SELECT auth.uid());

  PERFORM public.write_activity_event(
    p_organization_id => v_org,
    p_event_type      => 'client_interview_answered',
    p_visibility      => 'org',
    p_project_id      => p_project_id,
    p_candidate_id    => NULL,
    p_client_id       => NULL,
    p_placement_id    => NULL,
    p_target_user_id  => NULL,
    p_detail          => jsonb_build_object(
                           'label', v_label,
                           'door', 'portal',
                           'interview_id', v_int.id,
                           'version', v_int.version,
                           'answered_count', GREATEST(0, COALESCE(p_answered, 0))));
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.record_portal_client_interview_answered(uuid, uuid, integer)
  FROM public, anon;
GRANT EXECUTE ON FUNCTION public.record_portal_client_interview_answered(uuid, uuid, integer)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Two rate-limit buckets — caps as data (088)
-- ---------------------------------------------------------------------------

-- This door triggers a paid interpreter run, so it is Tier 1 and FAILS
-- CLOSED app-side, like both of its neighbours. The numbers mirror the
-- portal_submit pair: the caller here is a named, signed-in client, so
-- the per-identity cap is theirs and not a shared link's.
--
-- Named `identity` rather than `token` because that is what the key
-- actually is — portal_submit_token predates the distinction and keeps
-- its name.
INSERT INTO public.rate_limit_policy (scope, per_key_limit, window_seconds, global_daily_limit) VALUES
  ('portal_interview_identity',  5, 3600, 300),
  ('portal_interview_ip',       30, 3600, NULL)
ON CONFLICT (scope) DO UPDATE
  SET per_key_limit = EXCLUDED.per_key_limit,
      window_seconds = EXCLUDED.window_seconds,
      global_daily_limit = EXCLUDED.global_daily_limit;
