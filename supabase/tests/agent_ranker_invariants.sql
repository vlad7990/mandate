-- Agent-ranker invariants (migration 075: the second agent principal,
-- the candidates_ranked vocabulary, the allowlist boundary).
--
-- Rolled back; forged-JWT assertions per the house pattern. Slice one's
-- file (agent_principal_invariants.sql) pins the ROLE — the grant pool,
-- the XOR, the guard boundary, suspension mechanics. This file pins
-- what is new when a SECOND principal wears it:
--
--    1. The ranker scores under its own name: the score upsert lands
--       (update AND insert, verified privileged) and
--       record_agent_event('candidates_ranked') lands with the ranker
--       as actor, its name snapshotted, the trigger named in detail.
--    2. The second principal is as bounded as the first, by name: zero
--       clients, hiring_manager_reviews, organizations,
--       activity_events; a users read returning only its own row; both
--       portal RPCs empty.
--    3. The kill switches are independent — the reason D1 chose two
--       accounts: with the RANKER suspended, the ranker reads nothing
--       and its trail door refuses, while the INTERPRETER still reads
--       the project and still records feedback_interpreted.
--    4. The forgery boundary: a recruiter calling
--       record_agent_event('candidates_ranked') is refused by role —
--       THE control-run tripwire — and an agent asking for an unknown
--       event type is refused by name.
--    5. Two agents, two actors, one org each: the trail's
--       agent-written events carry two DISTINCT actor_ids, and the
--       ranker reads zero of org B.
--
-- On success: NOTICE 'ALL AGENT-RANKER INVARIANTS PASSED'.
--
-- Control run (2026-08-20, verified): the file re-run with
-- record_agent_event re-created WITHOUT the is_agent() gate — the
-- forgery regression D2 names — aborted at INVARIANT-FAIL (4) with
-- "a recruiter recorded candidates_ranked", invariants 1–3 still
-- passing under the regression. Diff vs. the clean pass: the one
-- function body. Rollback verified residue-free.

begin;

insert into public.organizations (id, name, slug) values
  ('07500000-0000-4000-8000-0000000000a0', 'Ranker Org A', 'ranker-org-a'),
  ('07500000-0000-4000-8000-0000000000b0', 'Ranker Org B', 'ranker-org-b');

insert into public.clients (id, organization_id, name) values
  ('07500000-0000-4000-8000-00000000ca01', '07500000-0000-4000-8000-0000000000a0', 'Ranker Client A');

insert into auth.users (id, email) values
  ('07500000-0000-4000-8000-0000000000a2', 'ranker-recruiter@test.local'),
  ('07500000-0000-4000-8000-0000000000a3', 'ranker-interp@test.local'),
  ('07500000-0000-4000-8000-0000000000a4', 'ranker-ranker@test.local');

update public.users set organization_id = '07500000-0000-4000-8000-0000000000a0',
       status = 'active', role = 'recruiter', full_name = 'Ranker Recruiter'
 where id = '07500000-0000-4000-8000-0000000000a2';
update public.users set organization_id = '07500000-0000-4000-8000-0000000000a0',
       status = 'active', role = 'agent', full_name = 'Feedback Interpreter'
 where id = '07500000-0000-4000-8000-0000000000a3';
update public.users set organization_id = '07500000-0000-4000-8000-0000000000a0',
       status = 'active', role = 'agent', full_name = 'Ranking Agent'
 where id = '07500000-0000-4000-8000-0000000000a4';

insert into public.projects (id, organization_id, title, company_name, one_line_input, calibration_model) values
  ('07500000-0000-4000-8000-00000000aa01', '07500000-0000-4000-8000-0000000000a0',
   'COO Search', 'Rank Co', 'COO for Rank Co',
   '{"dimension_weights": {"technical": 5, "domain": 5, "leadership": 5, "regulatory": 5, "transformation": 5}}'::jsonb);

