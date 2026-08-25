-- Agent-outreach-strategy invariants (migration 097: the twenty-first
-- agent principal — the Engage arc's first slice, and the first
-- slice since 085 that mints its own tables rather than converting a
-- surface).
--
-- Rolled back; forged-JWT assertions per the house pattern. 097 mints
-- everything this file pins:
--
--    1. Read coverage under the agent, by COUNT on harness ids: the
--       candidate, the project, the contact history (the ONE new
--       grant on an existing table), and the org's comms policy.
--    2. The draft is born under the agent's own name: status 'draft',
--       created_by the signing session; the event carries counts and
--       the draft's text is provably absent from the trail;
--       attribution pins (actor_id, actor_label).
--    3. History intact at TWENTY-SIX by COUNT (§42 doctrine).
--    4. THE PINS, all faces — this slice's control tripwire:
--       the agent cannot INSERT anything but its own draft (status
--       pinned at birth, created_by actor-pinned); the agent cannot
--       move a row out of 'draft' (WITH CHECK) nor touch a decided
--       row (USING — the UPDATE lands on zero rows); the human
--       decision is actor-pinned (approved_by must be the deciding
--       session); a viewer is refused at the human door
--       (can_share_clients); ONE live draft per candidate-lane (the
--       partial unique index); org_comms_policy writes are admin's
--       alone (agent refused, recruiter refused, admin lands) and
--       'linkedin' cannot enter allowed_channels (the constraint IS
--       the source-policy doctrine); the agent cannot INSERT into
--       candidate_outreach (sends stay human until 099); the
--       negative matrix unchanged (clients / organizations /
--       activity_events zero, users self-only); the recruiter refused
--       at the agent's trail door; an unknown type refused by name.
--    5. Kill switches independent at TWENTY-ONE — the suspended
--       Outreach Strategy Agent reads zero strategies, lands nothing,
--       is refused at the trail door, while the Calibration Agent's
--       event still lands.
--
-- On success: NOTICE 'ALL AGENT-OUTREACH-STRATEGY INVARIANTS PASSED'.
--
-- Control run (2026-08-24, verified): outreach_strategies_agent_update
-- REBUILT with the WITH CHECK status conjunct dropped ("USING already
-- refuses decided rows") — the agent moved its own draft to
-- 'superseded' (an editorial act) and the harness aborted at
-- INVARIANT-FAIL (4); drift and harness in ONE transaction, the abort
-- rolling the rebuild back — residue-free by construction. The two
-- conjuncts guard different faces: USING is what the agent may touch,
-- WITH CHECK is what it may leave behind — dropping either is the
-- drift.

begin;

insert into public.organizations (id, name, slug) values
  ('09700000-0000-4000-8000-0000000000a0', 'OS Org A', 'os-org-a');

insert into auth.users (id, email) values
  ('09700000-0000-4000-8000-0000000000a1', 'os-admin@test.local'),
  ('09700000-0000-4000-8000-0000000000a2', 'os-recruiter@test.local'),
  ('09700000-0000-4000-8000-0000000000a3', 'os-viewer@test.local'),
  ('09700000-0000-4000-8000-0000000000aa', 'os-calibration@test.local'),
  ('09700000-0000-4000-8000-0000000000ab', 'os-strategy@test.local');

update public.users set organization_id = '09700000-0000-4000-8000-0000000000a0',
       status = 'active', role = 'admin', full_name = 'OS Admin'
 where id = '09700000-0000-4000-8000-0000000000a1';
update public.users set organization_id = '09700000-0000-4000-8000-0000000000a0',
       status = 'active', role = 'recruiter', full_name = 'OS Recruiter'
 where id = '09700000-0000-4000-8000-0000000000a2';
update public.users set organization_id = '09700000-0000-4000-8000-0000000000a0',
       status = 'active', role = 'viewer', full_name = 'OS Viewer'
 where id = '09700000-0000-4000-8000-0000000000a3';
update public.users set organization_id = '09700000-0000-4000-8000-0000000000a0',
       status = 'active', role = 'agent', full_name = 'Calibration Agent'
 where id = '09700000-0000-4000-8000-0000000000aa';
update public.users set organization_id = '09700000-0000-4000-8000-0000000000a0',
       status = 'active', role = 'agent', full_name = 'Outreach Strategy Agent'
 where id = '09700000-0000-4000-8000-0000000000ab';

insert into public.projects (id, organization_id, created_by, title, company_name, one_line_input, calibration_model, company_context) values
  ('09700000-0000-4000-8000-00000000aa01', '09700000-0000-4000-8000-0000000000a0',
   '09700000-0000-4000-8000-0000000000a2',
   'COO Search', 'Acme Clearing', 'COO for Acme Clearing (harness)',
   '{"role_title": "COO", "dimension_weights": {"operations": 8}}'::jsonb,
   '{"company_name": "Acme Clearing"}'::jsonb);

insert into public.candidates (id, project_id, organization_id, full_name) values
  ('09700000-0000-4000-8000-00000000cc01', '09700000-0000-4000-8000-00000000aa01',
   '09700000-0000-4000-8000-0000000000a0', 'Harness Candidate');

-- The HUMAN's contact history — what the agent must be able to read.
insert into public.candidate_outreach (id, candidate_id, project_id, organization_id, channel, direction, subject, created_by) values
  ('09700000-0000-4000-8000-00000000dd01', '09700000-0000-4000-8000-00000000cc01',
   '09700000-0000-4000-8000-00000000aa01', '09700000-0000-4000-8000-0000000000a0',
   'email', 'outbound', 'First touch (harness)',
   '09700000-0000-4000-8000-0000000000a2');

do $checks$
declare
  v_admin     uuid := '09700000-0000-4000-8000-0000000000a1';
  v_recruiter uuid := '09700000-0000-4000-8000-0000000000a2';
  v_viewer    uuid := '09700000-0000-4000-8000-0000000000a3';
  v_calagent  uuid := '09700000-0000-4000-8000-0000000000aa';
  v_os        uuid := '09700000-0000-4000-8000-0000000000ab';
  v_org       uuid := '09700000-0000-4000-8000-0000000000a0';
  v_project   uuid := '09700000-0000-4000-8000-00000000aa01';
  v_candidate uuid := '09700000-0000-4000-8000-00000000cc01';
  v_draft     uuid := '09700000-0000-4000-8000-00000000ee01';
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
  -- (0) The org's comms policy row is the ADMIN's act (the seed only
  --     covered orgs that existed at migration time).
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  insert into public.org_comms_policy (organization_id, client_identity_disclosure)
  values (v_org, 'after_nda');

  ------------------------------------------------------------------------
  -- (1) Read coverage under the agent, by COUNT on harness ids.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_os, 'role', 'authenticated')::text, true);

  select count(*) into v_count from public.candidates where id = v_candidate;
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL (1): the agent reads % of 1 candidate rows', v_count;
  end if;
  select count(*) into v_count from public.projects where id = v_project;
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL (1): the agent reads % of 1 project rows', v_count;
  end if;
  select count(*) into v_count from public.candidate_outreach where candidate_id = v_candidate;
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL (1): the agent reads % of 1 contact-history rows — the 097 grant is not reaching', v_count;
  end if;
  select count(*) into v_count from public.org_comms_policy where organization_id = v_org;
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL (1): the agent reads % of 1 comms-policy rows', v_count;
  end if;

  ------------------------------------------------------------------------
  -- (2) The draft is born under the agent's own name; the trail
  --     carries counts, never the draft's text.
  ------------------------------------------------------------------------
  insert into public.outreach_strategies
    (id, organization_id, project_id, candidate_id, content, status, version, created_by)
  values
    (v_draft, v_org, v_project, v_candidate,
     '{"angle": "meridianhook operations story", "channel": "email", "talking_points": ["a", "b", "c"], "draft_subject": "meridianhook subject", "draft_body": "meridianhook body"}'::jsonb,
     'draft', 1, v_os);

  perform public.record_agent_event(
    'outreach_strategy_drafted', v_project, v_candidate,
    jsonb_build_object('agent_kind', 'outreach_strategy', 'version', 1,
                       'channel', 'email', 'talking_points', 3,
                       'evidence_keys', 2, 'policy_clamped', false));

  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);

  select status, created_by into v_text, v_uuid
    from public.outreach_strategies where id = v_draft;
  if v_text is distinct from 'draft' or v_uuid is distinct from v_os then
    raise exception 'INVARIANT-FAIL (2): the draft landed wrong (status %, created_by %)', v_text, v_uuid;
  end if;

  select count(*) into v_count from public.activity_events
   where detail::text like '%meridianhook%';
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (2): the draft''s text rode the trail';
  end if;
  select actor_id, actor_label, detail into v_uuid, v_text, v_jsonb
    from public.activity_events where event_type = 'outreach_strategy_drafted';
  if v_uuid is distinct from v_os then
    raise exception 'INVARIANT-FAIL (2): the event''s actor is % — the act wears the wrong face', coalesce(v_uuid::text, 'NULL');
  end if;
  if v_text is distinct from 'Outreach Strategy Agent' then
    raise exception 'INVARIANT-FAIL (2): the actor label is %, not the agent''s name', v_text;
  end if;
  if v_jsonb->>'version' is distinct from '1'
     or v_jsonb->>'talking_points' is distinct from '3' then
    raise exception 'INVARIANT-FAIL (2): the event detail is wrong (%)', v_jsonb;
  end if;
  execute 'set local role authenticated';

  ------------------------------------------------------------------------
  -- (3) The vocabulary's history is intact at TWENTY-SIX — by COUNT.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_os, 'role', 'authenticated')::text, true);

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
                        'outreach_strategy_drafted'])
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
  if v_count <> 26 then
    raise exception 'INVARIANT-FAIL (3): % of 26 history probes landed — the vocabulary lost an event type SILENTLY', v_count;
  end if;
  execute 'set local role authenticated';

  ------------------------------------------------------------------------
  -- (4) THE PINS, all faces — plus the negative matrix.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_os, 'role', 'authenticated')::text, true);

  -- (4a) The agent cannot author a decided row into existence.
  v_raised := false;
  begin
    insert into public.outreach_strategies
      (organization_id, project_id, candidate_id, status, version, created_by, approved_by, approved_at)
    values (v_org, v_project, v_candidate, 'approved', 90, v_os, v_os, now());
  exception when others then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (4): the agent INSERTED an approved strategy';
  end if;

  -- (4b) The agent cannot sign another's name at birth.
  v_raised := false;
  begin
    insert into public.outreach_strategies
      (organization_id, project_id, candidate_id, status, version, created_by)
    values (v_org, v_project, v_candidate, 'draft', 91, v_recruiter);
  exception when others then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (4): the agent signed the recruiter''s name on a draft';
  end if;

  -- (4c) The agent cannot move a row out of 'draft' (WITH CHECK).
  v_raised := false;
  begin
    update public.outreach_strategies set status = 'superseded' where id = v_draft;
  exception when others then v_raised := true; end;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  select status into v_text from public.outreach_strategies where id = v_draft;
  if v_text is distinct from 'draft' then
    raise exception 'INVARIANT-FAIL (4): the agent moved its draft to % — an editorial act landed under an agent''s name', v_text;
  end if;
  execute 'set local role authenticated';

  -- (4d) The agent CAN revise its own draft (the door it does have).
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_os, 'role', 'authenticated')::text, true);
  update public.outreach_strategies
     set content = content || '{"angle": "meridianhook revised"}'::jsonb
   where id = v_draft;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  select content->>'angle' into v_text from public.outreach_strategies where id = v_draft;
  if v_text is distinct from 'meridianhook revised' then
    raise exception 'INVARIANT-FAIL (4): the agent could not revise its own draft (%)', v_text;
  end if;
  execute 'set local role authenticated';

  -- (4e) A viewer is refused at the human door.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_viewer, 'role', 'authenticated')::text, true);
  update public.outreach_strategies
     set status = 'approved', approved_by = v_viewer, approved_at = now()
   where id = v_draft;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  select status into v_text from public.outreach_strategies where id = v_draft;
  if v_text is distinct from 'draft' then
    raise exception 'INVARIANT-FAIL (4): a VIEWER approved a strategy';
  end if;
  execute 'set local role authenticated';

  -- (4f) The deciding human cannot sign another's name.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_recruiter, 'role', 'authenticated')::text, true);
  v_raised := false;
  begin
    update public.outreach_strategies
       set status = 'approved', approved_by = v_admin, approved_at = now()
     where id = v_draft;
  exception when others then v_raised := true; end;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  select status into v_text from public.outreach_strategies where id = v_draft;
  if v_text is distinct from 'draft' then
    raise exception 'INVARIANT-FAIL (4): an approval landed wearing someone else''s name';
  end if;
  execute 'set local role authenticated';

  -- (4g) The RECRUITER's approval lands, actor-pinned.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_recruiter, 'role', 'authenticated')::text, true);
  update public.outreach_strategies
     set status = 'approved', approved_by = v_recruiter, approved_at = now()
   where id = v_draft;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  select status, approved_by into v_text, v_uuid
    from public.outreach_strategies where id = v_draft;
  if v_text is distinct from 'approved' or v_uuid is distinct from v_recruiter then
    raise exception 'INVARIANT-FAIL (4): the recruiter''s approval did not land (status %, approved_by %)', v_text, v_uuid;
  end if;
  execute 'set local role authenticated';

  -- (4h) USING: the agent's UPDATE against the DECIDED row lands on
  --      zero rows — the approved strategy is the record.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_os, 'role', 'authenticated')::text, true);
  update public.outreach_strategies
     set content = '{"angle": "AGENT REWROTE THE APPROVED STRATEGY"}'::jsonb
   where id = v_draft;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  select content->>'angle' into v_text from public.outreach_strategies where id = v_draft;
  if v_text is distinct from 'meridianhook revised' then
    raise exception 'INVARIANT-FAIL (4): the agent TOUCHED a decided strategy (%)', v_text;
  end if;
  execute 'set local role authenticated';

  -- (4i) ONE live draft per candidate-lane: with the first draft
  --      approved a second draft may be born; a THIRD may not.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_os, 'role', 'authenticated')::text, true);
  insert into public.outreach_strategies
    (organization_id, project_id, candidate_id, status, version, created_by)
  values (v_org, v_project, v_candidate, 'draft', 2, v_os);
  v_raised := false;
  begin
    insert into public.outreach_strategies
      (organization_id, project_id, candidate_id, status, version, created_by)
    values (v_org, v_project, v_candidate, 'draft', 3, v_os);
  exception when unique_violation then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (4): TWO live drafts exist for one candidate-lane';
  end if;

  -- (4j) The agent cannot INSERT into candidate_outreach — sends stay
  --      human until 099's comms service.
  v_raised := false;
  begin
    insert into public.candidate_outreach
      (candidate_id, project_id, organization_id, channel, direction, subject)
    values (v_candidate, v_project, v_org, 'email', 'outbound', 'agent send attempt');
  exception when others then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (4): the agent WROTE the contact record';
  end if;

  -- (4k) org_comms_policy: the agent reads, and only reads.
  v_raised := false;
  begin
    update public.org_comms_policy
       set client_identity_disclosure = 'open'
     where organization_id = v_org;
  exception when others then v_raised := true; end;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  select client_identity_disclosure into v_text
    from public.org_comms_policy where organization_id = v_org;
  if v_text is distinct from 'after_nda' then
    raise exception 'INVARIANT-FAIL (4): the AGENT rewrote the comms policy (%)', v_text;
  end if;
  execute 'set local role authenticated';

  -- (4l) org_comms_policy: a recruiter is not an admin.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_recruiter, 'role', 'authenticated')::text, true);
  update public.org_comms_policy
     set client_identity_disclosure = 'open'
   where organization_id = v_org;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  select client_identity_disclosure into v_text
    from public.org_comms_policy where organization_id = v_org;
  if v_text is distinct from 'after_nda' then
    raise exception 'INVARIANT-FAIL (4): a RECRUITER rewrote the comms policy';
  end if;
  execute 'set local role authenticated';

  -- (4m) The admin's write lands; 'linkedin' cannot enter
  --      allowed_channels — the constraint IS the source-policy
  --      doctrine.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  update public.org_comms_policy
     set compensation_discussion = 'range_allowed'
   where organization_id = v_org;
  v_raised := false;
  begin
    update public.org_comms_policy
       set allowed_channels = '{email,linkedin}'
     where organization_id = v_org;
  exception when check_violation then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (4): linkedin entered allowed_channels — the send doctrine broke at the data layer';
  end if;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  select compensation_discussion into v_text
    from public.org_comms_policy where organization_id = v_org;
  if v_text is distinct from 'range_allowed' then
    raise exception 'INVARIANT-FAIL (4): the admin''s policy write did not land';
  end if;
  execute 'set local role authenticated';

  -- (4n) The negative matrix under the agent.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_os, 'role', 'authenticated')::text, true);
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
  select count(*), count(*) filter (where id = v_os)
    into v_count, v_count2 from public.users;
  if v_count <> 1 or v_count2 <> 1 then
    raise exception 'INVARIANT-FAIL (4): the agent reads % users rows (self: %)', v_count, v_count2;
  end if;

  -- (4o) The recruiter is refused at the agent's trail door; an
  --      unknown type is refused by name.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_recruiter, 'role', 'authenticated')::text, true);
  v_raised := false;
  begin
    perform public.record_agent_event('outreach_strategy_drafted');
  exception when insufficient_privilege then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (4): a recruiter recorded outreach_strategy_drafted through the agent door';
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_os, 'role', 'authenticated')::text, true);
  v_raised := false;
  begin
    perform public.record_agent_event('strategy_hallucinated');
  exception when others then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (4): the agent recorded an unknown event type';
  end if;

  ------------------------------------------------------------------------
  -- (5) Kill switches independent at TWENTY-ONE.
  ------------------------------------------------------------------------
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  update public.users set status = 'suspended' where id = v_os;
  execute 'set local role authenticated';

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_os, 'role', 'authenticated')::text, true);

  select count(*) into v_count from public.outreach_strategies;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (5): the SUSPENDED agent still reads % strategy rows', v_count;
  end if;

  v_raised := false;
  begin
    insert into public.outreach_strategies
      (organization_id, project_id, candidate_id, status, version, created_by)
    values (v_org, v_project, v_candidate, 'draft', 4, v_os);
  exception when others then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (5): the suspended agent drafted a strategy';
  end if;

  v_raised := false;
  begin
    perform public.record_agent_event('outreach_strategy_drafted');
  exception when insufficient_privilege then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (5): the suspended agent recorded an event';
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_calagent, 'role', 'authenticated')::text, true);
  perform public.record_agent_event(
    'calibration_derived', v_project, null,
    jsonb_build_object('agent_kind', 'calibration', 'probe', 'twentyone-way-independence'));

  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);

  select count(*) into v_count from public.activity_events
   where event_type = 'calibration_derived' and actor_id = v_calagent
     and detail->>'probe' = 'twentyone-way-independence';
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL (5): the Calibration Agent''s event did not land with the Outreach Strategy Agent down';
  end if;
  update public.users set status = 'active' where id = v_os;

  raise notice 'ALL AGENT-OUTREACH-STRATEGY INVARIANTS PASSED';
end
$checks$;

rollback;
