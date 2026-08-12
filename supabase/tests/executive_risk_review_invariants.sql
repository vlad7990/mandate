-- Executive Intelligence — risk review invariant tests.
--
-- Companion to executive_interview_plan_invariants.sql and
-- executive_assessment_invariants.sql, for the Phase 2d risk review table
-- (migration 039). Verifies the same hardening guarantees, plus the two things
-- specific to this table: the approved-assessment creation gate, and that
-- source_assessment_id is stamped by the RPC rather than supplied.
--
-- Runs inside a transaction that is ROLLED BACK. Execute as a privileged role;
-- the RPC/RLS checks switch to `authenticated`.
--
-- Each expected-failure case asserts the SPECIFIC error it should raise, not
-- merely that something failed — a catch-all would pass on a typo or a missing
-- grant and report a guarantee that was never tested.
--
-- Invariants:
--   1. Approved risk reviews reject direct UPDATE (immutability trigger).
--   2. Drafts cannot be promoted to approved by direct UPDATE (RPC-only).
--   3. Risk reviews cannot be INSERTed pre-approved.
--   4. approve_risk_review approves the target + archives the previous approved
--      version → exactly one approved per (search, candidate).
--   5. approved_by is auth.uid(), not anything the caller passed.
--   6. The risk-review transition flag does not leak past the RPC.
--   7. allocate_and_insert_risk_review refuses an UNLINKED candidate.
--   8. allocate refuses a LINKED candidate with no APPROVED assessment.
--   9. allocate succeeds once an assessment is approved, and stamps
--      source_assessment_id from that assessment.
--  10. RLS scopes risk reviews to the owning organization.
--
-- On success: NOTICE 'ALL RISK-REVIEW INVARIANTS PASSED'.

begin;

insert into auth.users (id, email)
values
  ('aaaaaaaa-0000-0000-0000-0000000000b1', 'risk-invariants@test.local'),
  ('aaaaaaaa-0000-0000-0000-0000000000b2', 'risk-invariants-other@test.local');

insert into public.organizations (id, name, slug)
values
  ('bbbbbbbb-0000-0000-0000-0000000000b1', 'Risk Test Org', 'risk-test-org'),
  ('bbbbbbbb-0000-0000-0000-0000000000b2', 'Risk Other Org', 'risk-other-org');

insert into public.users (id, organization_id, email, status, role)
values
  ('aaaaaaaa-0000-0000-0000-0000000000b1', 'bbbbbbbb-0000-0000-0000-0000000000b1',
   'risk-invariants@test.local', 'active', 'admin'),
  ('aaaaaaaa-0000-0000-0000-0000000000b2', 'bbbbbbbb-0000-0000-0000-0000000000b2',
   'risk-invariants-other@test.local', 'active', 'admin')
on conflict (id) do update
  set organization_id = excluded.organization_id, status = excluded.status, role = excluded.role;

insert into public.executive_searches (id, organization_id, created_by, company_name, role_title)
values ('cccccccc-0000-0000-0000-0000000000b1', 'bbbbbbbb-0000-0000-0000-0000000000b1',
        'aaaaaaaa-0000-0000-0000-0000000000b1', 'RiskCo', 'CTO');

-- Three candidates: one fully chained (approved assessment), one linked but
-- with no approved assessment, one never linked at all.
insert into public.candidates (id, organization_id, full_name, cv_processing)
values
  ('eeeeeeee-0000-0000-0000-0000000000b1', 'bbbbbbbb-0000-0000-0000-0000000000b1', 'Chained Cand', false),
  ('eeeeeeee-0000-0000-0000-0000000000b2', 'bbbbbbbb-0000-0000-0000-0000000000b1', 'No-Assessment Cand', false),
  ('eeeeeeee-0000-0000-0000-0000000000b3', 'bbbbbbbb-0000-0000-0000-0000000000b1', 'Unlinked Cand', false);

insert into public.executive_search_candidates (search_id, organization_id, candidate_id, added_by)
values
  ('cccccccc-0000-0000-0000-0000000000b1', 'bbbbbbbb-0000-0000-0000-0000000000b1',
   'eeeeeeee-0000-0000-0000-0000000000b1', 'aaaaaaaa-0000-0000-0000-0000000000b1'),
  ('cccccccc-0000-0000-0000-0000000000b1', 'bbbbbbbb-0000-0000-0000-0000000000b1',
   'eeeeeeee-0000-0000-0000-0000000000b2', 'aaaaaaaa-0000-0000-0000-0000000000b1');