insert into public.candidates (id, organization_id, project_id, full_name, cv_processing, cv_structured) values
  ('07500000-0000-4000-8000-00000000ac01', '07500000-0000-4000-8000-0000000000a0',
   '07500000-0000-4000-8000-00000000aa01', 'Rank Cand One', false,
   '{"fit_dimensions": {"technical": 6, "domain": 6, "leadership": 6, "regulatory": 6, "transformation": 6}}'::jsonb),
  ('07500000-0000-4000-8000-00000000ac02', '07500000-0000-4000-8000-0000000000a0',
   '07500000-0000-4000-8000-00000000aa01', 'Rank Cand Two', false,
   '{"fit_dimensions": {"technical": 4, "domain": 4, "leadership": 4, "regulatory": 4, "transformation": 4}}'::jsonb);

insert into public.candidate_scores (id, organization_id, project_id, candidate_id,
  technical_score, domain_score, leadership_score, regulatory_score, transformation_score,
  overall_score, tier, rank_position) values
  ('07500000-0000-4000-8000-00000000a501', '07500000-0000-4000-8000-0000000000a0',
   '07500000-0000-4000-8000-00000000aa01', '07500000-0000-4000-8000-00000000ac01',
   6, 6, 6, 6, 6, 6, 'tier_2', 1);

insert into public.hiring_manager_reviews (id, organization_id, project_id, hm_label) values
  ('07500000-0000-4000-8000-00000000ae01', '07500000-0000-4000-8000-0000000000a0',
   '07500000-0000-4000-8000-00000000aa01', 'Ranker Harness HM');

insert into public.projects (id, organization_id, title, company_name, one_line_input) values
  ('07500000-0000-4000-8000-00000000bb01', '07500000-0000-4000-8000-0000000000b0',
   'B Search', 'B Corp', 'B role');

do $checks$
declare
  v_recruiter uuid := '07500000-0000-4000-8000-0000000000a2';
  v_interp    uuid := '07500000-0000-4000-8000-0000000000a3';
  v_ranker    uuid := '07500000-0000-4000-8000-0000000000a4';
  v_project   uuid := '07500000-0000-4000-8000-00000000aa01';
  v_cand1     uuid := '07500000-0000-4000-8000-00000000ac01';
  v_cand2     uuid := '07500000-0000-4000-8000-00000000ac02';
  v_count     int;
  v_count2    int;
  v_raised    boolean;
  v_text      text;
  v_uuid      uuid;
  v_jsonb     jsonb;
