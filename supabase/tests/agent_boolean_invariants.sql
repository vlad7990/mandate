-- Agent-boolean invariants (migration 085: the twelfth agent
-- principal — the first new-grant slice since 082; job_specs S,
-- boolean_queries S+I, no U/D).
--
-- Rolled back; forged-JWT assertions per the house pattern. 074 pins
-- the role, 075–084 pin the second through eleventh principals; this
-- file pins the twelfth:
--
--    1. The judgment's inputs and act: the final spec answers the
--       agent (job_specs S, new); the six-row generate-all lands at
--       version 1 org-scoped; the regen reads the current draft
--       (boolean_queries S, new — the draft IS model input) and
--       appends version 2. Events land with the trigger, slot enum,
--       counts, and has_recruiter_feedback as a BOOLEAN — the
--       feedback text absent from the trail.
--    2. THE TENANT PIN — THE control-run tripwire: an INSERT bearing
--       ANOTHER org's id is refused by the new grant's WITH CHECK.
--       The drift this control performs is the "helpful"
--       simplification that drops the org conjunct ("is_agent()
--       already gates it") — under it, an agent's query lands in
--       another tenant's project.
--    3. The vocabulary's history intact at thirteen — by COUNT (§42
--       doctrine).
--    4. The twelfth principal's negative matrix — UNCHANGED — plus
--       THE VERSION-HISTORY PIN: the agent's UPDATE and DELETE
--       against landed queries land on zero rows (no policy grants
--       them; the recruiter's edit/restore acts are the human's
--       own). Plus the forgery boundary both directions and the
--       unknown-type refusal.
--    5. Kill switches independent at twelve — and the suspended
--       agent reads ZERO projects, job_specs, and boolean_queries
--       rows.
--
-- On success: NOTICE 'ALL AGENT-BOOLEAN INVARIANTS PASSED'.
--
-- Control run (2026-08-21, verified): boolean_queries_agent_insert
-- REBUILT with the org conjunct dropped from WITH CHECK. The
-- cross-tenant insert LANDED and the harness aborted at
-- INVARIANT-FAIL (2); drift and harness ran in one transaction, so
-- the abort itself rolled the rebuild back — residue-free by
-- construction, the policy's WITH CHECK verified to carry the org
-- conjunct after. The first control run to regress the ORG boundary,
-- and the first to target a grant minted in the same migration.

begin;

insert into public.organizations (id, name, slug) values
  ('08500000-0000-4000-8000-0000000000a0', 'Boo Org A', 'boo-org-a'),
  ('08500000-0000-4000-8000-0000000000b0', 'Boo Org B', 'boo-org-b');

insert into auth.users (id, email) values
  ('08500000-0000-4000-8000-0000000000a2', 'boo-recruiter@test.local'),
  ('08500000-0000-4000-8000-0000000000aa', 'boo-culture@test.local'),
  ('08500000-0000-4000-8000-0000000000ab', 'boo-boolean@test.local');

update public.users set organization_id = '08500000-0000-4000-8000-0000000000a0',
       status = 'active', role = 'recruiter', full_name = 'Boo Recruiter'
 where id = '08500000-0000-4000-8000-0000000000a2';
update public.users set organization_id = '08500000-0000-4000-8000-0000000000a0',
       status = 'active', role = 'agent', full_name = 'Culture Agent'
 where id = '08500000-0000-4000-8000-0000000000aa';
update public.users set organization_id = '08500000-0000-4000-8000-0000000000a0',
       status = 'active', role = 'agent', full_name = 'Boolean Search Agent'
 where id = '08500000-0000-4000-8000-0000000000ab';

insert into public.projects (id, organization_id, title, company_name, one_line_input, calibration_model, company_context) values
  ('08500000-0000-4000-8000-00000000aa01', '08500000-0000-4000-8000-0000000000a0',
   'CTO Search', 'Boo Co', 'CTO for Boo Co',
   '{"role_title": "CTO"}'::jsonb, '{"industry": "Software"}'::jsonb),
  ('08500000-0000-4000-8000-00000000bb01', '08500000-0000-4000-8000-0000000000b0',
   'Rival Search', 'Rival Co', 'CTO for Rival Co', '{}'::jsonb, '{}'::jsonb);

insert into public.job_specs (id, project_id, organization_id, version, content, content_json, is_final) values
  ('08500000-0000-4000-8000-00000000cc01', '08500000-0000-4000-8000-00000000aa01',
   '08500000-0000-4000-8000-0000000000a0', 1, 'harness final spec',
   '{"title": "CTO", "sections": []}'::jsonb, true);

