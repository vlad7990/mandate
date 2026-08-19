-- External identity invariants (migrations 067–069).
--
-- Rolled back. Assertions run under `set local role authenticated` with a
-- forged `request.jwt.claims`, per users_policy_invariants.sql — what is
-- under test is what Postgres hands a real caller.
--
-- Four mechanisms are covered, and their refusals differ in kind, which
-- the assertions are explicit about: RLS *filters* reads and UPDATEs (zero
-- rows) and *raises* on INSERT (insufficient_privilege); the CHECK
-- constraints raise check_violation; the triggers raise
-- insufficient_privilege / check_violation / foreign_key_violation; and
-- the SECURITY DEFINER RPCs raise their stated errors or return empty.
--
--    1. The XOR boundary: an external cannot be given an organisation,
--       a staff row cannot be given a client — even on the privileged
--       path, because it is a CHECK, not a trigger.
--    2. can_read_org() is false for every external role, and an external
--       reads zero rows from the org-scoped tables and only their own
--       users row.
--    3. Rosters: a client_admin reads exactly their company's externals;
--       client_hr reads only themselves; staff read their clients'
--       externals and not another org's.
--    4. The D2 predicate truth table: share ∧ (client-scope ∨ grant),
--       false for the ungranted HM, the unshared mandate, the other
--       client, the suspended HM, and staff.
--    5. portal_list_mandates returns exactly the visible set per role.
--    6. portal_get_mandate returns only the slate (shortlist ids when
--       present, else rank order) and progress counts — never the pool.
--    7. portal_list_my_reviews is own-rows-only.
--    8. The 057 author guard, extended: an own-org client external is
--       accepted as review submitter; another org's client external is
--       refused (foreign_key_violation).
--    9. Issuance: viewer, foreign staff and non-admin externals refused;
--       a staff HM invitation auto-shares its mandates and auto-creates
--       the contact; duplicates and existing accounts refused
--       (unique_violation); grants on a non-HM invitation refused.
--   10. A client_admin invites colleagues, but only within the shared
--       set.
--   11. Redemption: the row becomes the invited external, grants land,
--       the invitation is spent (second redemption refused), a mismatched
--       email is refused.
--   12. Revocation: staff and the client_admin can revoke; client_hr
--       cannot; a revoked invitation neither verifies nor redeems.
--   13. Grant management: client_admin grants/revokes within shared;
--       unshared refused; a non-HM grantee refused by the integrity
--       trigger; a cross-client grant refused even for staff.
--   14. People management: client_admin suspends colleagues (status
--       only — role and email changes refused), cannot reach another
--       client's people; staff at clients:share manage their clients'
--       externals; viewer and foreign staff filtered to zero rows.
--   15. The trail exists by construction: external_invited,
--       external_joined, external_access_granted and
--       external_status_changed rows landed in the OWNING org — proof the
--       guard extension actually admits external actors.
--   16. A suspended external has no client, no portal, no mandate list.
--
-- On success: NOTICE 'ALL EXTERNAL-IDENTITY INVARIANTS PASSED'.

begin;

insert into public.organizations (id, name, slug) values
  ('67e00000-0000-4000-8000-0000000000a0', 'Ext Org A', 'ext-org-a'),
  ('67e00000-0000-4000-8000-0000000000b0', 'Ext Org B', 'ext-org-b');

insert into public.clients (id, organization_id, name) values
  ('67e00000-0000-4000-8000-00000000ca01', '67e00000-0000-4000-8000-0000000000a0', 'Ext Acme'),
  ('67e00000-0000-4000-8000-00000000cb01', '67e00000-0000-4000-8000-0000000000a0', 'Ext Beta'),
  ('67e00000-0000-4000-8000-00000000cc01', '67e00000-0000-4000-8000-0000000000b0', 'Ext Gamma');

insert into auth.users (id, email) values
  ('67e00000-0000-4000-8000-0000000000a1', 'ext-recruiter@test.local'),
  ('67e00000-0000-4000-8000-0000000000a2', 'ext-viewer@test.local'),
  ('67e00000-0000-4000-8000-0000000000b1', 'ext-b-recruiter@test.local'),
  ('67e00000-0000-4000-8000-0000000000e1', 'ext-hm1@test.local'),
  ('67e00000-0000-4000-8000-0000000000e2', 'ext-hr1@test.local'),
  ('67e00000-0000-4000-8000-0000000000e3', 'ext-cadmin1@test.local'),
  ('67e00000-0000-4000-8000-0000000000e4', 'ext-hmb@test.local'),
  ('67e00000-0000-4000-8000-0000000000e5', 'ext-hm-suspended@test.local'),
  ('67e00000-0000-4000-8000-0000000000e6', 'ext-hm-orgb@test.local');

