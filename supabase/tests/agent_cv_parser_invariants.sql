-- Agent-CV-parser invariants (migration 076: the third agent
-- principal, candidates UPDATE — the pool's first widening — and the
-- parse-never-delete boundary).
--
-- Rolled back; forged-JWT assertions per the house pattern. 074 pins
-- the role, 075 pins the second principal and the allowlist; this file
-- pins what is new when the pool WIDENS by one write surface:
--
--    1. The parser's UPDATE lands — the structured profile AND the
--       identity columns it overwrites — verified privileged; and
--       record_agent_event('candidate_parsed') lands with the parser
--       as actor, its name snapshotted, the trigger named in detail.
--    2. The third principal's negative matrix, by name: zero clients,
--       hiring_manager_reviews, organizations, activity_events; a
--       users read returning only its own row; both portal RPCs empty.
--    3. Parse, never delete (D8): the parser's DELETE aimed at a
--       candidate lands on ZERO rows (verified by effect, privileged —
--       THE control-run tripwire); its storage.objects reach is zero
--       with a real row present; and mechanically, no storage.objects
--       policy may so much as mention is_agent() — the §27 D5 shape,
--       so a future migration that grants an agent storage fails
--       loudly here.
--    4. The allowlist holds at three: a recruiter is refused
--       candidate_parsed by role; the parser is refused an unknown
--       event type by name.
--    5. Kill switches stay independent at three agents: with the
--       PARSER suspended (reads nothing, door refuses), the RANKER
--       still records candidates_ranked.
--
-- On success: NOTICE 'ALL AGENT-CV-PARSER INVARIANTS PASSED'.
--
-- Control run (2026-08-20, verified): the file re-run with
-- can_write_candidates() re-created as the four-role list plus 'agent'
-- — the write-side enumeration regression D8 names, whose reach
-- includes candidates_role_delete — aborted at INVARIANT-FAIL (3)
-- with "the parser deleted a candidate", invariants 1–2 passing under
-- the regression. Diff vs. the clean pass: the one function body.
-- Rollback verified residue-free.

begin;

insert into public.organizations (id, name, slug) values
  ('07600000-0000-4000-8000-0000000000a0', 'Parser Org A', 'parser-org-a');

insert into public.clients (id, organization_id, name) values
  ('07600000-0000-4000-8000-00000000ca01', '07600000-0000-4000-8000-0000000000a0', 'Parser Client A');

insert into auth.users (id, email) values
  ('07600000-0000-4000-8000-0000000000a2', 'parser-recruiter@test.local'),
  ('07600000-0000-4000-8000-0000000000a4', 'parser-ranker@test.local'),
  ('07600000-0000-4000-8000-0000000000a5', 'parser-parser@test.local');

update public.users set organization_id = '07600000-0000-4000-8000-0000000000a0',
       status = 'active', role = 'recruiter', full_name = 'Parser Recruiter'
 where id = '07600000-0000-4000-8000-0000000000a2';
update public.users set organization_id = '07600000-0000-4000-8000-0000000000a0',
       status = 'active', role = 'agent', full_name = 'Ranking Agent'
 where id = '07600000-0000-4000-8000-0000000000a4';
update public.users set organization_id = '07600000-0000-4000-8000-0000000000a0',
       status = 'active', role = 'agent', full_name = 'CV Parsing Agent'
 where id = '07600000-0000-4000-8000-0000000000a5';

insert into public.projects (id, organization_id, title, company_name, one_line_input) values
  ('07600000-0000-4000-8000-00000000aa01', '07600000-0000-4000-8000-0000000000a0',
   'CFO Search', 'Parse Co', 'CFO for Parse Co');

insert into public.candidates (id, organization_id, project_id, full_name, cv_processing) values
  ('07600000-0000-4000-8000-00000000ac01', '07600000-0000-4000-8000-0000000000a0',
   '07600000-0000-4000-8000-00000000aa01', 'unparsed-cv.pdf', true),
  ('07600000-0000-4000-8000-00000000ac02', '07600000-0000-4000-8000-0000000000a0',
   '07600000-0000-4000-8000-00000000aa01', 'Delete Target', false);

insert into public.hiring_manager_reviews (id, organization_id, project_id, hm_label) values
  ('07600000-0000-4000-8000-00000000ae01', '07600000-0000-4000-8000-0000000000a0',
   '07600000-0000-4000-8000-00000000aa01', 'Parser Harness HM');

do $checks$
declare
  v_recruiter uuid := '07600000-0000-4000-8000-0000000000a2';
  v_ranker    uuid := '07600000-0000-4000-8000-0000000000a4';
  v_parser    uuid := '07600000-0000-4000-8000-0000000000a5';
  v_project   uuid := '07600000-0000-4000-8000-00000000aa01';
  v_cand      uuid := '07600000-0000-4000-8000-00000000ac01';
  v_victim    uuid := '07600000-0000-4000-8000-00000000ac02';
  v_count     int;
  v_count2    int;
  v_raised    boolean;
  v_text      text;
  v_uuid      uuid;
  v_jsonb     jsonb;
