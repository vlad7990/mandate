-- Agent-search invariants (migration 096: the twentieth agent
-- principal — the SIXTH zero-new-grant conversion; 096 is vocabulary
-- only, and the pool-search judgment's whole reach is the POOL).
--
-- Rolled back; forged-JWT assertions per the house pattern. 074 pins
-- the role and the pool. This file pins:
--
--    1. READ COVERAGE — the seam's every source visible to the agent
--       BY COUNT on harness ids (§35: never the durable set): the
--       candidates (2), the scores (2), the project row, and the
--       SKILLS read (1 active harness skill through the injector's
--       exact query shape — D6 is the slice's point, so its read is
--       the coverage pin's subject).
--    2. The act + attribution, BOTH types: candidate_search_answered
--       lands with COUNTS (pool/filtered/matches/filter booleans)
--       under the agent's id and label, and a text-probe proves no
--       query text rode the trail; sourcing_search_executed (minted
--       AHEAD of its channel, D8) lands with rounds + domain COUNT.
--    3. History intact at TWENTY-FIVE by COUNT (§42 doctrine).
--    4. The negative matrix: candidates INSERT refused (the pool has
--       no agent door into the pool's tables — S and U only); clients
--       / organizations / activity_events zero; users self-only; the
--       recruiter refused at the agent door; an unknown type refused
--       by name.
--    5. Kill switches independent at TWENTY — the suspended Candidate
--       Search Agent reads zero candidates / projects / skills and is
--       refused at the trail door, while the Copilot Agent's event
--       still lands.
--
-- On success: NOTICE 'ALL AGENT-SEARCH INVARIANTS PASSED'.
--
-- Control run (2026-08-24, verified): the 091 drift class — the
-- allowlist TRIMMED `candidate_search_answered` in the harness
-- transaction ("the type is new, nobody records it yet") — invariant
-- (2)'s record refused by name, the harness aborted at
-- INVARIANT-FAIL (2), drift and harness in ONE transaction, the
-- abort rolling the trim back — residue-free by construction.

begin;

insert into public.organizations (id, name, slug) values
  ('09600000-0000-4000-8000-0000000000a0', 'CS Org A', 'cs-org-a');

insert into auth.users (id, email) values
  ('09600000-0000-4000-8000-0000000000a2', 'cs-recruiter@test.local'),
  ('09600000-0000-4000-8000-0000000000aa', 'cs-copilot@test.local'),
  ('09600000-0000-4000-8000-0000000000ab', 'cs-search@test.local');

update public.users set organization_id = '09600000-0000-4000-8000-0000000000a0',
       status = 'active', role = 'recruiter', full_name = 'CS Recruiter'
 where id = '09600000-0000-4000-8000-0000000000a2';
update public.users set organization_id = '09600000-0000-4000-8000-0000000000a0',
       status = 'active', role = 'agent', full_name = 'Copilot Agent'
 where id = '09600000-0000-4000-8000-0000000000aa';
update public.users set organization_id = '09600000-0000-4000-8000-0000000000a0',
       status = 'active', role = 'agent', full_name = 'Candidate Search Agent'
 where id = '09600000-0000-4000-8000-0000000000ab';

insert into public.projects (id, organization_id, created_by, title, company_name, one_line_input) values
  ('09600000-0000-4000-8000-00000000aa01', '09600000-0000-4000-8000-0000000000a0',
   '09600000-0000-4000-8000-0000000000a2',
   'COO Search', 'Acme Robotics', 'COO for Acme Robotics (harness)');

insert into public.candidates (id, organization_id, project_id, full_name, pipeline_stage, cv_structured) values
  ('09600000-0000-4000-8000-00000000cc01', '09600000-0000-4000-8000-0000000000a0',
   '09600000-0000-4000-8000-00000000aa01', 'Harmon Vale', 'matched',
   '{"summary": "ops leader (harness)"}'::jsonb),
  ('09600000-0000-4000-8000-00000000cc02', '09600000-0000-4000-8000-0000000000a0',
   '09600000-0000-4000-8000-00000000aa01', 'Iris Coldwater', 'matched',
   '{"summary": "supply-chain leader (harness)"}'::jsonb);

insert into public.candidate_scores (candidate_id, project_id, organization_id, technical_score, domain_score, leadership_score, regulatory_score, transformation_score, overall_score, tier, rank_position) values
  ('09600000-0000-4000-8000-00000000cc01', '09600000-0000-4000-8000-00000000aa01',
   '09600000-0000-4000-8000-0000000000a0', 6, 7, 9, 4, 6, 7.4, 'tier_1', 1),
  ('09600000-0000-4000-8000-00000000cc02', '09600000-0000-4000-8000-00000000aa01',
   '09600000-0000-4000-8000-0000000000a0', 5, 8, 7, 5, 7, 6.9, 'tier_2', 2);

-- The skill the injector reads (074's skills S, reused by the pool) —
-- D6's coverage pin: this slice exists so this read reaches the seam.
insert into public.skills (id, organization_id, created_by, name, skill_type, instructions, is_active) values
  ('09600000-0000-4000-8000-00000000dd01', '09600000-0000-4000-8000-0000000000a0',
   '09600000-0000-4000-8000-0000000000a2',
   'CS Harness Skill', 'search_skill', 'Prefer regulated-market operators (harness).', true);

do $checks$
declare
  v_recruiter uuid := '09600000-0000-4000-8000-0000000000a2';
  v_cpagent   uuid := '09600000-0000-4000-8000-0000000000aa';
  v_cs        uuid := '09600000-0000-4000-8000-0000000000ab';
  v_org       uuid := '09600000-0000-4000-8000-0000000000a0';
  v_project   uuid := '09600000-0000-4000-8000-00000000aa01';
  v_count     int;
  v_count2    int;
  v_raised    boolean;
  v_text      text;
  v_uuid      uuid;
  v_jsonb     jsonb;
  v_type      text;
begin
  execute 'set local role authenticated';

  ------------------------------------------------------------------------
  -- (1) READ COVERAGE — every seam source visible, by COUNT.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_cs, 'role', 'authenticated')::text, true);

  select count(*) into v_count from public.candidates;
  if v_count <> 2 then
    raise exception 'INVARIANT-FAIL (1): the agent reads % of 2 candidates — the haystack died silently', v_count;
  end if;
  select count(*) into v_count from public.candidate_scores;
  if v_count <> 2 then
    raise exception 'INVARIANT-FAIL (1): the agent reads % of 2 scores', v_count;
  end if;
  select count(*) into v_count from public.projects where id = v_project;
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL (1): the agent cannot read the project row';
  end if;
  -- The injector's exact shape: org + is_active.
  select count(*) into v_count from public.skills
   where organization_id = v_org and is_active = true;
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL (1): the agent reads % of 1 active skills — D6 died silently', v_count;
  end if;

  ------------------------------------------------------------------------
  -- (2) The act + attribution, BOTH types — counts, never text.
  ------------------------------------------------------------------------
  perform public.record_agent_event(
    'candidate_search_answered', null, null,
    jsonb_build_object('agent_kind', 'candidate_search', 'trigger', 'query',
                       'pool', 2, 'filtered', 2, 'matches', 1,
                       'project_filter', false, 'skills', 1));
  perform public.record_agent_event(
    'sourcing_search_executed', v_project, null,
    jsonb_build_object('agent_kind', 'candidate_search', 'trigger', 'run',
                       'search_rounds', 3, 'domains', 4, 'leads', 5));

  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);

  select actor_id, actor_label, detail into v_uuid, v_text, v_jsonb
    from public.activity_events where event_type = 'candidate_search_answered';
  if v_uuid is null or v_uuid is distinct from v_cs then
    raise exception 'INVARIANT-FAIL (2): the event''s actor is % — the act wears the system''s blank face', coalesce(v_uuid::text, 'NULL');
  end if;
  if v_text is distinct from 'Candidate Search Agent' then
    raise exception 'INVARIANT-FAIL (2): the actor label is %, not the agent''s name', v_text;
  end if;
  if v_jsonb->>'pool' is distinct from '2'
     or v_jsonb->>'matches' is distinct from '1' then
    raise exception 'INVARIANT-FAIL (2): the event detail is wrong (%)', v_jsonb;
  end if;
  select count(*) into v_count from public.activity_events
   where event_type in ('candidate_search_answered', 'sourcing_search_executed')
     and detail::text ~* 'harness|vale|coldwater|robotics|regulated';
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (2): query or pool text rode the trail';
  end if;
  select actor_id into v_uuid
    from public.activity_events where event_type = 'sourcing_search_executed';
  if v_uuid is distinct from v_cs then
    raise exception 'INVARIANT-FAIL (2): the minted-ahead type''s actor is %', coalesce(v_uuid::text, 'NULL');
  end if;
  execute 'set local role authenticated';

  ------------------------------------------------------------------------
  -- (3) The vocabulary's history is intact at TWENTY-FIVE — by COUNT.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_cs, 'role', 'authenticated')::text, true);

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
                        'candidate_search_answered', 'sourcing_search_executed'])
  loop
    begin
      perform public.record_agent_event(
        v_type, v_project, null,
        jsonb_build_object('probe', 'history-intact'));
    exception when others then
      raise exception 'INVARIANT-FAIL (3): the vocabulary lost an event type (% refused: %)',
        v_type, sqlerrm;
    end;
  end loop;

  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  select count(*) into v_count from public.activity_events
   where detail->>'probe' = 'history-intact';
  if v_count <> 25 then
    raise exception 'INVARIANT-FAIL (3): % of 25 history probes landed — the vocabulary lost an event type SILENTLY', v_count;
  end if;
  execute 'set local role authenticated';

  ------------------------------------------------------------------------
  -- (4) The negative matrix.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_cs, 'role', 'authenticated')::text, true);

  v_raised := false;
  begin
    insert into public.candidates (organization_id, project_id, full_name)
    values (v_org, v_project, 'Agent-Born Candidate');
  exception when others then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (4): the agent INSERTED a candidates row — the search may only look';
  end if;

  select count(*) into v_count from public.clients;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (4): the agent reads % clients rows', v_count;
  end if;
  select count(*) into v_count from public.organizations;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (4): the agent reads % organizations rows', v_count;
  end if;
  select count(*) into v_count from public.activity_events;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (4): the agent reads % activity_events rows', v_count;
  end if;
  select count(*), count(*) filter (where id = v_cs)
    into v_count, v_count2 from public.users;
  if v_count <> 1 or v_count2 <> 1 then
    raise exception 'INVARIANT-FAIL (4): the agent reads % users rows (self: %)', v_count, v_count2;
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_recruiter, 'role', 'authenticated')::text, true);
  v_raised := false;
  begin
    perform public.record_agent_event('candidate_search_answered');
  exception when insufficient_privilege then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (4): a recruiter recorded candidate_search_answered through the agent door';
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_cs, 'role', 'authenticated')::text, true);
  v_raised := false;
  begin
    perform public.record_agent_event('candidate_search_hallucinated');
  exception when others then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (4): the agent recorded an unknown event type';
  end if;

  ------------------------------------------------------------------------
  -- (5) Kill switches independent at TWENTY.
  ------------------------------------------------------------------------
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  update public.users set status = 'suspended' where id = v_cs;
  execute 'set local role authenticated';

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_cs, 'role', 'authenticated')::text, true);

  select count(*) into v_count from public.candidates;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (5): the SUSPENDED agent still reads % candidates', v_count;
  end if;
  select count(*) into v_count from public.projects;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (5): the SUSPENDED agent still reads % projects rows', v_count;
  end if;
  select count(*) into v_count from public.skills;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (5): the SUSPENDED agent still reads % skills rows', v_count;
  end if;

  v_raised := false;
  begin
    perform public.record_agent_event('candidate_search_answered');
  exception when insufficient_privilege then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (5): the suspended agent recorded an event';
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_cpagent, 'role', 'authenticated')::text, true);
  perform public.record_agent_event(
    'copilot_answered', v_project, null,
    jsonb_build_object('agent_kind', 'copilot', 'probe', 'twenty-way-independence'));

  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);

  select count(*) into v_count from public.activity_events
   where event_type = 'copilot_answered' and actor_id = v_cpagent
     and detail->>'probe' = 'twenty-way-independence';
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL (5): the Copilot Agent''s event did not land with the Candidate Search Agent down';
  end if;
  update public.users set status = 'active' where id = v_cs;

  raise notice 'ALL AGENT-SEARCH INVARIANTS PASSED';
end
$checks$;

rollback;
