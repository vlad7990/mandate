-- Search Intelligence — sourcing run invariant tests (migration 041).
--
-- Runs inside a transaction that is ROLLED BACK. Execute as a privileged role;
-- the RPC/RLS checks switch to `authenticated`.
--
-- Each expected-failure case asserts the SPECIFIC error it should raise, not
-- merely that something failed — a catch-all passes on a typo or a missing
-- grant and reports a guarantee that was never tested.
--
-- Invariants:
--   1. Runs cannot be INSERTed pre-executed.
--   2. Draft cannot be promoted to executed by direct UPDATE (RPC-only).
--   3. An executed run's content_json is frozen.
--   4. An executed run's lineage (parent/root/version) is frozen.
--   5. An executed run's execution record (executed_at/result_count) is frozen.
--   6. analysis_json, label and imported_count REMAIN writable when executed.
--   7. An executed run cannot return to draft.
--   8. Lineage version allocation increments within a root, not globally.
--   9. Attribution is first-touch: earliest EXECUTED run wins.
--  10. Draft runs never attribute.
--  11. Erasing a candidate purges its staged sourcing_run_results rows.
--  12. RLS scopes runs to the owning organization.
--
-- On success: NOTICE 'ALL SOURCING-RUN INVARIANTS PASSED'.

begin;

insert into auth.users (id, email)
values
  ('aaaaaaaa-0000-0000-0000-0000000000d1', 'sourcing@test.local'),
  ('aaaaaaaa-0000-0000-0000-0000000000d2', 'sourcing-other@test.local');

insert into public.organizations (id, name, slug)
values
  ('bbbbbbbb-0000-0000-0000-0000000000d1', 'Sourcing Org', 'sourcing-org'),
  ('bbbbbbbb-0000-0000-0000-0000000000d2', 'Sourcing Other Org', 'sourcing-other-org');

insert into public.users (id, organization_id, email, status, role)
values
  ('aaaaaaaa-0000-0000-0000-0000000000d1', 'bbbbbbbb-0000-0000-0000-0000000000d1',
   'sourcing@test.local', 'active', 'admin'),
  ('aaaaaaaa-0000-0000-0000-0000000000d2', 'bbbbbbbb-0000-0000-0000-0000000000d2',
   'sourcing-other@test.local', 'active', 'admin')
on conflict (id) do update
  set organization_id = excluded.organization_id, status = excluded.status;

insert into public.projects (id, organization_id, created_by, title, company_name, one_line_input)
values ('cccccccc-0000-0000-0000-0000000000d1', 'bbbbbbbb-0000-0000-0000-0000000000d1',
        'aaaaaaaa-0000-0000-0000-0000000000d1', 'Global Head of RegTech', 'TestBank',
        'Global Head of Regulatory Technology, NY or Toronto');

insert into public.candidates (id, organization_id, project_id, full_name, cv_processing)
values
  ('eeeeeeee-0000-0000-0000-0000000000d1', 'bbbbbbbb-0000-0000-0000-0000000000d1',
   'cccccccc-0000-0000-0000-0000000000d1', 'Multi Touch Person', false),
  ('eeeeeeee-0000-0000-0000-0000000000d2', 'bbbbbbbb-0000-0000-0000-0000000000d1',
   'cccccccc-0000-0000-0000-0000000000d1', 'Erasure Person', false);

do $checks$
declare
  v_v1        uuid;
  v_v2        uuid;
  v_v3        uuid;
  v_ver       int;
  v_root      uuid;
  v_root2     uuid;
  v_other     uuid;
  v_count     int;
  v_attr      uuid;
  v_status    text;
  v_analysis  jsonb;
