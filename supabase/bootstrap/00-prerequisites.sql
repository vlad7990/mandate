-- ─────────────────────────────────────────────────────────────────────
-- BOOTSTRAP PREREQUISITES
--
-- `schema-reference.sql` describes the `public` schema. It does not and
-- cannot describe the platform underneath it, and without that platform
-- none of it applies: the first unordered attempt produced 1,457 errors,
-- 432 of them "role does not exist" and 24 of them a missing `auth` or
-- `storage` schema.
--
-- This file supplies exactly what the baseline reaches outside `public`,
-- measured rather than guessed:
--
--     70 x auth.uid()          in RLS policies
--      1 x auth.users(id)      FK from public.users
--     11 x storage.foldername()
--     10 x storage.objects     the bucket policies
--      3 x storage.buckets     the bucket rows
--
-- ## WHICH ENVIRONMENT ARE YOU IN
--
--   Restoring onto a real Supabase project
--       Do NOT run the stub sections. Supabase already provides `auth`,
--       `storage`, the three roles and the extensions. Running the stubs
--       would shadow the real implementations with ones that always
--       return NULL, and every RLS policy in the product would silently
--       deny. Run section 1 only, and only if the extensions are absent.
--
--   Rebuilding on plain Postgres, or testing the baseline
--       Run the whole file. The stubs are structural placeholders that
--       let the DDL apply and the schema be inspected. They are NOT an
--       authentication system: `auth.uid()` returns NULL, so every
--       policy that depends on it denies. That is the safe direction to
--       fail, and it is why this file refuses to pretend otherwise.
-- ─────────────────────────────────────────────────────────────────────


-- ===== 1. EXTENSIONS ==================================================
-- Supabase puts these in a dedicated `extensions` schema rather than
-- `public`. `supabase_vault` is platform-provided and has no open-source
-- equivalent; it is intentionally absent from the stub path below.

CREATE SCHEMA IF NOT EXISTS extensions;

CREATE EXTENSION IF NOT EXISTS pg_stat_statements WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm            WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto           WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp"        WITH SCHEMA extensions;

-- gen_random_uuid() is the default on most tables. It is built in from
-- PG13 onward; on older servers pgcrypto above supplies it.

-- Put `extensions` on the search path, which is what Supabase does at
-- the database level.
--
-- Without it the trigram indexes fail with
--     operator class "gin_trgm_ops" does not exist for access method "gin"
-- because the operator class lives in `extensions` and the index DDL
-- names it unqualified. Found by running this, not by reading it.
DO $$
BEGIN
  EXECUTE format('ALTER DATABASE %I SET search_path TO public, extensions',
                 current_database());
END
$$;


-- ===== 2. ROLES =======================================================
-- PostgREST connects as these. The grants section of the baseline is
-- addressed to them by name and fails wholesale without them.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    -- BYPASSRLS is the whole reason this key is guarded the way it is.
    CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public     TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA extensions TO anon, authenticated, service_role;


-- ===== 3. STUBS — NON-SUPABASE ENVIRONMENTS ONLY ======================
-- Everything below is a placeholder. Skip it entirely on a real project.

CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS storage;
GRANT USAGE ON SCHEMA auth, storage TO anon, authenticated, service_role;

-- auth.users: public.users.id has a FK onto this.
CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text
);

-- auth.uid(): returns the signed-in user. The stub returns NULL, so
-- every policy reading it denies. Do not "improve" this into something
-- that returns a real id — a stub that authorises is worse than one
-- that refuses.
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
  LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;

CREATE OR REPLACE FUNCTION auth.role() RETURNS text
  LANGUAGE sql STABLE AS $$ SELECT NULL::text $$;

-- storage.buckets / storage.objects: the shapes the bucket policies
-- reference. Not a storage implementation.
CREATE TABLE IF NOT EXISTS storage.buckets (
  id text PRIMARY KEY,
  name text NOT NULL,
  public boolean NOT NULL DEFAULT false,
  file_size_limit bigint,
  allowed_mime_types text[],
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS storage.objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id text REFERENCES storage.buckets(id),
  name text,
  owner uuid,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- storage.foldername(): splits an object path. The bucket policies use
-- it to scope by the first path segment, so the real semantics matter.
CREATE OR REPLACE FUNCTION storage.foldername(name text) RETURNS text[]
  LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE parts text[];
BEGIN
  parts := string_to_array(name, '/');
  RETURN parts[1 : array_length(parts, 1) - 1];
END
$$;
