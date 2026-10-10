-- ─────────────────────────────────────────────────────────────────────
-- TENANT ISOLATION CHECK — RESTORED PROJECT VARIANT
--
-- The same nine assertions as `isolation-check.sql`, against a project
-- restored from a Supabase daily backup instead of one built by
-- `apply.sh`.
--
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/bootstrap/isolation-check-restored.sql
--
-- It is ONE statement with no psql metacommands, so it also runs as a
-- single Supabase MCP `execute_sql` call. That matters: "Restore to a
-- New Project" hands back a project ref, not a database password, and
-- waiting on a credential while a second paid project meters is a poor
-- use of the rehearsal.
--
-- **Never production.** It inserts rows. It removes them again and
-- proves it did, but the place for that is a scratch clone.
--
-- ## Why a second file instead of one that handles both
--
-- `isolation-check.sql` cannot run here, and not for a cosmetic reason.
-- Verified 2026-10-10 against production's catalogue and against a
-- simulated clone:
--
--   1. It does `CREATE OR REPLACE FUNCTION auth.uid()`. On a real
--      project that function is owned by `supabase_auth_admin`, so
--      `postgres` gets "must be owner of function uid". The bootstrap
--      stub is owned by whoever ran the build, which is why it works
--      there and only there.
--
--      It also does not need replacing. Supabase's own `auth.uid()`
--      already reads `request.jwt.claim.sub` — the exact shape the
--      bootstrap script installs. The stub is the odd one out: it
--      returns `NULL::uuid` so every policy denies.
--
--   2. Real `auth.users` carries the `on_auth_user_created` trigger,
--      which calls `handle_new_auth_user()` and inserts the matching
--      `public.users` row for you. So the bootstrap script's own
--      `INSERT INTO users` is a duplicate key, and the run dies on
--      "users_pkey" before reaching check 1.
--
--      That trigger lives on `auth.users`, and `schema-reference.sql`
--      captures only the `public` schema — `generate-schema-reference.sql`
--      filters every section to `nspname = 'public'`. So a database
--      built by `apply.sh` does not have it, and a restored one does.
--      `restore-verify.sql` asserts its presence for that reason: it is
--      the one row a repo rebuild cannot fake.
--
-- Trying to serve both shapes from one file would mean branching on
-- which of those two worlds you are in, in SQL, twice. Two files, each
-- honest about its target, is the cheaper truth.
--
-- ## It runs against a database that already holds real rows
--
-- A restored clone is not empty — that is the point of restoring it.
-- Every assertion below is therefore a count scoped BY RLS to a
-- synthetic organisation, never a count of the whole table. Production
-- rows belong to another organisation, so they can only change these
-- numbers by leaking, which is precisely the thing being tested.
--
-- ## It leaves nothing behind, and checks
--
-- Counts are taken before and after; the last assertion fails if they
-- do not match. On any earlier failure the statement aborts and the
-- whole DO block rolls back, so nothing persists on either path.
-- ─────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  org_a uuid := '11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  org_b uuid := '22222222-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  usr_a uuid := '33333333-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  usr_b uuid := '44444444-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  cnd_a uuid := '55555555-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  cnd_b uuid := '66666666-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  n              integer;
  denied         boolean;
  probe          uuid;
  pre_orgs       integer;
  pre_users      integer;
  pre_candidates integer;
  pre_auth_users integer;
