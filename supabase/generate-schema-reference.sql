-- ─────────────────────────────────────────────────────────────────────
-- Regenerates `supabase/schema-reference.sql` from a live database.
--
-- Run each section against the target and concatenate the output in the
-- order the sections appear below. The sections are separate because a
-- single statement returning the whole schema is ~550 KB, which most SQL
-- clients and every MCP transport truncates; the LIMIT/OFFSET on the
-- table and function sections exists for that reason and nothing else.
--
-- If you have the database password and a Postgres 17 client, do NOT use
-- this. Use the real thing:
--
--     pg_dump --schema-only --no-owner --no-privileges "$DATABASE_URL" \
--       > supabase/schema-reference.sql
--
-- ## Nine defects this file has already been corrected for
--
-- The first version of this generator produced a file that looked right
-- and did not work. Applying it to an empty database produced 1,457
-- errors and 8 of 73 tables. Each fix below is load-bearing; if you
-- rewrite these queries, re-run the bootstrap test before trusting the
-- output.
--
--   1. GENERATED columns were emitted as DEFAULT. Ten columns
--      (candidates.cv_search, clients.name_key, …) would have become
--      ordinary writable columns holding a stale value. This was the
--      worst of the seven because nothing would have failed — the rebuild
--      would simply have been wrong.
--   2. Foreign keys were inline in CREATE TABLE. Alphabetical order
--      makes them unsatisfiable: 843 of the 1,457 errors. They are now a
--      separate ALTER TABLE section.
--   3. Column comments were emitted as COMMENT ON TABLE t.col, which
--      Postgres reads as a cross-database reference and rejects.
--   4. A comment on an INDEX was emitted as COMMENT ON TABLE.
--   5. Indexes must be applied BEFORE foreign keys: the org-scoping
--      composite keys are backed by unique indexes, not unique
--      constraints.
--   6. `extensions` must be on the search_path or every trigram index
--      fails on gin_trgm_ops.
--   7. PUBLIC EXECUTE was never revoked. Postgres grants it on every
--      new function; production has revoked it on all 157. Without
--      section 7a a rebuild is MORE PERMISSIVE than production on
--      every function, including 93 SECURITY DEFINER ones. This is the
--      second silent defect -- like the generated columns, nothing
--      fails, the rebuild is just wrong.
--
--   8. The baseline was not the whole database: a rebuild stopped at
--      the snapshot and silently omitted every migration above it.
--      Fixed in `apply.sh`, which now replays them.
--   9. `nspname = 'public'` dropped a trigger the product owns.
--      `on_auth_user_created` sits on `auth.users` and calls
--      `public.handle_new_auth_user()`, which is the only thing that
--      creates the `public.users` row for a new signup. Every section
--      here filtered to `public`, so the snapshot carried the function
--      and not the trigger that fires it — and migration `002`, which
--      created it, is far below `BASELINE_MIGRATION`, so the replay did
--      not put it back either. A rebuilt database started, matched all
--      its counts, and then **never created an application user for
--      anyone who signed up**. The trigger count matched production
--      exactly (75) because both sides counted `public` only, which is
--      what let it hide. Fourth of the silent-wrongness defects, with
--      1, 7 and 8. Section 3's trigger CTE is now scoped by the
--      function's schema; see the comment there for why that and not
--      the table's.
--
-- Items 5, 6 and 8 are properties of the APPLY ORDER, not of this file;
-- they live in `supabase/bootstrap/apply.sh`.
--
-- ## Known differences from pg_dump
--
--   * No ownership, no default-privilege ACL replay, no sequences
--     (the catalogue reports none in `public`).
--   * `public`, plus the storage buckets and their policies, plus any
--     trigger on a non-`public` table whose function lives in `public`
--     (today exactly one, on `auth.users`). Nothing else from `auth`,
--     and nothing from `realtime`, `vault` or `graphql`.
--   * Consequently the stub `auth.users` in
--     `bootstrap/00-prerequisites.sql` must carry every column that
--     trigger's function reads, or the trigger exists and throws.
-- ─────────────────────────────────────────────────────────────────────


