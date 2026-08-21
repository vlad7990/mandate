-- Agent-psychology invariants (migration 081: the eighth agent
-- principal, the first pool widening since 076 — SELECT-only on a
-- human-authored table).
--
-- Rolled back; forged-JWT assertions per the house pattern. 074 pins
-- the role, 075–080 pin the second through seventh principals; this
-- file pins the eighth and the widening's exact edge:
--
--    1. The TWO-write shape lands through the RPC — psychology AND
--       psychology_context — with the neighbours pin at its widest:
--       five agent keys (parser fields, evaluation, positioning_kit,
--       candidate_intelligence, triangulation_report) AND the three
--       HUMAN annotation keys (psychology_notes, psychology_flags,
--       psychology_confidence_overrides) all survive. The event lands
--       with the psychology agent as actor, the trigger named, and
--       has_recruiter_context as a boolean.
--    2. THE NOTES BOUNDARY — THE control-run tripwire: the agent
--       reads candidate_notes (the 081 grant answers) and is REFUSED
--       INSERT, UPDATE and DELETE with a live note present. The
--       realistic drift is the grant re-created FOR ALL (020's old
--       blanket shape); under that regression the write lands and
--       this invariant fails loudly.
--    3. The vocabulary's history intact at eight — by COUNT (§42
--       doctrine: write_activity_event never raises).
--    4. The eighth principal's negative matrix + the forgery boundary
--       both directions.
--    5. Kill switches independent at eight — including the NOTES read
--       dying with suspension (the new grant is is_agent()-gated, so
--       the kill switch covers it).
--
-- On success: NOTICE 'ALL AGENT-PSYCHOLOGY INVARIANTS PASSED'.
--
-- Control run (2026-08-21, verified): the file re-run with
-- candidate_notes_agent_select re-created FOR ALL aborted at
-- INVARIANT-FAIL (2) "the agent wrote a candidate note (1 rows, 1
-- tampered/forged)" — under the blanket policy the agent's insert
-- landed and its delete removed the human's original. Diff vs. the
-- clean pass: the one policy; restored to FOR SELECT and verified.
-- One harness authoring error caught and kept as the comment at the
-- invariant-2 count: the first draft's post-reset count was unscoped
-- and read the DURABLE production notes (4 where the harness org
-- holds 1) — residue-style filters scope on the harness org id.

begin;

insert into public.organizations (id, name, slug) values
  ('08100000-0000-4000-8000-0000000000a0', 'Psy Org A', 'psy-org-a');

insert into public.clients (id, organization_id, name) values
  ('08100000-0000-4000-8000-00000000ca01', '08100000-0000-4000-8000-0000000000a0', 'Psy Client A');

insert into auth.users (id, email) values
  ('08100000-0000-4000-8000-0000000000a2', 'psy-recruiter@test.local'),
  ('08100000-0000-4000-8000-0000000000a9', 'psy-triangulator@test.local'),
  ('08100000-0000-4000-8000-0000000000aa', 'psy-psychology@test.local');

update public.users set organization_id = '08100000-0000-4000-8000-0000000000a0',
       status = 'active', role = 'recruiter', full_name = 'Psy Recruiter'
 where id = '08100000-0000-4000-8000-0000000000a2';
update public.users set organization_id = '08100000-0000-4000-8000-0000000000a0',
       status = 'active', role = 'agent', full_name = 'Triangulation Agent'
 where id = '08100000-0000-4000-8000-0000000000a9';
update public.users set organization_id = '08100000-0000-4000-8000-0000000000a0',
       status = 'active', role = 'agent', full_name = 'Psychology Agent'
 where id = '08100000-0000-4000-8000-0000000000aa';

insert into public.projects (id, organization_id, title, company_name, one_line_input) values
  ('08100000-0000-4000-8000-00000000aa01', '08100000-0000-4000-8000-0000000000a0',
   'CHRO Search', 'Psy Co', 'CHRO for Psy Co');

-- The subject carries every prior agent's fields AND the three human
-- annotation keys, all of which the psychology agent's writes must
-- PRESERVE.
insert into public.candidates (id, organization_id, project_id, full_name, cv_processing, cv_structured) values
  ('08100000-0000-4000-8000-00000000ac01', '08100000-0000-4000-8000-0000000000a0',
   '08100000-0000-4000-8000-00000000aa01', 'Psy Subject', false,
   '{"full_name": "Psy Subject", "fit_dimensions": {"domain": 6}, "evaluation": {"schema_version": 1, "summary": "harness evaluation"}, "positioning_kit": {"positioning_summary": "harness kit"}, "candidate_intelligence": {"summary": "harness dossier"}, "triangulation_report": {"verdict": "aligned"}, "psychology_notes": {"drive": "harness annotation"}, "psychology_flags": ["harness-flag"], "psychology_confidence_overrides": {"drive": "high"}}'::jsonb);

