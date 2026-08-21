-- Agent-digest invariants (migration 082: the ninth agent principal,
-- INSERT-only on the append-only record table, the parser split
-- generalised).
--
-- Rolled back; forged-JWT assertions per the house pattern. 074 pins
-- the role, 075–081 pin the second through eighth principals; this
-- file pins the ninth and the record table's immutability:
--
--    1. The digest INSERT lands under the agent's own name
--       (created_by = the agent — the 082 WITH CHECK pins it, and a
--       forged created_by is refused). The event lands with the
--       digest writer as actor, the trigger named, counts in detail.
--    2. THE APPEND-ONLY PIN — THE control-run tripwire: a landed
--       digest is immutable. The agent's UPDATE and DELETE land on
--       zero rows. The pin is doubly load-bearing: with no SELECT
--       policy, even an added UPDATE policy is inert (the WHERE
--       cannot see the row); the harm needs SELECT + UPDATE added
--       together, which is exactly the drift the control run
--       performs — the first control run that regresses by ADDING
--       policies.
--    3. The vocabulary's history intact at nine — by COUNT (§42
--       doctrine).
--    4. The ninth principal's negative matrix — UNCHANGED from every
--       slice before it: the roster beyond self, activity_events,
--       clients, placements all refused. The rollup lives with the
--       manager; the digest writer sees nothing. Plus the forgery
--       boundary both directions, and desk_digests SELECT refused
--       (the agent writes the record and cannot read the archive).
--    5. Kill switches independent at nine.
--
-- On success: NOTICE 'ALL AGENT-DIGEST INVARIANTS PASSED'.
--
-- Control run (2026-08-21, verified), with a discovery in two acts:
-- an ADDED desk_digests_agent_update policy alone was INERT — the
-- agent's UPDATE landed on 0 rows, because an UPDATE's WHERE reads
-- existing rows under SELECT policies and the no-archive pin grants
-- none. The archive-blindness IS the immutability: a single added
-- write policy cannot produce the harm. Only the FULL drift —
-- agent SELECT + UPDATE together ("let the agent read its archive
-- and fix typos") — landed the rewrite, and the harness aborted at
-- INVARIANT-FAIL (2) "the agent rewrote a landed digest (1 rows, 0
-- original)". Both policies dropped and verified gone; rollback
-- residue-free. Related, from the first draft: INSERT..RETURNING id
-- is refused for the same reason (RETURNING reads the row under
-- SELECT policies) — the seam inserts blind, by design.

begin;

insert into public.organizations (id, name, slug) values
  ('08200000-0000-4000-8000-0000000000a0', 'Dig Org A', 'dig-org-a');

insert into public.clients (id, organization_id, name) values
  ('08200000-0000-4000-8000-00000000ca01', '08200000-0000-4000-8000-0000000000a0', 'Dig Client A');

insert into auth.users (id, email) values
  ('08200000-0000-4000-8000-0000000000a2', 'dig-manager@test.local'),
  ('08200000-0000-4000-8000-0000000000aa', 'dig-psychology@test.local'),
  ('08200000-0000-4000-8000-0000000000ab', 'dig-digest@test.local');

update public.users set organization_id = '08200000-0000-4000-8000-0000000000a0',
       status = 'active', role = 'manager', full_name = 'Dig Manager'
 where id = '08200000-0000-4000-8000-0000000000a2';
update public.users set organization_id = '08200000-0000-4000-8000-0000000000a0',
       status = 'active', role = 'agent', full_name = 'Psychology Agent'
 where id = '08200000-0000-4000-8000-0000000000aa';
update public.users set organization_id = '08200000-0000-4000-8000-0000000000a0',
       status = 'active', role = 'agent', full_name = 'Desk Digest Agent'
 where id = '08200000-0000-4000-8000-0000000000ab';

insert into public.projects (id, organization_id, title, company_name, one_line_input) values
  ('08200000-0000-4000-8000-00000000aa01', '08200000-0000-4000-8000-0000000000a0',
   'CEO Search', 'Dig Co', 'CEO for Dig Co');

