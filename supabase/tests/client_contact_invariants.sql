-- Client contact and note invariants (migration 054).
--
-- Rolled back. Run as a privileged role; the checks switch to `authenticated`.
-- Each expected-failure case asserts the SPECIFIC error — a catch-all passes on
-- a typo and reports a guarantee that was never tested.
--
-- Two things here are not provable by reading the policies. The first is the
-- note visibility tier: `commercial` is the second place in the product where
-- one signed-in colleague is told less than another, and the first was fees.
-- The second is the primary-contact trigger, which writes to sibling rows and
-- therefore has to be checked under the caller's own RLS rather than assumed.
--
--    1. Every active role READS contacts — including a viewer.
--    2. A viewer cannot INSERT a contact.
--    3. A researcher cannot insert, update or delete one.
--    4. A recruiter can do all three.
--    5. Cross-org: another org's admin sees none of it.
--    6. A suspended admin sees nothing (the 046 status gate still applies).
--    7. Naming a second primary DEMOTES the first — exactly one survives.
--    8. Two contacts cannot share an email at one client...
--    9. ...but any number may have no email at all (the 051 lesson).
--   10. A contact's org must match its client's org — the composite FK.
--   11. A viewer reads an 'org' note.
--   12. A viewer does NOT read a 'commercial' note.
--   13. A researcher does not either — there is no own-placement exception
--       here, because there is no placement to be credited on.
--   14. A recruiter reads both.
--   15. A viewer cannot UPDATE or DELETE the commercial note it cannot see —
--       the USING clause carries the read rule, so it is not merely hidden.
--   16. Adding a contact writes `client_contact_added`, readable at 'org'.
--   17. A phone-only edit writes NOTHING. A name change writes an update.
--   18. Archiving writes `client_contact_removed` with mode='archived'.
--   19. Notes write no activity events at all — the deliberate silence.
--   20. Setting a placement's sign-off writes `placement_signoff_changed`...
--   21. ...and the label SURVIVES the contact being deleted, while the FK
--       goes null. This is the whole reason both columns exist.
--   22. `author_label` is stamped by the database, not by the caller.
--   23. Deleting a client cascades its contacts and notes away.
--
-- ## One case that is deliberately not tested, because it cannot be reached
--
-- The INSERT policy on `client_notes` refuses a `commercial` note from a role
-- holding `mandates:write` but not `fees:read` — a note that would vanish the
-- instant it was saved. Today those capabilities resolve to the same two roles
-- (admin, recruiter), so no role in the matrix can exercise that branch and
-- constructing one would be testing a fixture rather than the product.
-- `roles.ts` says explicitly that the two are expected to diverge; when they
-- do, this file gains case 24 and it becomes reachable.
--
-- On success: NOTICE 'ALL CLIENT-CONTACT INVARIANTS PASSED'.

begin;

insert into auth.users (id, email)
values
  ('aaaaaaaa-0000-0000-0000-0000000000c1', 'contact-admin@test.local'),
  ('aaaaaaaa-0000-0000-0000-0000000000c2', 'contact-recruiter@test.local'),
  ('aaaaaaaa-0000-0000-0000-0000000000c3', 'contact-researcher@test.local'),
  ('aaaaaaaa-0000-0000-0000-0000000000c4', 'contact-viewer@test.local'),
  ('aaaaaaaa-0000-0000-0000-0000000000c5', 'contact-other-org@test.local'),
  ('aaaaaaaa-0000-0000-0000-0000000000c6', 'contact-suspended@test.local');

insert into public.organizations (id, name, slug)
values
  ('bbbbbbbb-0000-0000-0000-0000000000c1', 'Contact Org', 'contact-org'),
  ('bbbbbbbb-0000-0000-0000-0000000000c2', 'Contact Other Org', 'contact-other-org');