-- A draft assessment for each linked candidate; only the first gets approved.
insert into public.executive_assessments (id, search_id, candidate_id, organization_id, version, created_by)
values
  ('ffffffff-0000-0000-0000-0000000000b1', 'cccccccc-0000-0000-0000-0000000000b1',
   'eeeeeeee-0000-0000-0000-0000000000b1', 'bbbbbbbb-0000-0000-0000-0000000000b1', 1,
   'aaaaaaaa-0000-0000-0000-0000000000b1'),
  ('ffffffff-0000-0000-0000-0000000000b2', 'cccccccc-0000-0000-0000-0000000000b1',
   'eeeeeeee-0000-0000-0000-0000000000b2', 'bbbbbbbb-0000-0000-0000-0000000000b1', 1,
   'aaaaaaaa-0000-0000-0000-0000000000b1');

select set_config('mandate.allow_assessment_transition', 'on', true);
update public.executive_assessments
   set status = 'approved', approved_by = 'aaaaaaaa-0000-0000-0000-0000000000b1', approved_at = now()
 where id = 'ffffffff-0000-0000-0000-0000000000b1';
select set_config('mandate.allow_assessment_transition', '', true);

-- Two risk review versions for the fully-chained candidate.
insert into public.executive_risk_reviews (id, search_id, candidate_id, organization_id, version, created_by)
values
  ('dddddddd-0000-0000-0000-0000000000b1', 'cccccccc-0000-0000-0000-0000000000b1',
   'eeeeeeee-0000-0000-0000-0000000000b1', 'bbbbbbbb-0000-0000-0000-0000000000b1', 1,
   'aaaaaaaa-0000-0000-0000-0000000000b1'),
  ('dddddddd-0000-0000-0000-0000000000b2', 'cccccccc-0000-0000-0000-0000000000b1',
   'eeeeeeee-0000-0000-0000-0000000000b1', 'bbbbbbbb-0000-0000-0000-0000000000b1', 2,
   'aaaaaaaa-0000-0000-0000-0000000000b1');

-- Seed v1 as approved through the sanctioned flag.
select set_config('mandate.allow_risk_review_transition', 'on', true);
update public.executive_risk_reviews
   set status = 'approved', approved_by = 'aaaaaaaa-0000-0000-0000-0000000000b1', approved_at = now()
 where id = 'dddddddd-0000-0000-0000-0000000000b1';
select set_config('mandate.allow_risk_review_transition', '', true);

do $checks$
declare
  v_count      int;
  v_status     text;
  v_approver   uuid;
  v_new_id     uuid;
  v_source_id  uuid;
