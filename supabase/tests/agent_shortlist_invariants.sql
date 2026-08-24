-- Agent-shortlist invariants (migration 093: the seventeenth agent
-- principal — two new policies, the UPDATE double-pinned on the
-- slate's SUBMISSION state).
--
-- Rolled back; forged-JWT assertions per the house pattern. 074 pins
-- the role; 093 mints the shortlists SELECT (the slate row is the
-- model input — and per the 082 doctrine an UPDATE without SELECT is
-- INERT) and the UPDATE this file pins:
--
--    1. The judgment lands on the HUMAN's slate row: report_content
--       merged — with the composition surviving (candidate_ids,
--       narrative, slate_size, created_by = the recruiter,
--       submitted_at still NULL). The event carries trigger/slate/
--       scenarios COUNTS; the report's text is provably absent from
--       the trail.
--    2. Attribution pins: the event wears the agent's id and label.
--    3. History intact at NINETEEN by COUNT (§42 doctrine).
--    4. THE SUBMITTED PIN, BOTH DIRECTIONS — this slice's control
--       tripwire: the agent's UPDATE against a SUBMITTED shortlist
--       lands on zero rows (USING — what was sent never silently
--       changes), and an UPDATE that would SET submitted_at is
--       REFUSED (WITH CHECK — submission stays the recruiter's
--       editorial act forever). Plus: agent INSERT refused (no
--       policy — the row's allocation is the human's act); the
--       negative matrix unchanged (clients / organizations /
--       activity_events zero, users self-only); the recruiter
--       refused at the agent door; an unknown type refused by name.
--    5. Kill switches independent at SEVENTEEN — the suspended
--       Shortlist Agent reads zero shortlists, lands nothing, is
--       refused at the trail door, while the Role Spec Agent's
--       event still lands.
--
-- On success: NOTICE 'ALL AGENT-SHORTLIST INVARIANTS PASSED'.
--
-- Control run (2026-08-24, verified): shortlists_agent_update
-- REBUILT with the WITH CHECK submitted_at conjunct dropped ("USING
-- already refuses submitted rows" — 092's exact drift, one table
-- over) — the agent SUBMITTED a slate and the harness aborted at
-- INVARIANT-FAIL (4); drift and harness in ONE transaction, the
-- abort rolling the rebuild back — residue-free by construction.

begin;

insert into public.organizations (id, name, slug) values
  ('09300000-0000-4000-8000-0000000000a0', 'SL Org A', 'sl-org-a');

insert into auth.users (id, email) values
  ('09300000-0000-4000-8000-0000000000a2', 'sl-recruiter@test.local'),
  ('09300000-0000-4000-8000-0000000000aa', 'sl-rolespec@test.local'),
  ('09300000-0000-4000-8000-0000000000ab', 'sl-shortlist@test.local');

update public.users set organization_id = '09300000-0000-4000-8000-0000000000a0',
       status = 'active', role = 'recruiter', full_name = 'SL Recruiter'
 where id = '09300000-0000-4000-8000-0000000000a2';
update public.users set organization_id = '09300000-0000-4000-8000-0000000000a0',
       status = 'active', role = 'agent', full_name = 'Role Spec Agent'
 where id = '09300000-0000-4000-8000-0000000000aa';
update public.users set organization_id = '09300000-0000-4000-8000-0000000000a0',
       status = 'active', role = 'agent', full_name = 'Shortlist Agent'
 where id = '09300000-0000-4000-8000-0000000000ab';

-- Two projects: the unique-per-project shortlist means the DRAFT and
-- the SUBMITTED slate need one each.
insert into public.projects (id, organization_id, created_by, title, company_name, one_line_input) values
  ('09300000-0000-4000-8000-00000000aa01', '09300000-0000-4000-8000-0000000000a0',
   '09300000-0000-4000-8000-0000000000a2',
   'VP Eng Search', 'Acme Robotics', 'VP Eng for Acme Robotics (harness)'),
  ('09300000-0000-4000-8000-00000000aa02', '09300000-0000-4000-8000-0000000000a0',
   '09300000-0000-4000-8000-0000000000a2',
   'CFO Search', 'Acme Robotics', 'CFO for Acme Robotics (harness)');

-- The HUMAN's acts: the composed DRAFT slate and the SUBMITTED one.
insert into public.shortlists (id, project_id, organization_id, slate_size, candidate_ids, narrative, report_content, created_by, submitted_at, submitted_by) values
  ('09300000-0000-4000-8000-00000000bb01', '09300000-0000-4000-8000-00000000aa01',
   '09300000-0000-4000-8000-0000000000a0', 3,
   array['09300000-0000-4000-8000-00000000cc01', '09300000-0000-4000-8000-00000000cc02']::uuid[],
   'The recruiter''s narrative (harness)', '{}'::jsonb,
   '09300000-0000-4000-8000-0000000000a2', null, null),
  ('09300000-0000-4000-8000-00000000bb02', '09300000-0000-4000-8000-00000000aa02',
   '09300000-0000-4000-8000-0000000000a0', 3,
   array['09300000-0000-4000-8000-00000000cc03']::uuid[],
   'Submitted narrative (harness)', '{"executive_summary": "THE RECORD AS SENT"}'::jsonb,
   '09300000-0000-4000-8000-0000000000a2', now(),
   '09300000-0000-4000-8000-0000000000a2');

do $checks$
declare
  v_recruiter uuid := '09300000-0000-4000-8000-0000000000a2';
  v_rsagent   uuid := '09300000-0000-4000-8000-0000000000aa';
  v_sl        uuid := '09300000-0000-4000-8000-0000000000ab';
  v_org       uuid := '09300000-0000-4000-8000-0000000000a0';
  v_project   uuid := '09300000-0000-4000-8000-00000000aa01';
  v_draft     uuid := '09300000-0000-4000-8000-00000000bb01';
  v_submitted uuid := '09300000-0000-4000-8000-00000000bb02';
  v_count     int;
  v_count2    int;
  v_raised    boolean;
  v_text      text;
  v_uuid      uuid;
  v_jsonb     jsonb;
  v_type      text;
  v_ts        timestamptz;
  v_ids       uuid[];
begin
  execute 'set local role authenticated';

  ------------------------------------------------------------------------
  -- (1) The judgment lands on the slate row; the composition survives.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_sl, 'role', 'authenticated')::text, true);

  update public.shortlists
     set report_content = '{"executive_summary": "quillmarsh summary", "scenarios": [{"headline": "a"}, {"headline": "b"}, {"headline": "c"}]}'::jsonb,
         updated_at = now()
   where id = v_draft;

  perform public.record_agent_event(
    'shortlist_report_generated', v_project, null,
    jsonb_build_object('agent_kind', 'shortlist', 'trigger', 'initial',
                       'slate', 2, 'scenarios', 3));

  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);

  select report_content->>'executive_summary', narrative, slate_size,
         candidate_ids, created_by, submitted_at
    into v_text, v_type, v_count, v_ids, v_uuid, v_ts
    from public.shortlists where id = v_draft;
  if v_text is distinct from 'quillmarsh summary' then
    raise exception 'INVARIANT-FAIL (1): the agent''s judgment did not land (summary %)', v_text;
  end if;
  if v_type is distinct from 'The recruiter''s narrative (harness)'
     or v_count <> 3
     or v_ids is distinct from array['09300000-0000-4000-8000-00000000cc01', '09300000-0000-4000-8000-00000000cc02']::uuid[]
     or v_uuid is distinct from v_recruiter
     or v_ts is not null then
    raise exception 'INVARIANT-FAIL (1): the HUMAN''s composition was disturbed (narrative %, size %, ids %, created_by %, submitted %)',
      v_type, v_count, v_ids, v_uuid, v_ts;
  end if;

  select count(*) into v_count from public.activity_events
   where event_type = 'shortlist_report_generated' and detail::text like '%quillmarsh%';
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (1): the report''s text rode the trail';
  end if;
  select detail into v_jsonb from public.activity_events
   where event_type = 'shortlist_report_generated';
  if v_jsonb->>'trigger' is distinct from 'initial'
     or v_jsonb->>'slate' is distinct from '2'
     or v_jsonb->>'scenarios' is distinct from '3' then
    raise exception 'INVARIANT-FAIL (1): the event detail is wrong (%)', v_jsonb;
  end if;

  ------------------------------------------------------------------------
  -- (2) Attribution pins.
  ------------------------------------------------------------------------
  select actor_id, actor_label into v_uuid, v_text
    from public.activity_events where event_type = 'shortlist_report_generated';
  if v_uuid is null or v_uuid is distinct from v_sl then
    raise exception 'INVARIANT-FAIL (2): the event''s actor is % — the act wears the system''s blank face', coalesce(v_uuid::text, 'NULL');
  end if;
  if v_text is distinct from 'Shortlist Agent' then
    raise exception 'INVARIANT-FAIL (2): the actor label is %, not the agent''s name', v_text;
  end if;
  execute 'set local role authenticated';

  ------------------------------------------------------------------------
  -- (3) The vocabulary's history is intact at NINETEEN — by COUNT.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_sl, 'role', 'authenticated')::text, true);

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
                        'shortlist_report_generated'])
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
  if v_count <> 19 then
    raise exception 'INVARIANT-FAIL (3): % of 19 history probes landed — the vocabulary lost an event type SILENTLY', v_count;
  end if;
  execute 'set local role authenticated';

  ------------------------------------------------------------------------
  -- (4) THE SUBMITTED PIN, both directions — plus the negative matrix.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_sl, 'role', 'authenticated')::text, true);

  -- (4a) USING: the submitted slate cannot be touched.
  update public.shortlists
     set report_content = '{"executive_summary": "AGENT REWROTE THE RECORD"}'::jsonb
   where id = v_submitted;

  -- (4b) WITH CHECK: the agent cannot submit.
  v_raised := false;
  begin
    update public.shortlists set submitted_at = now() where id = v_draft;
  exception when others then v_raised := true; end;
  if not v_raised then
    -- If no error was raised, the WITH CHECK either refused silently
    -- (0 rows: fine, verified below) or the submit LANDED (drift).
    null;
  end if;

  -- (4c) INSERT refused: the row's allocation is the human's act.
  v_raised := false;
  begin
    insert into public.shortlists (project_id, organization_id, slate_size, candidate_ids, narrative, report_content)
    values (v_project, v_org, 3, array[]::uuid[], 'agent insert', '{}'::jsonb);
  exception when others then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (4): the agent INSERTED a shortlists row';
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
  select count(*), count(*) filter (where id = v_sl)
    into v_count, v_count2 from public.users;
  if v_count <> 1 or v_count2 <> 1 then
    raise exception 'INVARIANT-FAIL (4): the agent reads % users rows (self: %)', v_count, v_count2;
  end if;

  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);

  select report_content->>'executive_summary' into v_text
    from public.shortlists where id = v_submitted;
  if v_text is distinct from 'THE RECORD AS SENT' then
    raise exception 'INVARIANT-FAIL (4): the agent TOUCHED the submitted slate (%)', v_text;
  end if;
  select submitted_at into v_ts from public.shortlists where id = v_draft;
  if v_ts is not null then
    raise exception 'INVARIANT-FAIL (4): the agent SUBMITTED a slate — submission was authored by an agent';
  end if;
  execute 'set local role authenticated';

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_recruiter, 'role', 'authenticated')::text, true);
  v_raised := false;
  begin
    perform public.record_agent_event('shortlist_report_generated');
  exception when insufficient_privilege then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (4): a recruiter recorded shortlist_report_generated through the agent door';
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_sl, 'role', 'authenticated')::text, true);
  v_raised := false;
  begin
    perform public.record_agent_event('slate_hallucinated');
  exception when others then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (4): the agent recorded an unknown event type';
  end if;

  ------------------------------------------------------------------------
  -- (5) Kill switches independent at SEVENTEEN.
  ------------------------------------------------------------------------
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  update public.users set status = 'suspended' where id = v_sl;
  execute 'set local role authenticated';

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_sl, 'role', 'authenticated')::text, true);

  select count(*) into v_count from public.shortlists;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (5): the SUSPENDED agent still reads % shortlists rows', v_count;
  end if;

  update public.shortlists
     set report_content = '{"executive_summary": "suspended rewrite"}'::jsonb
   where id = v_draft;

  v_raised := false;
  begin
    perform public.record_agent_event('shortlist_report_generated');
  exception when insufficient_privilege then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (5): the suspended agent recorded an event';
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_rsagent, 'role', 'authenticated')::text, true);
  perform public.record_agent_event(
    'job_spec_generated', v_project, null,
    jsonb_build_object('agent_kind', 'rolespec', 'probe', 'seventeen-way-independence'));

  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);

  select report_content->>'executive_summary' into v_text
    from public.shortlists where id = v_draft;
  if v_text is distinct from 'quillmarsh summary' then
    raise exception 'INVARIANT-FAIL (5): the suspended agent''s UPDATE landed (%)', v_text;
  end if;

  select count(*) into v_count from public.activity_events
   where event_type = 'job_spec_generated' and actor_id = v_rsagent
     and detail->>'probe' = 'seventeen-way-independence';
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL (5): the Role Spec Agent''s event did not land with the Shortlist Agent down';
  end if;
  update public.users set status = 'active' where id = v_sl;

  raise notice 'ALL AGENT-SHORTLIST INVARIANTS PASSED';
end
$checks$;

rollback;
