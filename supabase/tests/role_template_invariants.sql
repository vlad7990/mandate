-- Role-template + stage-event invariants (migration 104: org-authored
-- executive role templates — the DB side was live since 046/056, the
-- app side lands now — plus the candidate_stage_changed rider,
-- writer-gated at the intent door).
--
-- Rolled back; forged-JWT assertions per the house pattern:
--
--    1. The ADMIN authors an org template: row lands with created_by
--       stamped, is_global false, and a key that SHADOWS a global —
--       legal by 032's partial unique indexes.
--    2. A RECRUITER's insert is refused (org authoring is is_org_admin
--       at the RLS layer; skills:write in the app).
--    3. The GLOBAL library is immutable to the admin: UPDATE lands
--       ZERO rows.
--    4. The 056 coherence CHECK refuses an org row claiming
--       is_global = true.
--    5. The searches-side FK refuses deleting a template a search
--       references. FIRST RUN OF THIS ASSERTION FAILED (2026-08-25)
--       and the failure was REAL: 032's single-column FK was ON
--       DELETE SET NULL — it detached the searches first and
--       NULL-exempted 056's composite NO ACTION pairs, so the
--       backstop 056's commentary promises never held. Migration 105
--       rebuilt it NO ACTION; this assertion now passes and pins it.
--    6. The intent door: a VIEWER's candidate_stage_changed refused
--       (insufficient_privilege — the new writer gate); a RECRUITER's
--       lands with {from, to} and the right face; the AGENT door
--       refuses the human type outright.
--    7. §42: probe counts EXACT — the CHECK rebuild swallowed nothing.
--
-- On success: NOTICE 'ALL ROLE-TEMPLATE INVARIANTS PASSED'.
--
-- Control run (2026-08-25): record_activity_event rebuilt WITHOUT the
-- can_write_candidates gate ("the action already checks") — the
-- VIEWER's forged stage-change event LANDED and the harness aborted
-- at INVARIANT-FAIL (6a); drift and harness in ONE transaction, the
-- abort rolling the drift back.

begin;

insert into public.organizations (id, name, slug) values
  ('01040000-0000-4000-8000-0000000000b0', 'RT Org A', 'rt-org-a');

insert into auth.users (id, email) values
  ('01040000-0000-4000-8000-0000000000b1', 'rt-admin@test.local'),
  ('01040000-0000-4000-8000-0000000000b2', 'rt-recruiter@test.local'),
  ('01040000-0000-4000-8000-0000000000b3', 'rt-viewer@test.local'),
  ('01040000-0000-4000-8000-0000000000bb', 'rt-agent@test.local');

update public.users set organization_id = '01040000-0000-4000-8000-0000000000b0',
       status = 'active', role = 'admin', full_name = 'RT Admin'
 where id = '01040000-0000-4000-8000-0000000000b1';
update public.users set organization_id = '01040000-0000-4000-8000-0000000000b0',
       status = 'active', role = 'recruiter', full_name = 'RT Recruiter'
 where id = '01040000-0000-4000-8000-0000000000b2';
update public.users set organization_id = '01040000-0000-4000-8000-0000000000b0',
       status = 'active', role = 'viewer', full_name = 'RT Viewer'
 where id = '01040000-0000-4000-8000-0000000000b3';
update public.users set organization_id = '01040000-0000-4000-8000-0000000000b0',
       status = 'active', role = 'agent', full_name = 'RT Agent'
 where id = '01040000-0000-4000-8000-0000000000bb';

do $checks$
declare
  v_admin     uuid := '01040000-0000-4000-8000-0000000000b1';
  v_recruiter uuid := '01040000-0000-4000-8000-0000000000b2';
  v_viewer    uuid := '01040000-0000-4000-8000-0000000000b3';
  v_agent     uuid := '01040000-0000-4000-8000-0000000000bb';
  v_org       uuid := '01040000-0000-4000-8000-0000000000b0';
  v_global_key  text;
  v_template_id uuid;
  v_count     int;
  v_raised    boolean;
  v_uuid      uuid;
  v_text      text;
