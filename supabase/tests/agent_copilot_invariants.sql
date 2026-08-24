-- Agent-copilot invariants (migration 094: the eighteenth agent
-- principal — the fifth ZERO-NEW-GRANT conversion; 094 is vocabulary
-- only, and the judgment's whole reach is the POOL).
--
-- Rolled back; forged-JWT assertions per the house pattern. 074 pins
-- the role and most of the pool; 093 completed the coverage with the
-- shortlists SELECT. This file pins:
--
--    1. READ COVERAGE — the slice's distinctive invariant. The
--       snapshot's every source is visible to the agent BY COUNT:
--       the seeded feedback tail (2), the shortlist row (1), the
--       candidates (2), the scores (2), the project row. A pool
--       policy silently dropped is exactly how this surface's
--       context dies (the dead-label defect's lesson) — the counts
--       are the tripwire.
--    2. The act + attribution: copilot_answered lands with COUNTS
--       (context/messages/candidates/focused) and the agent's id
--       and label; no question or answer text exists to leak, and
--       the detail is pinned to prove it stays that way.
--    3. History intact at TWENTY by COUNT (§42 doctrine).
--    4. The negative matrix: clients / organizations /
--       activity_events zero, users self-only; agent INSERT on
--       shortlists refused (093 — no door); agent UPDATE on a
--       SUBMITTED shortlist lands NOWHERE (093's pin still
--       answering under the eighteenth's session); the recruiter
--       refused at the agent door; an unknown type refused by name.
--    5. Kill switches independent at EIGHTEEN — the suspended
--       Copilot Agent reads zero feedback / shortlists / projects,
--       is refused at the trail door, while the Shortlist Agent's
--       event still lands.
--
-- On success: NOTICE 'ALL AGENT-COPILOT INVARIANTS PASSED'.
--
-- Control run (2026-08-24, verified): a NEW control shape — the
-- drift regresses a POOL grant ANOTHER slice minted:
-- feedback_agent_select (074) DROPPED in the harness transaction
-- ("the copilot has its own harness; the interpreter's grant is not
-- its concern") — invariant (1) read the feedback tail at ZERO and
-- aborted at INVARIANT-FAIL (1); drift and harness in ONE
-- transaction, the abort rolling the drop back — residue-free by
-- construction. The harness guards INHERITED coverage, not just its
-- own migration, because a future RLS cleanup that drops a pool
-- policy is exactly how an assembled context dies silently.

begin;

insert into public.organizations (id, name, slug) values
  ('09400000-0000-4000-8000-0000000000a0', 'CP Org A', 'cp-org-a');

insert into auth.users (id, email) values
  ('09400000-0000-4000-8000-0000000000a2', 'cp-recruiter@test.local'),
  ('09400000-0000-4000-8000-0000000000aa', 'cp-shortlist@test.local'),
  ('09400000-0000-4000-8000-0000000000ab', 'cp-copilot@test.local');

update public.users set organization_id = '09400000-0000-4000-8000-0000000000a0',
       status = 'active', role = 'recruiter', full_name = 'CP Recruiter'
 where id = '09400000-0000-4000-8000-0000000000a2';
update public.users set organization_id = '09400000-0000-4000-8000-0000000000a0',
       status = 'active', role = 'agent', full_name = 'Shortlist Agent'
 where id = '09400000-0000-4000-8000-0000000000aa';
update public.users set organization_id = '09400000-0000-4000-8000-0000000000a0',
       status = 'active', role = 'agent', full_name = 'Copilot Agent'
 where id = '09400000-0000-4000-8000-0000000000ab';

insert into public.projects (id, organization_id, created_by, title, company_name, one_line_input, calibration_model) values
  ('09400000-0000-4000-8000-00000000aa01', '09400000-0000-4000-8000-0000000000a0',
   '09400000-0000-4000-8000-0000000000a2',
   'COO Search', 'Acme Robotics', 'COO for Acme Robotics (harness)',
   '{"role_title": "COO", "dimension_weights": {"leadership": 9}}'::jsonb),
  ('09400000-0000-4000-8000-00000000aa02', '09400000-0000-4000-8000-0000000000a0',
   '09400000-0000-4000-8000-0000000000a2',
   'CIO Search', 'Acme Robotics', 'CIO for Acme Robotics (harness)', null);

insert into public.candidates (id, organization_id, project_id, full_name, pipeline_stage, cv_structured) values
  ('09400000-0000-4000-8000-00000000cc01', '09400000-0000-4000-8000-0000000000a0',
   '09400000-0000-4000-8000-00000000aa01', 'Harmon Vale', 'matched',
   '{"summary": "ops leader (harness)"}'::jsonb),
  ('09400000-0000-4000-8000-00000000cc02', '09400000-0000-4000-8000-0000000000a0',
   '09400000-0000-4000-8000-00000000aa01', 'Iris Coldwater', 'matched',
   '{"summary": "supply-chain leader (harness)"}'::jsonb);

insert into public.candidate_scores (candidate_id, project_id, organization_id, technical_score, domain_score, leadership_score, regulatory_score, transformation_score, overall_score, tier, rank_position) values
  ('09400000-0000-4000-8000-00000000cc01', '09400000-0000-4000-8000-00000000aa01',
   '09400000-0000-4000-8000-0000000000a0', 6, 7, 9, 4, 6, 7.4, 'tier_1', 1),
  ('09400000-0000-4000-8000-00000000cc02', '09400000-0000-4000-8000-00000000aa01',
   '09400000-0000-4000-8000-0000000000a0', 5, 8, 7, 5, 7, 6.9, 'tier_2', 2);

-- The feedback tail the copilot reads (074's interpreter grant,
-- reused by the pool) — the coverage pin's subject.
insert into public.feedback (project_id, organization_id, candidate_id, submitted_by, feedback_type, content) values
  ('09400000-0000-4000-8000-00000000aa01', '09400000-0000-4000-8000-0000000000a0',
   '09400000-0000-4000-8000-00000000cc01', '09400000-0000-4000-8000-0000000000a2',
   'hiring_manager', 'Strong operator, wants more supply-chain depth (harness).'),
  ('09400000-0000-4000-8000-00000000aa01', '09400000-0000-4000-8000-0000000000a0',
   null, '09400000-0000-4000-8000-0000000000a2',
   'recruiter_note', 'Prioritise transformation stories next round (harness).');

-- The DRAFT slate (visible, coverage) and the SUBMITTED one (the
-- 093 pin's face, checked under the eighteenth's own session).
insert into public.shortlists (id, project_id, organization_id, slate_size, candidate_ids, narrative, report_content, created_by, submitted_at, submitted_by) values
  ('09400000-0000-4000-8000-00000000bb01', '09400000-0000-4000-8000-00000000aa01',
   '09400000-0000-4000-8000-0000000000a0', 3,
   array['09400000-0000-4000-8000-00000000cc01']::uuid[],
   'Draft narrative (harness)', '{}'::jsonb,
   '09400000-0000-4000-8000-0000000000a2', null, null),
  ('09400000-0000-4000-8000-00000000bb02', '09400000-0000-4000-8000-00000000aa02',
   '09400000-0000-4000-8000-0000000000a0', 3,
   array['09400000-0000-4000-8000-00000000cc02']::uuid[],
   'Submitted narrative (harness)', '{"executive_summary": "AS SENT"}'::jsonb,
   '09400000-0000-4000-8000-0000000000a2', now(),
   '09400000-0000-4000-8000-0000000000a2');

do $checks$
declare
  v_recruiter uuid := '09400000-0000-4000-8000-0000000000a2';
  v_slagent   uuid := '09400000-0000-4000-8000-0000000000aa';
  v_cp        uuid := '09400000-0000-4000-8000-0000000000ab';
  v_org       uuid := '09400000-0000-4000-8000-0000000000a0';
  v_project   uuid := '09400000-0000-4000-8000-00000000aa01';
  v_submitted uuid := '09400000-0000-4000-8000-00000000bb02';
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
  -- (1) READ COVERAGE — every snapshot source visible, by COUNT.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_cp, 'role', 'authenticated')::text, true);

  select count(*) into v_count from public.feedback where project_id = v_project;
  if v_count <> 2 then
    raise exception 'INVARIANT-FAIL (1): the agent reads % of 2 feedback rows — the snapshot''s tail died silently', v_count;
  end if;
  select count(*) into v_count from public.shortlists;
  if v_count <> 2 then
    raise exception 'INVARIANT-FAIL (1): the agent reads % of 2 shortlists rows', v_count;
  end if;
  select count(*) into v_count from public.candidates where project_id = v_project;
  if v_count <> 2 then
    raise exception 'INVARIANT-FAIL (1): the agent reads % of 2 candidates', v_count;
  end if;
  select count(*) into v_count from public.candidate_scores where project_id = v_project;
  if v_count <> 2 then
    raise exception 'INVARIANT-FAIL (1): the agent reads % of 2 scores', v_count;
  end if;
  select count(*) into v_count from public.projects where id = v_project;
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL (1): the agent cannot read the project row';
  end if;

  ------------------------------------------------------------------------
  -- (2) The act + attribution — counts, never text.
  ------------------------------------------------------------------------
  perform public.record_agent_event(
    'copilot_answered', v_project, null,
    jsonb_build_object('agent_kind', 'copilot', 'context', 'ranking',
                       'messages', 3, 'candidates', 2, 'focused', false));

  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);

  select actor_id, actor_label, detail into v_uuid, v_text, v_jsonb
    from public.activity_events where event_type = 'copilot_answered';
  if v_uuid is null or v_uuid is distinct from v_cp then
    raise exception 'INVARIANT-FAIL (2): the event''s actor is % — the act wears the system''s blank face', coalesce(v_uuid::text, 'NULL');
  end if;
  if v_text is distinct from 'Copilot Agent' then
    raise exception 'INVARIANT-FAIL (2): the actor label is %, not the agent''s name', v_text;
  end if;
  if v_jsonb->>'context' is distinct from 'ranking'
     or v_jsonb->>'messages' is distinct from '3'
     or v_jsonb->>'candidates' is distinct from '2' then
    raise exception 'INVARIANT-FAIL (2): the event detail is wrong (%)', v_jsonb;
  end if;
  select count(*) into v_count from public.activity_events
   where event_type = 'copilot_answered'
     and detail::text ~* 'harness|supply-chain|operator';
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (2): snapshot text rode the trail';
  end if;
  execute 'set local role authenticated';

  ------------------------------------------------------------------------
  -- (3) The vocabulary's history is intact at TWENTY — by COUNT.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_cp, 'role', 'authenticated')::text, true);

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
                        'shortlist_report_generated', 'copilot_answered'])
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
  if v_count <> 20 then
    raise exception 'INVARIANT-FAIL (3): % of 20 history probes landed — the vocabulary lost an event type SILENTLY', v_count;
  end if;
  execute 'set local role authenticated';

  ------------------------------------------------------------------------
  -- (4) The negative matrix — and 093's pin under the eighteenth.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_cp, 'role', 'authenticated')::text, true);

  update public.shortlists
     set report_content = '{"executive_summary": "COPILOT REWROTE THE RECORD"}'::jsonb
   where id = v_submitted;

  v_raised := false;
  begin
    insert into public.shortlists (project_id, organization_id, slate_size, candidate_ids, narrative, report_content)
    values (v_project, v_org, 3, array[]::uuid[], 'copilot insert', '{}'::jsonb);
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
  select count(*), count(*) filter (where id = v_cp)
    into v_count, v_count2 from public.users;
  if v_count <> 1 or v_count2 <> 1 then
    raise exception 'INVARIANT-FAIL (4): the agent reads % users rows (self: %)', v_count, v_count2;
  end if;

  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);

  select report_content->>'executive_summary' into v_text
    from public.shortlists where id = v_submitted;
  if v_text is distinct from 'AS SENT' then
    raise exception 'INVARIANT-FAIL (4): the agent TOUCHED the submitted slate (%)', v_text;
  end if;
  execute 'set local role authenticated';

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_recruiter, 'role', 'authenticated')::text, true);
  v_raised := false;
  begin
    perform public.record_agent_event('copilot_answered');
  exception when insufficient_privilege then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (4): a recruiter recorded copilot_answered through the agent door';
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_cp, 'role', 'authenticated')::text, true);
  v_raised := false;
  begin
    perform public.record_agent_event('copilot_hallucinated');
  exception when others then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (4): the agent recorded an unknown event type';
  end if;

  ------------------------------------------------------------------------
  -- (5) Kill switches independent at EIGHTEEN.
  ------------------------------------------------------------------------
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  update public.users set status = 'suspended' where id = v_cp;
  execute 'set local role authenticated';

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_cp, 'role', 'authenticated')::text, true);

  select count(*) into v_count from public.feedback;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (5): the SUSPENDED agent still reads % feedback rows', v_count;
  end if;
  select count(*) into v_count from public.shortlists;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (5): the SUSPENDED agent still reads % shortlists rows', v_count;
  end if;
  select count(*) into v_count from public.projects;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (5): the SUSPENDED agent still reads % projects rows', v_count;
  end if;

  v_raised := false;
  begin
    perform public.record_agent_event('copilot_answered');
  exception when insufficient_privilege then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (5): the suspended agent recorded an event';
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_slagent, 'role', 'authenticated')::text, true);
  perform public.record_agent_event(
    'shortlist_report_generated', v_project, null,
    jsonb_build_object('agent_kind', 'shortlist', 'probe', 'eighteen-way-independence'));

  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);

  select count(*) into v_count from public.activity_events
   where event_type = 'shortlist_report_generated' and actor_id = v_slagent
     and detail->>'probe' = 'eighteen-way-independence';
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL (5): the Shortlist Agent''s event did not land with the Copilot Agent down';
  end if;
  update public.users set status = 'active' where id = v_cp;

  raise notice 'ALL AGENT-COPILOT INVARIANTS PASSED';
end
$checks$;

rollback;