begin
  execute 'set local role authenticated';

  ------------------------------------------------------------------------
  -- (1) The parser persists what it concluded, under its own name.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_parser, 'role', 'authenticated')::text, true);

  update public.candidates
     set full_name = 'Marlow Estcourt',
         email = 'marlow@test.local',
         current_title = 'CFO',
         cv_structured = '{"full_name": "Marlow Estcourt", "fit_dimensions": {"technical": 6, "domain": 7, "leadership": 6, "regulatory": 5, "transformation": 6}}'::jsonb,
         cv_processing = false,
         cv_parse_error = null
   where id = v_cand;

  perform public.record_agent_event(
    'candidate_parsed', v_project, v_cand,
    jsonb_build_object('agent_kind', 'cv_parser',
                       'trigger', 'upload',
                       'identity_changed', true));

  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);

  select full_name into v_text from public.candidates where id = v_cand;
  if v_text is distinct from 'Marlow Estcourt' then
    raise exception 'INVARIANT-FAIL (1): the parsed identity did not land (found %)', v_text;
  end if;
  select count(*) into v_count from public.candidates
   where id = v_cand and cv_processing = false
     and cv_structured->'fit_dimensions'->>'domain' = '7';
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL (1): the parsed profile did not land';
  end if;

  select actor_id, actor_label, detail into v_uuid, v_text, v_jsonb
    from public.activity_events where event_type = 'candidate_parsed';
  if v_uuid is distinct from v_parser then
    raise exception 'INVARIANT-FAIL (1): the parsed event''s actor is %, not the parser', v_uuid;
  end if;
  if v_text is distinct from 'CV Parsing Agent' then
    raise exception 'INVARIANT-FAIL (1): the actor label is %, not the parser''s name', v_text;
  end if;
  if v_jsonb->>'trigger' is distinct from 'upload' then
    raise exception 'INVARIANT-FAIL (1): the event does not name its trigger (detail %)', v_jsonb;
  end if;
  execute 'set local role authenticated';

  ------------------------------------------------------------------------
  -- (2) The third principal's negative matrix, by name.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_parser, 'role', 'authenticated')::text, true);

  select count(*) into v_count from public.clients;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (2): the parser reads % clients rows', v_count;
  end if;

  select count(*) into v_count from public.hiring_manager_reviews;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (2): the parser reads % hiring_manager_reviews rows', v_count;
  end if;

  select count(*) into v_count from public.organizations;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (2): the parser reads % organizations rows', v_count;
  end if;

  select count(*) into v_count from public.activity_events;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (2): the parser reads % activity_events rows', v_count;
  end if;

  select count(*), count(*) filter (where id = v_parser)
    into v_count, v_count2 from public.users;
  if v_count <> 1 or v_count2 <> 1 then
    raise exception 'INVARIANT-FAIL (2): the parser reads % users rows (self: %)', v_count, v_count2;
  end if;

  select count(*) into v_count from public.portal_context();
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (2): portal_context answered the parser (% rows)', v_count;
  end if;

  select count(*) into v_count from public.portal_list_mandates();
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (2): portal_list_mandates answered the parser (% rows)', v_count;
  end if;

  ------------------------------------------------------------------------
  -- (3) Parse, never delete. THE control-run tripwire.
  ------------------------------------------------------------------------
  delete from public.candidates where id = v_victim;

  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  select count(*) into v_count from public.candidates where id = v_victim;
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL (3): the parser deleted a candidate';
  end if;
  execute 'set local role authenticated';

  -- Storage reach is zero, with a real row present (verified privileged
  -- below that at least one exists — a zero over an empty table proves
  -- nothing).
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_parser, 'role', 'authenticated')::text, true);
  select count(*) into v_count from storage.objects;

  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  select count(*) into v_count2 from storage.objects;
  if v_count2 < 1 then
    raise exception 'INVARIANT-FAIL (3): the storage negative is vacuous — no storage rows exist to be refused';
  end if;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (3): the parser reads % storage objects', v_count;
  end if;

  -- Mechanical (the §27 D5 shape): no storage policy may mention the
  -- agent predicate; a future migration that adds one fails loudly.
  select count(*) into v_count from pg_policies
   where schemaname = 'storage' and tablename = 'objects'
     and (qual::text like '%is_agent%' or with_check::text like '%is_agent%');
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (3): % storage policies mention is_agent()', v_count;
  end if;
  execute 'set local role authenticated';

  ------------------------------------------------------------------------
  -- (4) The allowlist holds at three.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_recruiter, 'role', 'authenticated')::text, true);
  v_raised := false;
  begin
    perform public.record_agent_event('candidate_parsed', v_project);
  exception when insufficient_privilege then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (4): a recruiter recorded candidate_parsed';
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_parser, 'role', 'authenticated')::text, true);
  v_raised := false;
  begin
    perform public.record_agent_event('cv_shredded', v_project);
  exception when others then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (4): the parser recorded an unknown event type';
  end if;

  ------------------------------------------------------------------------
  -- (5) Kill switches independent at three.
  ------------------------------------------------------------------------
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  update public.users set status = 'suspended' where id = v_parser;
  execute 'set local role authenticated';

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_parser, 'role', 'authenticated')::text, true);
  select count(*) into v_count from public.candidates;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (5): the suspended parser reads % candidates', v_count;
  end if;
  v_raised := false;
  begin
    perform public.record_agent_event('candidate_parsed', v_project);
  exception when insufficient_privilege then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (5): the suspended parser recorded an event';
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_ranker, 'role', 'authenticated')::text, true);
  perform public.record_agent_event(
    'candidates_ranked', v_project, null,
    jsonb_build_object('agent_kind', 'ranker', 'probe', 'three-way-independence'));

  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  select count(*) into v_count from public.activity_events
   where event_type = 'candidates_ranked' and actor_id = v_ranker;
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL (5): the ranker''s event did not land with the parser down';
  end if;
  update public.users set status = 'active' where id = v_parser;

  raise notice 'ALL AGENT-CV-PARSER INVARIANTS PASSED';
end
$checks$;

rollback;
