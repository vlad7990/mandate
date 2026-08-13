-- Search Intelligence — promotion + attribution invariants (migration 042).
--
-- Runs inside a transaction that is ROLLED BACK. Execute as a privileged role;
-- the RPC/RLS checks switch to `authenticated`.
--
-- Each expected-failure case asserts the SPECIFIC error it should raise. A
-- catch-all passes on a typo or a missing grant and reports a guarantee that was
-- never tested.
--
-- Invariants:
--   1. Promotion from a draft run is rejected — a draft never attributes.
--   2. Creating from a staged row writes the full provenance set
--      (source_kind='sourced', platform, url, sourced_at) and leaves
--      subject_notified_at NULL. Notification is a real-world act.
--   3. imported_count is stamped from the link table, not incremented blindly.
--   4. A promote containing ONE bad decision writes NOTHING — no orphan
--      candidate, no link, no counter movement. This is the whole reason the
--      RPC exists.
--   5. Re-promoting an already-promoted staged row is rejected.
--   6. Linking to a candidate outside the run's project is rejected.
--   7. End-to-end: run A imports a person, run B imports the SAME person, the
--      person is hired. One candidate, two links, attribution credits A.
--   8. Reversing the promotion order does not change the answer.
--   9. Attribution is derived — no column on candidates stores it.
--
-- On success: NOTICE 'ALL SOURCING-PROMOTION INVARIANTS PASSED'.

begin;

insert into auth.users (id, email)
values
  ('aaaaaaaa-0000-0000-0000-0000000000e1', 'promote@test.local'),
  ('aaaaaaaa-0000-0000-0000-0000000000e2', 'promote-other@test.local');

insert into public.organizations (id, name, slug)
values
  ('bbbbbbbb-0000-0000-0000-0000000000e1', 'Promote Org', 'promote-org'),
  ('bbbbbbbb-0000-0000-0000-0000000000e2', 'Promote Other Org', 'promote-other-org');

insert into public.users (id, organization_id, email, status, role)
values
  ('aaaaaaaa-0000-0000-0000-0000000000e1', 'bbbbbbbb-0000-0000-0000-0000000000e1',
   'promote@test.local', 'active', 'admin'),
  ('aaaaaaaa-0000-0000-0000-0000000000e2', 'bbbbbbbb-0000-0000-0000-0000000000e2',
   'promote-other@test.local', 'active', 'admin')
on conflict (id) do update
  set organization_id = excluded.organization_id, status = excluded.status;

insert into public.projects (id, organization_id, created_by, title, company_name, one_line_input)
values
  ('cccccccc-0000-0000-0000-0000000000e1', 'bbbbbbbb-0000-0000-0000-0000000000e1',
   'aaaaaaaa-0000-0000-0000-0000000000e1', 'Global Head of RegTech', 'TestBank',
   'Global Head of Regulatory Technology, NY or Toronto'),
  -- A second project in the SAME org, so the cross-project link check is
  -- testing the project boundary and not just RLS doing the work.
  ('cccccccc-0000-0000-0000-0000000000e2', 'bbbbbbbb-0000-0000-0000-0000000000e1',
   'aaaaaaaa-0000-0000-0000-0000000000e1', 'Other Role', 'TestBank', 'Other role');

insert into public.candidates (id, organization_id, project_id, full_name, cv_processing)
values ('dddddddd-0000-0000-0000-0000000000e1', 'bbbbbbbb-0000-0000-0000-0000000000e1',
        'cccccccc-0000-0000-0000-0000000000e2', 'Wrong Project Person', false);

do $checks$
declare
  v_run_a     uuid;
  v_run_b     uuid;
  v_draft     uuid;
  v_r1        uuid;
  v_r_bad     uuid;
  v_rb1       uuid;
  v_rb2       uuid;
  v_ra2       uuid;
  v_cand      uuid;
  v_cand2     uuid;
  v_created   int;
  v_linked    int;
  v_imported  int;
  v_count     int;
  v_attr      uuid;
  v_row       public.candidates%rowtype;
