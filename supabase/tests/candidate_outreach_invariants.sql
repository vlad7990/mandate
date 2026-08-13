-- Candidate outreach + Art. 14 notification invariants (migration 043).
--
-- Runs inside a transaction that is ROLLED BACK. Execute as a privileged role;
-- the RPC/RLS checks switch to `authenticated`.
--
-- Each expected-failure case asserts the SPECIFIC error it should raise.
--
-- Invariants:
--   1. subject_notified_at cannot be set by a direct UPDATE — it is evidence,
--      not an attestation.
--   2. Outreach without the privacy notice does NOT stamp it.
--   3. Outreach WITH the notice stamps it, to the time of contact.
--   4. A later notice does not move the date — the clock is not resettable.
--   5. An inbound message cannot carry the notice.
--   6. A rejected log writes nothing at all.
--   7. Erasing a candidate erases their contact record.
--   8. RLS scopes outreach to the owning organization.
--
-- On success: NOTICE 'ALL CANDIDATE-OUTREACH INVARIANTS PASSED'.

begin;

insert into auth.users (id, email)
values
  ('aaaaaaaa-0000-0000-0000-00000000ab01', 'outreach@test.local'),
  ('aaaaaaaa-0000-0000-0000-00000000ab02', 'outreach-other@test.local');

insert into public.organizations (id, name, slug)
values
  ('bbbbbbbb-0000-0000-0000-00000000ab01', 'Outreach Org', 'outreach-org'),
  ('bbbbbbbb-0000-0000-0000-00000000ab02', 'Outreach Other', 'outreach-other');

insert into public.users (id, organization_id, email, status, role)
values
  ('aaaaaaaa-0000-0000-0000-00000000ab01', 'bbbbbbbb-0000-0000-0000-00000000ab01',
   'outreach@test.local', 'active', 'admin'),
  ('aaaaaaaa-0000-0000-0000-00000000ab02', 'bbbbbbbb-0000-0000-0000-00000000ab02',
   'outreach-other@test.local', 'active', 'admin')
on conflict (id) do update
  set organization_id = excluded.organization_id, status = excluded.status;

insert into public.projects (id, organization_id, created_by, title, company_name, one_line_input)
values ('cccccccc-0000-0000-0000-00000000ab01', 'bbbbbbbb-0000-0000-0000-00000000ab01',
        'aaaaaaaa-0000-0000-0000-00000000ab01', 'Head of IT Ops', 'TestBank', 'x');

insert into public.candidates (id, organization_id, project_id, full_name, cv_processing, source_kind, sourced_at)
values
  ('dddddddd-0000-0000-0000-00000000ab01', 'bbbbbbbb-0000-0000-0000-00000000ab01',
   'cccccccc-0000-0000-0000-00000000ab01', 'Sourced Person', false, 'sourced', now()),
  ('dddddddd-0000-0000-0000-00000000ab02', 'bbbbbbbb-0000-0000-0000-00000000ab01',
   'cccccccc-0000-0000-0000-00000000ab01', 'Erasure Person', false, 'sourced', now());

do $checks$
declare
  v_id       uuid;
  v_notified timestamptz;
  v_first    timestamptz;
  v_count    int;
