-- 166 — A LOCK A CONNECTION POOL CANNOT LOSE
--
-- Applied 2026-10-09 on founder authorisation, immediately after the storage
-- backup's FIRST REAL RUN against Cloudflare R2 — which succeeded (4 objects,
-- 1,100,864 bytes, 0 failures, 8.8 s) and in succeeding exposed this.
--
-- ## What 161 got wrong
--
-- `backup_try_lock()` wrapped `pg_try_advisory_lock`, and its own comment
-- stated the assumption that makes it wrong here:
--
--     "Session-scoped: a dropped connection releases it, so a crashed run
--      cannot wedge the job forever."
--
-- True of a dedicated connection. **False behind a connection pool.**
-- PostgREST serves each RPC from a pool, so:
--
--   1. `backup_try_lock()` takes the lock on pooled session A
--   2. the run does its work across several further RPCs
--   3. `backup_release_lock()` in the `finally` block lands on session B
--   4. `pg_advisory_unlock` on B returns FALSE — it is not an error, B simply
--      never held it — and run.ts wraps the call in `.catch(() => {})`
--   5. session A returns to the pool, idle, still holding the lock
--
-- Nothing fails. Nothing logs. The lock sits on an idle connection until
-- PostgREST happens to recycle it.
--
-- Observed directly after the first run, with the run already finished:
--
--     pid 1783026 | advisory 8427301 | granted | PostgREST 14.5 | state: idle
--
-- and the next invocation answered `{"outcome":"skipped","reason":"another
-- backup run holds the lock"}`. **Every subsequent run would have skipped.**
-- Had the cron been scheduled first, tomorrow's 06:00 run would have reported
-- "skipped" into the heartbeat and the backup would have quietly stopped
-- working after exactly one successful day — the worst possible failure shape
-- for a backup, because the heartbeat is green-ish and the data is stale.
--
-- The stuck lock was cleared by terminating the idle backend. That is an
-- intervention, not a fix.
--
-- ## The fix: a lease, not a session lock
--
-- Lock identity moves from "which connection am I on" — unknowable and
-- unstable behind a pool — to "which run am I", carried as a value the caller
-- supplies. Three properties follow:
--
--   * **Pool-safe.** Acquire and release can land on any connection, because
--     the lock lives in a row rather than in a session.
--   * **Self-healing.** The lease expires. A function killed mid-run (Vercel
--     caps it at 60 s) cannot wedge the job: the next run takes the lock once
--     `expires_at` passes. This preserves the property 161 was reaching for
--     and actually delivers it.
--   * **Not stealable mid-run.** Release requires the holder token, so a late
--     release from a previous run cannot free a lock a live run is holding.
--
-- TTL is 120 seconds, chosen against the two real numbers: the route's
-- `maxDuration` is 60 s and `DEFAULT_BUDGET_MS` stops copying at 45 s. So a
-- live run can never outlive its own lease, and a dead one is recovered inside
-- two minutes.

-- ---------------------------------------------------------------------------
-- 1. The lock table — one row, by construction
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.backup_lock (
  -- A single-row table: the CHECK and the PK together make a second row
  -- impossible, rather than merely discouraged.
  id          boolean     PRIMARY KEY DEFAULT true CHECK (id),
  holder      text        NOT NULL,
  acquired_at timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL
);

ALTER TABLE public.backup_lock ENABLE ROW LEVEL SECURITY;
-- Zero policies, deliberately — the 061/088/164 shape. This is the house's
-- SIXTH deny-all-RLS table, alongside inference_runs, ops_heartbeats,
-- rate_limit, rate_limit_policy and ai_budget_policy. Reached only through
-- the SECURITY DEFINER functions below.

REVOKE ALL ON TABLE public.backup_lock FROM anon, authenticated;

COMMENT ON TABLE public.backup_lock IS
  'Lease-based mutual exclusion for the storage backup job (166, replacing '
  '161''s session-scoped advisory lock, which leaked behind PostgREST''s '
  'connection pool). One row. Held by value, not by session, so acquire and '
  'release may land on different pooled connections. Deny-all RLS.';

-- ---------------------------------------------------------------------------
-- 2. Acquire
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.backup_try_lock();

CREATE OR REPLACE FUNCTION public.backup_try_lock(
  p_holder text,
  p_ttl_seconds integer DEFAULT 120
) RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $$
DECLARE
  v_now  timestamptz := now();
  v_rows integer;
BEGIN
  IF p_holder IS NULL OR length(p_holder) = 0 OR length(p_holder) > 100 THEN
    RAISE EXCEPTION 'backup_try_lock: holder must be 1..100 characters';
  END IF;
  IF p_ttl_seconds IS NULL OR p_ttl_seconds < 1 OR p_ttl_seconds > 3600 THEN
    RAISE EXCEPTION 'backup_try_lock: ttl must be 1..3600 seconds';
  END IF;

  -- One statement, so two racing runs cannot both see the lock as free:
  -- the second blocks on the first's row lock and then re-evaluates the
  -- WHERE against the committed row.
  INSERT INTO public.backup_lock (id, holder, acquired_at, expires_at)
  VALUES (true, p_holder, v_now, v_now + make_interval(secs => p_ttl_seconds))
  ON CONFLICT (id) DO UPDATE
     SET holder      = EXCLUDED.holder,
         acquired_at = EXCLUDED.acquired_at,
         expires_at  = EXCLUDED.expires_at
   -- Take it only when nobody holds it, OR the holder's lease has lapsed,
   -- OR we are re-entering as the same holder.
   WHERE public.backup_lock.expires_at <= v_now
      OR public.backup_lock.holder = p_holder;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows > 0;
END $$;

COMMENT ON FUNCTION public.backup_try_lock(text, integer) IS
  'Takes the storage-backup lease for p_holder. True when acquired. Replaces '
  '161''s session-scoped advisory lock, which leaked behind the connection '
  'pool. Expires on its own, so a killed run cannot wedge the job. '
  'service_role only.';

-- ---------------------------------------------------------------------------
-- 3. Release
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.backup_release_lock();

CREATE OR REPLACE FUNCTION public.backup_release_lock(p_holder text)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $$
DECLARE
  v_rows integer;
BEGIN
  -- Holder-scoped on purpose. A late release from a run that already lost
  -- its lease must not free the lock a live run is now holding.
  DELETE FROM public.backup_lock WHERE holder = p_holder;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows > 0;
END $$;

COMMENT ON FUNCTION public.backup_release_lock(text) IS
  'Releases the storage-backup lease, but only if p_holder still holds it. '
  'service_role only.';

-- ---------------------------------------------------------------------------
-- 4. Grants — service_role only, and anon revoked EXPLICITLY
-- ---------------------------------------------------------------------------
--
-- `REVOKE … FROM PUBLIC` alone is not enough on this database: Supabase's
-- ALTER DEFAULT PRIVILEGES gives anon and authenticated their own explicit
-- EXECUTE grant on every new function in public. 164 learned this the
-- expensive way and 165 fixed it; the §210 tripwire now fails the build
-- without the anon revoke.

REVOKE ALL ON FUNCTION public.backup_try_lock(text, integer) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.backup_release_lock(text) FROM public, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.backup_try_lock(text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.backup_release_lock(text) TO service_role;
