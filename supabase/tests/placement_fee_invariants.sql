-- Placement and fee invariants (migration 050).
--
-- Rolled back. Run as a privileged role; the checks switch to `authenticated`.
-- Each expected-failure case asserts the SPECIFIC error — a catch-all passes on
-- a typo and reports a guarantee that was never tested.
--
-- The read rule is the point of this file. `fees:read` is the first capability
-- in the product that restricts a *read*, and it has a per-row exception, so
-- "the policy looks right" is not evidence. Every case below is a real insert,
-- update or select by a real role.
--
--    1. A viewer sees the placement and NOT the fee.
--    2. A researcher sees the placement and NOT another team's fee.
--    3. A researcher DOES see the fee on a placement they sourced.
--    4. ...and still not the one beside it they did not.
--    5. A recruiter sees the whole book.
--    6. Fee terms have no own-placement exception — a credited researcher
--       still cannot read the client agreement.
--    7. A researcher cannot WRITE a fee on a placement they are credited on.
--    8. A viewer cannot record a placement.
--    9. Cross-org: an admin of another org sees none of it.
--   10. A suspended admin sees nothing (status gate from 046 still applies).
--   11. The instalment plan CHECK agrees with `parseInstalmentPlan` in
--       src/lib/fees/types.ts — same six cases.
--   12. A retainer must have stages; a contingent agreement must not.
--   13. One agreement per client and per mandate.
--   14. A fee_terms row must be scoped to exactly one of client/project.
--   15. Status implies its date — 'started' with no start_date is refused.
--   16. Reversals must be negative and instalments positive.
--   17. An earned line must carry the date that puts it in a quarter.
--   18. The generated base amount converts at the stored rate.
--   19. Recording a placement moves the candidate's pipeline_stage...
--   20. ...but never resurrects a rejected candidate, and never demotes hired.
--   21. The acceptance query: what did we bill this quarter, with a clawback
--       landing in the quarter it happened rather than the one it was booked.
--
-- On success: NOTICE 'ALL PLACEMENT-FEE INVARIANTS PASSED'.

begin;

insert into auth.users (id, email)
values
  ('aaaaaaaa-0000-0000-0000-0000000000f1', 'fee-admin@test.local'),
  ('aaaaaaaa-0000-0000-0000-0000000000f2', 'fee-recruiter@test.local'),
  ('aaaaaaaa-0000-0000-0000-0000000000f3', 'fee-researcher@test.local'),
  ('aaaaaaaa-0000-0000-0000-0000000000f4', 'fee-viewer@test.local'),
  ('aaaaaaaa-0000-0000-0000-0000000000f5', 'fee-other-org@test.local'),
  ('aaaaaaaa-0000-0000-0000-0000000000f6', 'fee-suspended@test.local');

insert into public.organizations (id, name, slug)
values
  ('bbbbbbbb-0000-0000-0000-0000000000f1', 'Fee Org', 'fee-org'),
  ('bbbbbbbb-0000-0000-0000-0000000000f2', 'Fee Other Org', 'fee-other-org');

insert into public.users (id, organization_id, email, status, role)
values
  ('aaaaaaaa-0000-0000-0000-0000000000f1', 'bbbbbbbb-0000-0000-0000-0000000000f1',
   'fee-admin@test.local', 'active', 'admin'),
  ('aaaaaaaa-0000-0000-0000-0000000000f2', 'bbbbbbbb-0000-0000-0000-0000000000f1',
   'fee-recruiter@test.local', 'active', 'recruiter'),
  ('aaaaaaaa-0000-0000-0000-0000000000f3', 'bbbbbbbb-0000-0000-0000-0000000000f1',
   'fee-researcher@test.local', 'active', 'researcher'),
  ('aaaaaaaa-0000-0000-0000-0000000000f4', 'bbbbbbbb-0000-0000-0000-0000000000f1',
   'fee-viewer@test.local', 'active', 'viewer'),
  ('aaaaaaaa-0000-0000-0000-0000000000f5', 'bbbbbbbb-0000-0000-0000-0000000000f2',
   'fee-other-org@test.local', 'active', 'admin'),
  ('aaaaaaaa-0000-0000-0000-0000000000f6', 'bbbbbbbb-0000-0000-0000-0000000000f1',
   'fee-suspended@test.local', 'suspended', 'admin')