begin
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', 'aaaaaaaa-0000-0000-0000-00000000ab01', 'role', 'authenticated')::text,
    true
  );
  execute 'set local role authenticated';

  -- (1) direct attestation rejected
  begin
    update public.candidates set subject_notified_at = now()
     where id = 'dddddddd-0000-0000-0000-00000000ab01';
    raise exception 'INVARIANT-FAIL: subject_notified_at was set by a direct update';
  exception when others then
    if sqlerrm like 'INVARIANT-FAIL%' then raise; end if;
    if sqlerrm not like '%log_candidate_outreach()%' then
      raise exception 'INVARIANT-FAIL: direct stamp blocked by the wrong error: %', sqlerrm;
    end if;
  end;

  -- An unrelated update to the same row must still work — the guard must not
  -- freeze the whole candidate.
  update public.candidates set pipeline_stage = 'reviewed'
   where id = 'dddddddd-0000-0000-0000-00000000ab01';

  -- (2) outreach without the notice does not discharge anything
  select o.id, o.subject_notified_at into v_id, v_notified
    from public.log_candidate_outreach(
      'dddddddd-0000-0000-0000-00000000ab01', 'linkedin', 'outbound',
      'Quick note', 'Are you open to a conversation?', false, null) as o;

  if v_id is null then
    raise exception 'INVARIANT-FAIL: outreach was not logged';
  end if;
  if v_notified is not null then
    raise exception 'INVARIANT-FAIL: a message with no privacy notice stamped the notification';
  end if;

  select subject_notified_at into v_notified
    from public.candidates where id = 'dddddddd-0000-0000-0000-00000000ab01';
  if v_notified is not null then
    raise exception 'INVARIANT-FAIL: candidate shows notified after a non-notice message';
  end if;

  -- (3) outreach WITH the notice stamps it, at the time of contact
  select o.subject_notified_at into v_notified
    from public.log_candidate_outreach(
      'dddddddd-0000-0000-0000-00000000ab01', 'email', 'outbound',
      'About your data', 'Here is where we found your details…', true,
      '2026-08-01T10:00:00Z'::timestamptz) as o;

  if v_notified is null then
    raise exception 'INVARIANT-FAIL: a notice-carrying message did not stamp the notification';
  end if;
  if v_notified <> '2026-08-01T10:00:00Z'::timestamptz then
    raise exception 'INVARIANT-FAIL: stamped % rather than the time of contact', v_notified;
  end if;
  v_first := v_notified;

  -- (4) a later notice does not move the date
  perform public.log_candidate_outreach(
    'dddddddd-0000-0000-0000-00000000ab01', 'email', 'outbound',
    'Following up', 'Second notice', true, '2026-08-20T10:00:00Z'::timestamptz);

  select subject_notified_at into v_notified
    from public.candidates where id = 'dddddddd-0000-0000-0000-00000000ab01';
  if v_notified <> v_first then
    raise exception 'INVARIANT-FAIL: a later notice moved the notification date from % to %', v_first, v_notified;
  end if;

  -- (5) an inbound message cannot carry the notice
  begin
    perform public.log_candidate_outreach(
      'dddddddd-0000-0000-0000-00000000ab01', 'email', 'inbound',
      'Re: about your data', 'Thanks', true, null);
    raise exception 'INVARIANT-FAIL: an inbound message carried the privacy notice';
  exception when others then
    if sqlerrm like 'INVARIANT-FAIL%' then raise; end if;
    if sqlerrm not like '%inbound message cannot carry%' then
      raise exception 'INVARIANT-FAIL: inbound notice blocked by the wrong error: %', sqlerrm;
    end if;
  end;

  -- (6) the rejected call wrote nothing
  select count(*) into v_count from public.candidate_outreach
   where candidate_id = 'dddddddd-0000-0000-0000-00000000ab01'
     and direction = 'inbound';
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL: % row(s) survived a rejected log', v_count;
  end if;

  -- A legitimate inbound reply still records.
  perform public.log_candidate_outreach(
    'dddddddd-0000-0000-0000-00000000ab01', 'email', 'inbound',
    'Re: about your data', 'Happy to talk next week', false, null);

  select count(*) into v_count from public.candidate_outreach
   where candidate_id = 'dddddddd-0000-0000-0000-00000000ab01';
  if v_count <> 4 then
    raise exception 'INVARIANT-FAIL: contact record holds % rows, expected 4', v_count;
  end if;

  -- (7) erasure takes the contact record with it
  perform public.log_candidate_outreach(
    'dddddddd-0000-0000-0000-00000000ab02', 'email', 'outbound',
    'Hello', 'Body naming this person', true, null);

  delete from public.candidates where id = 'dddddddd-0000-0000-0000-00000000ab02';

  select count(*) into v_count from public.candidate_outreach
   where candidate_id = 'dddddddd-0000-0000-0000-00000000ab02';
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL: % outreach row(s) survived the candidate erasure', v_count;
  end if;

  -- (8) RLS
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', 'aaaaaaaa-0000-0000-0000-00000000ab02', 'role', 'authenticated')::text,
    true
  );

  select count(*) into v_count from public.candidate_outreach;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL: another org can read % outreach rows', v_count;
  end if;

  raise notice 'ALL CANDIDATE-OUTREACH INVARIANTS PASSED';
end
$checks$;

rollback;