update public.users set organization_id = '67e00000-0000-4000-8000-0000000000a0',
       status = 'active', role = 'recruiter', full_name = 'Ext Recruiter'
 where id = '67e00000-0000-4000-8000-0000000000a1';
update public.users set organization_id = '67e00000-0000-4000-8000-0000000000a0',
       status = 'active', role = 'viewer', full_name = 'Ext Viewer'
 where id = '67e00000-0000-4000-8000-0000000000a2';
update public.users set organization_id = '67e00000-0000-4000-8000-0000000000b0',
       status = 'active', role = 'recruiter', full_name = 'Ext B Recruiter'
 where id = '67e00000-0000-4000-8000-0000000000b1';

-- Externals: role + client in one statement (the XOR sees a consistent
-- row), org stays NULL from the signup trigger.
update public.users set role = 'hiring_manager', status = 'active',
       client_id = '67e00000-0000-4000-8000-00000000ca01', full_name = 'Ext HM One'
 where id = '67e00000-0000-4000-8000-0000000000e1';
update public.users set role = 'client_hr', status = 'active',
       client_id = '67e00000-0000-4000-8000-00000000ca01', full_name = 'Ext HR One'
 where id = '67e00000-0000-4000-8000-0000000000e2';
update public.users set role = 'client_admin', status = 'active',
       client_id = '67e00000-0000-4000-8000-00000000ca01', full_name = 'Ext Client Admin'
 where id = '67e00000-0000-4000-8000-0000000000e3';
update public.users set role = 'hiring_manager', status = 'active',
       client_id = '67e00000-0000-4000-8000-00000000cb01', full_name = 'Ext HM Beta'
 where id = '67e00000-0000-4000-8000-0000000000e4';
update public.users set role = 'hiring_manager', status = 'suspended',
       client_id = '67e00000-0000-4000-8000-00000000ca01', full_name = 'Ext HM Suspended'
 where id = '67e00000-0000-4000-8000-0000000000e5';
update public.users set role = 'hiring_manager', status = 'active',
       client_id = '67e00000-0000-4000-8000-00000000cc01', full_name = 'Ext HM OrgB'
 where id = '67e00000-0000-4000-8000-0000000000e6';

-- Mandates. P1 and P2 shared to Acme; P3 and P6 unshared; P4 shared to
-- Beta. Seeded privileged (no JWT → the 064 guards pass, as the service
-- path must).
insert into public.projects (id, organization_id, client_id, created_by,
                             title, company_name, one_line_input) values
  ('67e00000-0000-4000-8000-0000000ff001', '67e00000-0000-4000-8000-0000000000a0',
   '67e00000-0000-4000-8000-00000000ca01', '67e00000-0000-4000-8000-0000000000a1',
   'Ext CTO', 'Ext Acme', 'CTO for Ext Acme'),
  ('67e00000-0000-4000-8000-0000000ff002', '67e00000-0000-4000-8000-0000000000a0',
   '67e00000-0000-4000-8000-00000000ca01', '67e00000-0000-4000-8000-0000000000a1',
   'Ext CFO', 'Ext Acme', 'CFO for Ext Acme'),
  ('67e00000-0000-4000-8000-0000000ff003', '67e00000-0000-4000-8000-0000000000a0',
   '67e00000-0000-4000-8000-00000000ca01', '67e00000-0000-4000-8000-0000000000a1',
   'Ext COO', 'Ext Acme', 'COO for Ext Acme'),
  ('67e00000-0000-4000-8000-0000000ff006', '67e00000-0000-4000-8000-0000000000a0',
   '67e00000-0000-4000-8000-00000000ca01', '67e00000-0000-4000-8000-0000000000a1',
   'Ext CISO (confidential)', 'Ext Acme', 'CISO for Ext Acme'),
  ('67e00000-0000-4000-8000-0000000ff004', '67e00000-0000-4000-8000-0000000000a0',
   '67e00000-0000-4000-8000-00000000cb01', '67e00000-0000-4000-8000-0000000000a1',
   'Ext CDO', 'Ext Beta', 'CDO for Ext Beta');

