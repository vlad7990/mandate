-- The Interviewer Agent — mainstream interview-plan invariants (116,
-- programme gate §125 slice one).
--
-- 037's hardening re-proven against public.interview_plans, plus the
-- agent pins for the twenty-fifth principal. Runs inside a transaction
-- that is ROLLED BACK. Execute as a privileged role; RPC/RLS checks
-- switch to `authenticated` with forged JWTs (re-enter
-- `set local role authenticated` after any owner-side check).
--
-- Invariants:
--   1. Approved plans reject direct UPDATE (immutability trigger).
--   2. Drafts cannot be promoted to approved by direct UPDATE (RPC-only).
--   3. Plans cannot be INSERTed pre-approved.
--   4. approve_project_interview_plan approves the target + archives the
--      previously approved version → exactly one approved per
--      (project, candidate).
--   5. The transition flag does not leak past the RPC.
--   6. allocate_and_insert_project_interview_plan refuses a candidate of
--      a DIFFERENT project (the mainstream linkage is project_id itself).
--   7. Agent pins: (a) the Interviewer edits a draft's content;
--      (b) an approved plan is out of its reach — zero rows, silently,
--      which is exactly why the pipeline count-checks (§129);
--      (c) it cannot flip status draft→approved;
--      (d) suspended, it reads ZERO plan rows (the kill switch).
--   8. record_agent_event('interview_plan_generated') lands under the
--      Interviewer's forged JWT, org derived from the subject project;
--      detail.agent_kind='interviewer' distinguishes it from EI's.
--   9. The human intent door: a VIEWER forging
--      interview_plan_generation_requested is refused
--      (insufficient_privilege — mandate-writer act); the recruiter's
--      landing proves the type exists.
--
-- On success: NOTICE 'ALL AGENT-INTERVIEWER INVARIANTS PASSED'.

begin;

-- Two orgs: the customer org and the platform's own (the Interviewer is
-- anchored THERE — §129's platform-agents doctrine — so its reach into
-- the customer org's plans flows through is_agent() alone, exactly as
-- in production. Anchoring it in the customer org would let the org
-- policy admit rows the agent pair was built to filter).
insert into public.organizations (id, name, slug) values
  ('11610000-0000-4000-8000-0000000000a0', 'IV Org A', 'iv-org-a'),
  ('11610000-0000-4000-8000-0000000000b0', 'IV HQ', 'iv-hq');

insert into auth.users (id, email) values
  ('11610000-0000-4000-8000-0000000000a1', 'iv-admin@test.local'),
  ('11610000-0000-4000-8000-0000000000a2', 'iv-recruiter@test.local'),
  ('11610000-0000-4000-8000-0000000000a3', 'iv-viewer@test.local'),
  ('11610000-0000-4000-8000-0000000000aa', 'iv-interviewer@test.local');

update public.users set organization_id = '11610000-0000-4000-8000-0000000000a0',
       status = 'active', role = 'admin', full_name = 'IV Admin'
 where id = '11610000-0000-4000-8000-0000000000a1';
update public.users set organization_id = '11610000-0000-4000-8000-0000000000a0',
       status = 'active', role = 'recruiter', full_name = 'IV Recruiter'
 where id = '11610000-0000-4000-8000-0000000000a2';
update public.users set organization_id = '11610000-0000-4000-8000-0000000000a0',
       status = 'active', role = 'viewer', full_name = 'IV Viewer'
 where id = '11610000-0000-4000-8000-0000000000a3';
update public.users set organization_id = '11610000-0000-4000-8000-0000000000b0',
       status = 'active', role = 'agent', full_name = 'Interviewer Agent'
 where id = '11610000-0000-4000-8000-0000000000aa';

insert into public.projects (id, organization_id, created_by, title, company_name, one_line_input) values
  ('11610000-0000-4000-8000-00000000aa01', '11610000-0000-4000-8000-0000000000a0',
   '11610000-0000-4000-8000-0000000000a2',
   'CFO Search', 'Ledgerline Group', 'CFO for Ledgerline Group (harness)'),
  ('11610000-0000-4000-8000-00000000aa02', '11610000-0000-4000-8000-0000000000a0',
   '11610000-0000-4000-8000-0000000000a2',
   'COO Search', 'Ledgerline Group', 'COO for Ledgerline Group (harness)');

-- Candidate A belongs to the CFO search; candidate B to the COO search —
-- B is invariant 6's cross-project refusal fixture.
insert into public.candidates (id, organization_id, project_id, full_name, cv_processing) values
  ('11610000-0000-4000-8000-00000000cc01', '11610000-0000-4000-8000-0000000000a0',
   '11610000-0000-4000-8000-00000000aa01', 'IV Cand A', false),
  ('11610000-0000-4000-8000-00000000cc02', '11610000-0000-4000-8000-0000000000a0',
   '11610000-0000-4000-8000-00000000aa02', 'IV Cand B', false);

