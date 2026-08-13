-- Portfolio analytics — count candidates in Postgres instead of in Node.
--
-- `/app/analytics` selected `pipeline_stage, created_at` for EVERY candidate
-- row the caller can see, streamed them all to the server, and built two
-- histograms in JavaScript: a stage distribution and an eight-week velocity
-- series. Both are GROUP BY queries. The transfer grew with the org's whole
-- candidate pool to render two charts with eleven and eight bars.
--
-- Same shape of fix as `count_network_people` (migration 040), and the same
-- reasoning about SECURITY INVOKER: these must be scoped by the caller's RLS
-- so a user only ever aggregates their own organization's pool. Declaring
-- them SECURITY DEFINER here would leak counts across organizations.
--
-- STABLE rather than IMMUTABLE: both read tables, and the weekly one reads
-- now().

-- Candidates per pipeline stage.
--
-- Returns only stages that have rows; the page owns the full stage list and
-- its display order, and fills the zeroes. A stage absent from this result
-- is a stage with no candidates, which is a different statement from a
-- stage the product no longer has.
CREATE OR REPLACE FUNCTION public.candidate_stage_counts()
RETURNS TABLE (pipeline_stage text, candidate_count integer)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    COALESCE(c.pipeline_stage, 'found') AS pipeline_stage,
    COUNT(*)::integer AS candidate_count
  FROM public.candidates AS c
  GROUP BY COALESCE(c.pipeline_stage, 'found');
$$;

-- Candidates added per week, bucketed backwards from now.
--
-- Bucket 0 is the last seven days, bucket 1 the seven before that. Rows with
-- no created_at, or older than the window, are excluded rather than folded
-- into the oldest bucket — a bar labelled "7 weeks ago" should mean that
-- week, not "that week and everything before it".
CREATE OR REPLACE FUNCTION public.candidate_weekly_counts(p_weeks integer)
RETURNS TABLE (weeks_ago integer, candidate_count integer)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    FLOOR(EXTRACT(EPOCH FROM (now() - c.created_at)) / 604800)::integer
      AS weeks_ago,
    COUNT(*)::integer AS candidate_count
  FROM public.candidates AS c
  WHERE c.created_at IS NOT NULL
    AND c.created_at > now() - (GREATEST(p_weeks, 0) * INTERVAL '7 days')
  GROUP BY 1;
$$;

REVOKE ALL ON FUNCTION public.candidate_stage_counts() FROM public, anon;
REVOKE ALL ON FUNCTION public.candidate_weekly_counts(integer) FROM public, anon;

GRANT EXECUTE ON FUNCTION public.candidate_stage_counts()
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.candidate_weekly_counts(integer)
  TO authenticated, service_role;

-- The two columns these group by, and the one the candidates list now
-- filters and orders on. Without these the aggregates are a sequential scan
-- of the whole table and the list's ORDER BY ... LIMIT is a full sort.
CREATE INDEX IF NOT EXISTS candidates_pipeline_stage_idx
  ON public.candidates (pipeline_stage);
CREATE INDEX IF NOT EXISTS candidates_created_at_idx
  ON public.candidates (created_at DESC);
CREATE INDEX IF NOT EXISTS candidates_updated_at_idx
  ON public.candidates (updated_at DESC);
CREATE INDEX IF NOT EXISTS candidates_project_id_idx
  ON public.candidates (project_id);
