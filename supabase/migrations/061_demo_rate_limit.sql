-- 061 — a rate limit for /api/demo that survives more than one instance.
--
-- The endpoint is the public landing-page simulator: no auth, and it calls
-- Claude with the `web_search` tool (up to 3 uses), which is billed per
-- search on top of tokens. It is the most expensive thing an anonymous
-- stranger can make this product do.
--
-- Its limiter was a module-scoped `Map`. The comment above it was honest —
-- "adequate for the closed-beta marketing surface. Pre-public-launch we'll
-- swap this for Upstash" — but the consequence is worth stating plainly:
-- on Vercel the process is per-instance and instances scale out, so
-- "10 per hour per IP" is really "10 per hour per IP *per instance*", with
-- no ceiling on how many instances exist. It also resets on every deploy and
-- every cold start.
--
-- Two limits, because they stop different things:
--
--   * **Per IP, per hour** — unchanged at 10. Stops one visitor hammering
--     the demo, which is all the Map was ever aimed at.
--   * **Global, per day** — new, and the one that actually caps spend. A
--     per-IP limit is worthless against a caller who has many IPs, and
--     rotating IPs is cheap. This is a circuit breaker: whatever happens,
--     the public demo cannot cost more than a known number of runs per day.
--
-- Postgres rather than a new dependency: it is already here, already the
-- boundary for everything else, and a counter is not worth an Upstash
-- account. If the demo ever outgrows this, the shape moves without the
-- callers changing.
--
-- Fails CLOSED. If this function cannot be reached the route refuses the
-- request rather than calling Anthropic — an outage should cost nothing.

CREATE TABLE IF NOT EXISTS public.demo_rate_limit (
  -- 'ip:<addr>:<YYYYMMDDHH24>' or 'global:<YYYYMMDD>'. The window is in the
  -- key, so expiry is a delete rather than a reset and there is no window
  -- arithmetic to get wrong.
  bucket_key  text PRIMARY KEY,
  count       integer NOT NULL DEFAULT 0,
  expires_at  timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS demo_rate_limit_expires_idx
  ON public.demo_rate_limit (expires_at);

-- No policies, deliberately. Nothing reaches this table except the function
-- below, which is SECURITY DEFINER. `anon` holds table grants by Supabase
-- default, so RLS with zero policies is what actually closes it — otherwise
-- a stranger could read the traffic pattern or write the counters.
ALTER TABLE public.demo_rate_limit ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.check_demo_rate_limit(p_ip text)
RETURNS TABLE (allowed boolean, scope text, retry_after_seconds integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- Keep both in one place; the route reports them and the tests assert them.
  c_per_ip_hourly  constant integer := 10;
  c_global_daily   constant integer := 200;

  v_now         timestamptz := now();
  v_ip_key      text;
  v_global_key  text;
  v_ip_count    integer;
  v_global_ct   integer;
BEGIN
  -- Opportunistic prune. Bounded so a single unlucky request never pays for
  -- a large sweep; the index makes it cheap.
  DELETE FROM public.demo_rate_limit
   WHERE bucket_key IN (
     SELECT bucket_key FROM public.demo_rate_limit
      WHERE expires_at < v_now LIMIT 100
   );

  v_ip_key := 'ip:' || coalesce(nullif(p_ip, ''), 'unknown') || ':'
              || to_char(v_now, 'YYYYMMDDHH24');
  v_global_key := 'global:' || to_char(v_now, 'YYYYMMDD');

  -- The global counter first: if the day is spent, do not also burn the
  -- caller's own allowance on a request that was never going to run.
  INSERT INTO public.demo_rate_limit (bucket_key, count, expires_at)
  VALUES (v_global_key, 1, date_trunc('day', v_now) + interval '1 day')
  ON CONFLICT (bucket_key)
    DO UPDATE SET count = public.demo_rate_limit.count + 1
  RETURNING public.demo_rate_limit.count INTO v_global_ct;

  IF v_global_ct > c_global_daily THEN
    RETURN QUERY SELECT
      false,
      'global'::text,
      GREATEST(1, EXTRACT(epoch FROM
        (date_trunc('day', v_now) + interval '1 day') - v_now)::integer);
    RETURN;
  END IF;

  INSERT INTO public.demo_rate_limit (bucket_key, count, expires_at)
  VALUES (v_ip_key, 1, date_trunc('hour', v_now) + interval '1 hour')
  ON CONFLICT (bucket_key)
    DO UPDATE SET count = public.demo_rate_limit.count + 1
  RETURNING public.demo_rate_limit.count INTO v_ip_count;

  IF v_ip_count > c_per_ip_hourly THEN
    RETURN QUERY SELECT
      false,
      'ip'::text,
      GREATEST(1, EXTRACT(epoch FROM
        (date_trunc('hour', v_now) + interval '1 hour') - v_now)::integer);
    RETURN;
  END IF;

  RETURN QUERY SELECT true, 'ok'::text, 0;
END;
$$;

-- anon on purpose: the caller is a stranger on the marketing page and has no
-- session. Same deliberate shape as `verify_hm_token` (023) — a narrow
-- SECURITY DEFINER function is the entire API, and it takes no parameter it
-- would trust for anything but a bucket name. It will appear in the advisor
-- for that reason; §5g lists the others that do.
REVOKE ALL ON FUNCTION public.check_demo_rate_limit(text) FROM public;
GRANT EXECUTE ON FUNCTION public.check_demo_rate_limit(text) TO anon, authenticated;
