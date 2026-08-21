-- Agent-culture invariants (migration 084: the eleventh agent
-- principal — the second zero-new-grant slice; vocabulary only).
--
-- Rolled back; forged-JWT assertions per the house pattern. 074 pins
-- the role and every grant this slice REUSES (projects S+U, feedback
-- S, skills S), 075–083 pin the second through tenth principals;
-- this file pins the eleventh:
--
--    1. The merge-write lands under the pool's grants: the agent
--       writes culture_profile, carries the recruiter's context
--       VERBATIM onto culture_context, and every SIBLING KEY
--       survives byte-identical (intelligence_report,
--       hm_intelligence, culture_notes, culture_flags). The
--       DELETE-WHEN-EMPTY PIN: a context-less regenerate REMOVES
--       culture_context — stale context must not outlive the read
--       it shaped. Events land with has_recruiter_context as a
--       BOOLEAN and the context text ABSENT from the trail. The
--       feedback tail answers the agent (the interpreter's 074
--       grant, reused — the lawful-read proof that no new grant was
--       minted).
--    2. THE ROSTER PIN — THE control-run tripwire: the agent reads
--       EXACTLY ONE users row, its own. The programme's
--       most-repeated refusal — agents read NO people beyond
--       themselves — and the drift this control performs is the
--       "helpful" future policy that grants agents their org's
--       roster ("to label people in reports").
--    3. The vocabulary's history intact at twelve — by COUNT (§42
--       doctrine).
--    4. The eleventh principal's negative matrix — UNCHANGED:
--       clients, placements, organizations, activity_events,
--       desk_digests all refused. Plus the forgery boundary both
--       directions and the unknown-type refusal.
--    5. Kill switches independent at eleven — and the suspended
--       agent reads ZERO projects rows.
--
-- On success: NOTICE 'ALL AGENT-CULTURE INVARIANTS PASSED'.
--
-- Control run (2026-08-21, verified): ADD users_agent_select — an
-- org-scoped roster SELECT for agents. The harness aborted at
-- INVARIANT-FAIL (2) with the agent reading the full harness roster;
-- drift and harness ran in one transaction, so the abort itself
-- rolled the policy back — residue-free by construction, pg_policies
-- verified clean after. The first control run to regress the PEOPLE
-- boundary itself.

begin;

insert into public.organizations (id, name, slug) values
  ('08400000-0000-4000-8000-0000000000a0', 'Cul Org A', 'cul-org-a');

insert into auth.users (id, email) values
  ('08400000-0000-4000-8000-0000000000a2', 'cul-recruiter@test.local'),
  ('08400000-0000-4000-8000-0000000000aa', 'cul-companyintel@test.local'),
  ('08400000-0000-4000-8000-0000000000ab', 'cul-culture@test.local');

update public.users set organization_id = '08400000-0000-4000-8000-0000000000a0',
       status = 'active', role = 'recruiter', full_name = 'Cul Recruiter'
 where id = '08400000-0000-4000-8000-0000000000a2';
update public.users set organization_id = '08400000-0000-4000-8000-0000000000a0',
       status = 'active', role = 'agent', full_name = 'Company Intelligence Agent'
 where id = '08400000-0000-4000-8000-0000000000aa';
update public.users set organization_id = '08400000-0000-4000-8000-0000000000a0',
       status = 'active', role = 'agent', full_name = 'Culture Agent'
 where id = '08400000-0000-4000-8000-0000000000ab';

-- The project carries EVERY sibling key the culture merge must not
-- disturb, plus a stale culture_context the first act will replace
-- and the second act (context-less) must DELETE.
insert into public.projects (id, organization_id, title, company_name, one_line_input, company_context) values
  ('08400000-0000-4000-8000-00000000aa01', '08400000-0000-4000-8000-0000000000a0',
   'CTO Search', 'Cul Co', 'CTO for Cul Co',
   '{"industry": "Software",
     "intelligence_report": {"seed": "sibling-1"},
     "hm_intelligence": {"seed": "sibling-2"},
     "culture_notes": {"pace": "sibling-note"},
     "culture_flags": ["pace"],
     "culture_context": "stale context from last quarter"}'::jsonb);

