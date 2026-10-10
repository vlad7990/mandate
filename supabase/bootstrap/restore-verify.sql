-- ─────────────────────────────────────────────────────────────────────
-- RESTORE VERIFICATION  (A3, database half)
--
-- One statement. Run it against a project restored from a Supabase
-- daily backup and read the `verdict` column.
--
--   psql "$DB_URL" -f supabase/bootstrap/restore-verify.sql
--
-- or paste it into one Supabase MCP `execute_sql` call against the
-- restored project's ref. It is READ-ONLY — no inserts, no DDL, no
-- writes of any kind — so it is also safe against production, where it
-- is the way to refresh the `expected` column below.
--
-- ## Why one statement
--
-- "Restore to a New Project" provisions a SECOND PAID PROJECT. The
-- meter runs until the founder deletes it. Verification that takes ten
-- round trips costs ten round trips of someone else's money, so the
-- whole comparison is one query and the answer is one column.
--
-- ## The two rows that are supposed to disagree
--
--   storage_objects_cvs   expected 0
--     Supabase: "database backups do not include objects you store via
--     the Storage API". A restored clone has the `storage.objects` rows
--     for... nothing — the bucket contents do not come with it. 0 here
--     is the documented behaviour CONFIRMED, not a failed restore. If
--     this ever reads 4, the assumption the R2 file backup exists to
--     cover has changed and A2 needs re-reasoning, not celebrating.
--
--   auth_user_created_trigger   expected 1
--     This is the one check that a schema rebuild CANNOT pass and a
--     real restore must. `on_auth_user_created` lives on `auth.users`,
--     and `schema-reference.sql` captures only the `public` schema, so
--     `apply.sh` produces a database without it. Its presence is the
--     proof that what you are looking at came from a backup of the
--     whole database rather than from the repo.
--
-- ## Expected values
--
-- Read from production 2026-10-10, at migration tip 20261009202037
-- (166). Refresh them by running this file against production; update
-- in the same commit as any migration that moves one.
-- ─────────────────────────────────────────────────────────────────────

with expected (metric, expected) as (
  values
    ('tables',                    '75'),
    ('functions',                 '161'),
    ('policies',                  '261'),
    ('triggers',                  '75'),
    ('rls_on',                    '75'),
    ('fks',                       '328'),
    ('indexes',                   '483'),
    ('candidates',                '4'),
    ('organizations',             '1'),
    ('auth_users',                '27'),
    ('migration_tip',             '20261009202037'),
    ('storage_objects_cvs',       '0'),
    ('auth_user_created_trigger', '1')
),
actual (metric, actual) as (
  select 'tables', count(*)::text
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r'
  union all
  select 'functions', count(*)::text
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
  union all
  select 'policies', count(*)::text from pg_policies where schemaname = 'public'
  union all
  select 'triggers', count(*)::text
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and not t.tgisinternal
  union all
  select 'rls_on', count(*)::text
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
  union all
  select 'fks', count(*)::text
    from pg_constraint co
    join pg_class c on c.oid = co.conrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and co.contype = 'f'
  union all
  select 'indexes', count(*)::text
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'i'
  union all
  select 'candidates', count(*)::text from public.candidates
  union all
  select 'organizations', count(*)::text from public.organizations
  union all
  select 'auth_users', count(*)::text from auth.users
  union all
  select 'migration_tip', coalesce(max(version), '(none)')
    from supabase_migrations.schema_migrations
  union all
  select 'storage_objects_cvs', count(*)::text
    from storage.objects where bucket_id = 'cvs'
  union all
  select 'auth_user_created_trigger', count(*)::text
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'auth'
     and c.relname = 'users'
     and t.tgname = 'on_auth_user_created'
     and not t.tgisinternal
)
select
  e.metric,
  e.expected,
  a.actual,
  case when a.actual = e.expected then 'PASS' else 'DIFFERS' end as verdict
from expected e
join actual a using (metric)
order by
  case when a.actual = e.expected then 1 else 0 end,  -- differences first
  e.metric;
