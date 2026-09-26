-- 146 — THE FOLD BECOMES A VIEW, AND THE SEARCH GETS A COLUMN IT CAN INDEX
--
-- Gate: docs/superpowers/specs/2026-09-25-network-fold-in-postgres-gate.md
-- (same gate as 145 — this is 145 corrected by its own drive).
--
-- ## What drive 137 found, at scale, through the shipped functions
--
--   network_people() page 1, 2,135 people:   4,644 ms   (cold)
--                                              849 ms   (after ANALYZE)
--
-- against the 65 ms the gate measured for the same work hand-written. The
-- page was correct — badge and rollup agreed at 2,135, and a person on two
-- mandates read two on any page — but it was SLOW, and a gate measurement
-- that the shipped thing cannot reproduce is not a measurement, it is a hope.
--
-- Three probes, each in an aborting transaction, found two causes:
--
-- 1. THE FOLD WAS A FUNCTION, AND POSTGRES COULD NOT INLINE IT.
--    `EXPLAIN` said `Function Scan on network_people_folded` — a SQL function
--    whose body is a WITH query is opaque to the planner, so every call
--    materialised all 2,135 people through a tuplestore before the caller
--    filtered, sorted or counted them. The identical SQL hand-written took
--    53 ms; through the function, 830 ms.
--
--      folded(), as shipped:                  826 ms
--      same body, subqueries instead of CTEs:  216 ms
--      same body as a VIEW:                      8 ms
--
--    A view is macro-expanded into the caller's query, so ORDER BY, LIMIT and
--    the filters plan as one statement. That is the whole fix.
--
-- 2. THE SEARCH NEVER REACHED ITS INDEXES. Five ILIKEs across five columns
--    planned as a Seq Scan (proven by EXPLAIN), and one of them detoasts a
--    15 KB jsonb per row:
--
--      the matching set, five-way OR:         403 ms
--      the same, one generated column:          1 ms
--
--    So the five trigram indexes from 145 are replaced by ONE stored
--    generated column carrying the searchable text, with one GIN index on it.
--    The planner gets a single cheap predicate on an inline column, and the
--    row's toasted CV is never touched to answer "who mentions Alteryx".
--
-- Measured after this migration, same 2,135-person pool:
--
--      page 1                    16 ms
--      page 81 (OFFSET 2000)      4 ms
--      whole-pool rollup          3 ms
--      search predicate           1 ms
--      searched page of people    3 ms
--
-- ## Cost to be honest about
--
-- Adding a STORED generated column rewrites the table. On this org's 36 rows
-- it is instantaneous; the probe's 2,136 rows carrying real 15 KB CVs took
-- 6.1 s. A pool in the hundreds of thousands would want a maintenance window
-- — worth knowing before this ships to a big client, and cheap now.
--
-- ## Scope, unchanged from 145 (D4)
--
-- The view is `security_invoker = true`, so RLS on `candidates` scopes it to
-- the caller's organisation exactly as the functions do. Everything stays
-- STABLE and SECURITY INVOKER, granted to `authenticated` and `service_role`
-- only; anon roster untouched, app-recordable door untouched, nothing writes.

-- ---------------------------------------------------------------------------
-- 1. One searchable column, one index.
-- ---------------------------------------------------------------------------

ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS cv_search text GENERATED ALWAYS AS (
    lower(
      coalesce(full_name, '') || ' ' ||
      coalesce(current_title, '') || ' ' ||
      coalesce(current_company, '') || ' ' ||
      coalesce(cv_structured ->> 'domain', '') || ' ' ||
      coalesce((cv_structured -> 'tech_exposure')::text, '')
    )
  ) STORED;

COMMENT ON COLUMN public.candidates.cv_search IS
  '§205 — the five fields the Network search box promises, lowercased into one inline column so the trigram index is reachable and the row''s toasted CV is never detoasted to answer a search. Derived, never written to.';

CREATE INDEX IF NOT EXISTS candidates_cv_search_trgm
  ON public.candidates USING gin (cv_search extensions.gin_trgm_ops);

-- 145's five indexes are superseded: a five-way OR across them planned as a
-- Seq Scan anyway (EXPLAIN, drive 137), and five GIN indexes is five times the
-- write amplification on every candidate insert for no read anybody makes.
DROP INDEX IF EXISTS public.candidates_full_name_trgm;
DROP INDEX IF EXISTS public.candidates_current_title_trgm;
DROP INDEX IF EXISTS public.candidates_current_company_trgm;
DROP INDEX IF EXISTS public.candidates_cv_domain_trgm;
DROP INDEX IF EXISTS public.candidates_cv_tech_trgm;

-- ---------------------------------------------------------------------------
-- 2. The fold, as a view — ONE definition, planned inside its callers.
-- ---------------------------------------------------------------------------
--
-- Same rule as 145's function, same filter semantics: the canonical record is
-- the most recently updated one (D3), rows with no person yet are excluded
-- (§196/139, §204 D2), and best tier is the lowest rank rather than the
-- alphabetical maximum.

