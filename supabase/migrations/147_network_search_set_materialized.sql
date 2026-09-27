-- 147 — THE SEARCH SET IS EVALUATED ONCE, NOT ONCE PER PERSON
--
-- Gate: docs/superpowers/specs/2026-09-25-network-fold-in-postgres-gate.md
-- (the same gate as 145 and 146 — this is the third thing drive 137 caught,
-- and the last).
--
-- ## What was still wrong after 146
--
-- 146 made the fold a view and proved it fast when queried directly. The page
-- was still slow, uniformly, through anything:
--
--   page read, written INLINE:              9 ms
--   the identical SQL inside the function:  1,470 ms
--   rollup inline:                          3 ms
--   rollup through the function:            835 ms
--
-- The boundary was not the cost — the PLAN was. Inside a function the filters
-- arrive as parameters, so the planner cannot see that `p_q IS NULL` and must
-- plan for a search; it chose a nested loop, re-deciding the semijoin
--
--   f.profile_id IN (SELECT ... FROM candidates WHERE cv_search LIKE …)
--
-- for EVERY person in the fold. 2,135 people, one scan each.
--
-- `AS MATERIALIZED` ends it: the CTE is evaluated exactly once, whatever the
-- planner thinks of the parameters.
--
--   with the search set MATERIALIZED, no term:   8 ms
--   the same with a search term:                 6 ms
--
-- ## The lesson worth keeping
--
-- A measurement taken on hand-written SQL does not carry over to the same SQL
-- inside a function. The gate measured 65 ms hand-written and the shipped page
-- took 849 ms; both numbers were honest, and only one of them was about the
-- product. Time the thing that ships.

