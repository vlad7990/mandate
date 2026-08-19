-- Operator invariants (migration 072: the platform operator becomes a
-- persona — org-move audit, founder read surface for /ops, and the
-- load-bearing negatives of D5).
--
-- Rolled back; forged-JWT assertions per the house pattern. Writes are
-- made as the forged principal and their effects verified privileged.
--
--    1. Reach: a non-founder org admin reads their own organisation row
--       and their own clients, and nobody else's; an active founder
--       reads both orgs and the foreign client (the /ops surface's
--       lawful reads, and only those).
--    2. Approval is remembered twice, because two things happen: the
--       founder activates a pending signup and assigns its first org in
--       one statement → exactly one member_status_changed and exactly
--       one member_org_changed in the gaining org, both with the
--       founder as actor.
--    3. An organisation move is remembered on both sides: one
--       member_org_changed in the losing org and one in the gaining
--       org, resolved to org names at write time.
--    4. The founder's administration power is intact and attributed: a
--       role change by founder hand lands (guard fast-path) and writes
--       member_role_changed with the founder as actor.
--    5. Waitlist triage is audited on the row (the deliberate
--       exception, D4/072 header): the founder's approval stamps
--       reviewed_by; a non-founder admin's attempted triage is filtered
--       by RLS to zero rows and changes nothing.
--    6. The D5 mechanical negative: no policy on any recruiting-data
--       table mentions the founder predicate — the operator gained org
--       and client NAMES, not data.
--    7. A suspended founder reads zero organisations rows — the new
--       policies are status-gated (the 059 lesson applied at authoring
--       time). This is the control run's tripwire: re-created without
--       the can_read_org conjunct, the file must abort here.
--
-- On success: NOTICE 'ALL OPERATOR INVARIANTS PASSED'.

begin;

insert into public.organizations (id, name, slug) values
  ('07200000-0000-4000-8000-0000000000a0', 'Op Org A', 'op-org-a'),
  ('07200000-0000-4000-8000-0000000000b0', 'Op Org B', 'op-org-b');

insert into public.clients (id, organization_id, name) values
  ('07200000-0000-4000-8000-00000000cb01', '07200000-0000-4000-8000-0000000000b0', 'Op Client B');

insert into auth.users (id, email) values
  ('07200000-0000-4000-8000-0000000000f1', 'op-founder@test.local'),
  ('07200000-0000-4000-8000-0000000000f2', 'op-founder-susp@test.local'),
  ('07200000-0000-4000-8000-0000000000a1', 'op-a-admin@test.local'),
  ('07200000-0000-4000-8000-0000000000b1', 'op-b-admin@test.local'),
  ('07200000-0000-4000-8000-0000000000d1', 'op-pending@test.local');

update public.users set organization_id = '07200000-0000-4000-8000-0000000000a0',
       status = 'active', role = 'admin', is_founder = true, full_name = 'Op Founder'
 where id = '07200000-0000-4000-8000-0000000000f1';
update public.users set organization_id = '07200000-0000-4000-8000-0000000000a0',
       status = 'suspended', role = 'admin', is_founder = true, full_name = 'Op Founder Susp'
 where id = '07200000-0000-4000-8000-0000000000f2';
update public.users set organization_id = '07200000-0000-4000-8000-0000000000a0',
       status = 'active', role = 'admin', full_name = 'Op A Admin'
 where id = '07200000-0000-4000-8000-0000000000a1';
update public.users set organization_id = '07200000-0000-4000-8000-0000000000b0',
       status = 'active', role = 'admin', full_name = 'Op B Admin'
 where id = '07200000-0000-4000-8000-0000000000b1';
-- p1 stays exactly as the signup trigger made it: org NULL, role
-- VIEWER (the 046 default — the first draft of this file said
-- 'recruiter' from the 002-era trigger text, and invariant 4's role
-- change was a no-op that correctly wrote no event; §5h's lesson,
-- written-from-docs-not-database, repeating), status pending.

insert into public.waitlist (id, full_name, email) values
  ('07200000-0000-4000-8000-00000000aa01', 'Op Applicant', 'op-applicant@test.local');

-- The seed updates above already wrote member events (privileged, no
-- actor). Clear the decks so every count below is about the acts under
-- test.
delete from public.activity_events
 where organization_id in ('07200000-0000-4000-8000-0000000000a0',
                           '07200000-0000-4000-8000-0000000000b0');

do $checks$
declare
  v_org_a   uuid := '07200000-0000-4000-8000-0000000000a0';
  v_org_b   uuid := '07200000-0000-4000-8000-0000000000b0';
  v_f1      uuid := '07200000-0000-4000-8000-0000000000f1';
  v_f2      uuid := '07200000-0000-4000-8000-0000000000f2';
  v_b_admin uuid := '07200000-0000-4000-8000-0000000000b1';
  v_p1      uuid := '07200000-0000-4000-8000-0000000000d1';
  v_wl      uuid := '07200000-0000-4000-8000-00000000aa01';
  v_count   int;
  v_text    text;