insert into public.users (id, organization_id, email, full_name, status, role)
values
  ('aaaaaaaa-0000-0000-0000-0000000000c1', 'bbbbbbbb-0000-0000-0000-0000000000c1',
   'contact-admin@test.local', 'Ada Admin', 'active', 'admin'),
  ('aaaaaaaa-0000-0000-0000-0000000000c2', 'bbbbbbbb-0000-0000-0000-0000000000c1',
   'contact-recruiter@test.local', 'Remi Recruiter', 'active', 'recruiter'),
  ('aaaaaaaa-0000-0000-0000-0000000000c3', 'bbbbbbbb-0000-0000-0000-0000000000c1',
   'contact-researcher@test.local', 'Rae Researcher', 'active', 'researcher'),
  ('aaaaaaaa-0000-0000-0000-0000000000c4', 'bbbbbbbb-0000-0000-0000-0000000000c1',
   'contact-viewer@test.local', 'Vic Viewer', 'active', 'viewer'),
  ('aaaaaaaa-0000-0000-0000-0000000000c5', 'bbbbbbbb-0000-0000-0000-0000000000c2',
   'contact-other-org@test.local', 'Otto Other', 'active', 'admin'),
  ('aaaaaaaa-0000-0000-0000-0000000000c6', 'bbbbbbbb-0000-0000-0000-0000000000c1',
   'contact-suspended@test.local', 'Sam Suspended', 'suspended', 'admin')
-- `full_name` has to be in the DO UPDATE list, not just the VALUES. The
-- signup trigger on `auth.users` has already created these `public.users`
-- rows by the time this runs, so every insert here takes the conflict
-- branch — and case (22) reads `full_name` back. Leaving it out made the
-- trigger fall through to the email and the assertion caught it, which is
-- the assertion doing its job on a fixture rather than on the product.
on conflict (id) do update
  set organization_id = excluded.organization_id,
      full_name = excluded.full_name,
      status = excluded.status,
      role = excluded.role;

insert into public.clients (id, organization_id, name)
values
  ('eeeeeeee-0000-0000-0000-0000000000c1', 'bbbbbbbb-0000-0000-0000-0000000000c1',
   'Contact Test Bank'),
  ('eeeeeeee-0000-0000-0000-0000000000c2', 'bbbbbbbb-0000-0000-0000-0000000000c2',
   'Other Org Bank');

insert into public.projects (id, organization_id, created_by, title, company_name,
                             one_line_input, client_id)
values
  ('cccccccc-0000-0000-0000-0000000000c1', 'bbbbbbbb-0000-0000-0000-0000000000c1',
   'aaaaaaaa-0000-0000-0000-0000000000c1', 'Head of Coverage', 'Contact Test Bank',
   'Head of Coverage, London', 'eeeeeeee-0000-0000-0000-0000000000c1');

insert into public.candidates (id, organization_id, project_id, full_name,
                               cv_processing, pipeline_stage)
values
  ('dddddddd-0000-0000-0000-0000000000c1', 'bbbbbbbb-0000-0000-0000-0000000000c1',
   'cccccccc-0000-0000-0000-0000000000c1', 'Signed Off Candidate', false, 'finalist');

-- The member audit trigger from 053 fires on the `on conflict do update` above,
-- so without this every event count below would be measuring the fixture rather
-- than the behaviour. Scoped to the two test orgs — never a bare DELETE.
delete from public.activity_events
 where organization_id in ('bbbbbbbb-0000-0000-0000-0000000000c1',
                           'bbbbbbbb-0000-0000-0000-0000000000c2');

do $checks$
declare
  v_org        uuid := 'bbbbbbbb-0000-0000-0000-0000000000c1';
  v_client     uuid := 'eeeeeeee-0000-0000-0000-0000000000c1';
  v_other_cli  uuid := 'eeeeeeee-0000-0000-0000-0000000000c2';
  v_project    uuid := 'cccccccc-0000-0000-0000-0000000000c1';
  v_candidate  uuid := 'dddddddd-0000-0000-0000-0000000000c1';
  v_placement  uuid := '99999999-0000-0000-0000-0000000000c1';
  v_jane       uuid;
  v_raj        uuid;
  v_note_org   uuid;
  v_note_comm  uuid;
  v_count      int;
  v_text       text;
  v_uuid       uuid;
  v_bool       boolean;
