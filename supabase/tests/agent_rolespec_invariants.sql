-- Agent-rolespec invariants (migration 092: the sixteenth agent
-- principal — the first NEW-GRANT conversion since 087, and the
-- first grant double-pinned on a row's editorial state).
--
-- Rolled back; forged-JWT assertions per the house pattern. 074 pins
-- the role, 085 the job_specs read; 092 mints the UPDATE this file
-- pins:
--
--    1. The judgment lands on the HUMAN's placeholder: content_json,
--       is_generating false, generation_error null — with the
--       allocation surviving (version, created_by = the recruiter).
--       The event carries trigger/version/sections COUNT; the
--       spec's text is provably absent from the trail.
--    2. Attribution pins: the event wears the agent's id and label.
--    3. History intact at EIGHTEEN by COUNT (§42 doctrine).
--    4. THE IS_FINAL PIN, BOTH DIRECTIONS — this slice's control
--       tripwire: the agent's UPDATE against a FINALIZED spec lands
--       on zero rows (USING), and an UPDATE that would SET
--       is_final = true is REFUSED (WITH CHECK) — the canonical
--       version can neither be touched nor authored by an agent.
--       Plus: agent INSERT refused (no policy); the negative matrix
--       unchanged (clients / organizations / activity_events zero,
--       users self-only); the recruiter refused at the agent door;
--       an unknown type refused by name.
--    5. Kill switches independent at SIXTEEN — the suspended Role
--       Spec Agent reads zero job_specs, lands nothing, is refused
--       at the trail door, while the Calibration Agent's event still
--       lands.
--
-- On success: NOTICE 'ALL AGENT-ROLESPEC INVARIANTS PASSED'.
--
-- Control run (2026-08-24, verified): job_specs_agent_update REBUILT
-- with the WITH CHECK is_final conjunct dropped ("USING already
-- refuses finalized rows") — the agent FINALIZED a draft spec and
-- the harness aborted at INVARIANT-FAIL (4); drift and harness in
-- ONE transaction, the abort rolling the rebuild back — residue-free
-- by construction. The first control run to regress an EDITORIAL
-- boundary: the two conjuncts guard different faces, and dropping
-- either is the drift.

begin;

insert into public.organizations (id, name, slug) values
  ('09200000-0000-4000-8000-0000000000a0', 'RS Org A', 'rs-org-a');

insert into auth.users (id, email) values
  ('09200000-0000-4000-8000-0000000000a2', 'rs-recruiter@test.local'),
  ('09200000-0000-4000-8000-0000000000aa', 'rs-calibration@test.local'),
  ('09200000-0000-4000-8000-0000000000ab', 'rs-rolespec@test.local');

update public.users set organization_id = '09200000-0000-4000-8000-0000000000a0',
       status = 'active', role = 'recruiter', full_name = 'RS Recruiter'
 where id = '09200000-0000-4000-8000-0000000000a2';
update public.users set organization_id = '09200000-0000-4000-8000-0000000000a0',
       status = 'active', role = 'agent', full_name = 'Calibration Agent'
 where id = '09200000-0000-4000-8000-0000000000aa';
update public.users set organization_id = '09200000-0000-4000-8000-0000000000a0',
       status = 'active', role = 'agent', full_name = 'Role Spec Agent'
 where id = '09200000-0000-4000-8000-0000000000ab';

insert into public.projects (id, organization_id, created_by, title, company_name, one_line_input, calibration_model, company_context) values
  ('09200000-0000-4000-8000-00000000aa01', '09200000-0000-4000-8000-0000000000a0',
   '09200000-0000-4000-8000-0000000000a2',
   'CTO Search', 'Acme Robotics', 'CTO for Acme Robotics (harness)',
   '{"role_title": "CTO", "dimension_weights": {"technical": 8}}'::jsonb,
   '{"company_name": "Acme Robotics"}'::jsonb);

-- The HUMAN's acts: the in-flight placeholder (version 2) and the
-- FINALIZED canonical spec (version 1).
insert into public.job_specs (id, project_id, organization_id, version, content, content_json, is_final, is_generating, created_by) values
  ('09200000-0000-4000-8000-00000000bb01', '09200000-0000-4000-8000-00000000aa01',
   '09200000-0000-4000-8000-0000000000a0', 1,
   'FINAL: the canonical spec (harness)', '{"overview": "canonical"}'::jsonb,
   true, false, '09200000-0000-4000-8000-0000000000a2'),
  ('09200000-0000-4000-8000-00000000bb02', '09200000-0000-4000-8000-00000000aa01',
   '09200000-0000-4000-8000-0000000000a0', 2,
   '', '{}'::jsonb,
   false, true, '09200000-0000-4000-8000-0000000000a2');

do $checks$
declare
  v_recruiter  uuid := '09200000-0000-4000-8000-0000000000a2';
  v_calagent   uuid := '09200000-0000-4000-8000-0000000000aa';
  v_rs         uuid := '09200000-0000-4000-8000-0000000000ab';
  v_org        uuid := '09200000-0000-4000-8000-0000000000a0';
  v_project    uuid := '09200000-0000-4000-8000-00000000aa01';
  v_final_spec uuid := '09200000-0000-4000-8000-00000000bb01';
  v_draft_spec uuid := '09200000-0000-4000-8000-00000000bb02';
  v_count      int;
  v_count2     int;
  v_raised     boolean;
  v_text       text;
  v_uuid       uuid;
  v_jsonb      jsonb;
  v_type       text;
  v_bool       boolean;
begin
  execute 'set local role authenticated';

  ------------------------------------------------------------------------
  -- (1) The judgment lands on the placeholder; the allocation survives.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_rs, 'role', 'authenticated')::text, true);

  update public.job_specs
     set content = 'Drafted: zephyrwright overview (harness)',
         content_json = '{"overview": "zephyrwright overview", "responsibilities": "build"}'::jsonb,
         is_generating = false,
         generation_error = null
   where id = v_draft_spec;

  perform public.record_agent_event(
    'job_spec_generated', v_project, null,
    jsonb_build_object('agent_kind', 'rolespec', 'trigger', 'regenerate',
                       'version', 2, 'sections', 2));

  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);

  select content_json->>'overview', is_generating, version, created_by
    into v_text, v_bool, v_count, v_uuid
    from public.job_specs where id = v_draft_spec;
  if v_text is distinct from 'zephyrwright overview' or v_bool then
    raise exception 'INVARIANT-FAIL (1): the agent''s judgment did not land (overview %, generating %)', v_text, v_bool;
  end if;
  if v_count <> 2 or v_uuid is distinct from v_recruiter then
    raise exception 'INVARIANT-FAIL (1): the HUMAN''s allocation was disturbed (version %, created_by %)', v_count, v_uuid;
  end if;

  select count(*) into v_count from public.activity_events
   where event_type = 'job_spec_generated' and detail::text like '%zephyrwright%';
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (1): the spec''s text rode the trail';
  end if;
  select detail into v_jsonb from public.activity_events
   where event_type = 'job_spec_generated';
  if v_jsonb->>'version' is distinct from '2'
     or v_jsonb->>'trigger' is distinct from 'regenerate' then
    raise exception 'INVARIANT-FAIL (1): the event detail is wrong (%)', v_jsonb;
  end if;

  ------------------------------------------------------------------------
  -- (2) Attribution pins.
  ------------------------------------------------------------------------
  select actor_id, actor_label into v_uuid, v_text
    from public.activity_events where event_type = 'job_spec_generated';
  if v_uuid is null or v_uuid is distinct from v_rs then
    raise exception 'INVARIANT-FAIL (2): the event''s actor is % — the act wears the system''s blank face', coalesce(v_uuid::text, 'NULL');
  end if;
  if v_text is distinct from 'Role Spec Agent' then
    raise exception 'INVARIANT-FAIL (2): the actor label is %, not the agent''s name', v_text;
  end if;
  execute 'set local role authenticated';

  ------------------------------------------------------------------------
  -- (3) The vocabulary's history is intact at EIGHTEEN — by COUNT.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_rs, 'role', 'authenticated')::text, true);

  for v_type in
    select unnest(array['feedback_interpreted', 'candidates_ranked',
                        'candidate_parsed', 'candidate_evaluated',
                        'candidate_positioned', 'candidate_researched',
                        'candidate_triangulated', 'candidate_profiled',
                        'desk_digest_generated', 'company_researched',
                        'hm_researched', 'culture_profiled',
                        'sourcing_queries_generated', 'intake_analyzed',
                        'health_suggested', 'weekly_report_generated',
                        'calibration_derived', 'job_spec_generated'])
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
  if v_count <> 18 then
    raise exception 'INVARIANT-FAIL (3): % of 18 history probes landed — the vocabulary lost an event type SILENTLY', v_count;
  end if;
  execute 'set local role authenticated';

  ------------------------------------------------------------------------
  -- (4) THE IS_FINAL PIN, both directions — plus the negative matrix.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_rs, 'role', 'authenticated')::text, true);

  -- (4a) USING: the finalized spec cannot be touched.
  update public.job_specs
     set content = 'AGENT REWROTE THE CANON'
   where id = v_final_spec;

  -- (4b) WITH CHECK: the agent cannot finalize.
  v_raised := false;
  begin
    update public.job_specs set is_final = true where id = v_draft_spec;
  exception when others then v_raised := true; end;
  if not v_raised then
    -- If no error was raised, the WITH CHECK either refused silently
    -- (0 rows: fine, verified below) or the finalize LANDED (drift).
    null;
  end if;

  -- (4c) INSERT refused: the versioned allocation is the human's.
  v_raised := false;
  begin
    insert into public.job_specs (project_id, organization_id, version, content, content_json)
    values (v_project, v_org, 99, 'agent insert', '{}'::jsonb);
  exception when others then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (4): the agent INSERTED a job_specs row';
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
  select count(*), count(*) filter (where id = v_rs)
    into v_count, v_count2 from public.users;
  if v_count <> 1 or v_count2 <> 1 then
    raise exception 'INVARIANT-FAIL (4): the agent reads % users rows (self: %)', v_count, v_count2;
  end if;

  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);

  select content, is_final into v_text, v_bool
    from public.job_specs where id = v_final_spec;
  if v_text is distinct from 'FINAL: the canonical spec (harness)' then
    raise exception 'INVARIANT-FAIL (4): the agent TOUCHED the finalized spec (%)', v_text;
  end if;
  select is_final into v_bool from public.job_specs where id = v_draft_spec;
  if v_bool then
    raise exception 'INVARIANT-FAIL (4): the agent FINALIZED a draft — the canonical version was authored by an agent';
  end if;
  execute 'set local role authenticated';

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_recruiter, 'role', 'authenticated')::text, true);
  v_raised := false;
  begin
    perform public.record_agent_event('job_spec_generated');
  exception when insufficient_privilege then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (4): a recruiter recorded job_spec_generated through the agent door';
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_rs, 'role', 'authenticated')::text, true);
  v_raised := false;
  begin
    perform public.record_agent_event('spec_hallucinated');
  exception when others then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (4): the agent recorded an unknown event type';
  end if;

  ------------------------------------------------------------------------
  -- (5) Kill switches independent at SIXTEEN.
  ------------------------------------------------------------------------
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  update public.users set status = 'suspended' where id = v_rs;
  execute 'set local role authenticated';

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_rs, 'role', 'authenticated')::text, true);

  select count(*) into v_count from public.job_specs;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (5): the SUSPENDED agent still reads % job_specs rows', v_count;
  end if;

  update public.job_specs set content = 'suspended rewrite' where id = v_draft_spec;

  v_raised := false;
  begin
    perform public.record_agent_event('job_spec_generated');
  exception when insufficient_privilege then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (5): the suspended agent recorded an event';
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_calagent, 'role', 'authenticated')::text, true);
  perform public.record_agent_event(
    'calibration_derived', v_project, null,
    jsonb_build_object('agent_kind', 'calibration', 'probe', 'sixteen-way-independence'));

  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);

  select content into v_text from public.job_specs where id = v_draft_spec;
  if v_text is distinct from 'Drafted: zephyrwright overview (harness)' then
    raise exception 'INVARIANT-FAIL (5): the suspended agent''s UPDATE landed (%)', v_text;
  end if;

  select count(*) into v_count from public.activity_events
   where event_type = 'calibration_derived' and actor_id = v_calagent
     and detail->>'probe' = 'sixteen-way-independence';
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL (5): the Calibration Agent''s event did not land with the Role Spec Agent down';
  end if;
  update public.users set status = 'active' where id = v_rs;

  raise notice 'ALL AGENT-ROLESPEC INVARIANTS PASSED';
end
$checks$;

rollback;
