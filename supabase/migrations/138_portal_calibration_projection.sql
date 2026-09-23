-- 138 — THE PORTAL STOPS HANDING OVER THE WHOLE CALIBRATION MODEL
--
-- `portal_get_mandate` (068, widened in 127) has always returned
-- `p.calibration_model` WHOLE:
--
--     'calibration_model', p.calibration_model
--
-- The page only ever reads `dimension_weights` from it — one line, for
-- the evidence grid's weighting. Everything else in that jsonb crossed
-- the boundary because nobody named the keys: `missing_information`
-- (the intake's list of what the mandate lacks), `weights_rationale`,
-- `inferred_scope`, `derived_from_spec_id`.
--
-- §196 made that worse rather than creating it. A calibration model now
-- carries `custom_dimensions`, and a PROPOSED dimension carries the
-- Calibration Agent's `rationale` — an argument for scoring people on a
-- new axis, written for a recruiter to accept or reject, and NOT
-- approved by any human at the moment it is written. That is internal
-- deliberation. It has no business in a client's hands, and "the page
-- doesn't render it" is not a boundary: this function is SECURITY
-- DEFINER and reachable at /rest/v1/rpc/portal_get_mandate by any signed
-- -in external with a session.
--
-- So the projection is named, on the §162 precedent — the invoice portal
-- crosses exactly seven snapshot keys and `from_email` is not one of
-- them. Here exactly two things cross:
--
--   * dimension_weights — what the evidence grid weights by.
--   * custom_dimensions — APPROVED ONLY, and even then reduced to
--     key / label / definition / weight / status. `rationale` is
--     dropped: it is the agent arguing to the recruiter, not a
--     description of what is measured. `definition` stays because it
--     IS that description, and a client entitled to see an axis is
--     entitled to know what it means.
--
-- The filter is on `status = 'approved'` in SQL, mirroring
-- `approvedCustomDimensions` in the application. Two enforcement points
-- for one rule is deliberate: the app decides what SCORES, the door
-- decides what CROSSES, and neither should have to trust the other.
--
-- Nothing else in the function changes. Signature, volatility,
-- search_path, the can_view_portal_mandate gate, grants and the anon
-- roster are all identical — this is a projection change inside one
-- SELECT. Re-declaring an existing member leaves the roster at 14.

CREATE OR REPLACE FUNCTION public.portal_get_mandate(p_project_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
           'status', p.status,
           -- NAMED PROJECTION. See this migration's header before adding
           -- a key here: everything in this object reaches a client.
           'calibration_model', jsonb_strip_nulls(jsonb_build_object(
             'dimension_weights', p.calibration_model -> 'dimension_weights',
             'custom_dimensions', (
               SELECT coalesce(jsonb_agg(jsonb_build_object(
                        'key',        d ->> 'key',
                        'label',      d ->> 'label',
                        'definition', d ->> 'definition',
                        'weight',     d -> 'weight',
                        'status',     d ->> 'status')), '[]'::jsonb)
                 FROM jsonb_array_elements(
                        CASE
                          WHEN jsonb_typeof(p.calibration_model -> 'custom_dimensions')
                               = 'array'
                          THEN p.calibration_model -> 'custom_dimensions'
                          ELSE '[]'::jsonb
                        END) AS d
                WHERE d ->> 'status' = 'approved'
             )
           )))
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
    'client_interview', (
      SELECT jsonb_build_object(
               'id', ci.id, 'version', ci.version,
               'content_json', ci.content_json)
        FROM public.client_interviews ci
       WHERE ci.project_id = p_project_id
         AND ci.status = 'approved'
       LIMIT 1
    ),
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
$function$;

COMMENT ON FUNCTION public.portal_get_mandate(uuid) IS
  '§196/138 — client portal mandate read. calibration_model is a NAMED PROJECTION, not the stored row: only dimension_weights and APPROVED custom dimensions cross, and custom dimensions cross without their rationale. Adding a key here puts it in a client''s hands.';
