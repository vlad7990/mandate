-- Skills-Studio invariants (migration 102: the skill-change
-- vocabulary — five HUMAN event types, admin-gated at the intent
-- door; the agent allowlist untouched at twenty-nine).
--
-- Rolled back; forged-JWT assertions per the house pattern:
--
--    1. The ADMIN records all five skill acts through
--       record_activity_event — actor stamped, count exact (the §42
--       tripwire: the count, not the exception, is what trips), the
--       skill's NAME in detail and nothing instruction-shaped.
--    2. The doors refuse everyone else BY NAME: a RECRUITER refused
--       the skill family (insufficient_privilege); an AGENT refused
--       at the human intent door (not admin) AND at its own door
--       (skill types are not agent-recordable); an unknown type
--       still refused outright.
--    3. The agent's history intact at TWENTY-NINE by COUNT — 102
--       touched the human door, not the agent one.
--
-- On success: NOTICE 'ALL SKILLS-STUDIO INVARIANTS PASSED'.
--
-- Control run (2026-08-25): the CHECK rebuilt WITHOUT the skill
-- family ("the RPC allowlist already gates the types") — the
-- admin's skill_created VANISHED SILENTLY (write_activity_event
-- never raises, 053) and the harness aborted on the COUNT at
-- INVARIANT-FAIL (1); drift and harness in ONE transaction, the
-- abort rolling the rebuild back. The §42 doctrine's control shape.

begin;

insert into public.organizations (id, name, slug) values
  ('01020000-0000-4000-8000-0000000000a0', 'SK Org A', 'sk-org-a');

insert into auth.users (id, email) values
  ('01020000-0000-4000-8000-0000000000a1', 'sk-admin@test.local'),
  ('01020000-0000-4000-8000-0000000000a2', 'sk-recruiter@test.local'),
  ('01020000-0000-4000-8000-0000000000ab', 'sk-agent@test.local');

update public.users set organization_id = '01020000-0000-4000-8000-0000000000a0',
       status = 'active', role = 'admin', full_name = 'SK Admin'
 where id = '01020000-0000-4000-8000-0000000000a1';
update public.users set organization_id = '01020000-0000-4000-8000-0000000000a0',
       status = 'active', role = 'recruiter', full_name = 'SK Recruiter'
 where id = '01020000-0000-4000-8000-0000000000a2';
update public.users set organization_id = '01020000-0000-4000-8000-0000000000a0',
       status = 'active', role = 'agent', full_name = 'SK Agent'
 where id = '01020000-0000-4000-8000-0000000000ab';

do $checks$
declare
  v_admin     uuid := '01020000-0000-4000-8000-0000000000a1';
  v_recruiter uuid := '01020000-0000-4000-8000-0000000000a2';
  v_agent     uuid := '01020000-0000-4000-8000-0000000000ab';
  v_count     int;
  v_raised    boolean;
  v_text      text;
  v_uuid      uuid;
  v_type      text;
begin
  execute 'set local role authenticated';

  ------------------------------------------------------------------------
  -- (1) The admin's five acts land, attributed, counted, name-only.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  for v_type in
    select unnest(array['skill_created', 'skill_updated', 'skill_paused',
                        'skill_activated', 'skill_deleted'])
  loop
    perform public.record_activity_event(
      v_type, null, null, null,
      jsonb_build_object('skill', 'Harness Steering Rule',
                         'skill_type', 'search_skill', 'probe', 'sk-102'));
  end loop;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);

  select count(*) into v_count from public.activity_events
   where detail->>'probe' = 'sk-102';
  if v_count <> 5 then
    raise exception 'INVARIANT-FAIL (1): % of 5 skill events landed — a type vanished SILENTLY', v_count;
  end if;
  select actor_id, actor_label into v_uuid, v_text
    from public.activity_events where event_type = 'skill_created'
     and detail->>'probe' = 'sk-102';
  if v_uuid is distinct from v_admin or v_text is distinct from 'SK Admin' then
    raise exception 'INVARIANT-FAIL (1): the skill event wears the wrong face (% / %)', v_uuid, v_text;
  end if;
  execute 'set local role authenticated';

  ------------------------------------------------------------------------
  -- (2) The doors refuse everyone else by name.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_recruiter, 'role', 'authenticated')::text, true);
  v_raised := false;
  begin
    perform public.record_activity_event('skill_updated');
  exception when insufficient_privilege then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (2): a RECRUITER recorded a skill event';
  end if;
  -- The recruiter's existing intent door is untouched.
  perform public.record_activity_event(
    'mandate_reassigned', null, null, null,
    jsonb_build_object('probe', 'sk-102-intent'));

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_agent, 'role', 'authenticated')::text, true);
  v_raised := false;
  begin
    perform public.record_activity_event('skill_paused');
  exception when insufficient_privilege then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (2): an AGENT recorded a skill event at the human door';
  end if;
  v_raised := false;
  begin
    perform public.record_agent_event('skill_updated');
  exception when others then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (2): an AGENT recorded a skill event at its own door';
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  v_raised := false;
  begin
    perform public.record_activity_event('skill_hallucinated');
  exception when others then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (2): an unknown type passed the intent door';
  end if;

  ------------------------------------------------------------------------
  -- (3) The agent's history intact at TWENTY-NINE — by COUNT.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_agent, 'role', 'authenticated')::text, true);
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

  raise notice 'ALL SKILLS-STUDIO INVARIANTS PASSED';
end
$checks$;

rollback;