begin
  -- (1) approved rows immutable to direct UPDATE
  begin
    update public.executive_risk_reviews
       set content_json = '{"tampered": true}'::jsonb
     where id = 'dddddddd-0000-0000-0000-0000000000b1';
    raise exception 'INVARIANT-FAIL: approved risk review accepted a direct edit';
  exception when others then
    if sqlerrm like 'INVARIANT-FAIL%' then raise; end if;
    if sqlerrm not like '%is approved and immutable%' then
      raise exception 'INVARIANT-FAIL: approved-edit blocked by the wrong error: %', sqlerrm;
    end if;
  end;

  -- (2) drafts cannot be promoted by direct UPDATE
  begin
    update public.executive_risk_reviews
       set status = 'approved'
     where id = 'dddddddd-0000-0000-0000-0000000000b2';
    raise exception 'INVARIANT-FAIL: draft risk review was approved by direct update';
  exception when others then
    if sqlerrm like 'INVARIANT-FAIL%' then raise; end if;
    if sqlerrm not like '%Use approve_risk_review()%' then
      raise exception 'INVARIANT-FAIL: direct promotion blocked by the wrong error: %', sqlerrm;
    end if;
  end;

  -- (3) pre-approved insert rejected
  begin
    insert into public.executive_risk_reviews (search_id, candidate_id, organization_id, version, status)
    values ('cccccccc-0000-0000-0000-0000000000b1', 'eeeeeeee-0000-0000-0000-0000000000b1',
            'bbbbbbbb-0000-0000-0000-0000000000b1', 99, 'approved');
    raise exception 'INVARIANT-FAIL: pre-approved risk review insert was accepted';
  exception when others then
    if sqlerrm like 'INVARIANT-FAIL%' then raise; end if;
    if sqlerrm not like '%created as drafts%' then
      raise exception 'INVARIANT-FAIL: pre-approved insert blocked by the wrong error: %', sqlerrm;
    end if;
  end;

  -- Switch to authenticated for RPC + RLS checks.
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', 'aaaaaaaa-0000-0000-0000-0000000000b1', 'role', 'authenticated')::text,
    true
  );
  execute 'set local role authenticated';

  -- (4) approve RPC approves v2 and archives v1
  perform public.approve_risk_review(
    'dddddddd-0000-0000-0000-0000000000b2',
    'cccccccc-0000-0000-0000-0000000000b1',
    'eeeeeeee-0000-0000-0000-0000000000b1'
  );

  select count(*) into v_count from public.executive_risk_reviews
   where search_id = 'cccccccc-0000-0000-0000-0000000000b1'
     and candidate_id = 'eeeeeeee-0000-0000-0000-0000000000b1'
     and status = 'approved';
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL: expected exactly 1 approved risk review, found %', v_count;
  end if;

  select status into v_status from public.executive_risk_reviews
   where id = 'dddddddd-0000-0000-0000-0000000000b1';
  if v_status <> 'archived' then
    raise exception 'INVARIANT-FAIL: previous approved risk review not archived (status=%)', v_status;
  end if;

  select status, approved_by into v_status, v_approver from public.executive_risk_reviews
   where id = 'dddddddd-0000-0000-0000-0000000000b2';
  if v_status <> 'approved' then
    raise exception 'INVARIANT-FAIL: target risk review not approved (status=%)', v_status;
  end if;

  -- (5) approver is the authenticated actor
  if v_approver <> 'aaaaaaaa-0000-0000-0000-0000000000b1'::uuid then
    raise exception 'INVARIANT-FAIL: approved_by is % , not auth.uid()', v_approver;
  end if;

  -- (6) flag does not leak past the RPC
  begin
    update public.executive_risk_reviews
       set content_json = '{"tampered": true}'::jsonb
     where id = 'dddddddd-0000-0000-0000-0000000000b2';
    raise exception 'INVARIANT-FAIL: approved risk review editable after RPC in same transaction';
  exception when others then
    if sqlerrm like 'INVARIANT-FAIL%' then raise; end if;
    if sqlerrm not like '%is approved and immutable%' then
      raise exception 'INVARIANT-FAIL: post-RPC edit blocked by the wrong error: %', sqlerrm;
    end if;
  end;

  -- (7) allocate refuses an unlinked candidate
  begin
    perform public.allocate_and_insert_risk_review(
      'cccccccc-0000-0000-0000-0000000000b1',
      'eeeeeeee-0000-0000-0000-0000000000b3',  -- never linked
      'bbbbbbbb-0000-0000-0000-0000000000b1',
      null, null, '{}'::jsonb, true,
      'aaaaaaaa-0000-0000-0000-0000000000b1', 'v', 'm'
    );
    raise exception 'INVARIANT-FAIL: allocate accepted an unlinked candidate';
  exception when others then
    if sqlerrm like 'INVARIANT-FAIL%' then raise; end if;
    if sqlerrm not like '%is not linked to search%' then
      raise exception 'INVARIANT-FAIL: unlinked candidate refused for the wrong reason: %', sqlerrm;
    end if;
  end;

  -- (8) allocate refuses a linked candidate whose assessment is not approved
  begin
    perform public.allocate_and_insert_risk_review(
      'cccccccc-0000-0000-0000-0000000000b1',
      'eeeeeeee-0000-0000-0000-0000000000b2',  -- linked, draft assessment only
      'bbbbbbbb-0000-0000-0000-0000000000b1',
      null, null, '{}'::jsonb, true,
      'aaaaaaaa-0000-0000-0000-0000000000b1', 'v', 'm'
    );
    raise exception 'INVARIANT-FAIL: allocate accepted a candidate with no approved assessment';
  exception when others then
    if sqlerrm like 'INVARIANT-FAIL%' then raise; end if;
    -- Specifically the assessment gate, not the linkage check that precedes it.
    if sqlerrm not like '%no approved assessment%' then
      raise exception 'INVARIANT-FAIL: assessment gate refused for the wrong reason: %', sqlerrm;
    end if;
  end;

  -- (9) allocate succeeds for the chained candidate and stamps the approved
  --     assessment as provenance (the caller never supplies it)
  select id into v_new_id from public.allocate_and_insert_risk_review(
    'cccccccc-0000-0000-0000-0000000000b1',
    'eeeeeeee-0000-0000-0000-0000000000b1',
    'bbbbbbbb-0000-0000-0000-0000000000b1',
    null, null, '{}'::jsonb, true,
    'aaaaaaaa-0000-0000-0000-0000000000b1', 'v', 'm'
  );

  select source_assessment_id into v_source_id from public.executive_risk_reviews
   where id = v_new_id;
  if v_source_id <> 'ffffffff-0000-0000-0000-0000000000b1'::uuid then
    raise exception 'INVARIANT-FAIL: source_assessment_id is %, not the approved assessment', v_source_id;
  end if;

  -- (10) RLS scopes to the owning organization
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', 'aaaaaaaa-0000-0000-0000-0000000000b2', 'role', 'authenticated')::text,
    true
  );

  select count(*) into v_count from public.executive_risk_reviews
   where search_id = 'cccccccc-0000-0000-0000-0000000000b1';
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL: another org can read % risk reviews', v_count;
  end if;

  raise notice 'ALL RISK-REVIEW INVARIANTS PASSED';
end
$checks$;

rollback;
