-- Agent-principal invariants (migration 074: role 'agent', the
-- interpreter's grants, the boundary, the trail door).
--
-- Rolled back; forged-JWT assertions per the house pattern. Writes are
-- made as the principal and their effects verified privileged (reset
-- role) — an RLS-filtered count is a false failure, the §21 lesson.
-- Negatives are seeded first: a zero count over an empty table proves
-- nothing.
--
--    1. The agent session READS exactly the D6 tables: the project and
--       its calibration, the feedback rows, the candidate profile, the
--       existing score row, the org's skills.
--    2. The agent session WRITES exactly the D6 writes, and they land:
--       the interpretation onto feedback, the recalibrated model onto
--       projects, the score upsert (update AND insert) onto
--       candidate_scores, the snapshot into calibration_history — whose
--       author guard accepts the agent as changed_by, because the agent
--       is an org member (D4's premise).
--    3. The negatives, each by name (D2): zero placement_fees, zero
--       fee_terms, zero clients, zero hiring_manager_reviews, zero
--       organizations, zero activity_events, a users read that returns
--       only the agent's own row, and the two portal RPCs answering
--       empty. record_activity_event (the human intent door) writes
--       nothing for an agent. This is the control-run tripwire: with
--       'agent' slipped into can_read_org(), the roster and clients
--       counts open up and this invariant must abort.
--    4. The trail (D4): record_agent_event lands 'feedback_interpreted'
--       with the agent as actor_id, its name snapshotted, the review
--       named in detail; the recruiter calling it is refused by role;
--       the agent asking for a human event type is refused by name.
--    5. The boundary: an org admin can move a role neither into nor out
--       of 'agent'; the founder can do both.
--    6. Suspension (D3): the suspended agent reads zero rows of its own
--       grant tables and its trail door refuses — active-only
--       predicates, nothing here had to remember.
--    7. The XOR: an agent row cannot lose its org and cannot gain a
--       client — check_violation, not policy.
--    8. Cross-org: the agent reads zero of org B and its UPDATE aimed
--       at org B's feedback lands on zero rows, verified privileged.
--
-- On success: NOTICE 'ALL AGENT-PRINCIPAL INVARIANTS PASSED'.
--
-- Control run (2026-08-20, verified): the file re-run with
-- can_read_org() re-created as the six-role list (the five staff roles
-- plus 'agent' — the exact regression D2 forbids) aborted at
-- INVARIANT-FAIL (3) with "the agent reads 1 clients rows", invariants
-- 1–2 still passing under the regression. Diff vs. the clean pass:
-- the one function body. Rollback verified — predicate restored,
-- zero fixture residue, baseline counts intact.

begin;

insert into public.organizations (id, name, slug) values
  ('07400000-0000-4000-8000-0000000000a0', 'Agent Org A', 'agent-org-a'),
  ('07400000-0000-4000-8000-0000000000b0', 'Agent Org B', 'agent-org-b');

insert into public.clients (id, organization_id, name) values
  ('07400000-0000-4000-8000-00000000ca01', '07400000-0000-4000-8000-0000000000a0', 'Agent Client A');

insert into auth.users (id, email) values
  ('07400000-0000-4000-8000-0000000000a1', 'agent-admin@test.local'),
  ('07400000-0000-4000-8000-0000000000a2', 'agent-recruiter@test.local'),
  ('07400000-0000-4000-8000-0000000000a3', 'agent-interpreter@test.local'),
  ('07400000-0000-4000-8000-0000000000a4', 'agent-viewer@test.local'),
  ('07400000-0000-4000-8000-0000000000f1', 'agent-founder@test.local');

-- The signup trigger created every row as (org NULL, role viewer,
-- status pending). Promote privileged; the agent's role and org move in
-- one statement because the XOR demands they arrive together.
update public.users set organization_id = '07400000-0000-4000-8000-0000000000a0',
       status = 'active', role = 'admin', full_name = 'Agent Admin'
 where id = '07400000-0000-4000-8000-0000000000a1';
update public.users set organization_id = '07400000-0000-4000-8000-0000000000a0',
       status = 'active', role = 'recruiter', full_name = 'Agent Recruiter'
 where id = '07400000-0000-4000-8000-0000000000a2';
update public.users set organization_id = '07400000-0000-4000-8000-0000000000a0',
       status = 'active', role = 'agent', full_name = 'Feedback Interpreter'
 where id = '07400000-0000-4000-8000-0000000000a3';
update public.users set organization_id = '07400000-0000-4000-8000-0000000000a0',
       status = 'active', role = 'viewer', full_name = 'Agent Viewer'
 where id = '07400000-0000-4000-8000-0000000000a4';
update public.users set organization_id = '07400000-0000-4000-8000-0000000000a0',
       status = 'active', role = 'admin', is_founder = true, full_name = 'Agent Founder'
 where id = '07400000-0000-4000-8000-0000000000f1';

-- Org A: the interpreter pipeline's world.
insert into public.projects (id, organization_id, title, company_name, one_line_input, calibration_model) values
  ('07400000-0000-4000-8000-00000000aa01', '07400000-0000-4000-8000-0000000000a0',
   'CFO Search', 'Acme Holdings', 'CFO for Acme',
   '{"dimension_weights": {"technical": 5, "domain": 5, "leadership": 5, "regulatory": 5, "transformation": 5}}'::jsonb);

insert into public.candidates (id, organization_id, project_id, full_name, cv_processing, cv_structured) values
  ('07400000-0000-4000-8000-00000000ac01', '07400000-0000-4000-8000-0000000000a0',
   '07400000-0000-4000-8000-00000000aa01', 'Cand One', false,
   '{"fit_dimensions": {"technical": 6, "domain": 6, "leadership": 6, "regulatory": 6, "transformation": 6}}'::jsonb),
  ('07400000-0000-4000-8000-00000000ac02', '07400000-0000-4000-8000-0000000000a0',
   '07400000-0000-4000-8000-00000000aa01', 'Cand Two', false,
   '{"fit_dimensions": {"technical": 4, "domain": 4, "leadership": 4, "regulatory": 4, "transformation": 4}}'::jsonb);

insert into public.feedback (id, organization_id, project_id, candidate_id, feedback_type, content) values
  ('07400000-0000-4000-8000-00000000af01', '07400000-0000-4000-8000-0000000000a0',
   '07400000-0000-4000-8000-00000000aa01', '07400000-0000-4000-8000-00000000ac01',
   'hm_portal', 'HM PORTAL - STRONG YES'),
  ('07400000-0000-4000-8000-00000000af02', '07400000-0000-4000-8000-0000000000a0',
   '07400000-0000-4000-8000-00000000aa01', '07400000-0000-4000-8000-00000000ac01',
   'recruiter_note', 'Prior note for the tail');

insert into public.candidate_scores (id, organization_id, project_id, candidate_id,
  technical_score, domain_score, leadership_score, regulatory_score, transformation_score,
  overall_score, tier, rank_position) values
  ('07400000-0000-4000-8000-00000000a501', '07400000-0000-4000-8000-0000000000a0',
   '07400000-0000-4000-8000-00000000aa01', '07400000-0000-4000-8000-00000000ac01',
   6, 6, 6, 6, 6, 6, 'tier_2', 1);

insert into public.skills (id, organization_id, name, skill_type, instructions, description, trigger_conditions) values
  ('07400000-0000-4000-8000-00000000a601', '07400000-0000-4000-8000-0000000000a0',
   'Harness Skill', 'search_skill', 'Weigh regulatory experience heavily.', '', '');

-- The negatives' seeds: rows that must NOT be readable as the agent.
insert into public.hiring_manager_reviews (id, organization_id, project_id, hm_label) values
  ('07400000-0000-4000-8000-00000000ae01', '07400000-0000-4000-8000-0000000000a0',
   '07400000-0000-4000-8000-00000000aa01', 'Harness HM');

insert into public.placements (id, organization_id, project_id, candidate_id, offer_date) values
  ('07400000-0000-4000-8000-00000000ad01', '07400000-0000-4000-8000-0000000000a0',
   '07400000-0000-4000-8000-00000000aa01', '07400000-0000-4000-8000-00000000ac01',
   '2026-08-01');
-- (the placements audit trigger just seeded an org-visibility
-- activity event — the trail negative's row, for free)

insert into public.placement_fees (id, organization_id, placement_id,
  fee_model, fee_basis, currency, base_currency, total_fee_amount) values
  ('07400000-0000-4000-8000-00000000ab01', '07400000-0000-4000-8000-0000000000a0',
   '07400000-0000-4000-8000-00000000ad01', 'fixed', 'base_salary', 'USD', 'USD', 30000);

-- Org B: the cross-org negative's world.
insert into public.projects (id, organization_id, title, company_name, one_line_input) values
  ('07400000-0000-4000-8000-00000000bb01', '07400000-0000-4000-8000-0000000000b0',
   'B Search', 'B Corp', 'B role');

insert into public.feedback (id, organization_id, project_id, feedback_type, content) values
  ('07400000-0000-4000-8000-00000000bf01', '07400000-0000-4000-8000-0000000000b0',
   '07400000-0000-4000-8000-00000000bb01', 'recruiter_note', 'Org B note');

do $checks$
declare
  v_agent     uuid := '07400000-0000-4000-8000-0000000000a3';
  v_admin     uuid := '07400000-0000-4000-8000-0000000000a1';
  v_recruiter uuid := '07400000-0000-4000-8000-0000000000a2';
  v_viewer    uuid := '07400000-0000-4000-8000-0000000000a4';
  v_founder   uuid := '07400000-0000-4000-8000-0000000000f1';
  v_project   uuid := '07400000-0000-4000-8000-00000000aa01';
  v_cand1     uuid := '07400000-0000-4000-8000-00000000ac01';
  v_cand2     uuid := '07400000-0000-4000-8000-00000000ac02';
  v_fb1       uuid := '07400000-0000-4000-8000-00000000af01';
  v_fb_b      uuid := '07400000-0000-4000-8000-00000000bf01';
  v_review    uuid := '07400000-0000-4000-8000-00000000ae01';
  v_count     int;
  v_count2    int;
  v_raised    boolean;
  v_text      text;
  v_uuid      uuid;
  v_jsonb     jsonb;
begin
  execute 'set local role authenticated';

  ------------------------------------------------------------------------
  -- (1) The agent reads exactly its grant tables.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_agent, 'role', 'authenticated')::text, true);

  select count(*) into v_count from public.projects;
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL (1): the agent reads % projects, expected 1 (own org only)', v_count;
  end if;

  select count(*) into v_count from public.feedback;
  if v_count <> 2 then
    raise exception 'INVARIANT-FAIL (1): the agent reads % feedback rows, expected 2', v_count;
  end if;

  select count(*) into v_count from public.candidates;
  if v_count <> 2 then
    raise exception 'INVARIANT-FAIL (1): the agent reads % candidates, expected 2', v_count;
  end if;

  select count(*) into v_count from public.candidate_scores;
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL (1): the agent reads % score rows, expected 1', v_count;
  end if;

  select count(*) into v_count from public.skills;
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL (1): the agent reads % skills, expected 1', v_count;
  end if;

  ------------------------------------------------------------------------
  -- (2) The agent's writes land — verified privileged.
  ------------------------------------------------------------------------
  update public.feedback
     set interpreted = '{"summary": "harness interpretation"}'::jsonb,
         triggered_recalibration = true
   where id = v_fb1;

  update public.projects
     set calibration_model = '{"dimension_weights": {"technical": 6, "domain": 5, "leadership": 5, "regulatory": 5, "transformation": 5}}'::jsonb,
         recalibration_summary = '{"summary": "harness recalibration"}'::jsonb
   where id = v_project;

  update public.candidate_scores
     set overall_score = 7, technical_score = 7
   where candidate_id = v_cand1;

  insert into public.candidate_scores (organization_id, project_id, candidate_id,
    technical_score, domain_score, leadership_score, regulatory_score,
    transformation_score, overall_score, tier, rank_position)
  values ('07400000-0000-4000-8000-0000000000a0', v_project, v_cand2,
    4, 4, 4, 4, 4, 4, 'tier_3', 2);

  -- The snapshot append: changed_by names the agent, and the author
  -- guard must accept it — the agent is an org member (D4's premise).
  insert into public.calibration_history (organization_id, project_id, snapshot,
    change_type, change_reason, feedback_id, changed_by)
  values ('07400000-0000-4000-8000-0000000000a0', v_project,
    '{"dimension_weights": {"technical": 6}}'::jsonb,
    'recalibration', 'harness', v_fb1, v_agent);

  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);

  select interpreted->>'summary' into v_text from public.feedback where id = v_fb1;
  if v_text is distinct from 'harness interpretation' then
    raise exception 'INVARIANT-FAIL (2): the interpretation did not land (found %)', v_text;
  end if;

  select calibration_model->'dimension_weights'->>'technical' into v_text
    from public.projects where id = v_project;
  if v_text is distinct from '6' then
    raise exception 'INVARIANT-FAIL (2): the recalibrated model did not land (technical = %)', v_text;
  end if;

  select count(*) into v_count from public.candidate_scores
   where project_id = v_project
     and ((candidate_id = v_cand1 and overall_score = 7)
       or (candidate_id = v_cand2 and overall_score = 4));
  if v_count <> 2 then
    raise exception 'INVARIANT-FAIL (2): the score upsert did not land (% of 2)', v_count;
  end if;

  select changed_by into v_uuid from public.calibration_history
   where project_id = v_project and change_reason = 'harness';
  if v_uuid is distinct from v_agent then
    raise exception 'INVARIANT-FAIL (2): the snapshot did not land attributed to the agent (changed_by %)', v_uuid;
  end if;

  execute 'set local role authenticated';

  ------------------------------------------------------------------------
  -- (3) The negatives, each by name. The control-run tripwire.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_agent, 'role', 'authenticated')::text, true);

  select count(*) into v_count from public.placement_fees;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (3): the agent reads % placement_fees rows', v_count;
  end if;

  select count(*) into v_count from public.fee_terms;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (3): the agent reads % fee_terms rows', v_count;
  end if;

  select count(*) into v_count from public.clients;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (3): the agent reads % clients rows', v_count;
  end if;

  select count(*) into v_count from public.hiring_manager_reviews;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (3): the agent reads % hiring_manager_reviews rows', v_count;
  end if;

  select count(*) into v_count from public.organizations;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (3): the agent reads % organizations rows', v_count;
  end if;

  select count(*) into v_count from public.activity_events;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (3): the agent reads % activity_events rows', v_count;
  end if;

  -- The roster: the 059 self-read and nothing else.
  select count(*), count(*) filter (where id = v_agent)
    into v_count, v_count2 from public.users;
  if v_count <> 1 or v_count2 <> 1 then
    raise exception 'INVARIANT-FAIL (3): the agent reads % users rows (self: %), expected exactly its own', v_count, v_count2;
  end if;

  -- The portal RPCs answer empty: they key on client_id, which an
  -- agent can never carry (the XOR).
  select count(*) into v_count from public.portal_context();
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (3): portal_context answered the agent (% rows)', v_count;
  end if;

  select count(*) into v_count from public.portal_list_mandates();
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (3): portal_list_mandates answered the agent (% rows)', v_count;
  end if;

  -- The human intent door stays shut: record_activity_event gates on
  -- can_read_org(), which must never have heard of the agent. It
  -- returns silently; the assertion is that nothing was written.
  perform public.record_activity_event('shortlist_published', v_project);

  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  select count(*) into v_count from public.activity_events
   where event_type = 'shortlist_published';
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (3): record_activity_event wrote for the agent';
  end if;
  execute 'set local role authenticated';

  ------------------------------------------------------------------------
  -- (4) The trail: the agent's act, under its own name, trigger named.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_agent, 'role', 'authenticated')::text, true);

  perform public.record_agent_event(
    'feedback_interpreted', v_project, v_cand1,
    jsonb_build_object('agent_kind', 'feedback_interpreter',
                       'review_id', v_review,
                       'feedback_id', v_fb1,
                       'recalibrated', true));

  -- The agent asking for a human event type is refused by name.
  v_raised := false;
  begin
    perform public.record_agent_event('shortlist_published', v_project);
  exception when others then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (4): the agent recorded a human event type';
  end if;

  -- The recruiter at the agent's door is refused by role.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_recruiter, 'role', 'authenticated')::text, true);
  v_raised := false;
  begin
    perform public.record_agent_event('feedback_interpreted', v_project);
  exception when insufficient_privilege then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (4): a recruiter recorded an agent event';
  end if;

  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  select actor_id, actor_label, detail into v_uuid, v_text, v_jsonb
    from public.activity_events where event_type = 'feedback_interpreted';
  if v_uuid is distinct from v_agent then
    raise exception 'INVARIANT-FAIL (4): the event''s actor is %, not the agent', v_uuid;
  end if;
  if v_text is distinct from 'Feedback Interpreter' then
    raise exception 'INVARIANT-FAIL (4): the actor label is %, not the agent''s name', v_text;
  end if;
  if (v_jsonb->>'review_id')::uuid is distinct from v_review then
    raise exception 'INVARIANT-FAIL (4): the event does not name the review (detail %)', v_jsonb;
  end if;
  execute 'set local role authenticated';

  ------------------------------------------------------------------------
  -- (5) The boundary: no non-founder hand moves a role across it.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

  v_raised := false;
  begin
    update public.users set role = 'agent' where id = v_recruiter;
  exception when insufficient_privilege then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (5): an org admin turned a recruiter into an agent';
  end if;

  v_raised := false;
  begin
    update public.users set role = 'viewer' where id = v_agent;
  exception when insufficient_privilege then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (5): an org admin turned the agent into a viewer';
  end if;

  -- The founder can do both.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_founder, 'role', 'authenticated')::text, true);
  update public.users set role = 'agent' where id = v_viewer;
  update public.users set role = 'viewer' where id = v_viewer;

  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  select role into v_text from public.users where id = v_viewer;
  if v_text is distinct from 'viewer' then
    raise exception 'INVARIANT-FAIL (5): the founder round-trip left role %', v_text;
  end if;
  execute 'set local role authenticated';

  ------------------------------------------------------------------------
  -- (6) Suspension: the whole grant dies with the predicate.
  ------------------------------------------------------------------------
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  update public.users set status = 'suspended' where id = v_agent;
  execute 'set local role authenticated';

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_agent, 'role', 'authenticated')::text, true);

  select count(*) into v_count from public.projects;
  select count(*) into v_count2 from public.feedback;
  if v_count <> 0 or v_count2 <> 0 then
    raise exception 'INVARIANT-FAIL (6): the suspended agent reads % projects, % feedback', v_count, v_count2;
  end if;

  v_raised := false;
  begin
    perform public.record_agent_event('feedback_interpreted', v_project);
  exception when insufficient_privilege then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (6): the suspended agent recorded an event';
  end if;

  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  update public.users set status = 'active' where id = v_agent;

  ------------------------------------------------------------------------
  -- (7) The XOR: an agent keeps its org and never gains a client.
  ------------------------------------------------------------------------
  v_raised := false;
  begin
    update public.users set organization_id = null where id = v_agent;
  exception when check_violation then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (7): an agent row lost its organization';
  end if;

  v_raised := false;
  begin
    update public.users set client_id = '07400000-0000-4000-8000-00000000ca01'
     where id = v_agent;
  exception when check_violation then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (7): an agent row gained a client';
  end if;
  execute 'set local role authenticated';

  ------------------------------------------------------------------------
  -- (8) Cross-org: org B does not exist for org A's agent.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_agent, 'role', 'authenticated')::text, true);

  select count(*) into v_count from public.projects
   where organization_id = '07400000-0000-4000-8000-0000000000b0';
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (8): the agent reads org B projects';
  end if;

  update public.feedback set interpreted = '{"summary": "should not land"}'::jsonb
   where id = v_fb_b;

  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  select interpreted->>'summary' into v_text from public.feedback where id = v_fb_b;
  if v_text is not distinct from 'should not land' then
    raise exception 'INVARIANT-FAIL (8): the agent wrote into org B';
  end if;

  raise notice 'ALL AGENT-PRINCIPAL INVARIANTS PASSED';
end
$checks$;

rollback;
