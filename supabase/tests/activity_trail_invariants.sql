-- Activity trail invariants (migration 053).
--
-- Rolled back. Run as a privileged role; the checks switch to `authenticated`.
-- Each expected-failure case asserts the SPECIFIC error — a catch-all passes on
-- a typo and reports a guarantee that was never tested.
--
-- The two claims worth the most scrutiny are that the trail cannot be forged
-- and that a fee event never reaches someone who cannot see the fee. Both are
-- exercised below as real statements by real roles, not read off the policy.
--
--    1. Recording a placement writes one 'org' event, with the actor stamped.
--    2. A status transition is recorded with from/to; a no-op update is not.
--    3. Saving a fee writes one 'fees' event...
--    4. ...and expanding it into three instalments writes no more.
--    5. Earning an instalment is recorded.
--    6. A reversal is recorded, with its reason.
--    7. Fee terms created / updated / deleted are recorded...
--    8. ...but an update that changes nothing commercial is not.
--    9. A role change is recorded at 'admin'; so is a suspension.
--   10. A viewer sees the 'org' events and NONE of the fee or member ones.
--   11. A researcher credited on a placement sees that placement's fee
--       events and no other placement's.
--   12. `authenticated` cannot INSERT — the trail cannot be forged.
--   13. `authenticated` cannot UPDATE or DELETE — it is append-only.
--   14. record_activity_event stamps the caller as actor; a caller cannot
--       attribute an event to somebody else.
--   15. record_activity_event refuses to write a money or member event.
--   16. Another org sees none of it.
--
-- On success: NOTICE 'ALL ACTIVITY-TRAIL INVARIANTS PASSED'.

begin;

insert into auth.users (id, email)
values
  ('aaaaaaaa-0000-0000-0000-0000000000a1', 'act-admin@test.local'),
  ('aaaaaaaa-0000-0000-0000-0000000000a2', 'act-recruiter@test.local'),
  ('aaaaaaaa-0000-0000-0000-0000000000a3', 'act-researcher@test.local'),
  ('aaaaaaaa-0000-0000-0000-0000000000a4', 'act-viewer@test.local'),
  ('aaaaaaaa-0000-0000-0000-0000000000a5', 'act-other-org@test.local');

insert into public.organizations (id, name, slug)
values
  ('bbbbbbbb-0000-0000-0000-0000000000a1', 'Act Org', 'act-org'),
  ('bbbbbbbb-0000-0000-0000-0000000000a2', 'Act Other Org', 'act-other-org');

insert into public.users (id, organization_id, email, full_name, status, role)
values
  ('aaaaaaaa-0000-0000-0000-0000000000a1', 'bbbbbbbb-0000-0000-0000-0000000000a1',
   'act-admin@test.local', 'Ada Admin', 'active', 'admin'),
  ('aaaaaaaa-0000-0000-0000-0000000000a2', 'bbbbbbbb-0000-0000-0000-0000000000a1',
   'act-recruiter@test.local', 'Rae Recruiter', 'active', 'recruiter'),
  ('aaaaaaaa-0000-0000-0000-0000000000a3', 'bbbbbbbb-0000-0000-0000-0000000000a1',
   'act-researcher@test.local', 'Ros Researcher', 'active', 'researcher'),
  ('aaaaaaaa-0000-0000-0000-0000000000a4', 'bbbbbbbb-0000-0000-0000-0000000000a1',
   'act-viewer@test.local', 'Vic Viewer', 'active', 'viewer'),
  ('aaaaaaaa-0000-0000-0000-0000000000a5', 'bbbbbbbb-0000-0000-0000-0000000000a2',
   'act-other-org@test.local', 'Otto Other', 'active', 'admin')
on conflict (id) do update
  set organization_id = excluded.organization_id,
      full_name = excluded.full_name,
      status = excluded.status,
      role = excluded.role;

insert into public.clients (id, organization_id, name)
values ('eeeeeeee-0000-0000-0000-0000000000a1', 'bbbbbbbb-0000-0000-0000-0000000000a1',
        'Act Test Bank');

insert into public.projects (id, organization_id, created_by, title, company_name,
                             one_line_input, client_id)