begin
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', 'aaaaaaaa-0000-0000-0000-0000000000d1', 'role', 'authenticated')::text,
    true
  );
  execute 'set local role authenticated';

  -- Lineage v1
  select id, version, root_run_id into v_v1, v_ver, v_root
    from public.allocate_and_insert_sourcing_run(
      'cccccccc-0000-0000-0000-0000000000d1',
      'bbbbbbbb-0000-0000-0000-0000000000d1',
      null, 'Conservative',
      '{"strategy_rationale":"baseline","queries":[{"slot":"linkedin_exact","content":"A"}]}'::jsonb,
      'aaaaaaaa-0000-0000-0000-0000000000d1', 'pv', 'mv');

  if v_ver <> 1 then
    raise exception 'INVARIANT-FAIL: first run version is %, expected 1', v_ver;
  end if;
  if v_root <> v_v1 then
    raise exception 'INVARIANT-FAIL: v1 root_run_id is %, expected its own id %', v_root, v_v1;
  end if;

  -- (1) pre-executed insert rejected
  begin
    insert into public.sourcing_runs
      (project_id, organization_id, root_run_id, version, status)
    values ('cccccccc-0000-0000-0000-0000000000d1', 'bbbbbbbb-0000-0000-0000-0000000000d1',
            gen_random_uuid(), 99, 'executed');
    raise exception 'INVARIANT-FAIL: pre-executed sourcing run insert was accepted';
  exception when others then
    if sqlerrm like 'INVARIANT-FAIL%' then raise; end if;
    if sqlerrm not like '%created as drafts%' then
      raise exception 'INVARIANT-FAIL: pre-executed insert blocked by the wrong error: %', sqlerrm;
    end if;
  end;

  -- (2) direct promotion rejected
  begin
    update public.sourcing_runs set status = 'executed' where id = v_v1;
    raise exception 'INVARIANT-FAIL: draft run was executed by direct update';
  exception when others then
    if sqlerrm like 'INVARIANT-FAIL%' then raise; end if;
    if sqlerrm not like '%mark_sourcing_run_executed()%' then
      raise exception 'INVARIANT-FAIL: direct promotion blocked by the wrong error: %', sqlerrm;
    end if;
  end;

  -- Execute v1 through the RPC.
  perform public.mark_sourcing_run_executed(v_v1, 213);

  select status into v_status from public.sourcing_runs where id = v_v1;
  if v_status <> 'executed' then
    raise exception 'INVARIANT-FAIL: run not executed (status=%)', v_status;
  end if;

  -- (3) content_json frozen
  begin
    update public.sourcing_runs
       set content_json = '{"tampered":true}'::jsonb
     where id = v_v1;
    raise exception 'INVARIANT-FAIL: executed run accepted a strategy edit';
  exception when others then
    if sqlerrm like 'INVARIANT-FAIL%' then raise; end if;
    if sqlerrm not like '%strategy is frozen%' then
      raise exception 'INVARIANT-FAIL: strategy edit blocked by the wrong error: %', sqlerrm;
    end if;
  end;

  -- (4) lineage frozen
  begin
    update public.sourcing_runs set version = 42 where id = v_v1;
    raise exception 'INVARIANT-FAIL: executed run accepted a lineage edit';
  exception when others then
    if sqlerrm like 'INVARIANT-FAIL%' then raise; end if;
    if sqlerrm not like '%lineage is frozen%' then
      raise exception 'INVARIANT-FAIL: lineage edit blocked by the wrong error: %', sqlerrm;
    end if;
  end;

  -- (5) execution record frozen
  begin
    update public.sourcing_runs set result_count = 9999 where id = v_v1;
    raise exception 'INVARIANT-FAIL: executed run accepted a result_count edit';
  exception when others then
    if sqlerrm like 'INVARIANT-FAIL%' then raise; end if;
    if sqlerrm not like '%execution record is frozen%' then
      raise exception 'INVARIANT-FAIL: execution edit blocked by the wrong error: %', sqlerrm;
    end if;
  end;

  -- (6) analysis_json / label / imported_count still writable — the carve-out
  --     that makes post-run coverage analysis possible at all.
  update public.sourcing_runs
     set analysis_json = '{"coverage_findings":[{"dimension":"companies"}]}'::jsonb,
         label = 'Conservative (annotated)',
         imported_count = 12
   where id = v_v1;

  select analysis_json into v_analysis from public.sourcing_runs where id = v_v1;
  if v_analysis->'coverage_findings' is null then
    raise exception 'INVARIANT-FAIL: analysis_json was not writable on an executed run';
  end if;

  -- (7) no return to draft
  begin
    update public.sourcing_runs set status = 'draft' where id = v_v1;
    raise exception 'INVARIANT-FAIL: executed run returned to draft';
  exception when others then
    if sqlerrm like 'INVARIANT-FAIL%' then raise; end if;
    if sqlerrm not like '%cannot return to draft%' then
      raise exception 'INVARIANT-FAIL: return-to-draft blocked by the wrong error: %', sqlerrm;
    end if;
  end;

  -- (8) version allocation is per-lineage
  select id, version into v_v2, v_ver
    from public.allocate_and_insert_sourcing_run(
      'cccccccc-0000-0000-0000-0000000000d1',
      'bbbbbbbb-0000-0000-0000-0000000000d1',
      v_v1, 'Adjacent industries', '{}'::jsonb,
      'aaaaaaaa-0000-0000-0000-0000000000d1', 'pv', 'mv');
  if v_ver <> 2 then
    raise exception 'INVARIANT-FAIL: child run version is %, expected 2', v_ver;
  end if;

  select root_run_id into v_root2 from public.sourcing_runs where id = v_v2;
  if v_root2 <> v_v1 then
    raise exception 'INVARIANT-FAIL: child root_run_id is %, expected %', v_root2, v_v1;
  end if;

  -- A separate lineage restarts at 1 — versions are per-root, not per-project.
  select id, version into v_other, v_ver
    from public.allocate_and_insert_sourcing_run(
      'cccccccc-0000-0000-0000-0000000000d1',
      'bbbbbbbb-0000-0000-0000-0000000000d1',
      null, 'Hidden talent', '{}'::jsonb,
      'aaaaaaaa-0000-0000-0000-0000000000d1', 'pv', 'mv');
  if v_ver <> 1 then
    raise exception 'INVARIANT-FAIL: new lineage started at version %, expected 1', v_ver;
  end if;

  -- (9) attribution is first-touch across runs.
  --     v2 is executed FIRST in wall-clock terms below, then v1 already has an
  --     earlier executed_at, so v1 must win regardless of link insert order.
  perform public.mark_sourcing_run_executed(v_v2, 327);

  insert into public.sourcing_run_candidates (run_id, candidate_id, organization_id)
  values
    (v_v2, 'eeeeeeee-0000-0000-0000-0000000000d1', 'bbbbbbbb-0000-0000-0000-0000000000d1'),
    (v_v1, 'eeeeeeee-0000-0000-0000-0000000000d1', 'bbbbbbbb-0000-0000-0000-0000000000d1');

  select attributed_run_id into v_attr
    from public.sourcing_candidate_attribution
   where candidate_id = 'eeeeeeee-0000-0000-0000-0000000000d1';

  if v_attr <> v_v1 then
    raise exception 'INVARIANT-FAIL: attribution went to %, expected the earlier-executed run %', v_attr, v_v1;
  end if;

  -- (10) a draft run never attributes
  select id into v_v3
    from public.allocate_and_insert_sourcing_run(
      'cccccccc-0000-0000-0000-0000000000d1',
      'bbbbbbbb-0000-0000-0000-0000000000d1',
      null, 'Never run', '{}'::jsonb,
      'aaaaaaaa-0000-0000-0000-0000000000d1', 'pv', 'mv');

  insert into public.sourcing_run_candidates (run_id, candidate_id, organization_id)
  values (v_v3, 'eeeeeeee-0000-0000-0000-0000000000d2', 'bbbbbbbb-0000-0000-0000-0000000000d1');

  select count(*) into v_count
    from public.sourcing_candidate_attribution
   where candidate_id = 'eeeeeeee-0000-0000-0000-0000000000d2';
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL: a draft run attributed a candidate';
  end if;

  -- (11) erasure purges staged rows holding the same person's data
  insert into public.sourcing_run_results
    (run_id, organization_id, full_name, source_platform, promoted_candidate_id)
  values
    (v_v1, 'bbbbbbbb-0000-0000-0000-0000000000d1', 'Erasure Person',
     'linkedin_recruiter', 'eeeeeeee-0000-0000-0000-0000000000d2');

  delete from public.candidates where id = 'eeeeeeee-0000-0000-0000-0000000000d2';

  select count(*) into v_count
    from public.sourcing_run_results
   where full_name = 'Erasure Person';
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL: % staged row(s) survived the candidate erasure', v_count;
  end if;

  -- (12) RLS scoping
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', 'aaaaaaaa-0000-0000-0000-0000000000d2', 'role', 'authenticated')::text,
    true
  );

  select count(*) into v_count from public.sourcing_runs
   where project_id = 'cccccccc-0000-0000-0000-0000000000d1';
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL: another org can read % sourcing runs', v_count;
  end if;

  select count(*) into v_count from public.sourcing_candidate_attribution
   where project_id = 'cccccccc-0000-0000-0000-0000000000d1';
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL: attribution view leaked % rows across orgs', v_count;
  end if;

  raise notice 'ALL SOURCING-RUN INVARIANTS PASSED';
end
$checks$;

rollback;
