-- Agent-positioning invariants (migration 078: the fifth agent
-- principal, vocabulary only, the first RPC-mediated agent write).
--
-- Rolled back; forged-JWT assertions per the house pattern. 074 pins
-- the role, 075/076/077 pin the second through fourth principals; this
-- file pins the fifth and the one write path that is new:
--
--    1. The positioner's kit lands through the SECURITY INVOKER RPC
--       (`update_cv_structured_field`) with every neighbouring key —
--       the parser's fields AND the evaluator's report — intact (the
--       D7 pin, key discipline asserted by effect). The event lands
--       with the positioner as actor and the trigger named.
--    2. The RPC write is org-bound UNDER THE AGENT: a call against a
--       cross-org candidate raises / lands nothing — THE control-run
--       tripwire, because the realistic regression for an RPC-mediated
--       write is the function being re-created SECURITY DEFINER, which
--       detaches it from the caller's RLS.
--    3. The fifth principal's negative matrix, by name.
--    4. The forgery boundary both directions: a recruiter refused
--       candidate_positioned at both doors; the positioner refused an
--       unknown type by name.
--    5. Kill switches independent at five: with the POSITIONER
--       suspended (reads nothing, door refuses), the EVALUATOR still
--       records candidate_evaluated.
--
-- On success: NOTICE 'ALL AGENT-POSITIONING INVARIANTS PASSED'.
--
-- Control run (2026-08-21, verified): the file re-run with
-- update_cv_structured_field re-created as SECURITY DEFINER aborted at
-- INVARIANT-FAIL (2) with "the cross-org RPC write landed under the
-- agent", invariant 1 passing under the regression. Diff vs. the clean
-- pass: the one function's security mode. Rollback verified
-- residue-free.

begin;

insert into public.organizations (id, name, slug) values
  ('07800000-0000-4000-8000-0000000000a0', 'Pos Org A', 'pos-org-a'),
  ('07800000-0000-4000-8000-0000000000b0', 'Pos Org B', 'pos-org-b');

insert into public.clients (id, organization_id, name) values
  ('07800000-0000-4000-8000-00000000ca01', '07800000-0000-4000-8000-0000000000a0', 'Pos Client A');

insert into auth.users (id, email) values
  ('07800000-0000-4000-8000-0000000000a2', 'pos-recruiter@test.local'),
  ('07800000-0000-4000-8000-0000000000a6', 'pos-evaluator@test.local'),
  ('07800000-0000-4000-8000-0000000000a7', 'pos-positioner@test.local');

update public.users set organization_id = '07800000-0000-4000-8000-0000000000a0',
       status = 'active', role = 'recruiter', full_name = 'Pos Recruiter'
 where id = '07800000-0000-4000-8000-0000000000a2';
update public.users set organization_id = '07800000-0000-4000-8000-0000000000a0',
       status = 'active', role = 'agent', full_name = 'Evaluation Agent'
 where id = '07800000-0000-4000-8000-0000000000a6';
update public.users set organization_id = '07800000-0000-4000-8000-0000000000a0',
       status = 'active', role = 'agent', full_name = 'Positioning Agent'
 where id = '07800000-0000-4000-8000-0000000000a7';

insert into public.projects (id, organization_id, title, company_name, one_line_input) values
  ('07800000-0000-4000-8000-00000000aa01', '07800000-0000-4000-8000-0000000000a0',
   'CMO Search', 'Pos Co', 'CMO for Pos Co'),
  -- Org B's project and candidate: the cross-org target invariant 2
  -- aims the RPC at.
  ('07800000-0000-4000-8000-00000000bb01', '07800000-0000-4000-8000-0000000000b0',
   'Foreign Search', 'Foreign Co', 'CFO for Foreign Co');

-- The subject carries a parser-shaped profile AND an evaluator report,
-- both of which the positioner's write must PRESERVE.
insert into public.candidates (id, organization_id, project_id, full_name, cv_processing, cv_structured) values
  ('07800000-0000-4000-8000-00000000ac01', '07800000-0000-4000-8000-0000000000a0',
   '07800000-0000-4000-8000-00000000aa01', 'Pos Subject', false,
   '{"full_name": "Pos Subject", "current_title": "CMO", "fit_dimensions": {"technical": 5, "domain": 8, "leadership": 7, "regulatory": 4, "transformation": 6}, "evaluation": {"schema_version": 1, "verdict": "advance", "summary": "harness evaluation"}}'::jsonb),
  ('07800000-0000-4000-8000-00000000bc01', '07800000-0000-4000-8000-0000000000b0',
   '07800000-0000-4000-8000-00000000bb01', 'Foreign Subject', false,
   '{"full_name": "Foreign Subject"}'::jsonb);

do $checks$
declare
  v_recruiter  uuid := '07800000-0000-4000-8000-0000000000a2';
  v_eval       uuid := '07800000-0000-4000-8000-0000000000a6';
  v_pos        uuid := '07800000-0000-4000-8000-0000000000a7';
  v_project    uuid := '07800000-0000-4000-8000-00000000aa01';
  v_cand       uuid := '07800000-0000-4000-8000-00000000ac01';
  v_fproject   uuid := '07800000-0000-4000-8000-00000000bb01';
  v_fcand      uuid := '07800000-0000-4000-8000-00000000bc01';
  v_count      int;
  v_count2     int;
  v_raised     boolean;
  v_text       text;
  v_uuid       uuid;
  v_jsonb      jsonb;
