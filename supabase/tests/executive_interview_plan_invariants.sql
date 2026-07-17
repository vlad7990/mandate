-- Executive Intelligence — interview-plan invariant tests.
--
-- Companion to executive_intelligence_invariants.sql, for the Phase 2 plan
-- tables (migration 037). Verifies the same hardening guarantees, plus the
-- linkage-required generation gate.
--
-- Runs inside a transaction that is ROLLED BACK. Execute as a privileged role;
-- the RPC/RLS checks switch to `authenticated`.
--
-- Invariants:
--   1. Approved plans reject direct UPDATE (immutability trigger).
--   2. Drafts cannot be promoted to approved by direct UPDATE (RPC-only).
--   3. Plans cannot be INSERTed pre-approved.
--   4. approve_interview_plan approves the target + archives the previous
--      approved version → exactly one approved per (search, candidate).
--   5. The plan transition flag does not leak past the RPC.
--   6. allocate_and_insert_interview_plan refuses an UNLINKED candidate.
--
-- On success: NOTICE 'ALL INTERVIEW-PLAN INVARIANTS PASSED'.

begin;

insert into auth.users (id, email)
values ('aaaaaaaa-0000-0000-0000-0000000000f1', 'plan-invariants@test.local');

insert into public.organizations (id, name, slug)
values ('bbbbbbbb-0000-0000-0000-0000000000f1', 'Plan Test Org', 'plan-test-org');

insert into public.users (id, organization_id, email, status, role)
values (
  'aaaaaaaa-0000-0000-0000-0000000000f1',
  'bbbbbbbb-0000-0000-0000-0000000000f1',
  'plan-invariants@test.local', 'active', 'admin'
)
on conflict (id) do update
  set organization_id = excluded.organization_id, status = excluded.status, role = excluded.role;

insert into public.executive_searches (id, organization_id, created_by, company_name, role_title)
values ('cccccccc-0000-0000-0000-0000000000f1', 'bbbbbbbb-0000-0000-0000-0000000000f1',
        'aaaaaaaa-0000-0000-0000-0000000000f1', 'PlanCo', 'CTO');

-- One linked candidate, and one deliberately-unlinked candidate.
insert into public.candidates (id, organization_id, full_name, cv_processing)
values
  ('eeeeeeee-0000-0000-0000-0000000000f1', 'bbbbbbbb-0000-0000-0000-0000000000f1', 'Linked Cand', false),
  ('eeeeeeee-0000-0000-0000-0000000000f2', 'bbbbbbbb-0000-0000-0000-0000000000f1', 'Unlinked Cand', false);

insert into public.executive_search_candidates (search_id, organization_id, candidate_id, added_by)
values ('cccccccc-0000-0000-0000-0000000000f1', 'bbbbbbbb-0000-0000-0000-0000000000f1',
        'eeeeeeee-0000-0000-0000-0000000000f1', 'aaaaaaaa-0000-0000-0000-0000000000f1');

-- Two plan versions for the linked candidate.
insert into public.executive_interview_plans (id, search_id, candidate_id, organization_id, version, created_by)
values
  ('dddddddd-0000-0000-0000-0000000000f1', 'cccccccc-0000-0000-0000-0000000000f1',
   'eeeeeeee-0000-0000-0000-0000000000f1', 'bbbbbbbb-0000-0000-0000-0000000000f1', 1,
   'aaaaaaaa-0000-0000-0000-0000000000f1'),
  ('dddddddd-0000-0000-0000-0000000000f2', 'cccccccc-0000-0000-0000-0000000000f1',
   'eeeeeeee-0000-0000-0000-0000000000f1', 'bbbbbbbb-0000-0000-0000-0000000000f1', 2,
   'aaaaaaaa-0000-0000-0000-0000000000f1');

-- Seed v1 as approved through the sanctioned flag.
select set_config('mandate.allow_plan_transition', 'on', true);
update public.executive_interview_plans
   set status = 'approved', approved_by = 'aaaaaaaa-0000-0000-0000-0000000000f1', approved_at = now()
 where id = 'dddddddd-0000-0000-0000-0000000000f1';
