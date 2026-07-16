-- Executive Intelligence — database invariant tests.
--
-- Verifies the hardening guarantees from migration 034 against a live
-- database. Runs entirely inside a transaction that is ROLLED BACK — no
-- fixture data survives. Execute as a privileged role (the script switches
-- to `authenticated` where the check depends on RLS/auth.uid()).
--
-- Invariants covered:
--   1. Approved profiles reject direct UPDATE (immutability trigger).
--   2. Drafts cannot be promoted to approved by direct UPDATE (RPC-only).
--   3. Profiles cannot be INSERTed pre-approved.
--   4. approve_success_profile approves the target and archives the previous
--      approved version atomically, leaving exactly one approved profile.
--   5. The RPC's transition flag does not leak: approved rows are immutable
--      again immediately after the RPC, in the same transaction.
--   6. Audit rows cannot be forged for another actor (actor_id = auth.uid()).
--   7. Audit rows with the caller as actor are accepted.
--
-- On success the script raises NOTICE 'ALL EXECUTIVE-INTELLIGENCE INVARIANTS
-- PASSED'; any failure raises an INVARIANT-FAIL exception.

begin;

-- Fixtures (synthetic UUIDs; removed by the final ROLLBACK). The auth.users
-- insert may fire handle_new_auth_user, so the public.users insert upserts.
insert into auth.users (id, email)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'invariants@test.local');

insert into public.organizations (id, name, slug)
values ('bbbbbbbb-0000-0000-0000-000000000001', 'Invariants Test Org', 'invariants-test-org');

insert into public.users (id, organization_id, email, status, role)
values (
  'aaaaaaaa-0000-0000-0000-000000000001',
  'bbbbbbbb-0000-0000-0000-000000000001',
  'invariants@test.local',
  'active',
  'admin'
)
on conflict (id) do update
  set organization_id = excluded.organization_id,
      status = excluded.status,
      role = excluded.role;

insert into public.executive_searches (id, organization_id, created_by, company_name, role_title)
values (
  'cccccccc-0000-0000-0000-000000000001',
  'bbbbbbbb-0000-0000-0000-000000000001',
  'aaaaaaaa-0000-0000-0000-000000000001',
  'InvariantsCo',
  'CTO'
);

insert into public.role_success_profiles (id, search_id, organization_id, version, created_by)
values
  ('dddddddd-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001',
   'bbbbbbbb-0000-0000-0000-000000000001', 1, 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('dddddddd-0000-0000-0000-000000000002', 'cccccccc-0000-0000-0000-000000000001',
   'bbbbbbbb-0000-0000-0000-000000000001', 2, 'aaaaaaaa-0000-0000-0000-000000000001');

-- Seed v1 as approved through the sanctioned flag (the same mechanism the
-- RPC uses) so invariant 1 has an approved row to attack.
select set_config('mandate.allow_profile_transition', 'on', true);
update public.role_success_profiles
   set status = 'approved',
       approved_by = 'aaaaaaaa-0000-0000-0000-000000000001',
       approved_at = now()
 where id = 'dddddddd-0000-0000-0000-000000000001';
select set_config('mandate.allow_profile_transition', '', true);

do $checks$
declare
  v_count  int;
  v_status text;
begin
  -- (1) approved rows are immutable to direct UPDATE
  begin
    update public.role_success_profiles
       set content_json = '{"tampered": true}'::jsonb
     where id = 'dddddddd-0000-0000-0000-000000000001';
    raise exception 'INVARIANT-FAIL: approved profile accepted a direct edit';
  exception when others then
    if sqlerrm like 'INVARIANT-FAIL%' then raise; end if;
  end;

  -- (2) drafts cannot be promoted to approved by direct UPDATE
  begin
    update public.role_success_profiles
       set status = 'approved'
     where id = 'dddddddd-0000-0000-0000-000000000002';
    raise exception 'INVARIANT-FAIL: draft was approved by direct update';
  exception when others then
    if sqlerrm like 'INVARIANT-FAIL%' then raise; end if;
  end;

  -- (3) profiles cannot be INSERTed pre-approved
  begin
    insert into public.role_success_profiles (search_id, organization_id, version, status)
    values ('cccccccc-0000-0000-0000-000000000001',
            'bbbbbbbb-0000-0000-0000-000000000001', 99, 'approved');
    raise exception 'INVARIANT-FAIL: pre-approved insert was accepted';
  exception when others then
    if sqlerrm like 'INVARIANT-FAIL%' then raise; end if;
  end;

  -- Switch to the authenticated test user for RPC + RLS checks.
  perform set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', 'aaaaaaaa-0000-0000-0000-000000000001',
      'role', 'authenticated'
    )::text,
    true
  );
  execute 'set local role authenticated';

  -- (4) approve RPC approves v2 and archives v1 atomically
  perform public.approve_success_profile(
    'dddddddd-0000-0000-0000-000000000002',
    'cccccccc-0000-0000-0000-000000000001'
  );

  select count(*) into v_count
    from public.role_success_profiles
   where search_id = 'cccccccc-0000-0000-0000-000000000001'
     and status = 'approved';
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL: expected exactly 1 approved profile, found %', v_count;
  end if;

  select status into v_status from public.role_success_profiles
   where id = 'dddddddd-0000-0000-0000-000000000001';
  if v_status <> 'archived' then
    raise exception 'INVARIANT-FAIL: previous approved profile was not archived (status=%)', v_status;
  end if;

  select status into v_status from public.role_success_profiles
   where id = 'dddddddd-0000-0000-0000-000000000002';
  if v_status <> 'approved' then
    raise exception 'INVARIANT-FAIL: target profile was not approved (status=%)', v_status;
  end if;

  -- (5) the RPC's transition flag does not leak past the RPC
  begin
    update public.role_success_profiles
       set content_json = '{"tampered": true}'::jsonb
     where id = 'dddddddd-0000-0000-0000-000000000002';
    raise exception 'INVARIANT-FAIL: approved profile editable after RPC ran in same transaction';
  exception when others then
    if sqlerrm like 'INVARIANT-FAIL%' then raise; end if;
  end;

  -- (6) audit rows cannot be forged for another actor
  begin
    insert into public.executive_audit_events (organization_id, search_id, actor_id, event_type)
    values ('bbbbbbbb-0000-0000-0000-000000000001',
            'cccccccc-0000-0000-0000-000000000001',
            'aaaaaaaa-0000-0000-0000-000000000002',
            'profile_approved');
    raise exception 'INVARIANT-FAIL: audit insert with foreign actor_id was accepted';
  exception when others then
    if sqlerrm like 'INVARIANT-FAIL%' then raise; end if;
  end;

  -- (7) audit rows with the caller as actor are accepted
  insert into public.executive_audit_events (organization_id, search_id, actor_id, event_type)
  values ('bbbbbbbb-0000-0000-0000-000000000001',
          'cccccccc-0000-0000-0000-000000000001',
          'aaaaaaaa-0000-0000-0000-000000000001',
          'profile_approved');

  raise notice 'ALL EXECUTIVE-INTELLIGENCE INVARIANTS PASSED';
end
$checks$;

rollback;
