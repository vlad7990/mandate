-- 149 — A HOLD: THE PAGED READER STAYS UNTIL THE NEW APP CAN DEPLOY
--
-- Not a design change. An operational safety net, written down rather than
-- left as a surprise.
--
-- ## What happened
--
-- 148 dropped `network_people(...)` because the page reads the view directly
-- now. The app change that stops calling it is committed (2ed7d77) and pushed
-- — and it CANNOT DEPLOY: the Vercel team has an overdue balance, the project
-- is paused, and getmandate.io answers 402 "Deployment Paused".
--
-- So the deployment that will come back when the account is reactivated is the
-- PREVIOUS one, whose code still calls `network_people(...)`. Against 148's
-- schema that RPC is gone, and the Network page would render "no people match"
-- to the first person who opened it — a broken page caused by a migration
-- landing ahead of its app.
--
-- This restores the function, exactly as 147 had it (correct, and slow at
-- scale for the reason 148 documents). Either app version now works.
--
-- ## FOUNDER / next session, in this order
--
--   1. clear the Vercel balance;
--   2. deploy `main` (the app that reads the view);
--   3. THEN drop this function again — it is the slow second way to read the
--      same rows, and 148's guard already says it should not exist.
--
-- Until step 2, the live Network page is the 147 read path: correct figures,
-- correct paging, ~800 ms per page at 2,135 people and a few ms at this org's
-- actual size.

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
  '§205 HOLD (migration 149) — kept alive only so the deployment that predates 2ed7d77 keeps working while Vercel is paused for billing. Drop it once the app that reads network_people_folded directly is live.';

REVOKE ALL ON FUNCTION public.network_people(text, text, text, text, text, text, text, text, integer, integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.network_people(text, text, text, text, text, text, text, text, integer, integer) TO authenticated, service_role;