BEGIN
  -- ===== preflight: this must be a real project, not a stub =========
  -- The bootstrap stub returns NULL from auth.uid(), which makes every
  -- policy deny and every check below pass for the wrong reason. Catch
  -- that here rather than reporting nine false greens.
  PERFORM set_config('request.jwt.claim.sub',
                     '77777777-7777-4777-8777-777777777777', true);
  probe := auth.uid();
  PERFORM set_config('request.jwt.claim.sub', '', true);

  IF probe IS DISTINCT FROM '77777777-7777-4777-8777-777777777777'::uuid THEN
    RAISE EXCEPTION
      'auth.uid() does not read request.jwt.claim.sub (returned %). This '
      'looks like a bootstrap-built database, not a restored project — '
      'use isolation-check.sql instead.', probe;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace ns ON ns.oid = c.relnamespace
     WHERE ns.nspname = 'auth' AND c.relname = 'users'
       AND t.tgname = 'on_auth_user_created' AND NOT t.tgisinternal
  ) THEN
    RAISE EXCEPTION
      'on_auth_user_created is missing from auth.users. A restored '
      'project has it; a database built from schema-reference.sql does '
      'not, because the snapshot only covers the public schema.';
  END IF;

  SELECT count(*) INTO pre_orgs       FROM organizations;
  SELECT count(*) INTO pre_users      FROM users;
  SELECT count(*) INTO pre_candidates FROM candidates;
  SELECT count(*) INTO pre_auth_users FROM auth.users;
  RAISE NOTICE 'preflight ok. existing rows: orgs=% users=% candidates=% auth.users=%',
    pre_orgs, pre_users, pre_candidates, pre_auth_users;

  -- ===== two organisations, two members, one candidate each =========
  INSERT INTO organizations (id, name, slug) VALUES
    (org_a, 'SMOKE Org A', 'smoke-org-a'),
    (org_b, 'SMOKE Org B', 'smoke-org-b');

  -- The trigger creates the public.users rows from these, with
  -- organization_id NULL / role 'viewer' / status 'pending'. Hence the
  -- UPDATE below rather than an INSERT.
  INSERT INTO auth.users (id, email) VALUES
    (usr_a, 'smoke-a@example.invalid'),
    (usr_b, 'smoke-b@example.invalid');

  IF (SELECT count(*) FROM users WHERE id IN (usr_a, usr_b)) <> 2 THEN
    RAISE EXCEPTION
      'on_auth_user_created did not create the public.users rows. The '
      'trigger exists but did not fire or did not insert.';
  END IF;

  -- The claim stays empty here on purpose. With it set this reads as a
  -- self-edit, and a trigger refuses that with "only your name may be
  -- changed on your own account".
  UPDATE users
     SET organization_id = org_a, role = 'admin',
         status = 'active', full_name = 'SMOKE A'
   WHERE id = usr_a;
  UPDATE users
     SET organization_id = org_b, role = 'admin',
         status = 'active', full_name = 'SMOKE B'
   WHERE id = usr_b;

  INSERT INTO candidates (id, organization_id, full_name) VALUES
    (cnd_a, org_a, 'SMOKE Candidate A'),
    (cnd_b, org_b, 'SMOKE Candidate B');

  -- ===== the checks ================================================
  -- ---- 1. a member sees their own org's candidate -----------------
  PERFORM set_config('request.jwt.claim.sub', usr_a::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM candidates;
  RESET ROLE;
  IF n <> 1 THEN
    RAISE EXCEPTION 'READ-OWN FAILED: member of A saw % candidates, expected 1. A policy that shows nothing is not isolation, it is an outage.', n;
  END IF;
  RAISE NOTICE 'ok  1. member of A sees exactly their own 1 candidate';

  -- ---- 2. and cannot see the other org's --------------------------
  -- Not just org B's: anything at all outside org A, which on a
  -- restored clone includes every real production candidate.
  PERFORM set_config('request.jwt.claim.sub', usr_a::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM candidates WHERE organization_id <> org_a;
  RESET ROLE;
  IF n <> 0 THEN
    RAISE EXCEPTION 'CROSS-TENANT READ: member of A saw % candidates belonging to other organisations', n;
  END IF;
  RAISE NOTICE 'ok  2. member of A sees 0 candidates from any other org (incl. the restored production rows)';

  -- ---- 3. the view is symmetric -----------------------------------
  PERFORM set_config('request.jwt.claim.sub', usr_b::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM candidates;
  RESET ROLE;
  IF n <> 1 THEN
    RAISE EXCEPTION 'READ-OWN FAILED for B: saw % candidates, expected 1', n;
  END IF;
  RAISE NOTICE 'ok  3. member of B sees exactly their own 1 candidate';

  -- ---- 4. cross-tenant UPDATE is refused --------------------------
  -- Silent no-op counts as refused: RLS filters the row out, so the
  -- UPDATE matches nothing. What must NOT happen is 1 row updated.
  PERFORM set_config('request.jwt.claim.sub', usr_a::text, true);
  SET LOCAL ROLE authenticated;
  UPDATE candidates SET full_name = 'TAMPERED' WHERE id = cnd_b;
  GET DIAGNOSTICS n = ROW_COUNT;
  RESET ROLE;
  IF n <> 0 THEN
    RAISE EXCEPTION 'CROSS-TENANT WRITE: member of A updated % of org B''s rows', n;
  END IF;
  RAISE NOTICE 'ok  4. member of A cannot update org B''s candidate';

  -- ---- 5. cross-tenant DELETE is refused --------------------------
  PERFORM set_config('request.jwt.claim.sub', usr_a::text, true);
  SET LOCAL ROLE authenticated;
  DELETE FROM candidates WHERE id = cnd_b;
  GET DIAGNOSTICS n = ROW_COUNT;
  RESET ROLE;
  IF n <> 0 THEN
    RAISE EXCEPTION 'CROSS-TENANT DELETE: member of A deleted % of org B''s rows', n;
  END IF;
  RAISE NOTICE 'ok  5. member of A cannot delete org B''s candidate';

  -- ---- 6. INSERT into another org is refused ----------------------
  PERFORM set_config('request.jwt.claim.sub', usr_a::text, true);
  SET LOCAL ROLE authenticated;
  denied := false;
  BEGIN
    INSERT INTO candidates (organization_id, full_name)
      VALUES (org_b, 'SMOKE smuggled');
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    denied := true;
  END;
  RESET ROLE;
  IF NOT denied THEN
    RAISE EXCEPTION 'CROSS-TENANT INSERT: member of A planted a row in org B';
  END IF;
  RAISE NOTICE 'ok  6. member of A cannot insert into org B';

  -- ---- 7. anon sees nothing ---------------------------------------
  PERFORM set_config('request.jwt.claim.sub', '', true);
  SET LOCAL ROLE anon;
  SELECT count(*) INTO n FROM candidates;
  RESET ROLE;
  IF n <> 0 THEN
    RAISE EXCEPTION 'ANON READ: unauthenticated saw % candidates', n;
  END IF;
  RAISE NOTICE 'ok  7. anon sees 0 candidates';

  -- ---- 8. a SUSPENDED member of A loses their own org too ---------
  -- Status is folded into the policy predicates, not just the app, and
  -- this is the check that proves it.
  PERFORM set_config('request.jwt.claim.sub', '', true);
  UPDATE users SET status = 'suspended' WHERE id = usr_a;
  PERFORM set_config('request.jwt.claim.sub', usr_a::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM candidates;
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', true);
  UPDATE users SET status = 'active' WHERE id = usr_a;
  IF n <> 0 THEN
    RAISE EXCEPTION 'SUSPENDED READ: a suspended member still saw % candidates', n;
  END IF;
  RAISE NOTICE 'ok  8. a suspended member of A sees 0, including their own org';

  -- ---- 9. the same story on a second table ------------------------
  -- One table proving isolation says that table's policy is right. The
  -- claim is about the product, so check a differently-shaped one.
  PERFORM set_config('request.jwt.claim.sub', usr_a::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM organizations;
  RESET ROLE;
  IF n <> 1 THEN
    RAISE EXCEPTION 'ORG LEAK: member of A saw % organizations, expected 1', n;
  END IF;
  RAISE NOTICE 'ok  9. member of A sees exactly 1 organization';

  -- ===== remove everything this added ==============================
  PERFORM set_config('request.jwt.claim.sub', '', true);
  DELETE FROM candidates  WHERE id IN (cnd_a, cnd_b);
  DELETE FROM users       WHERE id IN (usr_a, usr_b);
  DELETE FROM auth.users  WHERE id IN (usr_a, usr_b);
  DELETE FROM organizations WHERE id IN (org_a, org_b);

  SELECT count(*) INTO n FROM organizations;
  IF n <> pre_orgs THEN
    RAISE EXCEPTION 'RESIDUE: organizations went % -> %', pre_orgs, n;
  END IF;
  SELECT count(*) INTO n FROM users;
  IF n <> pre_users THEN
    RAISE EXCEPTION 'RESIDUE: users went % -> %', pre_users, n;
  END IF;
  SELECT count(*) INTO n FROM candidates;
  IF n <> pre_candidates THEN
    RAISE EXCEPTION 'RESIDUE: candidates went % -> %', pre_candidates, n;
  END IF;
  SELECT count(*) INTO n FROM auth.users;
  IF n <> pre_auth_users THEN
    RAISE EXCEPTION 'RESIDUE: auth.users went % -> %', pre_auth_users, n;
  END IF;

  RAISE NOTICE 'ok 10. nothing left behind: all four counts back to their pre-run values';
  RAISE NOTICE '--- all isolation checks passed on a restored project ---';
END
$$;