begin
  execute 'set local role authenticated';

  ------------------------------------------------------------------------
  -- (1) Reach. The B admin first: own org, own client, nothing of A's.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_b_admin, 'role', 'authenticated')::text, true);

  select count(*) into v_count from public.organizations
   where id in (v_org_a, v_org_b);
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL (1): the B admin reads % org rows, expected exactly their own', v_count;
  end if;

  select count(*) into v_count from public.organizations where id = v_org_a;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (1): the B admin read org A''s row';
  end if;

  -- The founder: both orgs, and the foreign client by name.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_f1, 'role', 'authenticated')::text, true);

  select count(*) into v_count from public.organizations
   where id in (v_org_a, v_org_b);
  if v_count <> 2 then
    raise exception 'INVARIANT-FAIL (1): the founder reads % of the 2 seeded orgs', v_count;
  end if;

  select count(*) into v_count from public.clients
   where id = '07200000-0000-4000-8000-00000000cb01';
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL (1): the founder cannot read the foreign client''s name';
  end if;

  ------------------------------------------------------------------------
  -- (2) Approval: status + first org in one statement, remembered twice.
  ------------------------------------------------------------------------
  update public.users
     set status = 'active', organization_id = v_org_a
   where id = v_p1;

  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);

  select count(*) into v_count from public.activity_events
   where organization_id = v_org_a and target_user_id = v_p1
     and event_type = 'member_status_changed' and actor_id = v_f1;
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL (2): % attributed status events for the approval, expected 1', v_count;
  end if;

  select count(*) into v_count from public.activity_events
   where organization_id = v_org_a and target_user_id = v_p1
     and event_type = 'member_org_changed' and actor_id = v_f1;
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL (2): % attributed org events for the first assignment, expected 1', v_count;
  end if;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_f1, 'role', 'authenticated')::text, true);

  ------------------------------------------------------------------------
  -- (3) The move, remembered on both sides with names.
  ------------------------------------------------------------------------
  update public.users set organization_id = v_org_b where id = v_p1;

  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);

  -- The losing side names the departed member in detail, not as
  -- target_user_id — they are no longer of this org, and
  -- guard_author_in_org refuses foreign user references (the fix the
  -- first run of this very file forced; see 072's comment).
  select count(*) into v_count from public.activity_events
   where organization_id = v_org_a
     and event_type = 'member_org_changed' and actor_id = v_f1
     and detail->>'member_id' = v_p1::text
     and detail->>'to' = 'Op Org B';
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL (3): the losing org holds % move events, expected 1', v_count;
  end if;

  select count(*) into v_count from public.activity_events
   where organization_id = v_org_b and target_user_id = v_p1
     and event_type = 'member_org_changed' and actor_id = v_f1
     and detail->>'from' = 'Op Org A';
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL (3): the gaining org holds % move events, expected 1', v_count;
  end if;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_f1, 'role', 'authenticated')::text, true);

  ------------------------------------------------------------------------
  -- (4) Founder power intact and attributed.
  ------------------------------------------------------------------------
  update public.users set role = 'recruiter' where id = v_p1;

  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);

  select role into v_text from public.users where id = v_p1;
  if v_text is distinct from 'recruiter' then
    raise exception 'INVARIANT-FAIL (4): the founder''s role change did not land (found %)', v_text;
  end if;

  select count(*) into v_count from public.activity_events
   where organization_id = v_org_b and target_user_id = v_p1
     and event_type = 'member_role_changed' and actor_id = v_f1;
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL (4): % attributed role events, expected 1', v_count;
  end if;

  execute 'set local role authenticated';

  ------------------------------------------------------------------------
  -- (5) Waitlist triage: row-audited for the founder, unreachable below.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_f1, 'role', 'authenticated')::text, true);

  update public.waitlist
     set status = 'approved', reviewed_by = v_f1, reviewed_at = now()
   where id = v_wl;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_b_admin, 'role', 'authenticated')::text, true);

  update public.waitlist set status = 'rejected', reviewed_by = v_b_admin
   where id = v_wl;

  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);

  select status || '/' || coalesce(reviewed_by::text, 'nobody') into v_text
    from public.waitlist where id = v_wl;
  if v_text is distinct from ('approved/' || v_f1::text) then
    raise exception 'INVARIANT-FAIL (5): waitlist row reads %, expected the founder''s approval intact', v_text;
  end if;

  ------------------------------------------------------------------------
  -- (6) The D5 mechanical negative: recruiting data gained no founder
  --     policy. Checked against the catalog, not against behaviour, so a
  --     future migration that adds one fails here by name.
  ------------------------------------------------------------------------
  select count(*) into v_count
    from pg_policies
   where schemaname = 'public'
     and tablename in ('candidates', 'candidate_scores', 'candidate_notes',
                       'placements', 'placement_fees', 'placement_fee_lines',
                       'fee_terms', 'projects', 'shortlists')
     and (coalesce(qual, '') || coalesce(with_check, '')) ilike '%founder%';
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (6): % recruiting-data policies mention the founder predicate, expected 0', v_count;
  end if;

  ------------------------------------------------------------------------
  -- (7) A suspended founder reads zero organisations — the control
  --     run's tripwire.
  ------------------------------------------------------------------------
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_f2, 'role', 'authenticated')::text, true);

  select count(*) into v_count from public.organizations;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (7): a suspended founder reads % org rows, expected 0', v_count;
  end if;

  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);

  raise notice 'ALL OPERATOR INVARIANTS PASSED';
end
$checks$;

rollback;