begin
  execute 'set local role authenticated';

  ------------------------------------------------------------------------
  -- (1) The ranker scores under its own name.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_ranker, 'role', 'authenticated')::text, true);

  update public.candidate_scores
     set overall_score = 7, rank_position = 1, previous_rank = 1
   where candidate_id = v_cand1;

  insert into public.candidate_scores (organization_id, project_id, candidate_id,
    technical_score, domain_score, leadership_score, regulatory_score,
    transformation_score, overall_score, tier, rank_position)
  values ('07500000-0000-4000-8000-0000000000a0', v_project, v_cand2,
    4, 4, 4, 4, 4, 4, 'tier_3', 2);

  perform public.record_agent_event(
    'candidates_ranked', v_project, null,
    jsonb_build_object('agent_kind', 'ranker',
                       'trigger', 'scoring_run',
                       'scored', 2, 'moved', 1));

  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);

  select count(*) into v_count from public.candidate_scores
   where project_id = v_project
     and ((candidate_id = v_cand1 and overall_score = 7)
       or (candidate_id = v_cand2 and overall_score = 4));
  if v_count <> 2 then
    raise exception 'INVARIANT-FAIL (1): the ranker''s score upsert did not land (% of 2)', v_count;
  end if;

  select actor_id, actor_label, detail into v_uuid, v_text, v_jsonb
    from public.activity_events where event_type = 'candidates_ranked';
  if v_uuid is distinct from v_ranker then
    raise exception 'INVARIANT-FAIL (1): the ranked event''s actor is %, not the ranker', v_uuid;
  end if;
  if v_text is distinct from 'Ranking Agent' then
    raise exception 'INVARIANT-FAIL (1): the actor label is %, not the ranker''s name', v_text;
  end if;
  if v_jsonb->>'trigger' is distinct from 'scoring_run' then
    raise exception 'INVARIANT-FAIL (1): the event does not name its trigger (detail %)', v_jsonb;
  end if;
  execute 'set local role authenticated';

  ------------------------------------------------------------------------
  -- (2) The second principal is as bounded as the first, by name.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_ranker, 'role', 'authenticated')::text, true);

  select count(*) into v_count from public.clients;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (2): the ranker reads % clients rows', v_count;
  end if;

  select count(*) into v_count from public.hiring_manager_reviews;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (2): the ranker reads % hiring_manager_reviews rows', v_count;
  end if;

  select count(*) into v_count from public.organizations;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (2): the ranker reads % organizations rows', v_count;
  end if;

  select count(*) into v_count from public.activity_events;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (2): the ranker reads % activity_events rows', v_count;
  end if;

  select count(*), count(*) filter (where id = v_ranker)
    into v_count, v_count2 from public.users;
  if v_count <> 1 or v_count2 <> 1 then
    raise exception 'INVARIANT-FAIL (2): the ranker reads % users rows (self: %), expected exactly its own', v_count, v_count2;
  end if;

  select count(*) into v_count from public.portal_context();
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (2): portal_context answered the ranker (% rows)', v_count;
  end if;

  select count(*) into v_count from public.portal_list_mandates();
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (2): portal_list_mandates answered the ranker (% rows)', v_count;
  end if;

  ------------------------------------------------------------------------
  -- (3) The kill switches are independent — the D1 proof.
  ------------------------------------------------------------------------
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  update public.users set status = 'suspended' where id = v_ranker;
  execute 'set local role authenticated';

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_ranker, 'role', 'authenticated')::text, true);
  select count(*) into v_count from public.projects;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (3): the suspended ranker reads % projects', v_count;
  end if;
  v_raised := false;
  begin
    perform public.record_agent_event('candidates_ranked', v_project);
  exception when insufficient_privilege then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (3): the suspended ranker recorded an event';
  end if;

  -- The interpreter, untouched, still works. Expected 1: org A's one
  -- project — org B's is out of reach by design, and the first run of
  -- this file expected 2 by bad arithmetic, which the harness caught.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_interp, 'role', 'authenticated')::text, true);
  select count(*) into v_count from public.projects;
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL (3): the interpreter reads % projects with the ranker down, expected 1', v_count;
  end if;
  perform public.record_agent_event(
    'feedback_interpreted', v_project, v_cand1,
    jsonb_build_object('agent_kind', 'feedback_interpreter', 'probe', 'kill-switch-independence'));

  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  select count(*) into v_count from public.activity_events
   where event_type = 'feedback_interpreted' and actor_id = v_interp;
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL (3): the interpreter''s event did not land with the ranker down';
  end if;
  update public.users set status = 'active' where id = v_ranker;
  execute 'set local role authenticated';

  ------------------------------------------------------------------------
  -- (4) The forgery boundary. THE control-run tripwire.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_recruiter, 'role', 'authenticated')::text, true);
  v_raised := false;
  begin
    perform public.record_agent_event('candidates_ranked', v_project);
  exception when insufficient_privilege then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (4): a recruiter recorded candidates_ranked';
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_ranker, 'role', 'authenticated')::text, true);
  v_raised := false;
  begin
    perform public.record_agent_event('made_up_event', v_project);
  exception when others then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (4): the agent recorded an unknown event type';
  end if;

  ------------------------------------------------------------------------
  -- (5) Two agents, two actors, one org each.
  ------------------------------------------------------------------------
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  select count(distinct actor_id) into v_count from public.activity_events
   where event_type in ('candidates_ranked', 'feedback_interpreted');
  if v_count <> 2 then
    raise exception 'INVARIANT-FAIL (5): agent events carry % distinct actors, expected 2', v_count;
  end if;
  execute 'set local role authenticated';

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_ranker, 'role', 'authenticated')::text, true);
  select count(*) into v_count from public.projects
   where organization_id = '07500000-0000-4000-8000-0000000000b0';
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (5): the ranker reads org B projects';
  end if;

  raise notice 'ALL AGENT-RANKER INVARIANTS PASSED';
end
$checks$;

rollback;