begin
  select key into v_global_key
    from public.executive_role_templates
   where organization_id is null
   order by key limit 1;
  if v_global_key is null then
    raise exception 'HARNESS-BROKEN: no global template to shadow';
  end if;

  execute 'set local role authenticated';

  ------------------------------------------------------------------------
  -- (1) The admin authors an org template shadowing a global key.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  insert into public.executive_role_templates
    (organization_id, created_by, is_global, key, title, summary,
     role_family, intake_defaults, competency_weights)
  values
    (v_org, v_admin, false, v_global_key, 'RT Shadow Probe', 'rt-104 probe',
     'other', '{"role_title":"RT Probe"}'::jsonb, '[]'::jsonb)
  returning id into v_template_id;

  if v_template_id is null then
    raise exception 'INVARIANT-FAIL (1): the admin''s org template did not land';
  end if;
  select created_by into v_uuid from public.executive_role_templates
   where id = v_template_id;
  if v_uuid is distinct from v_admin then
    raise exception 'INVARIANT-FAIL (1): created_by wears the wrong face (%)', v_uuid;
  end if;

  ------------------------------------------------------------------------
  -- (2) A recruiter cannot author.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_recruiter, 'role', 'authenticated')::text, true);
  v_raised := false;
  begin
    insert into public.executive_role_templates
      (organization_id, created_by, is_global, key, title)
    values (v_org, v_recruiter, false, 'rt_recruiter_probe', 'RT Illegal');
  exception when others then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (2): a RECRUITER authored a template';
  end if;

  ------------------------------------------------------------------------
  -- (3) The global library is immutable to the admin.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  update public.executive_role_templates
     set title = 'RT Defaced'
   where organization_id is null and key = v_global_key;
  get diagnostics v_count = row_count;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (3): the admin touched % GLOBAL row(s)', v_count;
  end if;

  ------------------------------------------------------------------------
  -- (4) The coherence CHECK refuses an org row claiming to be global.
  ------------------------------------------------------------------------
  v_raised := false;
  begin
    insert into public.executive_role_templates
      (organization_id, created_by, is_global, key, title)
    values (v_org, v_admin, true, 'rt_incoherent_probe', 'RT Incoherent');
  exception when check_violation then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (4): an org row landed claiming is_global';
  end if;

  ------------------------------------------------------------------------
  -- (5) A referenced template cannot be deleted (NO ACTION backstop).
  ------------------------------------------------------------------------
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  insert into public.executive_searches
    (organization_id, company_name, role_title, template_id, template_is_global)
  values
    (v_org, 'RT Harness Co', 'RT Probe Role', v_template_id, false);
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  v_raised := false;
  begin
    delete from public.executive_role_templates where id = v_template_id;
  exception when foreign_key_violation then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (5): a referenced template was deleted';
  end if;

  ------------------------------------------------------------------------
  -- (6) The intent door's writer gate, three faces.
  ------------------------------------------------------------------------
  -- (6a) The viewer is refused by the new gate.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_viewer, 'role', 'authenticated')::text, true);
  v_raised := false;
  begin
    perform public.record_activity_event(
      'candidate_stage_changed', null, null, null,
      jsonb_build_object('from', 'found', 'to', 'hired', 'probe', 'rt-104'));
  exception when insufficient_privilege then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (6a): a VIEWER recorded a stage change';
  end if;

  -- (6b) The recruiter's move lands with the right face and stages only.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_recruiter, 'role', 'authenticated')::text, true);
  perform public.record_activity_event(
    'candidate_stage_changed', null, null, null,
    jsonb_build_object('from', 'found', 'to', 'reviewed', 'probe', 'rt-104'));
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  select count(*) into v_count from public.activity_events
   where detail->>'probe' = 'rt-104';
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL (6b): % of 1 stage events landed — vanished SILENTLY (§42)', v_count;
  end if;
  select actor_id, actor_label into v_uuid, v_text
    from public.activity_events
   where event_type = 'candidate_stage_changed' and detail->>'probe' = 'rt-104';
  if v_uuid is distinct from v_recruiter or v_text is distinct from 'RT Recruiter' then
    raise exception 'INVARIANT-FAIL (6b): the stage event wears the wrong face (% / %)', v_uuid, v_text;
  end if;
  execute 'set local role authenticated';

  -- (6c) The agent door refuses the human type.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_agent, 'role', 'authenticated')::text, true);
  v_raised := false;
  begin
    perform public.record_agent_event('candidate_stage_changed');
  exception when others then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (6c): the AGENT door accepted the human type';
  end if;

  ------------------------------------------------------------------------
  -- (7) Nothing else moved: exactly one probe event, zero probe residue
  --     outside the harness org.
  ------------------------------------------------------------------------
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  select count(*) into v_count from public.activity_events
   where detail->>'probe' = 'rt-104' and organization_id <> v_org;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (7): % probe event(s) escaped the harness org', v_count;
  end if;

  raise notice 'ALL ROLE-TEMPLATE INVARIANTS PASSED';
end;
$checks$;

rollback;
