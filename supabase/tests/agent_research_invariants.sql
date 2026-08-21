-- Agent-research invariants (migration 079: the sixth agent
-- principal, vocabulary only, the history-intact pin).
--
-- Rolled back; forged-JWT assertions per the house pattern. 074 pins
-- the role, 075–078 pin the second through fifth principals; this
-- file pins the sixth and the one thing new to this slice:
--
--    1. The dossier lands through the RPC with every neighbouring key
--       intact (the D7 pin — parser fields, evaluator report,
--       positioning kit all survive). The event lands with the
--       researcher as actor and the trigger named.
--    2. THE VOCABULARY'S HISTORY IS INTACT — every agent event type,
--       all six, is admitted by record_agent_event AND lands past the
--       CHECK. THE control-run tripwire: the realistic drift is a
--       CHECK rebuilt from a stale migration file instead of
--       pg_constraint, silently dropping a prior slice's event type.
--       Asserted by effect (each type recorded and counted), not by
--       string-matching the constraint definition. The COUNT is the
--       tripwire, not the exception gate: `write_activity_event`
--       never raises by 053's design (an audit write must not fail
--       the mutation it describes), so under a stale CHECK the
--       event does not error — it VANISHES with only a server-side
--       WARNING. Production would never surface this; only counting
--       what actually landed does.
--    3. The sixth principal's negative matrix, by name.
--    4. The forgery boundary both directions: a recruiter refused
--       candidate_researched at both doors; the researcher refused an
--       unknown type by name.
--    5. Kill switches independent at six: with the RESEARCHER
--       suspended (reads nothing, door refuses), the POSITIONER still
--       records candidate_positioned.
--
-- On success: NOTICE 'ALL AGENT-RESEARCH INVARIANTS PASSED'.
--
-- Control run (2026-08-21, verified): the file re-run with
-- activity_events_type_known re-created from 077's stale list plus
-- the new value (candidate_positioned silently dropped — exactly the
-- drift of rebuilding from an old file) aborted at INVARIANT-FAIL (2)
-- with "5 of 6 history probes landed — the vocabulary lost a prior
-- slice's event type SILENTLY", invariant 1 passing under the
-- regression. The first draft of the control excerpt omitted the
-- count gate and the regression sailed through — proof by
-- demonstration that the exception gate alone cannot catch a CHECK
-- regression. Diff vs. the clean pass: the one constraint. Rollback
-- verified residue-free.

begin;

insert into public.organizations (id, name, slug) values
  ('07900000-0000-4000-8000-0000000000a0', 'Res Org A', 'res-org-a');

insert into public.clients (id, organization_id, name) values
  ('07900000-0000-4000-8000-00000000ca01', '07900000-0000-4000-8000-0000000000a0', 'Res Client A');

insert into auth.users (id, email) values
  ('07900000-0000-4000-8000-0000000000a2', 'res-recruiter@test.local'),
  ('07900000-0000-4000-8000-0000000000a7', 'res-positioner@test.local'),
  ('07900000-0000-4000-8000-0000000000a8', 'res-researcher@test.local');

update public.users set organization_id = '07900000-0000-4000-8000-0000000000a0',
       status = 'active', role = 'recruiter', full_name = 'Res Recruiter'
 where id = '07900000-0000-4000-8000-0000000000a2';
update public.users set organization_id = '07900000-0000-4000-8000-0000000000a0',
       status = 'active', role = 'agent', full_name = 'Positioning Agent'
 where id = '07900000-0000-4000-8000-0000000000a7';
update public.users set organization_id = '07900000-0000-4000-8000-0000000000a0',
       status = 'active', role = 'agent', full_name = 'Candidate Research Agent'
 where id = '07900000-0000-4000-8000-0000000000a8';

insert into public.projects (id, organization_id, title, company_name, one_line_input) values
  ('07900000-0000-4000-8000-00000000aa01', '07900000-0000-4000-8000-0000000000a0',
   'CTO Search', 'Res Co', 'CTO for Res Co');

-- The subject carries every prior agent's fields, which the
-- researcher's write must PRESERVE.
insert into public.candidates (id, organization_id, project_id, full_name, cv_processing, cv_structured) values
  ('07900000-0000-4000-8000-00000000ac01', '07900000-0000-4000-8000-0000000000a0',
   '07900000-0000-4000-8000-00000000aa01', 'Res Subject', false,
   '{"full_name": "Res Subject", "fit_dimensions": {"domain": 6}, "evaluation": {"schema_version": 1, "summary": "harness evaluation"}, "positioning_kit": {"positioning_summary": "harness kit"}}'::jsonb);

