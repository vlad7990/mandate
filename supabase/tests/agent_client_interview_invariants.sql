-- The Interviewer Agent — client-interview invariants (117, the
-- client-interview slice gate).
--
-- 116's hardening re-proven against public.client_interviews — keyed by
-- the MANDATE alone, project-row lock, dedicated transition flag — plus
-- the slice's own doors: the widened feedback CHECK and the sessionless
-- answered event. Runs inside a transaction that is ROLLED BACK.
-- Execute as a privileged role; RPC/RLS checks switch to
-- `authenticated` with forged JWTs (re-enter `set local role
-- authenticated` after any owner-side check).
--
-- Invariants:
--   1. Approved sets reject direct UPDATE (immutability trigger).
--   2. Drafts cannot be promoted to approved by direct UPDATE (RPC-only).
--   3. Sets cannot be INSERTed pre-approved.
--   4. approve_client_interview approves the target + archives the
--      previously approved version → exactly one approved per project.
--   5. The transition flag does not leak past the RPC.
--   6. allocate_and_insert_client_interview refuses a project the
--      caller's org does not hold (the org equality is in the lock).
--   7. Agent pins: (a) the Interviewer edits a generating draft;
--      (b) an approved set is out of its reach — zero rows, silently,
--      which is exactly why the pipeline count-checks (§129);
--      (c) it cannot flip status draft→approved;
--      (d) suspended, it reads ZERO set rows (the kill switch).
--   8. record_agent_event('interview_plan_generated') with
--      detail.plan_scope='client_interview' lands under the forged
--      Interviewer, org derived from the subject project.
--   9. The human intent door: a VIEWER forging
--      client_interview_generation_requested is refused
--      (insufficient_privilege — mandate-writer act); the recruiter's
--      landing proves the type exists.
--  10. The answer entry point: (a) EXECUTE on
--      record_client_interview_answered is REFUSED to authenticated —
--      the anon roster stays TWELVE and the only caller is the
--      service-role route; (b) called with the owner's privilege: a
--      live token against the APPROVED set writes the event with the
--      issuance label; a DRAFT set returns false; a REVOKED token
--      returns false — neither writes.
--  11. The feedback vocabulary: a mandate-level 'client_interview' row
--      (candidate_id NULL) is accepted; an unknown type is refused.
--
-- On success: NOTICE 'ALL CLIENT-INTERVIEW INVARIANTS PASSED'.

begin;

-- Two orgs: the customer org and the platform's own (the Interviewer is
-- anchored THERE — §129's platform-agents doctrine — so its reach into
-- the customer org's sets flows through is_agent() alone, exactly as in
-- production).
insert into public.organizations (id, name, slug) values
  ('11710000-0000-4000-8000-0000000000a0', 'CI Org A', 'ci-org-a'),
  ('11710000-0000-4000-8000-0000000000b0', 'CI HQ', 'ci-hq');

insert into auth.users (id, email) values
  ('11710000-0000-4000-8000-0000000000a1', 'ci-admin@test.local'),
  ('11710000-0000-4000-8000-0000000000a2', 'ci-recruiter@test.local'),
  ('11710000-0000-4000-8000-0000000000a3', 'ci-viewer@test.local'),
  ('11710000-0000-4000-8000-0000000000aa', 'ci-interviewer@test.local');

update public.users set organization_id = '11710000-0000-4000-8000-0000000000a0',
       status = 'active', role = 'admin', full_name = 'CI Admin'
 where id = '11710000-0000-4000-8000-0000000000a1';
update public.users set organization_id = '11710000-0000-4000-8000-0000000000a0',
       status = 'active', role = 'recruiter', full_name = 'CI Recruiter'
 where id = '11710000-0000-4000-8000-0000000000a2';
update public.users set organization_id = '11710000-0000-4000-8000-0000000000a0',
       status = 'active', role = 'viewer', full_name = 'CI Viewer'
 where id = '11710000-0000-4000-8000-0000000000a3';
update public.users set organization_id = '11710000-0000-4000-8000-0000000000b0',
       status = 'active', role = 'agent', full_name = 'Interviewer Agent'
 where id = '11710000-0000-4000-8000-0000000000aa';

insert into public.projects (id, organization_id, created_by, title, company_name, one_line_input) values
  ('11710000-0000-4000-8000-00000000aa01', '11710000-0000-4000-8000-0000000000a0',
   '11710000-0000-4000-8000-0000000000a2',
   'CFO Search', 'Ledgerline Group', 'CFO for Ledgerline Group (harness)');