-- ===== 1. TABLES (run twice: offset 0, then offset 40) ================
-- Columns + PRIMARY KEY / UNIQUE / CHECK / EXCLUDE only. Foreign keys
-- are section 2.
with cols as (
  select c.relname as t, a.attnum,
    '  ' || quote_ident(a.attname) || ' ' || format_type(a.atttypid, a.atttypmod)
    -- attgenerated 's' = STORED. Emitting DEFAULT here is defect 1.
    || case when a.attgenerated = 's'
         then ' GENERATED ALWAYS AS (' || pg_get_expr(d.adbin, d.adrelid) || ') STORED'
         else coalesce(' DEFAULT ' || pg_get_expr(d.adbin, d.adrelid), '') end
    || case when a.attnotnull then ' NOT NULL' else '' end as line
  from pg_attribute a
  join pg_class c on c.oid = a.attrelid
  join pg_namespace n on n.oid = c.relnamespace
  left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
  where n.nspname = 'public' and c.relkind = 'r'
    and a.attnum > 0 and not a.attisdropped
),
cons as (
  select c.relname as t, co.conname,
    '  CONSTRAINT ' || quote_ident(co.conname) || ' ' || pg_get_constraintdef(co.oid) as line
  from pg_constraint co
  join pg_class c on c.oid = co.conrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and co.contype in ('p', 'u', 'c', 'x')
),
t as (
  select c.relname,
    'CREATE TABLE ' || quote_ident(c.relname) || E' (\n'
    || (select string_agg(line, E',\n' order by attnum) from cols where cols.t = c.relname)
    || coalesce((select E',\n' || string_agg(line, E',\n' order by conname)
                   from cons where cons.t = c.relname), '')
    || E'\n);'
    || case when c.relrowsecurity
         then E'\nALTER TABLE ' || quote_ident(c.relname) || ' ENABLE ROW LEVEL SECURITY;'
         else '' end as ddl
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
)
select string_agg(ddl, E'\n\n' order by relname)
from (select * from t order by relname limit 40 offset 0) s;


-- ===== 2. FOREIGN KEYS ================================================
select string_agg('ALTER TABLE ' || quote_ident(c.relname) || ' ADD CONSTRAINT '
         || quote_ident(co.conname) || ' ' || pg_get_constraintdef(co.oid) || ';',
         E'\n' order by c.relname, co.conname)
from pg_constraint co
join pg_class c on c.oid = co.conrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and co.contype = 'f';


-- ===== 3. VIEWS, INDEXES, TRIGGERS ====================================
with v as (
  select 'CREATE ' || case when c.relkind = 'm' then 'MATERIALIZED ' else '' end
    || 'VIEW ' || quote_ident(c.relname) || E' AS\n' || pg_get_viewdef(c.oid, true) as ddl,
    c.relname
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('v', 'm')
),
i as (
  select indexdef || ';' as ddl, indexname
  from pg_indexes
  where schemaname = 'public'
    and indexname not in (
      select co.conname from pg_constraint co
      join pg_class c on c.oid = co.conrelid
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and co.contype in ('p', 'u', 'x')
    )
),
g as (
  -- Triggers the PRODUCT owns, wherever they sit -- see defect 9.
  --
  -- The test for a non-`public` table is the FUNCTION's schema, not the
  -- table's. Supabase's own platform triggers (7 on storage.*, 1 on
  -- realtime.subscription) call storage.* / realtime.* functions that do
  -- not exist in a bootstrap database and are not ours to recreate;
  -- emitting them would break the rebuild instead of completing it.
  --
  -- Public tables keep the old unconditional rule, so a trigger on a
  -- public table calling e.g. extensions.moddatetime is still captured.
  --
  -- Measured against production 2026-10-10: 76 = the 75 public-table
  -- triggers, plus `on_auth_user_created`, and none of the 8 platform
  -- ones.
  select pg_get_triggerdef(t.oid) || ';' as ddl, t.tgname, c.relname, n.nspname
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  join pg_proc p on p.oid = t.tgfoid
  join pg_namespace fn on fn.oid = p.pronamespace
  where not t.tgisinternal
    and (n.nspname = 'public' or fn.nspname = 'public')
)
select coalesce((select string_agg(ddl, E'\n\n' order by relname) from v), '-- none')
    || E'\n\n' || coalesce((select string_agg(ddl, E'\n' order by indexname) from i), '-- none')
    || E'\n\n' || coalesce((select string_agg(ddl, E'\n' order by nspname, relname, tgname) from g), '-- none');