values
  ('cccccccc-0000-0000-0000-0000000000a1', 'bbbbbbbb-0000-0000-0000-0000000000a1',
   'aaaaaaaa-0000-0000-0000-0000000000a1', 'Head of Risk', 'Act Test Bank',
   'Head of Risk', 'eeeeeeee-0000-0000-0000-0000000000a1'),
  ('cccccccc-0000-0000-0000-0000000000a2', 'bbbbbbbb-0000-0000-0000-0000000000a1',
   'aaaaaaaa-0000-0000-0000-0000000000a1', 'Head of Data', 'Act Test Bank',
   'Head of Data', 'eeeeeeee-0000-0000-0000-0000000000a1');

insert into public.candidates (id, organization_id, project_id, full_name, cv_processing)
values
  ('dddddddd-0000-0000-0000-0000000000a1', 'bbbbbbbb-0000-0000-0000-0000000000a1',
   'cccccccc-0000-0000-0000-0000000000a1', 'Credited Candidate', false),
  ('dddddddd-0000-0000-0000-0000000000a2', 'bbbbbbbb-0000-0000-0000-0000000000a1',
   'cccccccc-0000-0000-0000-0000000000a2', 'Uncredited Candidate', false);

-- The seed above lands on rows the signup trigger has already created, so the
-- `on conflict do update` is a real role change and the member trigger
-- correctly records four of them. That is the trigger working — it fires on
-- any path, including a bulk seed nobody thought of as an audit event — but
-- it would make the counts below measure the fixture rather than the checks.
-- Cleared here so every assertion counts only what the checks themselves do.
delete from public.activity_events
 where organization_id in ('bbbbbbbb-0000-0000-0000-0000000000a1',
                           'bbbbbbbb-0000-0000-0000-0000000000a2');

do $checks$
declare
  v_org        uuid := 'bbbbbbbb-0000-0000-0000-0000000000a1';
  v_place_a    uuid := '99999999-0000-0000-0000-0000000000a1';
  v_place_b    uuid := '99999999-0000-0000-0000-0000000000a2';
  v_fee_a      uuid;
  v_fee_b      uuid;
  v_terms      uuid;
  v_count      int;
  v_actor      uuid;
  v_label      text;
  v_vis        text;
  v_detail     jsonb;