-- Two plan versions for candidate A.
insert into public.interview_plans (id, project_id, candidate_id, organization_id, version, created_by) values
  ('11610000-0000-4000-8000-00000000dd01', '11610000-0000-4000-8000-00000000aa01',
   '11610000-0000-4000-8000-00000000cc01', '11610000-0000-4000-8000-0000000000a0', 1,
   '11610000-0000-4000-8000-0000000000a2'),
  ('11610000-0000-4000-8000-00000000dd02', '11610000-0000-4000-8000-00000000aa01',
   '11610000-0000-4000-8000-00000000cc01', '11610000-0000-4000-8000-0000000000a0', 2,
   '11610000-0000-4000-8000-0000000000a2');

-- Seed v1 as approved through the sanctioned flag.
select set_config('mandate.allow_project_plan_transition', 'on', true);
update public.interview_plans
   set status = 'approved', approved_by = '11610000-0000-4000-8000-0000000000a2', approved_at = now()
 where id = '11610000-0000-4000-8000-00000000dd01';
select set_config('mandate.allow_project_plan_transition', '', true);

do $checks$
declare
  v_count  int;
  v_rows   int;
  v_status text;
begin
  -- (1) approved rows immutable to direct UPDATE (owner side — the
  -- trigger fires for every role).
  begin
    update public.interview_plans
       set content_json = '{"tampered": true}'::jsonb
     where id = '11610000-0000-4000-8000-00000000dd01';
    raise exception 'INVARIANT-FAIL (1): approved plan accepted a direct edit';
  exception when others then
    if sqlerrm like 'INVARIANT-FAIL%' then raise; end if;
  end;

  -- (2) drafts cannot be promoted by direct UPDATE
  begin
    update public.interview_plans
       set status = 'approved'
     where id = '11610000-0000-4000-8000-00000000dd02';
    raise exception 'INVARIANT-FAIL (2): draft plan was approved by direct update';
  exception when others then
    if sqlerrm like 'INVARIANT-FAIL%' then raise; end if;
  end;

  -- (3) pre-approved insert rejected
  begin
    insert into public.interview_plans (project_id, candidate_id, organization_id, version, status)
    values ('11610000-0000-4000-8000-00000000aa01', '11610000-0000-4000-8000-00000000cc01',
            '11610000-0000-4000-8000-0000000000a0', 99, 'approved');
    raise exception 'INVARIANT-FAIL (3): pre-approved plan insert was accepted';
  exception when others then
    if sqlerrm like 'INVARIANT-FAIL%' then raise; end if;
  end;

  -- Switch to authenticated as the RECRUITER.
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', '11610000-0000-4000-8000-0000000000a2', 'role', 'authenticated')::text,
    true
  );
  execute 'set local role authenticated';

  -- (4) approve RPC approves v2 and archives v1
  perform public.approve_project_interview_plan(
    '11610000-0000-4000-8000-00000000dd02',
    '11610000-0000-4000-8000-00000000aa01',
    '11610000-0000-4000-8000-00000000cc01'
  );

  select count(*) into v_count from public.interview_plans
   where project_id = '11610000-0000-4000-8000-00000000aa01'
     and candidate_id = '11610000-0000-4000-8000-00000000cc01'
     and status = 'approved';
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL (4): expected exactly 1 approved plan, found %', v_count;
  end if;

  select status into v_status from public.interview_plans
   where id = '11610000-0000-4000-8000-00000000dd01';
  if v_status <> 'archived' then
    raise exception 'INVARIANT-FAIL (4): previous approved plan not archived (status=%)', v_status;
  end if;

  -- (5) flag does not leak past the RPC
  begin
    update public.interview_plans
       set content_json = '{"tampered": true}'::jsonb
     where id = '11610000-0000-4000-8000-00000000dd02';
    raise exception 'INVARIANT-FAIL (5): approved plan editable after RPC in same transaction';
  exception when others then
    if sqlerrm like 'INVARIANT-FAIL%' then raise; end if;
  end;

  -- (6) allocate refuses a candidate of a different project
  begin
    perform public.allocate_and_insert_project_interview_plan(
      '11610000-0000-4000-8000-00000000aa01',
      '11610000-0000-4000-8000-00000000cc02',  -- belongs to the COO search
      '11610000-0000-4000-8000-0000000000a0',
      null, '{}'::jsonb, true,
      '11610000-0000-4000-8000-0000000000a2', 'v', 'm'
    );
    raise exception 'INVARIANT-FAIL (6): allocate accepted a cross-project candidate';
  exception when others then
    if sqlerrm like 'INVARIANT-FAIL%' then raise; end if;
  end;

  -- Mint a fresh draft (v3) for the agent pins.
  perform public.allocate_and_insert_project_interview_plan(
    '11610000-0000-4000-8000-00000000aa01',
    '11610000-0000-4000-8000-00000000cc01',
    '11610000-0000-4000-8000-0000000000a0',
    null, '{}'::jsonb, true,
    '11610000-0000-4000-8000-0000000000a2', 'v', 'm'
  );

  -- Forge the INTERVIEWER.
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', '11610000-0000-4000-8000-0000000000aa', 'role', 'authenticated')::text,
    true
  );

  -- (7a) the agent edits the generating draft's content
  update public.interview_plans
     set content_json = '{"overview": "agent draft"}'::jsonb,
         is_generating = false
   where project_id = '11610000-0000-4000-8000-00000000aa01'
     and candidate_id = '11610000-0000-4000-8000-00000000cc01'
     and is_generating = true;
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    raise exception 'INVARIANT-FAIL (7a): the agent updated % draft rows, expected 1', v_rows;
  end if;

  -- (7b) an approved plan is out of the agent's reach — ZERO rows,
  -- silently. This silence is why the pipeline carries {count:"exact"}.
  update public.interview_plans
     set content_json = '{"tampered": "by-agent"}'::jsonb
   where id = '11610000-0000-4000-8000-00000000dd02';
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then
    raise exception 'INVARIANT-FAIL (7b): the agent reached an approved plan (% rows)', v_rows;
  end if;

  -- (7c) the agent cannot flip a draft to approved
  begin
    update public.interview_plans
       set status = 'approved'
     where project_id = '11610000-0000-4000-8000-00000000aa01'
       and candidate_id = '11610000-0000-4000-8000-00000000cc01'
       and status = 'draft';
    get diagnostics v_rows = row_count;
    if v_rows <> 0 then
      raise exception 'INVARIANT-FAIL (7c): the agent flipped % draft rows to approved', v_rows;
    end if;
  exception when others then
    if sqlerrm like 'INVARIANT-FAIL%' then raise; end if;
    -- The guard raising is equally a pass: promotion refused.
  end;

  -- (8) the agent's trail event lands, org derived from the subject
  perform public.record_agent_event(
    'interview_plan_generated',
    '11610000-0000-4000-8000-00000000aa01',
    '11610000-0000-4000-8000-00000000cc01',
    '{"agent_kind": "interviewer", "probe": "iv-harness"}'::jsonb
  );

  -- The count reads as OWNER: the trail row is ORG-visible, not
  -- agent-visible — counting under the agent's own claims reads 0 for
  -- a write that landed (first run of this harness proved it).
  perform set_config('request.jwt.claims', '', true);
  execute 'reset role';
  select count(*) into v_count from public.activity_events
   where event_type = 'interview_plan_generated'
     and detail->>'probe' = 'iv-harness'
     and organization_id = '11610000-0000-4000-8000-0000000000a0';
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL (8): the Interviewer''s trail event did not land (%)', v_count;
  end if;

  -- (7d) the kill switch: suspend the Interviewer, then it reads NOTHING.
  update public.users set status = 'suspended'
   where id = '11610000-0000-4000-8000-0000000000aa';
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', '11610000-0000-4000-8000-0000000000aa', 'role', 'authenticated')::text,
    true
  );
  execute 'set local role authenticated';
  select count(*) into v_count from public.interview_plans;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (7d): a suspended Interviewer reads % plan rows', v_count;
  end if;

  -- (9) the intent door: a VIEWER is refused the request event…
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', '11610000-0000-4000-8000-0000000000a3', 'role', 'authenticated')::text,
    true
  );
  begin
    perform public.record_activity_event(
      'interview_plan_generation_requested',
      '11610000-0000-4000-8000-00000000aa01',
      '11610000-0000-4000-8000-00000000cc01',
      null,
      '{"probe": "iv-viewer"}'::jsonb
    );
    raise exception 'INVARIANT-FAIL (9): a viewer recorded a mandate-writer act';
  exception when others then
    if sqlerrm like 'INVARIANT-FAIL%' then raise; end if;
  end;

  -- …and the recruiter's lands.
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', '11610000-0000-4000-8000-0000000000a2', 'role', 'authenticated')::text,
    true
  );
  perform public.record_activity_event(
    'interview_plan_generation_requested',
    '11610000-0000-4000-8000-00000000aa01',
    '11610000-0000-4000-8000-00000000cc01',
    null,
    '{"probe": "iv-recruiter"}'::jsonb
  );
  select count(*) into v_count from public.activity_events
   where event_type = 'interview_plan_generation_requested'
     and detail->>'probe' = 'iv-recruiter';
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL (9): the recruiter''s request event did not land (%)', v_count;
  end if;

  raise notice 'ALL AGENT-INTERVIEWER INVARIANTS PASSED';
end
$checks$;

rollback;