-- ===== 4. ROW LEVEL SECURITY POLICIES =================================
select string_agg(
  'CREATE POLICY ' || quote_ident(policyname) || ' ON ' || quote_ident(tablename)
  || ' AS ' || permissive || ' FOR ' || cmd || ' TO ' || array_to_string(roles, ', ')
  || coalesce(E'\n  USING (' || qual || ')', '')
  || coalesce(E'\n  WITH CHECK (' || with_check || ')', '') || ';',
  E'\n\n' order by tablename, policyname)
from pg_policies where schemaname = 'public';


-- ===== 5. FUNCTIONS (run four times: offset 0, 40, 80, 120) ===========
with f as (
  select p.proname, p.oid, pg_get_functiondef(p.oid) as def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
)
select string_agg(def || E';\n', E'\n' order by proname, oid)
from (select * from f order by proname, oid limit 40 offset 0) s;


-- ===== 6. EXTENSIONS ==================================================
select string_agg('CREATE EXTENSION IF NOT EXISTS ' || quote_ident(e.extname)
                  || ' WITH SCHEMA ' || quote_ident(n.nspname) || ';', E'\n' order by e.extname)
from pg_extension e join pg_namespace n on n.oid = e.extnamespace
where e.extname <> 'plpgsql';


-- ===== 7a. REVOKE PUBLIC ON FUNCTIONS =================================
-- MUST be emitted BEFORE the grants. Postgres grants EXECUTE to PUBLIC
-- on every new function; all 157 in production have had it revoked. A
-- baseline that replays only GRANTs rebuilds a database where every
-- function -- including 93 SECURITY DEFINER -- is PUBLIC-executable.
-- Defect 7, found by diffing a rebuild against the live catalogue.
-- Tables need no equivalent: all 73 carry explicit ACLs, none grants
-- PUBLIC.
select string_agg('REVOKE ALL ON FUNCTION public.' || quote_ident(p.proname)
         || '(' || pg_get_function_identity_arguments(p.oid) || ') FROM PUBLIC;',
         E'\n' order by p.proname, pg_get_function_identity_arguments(p.oid))
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public';


-- ===== 7. GRANTS ======================================================
-- Folded to one statement per (object, grantee). Only the three
-- PostgREST roles: `postgres` holds its grants through ownership, which
-- a rebuild reproduces implicitly.
with tg as (
  select table_name, grantee, string_agg(distinct privilege_type, ', ' order by privilege_type) as privs
  from information_schema.role_table_grants
  where table_schema = 'public' and grantee in ('anon','authenticated','service_role')
  group by table_name, grantee
)
select string_agg('GRANT ' || privs || ' ON TABLE public.' || quote_ident(table_name)
         || ' TO ' || grantee || ';', E'\n' order by table_name, grantee)
from tg;

with rg as (
  select routine_name, grantee, string_agg(distinct privilege_type, ', ' order by privilege_type) as privs
  from information_schema.role_routine_grants
  where routine_schema = 'public' and grantee in ('anon','authenticated','service_role')
  group by routine_name, grantee
)
select string_agg('GRANT ' || privs || ' ON FUNCTION public.' || quote_ident(routine_name)
         || ' TO ' || grantee || ';', E'\n' order by routine_name, grantee)