insert into public.mandate_shares (organization_id, project_id, client_id) values
  ('67e00000-0000-4000-8000-0000000000a0', '67e00000-0000-4000-8000-0000000ff001',
   '67e00000-0000-4000-8000-00000000ca01'),
  ('67e00000-0000-4000-8000-0000000000a0', '67e00000-0000-4000-8000-0000000ff002',
   '67e00000-0000-4000-8000-00000000ca01'),
  ('67e00000-0000-4000-8000-0000000000a0', '67e00000-0000-4000-8000-0000000ff004',
   '67e00000-0000-4000-8000-00000000cb01');

insert into public.mandate_grants (organization_id, project_id, client_id, user_id) values
  ('67e00000-0000-4000-8000-0000000000a0', '67e00000-0000-4000-8000-0000000ff001',
   '67e00000-0000-4000-8000-00000000ca01', '67e00000-0000-4000-8000-0000000000e1'),
  ('67e00000-0000-4000-8000-0000000000a0', '67e00000-0000-4000-8000-0000000ff001',
   '67e00000-0000-4000-8000-00000000ca01', '67e00000-0000-4000-8000-0000000000e5'),
  ('67e00000-0000-4000-8000-0000000000a0', '67e00000-0000-4000-8000-0000000ff004',
   '67e00000-0000-4000-8000-00000000cb01', '67e00000-0000-4000-8000-0000000000e4');

-- P1: three candidates, shortlist pins two. P2: two candidates, no
-- shortlist — the rank-order fallback.
insert into public.candidates (id, organization_id, project_id, full_name) values
  ('67e00000-0000-4000-8000-00000000c101', '67e00000-0000-4000-8000-0000000000a0',
   '67e00000-0000-4000-8000-0000000ff001', 'Ext Cand One'),
  ('67e00000-0000-4000-8000-00000000c102', '67e00000-0000-4000-8000-0000000000a0',
   '67e00000-0000-4000-8000-0000000ff001', 'Ext Cand Two'),
  ('67e00000-0000-4000-8000-00000000c103', '67e00000-0000-4000-8000-0000000000a0',
   '67e00000-0000-4000-8000-0000000ff001', 'Ext Cand Three'),
  ('67e00000-0000-4000-8000-00000000c104', '67e00000-0000-4000-8000-0000000000a0',
   '67e00000-0000-4000-8000-0000000ff002', 'Ext Cand Four'),
  ('67e00000-0000-4000-8000-00000000c105', '67e00000-0000-4000-8000-0000000000a0',
   '67e00000-0000-4000-8000-0000000ff002', 'Ext Cand Five');

insert into public.candidate_scores (organization_id, project_id, candidate_id, rank_position, overall_score) values
  ('67e00000-0000-4000-8000-0000000000a0', '67e00000-0000-4000-8000-0000000ff001',
   '67e00000-0000-4000-8000-00000000c101', 1, 8.5),
  ('67e00000-0000-4000-8000-0000000000a0', '67e00000-0000-4000-8000-0000000ff001',
   '67e00000-0000-4000-8000-00000000c102', 2, 7.5),
  ('67e00000-0000-4000-8000-0000000000a0', '67e00000-0000-4000-8000-0000000ff001',
   '67e00000-0000-4000-8000-00000000c103', 3, 6.5),
  ('67e00000-0000-4000-8000-0000000000a0', '67e00000-0000-4000-8000-0000000ff002',
   '67e00000-0000-4000-8000-00000000c104', 1, 8.0),
  ('67e00000-0000-4000-8000-0000000000a0', '67e00000-0000-4000-8000-0000000ff002',
   '67e00000-0000-4000-8000-00000000c105', 2, 7.0);

insert into public.shortlists (project_id, organization_id, candidate_ids)
values ('67e00000-0000-4000-8000-0000000ff001', '67e00000-0000-4000-8000-0000000000a0',
        array['67e00000-0000-4000-8000-00000000c101',
              '67e00000-0000-4000-8000-00000000c102']::uuid[]);

-- Seed-time audit noise, scoped, never bare.
delete from public.activity_events
 where organization_id in ('67e00000-0000-4000-8000-0000000000a0',
                           '67e00000-0000-4000-8000-0000000000b0');

