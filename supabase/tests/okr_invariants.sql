-- OKR-domain invariants (migrations 107 + 108: objectives, key
-- results, the owner rules, the money boundary, the researcher slice,
-- and the intent-door types).
--
-- Rolled back; forged-JWT assertions per the house pattern:
--
--    1. A RECRUITER creates their OWN objective — row lands,
--       created_by pinned; a quantitative key result lands under it.
--    2. The MANAGER creates an objective OWNED BY someone else —
--       the desk's act, lands.
--    3. A recruiter setting the owner to someone ELSE is refused
--       (guard: only the desk hands an objective to someone else).
--    4. The guard refuses forbidden owners BY NAME — an ADMIN (R4),
--       a VIEWER, an AGENT — and ADMITS a RESEARCHER (108, D1).
--    5. A RESEARCHER creates their OWN objective with a
--       placements_sourced key result (108, D1 + D4); a VIEWER
--       cannot create at all.
--    6. A NON-owner recruiter's update lands ZERO rows (RLS USING);
--       a non-desk owner handoff is refused (guard); the author
--       never changes (guard).
--    7. The owner closes their own objective — stamped and signed;
--       a close signed with ANOTHER's name is refused (WITH CHECK
--       pin: nobody signs another's close).
--    8. R1, the money boundary: a FINANCIAL key result lands for a
--       fees-tier owner; the VIEWER and the RESEARCHER read ZERO
--       financial rows while both still read the quantitative one; a
--       fellow recruiter (fees:read) reads it.
--    9. Qualitative attestation: the owner attests their own — lands
--       with the pin; an attestation signed with ANOTHER's name is
--       refused; a NON-owner's key-result update lands ZERO rows.
--   10. The structural CHECKs: financial without currency refused;
--       qualitative with a target refused; a metric outside the
--       vocabulary refused.
--   11. D3 (108), both faces BY NAME: a financial key result on a
--       RESEARCHER-owned objective is refused by the trigger; the
--       desk handing a financial-carrying objective TO a researcher
--       is refused by the owner guard.
--   12. The intent door: objective_created refused for a VIEWER
--       (insufficient_privilege — the okr-writer gate); lands for
--       the recruiter AND the researcher wearing their own faces;
--       the agent door refuses the human type.
--   13. §42: probe counts EXACT; nothing escapes the harness org.
--
-- On success: NOTICE 'ALL OKR INVARIANTS PASSED'.
--
-- Control run (2026-08-25, 107): okr_key_results_role_select rebuilt
-- with the financial clause dropped to plain org-read — the VIEWER
-- read the money row and the harness aborted at INVARIANT-FAIL (8);
-- drift and harness in ONE transaction, the abort rolling the drift
-- back.

begin;

insert into public.organizations (id, name, slug) values
  ('01070000-0000-4000-8000-0000000000d0', 'OKR Org A', 'okr-org-a');

insert into auth.users (id, email) values
  ('01070000-0000-4000-8000-0000000000d1', 'okr-manager@test.local'),
  ('01070000-0000-4000-8000-0000000000d2', 'okr-rec-a@test.local'),
  ('01070000-0000-4000-8000-0000000000d3', 'okr-rec-b@test.local'),
  ('01070000-0000-4000-8000-0000000000d4', 'okr-viewer@test.local'),
  ('01070000-0000-4000-8000-0000000000d5', 'okr-researcher@test.local'),
  ('01070000-0000-4000-8000-0000000000d6', 'okr-admin@test.local'),
  ('01070000-0000-4000-8000-0000000000db', 'okr-agent@test.local');

update public.users set organization_id = '01070000-0000-4000-8000-0000000000d0',
       status = 'active', role = 'manager', full_name = 'OKR Manager'
 where id = '01070000-0000-4000-8000-0000000000d1';
update public.users set organization_id = '01070000-0000-4000-8000-0000000000d0',
       status = 'active', role = 'recruiter', full_name = 'OKR Recruiter A'
 where id = '01070000-0000-4000-8000-0000000000d2';
update public.users set organization_id = '01070000-0000-4000-8000-0000000000d0',
       status = 'active', role = 'recruiter', full_name = 'OKR Recruiter B'
 where id = '01070000-0000-4000-8000-0000000000d3';
update public.users set organization_id = '01070000-0000-4000-8000-0000000000d0',
       status = 'active', role = 'viewer', full_name = 'OKR Viewer'
 where id = '01070000-0000-4000-8000-0000000000d4';
update public.users set organization_id = '01070000-0000-4000-8000-0000000000d0',
       status = 'active', role = 'researcher', full_name = 'OKR Researcher'
 where id = '01070000-0000-4000-8000-0000000000d5';
update public.users set organization_id = '01070000-0000-4000-8000-0000000000d0',
       status = 'active', role = 'admin', full_name = 'OKR Admin'
 where id = '01070000-0000-4000-8000-0000000000d6';
