-- Agent-company-intel invariants (migration 083: the tenth agent
-- principal — the first zero-new-grant slice; vocabulary only).
--
-- Rolled back; forged-JWT assertions per the house pattern. 074 pins
-- the role and the projects grants this slice REUSES, 075–082 pin the
-- second through ninth principals; this file pins the tenth:
--
--    1. The merge-write lands under the pool's existing projects
--       UPDATE: the agent writes company_context.intelligence_report
--       and .hm_intelligence, and every SIBLING KEY survives
--       byte-identical (the merge shape's honesty). Both event kinds
--       land with the Company Intelligence Agent as actor, the
--       trigger named, counts and booleans in detail — never names.
--    2. THE VOCABULARY BOUNDARY — THE control-run tripwire: a forged
--       event type is refused by the CHECK at the TABLE, the last
--       line behind every door. record_agent_event's allowlist
--       guards the agent door and 053's write_activity_event
--       swallows CHECK violations into warnings — so if the CHECK
--       itself is DROPPED ("the app allowlist already guards event
--       types; the constraint is redundant"), nonsense lands
--       SILENTLY. The direct-insert probe here is the only tripwire
--       that fires on that drift.
--    3. The vocabulary's history intact at eleven — by COUNT (§42
--       doctrine; under 053 a lost type VANISHES silently).
--    4. The tenth principal's negative matrix — UNCHANGED from every
--       slice before it: the roster beyond self, activity_events,
--       clients, placements, organizations, desk_digests all
--       refused. Plus the forgery boundary both directions and the
--       unknown-type refusal at the agent door.
--    5. Kill switches independent at ten — and the suspended agent
--       reads ZERO projects rows (the is_agent() status gate felt at
--       first touch).
--
-- On success: NOTICE 'ALL AGENT-COMPANYINTEL INVARIANTS PASSED'.
--
-- Control run (2026-08-21, verified): DROP CONSTRAINT
-- activity_events_type_known — the first control run that REMOVES a
-- boundary rather than widening, moving, or mis-rebuilding one. With
-- the CHECK gone the forged direct insert LANDED and the harness
-- aborted at INVARIANT-FAIL (2); drift and harness ran in one
-- transaction, so the abort itself rolled the drop back —
-- residue-free by construction, the constraint verified live after.

begin;

insert into public.organizations (id, name, slug) values
  ('08300000-0000-4000-8000-0000000000a0', 'CI Org A', 'ci-org-a');

insert into auth.users (id, email) values
  ('08300000-0000-4000-8000-0000000000a2', 'ci-recruiter@test.local'),
  ('08300000-0000-4000-8000-0000000000aa', 'ci-digest@test.local'),
  ('08300000-0000-4000-8000-0000000000ab', 'ci-companyintel@test.local');

update public.users set organization_id = '08300000-0000-4000-8000-0000000000a0',
       status = 'active', role = 'recruiter', full_name = 'CI Recruiter'
 where id = '08300000-0000-4000-8000-0000000000a2';
update public.users set organization_id = '08300000-0000-4000-8000-0000000000a0',
       status = 'active', role = 'agent', full_name = 'Desk Digest Agent'
 where id = '08300000-0000-4000-8000-0000000000aa';
update public.users set organization_id = '08300000-0000-4000-8000-0000000000a0',
       status = 'active', role = 'agent', full_name = 'Company Intelligence Agent'
 where id = '08300000-0000-4000-8000-0000000000ab';

-- The project carries SIBLING KEYS on company_context — the
-- merge-write must leave them byte-identical.
insert into public.projects (id, organization_id, title, company_name, one_line_input, company_context) values
  ('08300000-0000-4000-8000-00000000aa01', '08300000-0000-4000-8000-0000000000a0',
   'CTO Search', 'CI Co', 'CTO for CI Co',
   '{"company_name": "CI Co", "industry": "Software", "culture_profile": {"seed": "sibling-1"}, "annotations": {"seed": "sibling-2"}}'::jsonb);

do $checks$
declare
  v_recruiter  uuid := '08300000-0000-4000-8000-0000000000a2';
  v_dig        uuid := '08300000-0000-4000-8000-0000000000aa';
  v_ci         uuid := '08300000-0000-4000-8000-0000000000ab';
  v_org        uuid := '08300000-0000-4000-8000-0000000000a0';
  v_project    uuid := '08300000-0000-4000-8000-00000000aa01';
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
  -- (1) The merge-write lands under the pool's grant; siblings
  --     survive; both event kinds land with the agent as actor.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_ci, 'role', 'authenticated')::text, true);

  update public.projects
     set company_context = company_context
         || '{"intelligence_report": {"executive_summary": "harness report", "sources": []}}'::jsonb
   where id = v_project;

  update public.projects
     set company_context = company_context
         || '{"hm_intelligence": {"hm_name": "harness hm", "sources": []}}'::jsonb
   where id = v_project;

  perform public.record_agent_event(
    'company_researched', v_project, null,
    jsonb_build_object('agent_kind', 'company_intel', 'trigger', 'research',
                       'sources_count', 5, 'leadership_count', 4,
                       'recent_context_count', 6));
  perform public.record_agent_event(
    'hm_researched', v_project, null,
    jsonb_build_object('agent_kind', 'company_intel', 'trigger', 'research',
                       'sources_count', 3, 'stakeholder_override', false));

  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);

  select company_context into v_jsonb from public.projects where id = v_project;
  if v_jsonb->'intelligence_report'->>'executive_summary' is distinct from 'harness report'
     or v_jsonb->'hm_intelligence'->>'hm_name' is distinct from 'harness hm' then
    raise exception 'INVARIANT-FAIL (1): the agent''s merge-write did not land (%)', v_jsonb;
  end if;
  if v_jsonb->'culture_profile'->>'seed' is distinct from 'sibling-1'
     or v_jsonb->'annotations'->>'seed' is distinct from 'sibling-2'
     or v_jsonb->>'industry' is distinct from 'Software' then
    raise exception 'INVARIANT-FAIL (1): the merge-write DESTROYED a sibling key (%)', v_jsonb;
  end if;

  select actor_id, actor_label, detail into v_uuid, v_text, v_jsonb
    from public.activity_events where event_type = 'company_researched';
  if v_uuid is distinct from v_ci then
    raise exception 'INVARIANT-FAIL (1): the company event''s actor is %, not the agent', v_uuid;
  end if;
  if v_text is distinct from 'Company Intelligence Agent' then
    raise exception 'INVARIANT-FAIL (1): the actor label is %, not the agent''s name', v_text;
  end if;
  if v_jsonb->>'trigger' is distinct from 'research'
     or v_jsonb->>'sources_count' is distinct from '5' then
    raise exception 'INVARIANT-FAIL (1): the company event detail is wrong (%)', v_jsonb;
  end if;

  select actor_id, detail into v_uuid, v_jsonb
    from public.activity_events where event_type = 'hm_researched';
  if v_uuid is distinct from v_ci
     or v_jsonb->>'stakeholder_override' is distinct from 'false' then
    raise exception 'INVARIANT-FAIL (1): the HM event is wrong (actor %, detail %)', v_uuid, v_jsonb;
  end if;
  execute 'set local role authenticated';

  ------------------------------------------------------------------------
  -- (2) The vocabulary boundary at the TABLE. THE control tripwire
  --     for the dropped-CHECK drift: this direct insert runs as the
  --     harness owner past every allowlist, and only the CHECK
  --     refuses it. If the CHECK is dropped, nonsense LANDS — and
  --     under 053 every app-path violation would land silently too.
  ------------------------------------------------------------------------
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);

  v_raised := false;
  begin
    insert into public.activity_events (organization_id, event_type, visibility, detail)
    values (v_org, 'vocabulary_probe_nonsense', 'org', '{"probe": "check-boundary"}'::jsonb);
  exception when check_violation then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (2): a NONSENSE event type landed in the trail — the vocabulary boundary (activity_events_type_known) is gone';
  end if;
  execute 'set local role authenticated';

  ------------------------------------------------------------------------
  -- (3) The vocabulary's history is intact at eleven — by COUNT.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_ci, 'role', 'authenticated')::text, true);

  for v_type in
    select unnest(array['feedback_interpreted', 'candidates_ranked',
                        'candidate_parsed', 'candidate_evaluated',
                        'candidate_positioned', 'candidate_researched',
                        'candidate_triangulated', 'candidate_profiled',
                        'desk_digest_generated', 'company_researched',
                        'hm_researched'])
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
  if v_count <> 11 then
    raise exception 'INVARIANT-FAIL (3): % of 11 history probes landed — the vocabulary lost a prior slice''s event type SILENTLY (write_activity_event swallows the CHECK violation by 053''s design)', v_count;
  end if;
  execute 'set local role authenticated';

  ------------------------------------------------------------------------
  -- (4) The negative matrix, UNCHANGED — plus the forgery boundary
  --     both directions and the unknown-type refusal.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_ci, 'role', 'authenticated')::text, true);

  select count(*) into v_count from public.clients;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (4): the agent reads % clients rows', v_count;
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

  select count(*), count(*) filter (where id = v_ci)
    into v_count, v_count2 from public.users;
  if v_count <> 1 or v_count2 <> 1 then
    raise exception 'INVARIANT-FAIL (4): the agent reads % users rows (self: %)', v_count, v_count2;
  end if;

  select count(*) into v_count from public.portal_context();
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (4): portal_context answered the agent (% rows)', v_count;
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_recruiter, 'role', 'authenticated')::text, true);

  v_raised := false;
  begin
    perform public.record_agent_event('company_researched');
  exception when insufficient_privilege then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (4): a recruiter recorded company_researched through the agent door';
  end if;

  v_raised := false;
  begin
    perform public.record_activity_event('company_researched');
  exception when others then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (4): a recruiter recorded company_researched through the human door';
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_ci, 'role', 'authenticated')::text, true);
  v_raised := false;
  begin
    perform public.record_agent_event('company_acquired');
  exception when others then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (4): the agent recorded an unknown event type';
  end if;

  ------------------------------------------------------------------------
  -- (5) Kill switches independent at ten — and the suspended agent
  --     reads zero.
  ------------------------------------------------------------------------
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  update public.users set status = 'suspended' where id = v_ci;
  execute 'set local role authenticated';

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_ci, 'role', 'authenticated')::text, true);

  select count(*) into v_count from public.projects;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (5): the SUSPENDED agent still reads % projects rows — the is_agent() status gate has regressed', v_count;
  end if;

  update public.projects
     set company_context = company_context || '{"intelligence_report": {"executive_summary": "suspended write"}}'::jsonb
   where id = v_project;

  v_raised := false;
  begin
    perform public.record_agent_event('company_researched');
  exception when insufficient_privilege then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (5): the suspended agent recorded an event';
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_dig, 'role', 'authenticated')::text, true);
  perform public.record_agent_event(
    'desk_digest_generated', null, null,
    jsonb_build_object('agent_kind', 'digest', 'probe', 'ten-way-independence'));

  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);

  select company_context->'intelligence_report'->>'executive_summary'
    into v_text from public.projects where id = v_project;
  if v_text is distinct from 'harness report' then
    raise exception 'INVARIANT-FAIL (5): the suspended agent''s UPDATE landed (%)', v_text;
  end if;

  select count(*) into v_count from public.activity_events
   where event_type = 'desk_digest_generated' and actor_id = v_dig
     and detail->>'probe' = 'ten-way-independence';
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL (5): the digest writer''s event did not land with the company-intel agent down';
  end if;
  update public.users set status = 'active' where id = v_ci;

  raise notice 'ALL AGENT-COMPANYINTEL INVARIANTS PASSED';
end
$checks$;

rollback;
