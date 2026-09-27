-- 148 — THE PAGE READS THE VIEW, AND THE ROLLUP GETS A CUSTOM PLAN
--
-- Gate: docs/superpowers/specs/2026-09-25-network-fold-in-postgres-gate.md
-- (the fourth and last correction drive 137 forced).
--
-- ## The measurement that decided this, at 2,135 people
--
-- Every attempt to wrap the paged read in a database function was slow, and
-- the SAME SQL read from the application was fast:
--
--   the view, ORDER BY + LIMIT, as the app sends it:        13 ms
--   ... inside a SQL function (145/146/147):           785–1,470 ms
--   ... inside a plpgsql function with EXECUTE USING:   209–271 ms
--
-- A function that returns a ROW SET pays twice: its body is planned once with
-- the filters as parameters, so the planner cannot prune what a NULL filter
-- makes irrelevant, and every row it returns is copied through a tuplestore
-- before the caller sees it. Neither cost exists when PostgREST sends the
-- query with the filters as literals — which is exactly how the candidates and
-- mandate lists have always worked.
--
-- A function that returns ONE VALUE pays neither in practice:
--
--   the rollup as plpgsql with EXECUTE ... USING:            12 ms
--
-- So: the page reads the view, and the rollup stays a function with a custom
-- plan per call. `network_people()` is dropped rather than left as a slow
-- second way to read the same thing.
--
-- ## What the search costs now
--
-- The view gains `search_text` — each person's records' `cv_search` (146)
-- concatenated — so the app can filter people by one ILIKE instead of asking
-- the database for a set of ids first. Person-level semantics, unchanged:
-- a term matches if ANY of the person's records mention it.
--
--   view page 1 with a search on search_text:                7 ms
--
-- ## Dynamic SQL, and why it is safe here
--
-- The rollup builds its WHERE from FIXED fragments chosen by comparing
-- parameters to NULL; every value is bound with USING, and no caller text ever
-- reaches the statement. The ORDER BY problem that made dynamic SQL dangerous
-- in 145 does not exist any more: sorting is the app's `.order()` on an
-- allowlisted column, as on every other list.

-- ---------------------------------------------------------------------------
-- 1. The fold, with the person's searchable text.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.network_people_folded
WITH (security_invoker = true) AS
  SELECT
    b.pid AS profile_id,
    (array_agg(b.id) FILTER (WHERE b.rn = 1))[1] AS canonical_candidate_id,
    max(b.full_name)       FILTER (WHERE b.rn = 1) AS full_name,
    max(b.current_title)   FILTER (WHERE b.rn = 1) AS current_title,
    max(b.current_company) FILTER (WHERE b.rn = 1) AS current_company,
    max(b.email)           FILTER (WHERE b.rn = 1) AS email,
    max(b.linkedin_url)    FILTER (WHERE b.rn = 1) AS linkedin_url,
    max(b.archetype)       FILTER (WHERE b.rn = 1) AS archetype,
    max(b.domain)          FILTER (WHERE b.rn = 1) AS domain,
    max(b.years)           FILTER (WHERE b.rn = 1) AS years_experience,
    (array_agg(b.tech) FILTER (WHERE b.rn = 1))[1] AS tech_exposure,
    CASE min(
      CASE b.tier WHEN 'tier_1' THEN 1 WHEN 'tier_2' THEN 2
                  WHEN 'tier_3' THEN 3 WHEN 'tier_4' THEN 4 END
    ) WHEN 1 THEN 'tier_1' WHEN 2 THEN 'tier_2'
      WHEN 3 THEN 'tier_3' WHEN 4 THEN 'tier_4' END AS best_tier,
    max(b.overall_score) AS best_score,
    avg(b.overall_score) AS average_score,
    max(b.updated_at)    AS last_active_at,
    count(*) FILTER (WHERE b.project_id IS NOT NULL)::integer AS appearance_count,
    count(DISTINCT b.project_id)::integer AS project_count,
    coalesce(bool_or(
      b.tier IN ('tier_1', 'tier_2')
      OR b.pipeline_stage IN ('shortlisted', 'submitted', 'interviewed',
                              'passed_rounds', 'finalist', 'offer', 'hired')
    ), false) AS shortlisted_before,
    count(DISTINCT b.project_id) >= 2 AS is_returning,
    array_agg(DISTINCT b.pipeline_stage) FILTER (WHERE b.pipeline_stage IS NOT NULL) AS stages,
    string_agg(b.cv_search, ' ') AS search_text
  FROM (
    SELECT
      c.network_profile_id AS pid,
      c.id,
      c.project_id,
      c.full_name,
      c.current_title,
      c.current_company,
      c.email,
      c.linkedin_url,
      c.archetype,
      c.pipeline_stage,
      c.updated_at,
      c.cv_search,
      c.cv_structured ->> 'domain' AS domain,
      CASE WHEN jsonb_typeof(c.cv_structured -> 'years_experience') = 'number'
           THEN (c.cv_structured ->> 'years_experience')::numeric END AS years,
      c.cv_structured -> 'tech_exposure' AS tech,
      s.overall_score,
      s.tier,
      row_number() OVER (
        PARTITION BY c.network_profile_id ORDER BY c.updated_at DESC, c.id
      ) AS rn
    FROM public.candidates c
    LEFT JOIN public.candidate_scores s ON s.candidate_id = c.id
    WHERE c.network_profile_id IS NOT NULL
  ) b
  GROUP BY b.pid;

