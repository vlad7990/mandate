-- Agent-relationship invariants (migration 098: the twenty-second
-- agent principal — the Engage arc's second slice, the person made
-- durable, and the first COLUMN pin: DNC writes are RPC-only, guarded
-- by trigger + transaction-local GUC (the 043 guard_subject_notified
-- family), binding agents AND humans alike outside the named doors).
--
-- Rolled back; forged-JWT assertions per the house pattern. 098 mints
-- everything this file pins:
--
--    1. THE RESOLVER: same identity fields → same profile; distinct →
--       distinct; UNIQUE (org, identity_key) enforced; an identity
--       EDIT re-links the candidate row to the new person while the
--       sibling row keeps the old one.
--    2. The agent's merge-write lands (disposition / relationship_
--       state / follow-ups) with the dnc family untouched; the event
--       carries counts and the disposition's text is provably absent
--       from the trail; attribution pins.
--    3. History intact at TWENTY-SEVEN by COUNT (§42 doctrine).
--    4. THE DNC PIN, all faces — this slice's control tripwire: a
--       direct dnc write is refused for the AGENT and for the
--       RECRUITER alike (RPC-only); set_network_dnc refuses an agent,
--       refuses a missing reason, and lands for the recruiter
--       actor-stamped; the agent may still maintain a suppressed
--       profile but dnc SURVIVES it and the state cannot leave
--       do_not_contact by its hand; clear_network_dnc refuses
--       non-founders and a missing reason, and lands for the founder;
--       a dnc without reason is refused by table CHECK even through
--       the armed GUC; the PORTAL's erasure RPC suppresses the person
--       SYSTEMICALLY (dnc_set_by NULL); the human dnc event types are
--       refused at the agent's trail door; negative matrix unchanged;
--       no INSERT/DELETE door exists for anyone.
--    5. Kill switches independent at TWENTY-TWO.
--
-- On success: NOTICE 'ALL AGENT-RELATIONSHIP INVARIANTS PASSED'.
--
-- Control run (2026-08-25, verified): guard_network_dnc REBUILT with
-- v_allowed forced true ("the RPCs are the only callers anyway") —
-- the agent set dnc by direct UPDATE and the harness aborted at
-- INVARIANT-FAIL (4a); drift and harness in ONE transaction, the
-- abort rolling the rebuild back — the first control to regress a
-- COLUMN pin.
--
-- GUC discipline inside this file: a successful DNC RPC leaves
-- mandate.allow_dnc_write = 'on' for the REST of the transaction
-- (set_config is_local is transaction-scoped), so every successful
-- RPC call is followed by an explicit disarm — otherwise later guard
-- refusal checks would silently test nothing.

begin;

insert into public.organizations (id, name, slug) values
  ('09800000-0000-4000-8000-0000000000a0', 'RL Org A', 'rl-org-a');

insert into auth.users (id, email) values
  ('09800000-0000-4000-8000-0000000000a1', 'rl-admin@test.local'),
  ('09800000-0000-4000-8000-0000000000a2', 'rl-recruiter@test.local'),
  ('09800000-0000-4000-8000-0000000000a3', 'rl-viewer@test.local'),
  ('09800000-0000-4000-8000-0000000000aa', 'rl-calibration@test.local'),
  ('09800000-0000-4000-8000-0000000000ab', 'rl-relationship@test.local');

update public.users set organization_id = '09800000-0000-4000-8000-0000000000a0',
       status = 'active', role = 'admin', full_name = 'RL Admin'
 where id = '09800000-0000-4000-8000-0000000000a1';
update public.users set organization_id = '09800000-0000-4000-8000-0000000000a0',
       status = 'active', role = 'recruiter', full_name = 'RL Recruiter'
 where id = '09800000-0000-4000-8000-0000000000a2';
update public.users set organization_id = '09800000-0000-4000-8000-0000000000a0',
       status = 'active', role = 'viewer', full_name = 'RL Viewer'
 where id = '09800000-0000-4000-8000-0000000000a3';
update public.users set organization_id = '09800000-0000-4000-8000-0000000000a0',
       status = 'active', role = 'agent', full_name = 'Calibration Agent'
 where id = '09800000-0000-4000-8000-0000000000aa';
update public.users set organization_id = '09800000-0000-4000-8000-0000000000a0',
       status = 'active', role = 'agent', full_name = 'Candidate Relationship Agent'
 where id = '09800000-0000-4000-8000-0000000000ab';

