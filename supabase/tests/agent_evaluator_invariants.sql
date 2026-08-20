-- Agent-evaluator invariants (migration 077: the fourth agent
-- principal, vocabulary only, the two-way forgery boundary).
--
-- Rolled back; forged-JWT assertions per the house pattern. 074 pins
-- the role, 075/076 pin the second and third principals; this file
-- pins the fourth and the one write shape that is new:
--
--    1. The evaluator's SPREAD-PRESERVING write lands: the evaluation
--       key arrives and the PARSER's fields survive it — the D6 pin,
--       key-level discipline asserted by effect where RLS cannot
--       express it. The event lands with the evaluator as actor and
--       the trigger named.
--    2. The fourth principal's negative matrix, by name.
--    3. The forgery boundary in BOTH directions: through the agent
--       door a recruiter is refused candidate_evaluated by role and
--       the evaluator is refused an unknown type by name; through the
--       HUMAN door (record_activity_event) candidate_evaluated is not
--       an app-recordable event and must raise — THE control-run
--       tripwire, because that door's gate softening is how a
--       recruiter would forge the evaluator's conclusion.
--    4. Kill switches independent at four: with the EVALUATOR
--       suspended (reads nothing, door refuses), the PARSER still
--       records candidate_parsed.
--
-- On success: NOTICE 'ALL AGENT-EVALUATOR INVARIANTS PASSED'.
--
-- Control run (2026-08-20, verified): the file re-run with
-- record_activity_event re-created admitting 'candidate_evaluated' to
-- its human allowlist aborted at INVARIANT-FAIL (3) with "a recruiter
-- recorded candidate_evaluated through the human door", invariants
-- 1–2 passing under the regression. Diff vs. the clean pass: the one
-- function body. Rollback verified residue-free.

begin;

insert into public.organizations (id, name, slug) values
  ('07700000-0000-4000-8000-0000000000a0', 'Eval Org A', 'eval-org-a');

insert into public.clients (id, organization_id, name) values
  ('07700000-0000-4000-8000-00000000ca01', '07700000-0000-4000-8000-0000000000a0', 'Eval Client A');

insert into auth.users (id, email) values
  ('07700000-0000-4000-8000-0000000000a2', 'eval-recruiter@test.local'),
  ('07700000-0000-4000-8000-0000000000a5', 'eval-parser@test.local'),
  ('07700000-0000-4000-8000-0000000000a6', 'eval-evaluator@test.local');

update public.users set organization_id = '07700000-0000-4000-8000-0000000000a0',
       status = 'active', role = 'recruiter', full_name = 'Eval Recruiter'
 where id = '07700000-0000-4000-8000-0000000000a2';
update public.users set organization_id = '07700000-0000-4000-8000-0000000000a0',
       status = 'active', role = 'agent', full_name = 'CV Parsing Agent'
 where id = '07700000-0000-4000-8000-0000000000a5';
update public.users set organization_id = '07700000-0000-4000-8000-0000000000a0',
       status = 'active', role = 'agent', full_name = 'Evaluation Agent'
 where id = '07700000-0000-4000-8000-0000000000a6';

insert into public.projects (id, organization_id, title, company_name, one_line_input) values
  ('07700000-0000-4000-8000-00000000aa01', '07700000-0000-4000-8000-0000000000a0',
   'CPO Search', 'Eval Co', 'CPO for Eval Co');

-- The subject carries a parser-shaped profile whose fields the
-- evaluator's write must PRESERVE.
insert into public.candidates (id, organization_id, project_id, full_name, cv_processing, cv_structured) values
  ('07700000-0000-4000-8000-00000000ac01', '07700000-0000-4000-8000-0000000000a0',
   '07700000-0000-4000-8000-00000000aa01', 'Eval Subject', false,
   '{"full_name": "Eval Subject", "current_title": "CPO", "fit_dimensions": {"technical": 6, "domain": 7, "leadership": 6, "regulatory": 5, "transformation": 6}}'::jsonb);

insert into public.hiring_manager_reviews (id, organization_id, project_id, hm_label) values
  ('07700000-0000-4000-8000-00000000ae01', '07700000-0000-4000-8000-0000000000a0',
   '07700000-0000-4000-8000-00000000aa01', 'Eval Harness HM');

do $checks$
declare
  v_recruiter uuid := '07700000-0000-4000-8000-0000000000a2';
  v_parser    uuid := '07700000-0000-4000-8000-0000000000a5';
  v_eval      uuid := '07700000-0000-4000-8000-0000000000a6';
  v_project   uuid := '07700000-0000-4000-8000-00000000aa01';
  v_cand      uuid := '07700000-0000-4000-8000-00000000ac01';
  v_count     int;
  v_count2    int;
  v_raised    boolean;
  v_text      text;
  v_uuid      uuid;
  v_jsonb     jsonb;