do $checks$
declare
  v_recruiter  uuid := '08500000-0000-4000-8000-0000000000a2';
  v_cul        uuid := '08500000-0000-4000-8000-0000000000aa';
  v_boo        uuid := '08500000-0000-4000-8000-0000000000ab';
  v_org_a      uuid := '08500000-0000-4000-8000-0000000000a0';
  v_org_b      uuid := '08500000-0000-4000-8000-0000000000b0';
  v_project    uuid := '08500000-0000-4000-8000-00000000aa01';
  v_project_b  uuid := '08500000-0000-4000-8000-00000000bb01';
  v_count      int;
  v_count2     int;
  v_raised     boolean;
  v_text       text;
  v_jsonb      jsonb;
  v_type       text;
begin
  execute 'set local role authenticated';

  ------------------------------------------------------------------------
  -- (1) The inputs answer; generate-all lands six at v1; the regen
  --     reads the draft and appends v2; events carry booleans.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_boo, 'role', 'authenticated')::text, true);

  select count(*) into v_count from public.job_specs where is_final;
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL (1): the agent reads % final specs (expected 1 — the new job_specs grant should answer)', v_count;
  end if;

  insert into public.boolean_queries (project_id, organization_id, query_type, search_type, content, version)
  select v_project, v_org_a, q.query_type, q.search_type, 'harness ' || q.query_type || ' ' || q.search_type, 1
    from (values ('linkedin','exact'), ('linkedin','broad'), ('linkedin','adjacent'),
                 ('linkedin','competitor'), ('google_xray','exact'), ('ats','exact'))
      as q(query_type, search_type);

  perform public.record_agent_event(
    'sourcing_queries_generated', v_project, null,
    jsonb_build_object('agent_kind', 'boolean_search', 'trigger', 'generate_all',
                       'slots_count', 6, 'job_spec_version', 1,
                       'has_recruiter_feedback', false));

  -- The regen path: read the current draft (the SELECT grant at
  -- work), append the next version.
  select content into v_text from public.boolean_queries
   where project_id = v_project and query_type = 'linkedin' and search_type = 'exact'
   order by version desc limit 1;
  if v_text is distinct from 'harness linkedin exact' then
    raise exception 'INVARIANT-FAIL (1): the agent cannot read the current draft (%)', v_text;
  end if;

  insert into public.boolean_queries (project_id, organization_id, query_type, search_type, content, version)
  values (v_project, v_org_a, 'linkedin', 'exact', 'harness linkedin exact v2 — recruiter feedback honoured', 2);

  perform public.record_agent_event(
    'sourcing_queries_generated', v_project, null,
    jsonb_build_object('agent_kind', 'boolean_search', 'trigger', 'regenerate_one',
                       'slots_count', 1, 'slot', 'linkedin_exact', 'version', 2,
                       'job_spec_version', 1, 'has_recruiter_feedback', true));

  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);

  select count(*) into v_count from public.boolean_queries where project_id = v_project;
  if v_count <> 7 then
    raise exception 'INVARIANT-FAIL (1): % query rows landed (expected 7 — six at v1 plus one at v2)', v_count;
  end if;

  select count(*) into v_count from public.activity_events
   where event_type = 'sourcing_queries_generated' and actor_id = v_boo
     and actor_label = 'Boolean Search Agent';
  if v_count <> 2 then
    raise exception 'INVARIANT-FAIL (1): % sourcing events landed under the agent (expected 2)', v_count;
  end if;
  select detail into v_jsonb from public.activity_events
   where event_type = 'sourcing_queries_generated' and detail->>'trigger' = 'regenerate_one';
  if v_jsonb->>'has_recruiter_feedback' is distinct from 'true'
     or v_jsonb->>'slot' is distinct from 'linkedin_exact'
     or v_jsonb->>'version' is distinct from '2' then
    raise exception 'INVARIANT-FAIL (1): the regen event detail is wrong (%)', v_jsonb;
  end if;
  execute 'set local role authenticated';

  ------------------------------------------------------------------------
  -- (2) THE TENANT PIN. The control tripwire for the dropped-org-
  --     conjunct drift: an INSERT bearing org B's id must be refused.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_boo, 'role', 'authenticated')::text, true);

  v_raised := false;
  begin
    insert into public.boolean_queries (project_id, organization_id, query_type, search_type, content, version)
    values (v_project_b, v_org_b, 'linkedin', 'exact', 'cross-tenant landing', 1);
  exception when others then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (2): the agent''s query LANDED IN ANOTHER TENANT''s project — the org conjunct is gone from the INSERT grant';
  end if;
  execute 'set local role authenticated';

  ------------------------------------------------------------------------
  -- (3) The vocabulary's history is intact at thirteen — by COUNT.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_boo, 'role', 'authenticated')::text, true);

  for v_type in
    select unnest(array['feedback_interpreted', 'candidates_ranked',
                        'candidate_parsed', 'candidate_evaluated',
                        'candidate_positioned', 'candidate_researched',
                        'candidate_triangulated', 'candidate_profiled',
                        'desk_digest_generated', 'company_researched',
                        'hm_researched', 'culture_profiled',
                        'sourcing_queries_generated'])
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
  if v_count <> 13 then
    raise exception 'INVARIANT-FAIL (3): % of 13 history probes landed — the vocabulary lost a prior slice''s event type SILENTLY (write_activity_event swallows the CHECK violation by 053''s design)', v_count;
  end if;
  execute 'set local role authenticated';

  ------------------------------------------------------------------------
  -- (4) The negative matrix, UNCHANGED — plus the version-history
  --     pin, the forgery boundary, and the unknown-type refusal.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_boo, 'role', 'authenticated')::text, true);

  begin
    update public.boolean_queries set content = 'rewritten history'
     where project_id = v_project and version = 1;
  exception when others then null; end;
  begin
    delete from public.boolean_queries where project_id = v_project;
  exception when others then null; end;

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

  select count(*), count(*) filter (where id = v_boo)
    into v_count, v_count2 from public.users;
  if v_count <> 1 or v_count2 <> 1 then
    raise exception 'INVARIANT-FAIL (4): the agent reads % users rows (self: %)', v_count, v_count2;
  end if;

  select count(*) into v_count from public.portal_context();
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (4): portal_context answered the agent (% rows)', v_count;
  end if;

  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  select count(*), count(*) filter (where content = 'rewritten history')
    into v_count, v_count2 from public.boolean_queries where project_id = v_project;
  if v_count <> 7 or v_count2 <> 0 then
    raise exception 'INVARIANT-FAIL (4): the agent rewrote or destroyed version history (% rows, % rewritten)', v_count, v_count2;
  end if;
  execute 'set local role authenticated';

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_recruiter, 'role', 'authenticated')::text, true);

  v_raised := false;
  begin
    perform public.record_agent_event('sourcing_queries_generated');
  exception when insufficient_privilege then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (4): a recruiter recorded sourcing_queries_generated through the agent door';
  end if;

  v_raised := false;
  begin
    perform public.record_activity_event('sourcing_queries_generated');
  exception when others then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (4): a recruiter recorded sourcing_queries_generated through the human door';
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_boo, 'role', 'authenticated')::text, true);
  v_raised := false;
  begin
    perform public.record_agent_event('queries_shredded');
  exception when others then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (4): the agent recorded an unknown event type';
  end if;

  ------------------------------------------------------------------------
  -- (5) Kill switches independent at twelve — and the suspended
  --     agent reads zero everywhere it lawfully read.
  ------------------------------------------------------------------------
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  update public.users set status = 'suspended' where id = v_boo;
  execute 'set local role authenticated';

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_boo, 'role', 'authenticated')::text, true);

  select count(*) into v_count from public.projects;
  select count(*) into v_count2 from public.job_specs;
  if v_count <> 0 or v_count2 <> 0 then
    raise exception 'INVARIANT-FAIL (5): the SUSPENDED agent still reads % projects / % job_specs rows', v_count, v_count2;
  end if;
  select count(*) into v_count from public.boolean_queries;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (5): the SUSPENDED agent still reads % boolean_queries rows', v_count;
  end if;

  v_raised := false;
  begin
    insert into public.boolean_queries (project_id, organization_id, query_type, search_type, content, version)
    values (v_project, v_org_a, 'ats', 'exact', 'suspended write', 2);
  exception when others then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (5): the suspended agent appended a query version';
  end if;

  v_raised := false;
  begin
    perform public.record_agent_event('sourcing_queries_generated');
  exception when insufficient_privilege then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (5): the suspended agent recorded an event';
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_cul, 'role', 'authenticated')::text, true);
  perform public.record_agent_event(
    'culture_profiled', v_project, null,
    jsonb_build_object('agent_kind', 'culture', 'probe', 'twelve-way-independence'));

  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);

  select count(*) into v_count from public.activity_events
   where event_type = 'culture_profiled' and actor_id = v_cul
     and detail->>'probe' = 'twelve-way-independence';
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL (5): the Culture Agent''s event did not land with the Boolean Search Agent down';
  end if;
  update public.users set status = 'active' where id = v_boo;

  raise notice 'ALL AGENT-BOOLEAN INVARIANTS PASSED';
end
$checks$;

rollback;
