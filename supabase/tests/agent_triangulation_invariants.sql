-- Agent-triangulation invariants (migration 080: the seventh agent
-- principal, vocabulary only, the kill switch's own regression proof).
--
-- Rolled back; forged-JWT assertions per the house pattern. 074 pins
-- the role, 075–079 pin the second through sixth principals; this
-- file pins the seventh, and its control run targets the programme's
-- central safety mechanism for the first time:
--
--    1. The report lands through the RPC with FOUR sibling keys
--       intact — parser fields, evaluation, positioning_kit,
--       candidate_intelligence (the D7 pin at its widest yet). The
--       event lands with the triangulator as actor and the trigger
--       named.
--    2. The vocabulary's history is intact — all seven agent event
--       types recorded and COUNTED (standing doctrine per §42: the
--       count, not the exception, is the tripwire —
--       write_activity_event never raises).
--    3. The seventh principal's negative matrix, by name.
--    4. The forgery boundary both directions.
--    5. Kill switches independent at seven — and THE control-run
--       tripwire: the SUSPENDED triangulator must be refused at the
--       trail door. `is_agent()` today inherits the status='active'
--       gate from current_user_role(); the realistic drift is
--       is_agent() re-created as a direct role read that forgets the
--       status filter, which would let a suspended agent keep
--       recording events (the 059 self-read reaches its own row
--       whatever the status). Under that regression this invariant's
--       door check fails loudly.
--
-- On success: NOTICE 'ALL AGENT-TRIANGULATION INVARIANTS PASSED'.
--
-- Control run (2026-08-21, verified): the file re-run with
-- is_agent() re-created as
--   coalesce((SELECT role = 'agent' FROM users WHERE id = auth.uid()), false)
-- (SECURITY DEFINER, no status gate) aborted at INVARIANT-FAIL (5) —
-- and one gate EARLIER than designed: "the suspended triangulator
-- reads 1 candidates". The agent SELECT policies gate on is_agent()
-- too (074's shape: org_id is not status-gated; is_agent() IS the
-- suspension kill), so the regression disarms the whole reach — reads
-- and door both — and the harness catches it at first touch. Diff
-- vs. the clean pass: the one function body. Restored to the
-- current_user_role() form, verified, rollback residue-free.

begin;

insert into public.organizations (id, name, slug) values
  ('08000000-0000-4000-8000-0000000000a0', 'Tri Org A', 'tri-org-a');

insert into public.clients (id, organization_id, name) values
  ('08000000-0000-4000-8000-00000000ca01', '08000000-0000-4000-8000-0000000000a0', 'Tri Client A');

insert into auth.users (id, email) values
  ('08000000-0000-4000-8000-0000000000a2', 'tri-recruiter@test.local'),
  ('08000000-0000-4000-8000-0000000000a8', 'tri-researcher@test.local'),
  ('08000000-0000-4000-8000-0000000000a9', 'tri-triangulator@test.local');

update public.users set organization_id = '08000000-0000-4000-8000-0000000000a0',
       status = 'active', role = 'recruiter', full_name = 'Tri Recruiter'
 where id = '08000000-0000-4000-8000-0000000000a2';
update public.users set organization_id = '08000000-0000-4000-8000-0000000000a0',
       status = 'active', role = 'agent', full_name = 'Candidate Research Agent'
 where id = '08000000-0000-4000-8000-0000000000a8';
update public.users set organization_id = '08000000-0000-4000-8000-0000000000a0',
       status = 'active', role = 'agent', full_name = 'Triangulation Agent'
 where id = '08000000-0000-4000-8000-0000000000a9';

insert into public.projects (id, organization_id, title, company_name, one_line_input, company_context) values
  ('08000000-0000-4000-8000-00000000aa01', '08000000-0000-4000-8000-0000000000a0',
   'CEO Search', 'Tri Co', 'CEO for Tri Co',
   '{"company_name": "Tri Co", "intelligence_report": {"summary": "harness company report"}, "hm_intelligence": {"summary": "harness hm report"}}'::jsonb);

-- The subject carries every prior agent's fields, which the
-- triangulator's write must PRESERVE.
insert into public.candidates (id, organization_id, project_id, full_name, cv_processing, cv_structured) values
  ('08000000-0000-4000-8000-00000000ac01', '08000000-0000-4000-8000-0000000000a0',
   '08000000-0000-4000-8000-00000000aa01', 'Tri Subject', false,
   '{"full_name": "Tri Subject", "fit_dimensions": {"domain": 6}, "evaluation": {"schema_version": 1, "summary": "harness evaluation"}, "positioning_kit": {"positioning_summary": "harness kit"}, "candidate_intelligence": {"identity_confidence": "low", "summary": "harness dossier"}}'::jsonb);

do $checks$
declare
  v_recruiter  uuid := '08000000-0000-4000-8000-0000000000a2';
  v_res        uuid := '08000000-0000-4000-8000-0000000000a8';
  v_tri        uuid := '08000000-0000-4000-8000-0000000000a9';
  v_project    uuid := '08000000-0000-4000-8000-00000000aa01';
  v_cand       uuid := '08000000-0000-4000-8000-00000000ac01';
  v_count      int;
  v_count2     int;
  v_raised     boolean;
  v_text       text;
  v_uuid       uuid;
  v_jsonb      jsonb;
  v_type       text;
begin
  execute 'set local role authenticated';

  ------------------------------------------------------------------------
  -- (1) The report lands through the RPC; four siblings survive; the
  --     event lands under the triangulator's own name.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_tri, 'role', 'authenticated')::text, true);

  perform public.update_cv_structured_field(
    v_cand, v_project, 'triangulation_report',
    '{"verdict": "aligned", "generated_at": "2026-08-21T00:00:00Z"}'::jsonb);

  perform public.record_agent_event(
    'candidate_triangulated', v_project, v_cand,
    jsonb_build_object('agent_kind', 'triangulator', 'trigger', 'generate',
                       'replaced_existing', false));

  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);

  select cv_structured into v_jsonb from public.candidates where id = v_cand;
  if v_jsonb->'triangulation_report'->>'verdict' is distinct from 'aligned' then
    raise exception 'INVARIANT-FAIL (1): the report did not land (found %)', v_jsonb->'triangulation_report';
  end if;
  if v_jsonb->>'full_name' is distinct from 'Tri Subject'
     or v_jsonb->'evaluation'->>'summary' is distinct from 'harness evaluation'
     or v_jsonb->'positioning_kit'->>'positioning_summary' is distinct from 'harness kit'
     or v_jsonb->'candidate_intelligence'->>'summary' is distinct from 'harness dossier' then
    raise exception 'INVARIANT-FAIL (1): the triangulator''s write clobbered its neighbours (%)', v_jsonb;
  end if;

  select actor_id, actor_label, detail into v_uuid, v_text, v_jsonb
    from public.activity_events where event_type = 'candidate_triangulated';
  if v_uuid is distinct from v_tri then
    raise exception 'INVARIANT-FAIL (1): the triangulated event''s actor is %, not the triangulator', v_uuid;
  end if;
  if v_text is distinct from 'Triangulation Agent' then
    raise exception 'INVARIANT-FAIL (1): the actor label is %, not the triangulator''s name', v_text;
  end if;
  if v_jsonb->>'trigger' is distinct from 'generate' then
    raise exception 'INVARIANT-FAIL (1): the event does not name its trigger (detail %)', v_jsonb;
  end if;
  execute 'set local role authenticated';

  ------------------------------------------------------------------------
  -- (2) The vocabulary's history is intact at seven — by COUNT.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_tri, 'role', 'authenticated')::text, true);

  for v_type in
    select unnest(array['feedback_interpreted', 'candidates_ranked',
                        'candidate_parsed', 'candidate_evaluated',
                        'candidate_positioned', 'candidate_researched',
                        'candidate_triangulated'])
  loop
    begin
      perform public.record_agent_event(
        v_type, v_project, v_cand,
        jsonb_build_object('probe', 'history-intact'));
    exception when others then
      raise exception 'INVARIANT-FAIL (2): the vocabulary lost a prior slice''s event type (% refused: %)',
        v_type, sqlerrm;
    end;
  end loop;

  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  select count(*) into v_count from public.activity_events
   where detail->>'probe' = 'history-intact';
  if v_count <> 7 then
    raise exception 'INVARIANT-FAIL (2): % of 7 history probes landed — the vocabulary lost a prior slice''s event type SILENTLY (write_activity_event swallows the CHECK violation by 053''s design)', v_count;
  end if;
  execute 'set local role authenticated';

  ------------------------------------------------------------------------
  -- (3) The seventh principal's negative matrix, by name.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_tri, 'role', 'authenticated')::text, true);

  select count(*) into v_count from public.clients;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (3): the triangulator reads % clients rows', v_count;
  end if;

  select count(*) into v_count from public.hiring_manager_reviews;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (3): the triangulator reads % hiring_manager_reviews rows', v_count;
  end if;

  select count(*) into v_count from public.organizations;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (3): the triangulator reads % organizations rows', v_count;
  end if;

  select count(*) into v_count from public.activity_events;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (3): the triangulator reads % activity_events rows', v_count;
  end if;

  select count(*), count(*) filter (where id = v_tri)
    into v_count, v_count2 from public.users;
  if v_count <> 1 or v_count2 <> 1 then
    raise exception 'INVARIANT-FAIL (3): the triangulator reads % users rows (self: %)', v_count, v_count2;
  end if;

  select count(*) into v_count from public.portal_context();
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (3): portal_context answered the triangulator (% rows)', v_count;
  end if;

  ------------------------------------------------------------------------
  -- (4) The forgery boundary, both directions.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_recruiter, 'role', 'authenticated')::text, true);

  v_raised := false;
  begin
    perform public.record_agent_event('candidate_triangulated', v_project);
  exception when insufficient_privilege then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (4): a recruiter recorded candidate_triangulated through the agent door';
  end if;

  v_raised := false;
  begin
    perform public.record_activity_event('candidate_triangulated', v_project);
  exception when others then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (4): a recruiter recorded candidate_triangulated through the human door';
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_tri, 'role', 'authenticated')::text, true);
  v_raised := false;
  begin
    perform public.record_agent_event('report_shredded', v_project);
  exception when others then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (4): the triangulator recorded an unknown event type';
  end if;

  ------------------------------------------------------------------------
  -- (5) Kill switches independent at seven — the door refusal is THE
  --     control tripwire for the is_agent() status-gate regression.
  ------------------------------------------------------------------------
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  update public.users set status = 'suspended' where id = v_tri;
  execute 'set local role authenticated';

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_tri, 'role', 'authenticated')::text, true);
  select count(*) into v_count from public.candidates;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (5): the suspended triangulator reads % candidates', v_count;
  end if;
  v_raised := false;
  begin
    perform public.record_agent_event('candidate_triangulated', v_project);
  exception when insufficient_privilege then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (5): the suspended triangulator recorded an event';
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_res, 'role', 'authenticated')::text, true);
  perform public.record_agent_event(
    'candidate_researched', v_project, v_cand,
    jsonb_build_object('agent_kind', 'researcher', 'probe', 'seven-way-independence'));

  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  select count(*) into v_count from public.activity_events
   where event_type = 'candidate_researched' and actor_id = v_res
     and detail->>'probe' = 'seven-way-independence';
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL (5): the researcher''s event did not land with the triangulator down';
  end if;
  update public.users set status = 'active' where id = v_tri;

  raise notice 'ALL AGENT-TRIANGULATION INVARIANTS PASSED';
end
$checks$;

rollback;