from rg;


-- ===== 8. STORAGE BUCKETS AND POLICIES ================================
select string_agg(
  'INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)'
  || E'\n  VALUES (' || quote_literal(id) || ', ' || quote_literal(name) || ', ' || public::text || ', '
  || coalesce(file_size_limit::text, 'NULL') || ', '
  || coalesce(quote_literal(allowed_mime_types::text) || '::text[]', 'NULL') || ')'
  || E'\n  ON CONFLICT (id) DO NOTHING;', E'\n\n' order by id)
from storage.buckets;

select string_agg(
  'CREATE POLICY ' || quote_ident(policyname) || ' ON storage.' || quote_ident(tablename)
  || ' AS ' || permissive || ' FOR ' || cmd || ' TO ' || array_to_string(roles, ', ')
  || coalesce(E'\n  USING (' || qual || ')', '')
  || coalesce(E'\n  WITH CHECK (' || with_check || ')', '') || ';',
  E'\n\n' order by policyname)
from pg_policies where schemaname = 'storage';


-- ===== 9. COMMENTS ====================================================
-- objsubid > 0 means a COLUMN, and relkind decides the rest. Getting
-- either wrong produces statements Postgres rejects (defects 3 and 4).
with rc as (
  select case
      when d.objsubid > 0
        then 'COMMENT ON COLUMN public.' || quote_ident(c.relname) || '.' || quote_ident(a.attname)
      else 'COMMENT ON ' || case c.relkind
             when 'r' then 'TABLE' when 'p' then 'TABLE'
             when 'v' then 'VIEW'  when 'm' then 'MATERIALIZED VIEW'
             when 'i' then 'INDEX' when 'I' then 'INDEX'
             when 'S' then 'SEQUENCE' when 'f' then 'FOREIGN TABLE'
             when 'c' then 'TYPE' else 'TABLE' end
           || ' public.' || quote_ident(c.relname)
    end || ' IS ' || quote_literal(d.description) || ';' as ddl,
    c.relname, d.objsubid, c.relkind
  from pg_description d
  join pg_class c on c.oid = d.objoid
  join pg_namespace n on n.oid = c.relnamespace
  left join pg_attribute a on a.attrelid = c.oid and a.attnum = d.objsubid
  where n.nspname = 'public'
),
fc as (
  select 'COMMENT ON FUNCTION public.' || quote_ident(p.proname)
    || '(' || pg_get_function_identity_arguments(p.oid) || ') IS '
    || quote_literal(d.description) || ';' as ddl, p.proname
  from pg_description d
  join pg_proc p on p.oid = d.objoid
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
)
select (select string_agg(ddl, E'\n\n' order by relkind, relname, objsubid) from rc)
    || E'\n\n' || (select string_agg(ddl, E'\n\n' order by proname) from fc);


-- ===== 10. VERIFY — must match the generated file and the rebuild =====
select
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r') as tables,
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('v','m')) as views,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public') as functions,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prosecdef) as security_definer,
  (select count(*) from pg_policies where schemaname = 'public') as policies,
  (select count(*) from pg_policies where schemaname = 'storage') as storage_policies,
  (select count(*) from pg_trigger t join pg_class c on c.oid = t.tgrelid
     join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and not t.tgisinternal) as triggers,
  (select count(*) from pg_indexes where schemaname = 'public') as indexes,
  (select count(*) from pg_constraint co join pg_class c on c.oid = co.conrelid
     join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and co.contype = 'f') as foreign_keys,
  (select count(*) from pg_attribute a join pg_class c on c.oid = a.attrelid
     join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and a.attnum > 0 and not a.attisdropped
       and a.attgenerated <> '') as generated_columns,
  (select count(*) from information_schema.role_table_grants
     where table_schema = 'public' and grantee in ('anon','authenticated','service_role')) as grants_3roles;
