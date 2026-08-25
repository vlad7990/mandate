-- Agent-prescreen invariants (migration 101: the twenty-fourth agent
-- principal — the Engage arc's fifth slice, the pre-screen record,
-- and THE TERMINAL PIN: a COMPLETE pre-screen — the record of what
-- the candidate said — is dead to the agent forever; abandonment is
-- a human act; an escalation carries its reason both directions).
--
-- Rolled back; forged-JWT assertions per the house pattern. 101
-- mints everything this file pins:
--
--    1. Read coverage under the agent: the candidate rows (the pool
--       grant), the thread, the comms policy — the judgment's
--       inputs, nothing more.
--    2. The pre-screen is BORN A PROPOSAL by the agent (INSERT
--       pinned status='proposed' — a birth at any other status is
--       refused); the trail carries counts and the question text is
--       provably absent; attribution pins.
--    3. History intact at TWENTY-NINE by COUNT (§42 doctrine).
--    4. THE PINS, all faces — this slice's control tripwire is the
--       TERMINAL face: the agent advances the working states and
--       completes with the stamp; the COMPLETE row is then dead to
--       it (rewrite and reopen both land nowhere); the stamp
--       coherence CHECK binds even the owner; the agent cannot
--       abandon (WITH CHECK) and cannot escalate reasonless (table
--       CHECK); an escalated row is the human's, and the human's
--       resolve/abandon land; an abandoned lane may be re-proposed
--       (the partial unique admits it) but never duplicated; the
--       NO-VERDICT probe scans every landed jsonb for
--       /score|pass|verdict|qualif/i and finds NOTHING; viewer
--       lands nowhere; no DELETE door; the trail doors refuse
--       unknown types and humans.
--    5. Negative matrix under the agent.
--    6. Kill switches independent at TWENTY-FOUR.
--
-- On success: NOTICE 'ALL AGENT-PRESCREEN INVARIANTS PASSED'.
--
-- Control run (2026-08-25): prescreens_agent_update REBUILT with the
-- USING status conjunct dropped ("the seam refuses terminal rows
-- anyway") — the agent REOPENED a COMPLETED pre-screen and rewrote
-- its evidence; the harness aborted at INVARIANT-FAIL (4c); drift
-- and harness in ONE transaction, the abort rolling the rebuild back.
--
-- Role discipline: after any owner-side check, re-enter
-- `set local role authenticated` before the next forged-JWT probe.

begin;

insert into public.organizations (id, name, slug) values
  ('01010000-0000-4000-8000-0000000000a0', 'PS Org A', 'ps-org-a');

insert into auth.users (id, email) values
  ('01010000-0000-4000-8000-0000000000a1', 'ps-admin@test.local'),
  ('01010000-0000-4000-8000-0000000000a2', 'ps-recruiter@test.local'),
  ('01010000-0000-4000-8000-0000000000a3', 'ps-viewer@test.local'),
  ('01010000-0000-4000-8000-0000000000aa', 'ps-calibration@test.local'),
  ('01010000-0000-4000-8000-0000000000ab', 'ps-prescreen@test.local');

update public.users set organization_id = '01010000-0000-4000-8000-0000000000a0',
       status = 'active', role = 'admin', full_name = 'PS Admin'
 where id = '01010000-0000-4000-8000-0000000000a1';
update public.users set organization_id = '01010000-0000-4000-8000-0000000000a0',
       status = 'active', role = 'recruiter', full_name = 'PS Recruiter'
 where id = '01010000-0000-4000-8000-0000000000a2';
update public.users set organization_id = '01010000-0000-4000-8000-0000000000a0',
       status = 'active', role = 'viewer', full_name = 'PS Viewer'
 where id = '01010000-0000-4000-8000-0000000000a3';
update public.users set organization_id = '01010000-0000-4000-8000-0000000000a0',
       status = 'active', role = 'agent', full_name = 'Calibration Agent'
 where id = '01010000-0000-4000-8000-0000000000aa';
update public.users set organization_id = '01010000-0000-4000-8000-0000000000a0',
       status = 'active', role = 'agent', full_name = 'Pre-Screen Agent'
 where id = '01010000-0000-4000-8000-0000000000ab';

insert into public.projects (id, organization_id, created_by, title, company_name, one_line_input) values
  ('01010000-0000-4000-8000-00000000aa01', '01010000-0000-4000-8000-0000000000a0',
   '01010000-0000-4000-8000-0000000000a2',
   'CISO Search', 'Wrenfold Assurance', 'CISO for Wrenfold Assurance (harness)');

insert into public.candidates (id, project_id, organization_id, full_name, email) values
  ('01010000-0000-4000-8000-00000000cc01', '01010000-0000-4000-8000-00000000aa01',
   '01010000-0000-4000-8000-0000000000a0', 'Nadia Ferro', 'nadia.ferro@harness.test'),
  ('01010000-0000-4000-8000-00000000cc02', '01010000-0000-4000-8000-00000000aa01',
   '01010000-0000-4000-8000-0000000000a0', 'Piotr Malek', 'piotr.malek@harness.test');

insert into public.candidate_outreach
  (candidate_id, project_id, organization_id, channel, direction, subject, body, occurred_at, created_by)
values
  ('01010000-0000-4000-8000-00000000cc01', '01010000-0000-4000-8000-00000000aa01',
   '01010000-0000-4000-8000-0000000000a0', 'email', 'outbound',
   'Pre-screen questions', 'Invitation (harness)', now() - interval '2 days',
   '01010000-0000-4000-8000-0000000000a2'),
  ('01010000-0000-4000-8000-00000000cc01', '01010000-0000-4000-8000-00000000aa01',
   '01010000-0000-4000-8000-0000000000a0', 'email', 'inbound',
   'Re: Pre-screen questions', 'Answers: ran the platform org of 60 (harness)', now() - interval '1 day',
   '01010000-0000-4000-8000-0000000000a2');

insert into public.org_comms_policy (organization_id)
values ('01010000-0000-4000-8000-0000000000a0');

do $checks$
declare
  v_recruiter uuid := '01010000-0000-4000-8000-0000000000a2';
  v_viewer    uuid := '01010000-0000-4000-8000-0000000000a3';
  v_calagent  uuid := '01010000-0000-4000-8000-0000000000aa';
  v_ps        uuid := '01010000-0000-4000-8000-0000000000ab';
  v_org       uuid := '01010000-0000-4000-8000-0000000000a0';
  v_project   uuid := '01010000-0000-4000-8000-00000000aa01';
  v_cc01      uuid := '01010000-0000-4000-8000-00000000cc01';
  v_cc02      uuid := '01010000-0000-4000-8000-00000000cc02';
  v_row1      uuid;
  v_row2      uuid;
  v_row3      uuid;
  v_count     int;
  v_count2    int;
  v_raised    boolean;
  v_text      text;
  v_uuid      uuid;
  v_type      text;
begin
  execute 'set local role authenticated';

  ------------------------------------------------------------------------
  -- (1) Read coverage under the agent.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_ps, 'role', 'authenticated')::text, true);
  select count(*) into v_count from public.candidates;
  if v_count <> 2 then
    raise exception 'INVARIANT-FAIL (1): the agent reads % of 2 candidates', v_count;
  end if;
  select count(*) into v_count from public.candidate_outreach;
  if v_count <> 2 then
    raise exception 'INVARIANT-FAIL (1): the agent reads % of 2 thread rows', v_count;
  end if;
  select count(*) into v_count from public.org_comms_policy;
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL (1): the agent reads % of 1 policy rows', v_count;
  end if;

  ------------------------------------------------------------------------
  -- (2) Born a PROPOSAL: the birth pin, the counts-only trail.
  ------------------------------------------------------------------------
  v_raised := false;
  begin
    insert into public.prescreens
      (organization_id, project_id, candidate_id, status)
    values (v_org, v_project, v_cc01, 'invited');
  exception when others then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (2): the agent birthed a pre-screen already INVITED';
  end if;

  insert into public.prescreens
    (organization_id, project_id, candidate_id, status, question_set)
  values (v_org, v_project, v_cc01, 'proposed',
          '{"subject": "A few questions", "body": "Quick pre-screen", "questions": ["Describe the thornbury platform you ran"]}'::jsonb)
  returning id into v_row1;
  if v_row1 is null then
    raise exception 'INVARIANT-FAIL (2): the agent could not birth the proposal';
  end if;

  perform public.record_agent_event(
    'prescreen_updated', v_project, v_cc01,
    jsonb_build_object('agent_kind', 'prescreen', 'status', 'proposed',
                       'questions', 1, 'unknowns', 3, 'validated', 1,
                       'partial', 1, 'thread_messages', 2));

  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  select count(*) into v_count from public.activity_events
   where detail::text like '%thornbury%';
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (2): the question text rode the trail';
  end if;
  select actor_id, actor_label into v_uuid, v_text
    from public.activity_events where event_type = 'prescreen_updated';
  if v_uuid is distinct from v_ps or v_text is distinct from 'Pre-Screen Agent' then
    raise exception 'INVARIANT-FAIL (2): the event wears the wrong face (% / %)', v_uuid, v_text;
  end if;
  execute 'set local role authenticated';

  ------------------------------------------------------------------------
  -- (3) History intact at TWENTY-NINE — by COUNT.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_ps, 'role', 'authenticated')::text, true);
  for v_type in
    select unnest(array['feedback_interpreted', 'candidates_ranked',
                        'candidate_parsed', 'candidate_evaluated',
                        'candidate_positioned', 'candidate_researched',
                        'candidate_triangulated', 'candidate_profiled',
                        'desk_digest_generated', 'company_researched',
                        'hm_researched', 'culture_profiled',
                        'sourcing_queries_generated', 'intake_analyzed',
                        'health_suggested', 'weekly_report_generated',
                        'calibration_derived', 'job_spec_generated',
                        'shortlist_report_generated', 'copilot_answered',
                        'success_profile_generated', 'interview_plan_generated',
                        'executive_context_researched',
                        'candidate_search_answered', 'sourcing_search_executed',
                        'outreach_strategy_drafted', 'relationship_updated',
                        'engagement_updated', 'prescreen_updated'])
  loop
    begin
      perform public.record_agent_event(
        v_type, null, null, jsonb_build_object('probe', 'history-intact'));
    exception when others then
      raise exception 'INVARIANT-FAIL (3): the vocabulary lost an event type (% refused: %)',
        v_type, sqlerrm;
    end;
  end loop;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  select count(*) into v_count from public.activity_events
   where detail->>'probe' = 'history-intact';
  if v_count <> 29 then
    raise exception 'INVARIANT-FAIL (3): % of 29 history probes landed — a type vanished SILENTLY', v_count;
  end if;
  execute 'set local role authenticated';

  ------------------------------------------------------------------------
  -- (4) THE PINS, all faces.
  ------------------------------------------------------------------------
  -- (4a) The agent advances the working states and captures.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_ps, 'role', 'authenticated')::text, true);
  update public.prescreens
     set status = 'in_progress',
         transcript = '[{"direction": "outbound", "body": "Invitation (harness)"}, {"direction": "inbound", "body": "Answers: ran the platform org of 60 (harness)"}]'::jsonb,
         professional_evidence = '{"leadership": {"value": "ran a platform org of 60", "status": "validated", "source": "reply 1"}}'::jsonb,
         interest_profile = '{"interest": "open", "timing": "quarter end"}'::jsonb,
         updated_at = now()
   where id = v_row1;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  select status into v_text from public.prescreens where id = v_row1;
  if v_text is distinct from 'in_progress' then
    raise exception 'INVARIANT-FAIL (4a): the agent''s capture did not land (%)', v_text;
  end if;
  execute 'set local role authenticated';

  -- (4b) THE NO-VERDICT PROBE: nothing landed carries a score shape.
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  select count(*) into v_count from public.prescreens
   where (transcript::text || professional_evidence::text
          || interest_profile::text || coalesce(question_set::text, ''))
         ~* '"[^"]*(score|pass|verdict|qualif)[^"]*"\s*:';
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (4b): a verdict-shaped key landed on a pre-screen';
  end if;
  execute 'set local role authenticated';

  -- (4c) Completion, the stamp, and THE TERMINAL PIN.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_ps, 'role', 'authenticated')::text, true);
  v_raised := false;
  begin
    update public.prescreens set status = 'complete' where id = v_row1;
  exception when check_violation then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (4c): an unstamped completion landed';
  end if;
  update public.prescreens
     set status = 'complete', completed_at = now(), updated_at = now()
   where id = v_row1;
  -- The record is now terminal to the agent: rewrite and reopen both
  -- land nowhere (USING filters — zero rows, no error).
  update public.prescreens
     set professional_evidence = '{"leadership": {"value": "rewritten", "status": "validated", "source": "x"}}'::jsonb
   where id = v_row1;
  update public.prescreens
     set status = 'in_progress', completed_at = null where id = v_row1;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  select status, professional_evidence->'leadership'->>'value' into v_text, v_type
    from public.prescreens where id = v_row1;
  if v_text is distinct from 'complete'
     or v_type is distinct from 'ran a platform org of 60' then
    raise exception 'INVARIANT-FAIL (4c): the agent touched a COMPLETE pre-screen (%/%)', v_text, v_type;
  end if;

  -- (4d) The stamp coherence binds even the owner.
  v_raised := false;
  begin
    update public.prescreens set completed_at = null where id = v_row1;
  exception when check_violation then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (4d): a complete row lost its stamp';
  end if;
  -- Owner-side check done — re-enter the role (the 098 lesson).
  execute 'set local role authenticated';

  ------------------------------------------------------------------------
  -- (4e) The second lane: no agent abandonment, no reasonless raise,
  --      the escalated row is the human's.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_ps, 'role', 'authenticated')::text, true);
  insert into public.prescreens
    (organization_id, project_id, candidate_id, status)
  values (v_org, v_project, v_cc02, 'proposed')
  returning id into v_row2;

  v_raised := false;
  begin
    update public.prescreens set status = 'abandoned' where id = v_row2;
  exception when others then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (4e): the AGENT abandoned a pre-screen';
  end if;

  v_raised := false;
  begin
    update public.prescreens set status = 'escalated' where id = v_row2;
  exception when others then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (4e): a reasonless escalation landed';
  end if;

  update public.prescreens
     set status = 'escalated',
         escalation_reason = 'candidate asked about a legal dispute (harness)'
   where id = v_row2;
  update public.prescreens
     set status = 'in_progress', escalation_reason = null where id = v_row2;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  select status into v_text from public.prescreens where id = v_row2;
  if v_text is distinct from 'escalated' then
    raise exception 'INVARIANT-FAIL (4e): the AGENT resolved its own escalation (%)', v_text;
  end if;
  execute 'set local role authenticated';

  -- (4f) The HUMAN resolves, then abandons; the lane may be
  --      re-proposed but never duplicated.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_recruiter, 'role', 'authenticated')::text, true);
  update public.prescreens
     set status = 'in_progress', escalation_reason = null, updated_at = now()
   where id = v_row2;
  update public.prescreens
     set status = 'abandoned', updated_at = now()
   where id = v_row2;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  select status into v_text from public.prescreens where id = v_row2;
  if v_text is distinct from 'abandoned' then
    raise exception 'INVARIANT-FAIL (4f): the human''s resolve/abandon did not land (%)', v_text;
  end if;
  execute 'set local role authenticated';

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_ps, 'role', 'authenticated')::text, true);
  insert into public.prescreens
    (organization_id, project_id, candidate_id, status)
  values (v_org, v_project, v_cc02, 'proposed')
  returning id into v_row3;
  if v_row3 is null then
    raise exception 'INVARIANT-FAIL (4f): an abandoned lane could not be re-proposed';
  end if;
  v_raised := false;
  begin
    insert into public.prescreens
      (organization_id, project_id, candidate_id, status)
    values (v_org, v_project, v_cc02, 'proposed');
  exception when unique_violation then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (4f): a second live pre-screen was born on one lane';
  end if;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  execute 'set local role authenticated';

  -- (4g) The viewer lands nowhere; nobody DELETEs.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_viewer, 'role', 'authenticated')::text, true);
  update public.prescreens set status = 'abandoned' where id = v_row3;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  select status into v_text from public.prescreens where id = v_row3;
  if v_text is distinct from 'proposed' then
    raise exception 'INVARIANT-FAIL (4g): a VIEWER moved a pre-screen';
  end if;
  execute 'set local role authenticated';

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_ps, 'role', 'authenticated')::text, true);
  delete from public.prescreens where id = v_row1;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_recruiter, 'role', 'authenticated')::text, true);
  delete from public.prescreens where id = v_row1;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  select count(*) into v_count from public.prescreens where id = v_row1;
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL (4g): a pre-screen was DELETED';
  end if;
  execute 'set local role authenticated';

  -- (4h) The trail doors.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_ps, 'role', 'authenticated')::text, true);
  v_raised := false;
  begin
    perform public.record_agent_event('prescreen_hallucinated');
  exception when others then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (4h): the agent recorded an unknown type';
  end if;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_recruiter, 'role', 'authenticated')::text, true);
  v_raised := false;
  begin
    perform public.record_agent_event('prescreen_updated');
  exception when insufficient_privilege then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (4h): a recruiter recorded prescreen_updated through the agent door';
  end if;

  ------------------------------------------------------------------------
  -- (5) The negative matrix under the agent.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_ps, 'role', 'authenticated')::text, true);
  select count(*) into v_count from public.clients;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (5): the agent reads % clients rows', v_count;
  end if;
  select count(*) into v_count from public.organizations;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (5): the agent reads % organizations rows', v_count;
  end if;
  select count(*) into v_count from public.activity_events;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (5): the agent reads % activity_events rows', v_count;
  end if;
  select count(*), count(*) filter (where id = v_ps)
    into v_count, v_count2 from public.users;
  if v_count <> 1 or v_count2 <> 1 then
    raise exception 'INVARIANT-FAIL (5): the agent reads % users rows (self: %)', v_count, v_count2;
  end if;
  select count(*) into v_count from public.candidate_erasure_requests;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (5): the agent reads the erasure queue (% rows)', v_count;
  end if;

  ------------------------------------------------------------------------
  -- (6) Kill switches independent at TWENTY-FOUR.
  ------------------------------------------------------------------------
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  update public.users set status = 'suspended' where id = v_ps;
  execute 'set local role authenticated';

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_ps, 'role', 'authenticated')::text, true);
  select count(*) into v_count from public.prescreens;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (6): the SUSPENDED agent still reads % pre-screens', v_count;
  end if;
  update public.prescreens set status = 'in_progress' where id = v_row3;
  v_raised := false;
  begin
    perform public.record_agent_event('prescreen_updated');
  exception when insufficient_privilege then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (6): the suspended agent recorded an event';
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_calagent, 'role', 'authenticated')::text, true);
  perform public.record_agent_event(
    'calibration_derived', null, null,
    jsonb_build_object('agent_kind', 'calibration', 'probe', 'twentyfour-way-independence'));

  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  select status into v_text from public.prescreens where id = v_row3;
  if v_text is distinct from 'proposed' then
    raise exception 'INVARIANT-FAIL (6): the suspended agent''s write landed (%)', v_text;
  end if;
  select count(*) into v_count from public.activity_events
   where event_type = 'calibration_derived' and actor_id = v_calagent
     and detail->>'probe' = 'twentyfour-way-independence';
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL (6): the Calibration Agent''s event did not land with the Pre-Screen Agent down';
  end if;
  update public.users set status = 'active' where id = v_ps;

  raise notice 'ALL AGENT-PRESCREEN INVARIANTS PASSED';
end
$checks$;

rollback;
