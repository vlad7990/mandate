-- Job specs — finalize_job_spec invariant tests.
--
-- Companion to executive_intelligence_invariants.sql. The FOLLOW-UPS note
-- suspected finalize_job_spec carried the same per-row partial-index race
-- that approve_success_profile had; investigation showed migration 008
-- already fixed it (explicit demote-then-promote under project + target row
-- locks). This suite pins that behavior so a future rewrite cannot silently
-- reintroduce the race.
--
-- Runs entirely inside a transaction that is ROLLED BACK — no fixture data
-- survives. Execute as a privileged role; the checks run as `authenticated`
-- so RLS and grants are exercised.
--
-- Invariants covered:
--   1. Final-to-final replacement (the path the pre-008 single-statement
--      UPDATE broke) leaves exactly one is_final row — the target.
--   2. Re-finalizing the current final keeps the single-final invariant.
--   3. A mismatched project id raises and leaves the current final untouched.
--   4. Swapping the final back again stays consistent.
--
-- On success: NOTICE 'ALL JOB-SPEC FINALIZE INVARIANTS PASSED'.

begin;

insert into auth.users (id, email)
values ('aaaaaaaa-0000-0000-0000-000000000011', 'finalize-invariants@test.local');

insert into public.organizations (id, name, slug)
values ('bbbbbbbb-0000-0000-0000-000000000011', 'Finalize Test Org', 'finalize-test-org');

insert into public.users (id, organization_id, email, status, role)
values (
  'aaaaaaaa-0000-0000-0000-000000000011',
  'bbbbbbbb-0000-0000-0000-000000000011',
  'finalize-invariants@test.local',
  'active',
  'admin'
)
on conflict (id) do update
  set organization_id = excluded.organization_id,
      status = excluded.status,
      role = excluded.role;

insert into public.projects
  (id, organization_id, created_by, title, company_name, one_line_input,
   status, calibration_model, company_context)
values (
  'cccccccc-0000-0000-0000-000000000011',
  'bbbbbbbb-0000-0000-0000-000000000011',
  'aaaaaaaa-0000-0000-0000-000000000011',
  'Finalize Invariants Test',
  'TestCo',
  'CTO for TestCo',
  'active',
  '{}'::jsonb,
  '{}'::jsonb
);

insert into public.job_specs
  (id, project_id, organization_id, version, content, content_json,
   is_final, is_generating, created_by)
values
  ('dddddddd-0000-0000-0000-000000000011', 'cccccccc-0000-0000-0000-000000000011',
   'bbbbbbbb-0000-0000-0000-000000000011', 1, 'v1 content', '{}'::jsonb,
   true, false, 'aaaaaaaa-0000-0000-0000-000000000011'),
  ('dddddddd-0000-0000-0000-000000000012', 'cccccccc-0000-0000-0000-000000000011',
   'bbbbbbbb-0000-0000-0000-000000000011', 2, 'v2 content', '{}'::jsonb,
   false, false, 'aaaaaaaa-0000-0000-0000-000000000011');

do $checks$
declare
  v_count int;
  v_final uuid;
begin
  perform set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', 'aaaaaaaa-0000-0000-0000-000000000011',
      'role', 'authenticated'
    )::text,
    true
  );
  execute 'set local role authenticated';

  -- (1) final-to-final replacement: v1 is final, promote v2
  perform public.finalize_job_spec(
    'dddddddd-0000-0000-0000-000000000012',
    'cccccccc-0000-0000-0000-000000000011'
  );

  select count(*) into v_count from public.job_specs
   where project_id = 'cccccccc-0000-0000-0000-000000000011' and is_final;
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL: expected exactly 1 final spec after replacement, found %', v_count;
  end if;

  select id into v_final from public.job_specs
   where project_id = 'cccccccc-0000-0000-0000-000000000011' and is_final;
  if v_final <> 'dddddddd-0000-0000-0000-000000000012' then
    raise exception 'INVARIANT-FAIL: wrong spec is final after replacement (%)', v_final;
  end if;

  -- (2) re-finalizing the current final keeps the invariant
  perform public.finalize_job_spec(
    'dddddddd-0000-0000-0000-000000000012',
    'cccccccc-0000-0000-0000-000000000011'
  );

  select count(*) into v_count from public.job_specs
   where project_id = 'cccccccc-0000-0000-0000-000000000011' and is_final;
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL: re-finalize broke the single-final invariant (found %)', v_count;
  end if;

  -- (3) mismatched project id raises and changes nothing
  begin
    perform public.finalize_job_spec(
      'dddddddd-0000-0000-0000-000000000011',
      '00000000-0000-0000-0000-000000000000'
    );
    raise exception 'INVARIANT-FAIL: finalize accepted a mismatched project id';
  exception when others then
    if sqlerrm like 'INVARIANT-FAIL%' then raise; end if;
  end;

  select id into v_final from public.job_specs
   where project_id = 'cccccccc-0000-0000-0000-000000000011' and is_final;
  if v_final <> 'dddddddd-0000-0000-0000-000000000012' then
    raise exception 'INVARIANT-FAIL: failed finalize call changed the final spec (%)', v_final;
  end if;

  -- (4) swap the final back: repeated replacements stay consistent
  perform public.finalize_job_spec(
    'dddddddd-0000-0000-0000-000000000011',
    'cccccccc-0000-0000-0000-000000000011'
  );

  select count(*) into v_count from public.job_specs
   where project_id = 'cccccccc-0000-0000-0000-000000000011' and is_final;
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL: swap-back broke the single-final invariant (found %)', v_count;
  end if;

  select id into v_final from public.job_specs
   where project_id = 'cccccccc-0000-0000-0000-000000000011' and is_final;
  if v_final <> 'dddddddd-0000-0000-0000-000000000011' then
    raise exception 'INVARIANT-FAIL: wrong spec is final after swap-back (%)', v_final;
  end if;

  raise notice 'ALL JOB-SPEC FINALIZE INVARIANTS PASSED';
end
$checks$;

rollback;