begin
  execute 'set local role authenticated';

  ------------------------------------------------------------------------
  -- (1) The spread-preserving write, and the event, under the
  --     evaluator's own name.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_eval, 'role', 'authenticated')::text, true);

  update public.candidates
     set cv_structured = cv_structured ||
         '{"evaluation": {"schema_version": 1, "verdict": "advance", "summary": "harness evaluation"}}'::jsonb
   where id = v_cand;

  perform public.record_agent_event(
    'candidate_evaluated', v_project, v_cand,
    jsonb_build_object('agent_kind', 'evaluator', 'trigger', 'regenerate'));

  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);

  select cv_structured into v_jsonb from public.candidates where id = v_cand;
  if v_jsonb->'evaluation'->>'summary' is distinct from 'harness evaluation' then
    raise exception 'INVARIANT-FAIL (1): the evaluation did not land (found %)', v_jsonb->'evaluation';
  end if;
  -- The D6 pin: the parser's fields survive the evaluator's write.
  if v_jsonb->>'full_name' is distinct from 'Eval Subject'
     or v_jsonb->'fit_dimensions'->>'domain' is distinct from '7' then
    raise exception 'INVARIANT-FAIL (1): the evaluator''s write clobbered the parser''s fields (%)', v_jsonb;
  end if;

  select actor_id, actor_label, detail into v_uuid, v_text, v_jsonb
    from public.activity_events where event_type = 'candidate_evaluated';
  if v_uuid is distinct from v_eval then
    raise exception 'INVARIANT-FAIL (1): the evaluated event''s actor is %, not the evaluator', v_uuid;
  end if;
  if v_text is distinct from 'Evaluation Agent' then
    raise exception 'INVARIANT-FAIL (1): the actor label is %, not the evaluator''s name', v_text;
  end if;
  if v_jsonb->>'trigger' is distinct from 'regenerate' then
    raise exception 'INVARIANT-FAIL (1): the event does not name its trigger (detail %)', v_jsonb;
  end if;
  execute 'set local role authenticated';

  ------------------------------------------------------------------------
  -- (2) The fourth principal's negative matrix, by name.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_eval, 'role', 'authenticated')::text, true);

  select count(*) into v_count from public.clients;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (2): the evaluator reads % clients rows', v_count;
  end if;

  select count(*) into v_count from public.hiring_manager_reviews;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (2): the evaluator reads % hiring_manager_reviews rows', v_count;
  end if;

  select count(*) into v_count from public.organizations;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (2): the evaluator reads % organizations rows', v_count;
  end if;

  select count(*) into v_count from public.activity_events;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (2): the evaluator reads % activity_events rows', v_count;
  end if;

  select count(*), count(*) filter (where id = v_eval)
    into v_count, v_count2 from public.users;
  if v_count <> 1 or v_count2 <> 1 then
    raise exception 'INVARIANT-FAIL (2): the evaluator reads % users rows (self: %)', v_count, v_count2;
  end if;

  select count(*) into v_count from public.portal_context();
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (2): portal_context answered the evaluator (% rows)', v_count;
  end if;

  ------------------------------------------------------------------------
  -- (3) The forgery boundary, both directions. THE control tripwire.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_recruiter, 'role', 'authenticated')::text, true);

  v_raised := false;
  begin
    perform public.record_agent_event('candidate_evaluated', v_project);
  exception when insufficient_privilege then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (3): a recruiter recorded candidate_evaluated through the agent door';
  end if;

  -- The human door must refuse the agent's event type by name.
  v_raised := false;
  begin
    perform public.record_activity_event('candidate_evaluated', v_project);
  exception when others then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (3): a recruiter recorded candidate_evaluated through the human door';
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_eval, 'role', 'authenticated')::text, true);
  v_raised := false;
  begin
    perform public.record_agent_event('evaluation_shredded', v_project);
  exception when others then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (3): the evaluator recorded an unknown event type';
  end if;

  ------------------------------------------------------------------------
  -- (4) Kill switches independent at four.
  ------------------------------------------------------------------------
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  update public.users set status = 'suspended' where id = v_eval;
  execute 'set local role authenticated';

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_eval, 'role', 'authenticated')::text, true);
  select count(*) into v_count from public.candidates;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (4): the suspended evaluator reads % candidates', v_count;
  end if;
  v_raised := false;
  begin
    perform public.record_agent_event('candidate_evaluated', v_project);
  exception when insufficient_privilege then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (4): the suspended evaluator recorded an event';
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_parser, 'role', 'authenticated')::text, true);
  perform public.record_agent_event(
    'candidate_parsed', v_project, v_cand,
    jsonb_build_object('agent_kind', 'cv_parser', 'probe', 'four-way-independence'));

  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  select count(*) into v_count from public.activity_events
   where event_type = 'candidate_parsed' and actor_id = v_parser;
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL (4): the parser''s event did not land with the evaluator down';
  end if;
  update public.users set status = 'active' where id = v_eval;

  raise notice 'ALL AGENT-EVALUATOR INVARIANTS PASSED';
end
$checks$;

rollback;
