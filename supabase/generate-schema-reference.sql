-- ─────────────────────────────────────────────────────────────────────
-- Regenerates `supabase/schema-reference.sql` from a live database.
--
-- Run each section against the target and concatenate the output in the
-- order below. The sections are separate because a single statement
-- returning the whole schema is ~480 KB, which most SQL clients and
-- every MCP transport will truncate; `LIMIT`/`OFFSET` on the table and
-- function sections exists for that reason and nothing else.
--
-- If you have the database password and a Postgres 17 client, do NOT use
-- this. Use the real thing:
--
--     pg_dump --schema-only --no-owner --no-privileges "$DATABASE_URL" \
--       > supabase/schema-reference.sql
--
-- This file exists because neither was available on 2026-10-08 and an
-- empty `001_core_schema.sql` meant the repository could not describe
-- its own database at all.
--
-- ## Known differences from pg_dump
--
--   * Ordering is alphabetical, not dependency-ordered. A rebuild needs
--     extensions first, then functions, then tables, then indexes,
--     triggers and policies — not the order the file reads in.
--   * No ownership, grants, comments, sequences owned by identity
--     columns, or default privileges.
--   * `public` schema only.
--   * Constraint-backed indexes are omitted from the index section
--     because the constraints already declare them.
-- ─────────────────────────────────────────────────────────────────────


-- ===== 1. TABLES (run twice: offset 0, then offset 40) ================
with cols as (
  select c.relname as t, a.attnum,
    '  ' || quote_ident(a.attname) || ' ' || format_type(a.atttypid, a.atttypmod)
    || case when a.attnotnull then ' NOT NULL' else '' end
    || coalesce(' DEFAULT ' || pg_get_expr(d.adbin, d.adrelid), '') as line
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
  where n.nspname = 'public'
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


-- ===== 2. VIEWS, INDEXES, TRIGGERS ====================================
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
  select pg_get_triggerdef(t.oid) || ';' as ddl, t.tgname, c.relname
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and not t.tgisinternal
)
select coalesce((select string_agg(ddl, E'\n\n' order by relname) from v), '-- none')
    || E'\n\n' || coalesce((select string_agg(ddl, E'\n' order by indexname) from i), '-- none')
    || E'\n\n' || coalesce((select string_agg(ddl, E'\n' order by relname, tgname) from g), '-- none');


-- ===== 3. ROW LEVEL SECURITY POLICIES =================================
select string_agg(
  'CREATE POLICY ' || quote_ident(policyname) || ' ON ' || quote_ident(tablename)
  || ' AS ' || permissive || ' FOR ' || cmd || ' TO ' || array_to_string(roles, ', ')
  || coalesce(E'\n  USING (' || qual || ')', '')
  || coalesce(E'\n  WITH CHECK (' || with_check || ')', '') || ';',
  E'\n\n' order by tablename, policyname)
from pg_policies where schemaname = 'public';


-- ===== 4. FUNCTIONS (run four times: offset 0, 40, 80, 120) ===========
with f as (
  select p.proname, p.oid, pg_get_functiondef(p.oid) as def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
)
select string_agg(def || E';\n', E'\n' order by proname, oid)
from (select * from f order by proname, oid limit 40 offset 0) s;


-- ===== 5. EXTENSIONS (applied FIRST in a rebuild) =====================
select string_agg('CREATE EXTENSION IF NOT EXISTS ' || quote_ident(e.extname)
                  || ' WITH SCHEMA ' || quote_ident(n.nspname) || ';', E'\n' order by e.extname)
from pg_extension e join pg_namespace n on n.oid = e.extnamespace
where e.extname <> 'plpgsql';


-- ===== 6. VERIFY — these counts must match the generated file =========
select
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r') as tables,
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('v', 'm')) as views,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public') as functions,
  (select count(*) from pg_policies where schemaname = 'public') as policies,
  (select count(*) from pg_trigger t join pg_class c on c.oid = t.tgrelid
     join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and not t.tgisinternal) as triggers;
