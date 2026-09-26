-- 145 — THE NETWORK FOLD MOVES INTO POSTGRES, AND THE 2000-ROW CAP GOES
--
-- Gate: docs/superpowers/specs/2026-09-25-network-fold-in-postgres-gate.md
-- (CONFIRMED, four rulings, all recommendations taken).
--
-- ## Why, measured on production before a line was written
--
-- The Network page folded candidate rows into people in Node, over a window
-- of the 2000 most recently updated rows. Three probes, each in an aborting
-- transaction against a 2,100-row pool:
--
--   bytes the page ships TODAY (2000 rows):  42,497 KB  (cv_structured: 42,217 KB)
--   bytes ONE folded page of 25 needs:           13 KB
--
-- 99.3% of that payload was `cv_structured`, shipped for every row so the
-- fold could read THREE fields from each person's canonical row. And the cap
-- did not merely shorten the list:
--
--   people the page can see (window 2000): 2000
--   people who actually exist:             2100   <- the badge said this
--
--   person is on the page:                 t
--   mandates the page can see for them:    1   <- "Considered for 1 project"
--   mandates they are actually on:         2
--
-- The second block is the divergence §204 had just closed, reopening above
-- the cap. The third is worse: a person who IS on the page carried a FALSE
-- record — one appearance instead of two, a worse best tier, an older last
-- active, and no "Returning" badge for somebody returning. §175's class, at
-- the top of the page.
--
-- What Postgres does instead, same pool: page 1 in 65 ms, page 81
-- (OFFSET 2000) in 4 ms, the whole-pool rollup in 3 ms. Deep paging is free,
-- so OFFSET is enough and keyset paging would be ceremony.
--
-- ## Shape
--
-- `network_people_folded` is the ONE fold. The paged reader and the rollup
-- both select from it, so the table and the figures above it cannot disagree
-- about who matches — the failure mode a second transcription would bring
-- back (it has cost this product twice: §201's fourth `identityKey`, and
-- §204's badge counting keys while the page counted people).
--
-- ## Scope (D4)
--
-- Every function here is SECURITY INVOKER and STABLE, for the reason 040 and
-- 045 already document: the org scope is RLS's job, and a DEFINER function
-- would aggregate one organisation's network into another's count. Granted to
-- `authenticated` and `service_role` only — the anon roster is untouched.
-- Nothing here writes, so the app-recordable door is untouched too.
--
-- ## Search (D3)
--
-- 617 ms per keystroke for one unindexed ILIKE across name/title/company plus
-- `cv_structured ->> 'domain'` was the measurement. So `pg_trgm` and five GIN
-- indexes, including the two JSON expressions — skills stay searchable,
-- because "who has run an SAP migration" is a large part of why this page is
-- opened.
--
-- ONE DEVIATION FROM THE PAGE'S OLD BEHAVIOUR, deliberate and recorded: the
-- search matches ANY of a person's records, where the client matched only the
-- canonical one. It is what makes the trigram indexes reachable at all (an
-- ILIKE over an aggregated column cannot use them), and it is the more useful
-- answer: somebody who was at Acme should be findable by "Acme" after their
-- newest CV says NewCo. It can only ever return MORE people, never fewer, so
-- it cannot hide anybody the old behaviour found.

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

-- ---------------------------------------------------------------------------
-- 1. The indexes the search now leans on.
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS candidates_full_name_trgm
  ON public.candidates USING gin (full_name extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS candidates_current_title_trgm
  ON public.candidates USING gin (current_title extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS candidates_current_company_trgm
  ON public.candidates USING gin (current_company extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS candidates_cv_domain_trgm
  ON public.candidates USING gin ((cv_structured ->> 'domain') extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS candidates_cv_tech_trgm
  ON public.candidates USING gin (((cv_structured -> 'tech_exposure')::text) extensions.gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- 2. The fold — one row per PERSON, filtered, unpaged, unordered.
-- ---------------------------------------------------------------------------
--
-- Rows with `network_profile_id IS NULL` are excluded here, which is §196/139
-- carried up and §204's D2: while a CV is still being read and the only
-- identity signal is a name, there is no person yet. `network_people_rollup`
-- counts them separately so the page can say how many it is holding back.
--
-- Filter semantics match what the client did, field for field: archetype,
-- domain and years read the CANONICAL (most recently updated) record, stage
-- matches ANY appearance, tier is the person's BEST across appearances. The
-- one deliberate change is search, documented in the header.

CREATE OR REPLACE FUNCTION public.network_people_folded(
  p_q         text DEFAULT NULL,
  p_archetype text DEFAULT NULL,
  p_tier      text DEFAULT NULL,
  p_domain    text DEFAULT NULL,
  p_stage     text DEFAULT NULL,
  p_years     text DEFAULT NULL
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
  is_returning           boolean
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH term AS (
    SELECT nullif(btrim(coalesce(p_q, '')), '') AS q
  ),
  matched AS (
    -- Only reachable when a term was typed. Written against the BASE table so
    -- the trigram indexes apply; an ILIKE over an aggregate cannot use them.
    SELECT DISTINCT c.network_profile_id AS pid
      FROM public.candidates c, term t
     WHERE t.q IS NOT NULL
       AND c.network_profile_id IS NOT NULL
       AND (
            c.full_name ILIKE '%' || t.q || '%'
         OR c.current_title ILIKE '%' || t.q || '%'
         OR c.current_company ILIKE '%' || t.q || '%'
         OR (c.cv_structured ->> 'domain') ILIKE '%' || t.q || '%'
         OR ((c.cv_structured -> 'tech_exposure')::text) ILIKE '%' || t.q || '%'
       )
  ),
  base AS (
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
      c.cv_structured,
      s.overall_score,
      s.tier,
      row_number() OVER (
        PARTITION BY c.network_profile_id ORDER BY c.updated_at DESC, c.id
      ) AS rn
    FROM public.candidates c
    LEFT JOIN public.candidate_scores s ON s.candidate_id = c.id
    WHERE c.network_profile_id IS NOT NULL
  ),
  people AS (
    SELECT
      b.pid,
      -- NOTE: Postgres has no max(uuid) or max(jsonb) aggregate, so the
      -- canonical row's id and its tech list are picked with array_agg(...)[1]
      -- under the same rn = 1 filter as everything else here.
      (array_agg(b.id) FILTER (WHERE b.rn = 1))[1] AS canonical_candidate_id,
      max(b.full_name)       FILTER (WHERE b.rn = 1) AS full_name,
      max(b.current_title)   FILTER (WHERE b.rn = 1) AS current_title,
      max(b.current_company) FILTER (WHERE b.rn = 1) AS current_company,
      max(b.email)           FILTER (WHERE b.rn = 1) AS email,
      max(b.linkedin_url)    FILTER (WHERE b.rn = 1) AS linkedin_url,
      max(b.archetype)       FILTER (WHERE b.rn = 1) AS archetype,
      max(b.cv_structured ->> 'domain') FILTER (WHERE b.rn = 1) AS domain,
      max(
        CASE WHEN jsonb_typeof(b.cv_structured -> 'years_experience') = 'number'
             THEN (b.cv_structured ->> 'years_experience')::numeric END
      ) FILTER (WHERE b.rn = 1) AS years_experience,
      (array_agg(b.cv_structured -> 'tech_exposure')
         FILTER (WHERE b.rn = 1))[1] AS tech_exposure,
      -- Best tier is the LOWEST rank number: tier_1 beats tier_4.
      min(
        CASE b.tier WHEN 'tier_1' THEN 1 WHEN 'tier_2' THEN 2
                    WHEN 'tier_3' THEN 3 WHEN 'tier_4' THEN 4 END
      ) AS best_tier_rank,
      max(b.overall_score) AS best_score,
      avg(b.overall_score) AS average_score,
      max(b.updated_at)    AS last_active_at,
      count(*) FILTER (WHERE b.project_id IS NOT NULL)::integer AS appearance_count,
      count(DISTINCT b.project_id)::integer AS project_count,
      bool_or(
        b.tier IN ('tier_1', 'tier_2')
        OR b.pipeline_stage IN ('shortlisted', 'submitted', 'interviewed',
                                'passed_rounds', 'finalist', 'offer', 'hired')
      ) AS shortlisted_before,
      array_agg(DISTINCT b.pipeline_stage) FILTER (WHERE b.pipeline_stage IS NOT NULL) AS stages
    FROM base b
    GROUP BY b.pid
  )
  SELECT
    p.pid,
    p.canonical_candidate_id,
    p.full_name,
    p.current_title,
    p.current_company,
    p.email,
    p.linkedin_url,
    p.archetype,
    p.domain,
    p.years_experience,
    coalesce(p.tech_exposure, '[]'::jsonb),
    CASE p.best_tier_rank WHEN 1 THEN 'tier_1' WHEN 2 THEN 'tier_2'
                          WHEN 3 THEN 'tier_3' WHEN 4 THEN 'tier_4' END,
    p.best_score,
    p.average_score,
    p.last_active_at,
    p.appearance_count,
    p.project_count,
    coalesce(p.shortlisted_before, false),
    p.project_count >= 2
  FROM people p, term t
  WHERE (t.q IS NULL OR p.pid IN (SELECT pid FROM matched))
    AND (p_archetype IS NULL OR p.archetype = p_archetype)
    AND (p_domain    IS NULL OR p.domain = p_domain)
    AND (p_stage     IS NULL OR p_stage = ANY(coalesce(p.stages, ARRAY[]::text[])))
    AND (p_tier      IS NULL OR p.best_tier_rank = CASE p_tier
           WHEN 'tier_1' THEN 1 WHEN 'tier_2' THEN 2
           WHEN 'tier_3' THEN 3 WHEN 'tier_4' THEN 4 END)
    AND (p_years IS NULL OR CASE p_years
           WHEN '0-5'   THEN coalesce(p.years_experience, 0) <= 5
           WHEN '6-10'  THEN coalesce(p.years_experience, 0) BETWEEN 6 AND 10
           WHEN '11-20' THEN coalesce(p.years_experience, 0) BETWEEN 11 AND 20
           WHEN '21+'   THEN coalesce(p.years_experience, 0) >= 21
           ELSE true END);
$$;

COMMENT ON FUNCTION public.network_people_folded(text, text, text, text, text, text) IS
  '§205 — the Network page''s fold: one row per network_profile_id, filtered, unpaged. The single source both network_people() and network_people_rollup() read, so the table and the figures above it cannot disagree about who matches. Rows with no person yet (§196/139) are excluded; the rollup counts them separately.';

-- ---------------------------------------------------------------------------
-- 3. One page of people, with their appearances.
-- ---------------------------------------------------------------------------
--
-- Sorting is a CASE ladder rather than dynamic SQL: the sort key and
-- direction arrive from a query string, and the page's allowlist
-- (`parseListParams`) is not the last line of defence.
--
-- THE TIEBREAK IS LOAD-BEARING. Without a total order, two people with the
-- same score sit in an arbitrary relative position that can differ between
-- the query for page 1 and the query for page 2 — so a person can appear
-- twice, or never, and the pager looks fine while doing it.

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
  WITH page AS (
    SELECT f.*
      FROM public.network_people_folded(
             p_q, p_archetype, p_tier, p_domain, p_stage, p_years) f
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
    pg.years_experience, pg.tech_exposure, pg.best_tier, pg.best_score,
    pg.average_score, pg.last_active_at, pg.appearance_count, pg.project_count,
    pg.shortlisted_before, pg.is_returning,
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
  '§205 — one page of the Network table. Appearances are gathered for the page only; the old Node fold shipped every candidate row''s cv_structured (42 MB for a 2000-row window) to read three fields. Sort is a CASE ladder, and the (last_active_at, profile_id) tiebreak is what stops OFFSET paging repeating or skipping a person.';

-- ---------------------------------------------------------------------------
-- 4. The figures above the table (D2), over the whole FILTERED pool.
-- ---------------------------------------------------------------------------
--
-- These were computed in Node from the same array the table rendered. Under
-- paging that array is one page, so "005 executives in network" would have
-- become a description of 25 rows wearing the word "network" — which is how
-- the window made it wrong in the first place.
--
-- `people_pending` is the honest counterpart: rows with no person yet are not
-- in any figure here, and the page says how many it is holding back.

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
    SELECT * FROM public.network_people_folded(
                     p_q, p_archetype, p_tier, p_domain, p_stage, p_years)
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
  '§205 — the Network page''s figures, over the whole FILTERED pool rather than the page. Reads network_people_folded, the same fold the table reads, so the headline count and the rows can never disagree.';

-- ---------------------------------------------------------------------------
-- 5. The domain dropdown.
-- ---------------------------------------------------------------------------
--
-- Its options came from the loaded people, so under paging it would only ever
-- offer the domains on page one — a filter that hides the values it filters by.

CREATE OR REPLACE FUNCTION public.network_domains()
RETURNS TABLE (domain text)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT DISTINCT c.cv_structured ->> 'domain' AS domain
    FROM public.candidates c
   WHERE c.network_profile_id IS NOT NULL
     AND nullif(btrim(coalesce(c.cv_structured ->> 'domain', '')), '') IS NOT NULL
   ORDER BY 1;
$$;

COMMENT ON FUNCTION public.network_domains() IS
  '§205 — distinct domains for the Network page''s filter, so the dropdown offers every value in the pool rather than the ones that happen to be on page one.';

-- ---------------------------------------------------------------------------
-- 6. Grants — the ruled set, nothing wider (D4).
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.network_people_folded(text, text, text, text, text, text) FROM public, anon;
REVOKE ALL ON FUNCTION public.network_people(text, text, text, text, text, text, text, text, integer, integer) FROM public, anon;
REVOKE ALL ON FUNCTION public.network_people_rollup(text, text, text, text, text, text) FROM public, anon;
REVOKE ALL ON FUNCTION public.network_domains() FROM public, anon;

GRANT EXECUTE ON FUNCTION public.network_people_folded(text, text, text, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.network_people(text, text, text, text, text, text, text, text, integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.network_people_rollup(text, text, text, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.network_domains() TO authenticated, service_role;
