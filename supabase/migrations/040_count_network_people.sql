-- Network badge — count distinct people in Postgres instead of in Node.
--
-- `countNetworkPeople()` (src/lib/network/network-aggregator.ts) selected
-- five columns for EVERY candidate row the caller can see, streamed them all
-- to the server, and deduped them in JavaScript — to render one number in the
-- sidebar. That runs in the dashboard layout, so it happened on every one of
-- the ~40 authenticated routes, and the row count grew with the org's whole
-- candidate pool.
--
-- This function computes the identical number in one round trip returning a
-- single integer. The CASE below is a literal transcription of `identityKey`
-- in that file — email, else linkedin (one trailing slash trimmed), else
-- name|company — so the badge keeps matching the Network page exactly. If
-- that function's precedence ever changes, change this one in the same commit.
--
-- SECURITY INVOKER (the default) is load-bearing: the count must be scoped by
-- the caller's RLS, so a user only ever counts their own organization's pool.

CREATE OR REPLACE FUNCTION public.count_network_people()
RETURNS integer
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COUNT(DISTINCT
    CASE
      WHEN NULLIF(btrim(c.email), '') IS NOT NULL
        THEN 'email:' || lower(btrim(c.email))
      WHEN NULLIF(btrim(c.linkedin_url), '') IS NOT NULL
        THEN 'linkedin:' || regexp_replace(lower(btrim(c.linkedin_url)), '/$', '')
      ELSE
        'name:' || lower(btrim(c.full_name))
                || '|' || lower(btrim(COALESCE(c.current_company, '')))
    END
  )::integer
  FROM public.candidates AS c;
$$;

REVOKE ALL ON FUNCTION public.count_network_people() FROM public, anon;

GRANT EXECUTE ON FUNCTION public.count_network_people() TO authenticated, service_role;