select set_config('mandate.allow_plan_transition', '', true);

do $checks$
declare
  v_count int;
  v_status text;
begin
  -- (1) approved rows immutable to direct UPDATE
  begin
    update public.executive_interview_plans
       set content_json = '{"tampered": true}'::jsonb
     where id = 'dddddddd-0000-0000-0000-0000000000f1';
    raise exception 'INVARIANT-FAIL: approved plan accepted a direct edit';
  exception when others then
    if sqlerrm like 'INVARIANT-FAIL%' then raise; end if;
  end;

  -- (2) drafts cannot be promoted by direct UPDATE
  begin
    update public.executive_interview_plans
       set status = 'approved'
     where id = 'dddddddd-0000-0000-0000-0000000000f2';
    raise exception 'INVARIANT-FAIL: draft plan was approved by direct update';
  exception when others then
    if sqlerrm like 'INVARIANT-FAIL%' then raise; end if;
  end;

  -- (3) pre-approved insert rejected
  begin
    insert into public.executive_interview_plans (search_id, candidate_id, organization_id, version, status)
    values ('cccccccc-0000-0000-0000-0000000000f1', 'eeeeeeee-0000-0000-0000-0000000000f1',
            'bbbbbbbb-0000-0000-0000-0000000000f1', 99, 'approved');
    raise exception 'INVARIANT-FAIL: pre-approved plan insert was accepted';
  exception when others then
    if sqlerrm like 'INVARIANT-FAIL%' then raise; end if;
  end;

  -- Switch to authenticated for RPC + RLS checks.
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', 'aaaaaaaa-0000-0000-0000-0000000000f1', 'role', 'authenticated')::text,
    true
  );
  execute 'set local role authenticated';

  -- (4) approve RPC approves v2 and archives v1
  perform public.approve_interview_plan(
    'dddddddd-0000-0000-0000-0000000000f2',
    'cccccccc-0000-0000-0000-0000000000f1',
    'eeeeeeee-0000-0000-0000-0000000000f1'
  );

  select count(*) into v_count from public.executive_interview_plans
   where search_id = 'cccccccc-0000-0000-0000-0000000000f1'
     and candidate_id = 'eeeeeeee-0000-0000-0000-0000000000f1'
     and status = 'approved';
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL: expected exactly 1 approved plan, found %', v_count;
  end if;

  select status into v_status from public.executive_interview_plans
   where id = 'dddddddd-0000-0000-0000-0000000000f1';
  if v_status <> 'archived' then
    raise exception 'INVARIANT-FAIL: previous approved plan not archived (status=%)', v_status;
  end if;

  select status into v_status from public.executive_interview_plans
   where id = 'dddddddd-0000-0000-0000-0000000000f2';
  if v_status <> 'approved' then
    raise exception 'INVARIANT-FAIL: target plan not approved (status=%)', v_status;
  end if;

  -- (5) flag does not leak past the RPC
  begin
    update public.executive_interview_plans
       set content_json = '{"tampered": true}'::jsonb
     where id = 'dddddddd-0000-0000-0000-0000000000f2';
    raise exception 'INVARIANT-FAIL: approved plan editable after RPC in same transaction';
  exception when others then
    if sqlerrm like 'INVARIANT-FAIL%' then raise; end if;
  end;

  -- (6) allocate refuses an unlinked candidate
  begin
    perform public.allocate_and_insert_interview_plan(
      'cccccccc-0000-0000-0000-0000000000f1',
      'eeeeeeee-0000-0000-0000-0000000000f2',  -- unlinked
      'bbbbbbbb-0000-0000-0000-0000000000f1',
      null, '{}'::jsonb, true,
      'aaaaaaaa-0000-0000-0000-0000000000f1', 'v', 'm'
    );
    raise exception 'INVARIANT-FAIL: allocate accepted an unlinked candidate';
  exception when others then
    if sqlerrm like 'INVARIANT-FAIL%' then raise; end if;
  end;

  raise notice 'ALL INTERVIEW-PLAN INVARIANTS PASSED';
end
$checks$;

rollback;