DROP FUNCTION IF EXISTS public.network_people_folded(text, text, text, text, text, text);

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
    -- Best tier is the LOWEST rank number: tier_1 beats tier_4.
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
    array_agg(DISTINCT b.pipeline_stage) FILTER (WHERE b.pipeline_stage IS NOT NULL) AS stages
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
  '§205 — the Network page''s fold: one row per network_profile_id. A VIEW rather than a function because Postgres inlines it into the caller''s plan; as a function it was a Function Scan that materialised every person before anyone filtered (830 ms vs 8 ms at 2,135 people, drive 137). security_invoker: the org scope stays RLS''s job.';

-- ---------------------------------------------------------------------------
-- 3. The filter rule, written once.
-- ---------------------------------------------------------------------------
--
-- A pure expression, so the planner inlines it into both callers: the page and
-- the figures above it then cannot disagree about who matches, which is the
-- drift §201 and §204 each paid a slice for. Search is deliberately NOT here —
-- it is a semijoin against `cv_search`, and a sub-select in this body would
-- stop it being inlined at all.

CREATE OR REPLACE FUNCTION public.network_people_matches(
  p_row_archetype text,
  p_row_domain    text,
  p_row_tier      text,
  p_row_years     numeric,
  p_row_stages    text[],
  p_archetype     text,
  p_tier          text,
  p_domain        text,
  p_stage         text,
  p_years         text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT (p_archetype IS NULL OR p_row_archetype = p_archetype)
     AND (p_domain    IS NULL OR p_row_domain = p_domain)
     AND (p_tier      IS NULL OR p_row_tier = p_tier)
     AND (p_stage     IS NULL OR p_stage = ANY(coalesce(p_row_stages, ARRAY[]::text[])))
     AND (p_years IS NULL OR CASE p_years
            WHEN '0-5'   THEN coalesce(p_row_years, 0) <= 5
            WHEN '6-10'  THEN coalesce(p_row_years, 0) BETWEEN 6 AND 10
            WHEN '11-20' THEN coalesce(p_row_years, 0) BETWEEN 11 AND 20
            WHEN '21+'   THEN coalesce(p_row_years, 0) >= 21
            ELSE true END);
$$;

COMMENT ON FUNCTION public.network_people_matches(text, text, text, numeric, text[], text, text, text, text, text) IS
  '§205 — the Network page''s filter rule, written once and inlined into both the paged reader and the rollup. Archetype, domain and years read the canonical record; stage matches ANY appearance; tier is the person''s best.';

-- ---------------------------------------------------------------------------
-- 4. One page of people, and the figures — both filtering the same view.
-- ---------------------------------------------------------------------------

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
  FROM (
    SELECT f.*
      FROM public.network_people_folded f
     WHERE (p_q IS NULL OR f.profile_id IN (
             SELECT m.network_profile_id FROM public.candidates m
              WHERE m.cv_search LIKE '%' || lower(btrim(p_q)) || '%'))
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
  ) pg;
$$;

COMMENT ON FUNCTION public.network_people(text, text, text, text, text, text, text, text, integer, integer) IS
  '§205 — one page of the Network table, filtering the network_people_folded view. Appearances are gathered for the page only. Sort is a CASE ladder — a query-string key never reaches SQL as an identifier — and the (last_active_at, profile_id) tiebreak is what stops OFFSET paging repeating or skipping a person.';

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
  WITH f AS (
    SELECT * FROM public.network_people_folded v
     WHERE (p_q IS NULL OR v.profile_id IN (
             SELECT m.network_profile_id FROM public.candidates m
              WHERE m.cv_search LIKE '%' || lower(btrim(p_q)) || '%'))
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
  '§205 — the Network page''s figures, over the whole FILTERED pool rather than the page, through the same view and the same predicate the table uses. Computed from the loaded rows they would describe 25 people wearing the word "network".';

-- Re-stated rather than inherited: CREATE OR REPLACE keeps 145's grants, but
-- a migration that can only be replayed correctly in company with its
-- predecessor is a migration nobody can read on its own.
REVOKE ALL ON FUNCTION public.network_people(text, text, text, text, text, text, text, text, integer, integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.network_people(text, text, text, text, text, text, text, text, integer, integer) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.network_people_rollup(text, text, text, text, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.network_people_rollup(text, text, text, text, text, text) TO authenticated, service_role;

REVOKE ALL ON public.network_people_folded FROM public, anon;
GRANT SELECT ON public.network_people_folded TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.network_people_matches(text, text, text, numeric, text[], text, text, text, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.network_people_matches(text, text, text, numeric, text[], text, text, text, text, text) TO authenticated, service_role;