-- Two set versions for the mandate.
insert into public.client_interviews (id, project_id, organization_id, version, created_by, content_json) values
  ('11710000-0000-4000-8000-00000000dd01', '11710000-0000-4000-8000-00000000aa01',
   '11710000-0000-4000-8000-0000000000a0', 1,
   '11710000-0000-4000-8000-0000000000a2', '{}'::jsonb),
  ('11710000-0000-4000-8000-00000000dd02', '11710000-0000-4000-8000-00000000aa01',
   '11710000-0000-4000-8000-0000000000a0', 2,
   '11710000-0000-4000-8000-0000000000a2',
   '{"intro": "h", "questions": [{"id": "q01", "question": "Range?", "why_it_matters": "", "gap_id": "missing_info:1", "gap_label": "Compensation"}], "gap_coverage": []}'::jsonb);

-- Seed v1 as approved through the sanctioned flag.
select set_config('mandate.allow_client_interview_transition', 'on', true);
update public.client_interviews
   set status = 'approved', approved_by = '11710000-0000-4000-8000-0000000000a2', approved_at = now()
 where id = '11710000-0000-4000-8000-00000000dd01';
select set_config('mandate.allow_client_interview_transition', '', true);

-- Two share tokens: one live, one revoked (invariant 10's fixtures).
insert into public.hiring_manager_tokens (id, project_id, organization_id, token, label, expires_at, revoked_at) values
  ('11710000-0000-4000-8000-00000000ee01', '11710000-0000-4000-8000-00000000aa01',
   '11710000-0000-4000-8000-0000000000a0', '11710000-0000-4000-8000-00000000f001',
   'CI Probe HM @ Ledgerline', now() + interval '7 days', null),
  ('11710000-0000-4000-8000-00000000ee02', '11710000-0000-4000-8000-00000000aa01',
   '11710000-0000-4000-8000-0000000000a0', '11710000-0000-4000-8000-00000000f002',
   'CI Revoked HM', now() + interval '7 days', now());

do $checks$
declare
  v_count  int;
  v_rows   int;
  v_status text;
  v_ok     boolean;
begin
  -- (1) approved rows immutable to direct UPDATE (owner side — the
  -- trigger fires for every role).
  begin
    update public.client_interviews
       set content_json = '{"tampered": true}'::jsonb
     where id = '11710000-0000-4000-8000-00000000dd01';
    raise exception 'INVARIANT-FAIL (1): approved set accepted a direct edit';
  exception when others then
    if sqlerrm like 'INVARIANT-FAIL%' then raise; end if;
  end;

  -- (2) drafts cannot be promoted by direct UPDATE
  begin
    update public.client_interviews
       set status = 'approved'
     where id = '11710000-0000-4000-8000-00000000dd02';
    raise exception 'INVARIANT-FAIL (2): draft set was approved by direct update';
  exception when others then
    if sqlerrm like 'INVARIANT-FAIL%' then raise; end if;
  end;

  -- (3) pre-approved insert rejected
  begin
    insert into public.client_interviews (project_id, organization_id, version, status)
    values ('11710000-0000-4000-8000-00000000aa01',
            '11710000-0000-4000-8000-0000000000a0', 99, 'approved');
    raise exception 'INVARIANT-FAIL (3): pre-approved set insert was accepted';
  exception when others then
    if sqlerrm like 'INVARIANT-FAIL%' then raise; end if;
  end;

  -- (11) the feedback vocabulary — owner side, both faces.
  insert into public.feedback (project_id, organization_id, candidate_id, feedback_type, content, interpreted, triggered_recalibration)
  values ('11710000-0000-4000-8000-00000000aa01',
          '11710000-0000-4000-8000-0000000000a0', null, 'client_interview',
          'CLIENT INTERVIEW — harness probe', '{}'::jsonb, false);
  begin
    insert into public.feedback (project_id, organization_id, candidate_id, feedback_type, content)
    values ('11710000-0000-4000-8000-00000000aa01',
            '11710000-0000-4000-8000-0000000000a0', null, 'not_a_real_type', 'x');
    raise exception 'INVARIANT-FAIL (11): an unknown feedback_type was accepted';
  exception when others then
    if sqlerrm like 'INVARIANT-FAIL%' then raise; end if;
  end;

  -- Switch to authenticated as the RECRUITER.
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', '11710000-0000-4000-8000-0000000000a2', 'role', 'authenticated')::text,
    true
  );
  execute 'set local role authenticated';

  -- (4) approve RPC approves v2 and archives v1
  perform public.approve_client_interview(
    '11710000-0000-4000-8000-00000000dd02',
    '11710000-0000-4000-8000-00000000aa01'
  );

  select count(*) into v_count from public.client_interviews
   where project_id = '11710000-0000-4000-8000-00000000aa01'
     and status = 'approved';
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL (4): expected exactly 1 approved set, found %', v_count;
  end if;

  select status into v_status from public.client_interviews
   where id = '11710000-0000-4000-8000-00000000dd01';
  if v_status <> 'archived' then
    raise exception 'INVARIANT-FAIL (4): previous approved set not archived (status=%)', v_status;
  end if;

  -- (5) flag does not leak past the RPC
  begin
    update public.client_interviews
       set content_json = '{"tampered": true}'::jsonb
     where id = '11710000-0000-4000-8000-00000000dd02';
    raise exception 'INVARIANT-FAIL (5): approved set editable after RPC in same transaction';
  exception when others then
    if sqlerrm like 'INVARIANT-FAIL%' then raise; end if;
  end;

  -- (6) allocate refuses a project the caller's org does not hold — the
  -- org equality is in the lock's WHERE, so a wrong org finds no row.
  begin
    perform public.allocate_and_insert_client_interview(
      '11710000-0000-4000-8000-00000000aa01',
      '11710000-0000-4000-8000-0000000000b0',  -- not the project's org
      '{}'::jsonb, true,
      '11710000-0000-4000-8000-0000000000a2', 'v', 'm'
    );
    raise exception 'INVARIANT-FAIL (6): allocate accepted a foreign-org project';
  exception when others then
    if sqlerrm like 'INVARIANT-FAIL%' then raise; end if;
  end;

  -- Mint a fresh draft (v3) for the agent pins.
  perform public.allocate_and_insert_client_interview(
    '11710000-0000-4000-8000-00000000aa01',
    '11710000-0000-4000-8000-0000000000a0',
    '{}'::jsonb, true,
    '11710000-0000-4000-8000-0000000000a2', 'v', 'm'
  );

  -- Forge the INTERVIEWER.
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', '11710000-0000-4000-8000-0000000000aa', 'role', 'authenticated')::text,
    true
  );

  -- (7a) the agent edits the generating draft's content
  update public.client_interviews
     set content_json = '{"intro": "agent draft"}'::jsonb,
         is_generating = false
   where project_id = '11710000-0000-4000-8000-00000000aa01'
     and is_generating = true;
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    raise exception 'INVARIANT-FAIL (7a): the agent updated % draft rows, expected 1', v_rows;
  end if;

  -- (7b) an approved set is out of the agent's reach — ZERO rows,
  -- silently. This silence is why the pipeline carries {count:"exact"}.
  update public.client_interviews
     set content_json = '{"tampered": "by-agent"}'::jsonb
   where id = '11710000-0000-4000-8000-00000000dd02';
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then
    raise exception 'INVARIANT-FAIL (7b): the agent reached an approved set (% rows)', v_rows;
  end if;

  -- (7c) the agent cannot flip a draft to approved
  begin
    update public.client_interviews
       set status = 'approved'
     where project_id = '11710000-0000-4000-8000-00000000aa01'
       and status = 'draft';
    get diagnostics v_rows = row_count;
    if v_rows <> 0 then
      raise exception 'INVARIANT-FAIL (7c): the agent flipped % draft rows to approved', v_rows;
    end if;
  exception when others then
    if sqlerrm like 'INVARIANT-FAIL%' then raise; end if;
    -- The guard raising is equally a pass: promotion refused.
  end;

  -- (8) the agent's trail event lands with plan_scope, org from subject
  perform public.record_agent_event(
    'interview_plan_generated',
    '11710000-0000-4000-8000-00000000aa01',
    null,
    '{"agent_kind": "interviewer", "plan_scope": "client_interview", "probe": "ci-harness"}'::jsonb
  );

  -- The count reads as OWNER: the trail row is ORG-visible, not
  -- agent-visible (116's lesson, kept).
  perform set_config('request.jwt.claims', '', true);
  execute 'reset role';
  select count(*) into v_count from public.activity_events
   where event_type = 'interview_plan_generated'
     and detail->>'probe' = 'ci-harness'
     and detail->>'plan_scope' = 'client_interview'
     and organization_id = '11710000-0000-4000-8000-0000000000a0';
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL (8): the Interviewer''s client-set event did not land (%)', v_count;
  end if;

  -- (7d) the kill switch: suspend the Interviewer, then it reads NOTHING.
  update public.users set status = 'suspended'
   where id = '11710000-0000-4000-8000-0000000000aa';
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', '11710000-0000-4000-8000-0000000000aa', 'role', 'authenticated')::text,
    true
  );
  execute 'set local role authenticated';
  select count(*) into v_count from public.client_interviews;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (7d): a suspended Interviewer reads % set rows', v_count;
  end if;

  -- (10a) the answer entry point is out of authenticated's reach — the
  -- roster holds: no session role may speak the client's act.
  begin
    perform public.record_client_interview_answered(
      '11710000-0000-4000-8000-00000000f001',
      '11710000-0000-4000-8000-00000000dd02',
      1
    );
    raise exception 'INVARIANT-FAIL (10a): authenticated executed the answered entry point';
  exception when others then
    if sqlerrm like 'INVARIANT-FAIL%' then raise; end if;
  end;

  -- (9) the intent door: a VIEWER is refused the request event…
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', '11710000-0000-4000-8000-0000000000a3', 'role', 'authenticated')::text,
    true
  );
  begin
    perform public.record_activity_event(
      'client_interview_generation_requested',
      '11710000-0000-4000-8000-00000000aa01',
      null,
      null,
      '{"probe": "ci-viewer"}'::jsonb
    );
    raise exception 'INVARIANT-FAIL (9): a viewer recorded a mandate-writer act';
  exception when others then
    if sqlerrm like 'INVARIANT-FAIL%' then raise; end if;
  end;

  -- …and the recruiter's lands.
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', '11710000-0000-4000-8000-0000000000a2', 'role', 'authenticated')::text,
    true
  );
  perform public.record_activity_event(
    'client_interview_generation_requested',
    '11710000-0000-4000-8000-00000000aa01',
    null,
    null,
    '{"probe": "ci-recruiter"}'::jsonb
  );
  select count(*) into v_count from public.activity_events
   where event_type = 'client_interview_generation_requested'
     and detail->>'probe' = 'ci-recruiter';
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL (9): the recruiter''s request event did not land (%)', v_count;
  end if;

  -- (10b) the answered entry point, spoken with the owner's privilege
  -- (the service role's stand-in): live token + APPROVED set → true,
  -- event carries the issuance label; a REVOKED token → false; the
  -- approved set is dd02 and a DRAFT id → false. Neither false writes.
  perform set_config('request.jwt.claims', '', true);
  execute 'reset role';

  select public.record_client_interview_answered(
    '11710000-0000-4000-8000-00000000f001',
    '11710000-0000-4000-8000-00000000dd02',
    3
  ) into v_ok;
  if not v_ok then
    raise exception 'INVARIANT-FAIL (10b): a live token against the approved set was refused';
  end if;
  select count(*) into v_count from public.activity_events
   where event_type = 'client_interview_answered'
     and detail->>'label' = 'CI Probe HM @ Ledgerline'
     and (detail->>'answered_count')::int = 3
     and organization_id = '11710000-0000-4000-8000-0000000000a0';
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL (10b): the answered event did not land with the label (%)', v_count;
  end if;

  select public.record_client_interview_answered(
    '11710000-0000-4000-8000-00000000f002',
    '11710000-0000-4000-8000-00000000dd02',
    1
  ) into v_ok;
  if v_ok then
    raise exception 'INVARIANT-FAIL (10b): a revoked token was accepted';
  end if;

  -- The draft fixture: v3 exists as a draft (agent finished it above).
  select public.record_client_interview_answered(
    '11710000-0000-4000-8000-00000000f001',
    (select ci.id from public.client_interviews ci
      where ci.project_id = '11710000-0000-4000-8000-00000000aa01'
        and ci.status = 'draft'
      order by ci.version desc limit 1),
    1
  ) into v_ok;
  if v_ok then
    raise exception 'INVARIANT-FAIL (10b): a DRAFT set accepted answers';
  end if;

  select count(*) into v_count from public.activity_events
   where event_type = 'client_interview_answered';
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL (10b): a refused call wrote an event (total %)', v_count;
  end if;

  raise notice 'ALL CLIENT-INTERVIEW INVARIANTS PASSED';
end
$checks$;

rollback;