on conflict (id) do update
  set organization_id = excluded.organization_id,
      status = excluded.status,
      role = excluded.role;

insert into public.clients (id, organization_id, name)
values ('eeeeeeee-0000-0000-0000-0000000000f1', 'bbbbbbbb-0000-0000-0000-0000000000f1',
        'Fee Test Bank');

insert into public.projects (id, organization_id, created_by, title, company_name,
                             one_line_input, client_id)
values
  ('cccccccc-0000-0000-0000-0000000000f1', 'bbbbbbbb-0000-0000-0000-0000000000f1',
   'aaaaaaaa-0000-0000-0000-0000000000f1', 'Head of Risk', 'Fee Test Bank',
   'Head of Risk, London', 'eeeeeeee-0000-0000-0000-0000000000f1'),
  ('cccccccc-0000-0000-0000-0000000000f2', 'bbbbbbbb-0000-0000-0000-0000000000f1',
   'aaaaaaaa-0000-0000-0000-0000000000f1', 'Head of Data', 'Fee Test Bank',
   'Head of Data, London', 'eeeeeeee-0000-0000-0000-0000000000f1');

insert into public.candidates (id, organization_id, project_id, full_name, cv_processing,
                               pipeline_stage)
values
  -- Sourced by the researcher: the own-placement exception hangs off this one.
  ('dddddddd-0000-0000-0000-0000000000f1', 'bbbbbbbb-0000-0000-0000-0000000000f1',
   'cccccccc-0000-0000-0000-0000000000f1', 'Credited Candidate', false, 'finalist'),
  -- Nothing to do with the researcher.
  ('dddddddd-0000-0000-0000-0000000000f2', 'bbbbbbbb-0000-0000-0000-0000000000f1',
   'cccccccc-0000-0000-0000-0000000000f2', 'Uncredited Candidate', false, 'finalist'),
  -- Already rejected on this mandate; (20) must not resurrect them.
  ('dddddddd-0000-0000-0000-0000000000f3', 'bbbbbbbb-0000-0000-0000-0000000000f1',
   'cccccccc-0000-0000-0000-0000000000f1', 'Rejected Candidate', false, 'rejected');

do $checks$
declare
  v_place_credited   uuid := '99999999-0000-0000-0000-0000000000f1';
  v_place_other      uuid := '99999999-0000-0000-0000-0000000000f2';
  v_place_rejected   uuid := '99999999-0000-0000-0000-0000000000f3';
  v_fee_credited     uuid;
  v_fee_other        uuid;
  v_line             uuid;
  v_count            int;
  v_stage            text;
  v_amount           numeric;
  v_base             numeric;