-- A live human-authored note: the read the 081 grant answers, and the
-- row the write refusals are proven against.
insert into public.candidate_notes (id, organization_id, project_id, candidate_id, created_by, note_type, content) values
  ('08100000-0000-4000-8000-00000000ae01', '08100000-0000-4000-8000-0000000000a0',
   '08100000-0000-4000-8000-00000000aa01', '08100000-0000-4000-8000-00000000ac01',
   '08100000-0000-4000-8000-0000000000a2', 'call', 'Direct in phone screen; asked sharp questions about the operating model.');

do $checks$
declare
  v_recruiter  uuid := '08100000-0000-4000-8000-0000000000a2';
  v_tri        uuid := '08100000-0000-4000-8000-0000000000a9';
  v_psy        uuid := '08100000-0000-4000-8000-0000000000aa';
  v_project    uuid := '08100000-0000-4000-8000-00000000aa01';
  v_cand       uuid := '08100000-0000-4000-8000-00000000ac01';
  v_note       uuid := '08100000-0000-4000-8000-00000000ae01';
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
  -- (1) The two-write shape; eight sibling keys survive; the event
  --     lands under the psychology agent's own name.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_psy, 'role', 'authenticated')::text, true);

  perform public.update_cv_structured_field(
    v_cand, v_project, 'psychology',
    '{"decision_style": "deliberate", "generated_at": "2026-08-21T00:00:00Z"}'::jsonb);
  perform public.update_cv_structured_field(
    v_cand, v_project, 'psychology_context', '"confirmed directive in phone screen"'::jsonb);

  perform public.record_agent_event(
    'candidate_profiled', v_project, v_cand,
    jsonb_build_object('agent_kind', 'psychology', 'trigger', 'generate',
                       'replaced_existing', false, 'has_recruiter_context', true));

  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);

  select cv_structured into v_jsonb from public.candidates where id = v_cand;
  if v_jsonb->'psychology'->>'decision_style' is distinct from 'deliberate' then
    raise exception 'INVARIANT-FAIL (1): the profile did not land (found %)', v_jsonb->'psychology';
  end if;
  if v_jsonb->>'psychology_context' is distinct from 'confirmed directive in phone screen' then
    raise exception 'INVARIANT-FAIL (1): the context did not land (found %)', v_jsonb->'psychology_context';
  end if;
  if v_jsonb->>'full_name' is distinct from 'Psy Subject'
     or v_jsonb->'evaluation'->>'summary' is distinct from 'harness evaluation'
     or v_jsonb->'positioning_kit'->>'positioning_summary' is distinct from 'harness kit'
     or v_jsonb->'candidate_intelligence'->>'summary' is distinct from 'harness dossier'
     or v_jsonb->'triangulation_report'->>'verdict' is distinct from 'aligned'
     or v_jsonb->'psychology_notes'->>'drive' is distinct from 'harness annotation'
     or v_jsonb->'psychology_flags'->>0 is distinct from 'harness-flag'
     or v_jsonb->'psychology_confidence_overrides'->>'drive' is distinct from 'high' then
    raise exception 'INVARIANT-FAIL (1): the psychology agent''s writes clobbered a neighbour (%)', v_jsonb;
  end if;

  select actor_id, actor_label, detail into v_uuid, v_text, v_jsonb
    from public.activity_events where event_type = 'candidate_profiled';
  if v_uuid is distinct from v_psy then
    raise exception 'INVARIANT-FAIL (1): the profiled event''s actor is %, not the psychology agent', v_uuid;
  end if;
  if v_text is distinct from 'Psychology Agent' then
    raise exception 'INVARIANT-FAIL (1): the actor label is %, not the psychology agent''s name', v_text;
  end if;
  if v_jsonb->>'trigger' is distinct from 'generate'
     or v_jsonb->>'has_recruiter_context' is distinct from 'true' then
    raise exception 'INVARIANT-FAIL (1): the event detail is wrong (%)', v_jsonb;
  end if;
  execute 'set local role authenticated';

  ------------------------------------------------------------------------
  -- (2) The notes boundary — read yes, write/edit/delete no. THE
  --     control tripwire for the FOR-ALL drift.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_psy, 'role', 'authenticated')::text, true);

  select count(*) into v_count from public.candidate_notes;
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL (2): the agent reads % candidate_notes (the 081 grant should answer 1)', v_count;
  end if;

  begin
    insert into public.candidate_notes (organization_id, project_id, candidate_id, created_by, note_type, content)
    values ('08100000-0000-4000-8000-0000000000a0', v_project, v_cand, v_psy, 'call', 'forged note');
  exception when others then null; end;

  begin
    update public.candidate_notes set content = 'tampered' where id = v_note;
  exception when others then null; end;

  begin
    delete from public.candidate_notes where id = v_note;
  exception when others then null; end;

  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  -- Scoped to the harness org: the superuser count sees the durable
  -- production notes too (a first-draft authoring error, kept as a
  -- comment — the unscoped count read 4 where the org holds 1).
  select count(*), count(*) filter (where content = 'tampered' or content = 'forged note')
    into v_count, v_count2 from public.candidate_notes
   where organization_id = '08100000-0000-4000-8000-0000000000a0';
  if v_count <> 1 or v_count2 <> 0 then
    raise exception 'INVARIANT-FAIL (2): the agent wrote a candidate note (% rows, % tampered/forged)', v_count, v_count2;
  end if;
  execute 'set local role authenticated';

  ------------------------------------------------------------------------
  -- (3) The vocabulary's history is intact at eight — by COUNT.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_psy, 'role', 'authenticated')::text, true);

  for v_type in
    select unnest(array['feedback_interpreted', 'candidates_ranked',
                        'candidate_parsed', 'candidate_evaluated',
                        'candidate_positioned', 'candidate_researched',
                        'candidate_triangulated', 'candidate_profiled'])
  loop
    begin
      perform public.record_agent_event(
        v_type, v_project, v_cand,
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
  if v_count <> 8 then
    raise exception 'INVARIANT-FAIL (3): % of 8 history probes landed — the vocabulary lost a prior slice''s event type SILENTLY (write_activity_event swallows the CHECK violation by 053''s design)', v_count;
  end if;
  execute 'set local role authenticated';

  ------------------------------------------------------------------------
  -- (4) The negative matrix + the forgery boundary both directions.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_psy, 'role', 'authenticated')::text, true);

  select count(*) into v_count from public.clients;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (4): the psychology agent reads % clients rows', v_count;
  end if;

  select count(*) into v_count from public.hiring_manager_reviews;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (4): the psychology agent reads % hiring_manager_reviews rows', v_count;
  end if;

  select count(*) into v_count from public.organizations;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (4): the psychology agent reads % organizations rows', v_count;
  end if;

  select count(*) into v_count from public.activity_events;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (4): the psychology agent reads % activity_events rows', v_count;
  end if;

  select count(*), count(*) filter (where id = v_psy)
    into v_count, v_count2 from public.users;
  if v_count <> 1 or v_count2 <> 1 then
    raise exception 'INVARIANT-FAIL (4): the psychology agent reads % users rows (self: %)', v_count, v_count2;
  end if;

  select count(*) into v_count from public.portal_context();
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (4): portal_context answered the psychology agent (% rows)', v_count;
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_recruiter, 'role', 'authenticated')::text, true);

  v_raised := false;
  begin
    perform public.record_agent_event('candidate_profiled', v_project);
  exception when insufficient_privilege then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (4): a recruiter recorded candidate_profiled through the agent door';
  end if;

  v_raised := false;
  begin
    perform public.record_activity_event('candidate_profiled', v_project);
  exception when others then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (4): a recruiter recorded candidate_profiled through the human door';
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_psy, 'role', 'authenticated')::text, true);
  v_raised := false;
  begin
    perform public.record_agent_event('profile_shredded', v_project);
  exception when others then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (4): the psychology agent recorded an unknown event type';
  end if;

  ------------------------------------------------------------------------
  -- (5) Kill switches independent at eight — the new notes grant dies
  --     with suspension too.
  ------------------------------------------------------------------------
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  update public.users set status = 'suspended' where id = v_psy;
  execute 'set local role authenticated';

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_psy, 'role', 'authenticated')::text, true);
  select count(*) into v_count from public.candidates;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (5): the suspended psychology agent reads % candidates', v_count;
  end if;
  select count(*) into v_count from public.candidate_notes;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (5): the suspended psychology agent reads % candidate_notes', v_count;
  end if;
  v_raised := false;
  begin
    perform public.record_agent_event('candidate_profiled', v_project);
  exception when insufficient_privilege then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (5): the suspended psychology agent recorded an event';
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_tri, 'role', 'authenticated')::text, true);
  perform public.record_agent_event(
    'candidate_triangulated', v_project, v_cand,
    jsonb_build_object('agent_kind', 'triangulator', 'probe', 'eight-way-independence'));

  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  select count(*) into v_count from public.activity_events
   where event_type = 'candidate_triangulated' and actor_id = v_tri
     and detail->>'probe' = 'eight-way-independence';
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL (5): the triangulator''s event did not land with the psychology agent down';
  end if;
  update public.users set status = 'active' where id = v_psy;

  raise notice 'ALL AGENT-PSYCHOLOGY INVARIANTS PASSED';
end
$checks$;

rollback;