do $checks$
declare
  v_org_a     uuid := '67e00000-0000-4000-8000-0000000000a0';
  v_org_b     uuid := '67e00000-0000-4000-8000-0000000000b0';
  v_client_a  uuid := '67e00000-0000-4000-8000-00000000ca01';
  v_client_b  uuid := '67e00000-0000-4000-8000-00000000cb01';
  v_recruiter uuid := '67e00000-0000-4000-8000-0000000000a1';
  v_viewer    uuid := '67e00000-0000-4000-8000-0000000000a2';
  v_b_rec     uuid := '67e00000-0000-4000-8000-0000000000b1';
  v_hm1       uuid := '67e00000-0000-4000-8000-0000000000e1';
  v_hr1       uuid := '67e00000-0000-4000-8000-0000000000e2';
  v_cadmin    uuid := '67e00000-0000-4000-8000-0000000000e3';
  v_hmb       uuid := '67e00000-0000-4000-8000-0000000000e4';
  v_hmsus     uuid := '67e00000-0000-4000-8000-0000000000e5';
  v_hm_orgb   uuid := '67e00000-0000-4000-8000-0000000000e6';
  v_p1        uuid := '67e00000-0000-4000-8000-0000000ff001';
  v_p2        uuid := '67e00000-0000-4000-8000-0000000ff002';
  v_p3        uuid := '67e00000-0000-4000-8000-0000000ff003';
  v_p6        uuid := '67e00000-0000-4000-8000-0000000ff006';
  v_p4        uuid := '67e00000-0000-4000-8000-0000000ff004';
  v_c101      uuid := '67e00000-0000-4000-8000-00000000c101';
  v_c104      uuid := '67e00000-0000-4000-8000-00000000c104';
  v_redeemer  uuid := '67e00000-0000-4000-8000-0000000000d1';
  v_wrong     uuid := '67e00000-0000-4000-8000-0000000000d2';
  v_rows      int;
  v_count     int;
  v_ok        boolean;
  v_raised    boolean;
  v_json      jsonb;
  v_inv_hm    uuid;   v_tok_hm    uuid;
  v_inv_hr    uuid;   v_tok_hr    uuid;
  v_inv_rev   uuid;   v_tok_rev   uuid;
  v_inv_wrong uuid;   v_tok_wrong uuid;