begin
  ------------------------------------------------------------------------
  -- Everything below is done as the recruiter, so the actor is a known,
  -- non-admin person and the 'admin' visibility test cannot pass by
  -- accident.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'aaaaaaaa-0000-0000-0000-0000000000a2',
                      'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  -- (1) placement recorded
  insert into public.placements
    (id, organization_id, project_id, candidate_id, client_id, status, offer_date,
     owner_user_id, sourced_by_user_id)
  values
    (v_place_a, v_org, 'cccccccc-0000-0000-0000-0000000000a1',
     'dddddddd-0000-0000-0000-0000000000a1', 'eeeeeeee-0000-0000-0000-0000000000a1',
     'offered', '2026-01-05',
     'aaaaaaaa-0000-0000-0000-0000000000a2',   -- owned by the recruiter
     'aaaaaaaa-0000-0000-0000-0000000000a3');  -- sourced by the researcher

  select count(*), max(actor_id::text)::uuid, max(actor_label), max(visibility)
    into v_count, v_actor, v_label, v_vis
    from public.activity_events
   where event_type = 'placement_recorded' and placement_id = v_place_a;

  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL (1): % placement_recorded events, expected 1', v_count;
  end if;
  if v_actor <> 'aaaaaaaa-0000-0000-0000-0000000000a2' then
    raise exception 'INVARIANT-FAIL (1): actor is % not the recruiter', v_actor;
  end if;
  if v_label <> 'Rae Recruiter' then
    raise exception 'INVARIANT-FAIL (1): actor_label is % not the snapshotted name', v_label;
  end if;
  if v_vis <> 'org' then
    raise exception 'INVARIANT-FAIL (1): placement event visibility is %, expected org', v_vis;
  end if;

  -- A second placement the researcher is NOT credited on, for (11).
  insert into public.placements
    (id, organization_id, project_id, candidate_id, client_id, status, offer_date,
     owner_user_id)
  values
    (v_place_b, v_org, 'cccccccc-0000-0000-0000-0000000000a2',
     'dddddddd-0000-0000-0000-0000000000a2', 'eeeeeeee-0000-0000-0000-0000000000a1',
     'offered', '2026-01-05', 'aaaaaaaa-0000-0000-0000-0000000000a2');

  -- (2) a status transition is recorded, a no-op update is not
  update public.placements
     set status = 'accepted', accepted_date = '2026-01-12'
   where id = v_place_a;

  select count(*) into v_count
    from public.activity_events
   where event_type = 'placement_status_changed' and placement_id = v_place_a;
  select detail into v_detail
    from public.activity_events
   where event_type = 'placement_status_changed' and placement_id = v_place_a
   limit 1;

  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL (2): % status_changed events, expected 1', v_count;
  end if;
  if v_detail->>'from' <> 'offered' or v_detail->>'to' <> 'accepted' then
    raise exception 'INVARIANT-FAIL (2): from/to recorded as % -> %',
      v_detail->>'from', v_detail->>'to';
  end if;

  update public.placements set notes = 'a note' where id = v_place_a;
  select count(*) into v_count
    from public.activity_events
   where event_type = 'placement_status_changed' and placement_id = v_place_a;
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL (2): a non-status update wrote an event';
  end if;

  ------------------------------------------------------------------------
  -- (3)(4) the fee, and the silence around its expansion
  ------------------------------------------------------------------------
  insert into public.placement_fees
    (organization_id, placement_id, fee_model, fee_percentage, fee_basis, currency,
     base_salary, fee_basis_amount, total_fee_amount, base_currency)
  values (v_org, v_place_a, 'retained', 30, 'base_salary', 'USD',
          300000, 300000, 90000, 'USD')
  returning id into v_fee_a;

  select count(*), max(visibility) into v_count, v_vis
    from public.activity_events
   where event_type = 'fee_recorded' and placement_id = v_place_a;
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL (3): % fee_recorded events, expected 1', v_count;
  end if;
  if v_vis <> 'fees' then
    raise exception 'INVARIANT-FAIL (3): fee event visibility is %, expected fees', v_vis;
  end if;

  insert into public.placement_fee_lines
    (organization_id, placement_id, placement_fee_id, label, sequence, trigger,
     amount, currency, base_currency, status)
  values
    (v_org, v_place_a, v_fee_a, 'Engagement', 1, 'engagement', 30000, 'USD', 'USD', 'pending'),
    (v_org, v_place_a, v_fee_a, 'Shortlist', 2, 'shortlist', 30000, 'USD', 'USD', 'pending'),
    (v_org, v_place_a, v_fee_a, 'Completion', 3, 'start_date', 30000, 'USD', 'USD', 'pending');

  select count(*) into v_count
    from public.activity_events where placement_id = v_place_a and visibility = 'fees';
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL (4): expanding 3 instalments wrote % fee events, expected 1', v_count;
  end if;

  -- (5) earning one is recorded
  update public.placement_fee_lines
     set status = 'earned', earned_on = '2026-02-01'
   where placement_fee_id = v_fee_a and label = 'Engagement';

  select count(*) into v_count
    from public.activity_events
   where event_type = 'fee_line_earned' and placement_id = v_place_a;
  select detail into v_detail
    from public.activity_events
   where event_type = 'fee_line_earned' and placement_id = v_place_a
   limit 1;
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL (5): % fee_line_earned events, expected 1', v_count;
  end if;
  if v_detail->>'label' <> 'Engagement' then
    raise exception 'INVARIANT-FAIL (5): earned event names %', v_detail->>'label';
  end if;

  -- (6) a reversal is recorded with its reason
  insert into public.placement_fee_lines
    (organization_id, placement_id, placement_fee_id, kind, label, amount,
     currency, base_currency, status, earned_on, reason)
  values (v_org, v_place_a, v_fee_a, 'reversal', 'Reversal - Engagement', -30000,
          'USD', 'USD', 'earned', '2026-05-20', 'Left inside guarantee');

  select count(*) into v_count
    from public.activity_events
   where event_type = 'fee_reversed' and placement_id = v_place_a;
  select detail into v_detail
    from public.activity_events
   where event_type = 'fee_reversed' and placement_id = v_place_a
   limit 1;
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL (6): % fee_reversed events, expected 1', v_count;
  end if;
  if v_detail->>'reason' <> 'Left inside guarantee' then
    raise exception 'INVARIANT-FAIL (6): reversal reason recorded as %', v_detail->>'reason';
  end if;

  -- A fee on the OTHER placement, for (11).
  insert into public.placement_fees
    (organization_id, placement_id, fee_model, fee_percentage, fee_basis, currency,
     base_salary, fee_basis_amount, total_fee_amount, base_currency)
  values (v_org, v_place_b, 'contingent', 25, 'base_salary', 'USD',
          240000, 240000, 60000, 'USD')
  returning id into v_fee_b;

  ------------------------------------------------------------------------
  -- (7)(8) fee terms
  ------------------------------------------------------------------------
  insert into public.fee_terms
    (organization_id, client_id, fee_model, fee_percentage, currency)
  values (v_org, 'eeeeeeee-0000-0000-0000-0000000000a1', 'contingent', 25, 'USD')
  returning id into v_terms;

  select count(*) into v_count
    from public.activity_events where event_type = 'fee_terms_created';
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL (7): % fee_terms_created events, expected 1', v_count;
  end if;

  update public.fee_terms set fee_percentage = 27.5 where id = v_terms;
  select count(*) into v_count
    from public.activity_events where event_type = 'fee_terms_updated';
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL (7): % fee_terms_updated events, expected 1', v_count;
  end if;

  -- (8) a change to something non-commercial writes nothing
  update public.fee_terms set notes = 'internal note' where id = v_terms;
  select count(*) into v_count
    from public.activity_events where event_type = 'fee_terms_updated';
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL (8): a notes-only edit wrote a commercial event';
  end if;

  delete from public.fee_terms where id = v_terms;
  select count(*) into v_count
    from public.activity_events where event_type = 'fee_terms_deleted';
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL (7): % fee_terms_deleted events, expected 1', v_count;
  end if;

  ------------------------------------------------------------------------
  -- (12)(13) the trail cannot be forged or rewritten
  ------------------------------------------------------------------------
  begin
    insert into public.activity_events
      (organization_id, event_type, visibility, detail)
    values (v_org, 'placement_recorded', 'org', '{"forged":true}'::jsonb);
    raise exception 'INVARIANT-FAIL (12): authenticated inserted an activity event';
  exception when others then
    if sqlerrm like 'INVARIANT-FAIL%' then raise; end if;
    if sqlerrm not like '%row-level security%' then
      raise exception 'INVARIANT-FAIL (12): blocked by the wrong error: %', sqlerrm;
    end if;
  end;

  update public.activity_events set detail = '{"tampered":true}'::jsonb
   where event_type = 'fee_recorded';
  if found then
    raise exception 'INVARIANT-FAIL (13): authenticated rewrote an activity event';
  end if;

  delete from public.activity_events where event_type = 'fee_recorded';
  if found then
    raise exception 'INVARIANT-FAIL (13): authenticated deleted an activity event';
  end if;

  ------------------------------------------------------------------------
  -- (14)(15) the app-level RPC
  ------------------------------------------------------------------------
  perform public.record_activity_event(
    'shortlist_published', 'cccccccc-0000-0000-0000-0000000000a1', null, null,
    '{"count":3}'::jsonb);

  select actor_id, actor_label into v_actor, v_label
    from public.activity_events where event_type = 'shortlist_published' limit 1;
  if v_actor <> 'aaaaaaaa-0000-0000-0000-0000000000a2' then
    raise exception 'INVARIANT-FAIL (14): RPC stamped actor % not the caller', v_actor;
  end if;
  if v_label <> 'Rae Recruiter' then
    raise exception 'INVARIANT-FAIL (14): RPC label is %', v_label;
  end if;

  begin
    perform public.record_activity_event('fee_recorded', null, null, null, '{}'::jsonb);
    raise exception 'INVARIANT-FAIL (15): the RPC wrote a money event';
  exception when others then
    if sqlerrm like 'INVARIANT-FAIL%' then raise; end if;
    if sqlerrm not like '%not an app-recordable event%' then
      raise exception 'INVARIANT-FAIL (15): blocked by the wrong error: %', sqlerrm;
    end if;
  end;

  ------------------------------------------------------------------------
  -- (9) the role model, as the admin
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'aaaaaaaa-0000-0000-0000-0000000000a1',
                      'role', 'authenticated')::text, true);

  update public.users set role = 'recruiter'
   where id = 'aaaaaaaa-0000-0000-0000-0000000000a4';

  select count(*), max(visibility) into v_count, v_vis
    from public.activity_events where event_type = 'member_role_changed';
  select detail into v_detail
    from public.activity_events where event_type = 'member_role_changed' limit 1;
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL (9): % member_role_changed events, expected 1', v_count;
  end if;
  if v_detail->>'from' <> 'viewer' or v_detail->>'to' <> 'recruiter' then
    raise exception 'INVARIANT-FAIL (9): role change recorded as % -> %',
      v_detail->>'from', v_detail->>'to';
  end if;
  if v_vis <> 'admin' then
    raise exception 'INVARIANT-FAIL (9): member event visibility is %, expected admin', v_vis;
  end if;

  -- Put the viewer back, and check the suspension path too.
  update public.users set role = 'viewer', status = 'suspended'
   where id = 'aaaaaaaa-0000-0000-0000-0000000000a4';
  select count(*) into v_count
    from public.activity_events where event_type = 'member_status_changed';
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL (9): % member_status_changed events, expected 1', v_count;
  end if;
  update public.users set status = 'active'
   where id = 'aaaaaaaa-0000-0000-0000-0000000000a4';

  ------------------------------------------------------------------------
  -- (10) the viewer: 'org' events only
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'aaaaaaaa-0000-0000-0000-0000000000a4',
                      'role', 'authenticated')::text, true);

  select count(*) into v_count
    from public.activity_events where visibility = 'fees';
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (10): a viewer read % fee events', v_count;
  end if;

  select count(*) into v_count
    from public.activity_events where visibility = 'admin';
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (10): a viewer read % member events', v_count;
  end if;

  -- ...but they do see that the placements happened.
  select count(*) into v_count
    from public.activity_events where event_type = 'placement_recorded';
  if v_count <> 2 then
    raise exception 'INVARIANT-FAIL (10): a viewer sees % placement events, expected 2', v_count;
  end if;

  -- And the detail of an org event must not carry money.
  select detail into v_detail
    from public.activity_events
   where event_type = 'placement_recorded' and placement_id = v_place_a limit 1;
  if v_detail ? 'total' or v_detail ? 'amount' or v_detail ? 'base_salary' then
    raise exception 'INVARIANT-FAIL (10): an org-visible event carries money: %', v_detail;
  end if;

  ------------------------------------------------------------------------
  -- (11) the researcher: fee history for their own placement only
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'aaaaaaaa-0000-0000-0000-0000000000a3',
                      'role', 'authenticated')::text, true);

  select count(*) into v_count
    from public.activity_events where visibility = 'fees' and placement_id = v_place_a;
  if v_count < 3 then
    raise exception 'INVARIANT-FAIL (11): credited researcher sees % fee events on their placement, expected >= 3', v_count;
  end if;

  select count(*) into v_count
    from public.activity_events where visibility = 'fees' and placement_id = v_place_b;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (11): researcher read % fee events on a placement they are not credited on', v_count;
  end if;

  -- The client-scoped fee_terms events have no placement, so the
  -- own-placement exception must not reach them.
  select count(*) into v_count
    from public.activity_events where event_type like 'fee_terms%';
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (11): researcher read % fee_terms events', v_count;
  end if;

  select count(*) into v_count
    from public.activity_events where visibility = 'admin';
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (11): researcher read % member events', v_count;
  end if;

  ------------------------------------------------------------------------
  -- (16) another org sees nothing
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'aaaaaaaa-0000-0000-0000-0000000000a5',
                      'role', 'authenticated')::text, true);

  select count(*) into v_count from public.activity_events;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (16): another org read % activity events', v_count;
  end if;

  raise notice 'ALL ACTIVITY-TRAIL INVARIANTS PASSED';
end
$checks$;

rollback;
