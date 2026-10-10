-- ─────────────────────────────────────────────────────────────────────
-- TENANT ISOLATION CHECK
--
-- Proves, against a real schema with real RLS, that one organisation
-- cannot read, write or delete another's records.
--
--   psql "$URL" -v ON_ERROR_STOP=1 -f supabase/bootstrap/isolation-check.sql
--
-- ## Where to run it
--
-- A database built by `apply.sh --with-stubs`. **Never production.** It
-- inserts and deletes rows, and it REDEFINES `auth.uid()`.
--
-- ## Why it has to redefine auth.uid()
--
-- The bootstrap stub returns NULL, which makes every policy deny. That
-- proves the schema fails safe, and proves nothing about whether it
-- lets the RIGHT rows through — a policy of `USING (false)` would pass
-- that test on every table.
--
-- So this installs the shape Supabase actually uses: `auth.uid()` reads
-- a per-session setting. Switching that setting is switching user, and
-- the policies then run for real. This is the difference between
-- "isolation holds" and "nothing is visible".
--
-- ## What it asserts
--
-- Every check raises an exception on failure, so a non-zero exit is a
-- failed isolation test and the transaction rolls back.
-- ─────────────────────────────────────────────────────────────────────

BEGIN;

-- ===== make auth.uid() settable, as Supabase does =====================
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
  LANGUAGE sql STABLE AS
$$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

-- ===== two organisations, two members, one candidate each =============
\set org_a '11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
\set org_b '22222222-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
\set usr_a '33333333-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
\set usr_b '44444444-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
\set cnd_a '55555555-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
\set cnd_b '66666666-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

INSERT INTO organizations (id, name, slug) VALUES
  (:'org_a', 'SMOKE Org A', 'smoke-org-a'),
  (:'org_b', 'SMOKE Org B', 'smoke-org-b');

INSERT INTO auth.users (id, email) VALUES
  (:'usr_a', 'smoke-a@example.invalid'),
  (:'usr_b', 'smoke-b@example.invalid');

-- The insert above FIRES `on_auth_user_created`, which has created the
-- two `public.users` rows already — organization_id NULL, role
-- 'viewer', status 'pending'. So this is an UPDATE. It used to be an
-- INSERT, and it worked only because the baseline was silently missing
-- that trigger (defect 9); once the baseline carried it, the INSERT
-- became a duplicate key on `users_pkey` and the run died here, before
-- check 1. A rebuild now behaves like production, which is the point.
--
-- The claim stays unset: with it set this reads as a self-edit, and a
-- trigger refuses that with "only your name may be changed on your own
-- account".
UPDATE users SET organization_id = :'org_a', full_name = 'SMOKE A',
                 role = 'admin', status = 'active'
 WHERE id = :'usr_a';
UPDATE users SET organization_id = :'org_b', full_name = 'SMOKE B',
                 role = 'admin', status = 'active'
 WHERE id = :'usr_b';

INSERT INTO candidates (id, organization_id, full_name) VALUES
  (:'cnd_a', :'org_a', 'SMOKE Candidate A'),
  (:'cnd_b', :'org_b', 'SMOKE Candidate B');

-- ===== the checks =====================================================
DO $$
DECLARE
  org_a uuid := '11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  usr_a uuid := '33333333-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  usr_b uuid := '44444444-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  cnd_b uuid := '66666666-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  n integer;
  denied boolean;
BEGIN
  -- ---- 1. a member sees their own org's candidate -------------------
  PERFORM set_config('request.jwt.claim.sub', usr_a::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM candidates;
  RESET ROLE;
  IF n <> 1 THEN
    RAISE EXCEPTION 'READ-OWN FAILED: member of A saw % candidates, expected 1. A policy that shows nothing is not isolation, it is an outage.', n;
  END IF;
  RAISE NOTICE 'ok  1. member of A sees exactly their own 1 candidate';

  -- ---- 2. and cannot see the other org's ----------------------------
  PERFORM set_config('request.jwt.claim.sub', usr_a::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM candidates WHERE organization_id <> org_a;
  RESET ROLE;
  IF n <> 0 THEN
    RAISE EXCEPTION 'CROSS-TENANT READ: member of A saw % of org B''s candidates', n;
  END IF;
  RAISE NOTICE 'ok  2. member of A sees 0 of org B''s candidates';

  -- ---- 3. the view is symmetric -------------------------------------
  PERFORM set_config('request.jwt.claim.sub', usr_b::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM candidates;
  RESET ROLE;
  IF n <> 1 THEN
    RAISE EXCEPTION 'READ-OWN FAILED for B: saw % candidates, expected 1', n;
  END IF;
  RAISE NOTICE 'ok  3. member of B sees exactly their own 1 candidate';

  -- ---- 4. cross-tenant UPDATE is refused ----------------------------
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

  -- ---- 5. cross-tenant DELETE is refused ----------------------------
  PERFORM set_config('request.jwt.claim.sub', usr_a::text, true);
  SET LOCAL ROLE authenticated;
  DELETE FROM candidates WHERE id = cnd_b;
  GET DIAGNOSTICS n = ROW_COUNT;
  RESET ROLE;
  IF n <> 0 THEN
    RAISE EXCEPTION 'CROSS-TENANT DELETE: member of A deleted % of org B''s rows', n;
  END IF;
  RAISE NOTICE 'ok  5. member of A cannot delete org B''s candidate';

  -- ---- 6. INSERT into another org is refused ------------------------
  PERFORM set_config('request.jwt.claim.sub', usr_a::text, true);
  SET LOCAL ROLE authenticated;
  denied := false;
  BEGIN
    INSERT INTO candidates (organization_id, full_name)
      VALUES ('22222222-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'SMOKE smuggled');
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    denied := true;
  END;
  RESET ROLE;
  IF NOT denied THEN
    RAISE EXCEPTION 'CROSS-TENANT INSERT: member of A planted a row in org B';
  END IF;
  RAISE NOTICE 'ok  6. member of A cannot insert into org B';

  -- ---- 7. anon sees nothing -----------------------------------------
  PERFORM set_config('request.jwt.claim.sub', '', true);
  SET LOCAL ROLE anon;
  SELECT count(*) INTO n FROM candidates;
  RESET ROLE;
  IF n <> 0 THEN
    RAISE EXCEPTION 'ANON READ: unauthenticated saw % candidates', n;
  END IF;
  RAISE NOTICE 'ok  7. anon sees 0 candidates';

  -- ---- 8. a SUSPENDED member of A loses their own org too -----------
  -- Status is folded into the policy predicates, not just the app, and
  -- this is the check that proves it.
  --
  -- The claim is cleared first. Leaving it set makes this look like a
  -- self-edit, and a trigger refuses that with "only your name may be
  -- changed on your own account" -- which is the product working, and
  -- was discovered by this check failing on its first run.
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

  -- ---- 9. the same story on a second table --------------------------
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

  RAISE NOTICE '--- all isolation checks passed ---';
END
$$;

-- Nothing is kept. The whole run is one transaction and it is discarded.
ROLLBACK;