insert into public.feedback (organization_id, project_id, feedback_type, content) values
  ('08400000-0000-4000-8000-0000000000a0', '08400000-0000-4000-8000-00000000aa01', 'recruiter_note', 'harness feedback one'),
  ('08400000-0000-4000-8000-0000000000a0', '08400000-0000-4000-8000-00000000aa01', 'hiring_manager', 'harness feedback two');

do $checks$
declare
  v_recruiter  uuid := '08400000-0000-4000-8000-0000000000a2';
  v_ci         uuid := '08400000-0000-4000-8000-0000000000aa';
  v_cul        uuid := '08400000-0000-4000-8000-0000000000ab';
  v_org        uuid := '08400000-0000-4000-8000-0000000000a0';
  v_project    uuid := '08400000-0000-4000-8000-00000000aa01';
  v_count      int;
  v_count2     int;
  v_raised     boolean;
  v_text       text;
  v_uuid       uuid;
  v_jsonb      jsonb;
  v_type       text;
begin
  execute 'set local role authenticated';

  ------------------------------------------------------------------------
  -- (1) The merge-write with the recruiter's context; the
  --     delete-when-empty pin; siblings survive; events carry the
  --     boolean, never the text; the feedback tail answers.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_cul, 'role', 'authenticated')::text, true);

  -- The lawful-read proof: the interpreter's 074 feedback grant,
  -- reused — the agent sees the tail it will summarise.
  select count(*) into v_count from public.feedback;
  if v_count <> 2 then
    raise exception 'INVARIANT-FAIL (1): the agent reads % feedback rows (expected 2 — the 074 grant should answer)', v_count;
  end if;

  -- Act one: analyse WITH recruiter context.
  update public.projects
     set company_context = company_context
         || '{"culture_profile": {"summary": "harness profile v1"}, "culture_context": "harness context"}'::jsonb
   where id = v_project;

  perform public.record_agent_event(
    'culture_profiled', v_project, null,
    jsonb_build_object('agent_kind', 'culture', 'trigger', 'analyse',
                       'has_recruiter_context', true, 'feedback_count', 2,
                       'replaced_existing', false));

  -- Act two: context-less regenerate — culture_context DELETED.
  update public.projects
     set company_context = (company_context - 'culture_context')
         || '{"culture_profile": {"summary": "harness profile v2"}}'::jsonb
   where id = v_project;

  perform public.record_agent_event(
    'culture_profiled', v_project, null,
    jsonb_build_object('agent_kind', 'culture', 'trigger', 'regenerate',
                       'has_recruiter_context', false, 'feedback_count', 2,
                       'replaced_existing', true));

  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);

  select company_context into v_jsonb from public.projects where id = v_project;
  if v_jsonb->'culture_profile'->>'summary' is distinct from 'harness profile v2' then
    raise exception 'INVARIANT-FAIL (1): the agent''s merge-write did not land (%)', v_jsonb;
  end if;
  if v_jsonb ? 'culture_context' then
    raise exception 'INVARIANT-FAIL (1): the DELETE-WHEN-EMPTY pin broke — culture_context survived a context-less regenerate (%)', v_jsonb->>'culture_context';
  end if;
  if v_jsonb->'intelligence_report'->>'seed' is distinct from 'sibling-1'
     or v_jsonb->'hm_intelligence'->>'seed' is distinct from 'sibling-2'
     or v_jsonb->'culture_notes'->>'pace' is distinct from 'sibling-note'
     or v_jsonb->'culture_flags'->>0 is distinct from 'pace'
     or v_jsonb->>'industry' is distinct from 'Software' then
    raise exception 'INVARIANT-FAIL (1): the merge-write DESTROYED a sibling key (%)', v_jsonb;
  end if;

  select count(*) into v_count from public.activity_events
   where event_type = 'culture_profiled' and actor_id = v_cul
     and actor_label = 'Culture Agent';
  if v_count <> 2 then
    raise exception 'INVARIANT-FAIL (1): % culture events landed under the agent (expected 2)', v_count;
  end if;
  select count(*) into v_count from public.activity_events
   where event_type = 'culture_profiled' and detail::text like '%harness context%';
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (1): the recruiter''s context TEXT rode the trail';
  end if;
  select detail into v_jsonb from public.activity_events
   where event_type = 'culture_profiled' and detail->>'trigger' = 'analyse';
  if v_jsonb->>'has_recruiter_context' is distinct from 'true'
     or v_jsonb->>'feedback_count' is distinct from '2' then
    raise exception 'INVARIANT-FAIL (1): the analyse event detail is wrong (%)', v_jsonb;
  end if;
  execute 'set local role authenticated';

  ------------------------------------------------------------------------
  -- (2) THE ROSTER PIN. The control tripwire for the added
  --     roster-policy drift: the agent reads EXACTLY its own row.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_cul, 'role', 'authenticated')::text, true);

  select count(*), count(*) filter (where id = v_cul)
    into v_count, v_count2 from public.users;
  if v_count <> 1 or v_count2 <> 1 then
    raise exception 'INVARIANT-FAIL (2): the agent reads % users rows (self: %) — the roster boundary is gone', v_count, v_count2;
  end if;
  execute 'set local role authenticated';

  ------------------------------------------------------------------------
  -- (3) The vocabulary's history is intact at twelve — by COUNT.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_cul, 'role', 'authenticated')::text, true);

  for v_type in
    select unnest(array['feedback_interpreted', 'candidates_ranked',
                        'candidate_parsed', 'candidate_evaluated',
                        'candidate_positioned', 'candidate_researched',
                        'candidate_triangulated', 'candidate_profiled',
                        'desk_digest_generated', 'company_researched',
                        'hm_researched', 'culture_profiled'])
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
  if v_count <> 12 then
    raise exception 'INVARIANT-FAIL (3): % of 12 history probes landed — the vocabulary lost a prior slice''s event type SILENTLY (write_activity_event swallows the CHECK violation by 053''s design)', v_count;
  end if;
  execute 'set local role authenticated';

  ------------------------------------------------------------------------
  -- (4) The negative matrix, UNCHANGED — plus the forgery boundary
  --     both directions and the unknown-type refusal.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_cul, 'role', 'authenticated')::text, true);

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

  select count(*) into v_count from public.portal_context();
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (4): portal_context answered the agent (% rows)', v_count;
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_recruiter, 'role', 'authenticated')::text, true);

  v_raised := false;
  begin
    perform public.record_agent_event('culture_profiled');
  exception when insufficient_privilege then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (4): a recruiter recorded culture_profiled through the agent door';
  end if;

  v_raised := false;
  begin
    perform public.record_activity_event('culture_profiled');
  exception when others then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (4): a recruiter recorded culture_profiled through the human door';
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_cul, 'role', 'authenticated')::text, true);
  v_raised := false;
  begin
    perform public.record_agent_event('culture_erased');
  exception when others then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (4): the agent recorded an unknown event type';
  end if;

  ------------------------------------------------------------------------
  -- (5) Kill switches independent at eleven — and the suspended
  --     agent reads zero.
  ------------------------------------------------------------------------
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  update public.users set status = 'suspended' where id = v_cul;
  execute 'set local role authenticated';

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_cul, 'role', 'authenticated')::text, true);

  select count(*) into v_count from public.projects;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (5): the SUSPENDED agent still reads % projects rows — the is_agent() status gate has regressed', v_count;
  end if;

  update public.projects
     set company_context = company_context || '{"culture_profile": {"summary": "suspended write"}}'::jsonb
   where id = v_project;

  v_raised := false;
  begin
    perform public.record_agent_event('culture_profiled');
  exception when insufficient_privilege then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (5): the suspended agent recorded an event';
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_ci, 'role', 'authenticated')::text, true);
  perform public.record_agent_event(
    'company_researched', v_project, null,
    jsonb_build_object('agent_kind', 'company_intel', 'probe', 'eleven-way-independence'));

  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);

  select company_context->'culture_profile'->>'summary'
    into v_text from public.projects where id = v_project;
  if v_text is distinct from 'harness profile v2' then
    raise exception 'INVARIANT-FAIL (5): the suspended agent''s UPDATE landed (%)', v_text;
  end if;

  select count(*) into v_count from public.activity_events
   where event_type = 'company_researched' and actor_id = v_ci
     and detail->>'probe' = 'eleven-way-independence';
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL (5): the company-intel agent''s event did not land with the Culture Agent down';
  end if;
  update public.users set status = 'active' where id = v_cul;

  raise notice 'ALL AGENT-CULTURE INVARIANTS PASSED';
end
$checks$;

rollback;