begin
  ------------------------------------------------------------------------
  -- Set-up, as the admin.
  ------------------------------------------------------------------------
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', 'aaaaaaaa-0000-0000-0000-0000000000f1',
                      'role', 'authenticated')::text,
    true);
  execute 'set local role authenticated';

  -- A retained client agreement, in a currency that is not the base, so the
  -- conversion is exercised rather than multiplied by 1.
  insert into public.fee_terms
    (organization_id, client_id, fee_model, fee_percentage, currency, fee_basis,
     guarantee_days, payment_terms_days, instalment_plan)
  values
    ('bbbbbbbb-0000-0000-0000-0000000000f1', 'eeeeeeee-0000-0000-0000-0000000000f1',
     'retained', 30, 'GBP', 'total_first_year_cash', 90, 30,
     '[{"label":"Engagement","trigger":"engagement","percent_of_fee":"33.333"},
       {"label":"Shortlist","trigger":"shortlist","percent_of_fee":"33.333"},
       {"label":"Completion","trigger":"start_date","percent_of_fee":"33.334"}]'::jsonb);

  insert into public.placements
    (id, organization_id, project_id, candidate_id, client_id, status, offer_date,
     accepted_date, start_date, guarantee_days, owner_user_id, sourced_by_user_id)
  values
    (v_place_credited, 'bbbbbbbb-0000-0000-0000-0000000000f1',
     'cccccccc-0000-0000-0000-0000000000f1', 'dddddddd-0000-0000-0000-0000000000f1',
     'eeeeeeee-0000-0000-0000-0000000000f1', 'started', '2026-01-05', '2026-01-12',
     '2026-02-01', 90,
     'aaaaaaaa-0000-0000-0000-0000000000f2',   -- owned by the recruiter
     'aaaaaaaa-0000-0000-0000-0000000000f3'),  -- sourced by the researcher
    (v_place_other, 'bbbbbbbb-0000-0000-0000-0000000000f1',
     'cccccccc-0000-0000-0000-0000000000f2', 'dddddddd-0000-0000-0000-0000000000f2',
     'eeeeeeee-0000-0000-0000-0000000000f1', 'started', '2026-01-05', '2026-01-12',
     '2026-02-01', 90,
     'aaaaaaaa-0000-0000-0000-0000000000f2', null);

  insert into public.placement_fees
    (organization_id, placement_id, fee_model, fee_percentage, fee_basis, currency,
     base_salary, guaranteed_bonus, fee_basis_amount, total_fee_amount,
     base_currency, fx_rate, fx_rate_fixed_on)
  values
    ('bbbbbbbb-0000-0000-0000-0000000000f1', v_place_credited, 'retained', 30,
     'total_first_year_cash', 'GBP', 200000, 50000, 250000, 75000, 'USD', 1.25,
     '2026-01-12')
  returning id into v_fee_credited;

  insert into public.placement_fees
    (organization_id, placement_id, fee_model, fee_percentage, fee_basis, currency,
     base_salary, fee_basis_amount, total_fee_amount, base_currency)
  values
    ('bbbbbbbb-0000-0000-0000-0000000000f1', v_place_other, 'contingent', 25,
     'base_salary', 'USD', 240000, 240000, 60000, 'USD')
  returning id into v_fee_other;

  -- (18) the generated column converts at the stored rate.
  select total_fee_base_amount into v_base
    from public.placement_fees where id = v_fee_credited;
  if v_base <> 93750.00 then
    raise exception 'INVARIANT-FAIL (18): 75000 GBP at 1.25 gave % not 93750', v_base;
  end if;

  insert into public.placement_fee_lines
    (organization_id, placement_id, placement_fee_id, kind, label, sequence, trigger,
     amount, currency, base_currency, fx_rate, status, earned_on, due_on)
  values
    ('bbbbbbbb-0000-0000-0000-0000000000f1', v_place_credited, v_fee_credited,
     'instalment', 'Engagement', 1, 'engagement', 25000, 'GBP', 'USD', 1.25,
     'earned', '2026-01-15', '2026-02-14'),
    ('bbbbbbbb-0000-0000-0000-0000000000f1', v_place_credited, v_fee_credited,
     'instalment', 'Shortlist', 2, 'shortlist', 25000, 'GBP', 'USD', 1.25,
     'earned', '2026-02-20', '2026-03-22'),
    ('bbbbbbbb-0000-0000-0000-0000000000f1', v_place_credited, v_fee_credited,
     'instalment', 'Completion', 3, 'start_date', 25000, 'GBP', 'USD', 1.25,
     'pending', null, null);

  insert into public.placement_fee_lines
    (organization_id, placement_id, placement_fee_id, kind, label, sequence, trigger,
     amount, currency, base_currency, status, earned_on, due_on)
  values
    ('bbbbbbbb-0000-0000-0000-0000000000f1', v_place_other, v_fee_other,
     'instalment', 'Placement fee', 1, 'start_date', 60000, 'USD', 'USD',
     'earned', '2026-02-01', '2026-03-03')
  returning id into v_line;

  ------------------------------------------------------------------------
  -- (19) recording a placement moved the candidate's stage to 'hired'.
  ------------------------------------------------------------------------
  select pipeline_stage into v_stage
    from public.candidates where id = 'dddddddd-0000-0000-0000-0000000000f1';
  if v_stage <> 'hired' then
    raise exception 'INVARIANT-FAIL (19): stage is % not hired', v_stage;
  end if;

  ------------------------------------------------------------------------
  -- (20) a rejected candidate is not resurrected, and hired is not demoted.
  ------------------------------------------------------------------------
  insert into public.placements
    (id, organization_id, project_id, candidate_id, status, offer_date, owner_user_id)
  values
    (v_place_rejected, 'bbbbbbbb-0000-0000-0000-0000000000f1',
     'cccccccc-0000-0000-0000-0000000000f1', 'dddddddd-0000-0000-0000-0000000000f3',
     'offered', '2026-03-01', 'aaaaaaaa-0000-0000-0000-0000000000f2');

  select pipeline_stage into v_stage
    from public.candidates where id = 'dddddddd-0000-0000-0000-0000000000f3';
  if v_stage <> 'rejected' then
    raise exception 'INVARIANT-FAIL (20): a rejected candidate was resurrected to %', v_stage;
  end if;

  -- Moving the started placement back to 'accepted' must not demote hired.
  update public.placements set status = 'accepted' where id = v_place_credited;
  select pipeline_stage into v_stage
    from public.candidates where id = 'dddddddd-0000-0000-0000-0000000000f1';
  if v_stage <> 'hired' then
    raise exception 'INVARIANT-FAIL (20): hired was demoted to %', v_stage;
  end if;
  update public.placements set status = 'started' where id = v_place_credited;

  ------------------------------------------------------------------------
  -- (15) status implies its date.
  ------------------------------------------------------------------------
  begin
    insert into public.placements
      (organization_id, project_id, candidate_id, status, offer_date, accepted_date)
    values
      ('bbbbbbbb-0000-0000-0000-0000000000f1', 'cccccccc-0000-0000-0000-0000000000f2',
       'dddddddd-0000-0000-0000-0000000000f3', 'started', '2026-01-01', '2026-01-02');
    raise exception 'INVARIANT-FAIL (15): started with no start_date was accepted';
  exception when others then
    if sqlerrm like 'INVARIANT-FAIL%' then raise; end if;
    if sqlerrm not like '%placements_status_has_date%' then
      raise exception 'INVARIANT-FAIL (15): blocked by the wrong error: %', sqlerrm;
    end if;
  end;

  ------------------------------------------------------------------------
  -- (16) sign matches kind.
  ------------------------------------------------------------------------
  begin
    insert into public.placement_fee_lines
      (organization_id, placement_id, placement_fee_id, kind, label, amount,
       currency, base_currency, reason)
    values
      ('bbbbbbbb-0000-0000-0000-0000000000f1', v_place_other, v_fee_other,
       'reversal', 'Positive clawback', 5000, 'USD', 'USD', 'nonsense');
    raise exception 'INVARIANT-FAIL (16): a positive reversal was accepted';
  exception when others then
    if sqlerrm like 'INVARIANT-FAIL%' then raise; end if;
    if sqlerrm not like '%fee_lines_sign_matches_kind%' then
      raise exception 'INVARIANT-FAIL (16): blocked by the wrong error: %', sqlerrm;
    end if;
  end;

  ------------------------------------------------------------------------
  -- (17) an earned line carries the date that puts it in a quarter.
  ------------------------------------------------------------------------
  begin
    insert into public.placement_fee_lines
      (organization_id, placement_id, placement_fee_id, label, amount,
       currency, base_currency, status, earned_on)
    values
      ('bbbbbbbb-0000-0000-0000-0000000000f1', v_place_other, v_fee_other,
       'Dateless', 1000, 'USD', 'USD', 'earned', null);
    raise exception 'INVARIANT-FAIL (17): an earned line with no date was accepted';
  exception when others then
    if sqlerrm like 'INVARIANT-FAIL%' then raise; end if;
    if sqlerrm not like '%fee_lines_earned_has_date%' then
      raise exception 'INVARIANT-FAIL (17): blocked by the wrong error: %', sqlerrm;
    end if;
  end;

  ------------------------------------------------------------------------
  -- (11) the plan CHECK agrees with parseInstalmentPlan. Same six cases as
  --      src/lib/fees/compute.test.ts.
  ------------------------------------------------------------------------
  if not public.fee_instalment_plan_is_valid('[]'::jsonb) then
    raise exception 'INVARIANT-FAIL (11): an empty plan was rejected';
  end if;
  if public.fee_instalment_plan_is_valid(
       '[{"label":"Half","trigger":"engagement","percent_of_fee":"50"}]'::jsonb) then
    raise exception 'INVARIANT-FAIL (11): a plan summing to 50 was accepted';
  end if;
  if public.fee_instalment_plan_is_valid(
       '[{"label":"","trigger":"engagement","percent_of_fee":"100"}]'::jsonb) then
    raise exception 'INVARIANT-FAIL (11): a blank label was accepted';
  end if;
  if public.fee_instalment_plan_is_valid(
       '[{"label":"X","trigger":"nope","percent_of_fee":"100"}]'::jsonb) then
    raise exception 'INVARIANT-FAIL (11): an unknown trigger was accepted';
  end if;
  if public.fee_instalment_plan_is_valid('{"not":"an array"}'::jsonb) then
    raise exception 'INVARIANT-FAIL (11): an object was accepted as a plan';
  end if;
  if public.fee_instalment_plan_is_valid(null) then
    raise exception 'INVARIANT-FAIL (11): null was accepted as a plan';
  end if;

  ------------------------------------------------------------------------
  -- (12) a retainer must have stages; a contingent agreement must not.
  ------------------------------------------------------------------------
  begin
    insert into public.fee_terms
      (organization_id, project_id, fee_model, fee_percentage, currency)
    values
      ('bbbbbbbb-0000-0000-0000-0000000000f1', 'cccccccc-0000-0000-0000-0000000000f2',
       'retained', 30, 'USD');
    raise exception 'INVARIANT-FAIL (12): a retainer with no stages was accepted';
  exception when others then
    if sqlerrm like 'INVARIANT-FAIL%' then raise; end if;
    if sqlerrm not like '%fee_terms_retained_has_stages%' then
      raise exception 'INVARIANT-FAIL (12): blocked by the wrong error: %', sqlerrm;
    end if;
  end;

  begin
    insert into public.fee_terms
      (organization_id, project_id, fee_model, fee_percentage, currency, instalment_plan)
    values
      ('bbbbbbbb-0000-0000-0000-0000000000f1', 'cccccccc-0000-0000-0000-0000000000f2',
       'contingent', 25, 'USD',
       '[{"label":"All","trigger":"start_date","percent_of_fee":"100"}]'::jsonb);
    raise exception 'INVARIANT-FAIL (12): a contingent fee with stages was accepted';
  exception when others then
    if sqlerrm like 'INVARIANT-FAIL%' then raise; end if;
    if sqlerrm not like '%fee_terms_retained_has_stages%' then
      raise exception 'INVARIANT-FAIL (12): blocked by the wrong error: %', sqlerrm;
    end if;
  end;

  ------------------------------------------------------------------------
  -- (14) exactly one scope, and (13) one agreement per scope.
  ------------------------------------------------------------------------
  begin
    insert into public.fee_terms
      (organization_id, client_id, project_id, fee_model, fee_percentage, currency)
    values
      ('bbbbbbbb-0000-0000-0000-0000000000f1', 'eeeeeeee-0000-0000-0000-0000000000f1',
       'cccccccc-0000-0000-0000-0000000000f2', 'contingent', 25, 'USD');
    raise exception 'INVARIANT-FAIL (14): terms scoped to both a client and a mandate';
  exception when others then
    if sqlerrm like 'INVARIANT-FAIL%' then raise; end if;
    if sqlerrm not like '%fee_terms_one_scope%' then
      raise exception 'INVARIANT-FAIL (14): blocked by the wrong error: %', sqlerrm;
    end if;
  end;

  begin
    insert into public.fee_terms
      (organization_id, client_id, fee_model, fee_percentage, currency)
    values
      ('bbbbbbbb-0000-0000-0000-0000000000f1', 'eeeeeeee-0000-0000-0000-0000000000f1',
       'contingent', 25, 'USD');
    raise exception 'INVARIANT-FAIL (13): a second agreement for one client';
  exception when others then
    if sqlerrm like 'INVARIANT-FAIL%' then raise; end if;
    if sqlerrm not like '%fee_terms_one_per_client%' then
      raise exception 'INVARIANT-FAIL (13): blocked by the wrong error: %', sqlerrm;
    end if;
  end;

  ------------------------------------------------------------------------
  -- (21) the acceptance query, as the admin who can see everything.
  --      Q1 2026 = the two GBP instalments at 1.25 (31250 + 31250) plus the
  --      USD placement fee (60000) = 122500.
  ------------------------------------------------------------------------
  select coalesce(sum(base_amount), 0) into v_amount
    from public.placement_fee_lines
   where status = 'earned' and earned_on >= '2026-01-01' and earned_on < '2026-04-01';
  if v_amount <> 122500.00 then
    raise exception 'INVARIANT-FAIL (21): Q1 billed % not 122500', v_amount;
  end if;

  -- The clawback: booked against a Q1 fee, earned in Q2.
  insert into public.placement_fee_lines
    (organization_id, placement_id, placement_fee_id, kind, label, amount,
     currency, base_currency, status, earned_on, reason, reverses_line_id)
  values
    ('bbbbbbbb-0000-0000-0000-0000000000f1', v_place_other, v_fee_other,
     'reversal', 'Clawback — left inside guarantee', -60000, 'USD', 'USD',
     'earned', '2026-05-20', 'Left inside the guarantee period', v_line);

  select coalesce(sum(base_amount), 0) into v_amount
    from public.placement_fee_lines
   where status = 'earned' and earned_on >= '2026-01-01' and earned_on < '2026-04-01';
  if v_amount <> 122500.00 then
    raise exception 'INVARIANT-FAIL (21): a Q2 clawback restated Q1 to %', v_amount;
  end if;

  select coalesce(sum(base_amount), 0) into v_amount
    from public.placement_fee_lines
   where status = 'earned' and earned_on >= '2026-04-01' and earned_on < '2026-07-01';
  if v_amount <> -60000.00 then
    raise exception 'INVARIANT-FAIL (21): Q2 shows % not -60000', v_amount;
  end if;

  ------------------------------------------------------------------------
  -- (1) The viewer: sees the placements, sees no money.
  ------------------------------------------------------------------------
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', 'aaaaaaaa-0000-0000-0000-0000000000f4',
                      'role', 'authenticated')::text,
    true);

  select count(*) into v_count from public.placements;
  if v_count <> 3 then
    raise exception 'INVARIANT-FAIL (1): viewer sees % placements, expected 3', v_count;
  end if;

  select count(*) into v_count from public.placement_fees;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (1): viewer sees % placement fees, expected 0', v_count;
  end if;

  select count(*) into v_count from public.placement_fee_lines;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (1): viewer sees % fee lines, expected 0', v_count;
  end if;

  select count(*) into v_count from public.fee_terms;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (1): viewer sees % fee terms, expected 0', v_count;
  end if;

  -- (8) and cannot record a placement.
  begin
    insert into public.placements
      (organization_id, project_id, candidate_id, status, offer_date)
    values
      ('bbbbbbbb-0000-0000-0000-0000000000f1', 'cccccccc-0000-0000-0000-0000000000f2',
       'dddddddd-0000-0000-0000-0000000000f3', 'offered', '2026-04-01');
    raise exception 'INVARIANT-FAIL (8): a viewer recorded a placement';
  exception when others then
    if sqlerrm like 'INVARIANT-FAIL%' then raise; end if;
    if sqlerrm not like '%row-level security%' then
      raise exception 'INVARIANT-FAIL (8): blocked by the wrong error: %', sqlerrm;
    end if;
  end;

  ------------------------------------------------------------------------
  -- (2)(3)(4) The researcher: the own-placement exception, and its edge.
  ------------------------------------------------------------------------
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', 'aaaaaaaa-0000-0000-0000-0000000000f3',
                      'role', 'authenticated')::text,
    true);

  select count(*) into v_count from public.placements;
  if v_count <> 3 then
    raise exception 'INVARIANT-FAIL (2): researcher sees % placements, expected 3', v_count;
  end if;

  -- (3) exactly the one they sourced, and (4) not the one they did not.
  select count(*) into v_count from public.placement_fees;
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL (3): researcher sees % fees, expected 1', v_count;
  end if;

  select count(*) into v_count
    from public.placement_fees where placement_id = v_place_credited;
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL (3): researcher cannot see the fee they sourced';
  end if;

  select count(*) into v_count
    from public.placement_fees where placement_id = v_place_other;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (4): researcher sees a fee they are not credited on';
  end if;

  -- The ledger follows the same rule: three lines on their placement, none
  -- of the other placement's two.
  select count(*) into v_count from public.placement_fee_lines;
  if v_count <> 3 then
    raise exception 'INVARIANT-FAIL (3): researcher sees % fee lines, expected 3', v_count;
  end if;

  -- (6) fee_terms has no own-placement exception.
  select count(*) into v_count from public.fee_terms;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (6): a credited researcher read the client agreement';
  end if;

  -- (7) credit is read-only. They may not write the fee they can see.
  begin
    update public.placement_fees
       set total_fee_amount = 1
     where placement_id = v_place_credited;
    if found then
      raise exception 'INVARIANT-FAIL (7): a researcher updated a fee they are credited on';
    end if;
  exception when others then
    if sqlerrm like 'INVARIANT-FAIL%' then raise; end if;
    if sqlerrm not like '%row-level security%' then
      raise exception 'INVARIANT-FAIL (7): blocked by the wrong error: %', sqlerrm;
    end if;
  end;

  begin
    insert into public.placement_fee_lines
      (organization_id, placement_id, placement_fee_id, label, amount,
       currency, base_currency)
    values
      ('bbbbbbbb-0000-0000-0000-0000000000f1', v_place_credited, v_fee_credited,
       'Sneaky line', 1000, 'GBP', 'USD');
    raise exception 'INVARIANT-FAIL (7): a researcher wrote a fee line';
  exception when others then
    if sqlerrm like 'INVARIANT-FAIL%' then raise; end if;
    if sqlerrm not like '%row-level security%' then
      raise exception 'INVARIANT-FAIL (7): blocked by the wrong error: %', sqlerrm;
    end if;
  end;

  ------------------------------------------------------------------------
  -- (5) The recruiter sees the whole book.
  ------------------------------------------------------------------------
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', 'aaaaaaaa-0000-0000-0000-0000000000f2',
                      'role', 'authenticated')::text,
    true);

  select count(*) into v_count from public.placement_fees;
  if v_count <> 2 then
    raise exception 'INVARIANT-FAIL (5): recruiter sees % fees, expected 2', v_count;
  end if;

  select count(*) into v_count from public.fee_terms;
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL (5): recruiter sees % agreements, expected 1', v_count;
  end if;

  select coalesce(sum(base_amount), 0) into v_amount
    from public.placement_fee_lines
   where status = 'earned' and earned_on >= '2026-01-01' and earned_on < '2026-04-01';
  if v_amount <> 122500.00 then
    raise exception 'INVARIANT-FAIL (5): recruiter reads Q1 as % not 122500', v_amount;
  end if;

  ------------------------------------------------------------------------
  -- (9) Cross-org: another org's admin sees none of it.
  ------------------------------------------------------------------------
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', 'aaaaaaaa-0000-0000-0000-0000000000f5',
                      'role', 'authenticated')::text,
    true);

  select count(*) into v_count from public.placements;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (9): another org sees % placements', v_count;
  end if;
  select count(*) into v_count from public.placement_fees;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (9): another org sees % fees', v_count;
  end if;
  select count(*) into v_count from public.placement_fee_lines;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (9): another org sees % fee lines', v_count;
  end if;

  ------------------------------------------------------------------------
  -- (10) A suspended admin is not an admin. The 046 status gate still holds.
  ------------------------------------------------------------------------
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', 'aaaaaaaa-0000-0000-0000-0000000000f6',
                      'role', 'authenticated')::text,
    true);

  select count(*) into v_count from public.placements;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (10): a suspended admin sees % placements', v_count;
  end if;
  select count(*) into v_count from public.placement_fees;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (10): a suspended admin sees % fees', v_count;
  end if;

  raise notice 'ALL PLACEMENT-FEE INVARIANTS PASSED';
end
$checks$;

rollback;
