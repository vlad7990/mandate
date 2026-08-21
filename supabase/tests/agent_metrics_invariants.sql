-- Agent-metrics invariants (migration 087: the fourteenth agent
-- principal — the Search Health Agent, the LAST of the fourteen-agent
-- map; one new grant: project_reports INSERT-only, generated_by
-- PINNED to auth.uid(), no SELECT — the blind insert).
--
-- Rolled back; forged-JWT assertions per the house pattern. 074 pins
-- the role, 075–086 pin the second through thirteenth principals;
-- this file pins the fourteenth:
--
--    1. The health judgment: every input answers from the pool
--       (projects, candidates, candidate_scores, feedback,
--       boolean_queries); the merge-write lands with the row's
--       SIBLING columns surviving byte-identical; the
--       health_suggested event carries the status enum and a count.
--    2. The weekly report's BLIND insert: the seam-minted id
--       honoured, generated_by = the agent. THE IMPERSONATION PIN —
--       THE control-run tripwire: an INSERT bearing a HUMAN's
--       generated_by is refused by the new grant's WITH CHECK. The
--       drift this control performs is the "helpful" simplification
--       that drops the generated_by conjunct ("we trust the app to
--       stamp it") — under it, an agent's report lands wearing a
--       RECRUITER's name: the exact inverse of 086's null-actor
--       drift, impersonation where that was anonymity. Plus the
--       tenant conjunct (another org's insert refused), the 082
--       shape reproven on this table (INSERT..RETURNING refused
--       under a no-SELECT grant), and the agent's project_reports
--       SELECT answering ZERO.
--    3. The vocabulary's history intact at sixteen — by COUNT (§42
--       doctrine).
--    4. The fourteenth principal's negative matrix — UNCHANGED —
--       plus THE LANDED-REPORTS PIN: the agent's UPDATE and DELETE
--       against landed reports land on zero rows (landed reports are
--       the recruiter's records). Plus the forgery boundary both
--       directions and the unknown-type refusal.
--    5. Kill switches independent at fourteen — and the suspended
--       agent reads ZERO projects rows and is refused at both its
--       doors.
--
-- On success: NOTICE 'ALL AGENT-METRICS INVARIANTS PASSED'.
--
-- Control run (2026-08-21, verified): project_reports_agent_insert
-- REBUILT with the generated_by conjunct dropped from WITH CHECK.
-- The impersonating insert LANDED under the recruiter's name and the
-- harness aborted at INVARIANT-FAIL (2); drift and harness ran in
-- one transaction, so the abort itself rolled the rebuild back —
-- residue-free by construction, the policy's WITH CHECK verified to
-- carry the generated_by conjunct after. Thirteen slices bookended
-- by the two faces of attribution fraud: 086 caught anonymity, 087
-- catches impersonation.

begin;

insert into public.organizations (id, name, slug) values
  ('08700000-0000-4000-8000-0000000000a0', 'Met Org A', 'met-org-a'),
  ('08700000-0000-4000-8000-0000000000b0', 'Met Org B', 'met-org-b');

insert into auth.users (id, email) values
  ('08700000-0000-4000-8000-0000000000a2', 'met-recruiter@test.local'),
  ('08700000-0000-4000-8000-0000000000aa', 'met-intake@test.local'),
  ('08700000-0000-4000-8000-0000000000ab', 'met-metrics@test.local');

update public.users set organization_id = '08700000-0000-4000-8000-0000000000a0',
       status = 'active', role = 'recruiter', full_name = 'Met Recruiter'
 where id = '08700000-0000-4000-8000-0000000000a2';
update public.users set organization_id = '08700000-0000-4000-8000-0000000000a0',
       status = 'active', role = 'agent', full_name = 'Intake Agent'
 where id = '08700000-0000-4000-8000-0000000000aa';
update public.users set organization_id = '08700000-0000-4000-8000-0000000000a0',
       status = 'active', role = 'agent', full_name = 'Search Health Agent'
 where id = '08700000-0000-4000-8000-0000000000ab';

insert into public.projects (id, organization_id, title, company_name, one_line_input, calibration_model, company_context, health_suggestions) values
  ('08700000-0000-4000-8000-00000000aa01', '08700000-0000-4000-8000-0000000000a0',
   'CTO Search', 'Met Co', 'CTO for Met Co',
   '{"role_title": "CTO"}'::jsonb, '{"industry": "Software"}'::jsonb,
   '{"generated_at": "2026-08-01T00:00:00Z", "health_status": "stalled", "summary": "stale set", "suggestions": []}'::jsonb),
  ('08700000-0000-4000-8000-00000000bb01', '08700000-0000-4000-8000-0000000000b0',
   'Rival Search', 'Rival Co', 'CTO for Rival Co', '{}'::jsonb, '{}'::jsonb, null);

insert into public.candidates (id, project_id, organization_id, full_name, pipeline_stage) values
  ('08700000-0000-4000-8000-00000000cc01', '08700000-0000-4000-8000-00000000aa01',
   '08700000-0000-4000-8000-0000000000a0', 'Met Candidate', 'reviewed');

insert into public.feedback (id, project_id, organization_id, feedback_type, content) values
  ('08700000-0000-4000-8000-00000000dd01', '08700000-0000-4000-8000-00000000aa01',
   '08700000-0000-4000-8000-0000000000a0', 'recruiter_note', 'harness feedback — aged');

insert into public.boolean_queries (project_id, organization_id, query_type, search_type, content, version) values
  ('08700000-0000-4000-8000-00000000aa01', '08700000-0000-4000-8000-0000000000a0',
   'linkedin', 'exact', 'harness linkedin exact', 1);

do $checks$
declare
  v_recruiter  uuid := '08700000-0000-4000-8000-0000000000a2';
  v_int        uuid := '08700000-0000-4000-8000-0000000000aa';
  v_met        uuid := '08700000-0000-4000-8000-0000000000ab';
  v_org_a      uuid := '08700000-0000-4000-8000-0000000000a0';
  v_org_b      uuid := '08700000-0000-4000-8000-0000000000b0';
  v_project    uuid := '08700000-0000-4000-8000-00000000aa01';
  v_project_b  uuid := '08700000-0000-4000-8000-00000000bb01';
  v_minted     uuid := '08700000-0000-4000-8000-00000000ee01';
  v_count      int;
  v_count2     int;
  v_raised     boolean;
  v_jsonb      jsonb;
  v_jsonb2     jsonb;
  v_type       text;
  v_id         uuid;
begin
  execute 'set local role authenticated';

  ------------------------------------------------------------------------
  -- (1) The health judgment: the pool answers; the merge-write lands
  --     with the row's sibling columns surviving byte-identical; the
  --     event carries the enum and the count.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_met, 'role', 'authenticated')::text, true);

  select count(*) into v_count from public.projects where id = v_project;
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL (1): the agent reads % projects rows for its own project (expected 1)', v_count;
  end if;
  select count(*) into v_count from public.candidates where project_id = v_project;
  select count(*) into v_count2 from public.feedback where project_id = v_project;
  if v_count <> 1 or v_count2 <> 1 then
    raise exception 'INVARIANT-FAIL (1): the pool does not answer (candidates %, feedback %)', v_count, v_count2;
  end if;
  select count(*) into v_count from public.boolean_queries where project_id = v_project;
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL (1): boolean_queries does not answer the agent (%)', v_count;
  end if;

  update public.projects
     set health_suggestions = '{"generated_at": "2026-08-21T00:00:00Z", "health_status": "stalled", "summary": "fresh set", "suggestions": [{"id": "s1"}, {"id": "s2"}, {"id": "s3"}]}'::jsonb,
         updated_at = now()
   where id = v_project;

  perform public.record_agent_event(
    'health_suggested', v_project, null,
    jsonb_build_object('agent_kind', 'search_health', 'trigger', 'on_demand',
                       'health_status', 'stalled', 'suggestions_count', 3));

  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);

  select health_suggestions, company_context into v_jsonb, v_jsonb2
    from public.projects where id = v_project;
  if v_jsonb->>'summary' is distinct from 'fresh set' then
    raise exception 'INVARIANT-FAIL (1): the merge-write did not land (%)', v_jsonb;
  end if;
  if v_jsonb2 is distinct from '{"industry": "Software"}'::jsonb then
    raise exception 'INVARIANT-FAIL (1): a sibling column did not survive the health write (%)', v_jsonb2;
  end if;
  select calibration_model into v_jsonb from public.projects where id = v_project;
  if v_jsonb is distinct from '{"role_title": "CTO"}'::jsonb then
    raise exception 'INVARIANT-FAIL (1): calibration_model did not survive the health write (%)', v_jsonb;
  end if;

  select count(*) into v_count from public.activity_events
   where event_type = 'health_suggested' and actor_id = v_met
     and actor_label = 'Search Health Agent';
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL (1): % health_suggested events landed under the agent (expected 1)', v_count;
  end if;
  select detail into v_jsonb from public.activity_events
   where event_type = 'health_suggested' and actor_id = v_met;
  if v_jsonb->>'health_status' is distinct from 'stalled'
     or v_jsonb->>'suggestions_count' is distinct from '3'
     or v_jsonb->>'trigger' is distinct from 'on_demand' then
    raise exception 'INVARIANT-FAIL (1): the health event detail is wrong (%)', v_jsonb;
  end if;
  execute 'set local role authenticated';

  ------------------------------------------------------------------------
  -- (2) The report's BLIND insert — and THE IMPERSONATION PIN, the
  --     control tripwire for the dropped-generated_by drift.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_met, 'role', 'authenticated')::text, true);

  -- The lawful act: seam-minted id, generated_by = the agent itself,
  -- no RETURNING.
  insert into public.project_reports (id, project_id, organization_id, week_starting, content, generated_by, ai_model)
  values (v_minted, v_project, v_org_a, '2026-08-17',
          '{"week_starting": "2026-08-17", "headline": "harness report"}'::jsonb,
          v_met, 'harness-model');

  perform public.record_agent_event(
    'weekly_report_generated', v_project, null,
    jsonb_build_object('agent_kind', 'search_health', 'trigger', 'on_demand',
                       'week_starting', '2026-08-17',
                       'candidates_count', 1, 'feedback_count', 0));

  -- THE IMPERSONATION PIN: the same insert bearing the RECRUITER's
  -- generated_by must be refused by WITH CHECK. Under the control
  -- run's drift (the generated_by conjunct dropped) this LANDS — an
  -- agent's report wearing a human's name.
  v_raised := false;
  begin
    insert into public.project_reports (id, project_id, organization_id, week_starting, content, generated_by, ai_model)
    values ('08700000-0000-4000-8000-00000000ee02', v_project, v_org_a, '2026-08-17',
            '{"week_starting": "2026-08-17", "headline": "impersonation"}'::jsonb,
            v_recruiter, 'harness-model');
  exception when others then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (2): the agent''s report LANDED UNDER A RECRUITER''s name — the generated_by conjunct is gone from the INSERT grant';
  end if;

  -- The tenant conjunct, still standing beside it.
  v_raised := false;
  begin
    insert into public.project_reports (id, project_id, organization_id, week_starting, content, generated_by, ai_model)
    values ('08700000-0000-4000-8000-00000000ee03', v_project_b, v_org_b, '2026-08-17',
            '{"week_starting": "2026-08-17", "headline": "cross-tenant"}'::jsonb,
            v_met, 'harness-model');
  exception when others then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (2): the agent''s report LANDED IN ANOTHER TENANT''s project';
  end if;

  -- The 082 shape, reproven on this table: INSERT..RETURNING under a
  -- no-SELECT grant is refused — which is WHY the seam mints the id.
  v_raised := false;
  begin
    insert into public.project_reports (project_id, organization_id, week_starting, content, generated_by, ai_model)
    values (v_project, v_org_a, '2026-08-24',
            '{"week_starting": "2026-08-24", "headline": "returning probe"}'::jsonb,
            v_met, 'harness-model')
    returning id into v_id;
  exception when others then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (2): INSERT..RETURNING answered the agent (id %) — the no-SELECT blind-insert doctrine is broken on project_reports', v_id;
  end if;

  -- And the agent reads NOTHING back — the insert is blind.
  select count(*) into v_count from public.project_reports;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (2): the agent reads % project_reports rows (expected 0 — no SELECT grant)', v_count;
  end if;

  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);

  select count(*) into v_count from public.project_reports
   where id = v_minted and generated_by = v_met and project_id = v_project;
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL (2): the blind insert did not land with the minted id under the agent''s name';
  end if;
  select count(*) into v_count from public.activity_events
   where event_type = 'weekly_report_generated' and actor_id = v_met
     and actor_label = 'Search Health Agent'
     and detail->>'week_starting' = '2026-08-17';
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL (2): % weekly_report_generated events landed under the agent (expected 1)', v_count;
  end if;
  execute 'set local role authenticated';

  ------------------------------------------------------------------------
  -- (3) The vocabulary's history is intact at sixteen — by COUNT.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_met, 'role', 'authenticated')::text, true);

  for v_type in
    select unnest(array['feedback_interpreted', 'candidates_ranked',
                        'candidate_parsed', 'candidate_evaluated',
                        'candidate_positioned', 'candidate_researched',
                        'candidate_triangulated', 'candidate_profiled',
                        'desk_digest_generated', 'company_researched',
                        'hm_researched', 'culture_profiled',
                        'sourcing_queries_generated', 'intake_analyzed',
                        'health_suggested', 'weekly_report_generated'])
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
  if v_count <> 16 then
    raise exception 'INVARIANT-FAIL (3): % of 16 history probes landed — the vocabulary lost a prior slice''s event type SILENTLY (write_activity_event swallows the CHECK violation by 053''s design)', v_count;
  end if;
  execute 'set local role authenticated';

  ------------------------------------------------------------------------
  -- (4) The negative matrix, UNCHANGED — plus the landed-reports pin,
  --     the forgery boundary, and the unknown-type refusal.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_met, 'role', 'authenticated')::text, true);

  begin
    update public.project_reports set ai_model = 'rewritten'
     where id = v_minted;
  exception when others then null; end;
  begin
    delete from public.project_reports where id = v_minted;
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

  select count(*), count(*) filter (where id = v_met)
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
  select count(*), count(*) filter (where ai_model = 'rewritten')
    into v_count, v_count2 from public.project_reports where id = v_minted;
  if v_count <> 1 or v_count2 <> 0 then
    raise exception 'INVARIANT-FAIL (4): the agent rewrote or destroyed a landed report (% rows, % rewritten) — landed reports are the recruiter''s records', v_count, v_count2;
  end if;
  execute 'set local role authenticated';

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_recruiter, 'role', 'authenticated')::text, true);

  v_raised := false;
  begin
    perform public.record_agent_event('health_suggested');
  exception when insufficient_privilege then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (4): a recruiter recorded health_suggested through the agent door';
  end if;

  v_raised := false;
  begin
    perform public.record_agent_event('weekly_report_generated');
  exception when insufficient_privilege then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (4): a recruiter recorded weekly_report_generated through the agent door';
  end if;

  v_raised := false;
  begin
    perform public.record_activity_event('health_suggested');
  exception when others then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (4): a recruiter recorded health_suggested through the human door';
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_met, 'role', 'authenticated')::text, true);
  v_raised := false;
  begin
    perform public.record_agent_event('reports_shredded');
  exception when others then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (4): the agent recorded an unknown event type';
  end if;

  ------------------------------------------------------------------------
  -- (5) Kill switches independent at fourteen — and the suspended
  --     agent reads zero and is refused at both its doors.
  ------------------------------------------------------------------------
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  update public.users set status = 'suspended' where id = v_met;
  execute 'set local role authenticated';

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_met, 'role', 'authenticated')::text, true);

  select count(*) into v_count from public.projects;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (5): the SUSPENDED agent still reads % projects rows', v_count;
  end if;

  v_raised := false;
  begin
    insert into public.project_reports (id, project_id, organization_id, week_starting, content, generated_by, ai_model)
    values ('08700000-0000-4000-8000-00000000ee04', v_project, v_org_a, '2026-08-17',
            '{"headline": "suspended write"}'::jsonb, v_met, 'harness-model');
  exception when others then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (5): the suspended agent landed a report';
  end if;

  v_raised := false;
  begin
    perform public.record_agent_event('health_suggested');
  exception when insufficient_privilege then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (5): the suspended agent recorded an event';
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_int, 'role', 'authenticated')::text, true);
  perform public.record_agent_event(
    'intake_analyzed', v_project, null,
    jsonb_build_object('agent_kind', 'intake', 'probe', 'fourteen-way-independence'));

  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);

  select count(*) into v_count from public.activity_events
   where event_type = 'intake_analyzed' and actor_id = v_int
     and detail->>'probe' = 'fourteen-way-independence';
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL (5): the Intake Agent''s event did not land with the Search Health Agent down';
  end if;
  update public.users set status = 'active' where id = v_met;

  raise notice 'ALL AGENT-METRICS INVARIANTS PASSED';
end
$checks$;

rollback;
