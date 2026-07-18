-- Executive Intelligence — assessment invariant tests.
--
-- Companion to executive_interview_plan_invariants.sql, for the Phase 2c
-- assessment table (migration 038). Verifies the same hardening guarantees,
-- plus the linkage-required creation gate.
--
-- Runs inside a transaction that is ROLLED BACK. Execute as a privileged role;
-- the RPC/RLS checks switch to `authenticated`.
--
-- Invariants:
--   1. Approved assessments reject direct UPDATE (immutability trigger).
--   2. Drafts cannot be promoted to approved by direct UPDATE (RPC-only).
--   3. Assessments cannot be INSERTed pre-approved.
--   4. approve_assessment approves the target + archives the previous approved
--      version → exactly one approved per (search, candidate).
--   5. The assessment transition flag does not leak past the RPC.
--   6. allocate_and_insert_assessment refuses an UNLINKED candidate.
--
-- On success: NOTICE 'ALL ASSESSMENT INVARIANTS PASSED'.

begin;

insert into auth.users (id, email)
values ('aaaaaaaa-0000-0000-0000-0000000000a1', 'assessment-invariants@test.local');

insert into public.organizations (id, name, slug)
values ('bbbbbbbb-0000-0000-0000-0000000000a1', 'Assessment Test Org', 'assessment-test-org');

insert into public.users (id, organization_id, email, status, role)
values (
  'aaaaaaaa-0000-0000-0000-0000000000a1',
  'bbbbbbbb-0000-0000-0000-0000000000a1',
  'assessment-invariants@test.local', 'active', 'admin'
)
on conflict (id) do update
  set organization_id = excluded.organization_id, status = excluded.status, role = excluded.role;

insert into public.executive_searches (id, organization_id, created_by, company_name, role_title)
values ('cccccccc-0000-0000-0000-0000000000a1', 'bbbbbbbb-0000-0000-0000-0000000000a1',
        'aaaaaaaa-0000-0000-0000-0000000000a1', 'AssessCo', 'CTO');

-- One linked candidate, and one deliberately-unlinked candidate.
insert into public.candidates (id, organization_id, full_name, cv_processing)
values
  ('eeeeeeee-0000-0000-0000-0000000000a1', 'bbbbbbbb-0000-0000-0000-0000000000a1', 'Linked Cand', false),
  ('eeeeeeee-0000-0000-0000-0000000000a2', 'bbbbbbbb-0000-0000-0000-0000000000a1', 'Unlinked Cand', false);

insert into public.executive_search_candidates (search_id, organization_id, candidate_id, added_by)
values ('cccccccc-0000-0000-0000-0000000000a1', 'bbbbbbbb-0000-0000-0000-0000000000a1',
        'eeeeeeee-0000-0000-0000-0000000000a1', 'aaaaaaaa-0000-0000-0000-0000000000a1');

-- Two assessment versions for the linked candidate.
insert into public.executive_assessments (id, search_id, candidate_id, organization_id, version, created_by)
values
  ('dddddddd-0000-0000-0000-0000000000a1', 'cccccccc-0000-0000-0000-0000000000a1',
   'eeeeeeee-0000-0000-0000-0000000000a1', 'bbbbbbbb-0000-0000-0000-0000000000a1', 1,
   'aaaaaaaa-0000-0000-0000-0000000000a1'),
  ('dddddddd-0000-0000-0000-0000000000a2', 'cccccccc-0000-0000-0000-0000000000a1',
   'eeeeeeee-0000-0000-0000-0000000000a1', 'bbbbbbbb-0000-0000-0000-0000000000a1', 2,
   'aaaaaaaa-0000-0000-0000-0000000000a1');

-- Seed v1 as approved through the sanctioned flag.
select set_config('mandate.allow_assessment_transition', 'on', true);
update public.executive_assessments
   set status = 'approved', approved_by = 'aaaaaaaa-0000-0000-0000-0000000000a1', approved_at = now()
 where id = 'dddddddd-0000-0000-0000-0000000000a1';