begin
  execute 'set local role authenticated';

  ------------------------------------------------------------------------
  -- (1) The kit lands through the RPC; the neighbours survive; the
  --     event lands under the positioner's own name.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_pos, 'role', 'authenticated')::text, true);

  perform public.update_cv_structured_field(
    v_cand, v_project, 'positioning_kit',
    '{"positioning_summary": "harness kit", "generated_at": "2026-08-21T00:00:00Z"}'::jsonb);

  perform public.record_agent_event(
    'candidate_positioned', v_project, v_cand,
    jsonb_build_object('agent_kind', 'positioner', 'trigger', 'generate',
                       'replaced_existing', false));

  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);

  select cv_structured into v_jsonb from public.candidates where id = v_cand;
  if v_jsonb->'positioning_kit'->>'positioning_summary' is distinct from 'harness kit' then
    raise exception 'INVARIANT-FAIL (1): the kit did not land (found %)', v_jsonb->'positioning_kit';
  end if;
  -- The D7 pin: the parser's fields and the evaluator's report survive.
  if v_jsonb->>'full_name' is distinct from 'Pos Subject'
     or v_jsonb->'fit_dimensions'->>'domain' is distinct from '8'
     or v_jsonb->'evaluation'->>'summary' is distinct from 'harness evaluation' then
    raise exception 'INVARIANT-FAIL (1): the positioner''s write clobbered its neighbours (%)', v_jsonb;
  end if;

  select actor_id, actor_label, detail into v_uuid, v_text, v_jsonb
    from public.activity_events where event_type = 'candidate_positioned';
  if v_uuid is distinct from v_pos then
    raise exception 'INVARIANT-FAIL (1): the positioned event''s actor is %, not the positioner', v_uuid;
  end if;
  if v_text is distinct from 'Positioning Agent' then
    raise exception 'INVARIANT-FAIL (1): the actor label is %, not the positioner''s name', v_text;
  end if;
  if v_jsonb->>'trigger' is distinct from 'generate' then
    raise exception 'INVARIANT-FAIL (1): the event does not name its trigger (detail %)', v_jsonb;
  end if;
  execute 'set local role authenticated';

  ------------------------------------------------------------------------
  -- (2) The RPC write is org-bound under the agent. THE control
  --     tripwire: SECURITY DEFINER on the function would let this land.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_pos, 'role', 'authenticated')::text, true);

  v_raised := false;
  begin
    perform public.update_cv_structured_field(
      v_fcand, v_fproject, 'positioning_kit', '{"positioning_summary": "forged"}'::jsonb);
  exception when others then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (2): the cross-org RPC write did not raise under the agent';
  end if;

  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  select cv_structured into v_jsonb from public.candidates where id = v_fcand;
  if v_jsonb ? 'positioning_kit' then
    raise exception 'INVARIANT-FAIL (2): the cross-org RPC write landed under the agent';
  end if;
  execute 'set local role authenticated';

  ------------------------------------------------------------------------
  -- (3) The fifth principal's negative matrix, by name.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_pos, 'role', 'authenticated')::text, true);

  select count(*) into v_count from public.clients;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (3): the positioner reads % clients rows', v_count;
  end if;

  select count(*) into v_count from public.hiring_manager_reviews;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (3): the positioner reads % hiring_manager_reviews rows', v_count;
  end if;

  select count(*) into v_count from public.organizations;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (3): the positioner reads % organizations rows', v_count;
  end if;

  select count(*) into v_count from public.activity_events;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (3): the positioner reads % activity_events rows', v_count;
  end if;

  select count(*), count(*) filter (where id = v_pos)
    into v_count, v_count2 from public.users;
  if v_count <> 1 or v_count2 <> 1 then
    raise exception 'INVARIANT-FAIL (3): the positioner reads % users rows (self: %)', v_count, v_count2;
  end if;

  select count(*) into v_count from public.portal_context();
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (3): portal_context answered the positioner (% rows)', v_count;
  end if;

  ------------------------------------------------------------------------
  -- (4) The forgery boundary, both directions.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_recruiter, 'role', 'authenticated')::text, true);

  v_raised := false;
  begin
    perform public.record_agent_event('candidate_positioned', v_project);
  exception when insufficient_privilege then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (4): a recruiter recorded candidate_positioned through the agent door';
  end if;

  v_raised := false;
  begin
    perform public.record_activity_event('candidate_positioned', v_project);
  exception when others then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (4): a recruiter recorded candidate_positioned through the human door';
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_pos, 'role', 'authenticated')::text, true);
  v_raised := false;
  begin
    perform public.record_agent_event('kit_shredded', v_project);
  exception when others then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (4): the positioner recorded an unknown event type';
  end if;

  ------------------------------------------------------------------------
  -- (5) Kill switches independent at five.
  ------------------------------------------------------------------------
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  update public.users set status = 'suspended' where id = v_pos;
  execute 'set local role authenticated';

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_pos, 'role', 'authenticated')::text, true);
  select count(*) into v_count from public.candidates;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (5): the suspended positioner reads % candidates', v_count;
  end if;
  v_raised := false;
  begin
    perform public.record_agent_event('candidate_positioned', v_project);
  exception when insufficient_privilege then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (5): the suspended positioner recorded an event';
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_eval, 'role', 'authenticated')::text, true);
  perform public.record_agent_event(
    'candidate_evaluated', v_project, v_cand,
    jsonb_build_object('agent_kind', 'evaluator', 'probe', 'five-way-independence'));

  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  select count(*) into v_count from public.activity_events
   where event_type = 'candidate_evaluated' and actor_id = v_eval;
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL (5): the evaluator''s event did not land with the positioner down';
  end if;
  update public.users set status = 'active' where id = v_pos;

  raise notice 'ALL AGENT-POSITIONING INVARIANTS PASSED';
end
$checks$;

rollback;