do $checks$
declare
  v_manager    uuid := '08200000-0000-4000-8000-0000000000a2';
  v_psy        uuid := '08200000-0000-4000-8000-0000000000aa';
  v_dig        uuid := '08200000-0000-4000-8000-0000000000ab';
  v_org        uuid := '08200000-0000-4000-8000-0000000000a0';
  v_project    uuid := '08200000-0000-4000-8000-00000000aa01';
  v_digest_id  uuid;
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
  -- (1) The INSERT lands under the agent's own name; a forged
  --     created_by is refused; the event lands with counts.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_dig, 'role', 'authenticated')::text, true);

  -- Explicit id, NO RETURNING: under RLS, INSERT..RETURNING that
  -- references table columns requires the new row to be visible under
  -- a SELECT policy — and the no-archive pin grants none, so
  -- `returning id` is refused ("new row violates row-level security
  -- policy"). Discovered by this harness's first draft; kept because
  -- it PROVES the pin bites even on the agent's own fresh row. The
  -- seam inserts blind for the same reason.
  v_digest_id := '08200000-0000-4000-8000-00000000dd01';
  insert into public.desk_digests (id, organization_id, content_json, model_version, created_by)
  values (v_digest_id, v_org, '{"headline": "harness digest"}'::jsonb, 'harness', v_dig);

  v_raised := false;
  begin
    insert into public.desk_digests (organization_id, content_json, model_version, created_by)
    values (v_org, '{"headline": "forged attribution"}'::jsonb, 'harness', v_manager);
  exception when others then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (1): the agent inserted a digest under a HUMAN''s name';
  end if;

  perform public.record_agent_event(
    'desk_digest_generated', null, null,
    jsonb_build_object('agent_kind', 'digest', 'trigger', 'generate',
                       'members_count', 1, 'unassigned_count', 1,
                       'replaced_existing', false));

  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);

  select count(*) into v_count from public.desk_digests
   where organization_id = v_org and created_by = v_dig;
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL (1): % digests landed under the agent (expected 1)', v_count;
  end if;

  select actor_id, actor_label, detail into v_uuid, v_text, v_jsonb
    from public.activity_events where event_type = 'desk_digest_generated';
  if v_uuid is distinct from v_dig then
    raise exception 'INVARIANT-FAIL (1): the digest event''s actor is %, not the digest writer', v_uuid;
  end if;
  if v_text is distinct from 'Desk Digest Agent' then
    raise exception 'INVARIANT-FAIL (1): the actor label is %, not the digest writer''s name', v_text;
  end if;
  if v_jsonb->>'trigger' is distinct from 'generate'
     or v_jsonb->>'members_count' is distinct from '1' then
    raise exception 'INVARIANT-FAIL (1): the event detail is wrong (%)', v_jsonb;
  end if;
  execute 'set local role authenticated';

  ------------------------------------------------------------------------
  -- (2) The append-only pin. THE control tripwire for the
  --     added-policy drift.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_dig, 'role', 'authenticated')::text, true);

  begin
    update public.desk_digests set content_json = '{"headline": "rewritten"}'::jsonb
     where id = v_digest_id;
  exception when others then null; end;

  begin
    delete from public.desk_digests where id = v_digest_id;
  exception when others then null; end;

  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  select count(*), count(*) filter (where content_json->>'headline' = 'harness digest')
    into v_count, v_count2 from public.desk_digests
   where organization_id = v_org;
  if v_count <> 1 or v_count2 <> 1 then
    raise exception 'INVARIANT-FAIL (2): the agent rewrote a landed digest (% rows, % original)', v_count, v_count2;
  end if;
  execute 'set local role authenticated';

  ------------------------------------------------------------------------
  -- (3) The vocabulary's history is intact at nine — by COUNT.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_dig, 'role', 'authenticated')::text, true);

  for v_type in
    select unnest(array['feedback_interpreted', 'candidates_ranked',
                        'candidate_parsed', 'candidate_evaluated',
                        'candidate_positioned', 'candidate_researched',
                        'candidate_triangulated', 'candidate_profiled',
                        'desk_digest_generated'])
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
  if v_count <> 9 then
    raise exception 'INVARIANT-FAIL (3): % of 9 history probes landed — the vocabulary lost a prior slice''s event type SILENTLY (write_activity_event swallows the CHECK violation by 053''s design)', v_count;
  end if;
  execute 'set local role authenticated';

  ------------------------------------------------------------------------
  -- (4) The negative matrix, UNCHANGED — the digest writer sees
  --     nothing — plus the forgery boundary and the no-archive pin.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_dig, 'role', 'authenticated')::text, true);

  select count(*) into v_count from public.clients;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (4): the digest writer reads % clients rows', v_count;
  end if;

  select count(*) into v_count from public.placements;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (4): the digest writer reads % placements rows', v_count;
  end if;

  select count(*) into v_count from public.organizations;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (4): the digest writer reads % organizations rows', v_count;
  end if;

  select count(*) into v_count from public.activity_events;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (4): the digest writer reads % activity_events rows', v_count;
  end if;

  select count(*), count(*) filter (where id = v_dig)
    into v_count, v_count2 from public.users;
  if v_count <> 1 or v_count2 <> 1 then
    raise exception 'INVARIANT-FAIL (4): the digest writer reads % users rows (self: %)', v_count, v_count2;
  end if;

  -- The no-archive pin: the writer cannot read the record it feeds.
  select count(*) into v_count from public.desk_digests;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (4): the digest writer reads % desk_digests rows (no SELECT granted)', v_count;
  end if;

  select count(*) into v_count from public.portal_context();
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (4): portal_context answered the digest writer (% rows)', v_count;
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_manager, 'role', 'authenticated')::text, true);

  v_raised := false;
  begin
    perform public.record_agent_event('desk_digest_generated');
  exception when insufficient_privilege then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (4): a manager recorded desk_digest_generated through the agent door';
  end if;

  v_raised := false;
  begin
    perform public.record_activity_event('desk_digest_generated');
  exception when others then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (4): a manager recorded desk_digest_generated through the human door';
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_dig, 'role', 'authenticated')::text, true);
  v_raised := false;
  begin
    perform public.record_agent_event('digest_shredded');
  exception when others then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (4): the digest writer recorded an unknown event type';
  end if;

  ------------------------------------------------------------------------
  -- (5) Kill switches independent at nine.
  ------------------------------------------------------------------------
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  update public.users set status = 'suspended' where id = v_dig;
  execute 'set local role authenticated';

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_dig, 'role', 'authenticated')::text, true);
  v_raised := false;
  begin
    insert into public.desk_digests (organization_id, content_json, model_version, created_by)
    values ('08200000-0000-4000-8000-0000000000a0', '{"headline": "suspended write"}'::jsonb, 'harness', v_dig);
  exception when others then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (5): the suspended digest writer inserted a digest';
  end if;
  v_raised := false;
  begin
    perform public.record_agent_event('desk_digest_generated');
  exception when insufficient_privilege then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (5): the suspended digest writer recorded an event';
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_psy, 'role', 'authenticated')::text, true);
  perform public.record_agent_event(
    'candidate_profiled', v_project, null,
    jsonb_build_object('agent_kind', 'psychology', 'probe', 'nine-way-independence'));

  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  select count(*) into v_count from public.activity_events
   where event_type = 'candidate_profiled' and actor_id = v_psy
     and detail->>'probe' = 'nine-way-independence';
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL (5): the psychology agent''s event did not land with the digest writer down';
  end if;
  update public.users set status = 'active' where id = v_dig;

  raise notice 'ALL AGENT-DIGEST INVARIANTS PASSED';
end
$checks$;

rollback;
