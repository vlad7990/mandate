-- 115 — OPS HEARTBEATS (status page gate confirmed §139)
--
-- The daily cron left no persisted trace of its own run — a silent
-- failure was invisible until Monday's digest failed to arrive. One
-- row per named pulse; the cron stamps it via the service-role client
-- at the end of every successful run, and /api/health reads staleness
-- the same way.
--
-- Zero policies, deliberately — the deny-all shape (§127: a deny-all
-- table never gains a session policy; the rate_limit pair is the
-- precedent). No anon grants: the roster is TWELVE and ruled (§136,
-- R4 of the status gate) — every read and write of this table happens
-- server-side under the service role.

create table public.ops_heartbeats (
  name text primary key,
  last_ok_at timestamptz not null default now(),
  detail jsonb,
  updated_at timestamptz not null default now()
);

alter table public.ops_heartbeats enable row level security;
