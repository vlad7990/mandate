-- 161 — THE BACKUP CAN HOLD A LOCK
--
-- ⚠️ NOT APPLIED TO PRODUCTION. Written 2026-10-07 alongside the file
-- backup module and deliberately left unapplied: applying it is a
-- production configuration change and is listed as an activation step
-- awaiting approval. Until it is applied, `runBackup` fails loudly with
-- "could not acquire backup lock" — which is the correct behaviour for
-- an unactivated feature, and better than a backup that silently runs
-- without exclusivity.
--
-- ## Why a wrapper exists at all
--
-- Vercel's cron documentation is explicit that a second invocation can
-- start while the first is still running, and recommends a lock. The
-- obvious lock is Postgres's own advisory lock — we already have
-- Postgres, so it costs no new infrastructure and no new vendor.
--
-- But `pg_try_advisory_lock` lives in `pg_catalog`, and PostgREST only
-- exposes functions in the API schemas. `rpc('pg_try_advisory_lock')`
-- therefore fails with "function public.pg_try_advisory_lock does not
-- exist". These two wrappers are the smallest thing that makes the
-- built-in reachable.
--
-- ## Scope, deliberately narrow
--
-- The lock key is FIXED inside the function rather than taken as an
-- argument. A caller-supplied key would turn this into a general-purpose
-- advisory-lock gateway for anyone holding the anon or authenticated
-- role — a denial-of-service primitive against any other advisory lock
-- the database might use. One job, one key, no parameters.
--
-- service_role ONLY. The backup runs through the service-role client
-- inside server code; no session user, and no agent, has any reason to
-- take or release this lock. The 088/118 grant posture: REVOKE from
-- public and anon, GRANT to exactly the one role that needs it. The
-- ruled anon-executable roster stays TWELVE and is untouched.

-- ---------------------------------------------------------------------------
-- 1. The lock
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.backup_try_lock()
RETURNS boolean
LANGUAGE sql
VOLATILE
SET search_path = ''
AS $$
  -- 8427301 is the backup job's own key, matching LOCK_KEY in
  -- src/lib/backup/run.ts. Session-scoped: a dropped connection
  -- releases it, so a crashed run cannot wedge the job forever.
  SELECT pg_catalog.pg_try_advisory_lock(8427301);
$$;

COMMENT ON FUNCTION public.backup_try_lock() IS
  'Mutual exclusion for the storage backup job (161). Returns true when this '
  'session took the lock. Key is fixed, not a parameter — a caller-supplied key '
  'would be a DoS primitive against other advisory locks. service_role only.';

CREATE OR REPLACE FUNCTION public.backup_release_lock()
RETURNS boolean
LANGUAGE sql
VOLATILE
SET search_path = ''
AS $$
  SELECT pg_catalog.pg_advisory_unlock(8427301);
$$;

COMMENT ON FUNCTION public.backup_release_lock() IS
  'Releases the storage backup job lock (161). Best effort — the lock is '
  'session-scoped, so a lost connection releases it regardless. service_role only.';

-- ---------------------------------------------------------------------------
-- 2. An access-control snapshot for restore verification
-- ---------------------------------------------------------------------------
--
-- Requirement 5: a restore into a fresh project must be able to VERIFY
-- that storage access controls match what was in force when the backup
-- was taken, rather than assuming the migrations still describe it.
-- The migrations remain the source of truth; this is the evidence.
--
-- Returns policy NAMES, commands and roles — never the policy
-- expressions, which can embed table and column names we have no reason
-- to ship to a backup destination.

CREATE OR REPLACE FUNCTION public.backup_storage_policy_snapshot()
RETURNS TABLE (policyname text, cmd text, roles text[])
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p.policyname::text,
         p.cmd::text,
         p.roles::text[]
    FROM pg_catalog.pg_policies p
   WHERE p.schemaname = 'storage'
     AND p.tablename = 'objects'
   ORDER BY p.policyname;
$$;

COMMENT ON FUNCTION public.backup_storage_policy_snapshot() IS
  'Storage RLS policy names/commands/roles, captured into the backup manifest so '
  'a restore can verify access controls rather than assume them (161). Returns no '
  'policy expressions. service_role only.';

-- ---------------------------------------------------------------------------
-- 3. Grants — service_role only, on all three
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.backup_try_lock() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.backup_release_lock() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.backup_storage_policy_snapshot() FROM public, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.backup_try_lock() TO service_role;
GRANT EXECUTE ON FUNCTION public.backup_release_lock() TO service_role;
GRANT EXECUTE ON FUNCTION public.backup_storage_policy_snapshot() TO service_role;

-- No activity-trail change. A backup run is an operational act, not an
-- org-visible one: the trail's CHECK stays at 89 values, the intent door
-- stays at 22, and record_agent_event stays at 29. The run's own outcome
-- lands in ops_heartbeats, which is where the cron already reports.
