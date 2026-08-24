-- Agent-calibration invariants (migration 091: the fifteenth agent
-- principal — the fourth zero-new-grant conversion; vocabulary only).
--
-- Rolled back; forged-JWT assertions per the house pattern. 074 pins
-- the role and the pool this slice reuses (projects S+U,
-- calibration_history INSERT, skills S); this file pins the
-- fifteenth:
--
--    1. The SPLIT lands honestly: the recruiter's own act stores
--       onboarding_responses; the agent's merge-write carries ONLY
--       dimension_weights + weights_rationale — the human's answers
--       AND the sibling calibration keys (role_title) survive
--       untouched. The event detail carries COUNTS; the answers'
--       TEXT is provably absent from the trail.
--    2. THE SNAPSHOT PIN — this slice's control tripwire: the
--       calibration_history row born of the agent's session carries
--       changed_by = the agent, and the calibration_derived event
--       wears the agent's name and label. Derived weights must be
--       attributable forever (the §30 interpreter precedent).
--    3. The vocabulary's history intact at SEVENTEEN — by COUNT
--       (§42 doctrine: write_activity_event swallows CHECK
--       violations by 053's design; the count, not the exception,
--       is the tripwire).
--    4. The fifteenth principal's negative matrix — UNCHANGED:
--       clients, placements, organizations, activity_events,
--       desk_digests all zero; users self-only; portal_context
--       empty; resolve_client births nothing; the recruiter refused
--       at BOTH trail doors; an unknown type refused by name.
--    5. Kill switches independent at FIFTEEN — the suspended
--       Calibration Agent reads zero, lands nothing, is refused at
--       the trail door, while the interpreter's event still lands.
--
-- On success: NOTICE 'ALL AGENT-CALIBRATION INVARIANTS PASSED'.
--
-- Control run (2026-08-24, verified): record_agent_event REBUILT
-- with 'calibration_derived' trimmed from the allowlist ("the type
-- is new, nobody records it yet") — the seventeen-probe loop aborted
-- at INVARIANT-FAIL (3); drift and harness ran in ONE transaction,
-- the abort rolling the trim back — residue-free by construction.

begin;

insert into public.organizations (id, name, slug) values
  ('09100000-0000-4000-8000-0000000000a0', 'Cal Org A', 'cal-org-a');

insert into auth.users (id, email) values
  ('09100000-0000-4000-8000-0000000000a2', 'cal-recruiter@test.local'),
  ('09100000-0000-4000-8000-0000000000aa', 'cal-interpreter@test.local'),
  ('09100000-0000-4000-8000-0000000000ab', 'cal-calibration@test.local');

update public.users set organization_id = '09100000-0000-4000-8000-0000000000a0',
       status = 'active', role = 'recruiter', full_name = 'Cal Recruiter'
 where id = '09100000-0000-4000-8000-0000000000a2';
update public.users set organization_id = '09100000-0000-4000-8000-0000000000a0',
       status = 'active', role = 'agent', full_name = 'Feedback Interpreter'
 where id = '09100000-0000-4000-8000-0000000000aa';
update public.users set organization_id = '09100000-0000-4000-8000-0000000000a0',
       status = 'active', role = 'agent', full_name = 'Calibration Agent'
 where id = '09100000-0000-4000-8000-0000000000ab';

-- The mandate as intake left it: analyzed (role_title present), no
-- weights yet, no onboarding answers yet.
insert into public.projects (id, organization_id, created_by, title, company_name, one_line_input, calibration_model, company_context) values
  ('09100000-0000-4000-8000-00000000aa01', '09100000-0000-4000-8000-0000000000a0',
   '09100000-0000-4000-8000-0000000000a2',
   'CTO Search', 'Acme Robotics', 'CTO for Acme Robotics (harness)',
   '{"role_title": "CTO", "role_structure": {"seniority": "C-level"}}'::jsonb,
   '{"company_name": "Acme Robotics"}'::jsonb);

do $checks$
declare
  v_recruiter  uuid := '09100000-0000-4000-8000-0000000000a2';
  v_intp       uuid := '09100000-0000-4000-8000-0000000000aa';
  v_cal        uuid := '09100000-0000-4000-8000-0000000000ab';
  v_org        uuid := '09100000-0000-4000-8000-0000000000a0';
  v_project    uuid := '09100000-0000-4000-8000-00000000aa01';
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
  -- (1) The split: the recruiter's answers, then the agent's weights;
  --     each signature honest, siblings surviving, counts not text.
  ------------------------------------------------------------------------
  -- The HUMAN half: the recruiter stores their own answers first.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_recruiter, 'role', 'authenticated')::text, true);
  update public.projects
     set onboarding_responses = '{"role_origin": "expansion",
       "must_haves": ["Distinctive zephyr-grade robotics scale-up experience"],
       "anti_patterns": ["Pure services background"],
       "stakeholders": [{"name": "Cal Probe HM", "role": "CEO", "focus": "Growth"}],
       "priority_signals": [{"name": "technical", "weight": 8}]}'::jsonb
   where id = v_project;

  -- The AGENT half: the judgment merge-writes ONLY the weights.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_cal, 'role', 'authenticated')::text, true);
  update public.projects
     set calibration_model = calibration_model ||
       '{"dimension_weights": {"technical": 8, "leadership": 6},
         "weights_rationale": "Weighted for scale-up depth (harness)"}'::jsonb
   where id = v_project;

  insert into public.calibration_history
    (project_id, organization_id, snapshot, change_type, change_reason, changed_by)
  values
    (v_project, v_org,
     '{"dimension_weights": {"technical": 8}}'::jsonb,
     'initial', 'Initial calibration from onboarding', v_cal);

  perform public.record_agent_event(
    'calibration_derived', v_project, null,
    jsonb_build_object('agent_kind', 'calibration', 'trigger', 'initial',
                       'must_haves', 1, 'anti_patterns', 1,
                       'stakeholders', 1, 'priority_signals', 1));

  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);

  select calibration_model->>'role_title',
         calibration_model->'dimension_weights'->>'technical',
         onboarding_responses->'must_haves'->>0
    into v_text, v_type, v_jsonb
    from public.projects where id = v_project;
  if v_type is distinct from '8' then
    raise exception 'INVARIANT-FAIL (1): the agent''s weights did not land (%)', v_type;
  end if;
  if v_text is distinct from 'CTO' then
    raise exception 'INVARIANT-FAIL (1): the sibling calibration key role_title was disturbed (%)', v_text;
  end if;
  select onboarding_responses->'must_haves'->>0 into v_text
    from public.projects where id = v_project;
  if v_text not like 'Distinctive zephyr-grade%' then
    raise exception 'INVARIANT-FAIL (1): the HUMAN''s answers were disturbed (%)', v_text;
  end if;

  select count(*) into v_count from public.activity_events
   where event_type = 'calibration_derived' and detail::text like '%zephyr-grade%';
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (1): the answers'' text rode the trail';
  end if;
  select detail into v_jsonb from public.activity_events
   where event_type = 'calibration_derived';
  if v_jsonb->>'must_haves' is distinct from '1'
     or v_jsonb->>'trigger' is distinct from 'initial' then
    raise exception 'INVARIANT-FAIL (1): the event detail is wrong (%)', v_jsonb;
  end if;

  ------------------------------------------------------------------------
  -- (2) THE SNAPSHOT PIN: derived weights are attributable forever.
  ------------------------------------------------------------------------
  select changed_by into v_uuid from public.calibration_history
   where project_id = v_project and change_type = 'initial';
  if v_uuid is null or v_uuid is distinct from v_cal then
    raise exception 'INVARIANT-FAIL (2): the snapshot''s changed_by is % — the agent''s derivation landed unattributed', coalesce(v_uuid::text, 'NULL');
  end if;

  select actor_id, actor_label into v_uuid, v_text
    from public.activity_events where event_type = 'calibration_derived';
  if v_uuid is null or v_uuid is distinct from v_cal then
    raise exception 'INVARIANT-FAIL (2): the calibration event''s actor is % — the act wears the system''s blank face', coalesce(v_uuid::text, 'NULL');
  end if;
  if v_text is distinct from 'Calibration Agent' then
    raise exception 'INVARIANT-FAIL (2): the actor label is %, not the agent''s name', v_text;
  end if;
  execute 'set local role authenticated';

  ------------------------------------------------------------------------
  -- (3) The vocabulary's history is intact at SEVENTEEN — by COUNT.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_cal, 'role', 'authenticated')::text, true);

  for v_type in
    select unnest(array['feedback_interpreted', 'candidates_ranked',
                        'candidate_parsed', 'candidate_evaluated',
                        'candidate_positioned', 'candidate_researched',
                        'candidate_triangulated', 'candidate_profiled',
                        'desk_digest_generated', 'company_researched',
                        'hm_researched', 'culture_profiled',
                        'sourcing_queries_generated', 'intake_analyzed',
                        'health_suggested', 'weekly_report_generated',
                        'calibration_derived'])
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
  if v_count <> 17 then
    raise exception 'INVARIANT-FAIL (3): % of 17 history probes landed — the vocabulary lost an event type SILENTLY (053 swallows CHECK violations by design)', v_count;
  end if;
  execute 'set local role authenticated';

  ------------------------------------------------------------------------
  -- (4) The negative matrix, UNCHANGED.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_cal, 'role', 'authenticated')::text, true);

  select count(*) into v_count from public.clients;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (4): the agent reads % clients rows', v_count;
  end if;

  v_uuid := null;
  begin
    select public.resolve_client(v_org, 'Cal Probe Client', v_cal) into v_uuid;
  exception when others then null; end;
  if v_uuid is not null then
    raise exception 'INVARIANT-FAIL (4): resolve_client returned % to an agent', v_uuid;
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

  select count(*), count(*) filter (where id = v_cal)
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
  select count(*) into v_count from public.clients where name = 'Cal Probe Client';
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (4): a client row was born of the agent''s RPC probe';
  end if;
  execute 'set local role authenticated';

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_recruiter, 'role', 'authenticated')::text, true);

  v_raised := false;
  begin
    perform public.record_agent_event('calibration_derived');
  exception when insufficient_privilege then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (4): a recruiter recorded calibration_derived through the agent door';
  end if;

  v_raised := false;
  begin
    perform public.record_activity_event('calibration_derived');
  exception when others then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (4): a recruiter recorded calibration_derived through the human door';
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_cal, 'role', 'authenticated')::text, true);
  v_raised := false;
  begin
    perform public.record_agent_event('weights_hallucinated');
  exception when others then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (4): the agent recorded an unknown event type';
  end if;

  ------------------------------------------------------------------------
  -- (5) Kill switches independent at FIFTEEN.
  ------------------------------------------------------------------------
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  update public.users set status = 'suspended' where id = v_cal;
  execute 'set local role authenticated';

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_cal, 'role', 'authenticated')::text, true);

  select count(*) into v_count from public.projects;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (5): the SUSPENDED agent still reads % projects rows', v_count;
  end if;

  update public.projects
     set calibration_model = calibration_model || '{"dimension_weights": {"technical": 1}}'::jsonb
   where id = v_project;

  v_raised := false;
  begin
    perform public.record_agent_event('calibration_derived');
  exception when insufficient_privilege then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (5): the suspended agent recorded an event';
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_intp, 'role', 'authenticated')::text, true);
  perform public.record_agent_event(
    'feedback_interpreted', v_project, null,
    jsonb_build_object('agent_kind', 'feedback_interpreter', 'probe', 'fifteen-way-independence'));

  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);

  select calibration_model->'dimension_weights'->>'technical' into v_text
    from public.projects where id = v_project;
  if v_text is distinct from '8' then
    raise exception 'INVARIANT-FAIL (5): the suspended agent''s UPDATE landed (technical = %)', v_text;
  end if;

  select count(*) into v_count from public.activity_events
   where event_type = 'feedback_interpreted' and actor_id = v_intp
     and detail->>'probe' = 'fifteen-way-independence';
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL (5): the interpreter''s event did not land with the Calibration Agent down';
  end if;
  update public.users set status = 'active' where id = v_cal;

  raise notice 'ALL AGENT-CALIBRATION INVARIANTS PASSED';
end
$checks$;

rollback;