begin
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', 'aaaaaaaa-0000-0000-0000-0000000000e1', 'role', 'authenticated')::text,
    true
  );
  execute 'set local role authenticated';

  select id into v_run_a
    from public.allocate_and_insert_sourcing_run(
      'cccccccc-0000-0000-0000-0000000000e1', 'bbbbbbbb-0000-0000-0000-0000000000e1',
      null, 'Run A', '{"strategy_rationale":"baseline"}'::jsonb,
      'aaaaaaaa-0000-0000-0000-0000000000e1', 'pv', 'mv');

  -- (1) a draft run cannot promote
  insert into public.sourcing_run_results
    (run_id, organization_id, full_name, current_title, current_company, location,
     profile_url, email, source_platform, raw)
  values
    (v_run_a, 'bbbbbbbb-0000-0000-0000-0000000000e1', 'Multi Touch Person',
     'Head of Post-Trade', 'TestBank', 'New York',
     'https://www.linkedin.com/in/multitouch', 'multi@example.com',
     'linkedin_recruiter', '{"row_number":"2"}'::jsonb)
  returning id into v_r1;

  begin
    perform public.promote_sourcing_results(
      v_run_a, jsonb_build_array(jsonb_build_object('result_id', v_r1, 'action', 'create')));
    raise exception 'INVARIANT-FAIL: a draft run promoted results';
  exception when others then
    if sqlerrm like 'INVARIANT-FAIL%' then raise; end if;
    if sqlerrm not like '%only be promoted from an executed run%' then
      raise exception 'INVARIANT-FAIL: draft promotion blocked by the wrong error: %', sqlerrm;
    end if;
  end;

  perform public.mark_sourcing_run_executed(v_run_a, 2);

  -- (4) one bad decision must abort the WHOLE promote.
  --     v_r1 is valid and would create a candidate; v_r_bad names a candidate in
  --     another project. Nothing may survive.
  insert into public.sourcing_run_results
    (run_id, organization_id, full_name, source_platform)
  values (v_run_a, 'bbbbbbbb-0000-0000-0000-0000000000e1', 'Rollback Probe', 'linkedin_recruiter')
  returning id into v_r_bad;

  begin
    perform public.promote_sourcing_results(
      v_run_a,
      jsonb_build_array(
        jsonb_build_object('result_id', v_r1, 'action', 'create'),
        jsonb_build_object('result_id', v_r_bad, 'action', 'link',
                           'candidate_id', 'dddddddd-0000-0000-0000-0000000000e1')));
    raise exception 'INVARIANT-FAIL: a cross-project link was accepted';
  exception when others then
    if sqlerrm like 'INVARIANT-FAIL%' then raise; end if;
    -- (6) and the specific error for it
    if sqlerrm not like '%is not in this run%project%' then
      raise exception 'INVARIANT-FAIL: cross-project link blocked by the wrong error: %', sqlerrm;
    end if;
  end;

  select count(*) into v_count from public.candidates
   where full_name = 'Multi Touch Person';
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL: % orphan candidate(s) survived a failed promote', v_count;
  end if;

  select count(*) into v_count from public.sourcing_run_candidates where run_id = v_run_a;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL: % attribution link(s) survived a failed promote', v_count;
  end if;

  select imported_count into v_count from public.sourcing_runs where id = v_run_a;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL: imported_count moved to % on a failed promote', v_count;
  end if;

  select count(*) into v_count from public.sourcing_run_results
   where id = v_r1 and promoted_candidate_id is not null;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL: a staged row was marked promoted by a failed promote';
  end if;

  -- (2) (3) the happy path
  select created_count, linked_count, imported_count
    into v_created, v_linked, v_imported
    from public.promote_sourcing_results(
      v_run_a, jsonb_build_array(jsonb_build_object('result_id', v_r1, 'action', 'create')));

  if v_created <> 1 or v_linked <> 0 or v_imported <> 1 then
    raise exception 'INVARIANT-FAIL: promote returned created=% linked=% imported=%', v_created, v_linked, v_imported;
  end if;

  select promoted_candidate_id into v_cand
    from public.sourcing_run_results where id = v_r1;
  if v_cand is null then
    raise exception 'INVARIANT-FAIL: staged row was not stamped with its candidate';
  end if;

  select * into v_row from public.candidates where id = v_cand;
  if v_row.source_kind <> 'sourced' then
    raise exception 'INVARIANT-FAIL: source_kind is %, expected sourced', v_row.source_kind;
  end if;
  if v_row.source_platform <> 'linkedin_recruiter' then
    raise exception 'INVARIANT-FAIL: source_platform is %', v_row.source_platform;
  end if;
  if v_row.source_url <> 'https://www.linkedin.com/in/multitouch' then
    raise exception 'INVARIANT-FAIL: source_url is %', v_row.source_url;
  end if;
  if v_row.linkedin_url <> 'https://www.linkedin.com/in/multitouch' then
    raise exception 'INVARIANT-FAIL: a LinkedIn profile URL did not reach linkedin_url (identityKey reads it)';
  end if;
  if v_row.sourced_at is null then
    raise exception 'INVARIANT-FAIL: sourced_at was not stamped';
  end if;
  -- Writing this would record that an Art. 14 notification had been made when
  -- nobody had been told anything.
  if v_row.subject_notified_at is not null then
    raise exception 'INVARIANT-FAIL: promotion stamped subject_notified_at';
  end if;
  if v_row.location <> 'New York' or v_row.current_company <> 'TestBank' then
    raise exception 'INVARIANT-FAIL: staged fields did not carry onto the candidate';
  end if;

  select imported_count into v_count from public.sourcing_runs where id = v_run_a;
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL: imported_count is %, expected 1', v_count;
  end if;

  -- (5) no re-promotion
  begin
    perform public.promote_sourcing_results(
      v_run_a, jsonb_build_array(jsonb_build_object('result_id', v_r1, 'action', 'create')));
    raise exception 'INVARIANT-FAIL: a staged row was promoted twice';
  exception when others then
    if sqlerrm like 'INVARIANT-FAIL%' then raise; end if;
    if sqlerrm not like '%already been promoted%' then
      raise exception 'INVARIANT-FAIL: re-promotion blocked by the wrong error: %', sqlerrm;
    end if;
  end;

  -- (7) run B surfaces the SAME person. Executed after A, so A holds first touch.
  select id into v_run_b
    from public.allocate_and_insert_sourcing_run(
      'cccccccc-0000-0000-0000-0000000000e1', 'bbbbbbbb-0000-0000-0000-0000000000e1',
      v_run_a, 'Run B', '{}'::jsonb,
      'aaaaaaaa-0000-0000-0000-0000000000e1', 'pv', 'mv');
  perform public.mark_sourcing_run_executed(v_run_b, 1);

  insert into public.sourcing_run_results
    (run_id, organization_id, full_name, source_platform, match_status, matched_candidate_id)
  values (v_run_b, 'bbbbbbbb-0000-0000-0000-0000000000e1', 'Multi Touch Person',
          'linkedin_recruiter', 'duplicate', v_cand)
  returning id into v_rb1;

  select created_count, linked_count into v_created, v_linked
    from public.promote_sourcing_results(
      v_run_b, jsonb_build_array(
        jsonb_build_object('result_id', v_rb1, 'action', 'link', 'candidate_id', v_cand)));

  if v_created <> 0 or v_linked <> 1 then
    raise exception 'INVARIANT-FAIL: linking created=% linked=%', v_created, v_linked;
  end if;

  -- the person advances all the way
  update public.candidates set pipeline_stage = 'hired' where id = v_cand;

  select count(*) into v_count from public.candidates where full_name = 'Multi Touch Person';
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL: % candidates named Multi Touch Person, expected exactly 1', v_count;
  end if;

  select count(*) into v_count from public.sourcing_run_candidates where candidate_id = v_cand;
  if v_count <> 2 then
    raise exception 'INVARIANT-FAIL: % run links for the multi-touch person, expected 2', v_count;
  end if;

  select attributed_run_id into v_attr
    from public.sourcing_candidate_attribution where candidate_id = v_cand;
  if v_attr <> v_run_a then
    raise exception 'INVARIANT-FAIL: attribution went to the later run % instead of %', v_attr, v_run_a;
  end if;

  -- (8) reverse the order: a SECOND person is promoted by B first, then linked
  --     by A. A still executed earlier, so A must still win.
  insert into public.sourcing_run_results
    (run_id, organization_id, full_name, source_platform)
  values (v_run_b, 'bbbbbbbb-0000-0000-0000-0000000000e1', 'Reverse Order Person', 'linkedin_recruiter')
  returning id into v_rb2;

  perform public.promote_sourcing_results(
    v_run_b, jsonb_build_array(jsonb_build_object('result_id', v_rb2, 'action', 'create')));

  select promoted_candidate_id into v_cand2
    from public.sourcing_run_results where id = v_rb2;

  insert into public.sourcing_run_results
    (run_id, organization_id, full_name, source_platform)
  values (v_run_a, 'bbbbbbbb-0000-0000-0000-0000000000e1', 'Reverse Order Person', 'linkedin_recruiter')
  returning id into v_ra2;

  perform public.promote_sourcing_results(
    v_run_a, jsonb_build_array(
      jsonb_build_object('result_id', v_ra2, 'action', 'link', 'candidate_id', v_cand2)));

  select attributed_run_id into v_attr
    from public.sourcing_candidate_attribution where candidate_id = v_cand2;
  if v_attr <> v_run_a then
    raise exception 'INVARIANT-FAIL: promotion order changed the attribution (got %, expected %)', v_attr, v_run_a;
  end if;

  select imported_count into v_count from public.sourcing_runs where id = v_run_a;
  if v_count <> 2 then
    raise exception 'INVARIANT-FAIL: run A imported_count is %, expected 2', v_count;
  end if;

  -- (9) nothing stores the winner: it is recomputed from the links every read.
  select count(*) into v_count
    from information_schema.columns
   where table_schema = 'public' and table_name = 'candidates'
     and column_name in ('attributed_run_id', 'sourcing_run_id', 'attributed_at');
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL: attribution appears to be stored on candidates (% column(s))', v_count;
  end if;

  -- A draft run that surfaced the same person still attributes nothing.
  select id into v_draft
    from public.allocate_and_insert_sourcing_run(
      'cccccccc-0000-0000-0000-0000000000e1', 'bbbbbbbb-0000-0000-0000-0000000000e1',
      null, 'Never run', '{}'::jsonb,
      'aaaaaaaa-0000-0000-0000-0000000000e1', 'pv', 'mv');
  insert into public.sourcing_run_candidates (run_id, candidate_id, organization_id)
  values (v_draft, v_cand, 'bbbbbbbb-0000-0000-0000-0000000000e1');

  select attributed_run_id into v_attr
    from public.sourcing_candidate_attribution where candidate_id = v_cand;
  if v_attr <> v_run_a then
    raise exception 'INVARIANT-FAIL: a draft run disturbed attribution (got %)', v_attr;
  end if;

  raise notice 'ALL SOURCING-PROMOTION INVARIANTS PASSED';
end
$checks$;

rollback;
