-- Task-domain invariants (migration 106: the tasks table, the desk's
-- assignment authority, the assignee's completion right, and the two
-- new intent-door types).
--
-- Rolled back; forged-JWT assertions per the house pattern:
--
--    1. The MANAGER creates and assigns — row lands, created_by
--       pinned to the author.
--    2. A RECRUITER cannot create (R4: creation is the desk's act).
--    3. The ASSIGNEE completes their own task — lands, completed_by
--       pinned, the done-is-stamped/signed CHECKs satisfied.
--    4. A NON-assignee recruiter's update lands ZERO rows (RLS USING).
--    5. A completion signed with ANOTHER's name is refused (WITH
--       CHECK pin: nobody signs another's completion).
--    6. The guard trigger refuses a VIEWER and an AGENT as assignee
--       BY NAME (R1: active admin/manager/recruiter/researcher only),
--       and refuses a non-desk reassignment.
--    7. The intent door: task_assigned refused for a recruiter
--       (insufficient_privilege — the desk gate); task_completed
--       lands for the assignee with the right face; the agent door
--       refuses the human type.
--    8. §42: probe counts EXACT; nothing escapes the harness org.
--
-- On success: NOTICE 'ALL TASK INVARIANTS PASSED'.
--
-- Control run (2026-08-25): tasks_role_update rebuilt with the
-- assignee-or-desk disjunction dropped to plain can_read_org ("org
-- members are trusted") — recruiter B completed recruiter A's task
-- and the harness aborted at INVARIANT-FAIL (4); drift and harness
-- in ONE transaction, the abort rolling the drift back.

begin;

insert into public.organizations (id, name, slug) values
  ('01060000-0000-4000-8000-0000000000c0', 'TK Org A', 'tk-org-a');

insert into auth.users (id, email) values
  ('01060000-0000-4000-8000-0000000000c1', 'tk-manager@test.local'),
  ('01060000-0000-4000-8000-0000000000c2', 'tk-rec-a@test.local'),
  ('01060000-0000-4000-8000-0000000000c3', 'tk-rec-b@test.local'),
  ('01060000-0000-4000-8000-0000000000c4', 'tk-viewer@test.local'),
  ('01060000-0000-4000-8000-0000000000cb', 'tk-agent@test.local');

update public.users set organization_id = '01060000-0000-4000-8000-0000000000c0',
       status = 'active', role = 'manager', full_name = 'TK Manager'
 where id = '01060000-0000-4000-8000-0000000000c1';
update public.users set organization_id = '01060000-0000-4000-8000-0000000000c0',
       status = 'active', role = 'recruiter', full_name = 'TK Recruiter A'
 where id = '01060000-0000-4000-8000-0000000000c2';
update public.users set organization_id = '01060000-0000-4000-8000-0000000000c0',
       status = 'active', role = 'recruiter', full_name = 'TK Recruiter B'
 where id = '01060000-0000-4000-8000-0000000000c3';
update public.users set organization_id = '01060000-0000-4000-8000-0000000000c0',
       status = 'active', role = 'viewer', full_name = 'TK Viewer'
 where id = '01060000-0000-4000-8000-0000000000c4';
update public.users set organization_id = '01060000-0000-4000-8000-0000000000c0',
       status = 'active', role = 'agent', full_name = 'TK Agent'
 where id = '01060000-0000-4000-8000-0000000000cb';

do $checks$
declare
  v_manager uuid := '01060000-0000-4000-8000-0000000000c1';
  v_rec_a   uuid := '01060000-0000-4000-8000-0000000000c2';
  v_rec_b   uuid := '01060000-0000-4000-8000-0000000000c3';
  v_viewer  uuid := '01060000-0000-4000-8000-0000000000c4';
  v_agent   uuid := '01060000-0000-4000-8000-0000000000cb';
  v_org     uuid := '01060000-0000-4000-8000-0000000000c0';
  v_task    uuid;
  v_task2   uuid;
  v_count   int;
  v_raised  boolean;
  v_uuid    uuid;
  v_text    text;
begin
  execute 'set local role authenticated';

  ------------------------------------------------------------------------
  -- (1) The manager creates and assigns.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_manager, 'role', 'authenticated')::text, true);
  insert into public.tasks (organization_id, title, assignee_id, created_by, due_on)
  values (v_org, 'TK probe: chase the reference', v_rec_a, v_manager, current_date - 1)
  returning id into v_task;
  if v_task is null then
    raise exception 'INVARIANT-FAIL (1): the manager''s task did not land';
  end if;

  ------------------------------------------------------------------------
  -- (2) A recruiter cannot create.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_rec_a, 'role', 'authenticated')::text, true);
  v_raised := false;
  begin
    insert into public.tasks (organization_id, title, created_by)
    values (v_org, 'TK illegal self-creation', v_rec_a);
  exception when others then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (2): a RECRUITER created a task';
  end if;

  ------------------------------------------------------------------------
  -- (3) The assignee completes their own.
  ------------------------------------------------------------------------
  update public.tasks
     set status = 'done', completed_at = now(), completed_by = v_rec_a
   where id = v_task;
  get diagnostics v_count = row_count;
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL (3): the assignee could not complete (% rows)', v_count;
  end if;

  ------------------------------------------------------------------------
  -- (4) A non-assignee recruiter lands zero rows.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_manager, 'role', 'authenticated')::text, true);
  insert into public.tasks (organization_id, title, assignee_id, created_by)
  values (v_org, 'TK probe two', v_rec_a, v_manager)
  returning id into v_task2;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_rec_b, 'role', 'authenticated')::text, true);
  update public.tasks
     set status = 'done', completed_at = now(), completed_by = v_rec_b
   where id = v_task2;
  get diagnostics v_count = row_count;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (4): a NON-assignee completed someone else''s task (% rows)', v_count;
  end if;

  ------------------------------------------------------------------------
  -- (5) Nobody signs another's completion.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_rec_a, 'role', 'authenticated')::text, true);
  v_raised := false;
  begin
    update public.tasks
       set status = 'done', completed_at = now(), completed_by = v_rec_b
     where id = v_task2;
  exception when others then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (5): a completion landed signed with ANOTHER''s name';
  end if;

  ------------------------------------------------------------------------
  -- (6) The guard trigger: assignee validity and desk-only reassignment.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_manager, 'role', 'authenticated')::text, true);
  v_raised := false;
  begin
    insert into public.tasks (organization_id, title, assignee_id, created_by)
    values (v_org, 'TK illegal viewer task', v_viewer, v_manager);
  exception when others then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (6): a VIEWER became an assignee';
  end if;
  v_raised := false;
  begin
    insert into public.tasks (organization_id, title, assignee_id, created_by)
    values (v_org, 'TK illegal agent task', v_agent, v_manager);
  exception when others then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (6): an AGENT became an assignee';
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_rec_a, 'role', 'authenticated')::text, true);
  v_raised := false;
  begin
    update public.tasks set assignee_id = v_rec_b where id = v_task2;
  exception when others then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (6): a NON-desk member reassigned a task';
  end if;

  ------------------------------------------------------------------------
  -- (7) The intent door, three faces.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_rec_b, 'role', 'authenticated')::text, true);
  v_raised := false;
  begin
    perform public.record_activity_event(
      'task_assigned', null, null, null,
      jsonb_build_object('task_title', 'TK forged', 'probe', 'tk-106'));
  exception when insufficient_privilege then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (7): a RECRUITER recorded a task assignment';
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_rec_a, 'role', 'authenticated')::text, true);
  perform public.record_activity_event(
    'task_completed', null, null, null,
    jsonb_build_object('task_title', 'TK probe: chase the reference', 'probe', 'tk-106'));
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  select count(*) into v_count from public.activity_events
   where detail->>'probe' = 'tk-106';
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL (7): % of 1 task events landed — vanished SILENTLY (§42)', v_count;
  end if;
  select actor_id, actor_label into v_uuid, v_text
    from public.activity_events
   where event_type = 'task_completed' and detail->>'probe' = 'tk-106';
  if v_uuid is distinct from v_rec_a or v_text is distinct from 'TK Recruiter A' then
    raise exception 'INVARIANT-FAIL (7): the completion wears the wrong face (% / %)', v_uuid, v_text;
  end if;
  execute 'set local role authenticated';

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_agent, 'role', 'authenticated')::text, true);
  v_raised := false;
  begin
    perform public.record_agent_event('task_assigned');
  exception when others then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (7): the AGENT door accepted the human type';
  end if;

  ------------------------------------------------------------------------
  -- (8) Nothing escapes the harness org.
  ------------------------------------------------------------------------
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  select count(*) into v_count from public.tasks where organization_id <> v_org;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (8): % task row(s) outside the harness org', v_count;
  end if;
  select count(*) into v_count from public.activity_events
   where detail->>'probe' = 'tk-106' and organization_id <> v_org;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (8): % probe event(s) escaped the harness org', v_count;
  end if;

  raise notice 'ALL TASK INVARIANTS PASSED';
end;
$checks$;

rollback;
