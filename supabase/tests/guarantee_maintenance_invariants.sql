-- Guarantee-maintenance invariants (migration 062).
--
-- Rolled back. The function is the product's first scheduled write path, so
-- the file proves both directions with real rows: the lines it must earn,
-- and — more of them, deliberately — the lines it must not touch. A
-- maintenance job that over-earns writes revenue that was never agreed;
-- one that under-earns is the manual state 062 exists to end.
--
--    1. A guarantee_passed line on a started placement whose guarantee has
--       ended is earned, with earned_on = guarantee_ends_on (the fact's
--       date, not the run date).
--    2. The run reports exactly the number of lines it earned.
--    3. A started placement whose guarantee ends in the future is NOT
--       earned.
--    4. A fell_through placement's guarantee line is NOT earned, however
--       old its dates.
--    5. An accepted-but-not-started placement is NOT earned — there is no
--       guarantee running yet (guarantee_ends_on derives from start_date,
--       so it is NULL).
--    6. A cancelled line stays cancelled.
--    7. A start_date line on the same placement is not touched — the
--       function earns exactly one trigger kind.
--    8. Idempotent: the second run earns nothing.
--    9. The 053 audit trigger wrote fee_line_earned for the earned line,
--       at 'fees' visibility, with a NULL actor — the cron has no session,
--       and the trail renders that as "System".
--   10. The function is callable as `anon` — the grant the cron route
--       depends on, since it holds no privileged key. Proven by running
--       the second, idempotent call under SET ROLE anon.
--
-- On success: NOTICE 'ALL GUARANTEE-MAINTENANCE INVARIANTS PASSED'.

begin;

insert into auth.users (id, email)
values ('aaaaaaaa-0000-0000-0000-0000000000d1', 'gm-admin@test.local');

insert into public.organizations (id, name, slug)
values ('bbbbbbbb-0000-0000-0000-0000000000d1', 'GM Org', 'gm-org');

insert into public.users (id, organization_id, email, status, role)
values ('aaaaaaaa-0000-0000-0000-0000000000d1', 'bbbbbbbb-0000-0000-0000-0000000000d1',
        'gm-admin@test.local', 'active', 'admin')
on conflict (id) do update
  set organization_id = excluded.organization_id,
      status = excluded.status,
      role = excluded.role;

insert into public.clients (id, organization_id, name)
values ('eeeeeeee-0000-0000-0000-0000000000d1', 'bbbbbbbb-0000-0000-0000-0000000000d1',
        'GM Test Client');

insert into public.projects (id, organization_id, created_by, title, company_name,
                             one_line_input, client_id)
values ('cccccccc-0000-0000-0000-0000000000d1', 'bbbbbbbb-0000-0000-0000-0000000000d1',
        'aaaaaaaa-0000-0000-0000-0000000000d1', 'GM Role', 'GM Test Client',
        'GM Role, remote', 'eeeeeeee-0000-0000-0000-0000000000d1');

insert into public.candidates (id, organization_id, project_id, full_name, cv_processing,
                               pipeline_stage)
values
  ('dddddddd-0000-0000-0000-0000000000d1', 'bbbbbbbb-0000-0000-0000-0000000000d1',
   'cccccccc-0000-0000-0000-0000000000d1', 'GM Due', false, 'finalist'),
  ('dddddddd-0000-0000-0000-0000000000d2', 'bbbbbbbb-0000-0000-0000-0000000000d1',
   'cccccccc-0000-0000-0000-0000000000d1', 'GM Future', false, 'finalist'),
  ('dddddddd-0000-0000-0000-0000000000d3', 'bbbbbbbb-0000-0000-0000-0000000000d1',
   'cccccccc-0000-0000-0000-0000000000d1', 'GM Fell', false, 'finalist'),
  ('dddddddd-0000-0000-0000-0000000000d4', 'bbbbbbbb-0000-0000-0000-0000000000d1',
   'cccccccc-0000-0000-0000-0000000000d1', 'GM Accepted', false, 'finalist');