update public.users set organization_id = '01070000-0000-4000-8000-0000000000d0',
       status = 'active', role = 'agent', full_name = 'OKR Agent'
 where id = '01070000-0000-4000-8000-0000000000db';

do $checks$
declare
  v_manager    uuid := '01070000-0000-4000-8000-0000000000d1';
  v_rec_a      uuid := '01070000-0000-4000-8000-0000000000d2';
  v_rec_b      uuid := '01070000-0000-4000-8000-0000000000d3';
  v_viewer     uuid := '01070000-0000-4000-8000-0000000000d4';
  v_researcher uuid := '01070000-0000-4000-8000-0000000000d5';
  v_admin      uuid := '01070000-0000-4000-8000-0000000000d6';
  v_agent      uuid := '01070000-0000-4000-8000-0000000000db';
  v_org        uuid := '01070000-0000-4000-8000-0000000000d0';
  v_obj        uuid;
  v_obj2       uuid;
  v_obj3       uuid;
  v_obj4       uuid;
  v_kr_fin     uuid;
  v_kr_qual    uuid;
  v_count      int;
  v_raised     boolean;
  v_uuid       uuid;
  v_text       text;
begin
  execute 'set local role authenticated';

  ------------------------------------------------------------------------
  -- (1) A recruiter creates their own objective + a quantitative KR.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_rec_a, 'role', 'authenticated')::text, true);
  insert into public.objectives
    (organization_id, owner_user_id, title, period_start, period_end, created_by)
  values
    (v_org, v_rec_a, 'OKR probe: Q3 delivery', current_date, current_date + 90, v_rec_a)
  returning id into v_obj;
  if v_obj is null then
    raise exception 'INVARIANT-FAIL (1): the recruiter''s own objective did not land';
  end if;
  insert into public.objective_key_results
    (organization_id, objective_id, kind, label, metric_source, target_value)
  values
    (v_org, v_obj, 'quantitative', 'Submissions this quarter', 'submissions', 12);

  ------------------------------------------------------------------------
  -- (2) The manager creates an objective owned by someone else.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_manager, 'role', 'authenticated')::text, true);
  insert into public.objectives
    (organization_id, owner_user_id, title, period_start, period_end, created_by)
  values
    (v_org, v_rec_b, 'OKR probe: desk-set goal', current_date, current_date + 90, v_manager)
  returning id into v_obj2;
  if v_obj2 is null then
    raise exception 'INVARIANT-FAIL (2): the desk-set objective did not land';
  end if;

  ------------------------------------------------------------------------
  -- (3) A recruiter cannot set the owner to someone else.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_rec_a, 'role', 'authenticated')::text, true);
  v_raised := false;
  begin
    insert into public.objectives
      (organization_id, owner_user_id, title, period_start, period_end, created_by)
    values
      (v_org, v_rec_b, 'OKR illegal other-owner', current_date, current_date + 30, v_rec_a);
  exception when others then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (3): a recruiter set another''s objective';
  end if;

  ------------------------------------------------------------------------
  -- (4) Forbidden owners by name — and the researcher admitted (108).
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_manager, 'role', 'authenticated')::text, true);
  v_raised := false;
  begin
    insert into public.objectives
      (organization_id, owner_user_id, title, period_start, period_end, created_by)
    values
      (v_org, v_admin, 'OKR illegal admin owner', current_date, current_date + 30, v_manager);
  exception when others then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (4): an ADMIN became an objective owner (R4)';
  end if;
  v_raised := false;
  begin
    insert into public.objectives
      (organization_id, owner_user_id, title, period_start, period_end, created_by)
    values
      (v_org, v_viewer, 'OKR illegal viewer owner', current_date, current_date + 30, v_manager);
  exception when others then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (4): a VIEWER became an objective owner';
  end if;
  v_raised := false;
  begin
    insert into public.objectives
      (organization_id, owner_user_id, title, period_start, period_end, created_by)
    values
      (v_org, v_agent, 'OKR illegal agent owner', current_date, current_date + 30, v_manager);
  exception when others then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (4): an AGENT became an objective owner';
  end if;
  insert into public.objectives
    (organization_id, owner_user_id, title, period_start, period_end, created_by)
  values
    (v_org, v_researcher, 'OKR probe: desk-set researcher goal', current_date, current_date + 60, v_manager)
  returning id into v_obj3;
  if v_obj3 is null then
    raise exception 'INVARIANT-FAIL (4): a RESEARCHER could not be desk-set as owner (108 D1)';
  end if;

  ------------------------------------------------------------------------
  -- (5) The researcher self-creates with placements_sourced (D1 + D4);
  --     the viewer cannot create at all.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_researcher, 'role', 'authenticated')::text, true);
  insert into public.objectives
    (organization_id, owner_user_id, title, period_start, period_end, created_by)
  values
    (v_org, v_researcher, 'OKR probe: researcher sourcing', current_date, current_date + 90, v_researcher)
  returning id into v_obj4;
  if v_obj4 is null then
    raise exception 'INVARIANT-FAIL (5): the researcher''s own objective did not land (108 D1)';
  end if;
  insert into public.objective_key_results
    (organization_id, objective_id, kind, label, metric_source, target_value)
  values
    (v_org, v_obj4, 'quantitative', 'Two placements sourced', 'placements_sourced', 2);

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_viewer, 'role', 'authenticated')::text, true);
  v_raised := false;
  begin
    insert into public.objectives
      (organization_id, owner_user_id, title, period_start, period_end, created_by)
    values
      (v_org, v_rec_a, 'OKR illegal viewer create', current_date, current_date + 30, v_viewer);
  exception when others then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (5): a VIEWER created an objective';
  end if;

  ------------------------------------------------------------------------
  -- (6) Non-owner updates land zero rows; non-desk handoff and author
  --     rewrites are refused.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_rec_a, 'role', 'authenticated')::text, true);
  update public.objectives set title = 'OKR hijacked' where id = v_obj2;
  get diagnostics v_count = row_count;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (6): a NON-owner edited someone else''s objective (% rows)', v_count;
  end if;
  v_raised := false;
  begin
    update public.objectives set owner_user_id = v_rec_b where id = v_obj;
  exception when others then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (6): a NON-desk member handed an objective away';
  end if;
  v_raised := false;
  begin
    update public.objectives set created_by = v_rec_b where id = v_obj;
  exception when others then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (6): an objective''s author was rewritten';
  end if;

  ------------------------------------------------------------------------
  -- (7) The close pin.
  ------------------------------------------------------------------------
  v_raised := false;
  begin
    update public.objectives
       set status = 'closed', closed_at = now(), closed_by = v_rec_b
     where id = v_obj;
  exception when others then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (7): a close landed signed with ANOTHER''s name';
  end if;
  update public.objectives
     set status = 'closed', closed_at = now(), closed_by = v_rec_a
   where id = v_obj;
  get diagnostics v_count = row_count;
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL (7): the owner could not close their own objective (% rows)', v_count;
  end if;

  ------------------------------------------------------------------------
  -- (8) R1: the money boundary on financial key results.
  ------------------------------------------------------------------------
  insert into public.objective_key_results
    (organization_id, objective_id, kind, label, metric_source, target_value, currency)
  values
    (v_org, v_obj, 'financial', 'Fees earned this quarter', 'fees_earned', 250000, 'USD')
  returning id into v_kr_fin;
  if v_kr_fin is null then
    raise exception 'INVARIANT-FAIL (8): the owner''s financial key result did not land';
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_viewer, 'role', 'authenticated')::text, true);
  select count(*) into v_count from public.objective_key_results
   where objective_id = v_obj and kind = 'financial';
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (8): the VIEWER read % financial row(s)', v_count;
  end if;
  select count(*) into v_count from public.objective_key_results
   where objective_id = v_obj and kind = 'quantitative';
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL (8): the VIEWER should read the quantitative row (% rows)', v_count;
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_researcher, 'role', 'authenticated')::text, true);
  select count(*) into v_count from public.objective_key_results
   where objective_id = v_obj and kind = 'financial';
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (8): the RESEARCHER read % financial row(s)', v_count;
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_rec_b, 'role', 'authenticated')::text, true);
  select count(*) into v_count from public.objective_key_results
   where objective_id = v_obj and kind = 'financial';
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL (8): a fees:read recruiter read % of 1 financial row(s)', v_count;
  end if;

  ------------------------------------------------------------------------
  -- (9) Qualitative attestation: the pin, and non-owner zero rows.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_rec_a, 'role', 'authenticated')::text, true);
  insert into public.objective_key_results
    (organization_id, objective_id, kind, label)
  values
    (v_org, v_obj, 'qualitative', 'Calibration signed off with the HM')
  returning id into v_kr_qual;

  v_raised := false;
  begin
    update public.objective_key_results
       set attested_at = now(), attested_by = v_rec_b
     where id = v_kr_qual;
  exception when others then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (9): an attestation landed signed with ANOTHER''s name';
  end if;
  update public.objective_key_results
     set attested_at = now(), attested_by = v_rec_a
   where id = v_kr_qual;
  get diagnostics v_count = row_count;
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL (9): the owner could not attest their own milestone (% rows)', v_count;
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_rec_b, 'role', 'authenticated')::text, true);
  update public.objective_key_results set label = 'OKR hijacked KR' where id = v_kr_qual;
  get diagnostics v_count = row_count;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (9): a NON-owner edited someone else''s key result (% rows)', v_count;
  end if;

  ------------------------------------------------------------------------
  -- (10) The structural CHECKs.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_rec_a, 'role', 'authenticated')::text, true);
  v_raised := false;
  begin
    insert into public.objective_key_results
      (organization_id, objective_id, kind, label, metric_source, target_value)
    values
      (v_org, v_obj, 'financial', 'OKR currencyless money', 'fees_earned', 100000);
  exception when others then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (10): a financial key result landed WITHOUT a currency';
  end if;
  v_raised := false;
  begin
    insert into public.objective_key_results
      (organization_id, objective_id, kind, label, target_value)
    values
      (v_org, v_obj, 'qualitative', 'OKR scored milestone', 5);
  exception when others then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (10): a qualitative key result landed WITH a target number';
  end if;
  v_raised := false;
  begin
    insert into public.objective_key_results
      (organization_id, objective_id, kind, label, metric_source, target_value)
    values
      (v_org, v_obj, 'quantitative', 'OKR rogue metric', 'candidate_charisma', 10);
  exception when others then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (10): a metric outside the vocabulary landed';
  end if;

  ------------------------------------------------------------------------
  -- (11) D3 (108), both faces by name.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_manager, 'role', 'authenticated')::text, true);
  v_raised := false;
  begin
    insert into public.objective_key_results
      (organization_id, objective_id, kind, label, metric_source, target_value, currency)
    values
      (v_org, v_obj4, 'financial', 'OKR money on a researcher', 'fees_earned', 50000, 'USD');
  exception when others then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (11): a financial key result landed on a RESEARCHER-owned objective';
  end if;
  v_raised := false;
  begin
    update public.objectives set owner_user_id = v_researcher where id = v_obj;
  exception when others then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (11): a financial-carrying objective was HANDED to a researcher';
  end if;

  ------------------------------------------------------------------------
  -- (12) The intent door, four faces.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_viewer, 'role', 'authenticated')::text, true);
  v_raised := false;
  begin
    perform public.record_activity_event(
      'objective_created', null, null, null,
      jsonb_build_object('title', 'OKR forged', 'probe', 'okr-107'));
  exception when insufficient_privilege then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (12): a VIEWER recorded an objective act';
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_rec_a, 'role', 'authenticated')::text, true);
  perform public.record_activity_event(
    'objective_created', null, null, null,
    jsonb_build_object('title', 'OKR probe: Q3 delivery', 'probe', 'okr-107'));
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_researcher, 'role', 'authenticated')::text, true);
  perform public.record_activity_event(
    'objective_created', null, null, null,
    jsonb_build_object('title', 'OKR probe: researcher sourcing', 'probe', 'okr-107'));
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  select count(*) into v_count from public.activity_events
   where detail->>'probe' = 'okr-107';
  if v_count <> 2 then
    raise exception 'INVARIANT-FAIL (12): % of 2 objective events landed — vanished SILENTLY (§42)', v_count;
  end if;
  select actor_id, actor_label into v_uuid, v_text
    from public.activity_events
   where event_type = 'objective_created' and detail->>'probe' = 'okr-107'
     and actor_id = v_researcher;
  if v_uuid is distinct from v_researcher or v_text is distinct from 'OKR Researcher' then
    raise exception 'INVARIANT-FAIL (12): the researcher''s event wears the wrong face (% / %)', v_uuid, v_text;
  end if;
  execute 'set local role authenticated';

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_agent, 'role', 'authenticated')::text, true);
  v_raised := false;
  begin
    perform public.record_agent_event('objective_created');
  exception when others then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (12): the AGENT door accepted the human type';
  end if;

  ------------------------------------------------------------------------
  -- (13) Nothing escapes the harness org.
  ------------------------------------------------------------------------
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  select count(*) into v_count from public.objectives where organization_id <> v_org;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (13): % objective row(s) outside the harness org', v_count;
  end if;
  select count(*) into v_count from public.objective_key_results where organization_id <> v_org;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (13): % key-result row(s) outside the harness org', v_count;
  end if;
  select count(*) into v_count from public.objectives where organization_id = v_org;
  if v_count <> 4 then
    raise exception 'INVARIANT-FAIL (13): % of 4 objectives in the harness org', v_count;
  end if;
  select count(*) into v_count from public.objective_key_results where organization_id = v_org;
  if v_count <> 4 then
    raise exception 'INVARIANT-FAIL (13): % of 4 key results in the harness org', v_count;
  end if;
  select count(*) into v_count from public.activity_events
   where detail->>'probe' = 'okr-107' and organization_id <> v_org;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (13): % probe event(s) escaped the harness org', v_count;
  end if;

  raise notice 'ALL OKR INVARIANTS PASSED';
end;
$checks$;

rollback;
