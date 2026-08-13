-- Art. 14 notification invariants (migration 044).
--
-- Rolled back. Run as a privileged role; the checks switch to `authenticated`.
-- Each expected-failure case asserts the SPECIFIC error — a catch-all passes on
-- a typo and reports a guarantee that was never tested.
--
--   1. Ticking "this message carried the notice" no longer stamps anything.
--      subject_notified_at is an event record, not an attestation.
--   2. A FAILED send stamps nothing but leaves evidence of the attempt.
--   3. A successful send stamps, at the time of sending.
--   4. A repeated idempotency key cannot send a second notice.
--   5. At most ONE successful statutory notice per candidate, even under a
--      fresh key — the partial unique index refuses it, not application care.
--   6. A later notice does not move the date.
--   7. Direct UPDATE of subject_notified_at is still refused (043 guard).
--   8. Erasing a candidate erases the notification evidence.

begin;

insert into auth.users (id, email)
values ('aaaaaaaa-0000-0000-0000-00000000cd01', 'notif@test.local');

insert into public.organizations (id, name, slug)
values ('bbbbbbbb-0000-0000-0000-00000000cd01', 'Notif Org', 'notif-org');

insert into public.users (id, organization_id, email, status, role)
values ('aaaaaaaa-0000-0000-0000-00000000cd01', 'bbbbbbbb-0000-0000-0000-00000000cd01',
        'notif@test.local', 'active', 'admin')
on conflict (id) do update
  set organization_id = excluded.organization_id, status = excluded.status;

insert into public.projects (id, organization_id, created_by, title, company_name, one_line_input)
values ('cccccccc-0000-0000-0000-00000000cd01', 'bbbbbbbb-0000-0000-0000-00000000cd01',
        'aaaaaaaa-0000-0000-0000-00000000cd01', 'T', 'C', 'x');

insert into public.candidates (id, organization_id, project_id, full_name, cv_processing, source_kind, sourced_at)
values ('dddddddd-0000-0000-0000-00000000cd01', 'bbbbbbbb-0000-0000-0000-00000000cd01',
        'cccccccc-0000-0000-0000-00000000cd01', 'Sourced Person', false, 'sourced', now());

do $checks$
declare v_n timestamptz; v_c int;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub','aaaaaaaa-0000-0000-0000-00000000cd01','role','authenticated')::text, true);
  execute 'set local role authenticated';

  -- (1) attestation no longer stamps
  select o.subject_notified_at into v_n from public.log_candidate_outreach(
    'dddddddd-0000-0000-0000-00000000cd01','email','outbound','Hi','Body', true, null) as o;
  if v_n is not null then
    raise exception 'INVARIANT-FAIL: ticking the box still stamped the notification';
  end if;
  select subject_notified_at into v_n from public.candidates
   where id='dddddddd-0000-0000-0000-00000000cd01';
  if v_n is not null then
    raise exception 'INVARIANT-FAIL: candidate shows notified on attestation alone';
  end if;

  -- (2) a failed send stamps nothing but is recorded
  perform public.record_notification_failed(
    'dddddddd-0000-0000-0000-00000000cd01','a@b.com','art14','v1','v1','smtp refused','key-fail-1');
  select subject_notified_at into v_n from public.candidates
   where id='dddddddd-0000-0000-0000-00000000cd01';
  if v_n is not null then
    raise exception 'INVARIANT-FAIL: a failed send marked the notification complete';
  end if;
  select count(*) into v_c from public.candidate_notifications where status='failed';
  if v_c <> 1 then raise exception 'INVARIANT-FAIL: failed attempt was not recorded'; end if;

  -- (3) a successful send stamps, at the send time
  select o.subject_notified_at into v_n from public.record_notification_sent(
    'dddddddd-0000-0000-0000-00000000cd01','a@b.com','art14','v1','v1','msg_1','key-ok-1',
    '2026-08-13T10:00:00Z'::timestamptz) as o;
  if v_n <> '2026-08-13T10:00:00Z'::timestamptz then
    raise exception 'INVARIANT-FAIL: stamped % rather than the send time', v_n;
  end if;

  -- (4) idempotency
  begin
    perform public.record_notification_sent(
      'dddddddd-0000-0000-0000-00000000cd01','a@b.com','art14','v1','v1','msg_2','key-ok-1',null);
    raise exception 'INVARIANT-FAIL: a repeated idempotency key sent a second notice';
  exception when others then
    if sqlerrm like 'INVARIANT-FAIL%' then raise; end if;
    if sqlerrm not like '%candidate_notifications_idempotency_idx%' then
      raise exception 'INVARIANT-FAIL: duplicate key blocked by the wrong error: %', sqlerrm;
    end if;
  end;

  -- (5) one successful notice per candidate, even under a fresh key
  begin
    perform public.record_notification_sent(
      'dddddddd-0000-0000-0000-00000000cd01','a@b.com','art14','v1','v1','msg_3','key-ok-2',null);
    raise exception 'INVARIANT-FAIL: a second successful notice was recorded for one candidate';
  exception when others then
    if sqlerrm like 'INVARIANT-FAIL%' then raise; end if;
    if sqlerrm not like '%candidate_notifications_one_sent_idx%' then
      raise exception 'INVARIANT-FAIL: duplicate notice blocked by the wrong error: %', sqlerrm;
    end if;
  end;

  -- (6) the date does not move
  select subject_notified_at into v_n from public.candidates
   where id='dddddddd-0000-0000-0000-00000000cd01';
  if v_n <> '2026-08-13T10:00:00Z'::timestamptz then
    raise exception 'INVARIANT-FAIL: the notification date moved';
  end if;

  -- (7) direct stamping still refused
  begin
    update public.candidates set subject_notified_at = now()
     where id='dddddddd-0000-0000-0000-00000000cd01';
    raise exception 'INVARIANT-FAIL: a direct update stamped the notification';
  exception when others then
    if sqlerrm like 'INVARIANT-FAIL%' then raise; end if;
    if sqlerrm not like '%log_candidate_outreach()%' then
      raise exception 'INVARIANT-FAIL: direct stamp blocked by the wrong error: %', sqlerrm;
    end if;
  end;

  -- (8) erasure takes the evidence with it
  delete from public.candidates where id='dddddddd-0000-0000-0000-00000000cd01';
  select count(*) into v_c from public.candidate_notifications;
  if v_c <> 0 then
    raise exception 'INVARIANT-FAIL: % notification row(s) survived the erasure', v_c;
  end if;

  raise notice 'ALL NOTIFICATION INVARIANTS PASSED';
end
$checks$;

rollback;