do $checks$
declare
  v_org            uuid := 'bbbbbbbb-0000-0000-0000-0000000000d1';
  v_project        uuid := 'cccccccc-0000-0000-0000-0000000000d1';
  v_client         uuid := 'eeeeeeee-0000-0000-0000-0000000000d1';
  v_place_due      uuid := '99999999-0000-0000-0000-0000000000d1';
  v_place_future   uuid := '99999999-0000-0000-0000-0000000000d2';
  v_place_fell     uuid := '99999999-0000-0000-0000-0000000000d3';
  v_place_accepted uuid := '99999999-0000-0000-0000-0000000000d4';
  v_fee_due        uuid;
  v_fee_future     uuid;
  v_fee_fell       uuid;
  v_fee_accepted   uuid;
  v_earned         integer;
  v_count          integer;
  v_status         text;
  v_earned_on      date;
  v_ends_on        date;
  v_actor          uuid;
  v_visibility     text;
begin
  ------------------------------------------------------------------------
  -- Seed, as a privileged role: this file tests the function, not RLS.
  ------------------------------------------------------------------------

  -- (1) Started 200 days ago on a 90-day guarantee: due.
  -- (3) Started 10 days ago on a 90-day guarantee: not due.
  -- (4) Fell through, with the same old dates as the due one.
  -- (5) Accepted, never started: guarantee_ends_on is NULL by generation.
  -- 050's status_has_date CHECK demands the date behind each status —
  -- fell_through carries fell_through_date, which caught this seed's first
  -- version and is exactly the constraint doing its job.
  insert into public.placements
    (id, organization_id, project_id, candidate_id, client_id, status,
     offer_date, accepted_date, start_date, fell_through_date, guarantee_days)
  values
    (v_place_due, v_org, v_project, 'dddddddd-0000-0000-0000-0000000000d1',
     v_client, 'started', current_date - 220, current_date - 210, current_date - 200, null, 90),
    (v_place_future, v_org, v_project, 'dddddddd-0000-0000-0000-0000000000d2',
     v_client, 'started', current_date - 30, current_date - 20, current_date - 10, null, 90),
    (v_place_fell, v_org, v_project, 'dddddddd-0000-0000-0000-0000000000d3',
     v_client, 'fell_through', current_date - 220, current_date - 210, current_date - 200,
     current_date - 150, 90),
    (v_place_accepted, v_org, v_project, 'dddddddd-0000-0000-0000-0000000000d4',
     v_client, 'accepted', current_date - 220, current_date - 210, null, null, 90);

  insert into public.placement_fees
    (organization_id, placement_id, fee_model, fee_percentage, fee_basis, currency, base_currency, total_fee_amount)
  values
    (v_org, v_place_due, 'retained', 30, 'base_salary', 'GBP', 'GBP', 30000),
    (v_org, v_place_future, 'retained', 30, 'base_salary', 'GBP', 'GBP', 30000),
    (v_org, v_place_fell, 'retained', 30, 'base_salary', 'GBP', 'GBP', 30000),
    (v_org, v_place_accepted, 'retained', 30, 'base_salary', 'GBP', 'GBP', 30000);

  select id into v_fee_due      from public.placement_fees where placement_id = v_place_due;
  select id into v_fee_future   from public.placement_fees where placement_id = v_place_future;
  select id into v_fee_fell     from public.placement_fees where placement_id = v_place_fell;
  select id into v_fee_accepted from public.placement_fees where placement_id = v_place_accepted;

  -- The due placement carries the full cast of lines the function must
  -- discriminate between: the guarantee line it earns, a start_date line
  -- it must ignore (7), and a cancelled guarantee line it must leave (6).
  insert into public.placement_fee_lines
    (organization_id, placement_id, placement_fee_id, kind, label, sequence,
     "trigger", amount, currency, base_currency, status, reason)
  values
    (v_org, v_place_due, v_fee_due, 'instalment', 'Guarantee completion', 3,
     'guarantee_passed', 10000, 'GBP', 'GBP', 'pending', null),
    (v_org, v_place_due, v_fee_due, 'instalment', 'Completion', 2,
     'start_date', 10000, 'GBP', 'GBP', 'pending', null),
    (v_org, v_place_due, v_fee_due, 'instalment', 'Cancelled guarantee', 4,
     'guarantee_passed', 5000, 'GBP', 'GBP', 'cancelled', 'test: waived'),
    (v_org, v_place_future, v_fee_future, 'instalment', 'Guarantee completion', 3,
     'guarantee_passed', 10000, 'GBP', 'GBP', 'pending', null),
    (v_org, v_place_fell, v_fee_fell, 'instalment', 'Guarantee completion', 3,
     'guarantee_passed', 10000, 'GBP', 'GBP', 'pending', null),
    (v_org, v_place_accepted, v_fee_accepted, 'instalment', 'Guarantee completion', 3,
     'guarantee_passed', 10000, 'GBP', 'GBP', 'pending', null);

  -- The seed itself wrote audit events (fee_recorded etc.); clear them so
  -- assertion (9) reads only what the maintenance run writes. Scoped.
  delete from public.activity_events where organization_id = v_org;

  ------------------------------------------------------------------------
  -- The run.
  ------------------------------------------------------------------------
  select public.run_guarantee_maintenance() into v_earned;

  -- (2) Exactly one line was due.
  if v_earned <> 1 then
    raise exception 'INVARIANT 2 FAILED: run reported % earned, expected 1', v_earned;
  end if;

  -- (1) The due line is earned, dated by the guarantee end.
  select l.status, l.earned_on, p.guarantee_ends_on
    into v_status, v_earned_on, v_ends_on
  from public.placement_fee_lines l
  join public.placements p on p.id = l.placement_id
  where l.placement_id = v_place_due and l."trigger" = 'guarantee_passed'
    and l.label = 'Guarantee completion';
  if v_status <> 'earned' or v_earned_on is distinct from v_ends_on then
    raise exception 'INVARIANT 1 FAILED: status %, earned_on %, expected earned on %',
      v_status, v_earned_on, v_ends_on;
  end if;

  -- (3) Future guarantee untouched.
  select status into v_status from public.placement_fee_lines
  where placement_id = v_place_future and "trigger" = 'guarantee_passed';
  if v_status <> 'pending' then
    raise exception 'INVARIANT 3 FAILED: future guarantee line is %', v_status;
  end if;

  -- (4) Fell-through untouched.
  select status into v_status from public.placement_fee_lines
  where placement_id = v_place_fell and "trigger" = 'guarantee_passed';
  if v_status <> 'pending' then
    raise exception 'INVARIANT 4 FAILED: fell-through guarantee line is %', v_status;
  end if;

  -- (5) Accepted-not-started untouched.
  select status into v_status from public.placement_fee_lines
  where placement_id = v_place_accepted and "trigger" = 'guarantee_passed';
  if v_status <> 'pending' then
    raise exception 'INVARIANT 5 FAILED: accepted placement guarantee line is %', v_status;
  end if;

  -- (6) Cancelled stays cancelled.
  select status into v_status from public.placement_fee_lines
  where placement_id = v_place_due and label = 'Cancelled guarantee';
  if v_status <> 'cancelled' then
    raise exception 'INVARIANT 6 FAILED: cancelled line is %', v_status;
  end if;

  -- (7) The start_date line on the same placement is not the function's.
  select status into v_status from public.placement_fee_lines
  where placement_id = v_place_due and "trigger" = 'start_date';
  if v_status <> 'pending' then
    raise exception 'INVARIANT 7 FAILED: start_date line is %', v_status;
  end if;

  -- (9) The audit trigger fired once, at fees visibility, with no actor.
  select count(*) into v_count from public.activity_events
  where organization_id = v_org and event_type = 'fee_line_earned';
  if v_count <> 1 then
    raise exception 'INVARIANT 9 FAILED: % fee_line_earned events, expected 1', v_count;
  end if;
  select actor_id, visibility into v_actor, v_visibility
  from public.activity_events
  where organization_id = v_org and event_type = 'fee_line_earned';
  if v_actor is not null or v_visibility <> 'fees' then
    raise exception 'INVARIANT 9 FAILED: actor %, visibility %', v_actor, v_visibility;
  end if;

  ------------------------------------------------------------------------
  -- (8) + (10) The second run earns nothing, and runs as anon — the role
  -- the cron route actually holds. One call proves both.
  ------------------------------------------------------------------------
  execute 'set local role anon';
  select public.run_guarantee_maintenance() into v_earned;
  execute 'reset role';
  if v_earned <> 0 then
    raise exception 'INVARIANT 8 FAILED: second run earned %', v_earned;
  end if;

  raise notice 'ALL GUARANTEE-MAINTENANCE INVARIANTS PASSED';
end;
$checks$;

rollback;