insert into public.projects (id, organization_id, created_by, title, company_name, one_line_input) values
  ('09800000-0000-4000-8000-00000000aa01', '09800000-0000-4000-8000-0000000000a0',
   '09800000-0000-4000-8000-0000000000a2',
   'CFO Search', 'Acme Treasury', 'CFO for Acme Treasury (harness)');

-- Three candidate rows, two identities: cc01 and cc02 share an email
-- (one person, two rows); cc03 is someone else. The link trigger
-- resolves profiles at INSERT.
insert into public.candidates (id, project_id, organization_id, full_name, email) values
  ('09800000-0000-4000-8000-00000000cc01', '09800000-0000-4000-8000-00000000aa01',
   '09800000-0000-4000-8000-0000000000a0', 'Dorian Vell', 'dorian.vell@harness.test'),
  ('09800000-0000-4000-8000-00000000cc02', '09800000-0000-4000-8000-00000000aa01',
   '09800000-0000-4000-8000-0000000000a0', 'Dorian Vell', 'dorian.vell@harness.test'),
  ('09800000-0000-4000-8000-00000000cc03', '09800000-0000-4000-8000-00000000aa01',
   '09800000-0000-4000-8000-0000000000a0', 'Sable Rooke', 'sable.rooke@harness.test');

-- A lawful portal token for Dorian's identity — the erasure RPC's door.
insert into public.candidate_portal_tokens
  (id, organization_id, identity_key, token, recipient_label, expires_at)
values
  ('09800000-0000-4000-8000-00000000dd01', '09800000-0000-4000-8000-0000000000a0',
   public.candidate_identity_key('dorian.vell@harness.test', null, 'Dorian Vell', null),
   '09800000-0000-4000-8000-00000000dd02', 'Dorian Vell', now() + interval '1 hour');

do $checks$
declare
  v_admin     uuid := '09800000-0000-4000-8000-0000000000a1';
  v_recruiter uuid := '09800000-0000-4000-8000-0000000000a2';
  v_viewer    uuid := '09800000-0000-4000-8000-0000000000a3';
  v_calagent  uuid := '09800000-0000-4000-8000-0000000000aa';
  v_rl        uuid := '09800000-0000-4000-8000-0000000000ab';
  v_org       uuid := '09800000-0000-4000-8000-0000000000a0';
  v_cc01      uuid := '09800000-0000-4000-8000-00000000cc01';
  v_cc02      uuid := '09800000-0000-4000-8000-00000000cc02';
  v_cc03      uuid := '09800000-0000-4000-8000-00000000cc03';
  v_token     uuid := '09800000-0000-4000-8000-00000000dd02';
  v_p_dorian  uuid;
  v_p_sable   uuid;
  v_p_moved   uuid;
  v_count     int;
  v_count2    int;
  v_raised    boolean;
  v_text      text;
  v_uuid      uuid;
  v_bool      boolean;
  v_jsonb     jsonb;
  v_type      text;
