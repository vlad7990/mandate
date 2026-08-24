-- Agent-execintel invariants (migration 095: the nineteenth agent
-- principal — ONE identity, THREE judgments, the largest grant
-- cluster since 074; two artifact doors double-pinned on
-- status='draft', the executive ledger's agent door pinned on
-- actor_id = auth.uid()).
--
-- Rolled back; forged-JWT assertions per the house pattern. This
-- file pins:
--
--    1. READ COVERAGE by COUNT — searches, profiles, plans, BOTH
--       competency reaches (including the GLOBAL library rows,
--       organization_id NULL), search-competency links.
--    2. The three judgments LAND with the human's allocations
--       surviving: the context merge leaves the intake fields and
--       created_by untouched (the 074 projects precedent — column
--       discipline is THIS pin, not a policy); the profile and plan
--       land on their draft placeholders with version/created_by
--       intact; the agent's audit insert lands under its OWN id;
--       the three main-trail events carry counts, never content.
--    3. THE AUDIT ACTOR PIN — a forged actor_id (a human's) is
--       refused by the WITH CHECK (the 087 impersonation
--       precedent, executive-ledger edition); attribution pins on
--       the main trail.
--    4. History intact at TWENTY-THREE by COUNT (§42 doctrine).
--    5. THE APPROVED PIN, BOTH DIRECTIONS, BOTH TABLES — the
--       agent's UPDATE against an APPROVED profile/plan lands on
--       zero rows (USING), an UPDATE that would SET
--       status='approved' is REFUSED (WITH CHECK); artifact INSERT
--       refused (allocation is the human's act); the negative
--       matrix (clients / organizations / activity_events zero,
--       users self-only); the recruiter refused at the agent trail
--       door; an unknown type refused by name.
--    6. Kill switches independent at NINETEEN — the suspended
--       Executive Intelligence Agent reads zero executive rows, is
--       refused at both trail doors, while the Copilot Agent's
--       event still lands.
--
-- On success: NOTICE 'ALL AGENT-EXECINTEL INVARIANTS PASSED'.
--
-- Control run (2026-08-24, verified): role_success_profiles_agent_update
-- REBUILT with the WITH CHECK status conjunct dropped ("USING
-- already refuses approved rows" — 092's drift, third sighting) —
-- the agent APPROVED a draft profile and the harness aborted at
-- INVARIANT-FAIL (5); drift and harness in ONE transaction, the
-- abort rolling the rebuild back — residue-free by construction.

begin;

-- FINDING (Phase 1, recorded): approval immutability on both artifact
-- tables is ALREADY a trigger boundary — guard_role_success_profiles /
-- guard_executive_interview_plans refuse born-approved rows, mutations
-- of approved/archived rows, and approve-by-UPDATE for EVERYONE, with
-- the approve_*() functions passing via a transaction-local GUC. The
-- 095 pins are the RLS layer of the same boundary. This harness sets
-- both GUCs 'on' for the WHOLE transaction DELIBERATELY: the trigger
-- guard is disarmed, so every refusal proven below is the RLS PIN'S
-- OWN — defense-in-depth proven in isolation, and the pin still holds
-- if a future migration drops the trigger. Transaction-local; the
-- rollback clears it.
select set_config('mandate.allow_profile_transition', 'on', true);
select set_config('mandate.allow_plan_transition', 'on', true);

insert into public.organizations (id, name, slug) values
  ('09500000-0000-4000-8000-0000000000a0', 'EX Org A', 'ex-org-a');

insert into auth.users (id, email) values
  ('09500000-0000-4000-8000-0000000000a2', 'ex-recruiter@test.local'),
  ('09500000-0000-4000-8000-0000000000aa', 'ex-copilot@test.local'),
  ('09500000-0000-4000-8000-0000000000ab', 'ex-execintel@test.local');

update public.users set organization_id = '09500000-0000-4000-8000-0000000000a0',
       status = 'active', role = 'recruiter', full_name = 'EX Recruiter'
 where id = '09500000-0000-4000-8000-0000000000a2';
update public.users set organization_id = '09500000-0000-4000-8000-0000000000a0',
       status = 'active', role = 'agent', full_name = 'Copilot Agent'
 where id = '09500000-0000-4000-8000-0000000000aa';
update public.users set organization_id = '09500000-0000-4000-8000-0000000000a0',
       status = 'active', role = 'agent', full_name = 'Executive Intelligence Agent'
 where id = '09500000-0000-4000-8000-0000000000ab';

insert into public.executive_searches (id, organization_id, created_by, company_name, role_title, industry, company_context, company_context_status) values
  ('09500000-0000-4000-8000-00000000aa01', '09500000-0000-4000-8000-0000000000a0',
   '09500000-0000-4000-8000-0000000000a2',
   'Acme Robotics', 'Chief Product Officer', 'Robotics',
   '{}'::jsonb, 'generating');

-- One GLOBAL library row (organization_id NULL) and one org row —
-- the coverage pin needs both reaches.
insert into public.executive_competencies (id, organization_id, key, name, category, definition, is_global) values
  ('09500000-0000-4000-8000-00000000dd01', null,
   'strategic_vision_0e9', 'Strategic Vision 0E9', 'leadership', 'Sees around corners (harness).', true),
  ('09500000-0000-4000-8000-00000000dd02', '09500000-0000-4000-8000-0000000000a0',
   'hardware_gtm', 'Hardware GTM', 'functional', 'Ships atoms, not just bits (harness).', false);

insert into public.executive_search_competencies (id, search_id, organization_id, competency_id, competency_is_global, weight) values
  ('09500000-0000-4000-8000-00000000ee01', '09500000-0000-4000-8000-00000000aa01',
   '09500000-0000-4000-8000-0000000000a0', '09500000-0000-4000-8000-00000000dd01', true, 80);

insert into public.candidates (id, organization_id, full_name, pipeline_stage) values
  ('09500000-0000-4000-8000-00000000cc01', '09500000-0000-4000-8000-0000000000a0',
   'Vesper Nightingale', 'matched');

-- The APPROVED V1 (the pin's face) and the human's DRAFT V2
-- placeholder (the judgment's landing place) — on both tables.
insert into public.role_success_profiles (id, search_id, organization_id, version, content_json, status, is_generating, created_by, approved_by, approved_at) values
  ('09500000-0000-4000-8000-00000000bb01', '09500000-0000-4000-8000-00000000aa01',
   '09500000-0000-4000-8000-0000000000a0', 1,
   '{"headline": "APPROVED V1 (harness)"}'::jsonb, 'approved', false,
   '09500000-0000-4000-8000-0000000000a2',
   '09500000-0000-4000-8000-0000000000a2', now()),
  ('09500000-0000-4000-8000-00000000bb02', '09500000-0000-4000-8000-00000000aa01',
   '09500000-0000-4000-8000-0000000000a0', 2,
   '{}'::jsonb, 'draft', true,
   '09500000-0000-4000-8000-0000000000a2', null, null);

insert into public.executive_interview_plans (id, search_id, candidate_id, organization_id, source_profile_id, version, content_json, status, is_generating, created_by, approved_by, approved_at) values
  ('09500000-0000-4000-8000-00000000ff01', '09500000-0000-4000-8000-00000000aa01',
   '09500000-0000-4000-8000-00000000cc01', '09500000-0000-4000-8000-0000000000a0',
   '09500000-0000-4000-8000-00000000bb01', 1,
   '{"headline": "APPROVED PLAN V1 (harness)"}'::jsonb, 'approved', false,
   '09500000-0000-4000-8000-0000000000a2',
   '09500000-0000-4000-8000-0000000000a2', now()),
  ('09500000-0000-4000-8000-00000000ff02', '09500000-0000-4000-8000-00000000aa01',
   '09500000-0000-4000-8000-00000000cc01', '09500000-0000-4000-8000-0000000000a0',
   '09500000-0000-4000-8000-00000000bb01', 2,
   '{}'::jsonb, 'draft', true,
   '09500000-0000-4000-8000-0000000000a2', null, null);

do $checks$
declare
  v_recruiter uuid := '09500000-0000-4000-8000-0000000000a2';
  v_cpagent   uuid := '09500000-0000-4000-8000-0000000000aa';
  v_ex        uuid := '09500000-0000-4000-8000-0000000000ab';
  v_org       uuid := '09500000-0000-4000-8000-0000000000a0';
  v_search    uuid := '09500000-0000-4000-8000-00000000aa01';
  v_prof_appr uuid := '09500000-0000-4000-8000-00000000bb01';
  v_prof_drft uuid := '09500000-0000-4000-8000-00000000bb02';
  v_plan_appr uuid := '09500000-0000-4000-8000-00000000ff01';
  v_plan_drft uuid := '09500000-0000-4000-8000-00000000ff02';
  v_count     int;
  v_count2    int;
  v_raised    boolean;
  v_text      text;
  v_text2     text;
  v_uuid      uuid;
  v_jsonb     jsonb;
  v_type      text;
  v_bool      boolean;
begin
  execute 'set local role authenticated';

  ------------------------------------------------------------------------
  -- (1) READ COVERAGE — every grounding source visible, by COUNT.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_ex, 'role', 'authenticated')::text, true);

  select count(*) into v_count from public.executive_searches;
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL (1): the agent reads % of 1 executive_searches rows', v_count;
  end if;
  select count(*) into v_count from public.role_success_profiles;
  if v_count <> 2 then
    raise exception 'INVARIANT-FAIL (1): the agent reads % of 2 role_success_profiles rows', v_count;
  end if;
  select count(*) into v_count from public.executive_interview_plans;
  if v_count <> 2 then
    raise exception 'INVARIANT-FAIL (1): the agent reads % of 2 executive_interview_plans rows', v_count;
  end if;
  -- The DURABLE global library has real rows (25 at writing) — count
  -- on the harness's OWN ids, never the durable set (§35 doctrine):
  -- dd01 is the GLOBAL reach (organization_id NULL), dd02 the org one.
  select count(*) into v_count from public.executive_competencies
   where id in ('09500000-0000-4000-8000-00000000dd01',
                '09500000-0000-4000-8000-00000000dd02');
  if v_count <> 2 then
    raise exception 'INVARIANT-FAIL (1): the agent reads % of 2 seeded competencies — a library reach (global or org) is broken', v_count;
  end if;
  select count(*) into v_count from public.executive_search_competencies;
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL (1): the agent reads % of 1 search-competency links', v_count;
  end if;

  ------------------------------------------------------------------------
  -- (2) The three judgments land; the allocations survive.
  ------------------------------------------------------------------------
  -- Context merge onto the search row.
  update public.executive_searches
     set company_context = '{"summary": "quillbrook operating context (harness)"}'::jsonb,
         company_context_status = 'ready'
   where id = v_search;

  -- The profile onto its draft placeholder (status stays draft).
  update public.role_success_profiles
     set content_json = '{"headline": "quillbrook profile (harness)"}'::jsonb,
         is_generating = false, generation_error = null
   where id = v_prof_drft;

  -- The plan onto its draft placeholder.
  update public.executive_interview_plans
     set content_json = '{"headline": "quillbrook plan (harness)"}'::jsonb,
         is_generating = false, generation_error = null
   where id = v_plan_drft;

  -- The executive ledger, under the agent's OWN id.
  insert into public.executive_audit_events (organization_id, search_id, profile_id, actor_id, event_type, detail)
  values (v_org, v_search, v_prof_drft, v_ex, 'profile_generated',
          jsonb_build_object('model_version', 'harness', 'competency_count', 2));

  -- The main trail, all three types, counts only.
  perform public.record_agent_event(
    'executive_context_researched', null, null,
    jsonb_build_object('agent_kind', 'execintel', 'trigger', 'initial', 'sources', 3));
  perform public.record_agent_event(
    'success_profile_generated', null, null,
    jsonb_build_object('agent_kind', 'execintel', 'trigger', 'initial', 'version', 2, 'competencies', 2));
  perform public.record_agent_event(
    'interview_plan_generated', null, null,
    jsonb_build_object('agent_kind', 'execintel', 'trigger', 'initial', 'version', 2, 'stages', 4));

  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);

  select company_context->>'summary', company_context_status, company_name, created_by
    into v_text, v_text2, v_type, v_uuid
    from public.executive_searches where id = v_search;
  if v_text is distinct from 'quillbrook operating context (harness)'
     or v_text2 is distinct from 'ready' then
    raise exception 'INVARIANT-FAIL (2): the context judgment did not land (% / %)', v_text, v_text2;
  end if;
  if v_type is distinct from 'Acme Robotics' or v_uuid is distinct from v_recruiter then
    raise exception 'INVARIANT-FAIL (2): the HUMAN''s intake was disturbed by the merge (company %, created_by %)', v_type, v_uuid;
  end if;

  select content_json->>'headline', version, created_by, status
    into v_text, v_count, v_uuid, v_text2
    from public.role_success_profiles where id = v_prof_drft;
  if v_text is distinct from 'quillbrook profile (harness)' or v_text2 is distinct from 'draft' then
    raise exception 'INVARIANT-FAIL (2): the profile judgment did not land honestly (% / %)', v_text, v_text2;
  end if;
  if v_count <> 2 or v_uuid is distinct from v_recruiter then
    raise exception 'INVARIANT-FAIL (2): the profile allocation was disturbed (version %, created_by %)', v_count, v_uuid;
  end if;

  select content_json->>'headline', version, created_by
    into v_text, v_count, v_uuid
    from public.executive_interview_plans where id = v_plan_drft;
  if v_text is distinct from 'quillbrook plan (harness)' or v_count <> 2
     or v_uuid is distinct from v_recruiter then
    raise exception 'INVARIANT-FAIL (2): the plan judgment/allocation is wrong (%, v%, %)', v_text, v_count, v_uuid;
  end if;

  select count(*) into v_count from public.executive_audit_events
   where event_type = 'profile_generated' and actor_id = v_ex;
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL (2): the agent''s executive-ledger entry did not land';
  end if;

  select count(*) into v_count from public.activity_events
   where detail::text like '%quillbrook%';
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (2): generated content rode the main trail';
  end if;
  select count(*) into v_count from public.activity_events
   where event_type in ('executive_context_researched', 'success_profile_generated', 'interview_plan_generated')
     and actor_id = v_ex;
  if v_count <> 3 then
    raise exception 'INVARIANT-FAIL (2): % of 3 main-trail events landed under the agent', v_count;
  end if;
  execute 'set local role authenticated';

  ------------------------------------------------------------------------
  -- (3) THE AUDIT ACTOR PIN — a forged human actor_id refused.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_ex, 'role', 'authenticated')::text, true);

  v_raised := false;
  begin
    insert into public.executive_audit_events (organization_id, search_id, actor_id, event_type, detail)
    values (v_org, v_search, v_recruiter, 'profile_generated',
            jsonb_build_object('forged', true));
  exception when others then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (3): the agent signed a HUMAN''s name in the executive ledger';
  end if;

  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  select actor_label into v_text from public.activity_events
   where event_type = 'success_profile_generated';
  if v_text is distinct from 'Executive Intelligence Agent' then
    raise exception 'INVARIANT-FAIL (3): the main-trail label is %, not the agent''s name', v_text;
  end if;
  execute 'set local role authenticated';

  ------------------------------------------------------------------------
  -- (4) The vocabulary's history is intact at TWENTY-THREE — by COUNT.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_ex, 'role', 'authenticated')::text, true);

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
                        'executive_context_researched'])
  loop
    begin
      perform public.record_agent_event(
        v_type, null, null,
        jsonb_build_object('probe', 'history-intact'));
    exception when others then
      raise exception 'INVARIANT-FAIL (4): the vocabulary lost an event type (% refused: %)',
        v_type, sqlerrm;
    end;
  end loop;

  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  select count(*) into v_count from public.activity_events
   where detail->>'probe' = 'history-intact';
  if v_count <> 23 then
    raise exception 'INVARIANT-FAIL (4): % of 23 history probes landed — the vocabulary lost an event type SILENTLY', v_count;
  end if;
  execute 'set local role authenticated';

  ------------------------------------------------------------------------
  -- (5) THE APPROVED PIN, both directions, BOTH tables — and the
  --     negative matrix.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_ex, 'role', 'authenticated')::text, true);

  -- (5a) USING: the approved artifacts cannot be touched.
  update public.role_success_profiles
     set content_json = '{"headline": "AGENT REWROTE THE APPROVED PROFILE"}'::jsonb
   where id = v_prof_appr;
  update public.executive_interview_plans
     set content_json = '{"headline": "AGENT REWROTE THE APPROVED PLAN"}'::jsonb
   where id = v_plan_appr;

  -- (5b) WITH CHECK: the agent cannot approve.
  v_raised := false;
  begin
    update public.role_success_profiles set status = 'approved' where id = v_prof_drft;
  exception when others then v_raised := true; end;
  v_raised := false;
  begin
    update public.executive_interview_plans set status = 'approved' where id = v_plan_drft;
  exception when others then v_raised := true; end;

  -- (5c) INSERT refused on both artifact tables.
  v_raised := false;
  begin
    insert into public.role_success_profiles (search_id, organization_id, version, content_json, status)
    values (v_search, v_org, 99, '{}'::jsonb, 'draft');
  exception when others then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (5): the agent INSERTED a role_success_profiles row';
  end if;
  v_raised := false;
  begin
    insert into public.executive_interview_plans (search_id, candidate_id, organization_id, version, content_json, status)
    values (v_search, '09500000-0000-4000-8000-00000000cc01', v_org, 99, '{}'::jsonb, 'draft');
  exception when others then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (5): the agent INSERTED an executive_interview_plans row';
  end if;

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
  select count(*), count(*) filter (where id = v_ex)
    into v_count, v_count2 from public.users;
  if v_count <> 1 or v_count2 <> 1 then
    raise exception 'INVARIANT-FAIL (5): the agent reads % users rows (self: %)', v_count, v_count2;
  end if;

  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);

  select content_json->>'headline' into v_text
    from public.role_success_profiles where id = v_prof_appr;
  if v_text is distinct from 'APPROVED V1 (harness)' then
    raise exception 'INVARIANT-FAIL (5): the agent TOUCHED the approved profile (%)', v_text;
  end if;
  select content_json->>'headline' into v_text
    from public.executive_interview_plans where id = v_plan_appr;
  if v_text is distinct from 'APPROVED PLAN V1 (harness)' then
    raise exception 'INVARIANT-FAIL (5): the agent TOUCHED the approved plan (%)', v_text;
  end if;
  select status into v_text from public.role_success_profiles where id = v_prof_drft;
  if v_text is distinct from 'draft' then
    raise exception 'INVARIANT-FAIL (5): the agent APPROVED a draft profile — approval was authored by an agent';
  end if;
  select status into v_text from public.executive_interview_plans where id = v_plan_drft;
  if v_text is distinct from 'draft' then
    raise exception 'INVARIANT-FAIL (5): the agent APPROVED a draft plan — approval was authored by an agent';
  end if;
  execute 'set local role authenticated';

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_recruiter, 'role', 'authenticated')::text, true);
  v_raised := false;
  begin
    perform public.record_agent_event('success_profile_generated');
  exception when insufficient_privilege then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (5): a recruiter recorded success_profile_generated through the agent door';
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_ex, 'role', 'authenticated')::text, true);
  v_raised := false;
  begin
    perform public.record_agent_event('profile_hallucinated');
  exception when others then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (5): the agent recorded an unknown event type';
  end if;

  ------------------------------------------------------------------------
  -- (6) Kill switches independent at NINETEEN.
  ------------------------------------------------------------------------
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  update public.users set status = 'suspended' where id = v_ex;
  execute 'set local role authenticated';

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_ex, 'role', 'authenticated')::text, true);

  select count(*) into v_count from public.executive_searches;
  select count(*) into v_count2 from public.role_success_profiles;
  if v_count <> 0 or v_count2 <> 0 then
    raise exception 'INVARIANT-FAIL (6): the SUSPENDED agent still reads executive rows (% / %)', v_count, v_count2;
  end if;

  v_raised := false;
  begin
    perform public.record_agent_event('success_profile_generated');
  exception when insufficient_privilege then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (6): the suspended agent recorded a main-trail event';
  end if;

  v_raised := false;
  begin
    insert into public.executive_audit_events (organization_id, search_id, actor_id, event_type, detail)
    values (v_org, v_search, v_ex, 'profile_generated', '{}'::jsonb);
  exception when others then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (6): the suspended agent wrote the executive ledger';
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_cpagent, 'role', 'authenticated')::text, true);
  perform public.record_agent_event(
    'copilot_answered', null, null,
    jsonb_build_object('agent_kind', 'copilot', 'probe', 'nineteen-way-independence'));

  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);

  select count(*) into v_count from public.activity_events
   where event_type = 'copilot_answered' and actor_id = v_cpagent
     and detail->>'probe' = 'nineteen-way-independence';
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL (6): the Copilot Agent''s event did not land with the Executive Intelligence Agent down';
  end if;
  update public.users set status = 'active' where id = v_ex;

  raise notice 'ALL AGENT-EXECINTEL INVARIANTS PASSED';
end
$checks$;

rollback;