COMMENT ON VIEW public.network_people_folded IS
  '§205 — the Network page''s fold: one row per network_profile_id, read directly by the page (13 ms at 2,135 people, against 785 ms for the same SQL inside a row-set function). `search_text` is the person''s records'' cv_search concatenated, so a search filters people in one predicate. security_invoker: the org scope stays RLS''s job.';

-- ---------------------------------------------------------------------------
-- 2. The paged reader is gone; the page reads the view.
-- ---------------------------------------------------------------------------
--
-- Left in place it would be a second, slower way to read the same rows, and
-- the next person to touch this page would have to work out which one is real.

DROP FUNCTION IF EXISTS public.network_people(text, text, text, text, text, text, text, text, integer, integer);

-- ---------------------------------------------------------------------------
-- 3. The figures — one value, so one custom plan per call is cheap.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.network_people_rollup(
  p_q         text DEFAULT NULL,
  p_archetype text DEFAULT NULL,
  p_tier      text DEFAULT NULL,
  p_domain    text DEFAULT NULL,
  p_stage     text DEFAULT NULL,
  p_years     text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $fn$
DECLARE
  v_where text := 'public.network_people_matches(v.archetype, v.domain, v.best_tier, '
               || 'v.years_experience, v.stages, $2, $3, $4, $5, $6)';
  v_result jsonb;
BEGIN
  -- Fixed fragments, chosen by comparing parameters to NULL. Every value is
  -- bound with USING; nothing the caller typed becomes statement text.
  IF p_q IS NOT NULL THEN
    v_where := v_where || ' AND v.search_text LIKE $1';
  END IF;

  EXECUTE format($sql$
    WITH f AS (
      SELECT v.profile_id, v.full_name, v.archetype, v.domain, v.average_score,
             v.project_count, v.is_returning, v.shortlisted_before
        FROM public.network_people_folded v
       WHERE %s
    )
    SELECT jsonb_build_object(
      'total',        (SELECT count(*) FROM f),
      'returning',    (SELECT count(*) FROM f WHERE is_returning),
      'shortlisted',  (SELECT count(*) FROM f WHERE shortlisted_before),
      'domains',      (SELECT count(DISTINCT domain) FROM f WHERE domain IS NOT NULL),
      'by_archetype', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                                'archetype', coalesce(archetype, 'Unspecified'),
                                'count', n) ORDER BY n DESC), '[]'::jsonb)
                         FROM (SELECT archetype, count(*)::integer AS n
                                 FROM f GROUP BY archetype) a),
      'by_domain',    (SELECT coalesce(jsonb_agg(jsonb_build_object(
                                'domain', domain, 'count', n) ORDER BY n DESC), '[]'::jsonb)
                         FROM (SELECT domain, count(*)::integer AS n
                                 FROM f WHERE domain IS NOT NULL
                                GROUP BY domain ORDER BY count(*) DESC LIMIT 8) d),
      'top_by_average', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                                'profile_id', profile_id, 'full_name', full_name,
                                'average_score', average_score)
                                ORDER BY average_score DESC), '[]'::jsonb)
                         FROM (SELECT profile_id, full_name, average_score FROM f
                                WHERE average_score IS NOT NULL
                                ORDER BY average_score DESC LIMIT 5) t),
      'most_versatile', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                                'profile_id', profile_id, 'full_name', full_name,
                                'project_count', project_count)
                                ORDER BY project_count DESC), '[]'::jsonb)
                         FROM (SELECT profile_id, full_name, project_count FROM f
                                WHERE project_count >= 2
                                ORDER BY project_count DESC LIMIT 5) v),
      'people_pending', (SELECT count(*)::integer FROM public.candidates
                          WHERE network_profile_id IS NULL)
    )
  $sql$, v_where)
  INTO v_result
  USING '%' || lower(btrim(coalesce(p_q, ''))) || '%',
        p_archetype, p_tier, p_domain, p_stage, p_years;

  RETURN v_result;
END
$fn$;

COMMENT ON FUNCTION public.network_people_rollup(text, text, text, text, text, text) IS
  '§205 — the Network page''s figures, over the whole FILTERED pool rather than the page. plpgsql with EXECUTE ... USING so each call gets a plan for the filters it actually has: as a plain SQL function the same aggregate took 835 ms at 2,135 people, and 12 ms this way. Filters go through network_people_matches, the one rule the page''s own clauses mirror.';

REVOKE ALL ON public.network_people_folded FROM public, anon;
GRANT SELECT ON public.network_people_folded TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.network_people_rollup(text, text, text, text, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.network_people_rollup(text, text, text, text, text, text) TO authenticated, service_role;
