-- Comms-service invariants (migration 099: the Candidate
-- Communication Service's data layer — deterministic infrastructure,
-- NO principal, and the slice that finally gives 044's Art. 14
-- machinery its caller).
--
-- Rolled back; forged-JWT assertions per the house pattern. 099 mints
-- everything this file pins:
--
--    1. The queued row records the idempotency key BEFORE any provider
--       call — a duplicate collides in the database (UNIQUE), not in
--       the mailbox.
--    2. THE ATOMIC COMPLETION — this slice's control tripwire: ONE
--       call moves the queued row to 'sent' with the provider's
--       reference AND lands the candidate_notifications row AND
--       stamps subject_notified_at (via 044's record_notification_sent,
--       reused). Three writes, one statement family.
--    3. Completion pins: completes exactly once; a notice-carrying
--       send cannot complete without its notification; no completion
--       without the provider's reference; the AGENT is refused by
--       name (sends are human until Scout); the direct stamp is still
--       guard-refused.
--    4. The earliest-notice rule survives the new door — and 044's
--       one-sent-notification-per-candidate index
--       (candidate_notifications_one_sent_idx, found by this harness's
--       first run) means a second notice-carrying completion SKIPS the
--       statutory record rather than failing a send the provider
--       already made: the clock does not move and no second sent row
--       is born.
--    5. The webhook door is inert without a provider-named row:
--       delivered/bounced move the status (forward only — a late
--       'delivered' cannot erase a bounce), a bounce suppresses the
--       address org-scoped and lowercased, an unknown reference
--       touches nothing, and anon may call it (the route verifies
--       svix before ever calling).
--    6. email_suppressions: role-read; admin-manual-insert only (a
--       recruiter refused, reason 'bounce' by hand refused, an agent
--       refused and blind); no update/delete doors.
--    7. The extensions open NO agent surface: the agent still cannot
--       write candidate_outreach, and reads no suppressions.
--
-- On success: NOTICE 'ALL COMMS-SERVICE INVARIANTS PASSED'.
--
-- Control run (2026-08-25, verified): complete_candidate_send REBUILT
-- with the notification half dropped ("the outreach row already says
-- the notice went") — a notice-carrying completion stamped NOTHING
-- and the harness aborted at INVARIANT-FAIL (2); drift and harness in
-- ONE transaction, the abort rolling the rebuild back. The 043
-- two-writes doctrine, proven at three.

begin;

insert into public.organizations (id, name, slug) values
  ('09900000-0000-4000-8000-0000000000a0', 'CS Org A', 'cs-org-a');

insert into auth.users (id, email) values
  ('09900000-0000-4000-8000-0000000000a1', 'cs-admin@test.local'),
  ('09900000-0000-4000-8000-0000000000a2', 'cs-recruiter@test.local'),
  ('09900000-0000-4000-8000-0000000000ab', 'cs-agent@test.local');

update public.users set organization_id = '09900000-0000-4000-8000-0000000000a0',
       status = 'active', role = 'admin', full_name = 'CS Admin'
 where id = '09900000-0000-4000-8000-0000000000a1';
update public.users set organization_id = '09900000-0000-4000-8000-0000000000a0',
       status = 'active', role = 'recruiter', full_name = 'CS Recruiter'
 where id = '09900000-0000-4000-8000-0000000000a2';
update public.users set organization_id = '09900000-0000-4000-8000-0000000000a0',
       status = 'active', role = 'agent', full_name = 'CS Agent'
 where id = '09900000-0000-4000-8000-0000000000ab';

insert into public.projects (id, organization_id, created_by, title, company_name, one_line_input) values
  ('09900000-0000-4000-8000-00000000aa01', '09900000-0000-4000-8000-0000000000a0',
   '09900000-0000-4000-8000-0000000000a2',
   'CTO Search', 'Acme Ledger', 'CTO for Acme Ledger (harness)');

insert into public.candidates (id, project_id, organization_id, full_name, email, source_kind, sourced_at) values
  ('09900000-0000-4000-8000-00000000cc01', '09900000-0000-4000-8000-00000000aa01',
   '09900000-0000-4000-8000-0000000000a0', 'Harmon Slate', 'harmon.slate@harness.test',
   'sourced', now());

do $checks$
declare
  v_admin     uuid := '09900000-0000-4000-8000-0000000000a1';
  v_recruiter uuid := '09900000-0000-4000-8000-0000000000a2';
  v_agent     uuid := '09900000-0000-4000-8000-0000000000ab';
  v_org       uuid := '09900000-0000-4000-8000-0000000000a0';
  v_candidate uuid := '09900000-0000-4000-8000-00000000cc01';
  v_row1      uuid;
  v_row2      uuid;
  v_row3      uuid;
  v_count     int;
  v_raised    boolean;
  v_text      text;
  v_uuid      uuid;
  v_ts        timestamptz;
  v_ts2       timestamptz;
  v_int       int;
begin
  execute 'set local role authenticated';

  ------------------------------------------------------------------------
  -- (1) The queued row and the idempotency collision.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_recruiter, 'role', 'authenticated')::text, true);

  insert into public.candidate_outreach
    (candidate_id, project_id, organization_id, channel, direction, subject, body,
     includes_privacy_notice, provider, delivery_status, thread_key, idempotency_key, created_by)
  values
    (v_candidate, '09900000-0000-4000-8000-00000000aa01', v_org, 'email', 'outbound',
     'A CTO conversation', 'Recruiter block. [notice] [footer]',
     true, 'resend', 'queued', 'thr-cs-1', 'cs-send-1', v_recruiter)
  returning id into v_row1;

  v_raised := false;
  begin
    insert into public.candidate_outreach
      (candidate_id, project_id, organization_id, channel, direction, subject,
       includes_privacy_notice, provider, delivery_status, thread_key, idempotency_key, created_by)
    values
      (v_candidate, '09900000-0000-4000-8000-00000000aa01', v_org, 'email', 'outbound',
       'dup', false, 'resend', 'queued', 'thr-cs-1', 'cs-send-1', v_recruiter);
  exception when unique_violation then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (1): a duplicate idempotency key produced a second send row';
  end if;

  ------------------------------------------------------------------------
  -- (3-pre) Pins that must hold BEFORE any completion.
  ------------------------------------------------------------------------
  -- No completion without the provider's reference.
  v_raised := false;
  begin
    perform public.complete_candidate_send(v_row1, '   ');
  exception when others then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (3): a completion landed without the provider''s reference';
  end if;

  -- A notice-carrying send cannot complete without its notification.
  v_raised := false;
  begin
    perform public.complete_candidate_send(v_row1, 'msg_cs_1');
  exception when others then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (3): a notice-carrying send completed without recording its notification';
  end if;

  -- The AGENT is refused by name.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_agent, 'role', 'authenticated')::text, true);
  v_raised := false;
  begin
    perform public.complete_candidate_send(
      v_row1, 'msg_cs_1', 'harmon.slate@harness.test',
      'candidate_outreach', 'v1', 'art14-v1', 'art14:cs:1');
  exception when insufficient_privilege then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (3): an AGENT completed a candidate send';
  end if;

  -- The direct stamp is still guard-refused.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_recruiter, 'role', 'authenticated')::text, true);
  v_raised := false;
  begin
    update public.candidates set subject_notified_at = now() where id = v_candidate;
  exception when others then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (3): subject_notified_at was stamped by hand';
  end if;

  ------------------------------------------------------------------------
  -- (2) THE ATOMIC COMPLETION — three writes, one call.
  ------------------------------------------------------------------------
  select n.subject_notified_at into v_ts
    from public.complete_candidate_send(
      v_row1, 'msg_cs_1', 'harmon.slate@harness.test',
      'candidate_outreach', 'v1', 'art14-v1', 'art14:cs:1') as n;

  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);

  select delivery_status into v_text
    from public.candidate_outreach where id = v_row1;
  if v_text is distinct from 'sent' then
    raise exception 'INVARIANT-FAIL (2): the completion did not move the row to sent (%)', v_text;
  end if;
  select count(*) into v_count from public.candidate_outreach
   where id = v_row1 and provider_message_id = 'msg_cs_1';
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL (2): the provider''s reference did not land';
  end if;
  select count(*) into v_count from public.candidate_notifications
   where candidate_id = v_candidate and status = 'sent'
     and provider_message_id = 'msg_cs_1';
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL (2): the notification row is missing — the record came apart';
  end if;
  select subject_notified_at into v_ts from public.candidates where id = v_candidate;
  if v_ts is null then
    raise exception 'INVARIANT-FAIL (2): the Art. 14 stamp is missing — a notice went with no record that the duty was met';
  end if;
  execute 'set local role authenticated';

  ------------------------------------------------------------------------
  -- (3-post) A send completes exactly once.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_recruiter, 'role', 'authenticated')::text, true);
  v_raised := false;
  begin
    perform public.complete_candidate_send(
      v_row1, 'msg_cs_1b', 'harmon.slate@harness.test',
      'candidate_outreach', 'v1', 'art14-v1', 'art14:cs:1b');
  exception when others then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (3): a send completed twice';
  end if;

  ------------------------------------------------------------------------
  -- (4) The earliest-notice rule survives the new door.
  ------------------------------------------------------------------------
  insert into public.candidate_outreach
    (candidate_id, project_id, organization_id, channel, direction, subject,
     includes_privacy_notice, provider, delivery_status, thread_key, idempotency_key, created_by)
  values
    (v_candidate, '09900000-0000-4000-8000-00000000aa01', v_org, 'email', 'outbound',
     'Second touch', true, 'resend', 'queued', 'thr-cs-1', 'cs-send-2', v_recruiter)
  returning id into v_row2;

  select c.subject_notified_at into v_ts from public.candidates c where c.id = v_candidate;
  perform public.complete_candidate_send(
    v_row2, 'msg_cs_2', 'harmon.slate@harness.test',
    'candidate_outreach', 'v1', 'art14-v1', 'art14:cs:2');
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  select subject_notified_at into v_ts2 from public.candidates where id = v_candidate;
  if v_ts2 is distinct from v_ts then
    raise exception 'INVARIANT-FAIL (4): a second notice MOVED the compliance clock';
  end if;
  select count(*) into v_count from public.candidate_notifications
   where candidate_id = v_candidate and status = 'sent';
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL (4): % sent notifications exist — 044 permits exactly one', v_count;
  end if;
  select delivery_status into v_text from public.candidate_outreach where id = v_row2;
  if v_text is distinct from 'sent' then
    raise exception 'INVARIANT-FAIL (4): the second send itself did not complete (%)', v_text;
  end if;
  execute 'set local role authenticated';

  ------------------------------------------------------------------------
  -- (5) The webhook door — inert without a provider-named row.
  ------------------------------------------------------------------------
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  execute 'set local role anon';

  select public.record_email_delivery_event('msg_cs_1', 'delivered') into v_int;
  if v_int <> 1 then
    raise exception 'INVARIANT-FAIL (5): the delivery event did not land (%)', v_int;
  end if;
  select public.record_email_delivery_event('msg_unknown', 'bounced', 'x@y.z') into v_int;
  if v_int <> 0 then
    raise exception 'INVARIANT-FAIL (5): an unknown reference touched something';
  end if;
  select public.record_email_delivery_event('msg_cs_1', 'bounced', 'Harmon.Slate@harness.test ') into v_int;
  if v_int <> 1 then
    raise exception 'INVARIANT-FAIL (5): the bounce did not land';
  end if;
  select public.record_email_delivery_event('msg_cs_1', 'delivered') into v_int;
  if v_int <> 0 then
    raise exception 'INVARIANT-FAIL (5): a late delivered event spoke after a bounce';
  end if;

  execute 'reset role';
  select delivery_status into v_text from public.candidate_outreach where id = v_row1;
  if v_text is distinct from 'bounced' then
    raise exception 'INVARIANT-FAIL (5): the bounce did not stick (%)', v_text;
  end if;
  select count(*) into v_count from public.email_suppressions
   where organization_id = v_org and address = 'harmon.slate@harness.test'
     and reason = 'bounce';
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL (5): the bounced address was not suppressed (lowercased, trimmed)';
  end if;
  execute 'set local role authenticated';

  ------------------------------------------------------------------------
  -- (6) Suppressions: role-read, admin-manual-insert only.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_recruiter, 'role', 'authenticated')::text, true);
  select count(*) into v_count from public.email_suppressions;
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL (6): the recruiter reads % of 1 suppressions', v_count;
  end if;
  v_raised := false;
  begin
    insert into public.email_suppressions (organization_id, address, reason)
    values (v_org, 'by-recruiter@harness.test', 'manual');
  exception when others then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (6): a RECRUITER suppressed an address';
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  v_raised := false;
  begin
    insert into public.email_suppressions (organization_id, address, reason)
    values (v_org, 'fake-bounce@harness.test', 'bounce');
  exception when others then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (6): an admin forged a BOUNCE by hand';
  end if;
  insert into public.email_suppressions (organization_id, address, reason, detail)
  values (v_org, 'manual@harness.test', 'manual', 'asked politely (harness)');

  ------------------------------------------------------------------------
  -- (7) The extensions open NO agent surface.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_agent, 'role', 'authenticated')::text, true);
  select count(*) into v_count from public.email_suppressions;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (7): the agent reads % suppressions', v_count;
  end if;
  update public.candidate_outreach set delivery_status = 'delivered' where id = v_row1;
  v_raised := false;
  begin
    insert into public.candidate_outreach
      (candidate_id, project_id, organization_id, channel, direction, subject,
       provider, delivery_status, created_by)
    values (v_candidate, '09900000-0000-4000-8000-00000000aa01', v_org, 'email',
            'outbound', 'agent send', 'resend', 'queued', v_agent);
  exception when others then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (7): the agent INSERTED a provider send';
  end if;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  select delivery_status into v_text from public.candidate_outreach where id = v_row1;
  if v_text is distinct from 'bounced' then
    raise exception 'INVARIANT-FAIL (7): the agent moved a delivery status (%)', v_text;
  end if;

  raise notice 'ALL COMMS-SERVICE INVARIANTS PASSED';
end
$checks$;

rollback;