CREATE OR REPLACE FUNCTION public.network_people(
  p_q         text DEFAULT NULL,
  p_archetype text DEFAULT NULL,
  p_tier      text DEFAULT NULL,
  p_domain    text DEFAULT NULL,
  p_stage     text DEFAULT NULL,
  p_years     text DEFAULT NULL,
  p_sort      text DEFAULT 'best_score',
  p_dir       text DEFAULT 'desc',
  p_limit     integer DEFAULT 26,
  p_offset    integer DEFAULT 0
)
RETURNS TABLE (
  profile_id             uuid,
  canonical_candidate_id uuid,
  full_name              text,
  current_title          text,
  current_company        text,
  email                  text,
  linkedin_url           text,
  archetype              text,
  domain                 text,
  years_experience       numeric,
  tech_exposure          jsonb,
  best_tier              text,
  best_score             numeric,
  average_score          numeric,
  last_active_at         timestamptz,
  appearance_count       integer,
  project_count          integer,
  shortlisted_before     boolean,
  is_returning           boolean,
  appearances            jsonb
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  -- MATERIALIZED is load-bearing, not a hint: without it the planner turns
  -- this into a nested loop and rescans `candidates` once per person (1,470 ms
  -- at 2,135 people; 8 ms with it).
  WITH matching AS MATERIALIZED (
    SELECT DISTINCT m.network_profile_id AS pid
      FROM public.candidates m
     WHERE p_q IS NOT NULL
       AND m.cv_search LIKE '%' || lower(btrim(p_q)) || '%'
  ),
  page AS (
    SELECT f.*
      FROM public.network_people_folded f
     WHERE (p_q IS NULL OR f.profile_id IN (SELECT pid FROM matching))
       AND public.network_people_matches(
             f.archetype, f.domain, f.best_tier, f.years_experience, f.stages,
             p_archetype, p_tier, p_domain, p_stage, p_years)
     ORDER BY
       CASE WHEN p_sort = 'best_score'    AND p_dir = 'desc' THEN f.best_score END DESC NULLS LAST,
       CASE WHEN p_sort = 'best_score'    AND p_dir = 'asc'  THEN f.best_score END ASC  NULLS LAST,
       CASE WHEN p_sort = 'average_score' AND p_dir = 'desc' THEN f.average_score END DESC NULLS LAST,
       CASE WHEN p_sort = 'average_score' AND p_dir = 'asc'  THEN f.average_score END ASC  NULLS LAST,
       CASE WHEN p_sort = 'last_active'   AND p_dir = 'desc' THEN f.last_active_at END DESC NULLS LAST,
       CASE WHEN p_sort = 'last_active'   AND p_dir = 'asc'  THEN f.last_active_at END ASC  NULLS LAST,
       CASE WHEN p_sort = 'name'          AND p_dir = 'desc' THEN lower(f.full_name) END DESC NULLS LAST,
       CASE WHEN p_sort = 'name'          AND p_dir = 'asc'  THEN lower(f.full_name) END ASC  NULLS LAST,
       f.last_active_at DESC,
       f.profile_id
     LIMIT greatest(coalesce(p_limit, 26), 1)
    OFFSET greatest(coalesce(p_offset, 0), 0)
  )
  SELECT
    pg.profile_id, pg.canonical_candidate_id, pg.full_name, pg.current_title,
    pg.current_company, pg.email, pg.linkedin_url, pg.archetype, pg.domain,
    pg.years_experience, coalesce(pg.tech_exposure, '[]'::jsonb), pg.best_tier,
    pg.best_score, pg.average_score, pg.last_active_at, pg.appearance_count,
    pg.project_count, pg.shortlisted_before, pg.is_returning,
    coalesce(
      (SELECT jsonb_agg(a ORDER BY a ->> 'updated_at' DESC)
         FROM (
           SELECT jsonb_build_object(
                    'candidate_id',   c.id,
                    'project_id',     c.project_id,
                    'project_title',  pr.title,
                    'project_status', pr.status,
                    'pipeline_stage', c.pipeline_stage,
                    'rank',           s.rank_position,
                    'overall_score',  s.overall_score,
                    'tier',           s.tier,
                    'updated_at',     c.updated_at
                  ) AS a
             FROM public.candidates c
             LEFT JOIN public.projects pr ON pr.id = c.project_id
             LEFT JOIN public.candidate_scores s ON s.candidate_id = c.id
            WHERE c.network_profile_id = pg.profile_id
              AND c.project_id IS NOT NULL
         ) appearance_rows),
      '[]'::jsonb
    ) AS appearances
  FROM page pg;
$$;

COMMENT ON FUNCTION public.network_people(text, text, text, text, text, text, text, text, integer, integer) IS
  '§205 — one page of the Network table, filtering the network_people_folded view. The search set is a MATERIALIZED cte because a parameterised semijoin was replanned per person (1,470 ms at 2,135 people, drive 137). Appearances are gathered for the page only; the sort is a CASE ladder; the (last_active_at, profile_id) tiebreak stops OFFSET paging repeating or skipping a person.';

CREATE OR REPLACE FUNCTION public.network_people_rollup(
  p_q         text DEFAULT NULL,
  p_archetype text DEFAULT NULL,
  p_tier      text DEFAULT NULL,
  p_domain    text DEFAULT NULL,
  p_stage     text DEFAULT NULL,
  p_years     text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH matching AS MATERIALIZED (
    SELECT DISTINCT m.network_profile_id AS pid
      FROM public.candidates m
     WHERE p_q IS NOT NULL
       AND m.cv_search LIKE '%' || lower(btrim(p_q)) || '%'
  ),
  f AS (
    SELECT * FROM public.network_people_folded v
     WHERE (p_q IS NULL OR v.profile_id IN (SELECT pid FROM matching))
       AND public.network_people_matches(
             v.archetype, v.domain, v.best_tier, v.years_experience, v.stages,
             p_archetype, p_tier, p_domain, p_stage, p_years)
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
  );
$$;

COMMENT ON FUNCTION public.network_people_rollup(text, text, text, text, text, text) IS
  '§205 — the Network page''s figures, over the whole FILTERED pool rather than the page, through the same view, the same predicate and the same MATERIALIZED search set the table uses.';