begin
  execute 'set local role authenticated';

  ------------------------------------------------------------------------
  -- (1) The XOR is a CHECK — it holds even against the privileged path.
  ------------------------------------------------------------------------
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);

  v_raised := false;
  begin
    update public.users set organization_id = v_org_a where id = v_hm1;
  exception when check_violation then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (1): an external was given an organisation';
  end if;

  v_raised := false;
  begin
    update public.users set client_id = v_client_a where id = v_recruiter;
  exception when check_violation then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (1): a staff row was given a client';
  end if;

  execute 'set local role authenticated';

  ------------------------------------------------------------------------
  -- (2) can_read_org() and the org tables refuse every external.
  ------------------------------------------------------------------------
  declare
    v_who uuid;
  begin
    foreach v_who in array array[v_hm1, v_hr1, v_cadmin] loop
      perform set_config('request.jwt.claims',
        json_build_object('sub', v_who, 'role', 'authenticated')::text, true);
      select public.can_read_org() into v_ok;
      if coalesce(v_ok, false) then
        raise exception 'INVARIANT-FAIL (2): can_read_org() true for external %', v_who;
      end if;
    end loop;
  end;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_recruiter, 'role', 'authenticated')::text, true);
  select public.can_read_org() into v_ok;
  if not coalesce(v_ok, false) then
    raise exception 'INVARIANT-FAIL (2): can_read_org() false for staff recruiter';
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_hm1, 'role', 'authenticated')::text, true);

  select count(*) into v_count from public.projects;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (2): external reads % projects', v_count;
  end if;
  select count(*) into v_count from public.candidates;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (2): external reads % candidates', v_count;
  end if;
  select count(*) into v_count from public.clients;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (2): external reads % clients', v_count;
  end if;
  select count(*) into v_count from public.activity_events;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (2): external reads % trail events', v_count;
  end if;
  select count(*) into v_count from public.users;
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL (2): hiring manager reads % users rows, expected self only', v_count;
  end if;

  ------------------------------------------------------------------------
  -- (3) Rosters.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_cadmin, 'role', 'authenticated')::text, true);
  select count(*) into v_count from public.users where client_id = v_client_a;
  if v_count <> 4 then
    raise exception 'INVARIANT-FAIL (3): client_admin sees % of 4 company externals', v_count;
  end if;
  select count(*) into v_count from public.users where client_id = v_client_b;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (3): client_admin sees % of another client''s people', v_count;
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_hr1, 'role', 'authenticated')::text, true);
  select count(*) into v_count from public.users;
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL (3): client_hr reads % users rows, expected self only', v_count;
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_recruiter, 'role', 'authenticated')::text, true);
  select count(*) into v_count from public.users where client_id = v_client_a;
  if v_count <> 4 then
    raise exception 'INVARIANT-FAIL (3): staff sees % of 4 client externals', v_count;
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_b_rec, 'role', 'authenticated')::text, true);
  select count(*) into v_count from public.users where client_id = v_client_a;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (3): org B staff sees % of org A''s client externals', v_count;
  end if;

  ------------------------------------------------------------------------
  -- (4) The D2 predicate: share AND (client-scope OR grant).
  ------------------------------------------------------------------------
  declare
    v_who     uuid;
    v_target  uuid;
    v_want    boolean;
  begin
    for v_who, v_target, v_want in
      select * from (values
        ('67e00000-0000-4000-8000-0000000000e1'::uuid, '67e00000-0000-4000-8000-0000000ff001'::uuid, true),   -- hm1, granted+shared
        ('67e00000-0000-4000-8000-0000000000e1'::uuid, '67e00000-0000-4000-8000-0000000ff002'::uuid, false),  -- hm1, shared, no grant
        ('67e00000-0000-4000-8000-0000000000e1'::uuid, '67e00000-0000-4000-8000-0000000ff006'::uuid, false),  -- hm1, unshared
        ('67e00000-0000-4000-8000-0000000000e1'::uuid, '67e00000-0000-4000-8000-0000000ff004'::uuid, false),  -- hm1, other client
        ('67e00000-0000-4000-8000-0000000000e2'::uuid, '67e00000-0000-4000-8000-0000000ff001'::uuid, true),   -- hr1, client-scoped
        ('67e00000-0000-4000-8000-0000000000e2'::uuid, '67e00000-0000-4000-8000-0000000ff002'::uuid, true),
        ('67e00000-0000-4000-8000-0000000000e2'::uuid, '67e00000-0000-4000-8000-0000000ff006'::uuid, false),  -- unshared stays dark
        ('67e00000-0000-4000-8000-0000000000e2'::uuid, '67e00000-0000-4000-8000-0000000ff004'::uuid, false),  -- other client
        ('67e00000-0000-4000-8000-0000000000e3'::uuid, '67e00000-0000-4000-8000-0000000ff002'::uuid, true),   -- client_admin
        ('67e00000-0000-4000-8000-0000000000e5'::uuid, '67e00000-0000-4000-8000-0000000ff001'::uuid, false),  -- suspended, though granted
        ('67e00000-0000-4000-8000-0000000000a1'::uuid, '67e00000-0000-4000-8000-0000000ff001'::uuid, false)   -- staff is not a portal principal
      ) as t(who, target, want)
    loop
      perform set_config('request.jwt.claims',
        json_build_object('sub', v_who, 'role', 'authenticated')::text, true);
      select public.can_view_portal_mandate(v_target) into v_ok;
      if v_ok is distinct from v_want then
        raise exception 'INVARIANT-FAIL (4): can_view_portal_mandate(%) = % for %', v_target, v_ok, v_who;
      end if;
    end loop;
  end;

  ------------------------------------------------------------------------
  -- (5) The mandate list per principal.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_hm1, 'role', 'authenticated')::text, true);
  select count(*) into v_count from public.portal_list_mandates();
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL (5): hm1 lists % mandates, expected 1', v_count;
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_hr1, 'role', 'authenticated')::text, true);
  select count(*) into v_count from public.portal_list_mandates();
  if v_count <> 2 then
    raise exception 'INVARIANT-FAIL (5): hr1 lists % mandates, expected 2', v_count;
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_hmb, 'role', 'authenticated')::text, true);
  select count(*) into v_count from public.portal_list_mandates();
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL (5): Beta hm lists % mandates, expected 1', v_count;
  end if;

  ------------------------------------------------------------------------
  -- (6) The slate, both branches, and progress counts only.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_hm1, 'role', 'authenticated')::text, true);

  select public.portal_get_mandate(v_p1) into v_json;
  if v_json is null then
    raise exception 'INVARIANT-FAIL (6): granted hm got NULL for the shared mandate';
  end if;
  if jsonb_array_length(v_json->'candidates') <> 2 then
    raise exception 'INVARIANT-FAIL (6): shortlist slate has % rows, expected 2',
      jsonb_array_length(v_json->'candidates');
  end if;
  if (v_json->'progress'->>'candidates_total')::int <> 3 then
    raise exception 'INVARIANT-FAIL (6): progress total = %, expected 3',
      v_json->'progress'->>'candidates_total';
  end if;

  select public.portal_get_mandate(v_p2) into v_json;
  if v_json is not null then
    raise exception 'INVARIANT-FAIL (6): ungranted hm got the mandate payload';
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_hr1, 'role', 'authenticated')::text, true);
  select public.portal_get_mandate(v_p2) into v_json;
  if jsonb_array_length(v_json->'candidates') <> 2 then
    raise exception 'INVARIANT-FAIL (6): fallback slate has % rows, expected 2',
      jsonb_array_length(v_json->'candidates');
  end if;

  ------------------------------------------------------------------------
  -- (7)+(8) Attribution: the extended author guard, then own-rows-only.
  ------------------------------------------------------------------------
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);

  v_raised := false;
  begin
    insert into public.hiring_manager_reviews
      (project_id, organization_id, candidate_ratings, submitted_by_user_id)
    values (v_p1, v_org_a, '{}'::jsonb, v_hm_orgb);
  exception when foreign_key_violation then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (8): another org''s client external was accepted as submitter';
  end if;

  insert into public.hiring_manager_reviews
    (project_id, organization_id, candidate_ratings, submitted_by_user_id, hm_label)
  values (v_p1, v_org_a,
          jsonb_build_object(v_c101::text, jsonb_build_object('rating', 'yes', 'feedback', 'solid')),
          v_hm1, 'Ext HM One');

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_hm1, 'role', 'authenticated')::text, true);
  select count(*) into v_count from public.portal_list_my_reviews(v_p1);
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL (7): hm1 sees % own reviews, expected 1', v_count;
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_hr1, 'role', 'authenticated')::text, true);
  select count(*) into v_count from public.portal_list_my_reviews(v_p1);
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (7): hr1 sees % of a colleague''s reviews', v_count;
  end if;

  ------------------------------------------------------------------------
  -- (9) Issuance.
  ------------------------------------------------------------------------
  declare
    v_who uuid;
  begin
    foreach v_who in array array[v_viewer, v_b_rec, v_hr1, v_hm1] loop
      perform set_config('request.jwt.claims',
        json_build_object('sub', v_who, 'role', 'authenticated')::text, true);
      v_raised := false;
      begin
        perform public.issue_external_invitation(
          v_client_a, 'ext-refused@test.local', 'Refused Person', 'hiring_manager');
      exception when insufficient_privilege then v_raised := true; end;
      if not v_raised then
        raise exception 'INVARIANT-FAIL (9): % issued an invitation without the tier', v_who;
      end if;
    end loop;
  end;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_recruiter, 'role', 'authenticated')::text, true);

  select invitation_id, invitation_token into v_inv_hm, v_tok_hm
    from public.issue_external_invitation(
      v_client_a, 'ext-new-hm@test.local', 'New HM', 'hiring_manager',
      array[v_p3]::uuid[]);
  if v_inv_hm is null then
    raise exception 'INVARIANT-FAIL (9): staff HM invitation did not issue';
  end if;

  select count(*) into v_count from public.mandate_shares where project_id = v_p3;
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL (9): the HM invitation did not auto-share its mandate';
  end if;

  select count(*) into v_count from public.client_contacts
   where client_id = v_client_a and email_key = 'ext-new-hm@test.local';
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL (9): the invitee was not created as a contact';
  end if;

  v_raised := false;
  begin
    perform public.issue_external_invitation(
      v_client_a, 'ext-new-hm@test.local', 'New HM', 'hiring_manager');
  exception when unique_violation then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (9): a duplicate live invitation was accepted';
  end if;

  v_raised := false;
  begin
    perform public.issue_external_invitation(
      v_client_a, 'ext-hm1@test.local', 'Ext HM One', 'hiring_manager');
  exception when unique_violation then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (9): an existing account''s email was invited again';
  end if;

  v_raised := false;
  begin
    perform public.issue_external_invitation(
      v_client_a, 'ext-hr-grants@test.local', 'HR With Grants', 'client_hr',
      array[v_p1]::uuid[]);
  exception when check_violation then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (9): a non-HM invitation carried grants';
  end if;

  ------------------------------------------------------------------------
  -- (10) The client_admin invites colleagues, inside the shared set only.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_cadmin, 'role', 'authenticated')::text, true);

  select invitation_id, invitation_token into v_inv_hr, v_tok_hr
    from public.issue_external_invitation(
      v_client_a, 'ext-new-hr@test.local', 'New HR', 'client_hr');
  if v_inv_hr is null then
    raise exception 'INVARIANT-FAIL (10): client_admin colleague invitation did not issue';
  end if;

  v_raised := false;
  begin
    perform public.issue_external_invitation(
      v_client_a, 'ext-new-hm2@test.local', 'New HM Two', 'hiring_manager',
      array[v_p6]::uuid[]);
  exception when insufficient_privilege then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (10): client_admin granted an unshared mandate';
  end if;

  ------------------------------------------------------------------------
  -- (11) Redemption.
  ------------------------------------------------------------------------
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);

  insert into auth.users (id, email) values (v_redeemer, 'ext-new-hm@test.local');
  perform public.redeem_invitation(v_tok_hm, v_redeemer);

  select count(*) into v_count from public.users
   where id = v_redeemer and role = 'hiring_manager'
     and client_id = v_client_a and status = 'active' and organization_id is null;
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL (11): redemption did not produce the invited external';
  end if;

  select count(*) into v_count from public.mandate_grants
   where project_id = v_p3 and user_id = v_redeemer;
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL (11): the promised grant did not land';
  end if;

  v_raised := false;
  begin
    perform public.redeem_invitation(v_tok_hm, v_redeemer);
  exception when no_data_found then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (11): a spent invitation redeemed twice';
  end if;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_recruiter, 'role', 'authenticated')::text, true);
  select invitation_id, invitation_token into v_inv_wrong, v_tok_wrong
    from public.issue_external_invitation(
      v_client_a, 'ext-intended@test.local', 'Intended Person', 'client_hr');

  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  insert into auth.users (id, email) values (v_wrong, 'ext-imposter@test.local');
  v_raised := false;
  begin
    perform public.redeem_invitation(v_tok_wrong, v_wrong);
  exception when check_violation then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (11): an invitation redeemed against the wrong email';
  end if;

  execute 'set local role authenticated';

  ------------------------------------------------------------------------
  -- (12) Revocation.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_hr1, 'role', 'authenticated')::text, true);
  v_raised := false;
  begin
    perform public.revoke_external_invitation(v_inv_hr);
  exception when insufficient_privilege then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (12): client_hr revoked an invitation';
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_cadmin, 'role', 'authenticated')::text, true);
  perform public.revoke_external_invitation(v_inv_hr);
  select count(*) into v_count from public.verify_invitation(v_tok_hr);
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (12): a revoked invitation still verifies';
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_recruiter, 'role', 'authenticated')::text, true);
  select invitation_id, invitation_token into v_inv_rev, v_tok_rev
    from public.issue_external_invitation(
      v_client_a, 'ext-staff-revoked@test.local', 'Staff Revoked', 'client_hr');
  perform public.revoke_external_invitation(v_inv_rev);

  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  v_raised := false;
  begin
    perform public.redeem_invitation(v_tok_rev, v_wrong);
  exception when no_data_found then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (12): a revoked invitation redeemed';
  end if;
  execute 'set local role authenticated';

  ------------------------------------------------------------------------
  -- (13) Grant management.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_cadmin, 'role', 'authenticated')::text, true);

  -- Verified through portal_list_grants, not the base table: the base
  -- table's SELECT is staff-only by design, so the ledger RPC is both
  -- the client_admin's real read surface and the thing under test.
  perform public.grant_mandate_access(v_p2, v_hm1);
  select count(*) into v_count from public.portal_list_grants() g
   where g.project_id = v_p2 and g.user_id = v_hm1;
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL (13): client_admin grant did not land';
  end if;

  perform public.revoke_mandate_access(v_p2, v_hm1);
  select count(*) into v_count from public.portal_list_grants() g
   where g.project_id = v_p2 and g.user_id = v_hm1;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (13): client_admin revoke did not land';
  end if;

  v_raised := false;
  begin
    perform public.grant_mandate_access(v_p6, v_hm1);
  exception when insufficient_privilege then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (13): an unshared mandate was granted';
  end if;

  v_raised := false;
  begin
    perform public.grant_mandate_access(v_p2, v_hr1);
  exception when foreign_key_violation then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (13): a non-HM took a grant';
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_hm1, 'role', 'authenticated')::text, true);
  v_raised := false;
  begin
    perform public.grant_mandate_access(v_p2, v_hm1);
  exception when insufficient_privilege then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (13): a hiring manager granted themselves access';
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_recruiter, 'role', 'authenticated')::text, true);
  v_raised := false;
  begin
    insert into public.mandate_grants (organization_id, project_id, client_id, user_id)
    values (v_org_a, v_p1, v_client_a, v_hmb);
  exception when foreign_key_violation then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (13): a cross-client grant was accepted for staff';
  end if;

  ------------------------------------------------------------------------
  -- (14) People management.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_cadmin, 'role', 'authenticated')::text, true);

  update public.users set status = 'suspended' where id = v_hm1;
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    raise exception 'INVARIANT-FAIL (14): client_admin suspension wrote % rows', v_rows;
  end if;
  update public.users set status = 'active' where id = v_hm1;

  v_raised := false;
  begin
    update public.users set role = 'client_admin' where id = v_hm1;
  exception when insufficient_privilege then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (14): client_admin changed a colleague''s role';
  end if;

  update public.users set status = 'suspended' where id = v_hmb;
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then
    raise exception 'INVARIANT-FAIL (14): client_admin reached another client''s person';
  end if;

  v_raised := false;
  begin
    update public.users set client_id = v_client_b where id = v_hm1;
  exception when insufficient_privilege then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (14): client_id moved by a non-founder';
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_hr1, 'role', 'authenticated')::text, true);
  update public.users set status = 'suspended' where id = v_hm1;
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then
    raise exception 'INVARIANT-FAIL (14): client_hr suspended a colleague';
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_recruiter, 'role', 'authenticated')::text, true);
  update public.users set status = 'suspended' where id = v_hm1;
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    raise exception 'INVARIANT-FAIL (14): staff suspension wrote % rows', v_rows;
  end if;
  update public.users set status = 'active' where id = v_hm1;

  v_raised := false;
  begin
    update public.users set email = 'ext-renamed@test.local' where id = v_hm1;
  exception when insufficient_privilege then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (14): staff changed an external''s email';
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_viewer, 'role', 'authenticated')::text, true);
  update public.users set status = 'suspended' where id = v_hm1;
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then
    raise exception 'INVARIANT-FAIL (14): a viewer suspended an external';
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_b_rec, 'role', 'authenticated')::text, true);
  update public.users set status = 'suspended' where id = v_hm1;
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then
    raise exception 'INVARIANT-FAIL (14): foreign staff suspended an external';
  end if;

  ------------------------------------------------------------------------
  -- (15) The trail, by construction, in the owning org. Read privileged:
  --      the previous principal was org B staff, whose RLS rightly
  --      filters org A's trail to nothing.
  ------------------------------------------------------------------------
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);

  select count(*) into v_count from public.activity_events
   where organization_id = v_org_a and event_type = 'external_invited';
  if v_count < 3 then
    raise exception 'INVARIANT-FAIL (15): % external_invited events, expected >= 3', v_count;
  end if;

  select count(*) into v_count from public.activity_events
   where organization_id = v_org_a and event_type = 'external_joined'
     and target_user_id = v_redeemer;
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL (15): external_joined missing for the redeemer';
  end if;

  select count(*) into v_count from public.activity_events
   where organization_id = v_org_a and event_type = 'external_access_granted';
  if v_count < 2 then
    raise exception 'INVARIANT-FAIL (15): % external_access_granted events, expected >= 2', v_count;
  end if;

  select count(*) into v_count from public.activity_events
   where organization_id = v_org_a and event_type = 'external_status_changed'
     and target_user_id = v_hm1;
  if v_count < 2 then
    raise exception 'INVARIANT-FAIL (15): % external_status_changed events for hm1, expected >= 2', v_count;
  end if;

  ------------------------------------------------------------------------
  -- (16) External writes to the org tables, and the suspended external.
  ------------------------------------------------------------------------
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_hm1, 'role', 'authenticated')::text, true);

  v_raised := false;
  begin
    insert into public.candidates (organization_id, project_id, full_name)
    values (v_org_a, v_p1, 'Ext Intruder');
  exception when insufficient_privilege then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (16): an external inserted a candidate';
  end if;

  update public.projects set title = 'Hijacked' where id = v_p1;
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then
    raise exception 'INVARIANT-FAIL (16): an external updated a mandate';
  end if;

  v_raised := false;
  begin
    insert into public.mandate_shares (organization_id, project_id, client_id)
    values (v_org_a, v_p6, v_client_a);
  exception when insufficient_privilege then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (16): an external shared a mandate to themselves';
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_hmsus, 'role', 'authenticated')::text, true);
  if (select public.current_user_client_id()) is not null then
    raise exception 'INVARIANT-FAIL (16): a suspended external still has a client';
  end if;
  select count(*) into v_count from public.portal_list_mandates();
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (16): a suspended external lists % mandates', v_count;
  end if;

  raise notice 'ALL EXTERNAL-IDENTITY INVARIANTS PASSED';
end
$checks$;

rollback;