begin
  ------------------------------------------------------------------------
  -- Set-up, as the admin.
  ------------------------------------------------------------------------
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', 'aaaaaaaa-0000-0000-0000-0000000000c1',
                      'role', 'authenticated')::text,
    true);
  execute 'set local role authenticated';

  insert into public.client_contacts
    (organization_id, client_id, full_name, title, email, phone, contact_type,
     is_primary, created_by)
  values
    (v_org, v_client, 'Jane Okafor', 'MD, Markets', 'jane@bank.test', '+44 20 7000 0000',
     'hiring_manager', true, 'aaaaaaaa-0000-0000-0000-0000000000c1')
  returning id into v_jane;

  insert into public.client_contacts
    (organization_id, client_id, full_name, title, contact_type, created_by)
  values
    (v_org, v_client, 'Raj Patel', 'Head of Talent', 'hr',
     'aaaaaaaa-0000-0000-0000-0000000000c1')
  returning id into v_raj;

  insert into public.client_notes
    (organization_id, client_id, contact_id, created_by, note_type, content, visibility)
  values
    (v_org, v_client, v_jane, 'aaaaaaaa-0000-0000-0000-0000000000c1', 'call',
     'Kickoff call. They want to move fast.', 'org')
  returning id into v_note_org;

  insert into public.client_notes
    (organization_id, client_id, created_by, note_type, content, visibility)
  values
    (v_org, v_client, 'aaaaaaaa-0000-0000-0000-0000000000c1', 'general',
     'They are squeezing us on the rate — hold at 25%.', 'commercial')
  returning id into v_note_comm;

  ------------------------------------------------------------------------
  -- (22) `author_label` is stamped by the trigger, not passed in.
  ------------------------------------------------------------------------
  select author_label into v_text from public.client_notes where id = v_note_org;
  if v_text is distinct from 'Ada Admin' then
    raise exception 'INVARIANT-FAIL (22): author_label is % not "Ada Admin"', v_text;
  end if;

  ------------------------------------------------------------------------
  -- (7) Naming a second primary demotes the first.
  ------------------------------------------------------------------------
  update public.client_contacts set is_primary = true where id = v_raj;

  select count(*) into v_count
    from public.client_contacts where client_id = v_client and is_primary;
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL (7): % primaries survive, expected 1', v_count;
  end if;

  select is_primary into v_bool from public.client_contacts where id = v_jane;
  if v_bool then
    raise exception 'INVARIANT-FAIL (7): the first contact was not demoted';
  end if;

  -- Put it back, so later cases read the arrangement the comments describe.
  update public.client_contacts set is_primary = true where id = v_jane;

  ------------------------------------------------------------------------
  -- (8) Two contacts cannot share an email at one client.
  ------------------------------------------------------------------------
  begin
    insert into public.client_contacts (organization_id, client_id, full_name, email)
    values (v_org, v_client, 'Impostor Jane', 'JANE@BANK.TEST');
    raise exception 'INVARIANT-FAIL (8): a duplicate email was accepted';
  exception when unique_violation then
    null;   -- the generated email_key lower-cases, so this is the same address
  end;

  ------------------------------------------------------------------------
  -- (9) ...but any number of contacts may have no email.
  ------------------------------------------------------------------------
  insert into public.client_contacts (organization_id, client_id, full_name)
  values (v_org, v_client, 'Nameless One'), (v_org, v_client, 'Nameless Two');

  select count(*) into v_count
    from public.client_contacts where client_id = v_client and email_key is null;
  if v_count <> 3 then
    raise exception 'INVARIANT-FAIL (9): % contacts with no email, expected 3', v_count;
  end if;

  ------------------------------------------------------------------------
  -- (10) A contact's org must match its client's org.
  --
  -- Before the composite FK this was accepted: RLS inspects
  -- `organization_id`, which is correct here, and nothing looked at whether
  -- the named client belonged to it.
  ------------------------------------------------------------------------
  begin
    insert into public.client_contacts (organization_id, client_id, full_name)
    values (v_org, v_other_cli, 'Cross Org Contact');
    raise exception 'INVARIANT-FAIL (10): a contact was attached to another org''s client';
  exception when foreign_key_violation then
    null;
  end;

  ------------------------------------------------------------------------
  -- (16) Adding a contact wrote an event, at 'org'.
  ------------------------------------------------------------------------
  select count(*) into v_count
    from public.activity_events
   where organization_id = v_org and event_type = 'client_contact_added';
  if v_count <> 4 then
    raise exception 'INVARIANT-FAIL (16): % added-events, expected 4', v_count;
  end if;

  select visibility into v_text
    from public.activity_events
   where organization_id = v_org and event_type = 'client_contact_added'
   limit 1;
  if v_text <> 'org' then
    raise exception 'INVARIANT-FAIL (16): contact events are at % not org', v_text;
  end if;

  ------------------------------------------------------------------------
  -- (17) A phone-only edit is not activity. A name change is.
  ------------------------------------------------------------------------
  select count(*) into v_count
    from public.activity_events
   where organization_id = v_org and event_type = 'client_contact_updated';
  -- The demote/re-promote above moved `is_primary`, which is identity-bearing:
  -- three updates so far (Raj promoted, Jane demoted by the trigger, Jane
  -- re-promoted — which demotes Raj again, so four).
  if v_count <> 4 then
    raise exception 'INVARIANT-FAIL (17): % update-events before the edit, expected 4', v_count;
  end if;

  update public.client_contacts
     set phone = '+44 20 7000 9999', linkedin_url = 'https://example.test/jane'
   where id = v_jane;

  select count(*) into v_count
    from public.activity_events
   where organization_id = v_org and event_type = 'client_contact_updated';
  if v_count <> 4 then
    raise exception 'INVARIANT-FAIL (17): a phone-only edit wrote an event (% total)', v_count;
  end if;

  update public.client_contacts set full_name = 'Jane Okafor-Smith' where id = v_jane;

  select count(*) into v_count
    from public.activity_events
   where organization_id = v_org and event_type = 'client_contact_updated';
  if v_count <> 5 then
    raise exception 'INVARIANT-FAIL (17): a rename wrote % update-events, expected 5', v_count;
  end if;

  ------------------------------------------------------------------------
  -- (19) Notes write no activity at all — checked before the archive case
  -- adds more rows.
  ------------------------------------------------------------------------
  insert into public.client_notes
    (organization_id, client_id, created_by, content)
  values (v_org, v_client, 'aaaaaaaa-0000-0000-0000-0000000000c1', 'Throwaway.')
  returning id into v_uuid;

  update public.client_notes set content = 'Edited.' where id = v_uuid;
  delete from public.client_notes where id = v_uuid;

  select count(*) into v_count
    from public.activity_events
   where organization_id = v_org
     and event_type not in ('client_contact_added', 'client_contact_updated',
                            'client_contact_removed');
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (19): notes or something else wrote % events', v_count;
  end if;

  ------------------------------------------------------------------------
  -- (18) Archiving is reported as a removal, with the mechanism in detail.
  ------------------------------------------------------------------------
  update public.client_contacts set is_archived = true where id = v_raj;

  -- Matched on `detail`, not ordered by `created_at`: inside one transaction
  -- every row's default `now()` is the transaction's start time, so all these
  -- events share a timestamp and "the latest one" is not a thing.
  select count(*) into v_count
    from public.activity_events
   where organization_id = v_org
     and event_type = 'client_contact_removed'
     and detail->>'mode' = 'archived';
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL (18): % archive-removals, expected 1', v_count;
  end if;

  ------------------------------------------------------------------------
  -- (20) The placement sign-off, and (21) its snapshot.
  ------------------------------------------------------------------------
  insert into public.placements
    (id, organization_id, project_id, candidate_id, client_id, status, offer_date,
     owner_user_id)
  values
    (v_placement, v_org, v_project, v_candidate, v_client, 'offered', '2026-03-01',
     'aaaaaaaa-0000-0000-0000-0000000000c2');

  update public.placements
     set signed_off_by_contact_id = v_jane,
         signed_off_by_label = 'Jane Okafor-Smith // MD, Markets'
   where id = v_placement;

  select count(*) into v_count
    from public.activity_events
   where organization_id = v_org and event_type = 'placement_signoff_changed';
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL (20): % signoff events, expected 1', v_count;
  end if;

  -- The label survives the contact going away; the FK does not.
  delete from public.client_contacts where id = v_jane;

  select signed_off_by_contact_id, signed_off_by_label
    into v_uuid, v_text
    from public.placements where id = v_placement;

  if v_uuid is not null then
    raise exception 'INVARIANT-FAIL (21): the sign-off FK survived a deleted contact';
  end if;
  if v_text <> 'Jane Okafor-Smith // MD, Markets' then
    raise exception 'INVARIANT-FAIL (21): the sign-off label was lost, got %', v_text;
  end if;

  -- The note that pointed at Jane keeps its content and loses the link.
  select contact_id into v_uuid from public.client_notes where id = v_note_org;
  if v_uuid is not null then
    raise exception 'INVARIANT-FAIL (21): a note kept a deleted contact id';
  end if;

  ------------------------------------------------------------------------
  -- (11)(12) A viewer reads the org note and not the commercial one.
  ------------------------------------------------------------------------
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', 'aaaaaaaa-0000-0000-0000-0000000000c4',
                      'role', 'authenticated')::text,
    true);

  select count(*) into v_count from public.client_notes where id = v_note_org;
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL (11): a viewer sees % org notes, expected 1', v_count;
  end if;

  select count(*) into v_count from public.client_notes where id = v_note_comm;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (12): a viewer READ the commercial note';
  end if;

  ------------------------------------------------------------------------
  -- (1) ...but a viewer does read contacts.
  ------------------------------------------------------------------------
  -- Raj (archived), Nameless One and Nameless Two. Jane was deleted by (21),
  -- and archived is still visible — archiving takes somebody out of the
  -- pickers, not out of the record.
  select count(*) into v_count
    from public.client_contacts where client_id = v_client;
  if v_count <> 3 then
    raise exception 'INVARIANT-FAIL (1): a viewer sees % contacts, expected 3', v_count;
  end if;

  ------------------------------------------------------------------------
  -- (2) A viewer cannot create one.
  ------------------------------------------------------------------------
  begin
    insert into public.client_contacts (organization_id, client_id, full_name)
    values (v_org, v_client, 'Viewer Wrote This');
    raise exception 'INVARIANT-FAIL (2): a viewer inserted a contact';
  exception when insufficient_privilege then
    null;
  end;

  ------------------------------------------------------------------------
  -- (15) A viewer cannot update or delete the note it cannot read. RLS
  -- reports zero rows rather than an error, so the count is the assertion.
  ------------------------------------------------------------------------
  update public.client_notes set content = 'Tampered.' where id = v_note_comm;
  get diagnostics v_count = row_count;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (15): a viewer updated % commercial notes', v_count;
  end if;

  delete from public.client_notes where id = v_note_comm;
  get diagnostics v_count = row_count;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (15): a viewer deleted % commercial notes', v_count;
  end if;

  ------------------------------------------------------------------------
  -- (16 cont.) The contact events are readable by a viewer — they are at
  -- 'org', so hiding them would be a different bug from hiding fees.
  ------------------------------------------------------------------------
  select count(*) into v_count
    from public.activity_events
   where organization_id = v_org and event_type like 'client_contact_%';
  if v_count = 0 then
    raise exception 'INVARIANT-FAIL (16): a viewer sees no contact events';
  end if;

  ------------------------------------------------------------------------
  -- (13) A researcher does not read the commercial note either.
  ------------------------------------------------------------------------
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', 'aaaaaaaa-0000-0000-0000-0000000000c3',
                      'role', 'authenticated')::text,
    true);

  select count(*) into v_count from public.client_notes where id = v_note_comm;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (13): a researcher READ the commercial note';
  end if;

  ------------------------------------------------------------------------
  -- (3) A researcher cannot insert, update or delete a contact.
  ------------------------------------------------------------------------
  begin
    insert into public.client_contacts (organization_id, client_id, full_name)
    values (v_org, v_client, 'Researcher Wrote This');
    raise exception 'INVARIANT-FAIL (3): a researcher inserted a contact';
  exception when insufficient_privilege then
    null;
  end;

  update public.client_contacts set title = 'Tampered' where id = v_raj;
  get diagnostics v_count = row_count;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (3): a researcher updated % contacts', v_count;
  end if;

  delete from public.client_contacts where id = v_raj;
  get diagnostics v_count = row_count;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (3): a researcher deleted % contacts', v_count;
  end if;

  ------------------------------------------------------------------------
  -- (14) A recruiter reads both notes, and (4) writes contacts freely.
  ------------------------------------------------------------------------
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', 'aaaaaaaa-0000-0000-0000-0000000000c2',
                      'role', 'authenticated')::text,
    true);

  select count(*) into v_count
    from public.client_notes where client_id = v_client;
  if v_count <> 2 then
    raise exception 'INVARIANT-FAIL (14): a recruiter sees % notes, expected 2', v_count;
  end if;

  insert into public.client_contacts (organization_id, client_id, full_name, email)
  values (v_org, v_client, 'Recruiter Added', 'new@bank.test')
  returning id into v_uuid;

  update public.client_contacts set title = 'Director' where id = v_uuid;
  get diagnostics v_count = row_count;
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL (4): a recruiter updated % contacts, expected 1', v_count;
  end if;

  delete from public.client_contacts where id = v_uuid;
  get diagnostics v_count = row_count;
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL (4): a recruiter deleted % contacts, expected 1', v_count;
  end if;

  ------------------------------------------------------------------------
  -- (5) Cross-org: another org's admin sees none of it.
  ------------------------------------------------------------------------
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', 'aaaaaaaa-0000-0000-0000-0000000000c5',
                      'role', 'authenticated')::text,
    true);

  select count(*) into v_count
    from public.client_contacts where client_id = v_client;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (5): another org sees % contacts', v_count;
  end if;

  select count(*) into v_count from public.client_notes where client_id = v_client;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (5): another org sees % notes', v_count;
  end if;

  ------------------------------------------------------------------------
  -- (6) A suspended admin is not an admin.
  ------------------------------------------------------------------------
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', 'aaaaaaaa-0000-0000-0000-0000000000c6',
                      'role', 'authenticated')::text,
    true);

  select count(*) into v_count
    from public.client_contacts where client_id = v_client;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (6): a suspended admin sees % contacts', v_count;
  end if;

  select count(*) into v_count from public.client_notes where client_id = v_client;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (6): a suspended admin sees % notes', v_count;
  end if;

  ------------------------------------------------------------------------
  -- (23) Deleting a client takes its contacts and notes with it.
  ------------------------------------------------------------------------
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', 'aaaaaaaa-0000-0000-0000-0000000000c1',
                      'role', 'authenticated')::text,
    true);

  delete from public.clients where id = v_client;

  select count(*) into v_count
    from public.client_contacts where client_id = v_client;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (23): % contacts outlived their client', v_count;
  end if;

  select count(*) into v_count from public.client_notes where client_id = v_client;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (23): % notes outlived their client', v_count;
  end if;

  raise notice 'ALL CLIENT-CONTACT INVARIANTS PASSED';
end
$checks$;

rollback;