begin
  ------------------------------------------------------------------------
  -- (1) The resolver: determinism, uniqueness, re-link on identity edit.
  ------------------------------------------------------------------------
  select network_profile_id into v_p_dorian from public.candidates where id = v_cc01;
  select network_profile_id into v_uuid     from public.candidates where id = v_cc02;
  select network_profile_id into v_p_sable  from public.candidates where id = v_cc03;
  if v_p_dorian is null or v_p_sable is null then
    raise exception 'INVARIANT-FAIL (1): the link trigger left a candidate personless';
  end if;
  if v_uuid is distinct from v_p_dorian then
    raise exception 'INVARIANT-FAIL (1): two rows with one identity resolved to TWO people';
  end if;
  if v_p_dorian = v_p_sable then
    raise exception 'INVARIANT-FAIL (1): two identities resolved to ONE person';
  end if;

  v_raised := false;
  begin
    insert into public.network_profiles (organization_id, identity_key, display_name)
    values (v_org, public.candidate_identity_key('dorian.vell@harness.test', null, 'Dorian Vell', null), 'Dorian Vell');
  exception when unique_violation then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (1): a second profile for one person was born';
  end if;

  -- The identity edit re-links THIS row; the sibling keeps the person.
  update public.candidates set email = 'dorian.moved@harness.test' where id = v_cc02;
  select network_profile_id into v_p_moved from public.candidates where id = v_cc02;
  if v_p_moved is null or v_p_moved = v_p_dorian then
    raise exception 'INVARIANT-FAIL (1): the identity edit did not re-link';
  end if;
  select network_profile_id into v_uuid from public.candidates where id = v_cc01;
  if v_uuid is distinct from v_p_dorian then
    raise exception 'INVARIANT-FAIL (1): the sibling row lost its person on another row''s edit';
  end if;

  execute 'set local role authenticated';

  ------------------------------------------------------------------------
  -- (2) The agent's merge-write lands; the dnc family is untouched;
  --     the trail carries counts, never the disposition's text.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_rl, 'role', 'authenticated')::text, true);

  select count(*) into v_count from public.network_profiles;
  if v_count <> 3 then
    raise exception 'INVARIANT-FAIL (2): the agent reads % of 3 profiles', v_count;
  end if;

  update public.network_profiles
     set disposition = '{"timing": "quillmarsh window in six months", "motivation": "scope"}'::jsonb,
         relationship_state = 'engaged',
         follow_up_at = current_date + 30,
         last_meaningful_contact_at = now(),
         updated_at = now()
   where id = v_p_sable;

  perform public.record_agent_event(
    'relationship_updated', null, v_cc03,
    jsonb_build_object('agent_kind', 'relationship', 'appearances', 1,
                       'contacts', 0, 'disposition_fields', 2,
                       'state', 'engaged'));

  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);

  select relationship_state, dnc, disposition->>'motivation'
    into v_text, v_bool, v_type
    from public.network_profiles where id = v_p_sable;
  if v_text is distinct from 'engaged' or v_type is distinct from 'scope' then
    raise exception 'INVARIANT-FAIL (2): the agent''s merge-write did not land (state %, motivation %)', v_text, v_type;
  end if;
  if v_bool then
    raise exception 'INVARIANT-FAIL (2): dnc moved under the agent''s merge-write';
  end if;

  select count(*) into v_count from public.activity_events
   where detail::text like '%quillmarsh%';
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (2): the disposition''s text rode the trail';
  end if;
  select actor_id, actor_label into v_uuid, v_text
    from public.activity_events where event_type = 'relationship_updated';
  if v_uuid is distinct from v_rl or v_text is distinct from 'Candidate Relationship Agent' then
    raise exception 'INVARIANT-FAIL (2): the event wears the wrong face (% / %)', v_uuid, v_text;
  end if;
  execute 'set local role authenticated';

  ------------------------------------------------------------------------
  -- (3) History intact at TWENTY-SEVEN — by COUNT.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_rl, 'role', 'authenticated')::text, true);
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
                        'outreach_strategy_drafted', 'relationship_updated'])
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
  if v_count <> 27 then
    raise exception 'INVARIANT-FAIL (3): % of 27 history probes landed — a type vanished SILENTLY', v_count;
  end if;
  execute 'set local role authenticated';

  ------------------------------------------------------------------------
  -- (4) THE DNC PIN, all faces.
  ------------------------------------------------------------------------
  -- (4a) The AGENT cannot write dnc directly.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_rl, 'role', 'authenticated')::text, true);
  v_raised := false;
  begin
    update public.network_profiles
       set dnc = true, dnc_reason = 'agent says so', dnc_set_at = now()
     where id = v_p_sable;
  exception when others then v_raised := true; end;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  select dnc into v_bool from public.network_profiles where id = v_p_sable;
  if v_bool then
    raise exception 'INVARIANT-FAIL (4a): the AGENT set do-not-contact';
  end if;
  execute 'set local role authenticated';

  -- (4b) The agent cannot move the state into do_not_contact.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_rl, 'role', 'authenticated')::text, true);
  v_raised := false;
  begin
    update public.network_profiles
       set relationship_state = 'do_not_contact' where id = v_p_sable;
  exception when others then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (4b): the agent moved a relationship into do_not_contact';
  end if;

  -- (4c) The RECRUITER cannot write dnc directly either — RPC-only.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_recruiter, 'role', 'authenticated')::text, true);
  v_raised := false;
  begin
    update public.network_profiles
       set dnc = true, dnc_reason = 'by hand', dnc_set_at = now(), dnc_set_by = v_recruiter
     where id = v_p_sable;
  exception when others then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (4c): a direct dnc write bypassed the RPCs';
  end if;

  -- (4d) A suppression without a reason is refused at the RPC.
  v_raised := false;
  begin
    perform public.set_network_dnc(v_p_sable, '   ');
  exception when check_violation then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (4d): a reasonless suppression landed';
  end if;

  -- (4e) The agent is refused at set_network_dnc by name.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_rl, 'role', 'authenticated')::text, true);
  v_raised := false;
  begin
    perform public.set_network_dnc(v_p_sable, 'agent suppression');
  exception when insufficient_privilege then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (4e): an agent suppressed a person through the RPC';
  end if;

  -- (4f) The recruiter's suppression lands, actor-stamped, evented.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_recruiter, 'role', 'authenticated')::text, true);
  perform public.set_network_dnc(v_p_sable, 'asked us to stop contacting them (harness)');
  perform set_config('mandate.allow_dnc_write', 'off', true);  -- disarm
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  select dnc, dnc_set_by, relationship_state into v_bool, v_uuid, v_text
    from public.network_profiles where id = v_p_sable;
  if not v_bool or v_uuid is distinct from v_recruiter
     or v_text is distinct from 'do_not_contact' then
    raise exception 'INVARIANT-FAIL (4f): the recruiter''s suppression did not land whole (dnc %, by %, state %)', v_bool, v_uuid, v_text;
  end if;
  select count(*) into v_count from public.activity_events
   where event_type = 'network_dnc_set' and actor_id = v_recruiter
     and detail->>'source' = 'recruiter';
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL (4f): the suppression left no honest event';
  end if;
  execute 'set local role authenticated';

  -- (4g) The agent may keep maintaining a suppressed profile — but
  --      dnc SURVIVES it, and the state cannot leave do_not_contact.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_rl, 'role', 'authenticated')::text, true);
  update public.network_profiles
     set disposition = disposition || '{"note_count": 1}'::jsonb
   where id = v_p_sable;
  v_raised := false;
  begin
    update public.network_profiles
       set relationship_state = 'cold' where id = v_p_sable;
  exception when others then v_raised := true; end;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  select dnc, relationship_state, disposition->>'note_count' into v_bool, v_text, v_type
    from public.network_profiles where id = v_p_sable;
  if not v_bool or v_text is distinct from 'do_not_contact' then
    raise exception 'INVARIANT-FAIL (4g): the agent moved a suppressed person (%/%)', v_bool, v_text;
  end if;
  if v_type is distinct from '1' then
    raise exception 'INVARIANT-FAIL (4g): lawful maintenance of a suppressed profile was lost';
  end if;
  execute 'set local role authenticated';

  -- (4h) clear_network_dnc: non-founder refused; founder without a
  --      reason refused; the founder's clear lands and is evented.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_recruiter, 'role', 'authenticated')::text, true);
  v_raised := false;
  begin
    perform public.clear_network_dnc(v_p_sable, 'recruiter clears');
  exception when insufficient_privilege then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (4h): a non-founder cleared do-not-contact';
  end if;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  update public.users set is_founder = true where id = v_admin;
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  v_raised := false;
  begin
    perform public.clear_network_dnc(v_p_sable, '');
  exception when check_violation then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (4h): a reasonless clear landed';
  end if;
  perform public.clear_network_dnc(v_p_sable, 'verified directly with the person (harness)');
  perform set_config('mandate.allow_dnc_write', 'off', true);  -- disarm
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  select dnc, relationship_state into v_bool, v_text
    from public.network_profiles where id = v_p_sable;
  if v_bool or v_text is distinct from 'cold' then
    raise exception 'INVARIANT-FAIL (4h): the founder''s clear did not land (%/%)', v_bool, v_text;
  end if;
  select count(*) into v_count from public.activity_events
   where event_type = 'network_dnc_cleared' and actor_id = v_admin;
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL (4h): the clear left no honest event';
  end if;

  -- (4i) A dnc without a reason cannot exist even through an armed
  --      GUC — the table CHECK is the last line.
  v_raised := false;
  begin
    perform set_config('mandate.allow_dnc_write', 'on', true);
    update public.network_profiles
       set dnc = true, dnc_reason = null, dnc_set_at = now()
     where id = v_p_sable;
  exception when check_violation then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (4i): a reasonless suppression exists';
  end if;

  -- (4j) The PORTAL's erasure RPC suppresses the person SYSTEMICALLY.
  perform public.candidate_portal_request_erasure(v_token, 'please remove me (harness)');
  perform set_config('mandate.allow_dnc_write', 'off', true);  -- disarm
  select dnc, dnc_set_by, dnc_reason into v_bool, v_uuid, v_text
    from public.network_profiles where id = v_p_dorian;
  if not v_bool or v_uuid is not null
     or v_text is distinct from 'erasure requested via their portal' then
    raise exception 'INVARIANT-FAIL (4j): the erasure did not suppress systemically (dnc %, by %, reason %)', v_bool, v_uuid, v_text;
  end if;
  select count(*) into v_count from public.candidate_erasure_requests
   where organization_id = v_org;
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL (4j): the erasure request row is missing';
  end if;
  select count(*) into v_count from public.activity_events
   where event_type = 'network_dnc_set' and detail->>'source' = 'erasure';
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL (4j): the systemic suppression left no event';
  end if;

  -- (4k) The viewer's edit lands nowhere; nobody INSERTs or DELETEs.
  -- ((4i)/(4j) ran owner-side on purpose — re-enter the role first,
  -- or the "viewer" probe tests the superuser.)
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_viewer, 'role', 'authenticated')::text, true);
  update public.network_profiles set follow_up_note = 'viewer note' where id = v_p_sable;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  select follow_up_note into v_text from public.network_profiles where id = v_p_sable;
  if v_text is not null then
    raise exception 'INVARIANT-FAIL (4k): a VIEWER edited a relationship';
  end if;
  execute 'set local role authenticated';

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_rl, 'role', 'authenticated')::text, true);
  v_raised := false;
  begin
    insert into public.network_profiles (organization_id, identity_key, display_name)
    values (v_org, 'email:born-by-agent@harness.test', 'Agent Born');
  exception when others then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (4k): the agent BIRTHED a person';
  end if;
  delete from public.network_profiles where id = v_p_sable;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  select count(*) into v_count from public.network_profiles where id = v_p_sable;
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL (4k): the agent DELETED a person';
  end if;
  execute 'set local role authenticated';

  -- (4l) The negative matrix under the agent; the trail doors.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_rl, 'role', 'authenticated')::text, true);
  select count(*) into v_count from public.clients;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (4l): the agent reads % clients rows', v_count;
  end if;
  select count(*) into v_count from public.organizations;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (4l): the agent reads % organizations rows', v_count;
  end if;
  select count(*) into v_count from public.activity_events;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (4l): the agent reads % activity_events rows', v_count;
  end if;
  select count(*), count(*) filter (where id = v_rl)
    into v_count, v_count2 from public.users;
  if v_count <> 1 or v_count2 <> 1 then
    raise exception 'INVARIANT-FAIL (4l): the agent reads % users rows (self: %)', v_count, v_count2;
  end if;
  select count(*) into v_count from public.candidate_erasure_requests;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (4l): the agent reads the erasure queue (% rows)', v_count;
  end if;

  -- The HUMAN dnc types are refused at the agent's trail door.
  v_raised := false;
  begin
    perform public.record_agent_event('network_dnc_set');
  exception when others then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (4l): the agent recorded a HUMAN dnc event';
  end if;
  v_raised := false;
  begin
    perform public.record_agent_event('relationship_hallucinated');
  exception when others then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (4l): the agent recorded an unknown type';
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_recruiter, 'role', 'authenticated')::text, true);
  v_raised := false;
  begin
    perform public.record_agent_event('relationship_updated');
  exception when insufficient_privilege then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (4l): a recruiter recorded relationship_updated through the agent door';
  end if;

  ------------------------------------------------------------------------
  -- (5) Kill switches independent at TWENTY-TWO.
  ------------------------------------------------------------------------
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  update public.users set status = 'suspended' where id = v_rl;
  execute 'set local role authenticated';

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_rl, 'role', 'authenticated')::text, true);
  select count(*) into v_count from public.network_profiles;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (5): the SUSPENDED agent still reads % profiles', v_count;
  end if;
  update public.network_profiles
     set disposition = '{"suspended": true}'::jsonb where id = v_p_sable;
  v_raised := false;
  begin
    perform public.record_agent_event('relationship_updated');
  exception when insufficient_privilege then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (5): the suspended agent recorded an event';
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_calagent, 'role', 'authenticated')::text, true);
  perform public.record_agent_event(
    'calibration_derived', null, null,
    jsonb_build_object('agent_kind', 'calibration', 'probe', 'twentytwo-way-independence'));

  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  select disposition->>'suspended' into v_type
    from public.network_profiles where id = v_p_sable;
  if v_type is not null then
    raise exception 'INVARIANT-FAIL (5): the suspended agent''s write landed';
  end if;
  select count(*) into v_count from public.activity_events
   where event_type = 'calibration_derived' and actor_id = v_calagent
     and detail->>'probe' = 'twentytwo-way-independence';
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL (5): the Calibration Agent''s event did not land with the Relationship Agent down';
  end if;
  update public.users set status = 'active' where id = v_rl;

  raise notice 'ALL AGENT-RELATIONSHIP INVARIANTS PASSED';
end
$checks$;

rollback;