do $checks$
declare
  v_recruiter  uuid := '07900000-0000-4000-8000-0000000000a2';
  v_pos        uuid := '07900000-0000-4000-8000-0000000000a7';
  v_res        uuid := '07900000-0000-4000-8000-0000000000a8';
  v_project    uuid := '07900000-0000-4000-8000-00000000aa01';
  v_cand       uuid := '07900000-0000-4000-8000-00000000ac01';
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
  -- (1) The dossier lands through the RPC; every neighbour survives;
  --     the event lands under the researcher's own name.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_res, 'role', 'authenticated')::text, true);

  perform public.update_cv_structured_field(
    v_cand, v_project, 'candidate_intelligence',
    '{"identity_confidence": "low", "generated_at": "2026-08-21T00:00:00Z", "sources": []}'::jsonb);

  perform public.record_agent_event(
    'candidate_researched', v_project, v_cand,
    jsonb_build_object('agent_kind', 'researcher', 'trigger', 'research',
                       'replaced_existing', false, 'sources_count', 0));

  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);

  select cv_structured into v_jsonb from public.candidates where id = v_cand;
  if v_jsonb->'candidate_intelligence'->>'identity_confidence' is distinct from 'low' then
    raise exception 'INVARIANT-FAIL (1): the dossier did not land (found %)', v_jsonb->'candidate_intelligence';
  end if;
  if v_jsonb->>'full_name' is distinct from 'Res Subject'
     or v_jsonb->'evaluation'->>'summary' is distinct from 'harness evaluation'
     or v_jsonb->'positioning_kit'->>'positioning_summary' is distinct from 'harness kit' then
    raise exception 'INVARIANT-FAIL (1): the researcher''s write clobbered its neighbours (%)', v_jsonb;
  end if;

  select actor_id, actor_label, detail into v_uuid, v_text, v_jsonb
    from public.activity_events where event_type = 'candidate_researched';
  if v_uuid is distinct from v_res then
    raise exception 'INVARIANT-FAIL (1): the researched event''s actor is %, not the researcher', v_uuid;
  end if;
  if v_text is distinct from 'Candidate Research Agent' then
    raise exception 'INVARIANT-FAIL (1): the actor label is %, not the researcher''s name', v_text;
  end if;
  if v_jsonb->>'trigger' is distinct from 'research' then
    raise exception 'INVARIANT-FAIL (1): the event does not name its trigger (detail %)', v_jsonb;
  end if;
  execute 'set local role authenticated';

  ------------------------------------------------------------------------
  -- (2) The vocabulary's history is intact: all six agent event types
  --     pass BOTH doors' gates — the allowlist and the CHECK — by
  --     effect. THE control tripwire for the stale-list rebuild.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_res, 'role', 'authenticated')::text, true);

  for v_type in
    select unnest(array['feedback_interpreted', 'candidates_ranked',
                        'candidate_parsed', 'candidate_evaluated',
                        'candidate_positioned', 'candidate_researched'])
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
  if v_count <> 6 then
    raise exception 'INVARIANT-FAIL (2): % of 6 history probes landed — the vocabulary lost a prior slice''s event type SILENTLY (write_activity_event swallows the CHECK violation by 053''s design)', v_count;
  end if;
  execute 'set local role authenticated';

  ------------------------------------------------------------------------
  -- (3) The sixth principal's negative matrix, by name.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_res, 'role', 'authenticated')::text, true);

  select count(*) into v_count from public.clients;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (3): the researcher reads % clients rows', v_count;
  end if;

  select count(*) into v_count from public.hiring_manager_reviews;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (3): the researcher reads % hiring_manager_reviews rows', v_count;
  end if;

  select count(*) into v_count from public.organizations;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (3): the researcher reads % organizations rows', v_count;
  end if;

  select count(*) into v_count from public.activity_events;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (3): the researcher reads % activity_events rows', v_count;
  end if;

  select count(*), count(*) filter (where id = v_res)
    into v_count, v_count2 from public.users;
  if v_count <> 1 or v_count2 <> 1 then
    raise exception 'INVARIANT-FAIL (3): the researcher reads % users rows (self: %)', v_count, v_count2;
  end if;

  select count(*) into v_count from public.portal_context();
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (3): portal_context answered the researcher (% rows)', v_count;
  end if;

  ------------------------------------------------------------------------
  -- (4) The forgery boundary, both directions.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_recruiter, 'role', 'authenticated')::text, true);

  v_raised := false;
  begin
    perform public.record_agent_event('candidate_researched', v_project);
  exception when insufficient_privilege then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (4): a recruiter recorded candidate_researched through the agent door';
  end if;

  v_raised := false;
  begin
    perform public.record_activity_event('candidate_researched', v_project);
  exception when others then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (4): a recruiter recorded candidate_researched through the human door';
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_res, 'role', 'authenticated')::text, true);
  v_raised := false;
  begin
    perform public.record_agent_event('dossier_shredded', v_project);
  exception when others then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (4): the researcher recorded an unknown event type';
  end if;

  ------------------------------------------------------------------------
  -- (5) Kill switches independent at six.
  ------------------------------------------------------------------------
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  update public.users set status = 'suspended' where id = v_res;
  execute 'set local role authenticated';

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_res, 'role', 'authenticated')::text, true);
  select count(*) into v_count from public.candidates;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (5): the suspended researcher reads % candidates', v_count;
  end if;
  v_raised := false;
  begin
    perform public.record_agent_event('candidate_researched', v_project);
  exception when insufficient_privilege then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (5): the suspended researcher recorded an event';
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_pos, 'role', 'authenticated')::text, true);
  perform public.record_agent_event(
    'candidate_positioned', v_project, v_cand,
    jsonb_build_object('agent_kind', 'positioner', 'probe', 'six-way-independence'));

  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  select count(*) into v_count from public.activity_events
   where event_type = 'candidate_positioned' and actor_id = v_pos;
  if v_count < 1 then
    raise exception 'INVARIANT-FAIL (5): the positioner''s event did not land with the researcher down';
  end if;
  update public.users set status = 'active' where id = v_res;

  raise notice 'ALL AGENT-RESEARCH INVARIANTS PASSED';
end
$checks$;

rollback;
