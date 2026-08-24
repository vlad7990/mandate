-- 088 — rate limiting for every unauthenticated door (NEXT-rate-limiting,
-- D1–D8 confirmed 2026-08-24). The first migration since the
-- fourteen-agent map closed.
--
-- This is 061 generalised, not replaced: same bucket-key-carries-the-
-- window design (expiry is a delete, no window arithmetic to get
-- wrong), same zero-policy RLS (the SECURITY DEFINER function is the
-- entire API), same opportunistic prune, same two-limits reasoning —
-- a per-key cap stops one hammering caller, the GLOBAL daily cap is
-- the circuit breaker that actually bounds spend, because rotating
-- IPs is cheap.
--
-- What 088 adds over 061:
--
--   * `rate_limit_policy` — the caps as DATA. Raising a ceiling is an
--     UPDATE, not a deploy. One row per scope; a door with two keys
--     (the HM submit's token AND ip) is two scopes, with the global
--     cap counted on exactly one of them so a request is never
--     double-billed against the day.
--   * `check_rate_limit(p_scope, p_key)` — one function for every
--     door. An UNKNOWN scope RAISES rather than refusing: a typo'd
--     scope is a programming error, and raising routes it through the
--     app's D3 split (money fails closed, identity fails open)
--     instead of silently locking a door the app thought was open.
--   * Keys arrive PRE-HASHED (D6): the app sends a salted hash of the
--     IP or email, never the raw value. The database never learns a
--     caller's address; a counter needs identity-of-caller, not
--     identity-of-person.
--
-- `/api/demo` migrates onto the shared table with its numbers intact
-- (10/hr/IP, 200/day): `check_demo_rate_limit` becomes a thin wrapper
-- over the general function so the deployed route keeps working
-- mid-rollout; the route moves to the shared helper at leisure.

-- ---------------------------------------------------------------------------
-- 1. The policy table — caps as data
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.rate_limit_policy (
  scope              text PRIMARY KEY,
  per_key_limit      integer NOT NULL CHECK (per_key_limit > 0),
  window_seconds     integer NOT NULL CHECK (window_seconds > 0),
  -- NULL = no global cap for this scope. Doors where a global cap is
  -- a self-inflicted outage (sign-in) leave it NULL.
  global_daily_limit integer CHECK (global_daily_limit IS NULL OR global_daily_limit > 0)
);

ALTER TABLE public.rate_limit_policy ENABLE ROW LEVEL SECURITY;
-- Zero policies, deliberately — the 061 shape. anon holds table grants
-- by Supabase default; RLS with no policies is what closes the table.

INSERT INTO public.rate_limit_policy (scope, per_key_limit, window_seconds, global_daily_limit) VALUES
  -- Tier 1 — anonymous and billed (fail CLOSED, app-side).
  ('demo_ip',               10, 3600, 200),
  ('hm_submit_token',        5, 3600, 300),
  ('hm_submit_ip',          30, 3600, NULL),
  ('portal_submit_token',    5, 3600, 300),
  ('portal_submit_ip',      30, 3600, NULL),
  -- Tier 2 — anonymous, unbilled, abusable (fail OPEN, app-side).
  ('access_request_ip',      3, 3600, 100),
  ('recovery_ip',            3, 3600, 200),
  ('recovery_email',         3, 3600, NULL),
  ('sign_in_ip',            10, 3600, NULL),
  ('sign_up_ip',             5, 3600, 100),
  ('candidate_portal_token', 20, 3600, NULL)
ON CONFLICT (scope) DO UPDATE
  SET per_key_limit = EXCLUDED.per_key_limit,
      window_seconds = EXCLUDED.window_seconds,
      global_daily_limit = EXCLUDED.global_daily_limit;

-- ---------------------------------------------------------------------------
-- 2. The counter table — 061's shape, shared
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.rate_limit (
  -- '<scope>:<hashed-key>:<window-bucket>' or 'global:<scope>:<YYYYMMDD>'.
  bucket_key  text PRIMARY KEY,
  count       integer NOT NULL DEFAULT 0,
  expires_at  timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS rate_limit_expires_idx
  ON public.rate_limit (expires_at);

ALTER TABLE public.rate_limit ENABLE ROW LEVEL SECURITY;
-- Zero policies, deliberately — see above.

-- ---------------------------------------------------------------------------
-- 3. The one function
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.check_rate_limit(p_scope text, p_key text)
RETURNS TABLE (allowed boolean, reason text, retry_after_seconds integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_policy      public.rate_limit_policy%ROWTYPE;
  v_now         timestamptz := now();
  v_epoch       bigint;
  v_bucket      bigint;
  v_key         text;
  v_key_expires timestamptz;
  v_global_key  text;
  v_count       integer;
  v_global_ct   integer;
BEGIN
  SELECT * INTO v_policy FROM public.rate_limit_policy WHERE scope = p_scope;
  IF NOT FOUND THEN
    -- A typo'd scope is a programming error. Raising (rather than
    -- refusing) routes it through the caller's D3 fail mode: a money
    -- door refuses, an identity door stays open and captures.
    RAISE EXCEPTION 'check_rate_limit: unknown scope %', p_scope;
  END IF;

  -- Opportunistic prune, bounded so no single request pays for a sweep.
  DELETE FROM public.rate_limit
   WHERE bucket_key IN (
     SELECT bucket_key FROM public.rate_limit
      WHERE expires_at < v_now LIMIT 100
   );

  -- The global counter first (061's ordering): if the day is spent, do
  -- not also burn the caller's own allowance on a request that was
  -- never going to run.
  IF v_policy.global_daily_limit IS NOT NULL THEN
    v_global_key := 'global:' || p_scope || ':' || to_char(v_now, 'YYYYMMDD');
    INSERT INTO public.rate_limit (bucket_key, count, expires_at)
    VALUES (v_global_key, 1, date_trunc('day', v_now) + interval '1 day')
    ON CONFLICT (bucket_key)
      DO UPDATE SET count = public.rate_limit.count + 1
    RETURNING public.rate_limit.count INTO v_global_ct;

    IF v_global_ct > v_policy.global_daily_limit THEN
      RETURN QUERY SELECT
        false, 'global'::text,
        GREATEST(1, EXTRACT(epoch FROM
          (date_trunc('day', v_now) + interval '1 day') - v_now)::integer);
      RETURN;
    END IF;
  END IF;

  -- The per-key window: the bucket number is in the key, so expiry is
  -- a delete and two instances always agree on which window this is.
  v_epoch := EXTRACT(epoch FROM v_now)::bigint;
  v_bucket := v_epoch / v_policy.window_seconds;
  v_key := p_scope || ':' || coalesce(nullif(p_key, ''), 'unknown') || ':' || v_bucket::text;
  v_key_expires := to_timestamp((v_bucket + 1) * v_policy.window_seconds);

  INSERT INTO public.rate_limit (bucket_key, count, expires_at)
  VALUES (v_key, 1, v_key_expires)
  ON CONFLICT (bucket_key)
    DO UPDATE SET count = public.rate_limit.count + 1
  RETURNING public.rate_limit.count INTO v_count;

  IF v_count > v_policy.per_key_limit THEN
    RETURN QUERY SELECT
      false, 'key'::text,
      GREATEST(1, EXTRACT(epoch FROM (v_key_expires - v_now))::integer);
    RETURN;
  END IF;

  RETURN QUERY SELECT true, 'ok'::text, 0;
END;
$$;

-- anon on purpose: the callers are strangers with no session — the
-- same deliberate shape as check_demo_rate_limit (061) and
-- verify_hm_token (023). The function takes no parameter it trusts
-- for anything but a bucket name, and the keys arrive pre-hashed.
REVOKE ALL ON FUNCTION public.check_rate_limit(text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, text) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. /api/demo migrates — the old function becomes a thin wrapper
-- ---------------------------------------------------------------------------

-- Kept for one release so the deployed route keeps working mid-rollout;
-- the route then moves to the shared helper and this wrapper is dropped
-- in a later migration. The old 'ip' scope name is preserved in the
-- wrapper's answer because the deployed route switches on it.
CREATE OR REPLACE FUNCTION public.check_demo_rate_limit(p_ip text)
RETURNS TABLE (allowed boolean, scope text, retry_after_seconds integer)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.allowed,
         CASE r.reason WHEN 'key' THEN 'ip' ELSE r.reason END,
         r.retry_after_seconds
    FROM public.check_rate_limit('demo_ip', p_ip) AS r;
$$;

REVOKE ALL ON FUNCTION public.check_demo_rate_limit(text) FROM public;
GRANT EXECUTE ON FUNCTION public.check_demo_rate_limit(text) TO anon, authenticated;

-- The 061 table stays until the wrapper is dropped; nothing writes to
-- it after this migration, and its prune-on-read is gone with its
-- function body. Dropped together with the wrapper.