select set_config('mandate.allow_assessment_transition', '', true);

do $checks$
declare
  v_count int;
  v_status text;
begin
  -- (1) approved rows immutable to direct UPDATE
  begin
    update public.executive_assessments
       set content_json = '{"tampered": true}'::jsonb
     where id = 'dddddddd-0000-0000-0000-0000000000a1';
    raise exception 'INVARIANT-FAIL: approved assessment accepted a direct edit';
  exception when others then
    if sqlerrm like 'INVARIANT-FAIL%' then raise; end if;
  end;

  -- (2) drafts cannot be promoted by direct UPDATE
  begin
    update public.executive_assessments
       set status = 'approved'
     where id = 'dddddddd-0000-0000-0000-0000000000a2';
    raise exception 'INVARIANT-FAIL: draft assessment was approved by direct update';
  exception when others then
    if sqlerrm like 'INVARIANT-FAIL%' then raise; end if;
  end;

  -- (3) pre-approved insert rejected
  begin
    insert into public.executive_assessments (search_id, candidate_id, organization_id, version, status)
    values ('cccccccc-0000-0000-0000-0000000000a1', 'eeeeeeee-0000-0000-0000-0000000000a1',
            'bbbbbbbb-0000-0000-0000-0000000000a1', 99, 'approved');
    raise exception 'INVARIANT-FAIL: pre-approved assessment insert was accepted';
  exception when others then
    if sqlerrm like 'INVARIANT-FAIL%' then raise; end if;
  end;

  -- Switch to authenticated for RPC + RLS checks.
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', 'aaaaaaaa-0000-0000-0000-0000000000a1', 'role', 'authenticated')::text,
    true
  );
  execute 'set local role authenticated';

  -- (4) approve RPC approves v2 and archives v1
  perform public.approve_assessment(
    'dddddddd-0000-0000-0000-0000000000a2',
    'cccccccc-0000-0000-0000-0000000000a1',
    'eeeeeeee-0000-0000-0000-0000000000a1'
  );

  select count(*) into v_count from public.executive_assessments
   where search_id = 'cccccccc-0000-0000-0000-0000000000a1'
     and candidate_id = 'eeeeeeee-0000-0000-0000-0000000000a1'
     and status = 'approved';
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL: expected exactly 1 approved assessment, found %', v_count;
  end if;

  select status into v_status from public.executive_assessments
   where id = 'dddddddd-0000-0000-0000-0000000000a1';
  if v_status <> 'archived' then
    raise exception 'INVARIANT-FAIL: previous approved assessment not archived (status=%)', v_status;
  end if;

  select status into v_status from public.executive_assessments
   where id = 'dddddddd-0000-0000-0000-0000000000a2';
  if v_status <> 'approved' then
    raise exception 'INVARIANT-FAIL: target assessment not approved (status=%)', v_status;
  end if;

  -- (5) flag does not leak past the RPC
  begin
    update public.executive_assessments
       set content_json = '{"tampered": true}'::jsonb
     where id = 'dddddddd-0000-0000-0000-0000000000a2';
    raise exception 'INVARIANT-FAIL: approved assessment editable after RPC in same transaction';
  exception when others then
    if sqlerrm like 'INVARIANT-FAIL%' then raise; end if;
  end;

  -- (6) allocate refuses an unlinked candidate
  begin
    perform public.allocate_and_insert_assessment(
      'cccccccc-0000-0000-0000-0000000000a1',
      'eeeeeeee-0000-0000-0000-0000000000a2',  -- unlinked
      'bbbbbbbb-0000-0000-0000-0000000000a1',
      null, '{}'::jsonb,
      'aaaaaaaa-0000-0000-0000-0000000000a1'
    );
    raise exception 'INVARIANT-FAIL: allocate accepted an unlinked candidate';
  exception when others then
    if sqlerrm like 'INVARIANT-FAIL%' then raise; end if;
  end;

  raise notice 'ALL ASSESSMENT INVARIANTS PASSED';
end
$checks$;

rollback;
