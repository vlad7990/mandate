-- Agent-engagement invariants (migration 100: the twenty-third agent
-- principal — the Engage arc's fourth slice, the conversation lane
-- made durable, and THE ESCALATED PIN: the agent raises escalations
-- and can never touch or resolve one — resolution is the human's act,
-- enforced in the UPDATE policy's USING face).
--
-- Rolled back; forged-JWT assertions per the house pattern. 100 mints
-- everything this file pins:
--
--    1. Read coverage under the agent: the thread (candidate_outreach,
--       097's grant), the approved strategy, the relationship profile
--       (born by 098's resolver at candidate INSERT), the comms
--       policy — every input of the judgment reachable under ITS
--       session, nothing more.
--    2. The lane is BORN by the agent (INSERT) and maintained by it
--       (state + draft + follow-up); the event carries counts and the
--       draft's text is provably absent from the trail; attribution
--       pins.
--    3. History intact at TWENTY-EIGHT by COUNT (§42 doctrine).
--    4. THE ESCALATED PIN, all faces — this slice's control tripwire:
--       the raise lands with its reason; the escalated row is then
--       DEAD to the agent (resolve attempt AND draft touch both land
--       nowhere); a raise without a reason is refused (policy WITH
--       CHECK and table CHECK agree); the reason cannot outlive the
--       escalation even owner-side (coherence CHECK, bidirectional);
--       the RECRUITER's resolve lands; the viewer's edit lands
--       nowhere; no human INSERT door, no DELETE door for anyone;
--       the trail doors refuse unknown types and refuse humans.
--    5. Negative matrix under the agent (clients / organizations /
--       activity_events / users self-only / erasure queue).
--    6. Kill switches independent at TWENTY-THREE.
--
-- On success: NOTICE 'ALL AGENT-ENGAGEMENT INVARIANTS PASSED'.
--
-- Control run (2026-08-25): engagement_states_agent_update REBUILT
-- with the state <> 'escalated' conjunct dropped from USING ("the
-- seam refuses escalated lanes anyway") — the agent RESOLVED its own
-- escalation and the harness aborted at INVARIANT-FAIL (4b); drift
-- and harness in ONE transaction, the abort rolling the rebuild back.
--
-- Role discipline: after any owner-side check, re-enter
-- `set local role authenticated` before the next forged-JWT probe —
-- or the probe tests the superuser (the 098 lesson, kept).

begin;

insert into public.organizations (id, name, slug) values
  ('01000000-0000-4000-8000-0000000000a0', 'EN Org A', 'en-org-a');

insert into auth.users (id, email) values
  ('01000000-0000-4000-8000-0000000000a1', 'en-admin@test.local'),
  ('01000000-0000-4000-8000-0000000000a2', 'en-recruiter@test.local'),
  ('01000000-0000-4000-8000-0000000000a3', 'en-viewer@test.local'),
  ('01000000-0000-4000-8000-0000000000aa', 'en-calibration@test.local'),
  ('01000000-0000-4000-8000-0000000000ab', 'en-engagement@test.local');

update public.users set organization_id = '01000000-0000-4000-8000-0000000000a0',
       status = 'active', role = 'admin', full_name = 'EN Admin'
 where id = '01000000-0000-4000-8000-0000000000a1';
update public.users set organization_id = '01000000-0000-4000-8000-0000000000a0',
       status = 'active', role = 'recruiter', full_name = 'EN Recruiter'
 where id = '01000000-0000-4000-8000-0000000000a2';
update public.users set organization_id = '01000000-0000-4000-8000-0000000000a0',
       status = 'active', role = 'viewer', full_name = 'EN Viewer'
 where id = '01000000-0000-4000-8000-0000000000a3';
update public.users set organization_id = '01000000-0000-4000-8000-0000000000a0',
       status = 'active', role = 'agent', full_name = 'Calibration Agent'
 where id = '01000000-0000-4000-8000-0000000000aa';
update public.users set organization_id = '01000000-0000-4000-8000-0000000000a0',
       status = 'active', role = 'agent', full_name = 'Candidate Engagement Agent'
 where id = '01000000-0000-4000-8000-0000000000ab';

insert into public.projects (id, organization_id, created_by, title, company_name, one_line_input) values
  ('01000000-0000-4000-8000-00000000aa01', '01000000-0000-4000-8000-0000000000a0',
   '01000000-0000-4000-8000-0000000000a2',
   'CTO Search', 'Fennwick Systems', 'CTO for Fennwick Systems (harness)');

-- Two candidates: cc01 carries the driven thread; cc02 exists for the
-- reasonless-raise probe (one lane per candidate+project lane rule).
insert into public.candidates (id, project_id, organization_id, full_name, email) values
  ('01000000-0000-4000-8000-00000000cc01', '01000000-0000-4000-8000-00000000aa01',
   '01000000-0000-4000-8000-0000000000a0', 'Marisa Coyle', 'marisa.coyle@harness.test'),
  ('01000000-0000-4000-8000-00000000cc02', '01000000-0000-4000-8000-00000000aa01',
   '01000000-0000-4000-8000-0000000000a0', 'Tobias Wren', 'tobias.wren@harness.test');

-- The thread: one outbound touch and one inbound reply — what the
-- judgment reads. Provider columns on the outbound row so the read
-- coverage sees a real 099-shaped record.
insert into public.candidate_outreach
  (id, candidate_id, project_id, organization_id, channel, direction,
   subject, body, occurred_at, created_by, provider, provider_message_id,
   delivery_status, thread_key)
values
  ('01000000-0000-4000-8000-00000000ee01', '01000000-0000-4000-8000-00000000cc01',
   '01000000-0000-4000-8000-00000000aa01', '01000000-0000-4000-8000-0000000000a0',
   'email', 'outbound', 'A CTO mandate', 'First touch (harness)',
   now() - interval '3 days', '01000000-0000-4000-8000-0000000000a2',
   'resend', 're_harness_0100', 'delivered',
   'thr:01000000-0000-4000-8000-00000000cc01:01000000-0000-4000-8000-00000000aa01'),
  ('01000000-0000-4000-8000-00000000ee02', '01000000-0000-4000-8000-00000000cc01',
   '01000000-0000-4000-8000-00000000aa01', '01000000-0000-4000-8000-0000000000a0',
   'email', 'inbound', 'Re: A CTO mandate', 'Interested — travelling until Thursday (harness)',
   now() - interval '1 day', '01000000-0000-4000-8000-0000000000a2',
   null, null, null,
   'thr:01000000-0000-4000-8000-00000000cc01:01000000-0000-4000-8000-00000000aa01');

-- The approved strategy the judgment reads (created by the agent
-- sibling programme's shape: agent-drafted, human-approved).
insert into public.outreach_strategies
  (id, organization_id, project_id, candidate_id, content, status, version,
   created_by, approved_by, approved_at)
values
  ('01000000-0000-4000-8000-00000000ff01', '01000000-0000-4000-8000-0000000000a0',
   '01000000-0000-4000-8000-00000000aa01', '01000000-0000-4000-8000-00000000cc01',
   '{"angle": "scale-up platform rebuild", "draft_subject": "A CTO mandate"}'::jsonb,
   'approved', 1,
   '01000000-0000-4000-8000-0000000000ab', '01000000-0000-4000-8000-0000000000a2',
   now() - interval '3 days');

-- The comms policy row — the judgment's policy read.
insert into public.org_comms_policy (organization_id)
values ('01000000-0000-4000-8000-0000000000a0');

do $checks$
declare
  v_admin     uuid := '01000000-0000-4000-8000-0000000000a1';
  v_recruiter uuid := '01000000-0000-4000-8000-0000000000a2';
  v_viewer    uuid := '01000000-0000-4000-8000-0000000000a3';
  v_calagent  uuid := '01000000-0000-4000-8000-0000000000aa';
  v_en        uuid := '01000000-0000-4000-8000-0000000000ab';
  v_org       uuid := '01000000-0000-4000-8000-0000000000a0';
  v_project   uuid := '01000000-0000-4000-8000-00000000aa01';
  v_cc01      uuid := '01000000-0000-4000-8000-00000000cc01';
  v_cc02      uuid := '01000000-0000-4000-8000-00000000cc02';
  v_lane1     uuid;
  v_lane2     uuid;
  v_count     int;
  v_count2    int;
  v_raised    boolean;
  v_text      text;
  v_uuid      uuid;
  v_type      text;
begin
  execute 'set local role authenticated';

  ------------------------------------------------------------------------
  -- (1) Read coverage under the agent: every judgment input, nothing more.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_en, 'role', 'authenticated')::text, true);

  select count(*) into v_count from public.candidate_outreach;
  if v_count <> 2 then
    raise exception 'INVARIANT-FAIL (1): the agent reads % of 2 thread rows', v_count;
  end if;
  select count(*) into v_count from public.outreach_strategies where status = 'approved';
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL (1): the agent reads % of 1 approved strategies', v_count;
  end if;
  select count(*) into v_count from public.network_profiles;
  if v_count <> 2 then
    raise exception 'INVARIANT-FAIL (1): the agent reads % of 2 profiles (resolver-born)', v_count;
  end if;
  select count(*) into v_count from public.org_comms_policy;
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL (1): the agent reads % of 1 policy rows', v_count;
  end if;

  ------------------------------------------------------------------------
  -- (2) The lane is born and maintained by the agent; the trail
  --     carries counts, never the draft's text.
  ------------------------------------------------------------------------
  insert into public.engagement_states
    (organization_id, project_id, candidate_id, state)
  values (v_org, v_project, v_cc01, 'replied')
  returning id into v_lane1;
  if v_lane1 is null then
    raise exception 'INVARIANT-FAIL (2): the agent could not birth the lane';
  end if;

  update public.engagement_states
     set state = 'timing_follow_up',
         next_follow_up_at = current_date + 4,
         draft = '{"subject": "Re: A CTO mandate", "body": "Following up after Thursday — brackenfold window noted."}'::jsonb,
         updated_at = now()
   where id = v_lane1;

  perform public.record_agent_event(
    'engagement_updated', v_project, v_cc01,
    jsonb_build_object('agent_kind', 'engagement', 'thread_messages', 2,
                       'inbound', 1, 'outbound', 1, 'state', 'timing_follow_up',
                       'has_draft', true, 'escalated', false));

  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);

  select state, draft->>'subject' into v_text, v_type
    from public.engagement_states where id = v_lane1;
  if v_text is distinct from 'timing_follow_up'
     or v_type is distinct from 'Re: A CTO mandate' then
    raise exception 'INVARIANT-FAIL (2): the agent''s maintenance did not land (state %, draft %)', v_text, v_type;
  end if;

  select count(*) into v_count from public.activity_events
   where detail::text like '%brackenfold%';
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (2): the draft''s text rode the trail';
  end if;
  select actor_id, actor_label into v_uuid, v_text
    from public.activity_events where event_type = 'engagement_updated';
  if v_uuid is distinct from v_en or v_text is distinct from 'Candidate Engagement Agent' then
    raise exception 'INVARIANT-FAIL (2): the event wears the wrong face (% / %)', v_uuid, v_text;
  end if;
  execute 'set local role authenticated';

  ------------------------------------------------------------------------
  -- (3) History intact at TWENTY-EIGHT — by COUNT.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_en, 'role', 'authenticated')::text, true);
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
                        'engagement_updated'])
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
  if v_count <> 28 then
    raise exception 'INVARIANT-FAIL (3): % of 28 history probes landed — a type vanished SILENTLY', v_count;
  end if;
  execute 'set local role authenticated';

  ------------------------------------------------------------------------
  -- (4) THE ESCALATED PIN, all faces.
  ------------------------------------------------------------------------
  -- (4a) The raise lands, reason carried.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_en, 'role', 'authenticated')::text, true);
  update public.engagement_states
     set state = 'escalated',
         escalation_reason = 'candidate asked for a human (harness)',
         updated_at = now()
   where id = v_lane1;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  select state into v_text from public.engagement_states where id = v_lane1;
  if v_text is distinct from 'escalated' then
    raise exception 'INVARIANT-FAIL (4a): the agent''s raise did not land (%)', v_text;
  end if;
  execute 'set local role authenticated';

  -- (4b) The escalated row is DEAD to the agent: the resolve attempt
  --      and the draft touch both land nowhere (USING filters — no
  --      error, zero rows).
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_en, 'role', 'authenticated')::text, true);
  update public.engagement_states
     set state = 'replied', escalation_reason = null where id = v_lane1;
  update public.engagement_states
     set draft = '{"subject": "smuggled", "body": "smuggled"}'::jsonb
   where id = v_lane1;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  select state, draft->>'subject' into v_text, v_type
    from public.engagement_states where id = v_lane1;
  if v_text is distinct from 'escalated' then
    raise exception 'INVARIANT-FAIL (4b): the AGENT resolved its own escalation (state %)', v_text;
  end if;
  if v_type is distinct from 'Re: A CTO mandate' then
    raise exception 'INVARIANT-FAIL (4b): the agent touched an escalated row''s draft (%)', v_type;
  end if;
  execute 'set local role authenticated';

  -- (4c) A raise without a reason is refused (fresh lane on cc02).
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_en, 'role', 'authenticated')::text, true);
  insert into public.engagement_states
    (organization_id, project_id, candidate_id, state)
  values (v_org, v_project, v_cc02, 'awaiting_reply')
  returning id into v_lane2;
  v_raised := false;
  begin
    update public.engagement_states
       set state = 'escalated' where id = v_lane2;
  exception when others then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (4c): a reasonless escalation landed';
  end if;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);

  -- (4d) The reason cannot outlive the escalation — coherence CHECK,
  --      bidirectional, refused even owner-side.
  v_raised := false;
  begin
    update public.engagement_states
       set escalation_reason = 'stale claim' where id = v_lane2;
  exception when check_violation then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (4d): a reason exists without its escalation';
  end if;
  -- Owner-side check done — re-enter the role (the 098 lesson).
  execute 'set local role authenticated';

  -- (4e) The RECRUITER resolves: state moves off escalated, the
  --      reason goes with it.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_recruiter, 'role', 'authenticated')::text, true);
  update public.engagement_states
     set state = 'responding', escalation_reason = null, updated_at = now()
   where id = v_lane1;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  select state, escalation_reason into v_text, v_type
    from public.engagement_states where id = v_lane1;
  if v_text is distinct from 'responding' or v_type is not null then
    raise exception 'INVARIANT-FAIL (4e): the recruiter''s resolve did not land (%/%)', v_text, v_type;
  end if;
  execute 'set local role authenticated';

  -- (4f) The viewer's edit lands nowhere.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_viewer, 'role', 'authenticated')::text, true);
  update public.engagement_states set state = 'closed' where id = v_lane1;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  select state into v_text from public.engagement_states where id = v_lane1;
  if v_text is distinct from 'responding' then
    raise exception 'INVARIANT-FAIL (4f): a VIEWER moved an engagement lane';
  end if;
  execute 'set local role authenticated';

  -- (4g) No human INSERT door; no DELETE door for anyone.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_recruiter, 'role', 'authenticated')::text, true);
  v_raised := false;
  begin
    insert into public.engagement_states
      (organization_id, project_id, candidate_id, state)
    values (v_org, v_project, v_cc01, 'awaiting_reply');
  exception when others then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (4g): a HUMAN birthed a lane';
  end if;
  delete from public.engagement_states where id = v_lane1;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_en, 'role', 'authenticated')::text, true);
  delete from public.engagement_states where id = v_lane1;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  select count(*) into v_count from public.engagement_states where id = v_lane1;
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL (4g): a lane was DELETED';
  end if;
  execute 'set local role authenticated';

  -- (4h) The trail doors: unknown types refused; humans refused.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_en, 'role', 'authenticated')::text, true);
  v_raised := false;
  begin
    perform public.record_agent_event('engagement_hallucinated');
  exception when others then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (4h): the agent recorded an unknown type';
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_recruiter, 'role', 'authenticated')::text, true);
  v_raised := false;
  begin
    perform public.record_agent_event('engagement_updated');
  exception when insufficient_privilege then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (4h): a recruiter recorded engagement_updated through the agent door';
  end if;

  ------------------------------------------------------------------------
  -- (5) The negative matrix under the agent.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_en, 'role', 'authenticated')::text, true);
  select count(*) into v_count from public.clients;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (5): the agent reads % clients rows', v_count;
  end if;
  select count(*) into v_count from public.organizations;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (5): the agent reads % organizations rows', v_count;
  end if;
  select count(*) into v_count from public.activity_events;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (5): the agent reads % activity_events rows', v_count;
  end if;
  select count(*), count(*) filter (where id = v_en)
    into v_count, v_count2 from public.users;
  if v_count <> 1 or v_count2 <> 1 then
    raise exception 'INVARIANT-FAIL (5): the agent reads % users rows (self: %)', v_count, v_count2;
  end if;
  select count(*) into v_count from public.candidate_erasure_requests;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (5): the agent reads the erasure queue (% rows)', v_count;
  end if;

  ------------------------------------------------------------------------
  -- (6) Kill switches independent at TWENTY-THREE.
  ------------------------------------------------------------------------
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  update public.users set status = 'suspended' where id = v_en;
  execute 'set local role authenticated';

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_en, 'role', 'authenticated')::text, true);
  select count(*) into v_count from public.engagement_states;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (6): the SUSPENDED agent still reads % lanes', v_count;
  end if;
  update public.engagement_states
     set state = 'closed' where id = v_lane2;
  v_raised := false;
  begin
    perform public.record_agent_event('engagement_updated');
  exception when insufficient_privilege then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (6): the suspended agent recorded an event';
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_calagent, 'role', 'authenticated')::text, true);
  perform public.record_agent_event(
    'calibration_derived', null, null,
    jsonb_build_object('agent_kind', 'calibration', 'probe', 'twentythree-way-independence'));

  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  select state into v_text from public.engagement_states where id = v_lane2;
  if v_text is distinct from 'awaiting_reply' then
    raise exception 'INVARIANT-FAIL (6): the suspended agent''s write landed (%)', v_text;
  end if;
  select count(*) into v_count from public.activity_events
   where event_type = 'calibration_derived' and actor_id = v_calagent
     and detail->>'probe' = 'twentythree-way-independence';
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL (6): the Calibration Agent''s event did not land with the Engagement Agent down';
  end if;
  update public.users set status = 'active' where id = v_en;

  raise notice 'ALL AGENT-ENGAGEMENT INVARIANTS PASSED';
end
$checks$;

rollback;
