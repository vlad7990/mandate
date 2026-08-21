-- Agent-intake invariants (migration 086: the thirteenth agent
-- principal — the third zero-new-grant slice; vocabulary only).
--
-- Rolled back; forged-JWT assertions per the house pattern. 074 pins
-- the role and the projects grants this slice reuses, 075–085 pin
-- the second through twelfth principals; this file pins the
-- thirteenth:
--
--    1. The judgment lands under the pool's projects UPDATE: title,
--       company_name, calibration_model, company_context — and the
--       HUMAN's fields survive untouched (one_line_input, the brief;
--       created_by, the recruiter who opened the mandate). The event
--       detail carries input_chars and company_identified; the
--       brief's TEXT is provably absent from the trail.
--    2. THE SIGNATURE PIN — THE control-run tripwire: the landed
--       event carries actor_id = the agent and actor_label = "Intake
--       Agent". The drift this control performs is the "helpful"
--       simplification that rewrites record_agent_event to INSERT
--       into the trail directly — an agent's act landing with a NULL
--       actor, wearing the system's blank face, indistinguishable
--       from a migration or a job.
--    3. The vocabulary's history intact at fourteen — by COUNT (§42
--       doctrine).
--    4. The thirteenth principal's negative matrix — UNCHANGED — and
--       THE CLIENTS REGISTRY REFUSED IN BOTH SHAPES: the table reads
--       zero, and the resolve_client RPC (SECURITY INVOKER) answers
--       the agent with nothing — no client row is born of an agent
--       session. Plus the forgery boundary both directions and the
--       unknown-type refusal.
--    5. Kill switches independent at thirteen — and the suspended
--       agent reads ZERO projects rows.
--
-- On success: NOTICE 'ALL AGENT-INTAKE INVARIANTS PASSED'.
--
-- Control run (2026-08-21, verified): record_agent_event REWRITTEN
-- to INSERT into activity_events directly ("skip the wrapper, one
-- less call") — the event landed with actor_id NULL and the harness
-- aborted at INVARIANT-FAIL (2); drift and harness ran in one
-- transaction (function DDL is transactional), so the abort itself
-- rolled the rewrite back — residue-free by construction, the live
-- definition verified to call write_activity_event after. The first
-- control run to regress the ATTRIBUTION itself.

begin;

insert into public.organizations (id, name, slug) values
  ('08600000-0000-4000-8000-0000000000a0', 'Int Org A', 'int-org-a');

insert into auth.users (id, email) values
  ('08600000-0000-4000-8000-0000000000a2', 'int-recruiter@test.local'),
  ('08600000-0000-4000-8000-0000000000aa', 'int-boolean@test.local'),
  ('08600000-0000-4000-8000-0000000000ab', 'int-intake@test.local');

update public.users set organization_id = '08600000-0000-4000-8000-0000000000a0',
       status = 'active', role = 'recruiter', full_name = 'Int Recruiter'
 where id = '08600000-0000-4000-8000-0000000000a2';
update public.users set organization_id = '08600000-0000-4000-8000-0000000000a0',
       status = 'active', role = 'agent', full_name = 'Boolean Search Agent'
 where id = '08600000-0000-4000-8000-0000000000aa';
update public.users set organization_id = '08600000-0000-4000-8000-0000000000a0',
       status = 'active', role = 'agent', full_name = 'Intake Agent'
 where id = '08600000-0000-4000-8000-0000000000ab';

-- The mandate as the human's act left it: placeholders, the brief on
-- one_line_input, created_by = the recruiter who opened it.
insert into public.projects (id, organization_id, created_by, title, company_name, one_line_input, calibration_model, company_context) values
  ('08600000-0000-4000-8000-00000000aa01', '08600000-0000-4000-8000-0000000000a0',
   '08600000-0000-4000-8000-0000000000a2',
   'Analyzing…', 'Analyzing…', 'CTO for Acme Robotics who has scaled hardware+software 50→500 (harness)',
   '{}'::jsonb, '{}'::jsonb);

do $checks$
declare
  v_recruiter  uuid := '08600000-0000-4000-8000-0000000000a2';
  v_boo        uuid := '08600000-0000-4000-8000-0000000000aa';
  v_int        uuid := '08600000-0000-4000-8000-0000000000ab';
  v_org        uuid := '08600000-0000-4000-8000-0000000000a0';
  v_project    uuid := '08600000-0000-4000-8000-00000000aa01';
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
  -- (1) The judgment lands; the human's fields survive; the detail
  --     is honest.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_int, 'role', 'authenticated')::text, true);

  update public.projects
     set title = 'CTO Search',
         company_name = 'Acme Robotics',
         calibration_model = '{"role_title": "CTO", "role_structure": {"seniority": "C-level"}}'::jsonb,
         company_context = '{"company_name": "Acme Robotics", "industry": "Robotics"}'::jsonb
   where id = v_project;

  perform public.record_agent_event(
    'intake_analyzed', v_project, null,
    jsonb_build_object('agent_kind', 'intake', 'trigger', 'create',
                       'input_chars', 72, 'company_identified', true));

  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);

  select title, one_line_input, created_by into v_text, v_type, v_uuid
    from public.projects where id = v_project;
  if v_text is distinct from 'CTO Search' then
    raise exception 'INVARIANT-FAIL (1): the agent''s judgment did not land (title %)', v_text;
  end if;
  if v_type not like 'CTO for Acme Robotics%' then
    raise exception 'INVARIANT-FAIL (1): the HUMAN''s brief was disturbed (%)', v_type;
  end if;
  if v_uuid is distinct from v_recruiter then
    raise exception 'INVARIANT-FAIL (1): the HUMAN''s created_by was disturbed (%)', v_uuid;
  end if;

  select count(*) into v_count from public.activity_events
   where event_type = 'intake_analyzed' and detail::text like '%Acme Robotics%';
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (1): the brief''s text rode the trail';
  end if;
  select detail into v_jsonb from public.activity_events
   where event_type = 'intake_analyzed';
  if v_jsonb->>'input_chars' is distinct from '72'
     or v_jsonb->>'company_identified' is distinct from 'true' then
    raise exception 'INVARIANT-FAIL (1): the event detail is wrong (%)', v_jsonb;
  end if;

  ------------------------------------------------------------------------
  -- (2) THE SIGNATURE PIN. The control tripwire for the null-actor
  --     drift: the landed event wears the agent's name.
  ------------------------------------------------------------------------
  select actor_id, actor_label into v_uuid, v_text
    from public.activity_events where event_type = 'intake_analyzed';
  if v_uuid is null or v_uuid is distinct from v_int then
    raise exception 'INVARIANT-FAIL (2): the intake event''s actor is % — the agent''s act landed wearing the system''s blank face', coalesce(v_uuid::text, 'NULL');
  end if;
  if v_text is distinct from 'Intake Agent' then
    raise exception 'INVARIANT-FAIL (2): the actor label is %, not the agent''s name', v_text;
  end if;
  execute 'set local role authenticated';

  ------------------------------------------------------------------------
  -- (3) The vocabulary's history is intact at fourteen — by COUNT.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_int, 'role', 'authenticated')::text, true);

  for v_type in
    select unnest(array['feedback_interpreted', 'candidates_ranked',
                        'candidate_parsed', 'candidate_evaluated',
                        'candidate_positioned', 'candidate_researched',
                        'candidate_triangulated', 'candidate_profiled',
                        'desk_digest_generated', 'company_researched',
                        'hm_researched', 'culture_profiled',
                        'sourcing_queries_generated', 'intake_analyzed'])
  loop
    begin
      perform public.record_agent_event(
        v_type, v_project, null,
        jsonb_build_object('probe', 'history-intact'));
    exception when others then
      raise exception 'INVARIANT-FAIL (3): the vocabulary lost a prior slice''s event type (% refused: %)',
        v_type, sqlerrm;
    end;
  end loop;

  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  select count(*) into v_count from public.activity_events
   where detail->>'probe' = 'history-intact';
  if v_count <> 14 then
    raise exception 'INVARIANT-FAIL (3): % of 14 history probes landed — the vocabulary lost a prior slice''s event type SILENTLY (write_activity_event swallows the CHECK violation by 053''s design)', v_count;
  end if;
  execute 'set local role authenticated';

  ------------------------------------------------------------------------
  -- (4) The negative matrix, UNCHANGED — the clients registry
  --     refused in BOTH shapes — plus forgery and unknown-type.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_int, 'role', 'authenticated')::text, true);

  select count(*) into v_count from public.clients;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (4): the agent reads % clients rows', v_count;
  end if;

  -- The RPC shape: resolve_client is SECURITY INVOKER, so RLS
  -- answers. An agent must not be able to give birth to a client row.
  v_uuid := null;
  begin
    select public.resolve_client(v_org, 'Agent Probe Client', v_int) into v_uuid;
  exception when others then null; end;
  if v_uuid is not null then
    raise exception 'INVARIANT-FAIL (4): resolve_client returned % to an agent — a client row was born of an agent session', v_uuid;
  end if;

  select count(*) into v_count from public.placements;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (4): the agent reads % placements rows', v_count;
  end if;

  select count(*) into v_count from public.organizations;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (4): the agent reads % organizations rows', v_count;
  end if;

  select count(*) into v_count from public.activity_events;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (4): the agent reads % activity_events rows', v_count;
  end if;

  select count(*) into v_count from public.desk_digests;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (4): the agent reads % desk_digests rows', v_count;
  end if;

  select count(*), count(*) filter (where id = v_int)
    into v_count, v_count2 from public.users;
  if v_count <> 1 or v_count2 <> 1 then
    raise exception 'INVARIANT-FAIL (4): the agent reads % users rows (self: %)', v_count, v_count2;
  end if;

  select count(*) into v_count from public.portal_context();
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (4): portal_context answered the agent (% rows)', v_count;
  end if;

  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  select count(*) into v_count from public.clients where name = 'Agent Probe Client';
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (4): a client row was born of the agent''s RPC probe';
  end if;
  execute 'set local role authenticated';

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_recruiter, 'role', 'authenticated')::text, true);

  v_raised := false;
  begin
    perform public.record_agent_event('intake_analyzed');
  exception when insufficient_privilege then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (4): a recruiter recorded intake_analyzed through the agent door';
  end if;

  v_raised := false;
  begin
    perform public.record_activity_event('intake_analyzed');
  exception when others then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (4): a recruiter recorded intake_analyzed through the human door';
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_int, 'role', 'authenticated')::text, true);
  v_raised := false;
  begin
    perform public.record_agent_event('mandate_hallucinated');
  exception when others then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (4): the agent recorded an unknown event type';
  end if;

  ------------------------------------------------------------------------
  -- (5) Kill switches independent at thirteen — and the suspended
  --     agent reads zero.
  ------------------------------------------------------------------------
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  update public.users set status = 'suspended' where id = v_int;
  execute 'set local role authenticated';

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_int, 'role', 'authenticated')::text, true);

  select count(*) into v_count from public.projects;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (5): the SUSPENDED agent still reads % projects rows — the is_agent() status gate has regressed', v_count;
  end if;

  update public.projects set title = 'suspended rewrite' where id = v_project;

  v_raised := false;
  begin
    perform public.record_agent_event('intake_analyzed');
  exception when insufficient_privilege then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (5): the suspended agent recorded an event';
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_boo, 'role', 'authenticated')::text, true);
  perform public.record_agent_event(
    'sourcing_queries_generated', v_project, null,
    jsonb_build_object('agent_kind', 'boolean_search', 'probe', 'thirteen-way-independence'));

  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);

  select title into v_text from public.projects where id = v_project;
  if v_text is distinct from 'CTO Search' then
    raise exception 'INVARIANT-FAIL (5): the suspended agent''s UPDATE landed (%)', v_text;
  end if;

  select count(*) into v_count from public.activity_events
   where event_type = 'sourcing_queries_generated' and actor_id = v_boo
     and detail->>'probe' = 'thirteen-way-independence';
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL (5): the Boolean Search Agent''s event did not land with the Intake Agent down';
  end if;
  update public.users set status = 'active' where id = v_int;

  raise notice 'ALL AGENT-INTAKE INVARIANTS PASSED';
end
$checks$;

rollback;
