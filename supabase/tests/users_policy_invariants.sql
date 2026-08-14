-- users policy invariants (migrations 058 and 059).
--
-- Rolled back. Every assertion runs under `set local role authenticated`
-- with a forged `request.jwt.claims`, because the thing under test is what
-- Postgres hands back to a real caller — not what the policy text says.
--
-- Two migrations are covered here, and they are different in kind.
--
-- 058 consolidated the three permissive SELECT policies on `public.users`
-- into one and the two UPDATE policies into one, and wrapped the helper
-- calls as `(select ...)` so they are evaluated once per statement rather
-- than once per row. That was meant to be *exactly* equivalent — permissive
-- policies are OR'd, and USING and WITH CHECK are OR'd separately, so the
-- disjunction is the old behaviour and not merely close to it. "Meant to
-- be" is not evidence, so this file was written first, run against the live
-- database before 058, and run again after. It passed identically. The only
-- assertion that moved between the two runs was (5), and it moved because
-- of 059, not 058.
--
-- 059 is a behaviour change, deliberately: a suspended account stops
-- reading its organisation's member roster. Assertion (5) is how that gap
-- was found — the first version of it asserted what everyone assumed and
-- failed with all five members in hand.
--
--    1. An admin sees their own organisation and nothing else.
--    2. A recruiter sees the same set — reads are not tiered below admin.
--    3. A researcher sees the same set.
--    4. A viewer sees the same set. `org:read` is held by all four.
--    5. A suspended account sees only itself. Before 059 it saw the whole
--       roster: `current_user_org_id()` has no status check, and these
--       policies predate the 046 sweep that routed everything else through
--       `can_read_org()`.
--   5b. Nor does being a founder rescue a suspended account.
--       `is_current_user_founder()` has the same missing status check, so
--       059 hoists the conjunct above both branches rather than editing a
--       helper the 046 trigger also depends on.
--    6. A pending account sees only itself. This is `/auth/pending`, which
--       has no organisation and must still render. The self branch is
--       therefore unconditional, and 059 left it that way on purpose: a
--       suspended account has to be able to read its own `status` on the
--       way to being told why it is being signed out.
--    7. Another organisation's admin sees their org, not ours. Asserted in
--       both directions — a leak the other way would pass a test that only
--       counted org B's rows.
--    8. A founder sees every row in the table, including the pending
--       account that belongs to no organisation. This is the waitlist.
--    9. anon sees nothing. The policies are `TO authenticated`; a
--       consolidation that dropped the role clause would be invisible to
--       every assertion above.
--   10. An admin may update a member of their own organisation.
--   11. A recruiter may not — zero rows, not an error. RLS filters an
--       UPDATE; it does not raise. A caller expecting a throw here would
--       silently believe the write landed.
--   12. An admin may not reach into another organisation.
--   13. A founder may update across organisations.
--   14. A viewer may not update their own row. There is no self-update
--       policy on this table, only an admin one and a founder one, and the
--       SELECT self-read must not be mistaken for one.
--   15. Nor may a pending account.
--  15b. Nor may a suspended founder (059).
--   16. The escalation guard still bites: an admin cannot grant themselves
--       `is_founder`. RLS cannot restrict which *columns* an update
--       touches, so an admin is inside the policy for their own row by
--       design and the 046 trigger is the actual boundary. Widening the
--       policy without noticing this would be the expensive mistake.
--   17. ...nor move their own row to another organisation.
--   18. ...nor demote the organisation's last active admin.
--   19. A founder approves the pending account — status to active and an
--       organisation assigned in one statement — and the org's admin then
--       sees six members where they saw five. This is `approveUserAction`
--       end to end, and it is last so that the control run inverting it
--       also proves execution reached the bottom of the file.
--
-- On success: NOTICE 'ALL USERS-POLICY INVARIANTS PASSED'.

begin;

insert into public.organizations (id, name, slug) values
  ('5eec0000-0000-4000-8000-0000000000a0', 'Users Policy Org A', 'users-policy-org-a'),
  ('5eec0000-0000-4000-8000-0000000000b0', 'Users Policy Org B', 'users-policy-org-b');

-- The signup trigger creates the `public.users` row; these updates only
-- shape it. `guard_user_privilege_changes` returns early when `auth.uid()`
-- is NULL, so seeding as a privileged role does not trip the escalation
-- guard.
insert into auth.users (id, email) values
  ('5eec0000-0000-4000-8000-0000000000a1', 'up-admin@test.local'),
  ('5eec0000-0000-4000-8000-0000000000a2', 'up-recruiter@test.local'),
  ('5eec0000-0000-4000-8000-0000000000a3', 'up-researcher@test.local'),
  ('5eec0000-0000-4000-8000-0000000000a4', 'up-viewer@test.local'),
  ('5eec0000-0000-4000-8000-0000000000a5', 'up-suspended@test.local'),
  ('5eec0000-0000-4000-8000-0000000000a6', 'up-pending@test.local'),
  ('5eec0000-0000-4000-8000-0000000000b1', 'up-b-admin@test.local'),
  ('5eec0000-0000-4000-8000-0000000000b2', 'up-founder@test.local'),
  ('5eec0000-0000-4000-8000-0000000000b3', 'up-founder-suspended@test.local');

update public.users set organization_id = '5eec0000-0000-4000-8000-0000000000a0',
       status = 'active', role = 'admin', full_name = 'A Admin'
 where id = '5eec0000-0000-4000-8000-0000000000a1';
update public.users set organization_id = '5eec0000-0000-4000-8000-0000000000a0',
       status = 'active', role = 'recruiter', full_name = 'A Recruiter'
 where id = '5eec0000-0000-4000-8000-0000000000a2';
update public.users set organization_id = '5eec0000-0000-4000-8000-0000000000a0',
       status = 'active', role = 'researcher', full_name = 'A Researcher'
 where id = '5eec0000-0000-4000-8000-0000000000a3';
update public.users set organization_id = '5eec0000-0000-4000-8000-0000000000a0',
       status = 'active', role = 'viewer', full_name = 'A Viewer'
 where id = '5eec0000-0000-4000-8000-0000000000a4';
update public.users set organization_id = '5eec0000-0000-4000-8000-0000000000a0',
       status = 'suspended', role = 'recruiter', full_name = 'A Suspended'
 where id = '5eec0000-0000-4000-8000-0000000000a5';
-- The pending account keeps the signup trigger's defaults: no organisation,
-- status 'pending'. Restated rather than assumed, so a failure reads.
update public.users set full_name = 'A Pending', organization_id = null,
       status = 'pending'
 where id = '5eec0000-0000-4000-8000-0000000000a6';
update public.users set organization_id = '5eec0000-0000-4000-8000-0000000000b0',
       status = 'active', role = 'admin', full_name = 'B Admin'
 where id = '5eec0000-0000-4000-8000-0000000000b1';
-- The founder sits in org B, so "reads every organisation" is genuinely
-- distinguishable from "reads their own".
update public.users set organization_id = '5eec0000-0000-4000-8000-0000000000b0',
       status = 'active', role = 'admin', is_founder = true, full_name = 'Ops'
 where id = '5eec0000-0000-4000-8000-0000000000b2';
update public.users set organization_id = '5eec0000-0000-4000-8000-0000000000b0',
       status = 'suspended', role = 'admin', is_founder = true, full_name = 'Ops (suspended)'
 where id = '5eec0000-0000-4000-8000-0000000000b3';

-- 053's member audit trigger fires on the seed above. Scoped to the two
-- fixture orgs — never a bare delete.
delete from public.activity_events
 where organization_id in ('5eec0000-0000-4000-8000-0000000000a0',
                           '5eec0000-0000-4000-8000-0000000000b0');

do $checks$
declare
  v_org_a       uuid := '5eec0000-0000-4000-8000-0000000000a0';
  v_org_b       uuid := '5eec0000-0000-4000-8000-0000000000b0';
  v_admin       uuid := '5eec0000-0000-4000-8000-0000000000a1';
  v_recruiter   uuid := '5eec0000-0000-4000-8000-0000000000a2';
  v_researcher  uuid := '5eec0000-0000-4000-8000-0000000000a3';
  v_viewer      uuid := '5eec0000-0000-4000-8000-0000000000a4';
  v_suspended   uuid := '5eec0000-0000-4000-8000-0000000000a5';
  v_pending     uuid := '5eec0000-0000-4000-8000-0000000000a6';
  v_b_admin     uuid := '5eec0000-0000-4000-8000-0000000000b1';
  v_founder     uuid := '5eec0000-0000-4000-8000-0000000000b2';
  v_founder_sus uuid := '5eec0000-0000-4000-8000-0000000000b3';
  v_total       int;
  v_who         uuid;
  v_seen        uuid[];
  v_count       int;
  v_rows        int;
  v_org_a_set   uuid[];
begin
  v_org_a_set := array[v_admin, v_recruiter, v_researcher, v_viewer, v_suspended];

  -- Taken while still privileged: the founder's read is asserted against
  -- the whole table, not against the fixture.
  select count(*) into v_total from public.users;

  execute 'set local role authenticated';

  ------------------------------------------------------------------------
  -- (1)-(4) The four roles all read exactly their own organisation. Reads
  --         are not tiered, and a consolidation that folded a role check
  --         into the SELECT policy would show up here first.
  ------------------------------------------------------------------------
  foreach v_who in array array[v_admin, v_recruiter, v_researcher, v_viewer]
  loop
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_who, 'role', 'authenticated')::text, true);

    -- Unqualified on purpose: the query asks for the whole table and lets
    -- RLS decide. A WHERE clause here would hide the leak it looks for.
    select array_agg(id order by id) into v_seen from public.users;

    if v_seen is distinct from (select array_agg(u order by u)
                                  from unnest(v_org_a_set) as u) then
      raise exception 'INVARIANT-FAIL (1-4): org A member % read %', v_who, v_seen;
    end if;
  end loop;

  ------------------------------------------------------------------------
  -- (5) A suspended account sees only itself (059). Before 059 this read
  --     the whole roster, which is how the gap was found.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_suspended, 'role', 'authenticated')::text, true);

  select array_agg(id order by id) into v_seen from public.users;
  if v_seen is distinct from array[v_suspended] then
    raise exception 'INVARIANT-FAIL (5): suspended account read %', v_seen;
  end if;

  ------------------------------------------------------------------------
  -- (5b) Being a founder does not rescue a suspended account.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_founder_sus, 'role', 'authenticated')::text, true);

  select array_agg(id order by id) into v_seen from public.users;
  if v_seen is distinct from array[v_founder_sus] then
    raise exception 'INVARIANT-FAIL (5b): suspended founder read %', v_seen;
  end if;

  ------------------------------------------------------------------------
  -- (6) A pending account sees only itself. /auth/pending has no
  --     organisation and must still render.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_pending, 'role', 'authenticated')::text, true);

  select array_agg(id order by id) into v_seen from public.users;
  if v_seen is distinct from array[v_pending] then
    raise exception 'INVARIANT-FAIL (6): pending account read %', v_seen;
  end if;

  ------------------------------------------------------------------------
  -- (7) Org B's admin sees org B. Both directions, because a leak the
  --     other way would pass a test that only counted org B's rows.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_b_admin, 'role', 'authenticated')::text, true);

  select array_agg(id order by id) into v_seen from public.users;
  if v_seen is distinct from (select array_agg(u order by u)
                                from unnest(array[v_b_admin, v_founder, v_founder_sus]) as u) then
    raise exception 'INVARIANT-FAIL (7): org B admin read %', v_seen;
  end if;

  select count(*) into v_count from public.users where organization_id = v_org_a;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (7): org B admin reached % org A rows', v_count;
  end if;

  ------------------------------------------------------------------------
  -- (8) The founder reads the whole table, including the pending account
  --     that belongs to no organisation. That row is the waitlist.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_founder, 'role', 'authenticated')::text, true);

  select count(*) into v_count from public.users;
  if v_count <> v_total then
    raise exception 'INVARIANT-FAIL (8): founder read % of % rows', v_count, v_total;
  end if;

  select count(*) into v_count from public.users where id = v_pending;
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL (8): founder could not see the pending account';
  end if;

  select count(*) into v_count from public.users where organization_id = v_org_a;
  if v_count <> 5 then
    raise exception 'INVARIANT-FAIL (8): founder read % org A rows, expected 5', v_count;
  end if;

  ------------------------------------------------------------------------
  -- (9) anon reads nothing. Every policy here is TO authenticated; a
  --     consolidation that dropped the role clause would be invisible to
  --     every assertion above this one.
  ------------------------------------------------------------------------
  execute 'set local role anon';
  select count(*) into v_count from public.users;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (9): anon read % user rows', v_count;
  end if;
  execute 'set local role authenticated';

  ------------------------------------------------------------------------
  -- (10) An admin updates a member of their own organisation.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

  update public.users set full_name = 'A Viewer (renamed)' where id = v_viewer;
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    raise exception 'INVARIANT-FAIL (10): admin updated % own-org rows, expected 1', v_rows;
  end if;

  ------------------------------------------------------------------------
  -- (11) A recruiter may not. Zero rows, not an error.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_recruiter, 'role', 'authenticated')::text, true);

  update public.users set full_name = 'nope' where id = v_viewer;
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then
    raise exception 'INVARIANT-FAIL (11): recruiter updated % rows on users', v_rows;
  end if;

  ------------------------------------------------------------------------
  -- (12) An admin cannot reach another organisation.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

  update public.users set full_name = 'nope' where id = v_b_admin;
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then
    raise exception 'INVARIANT-FAIL (12): org A admin updated % org B rows', v_rows;
  end if;

  ------------------------------------------------------------------------
  -- (13) A founder updates across organisations.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_founder, 'role', 'authenticated')::text, true);

  update public.users set full_name = 'A Viewer (by ops)' where id = v_viewer;
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    raise exception 'INVARIANT-FAIL (13): founder updated % cross-org rows, expected 1', v_rows;
  end if;

  ------------------------------------------------------------------------
  -- (14) A viewer may not update their own row. There is no self-update
  --      policy on this table — only an admin one and a founder one — and
  --      the SELECT self-read must not be mistaken for one.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_viewer, 'role', 'authenticated')::text, true);

  update public.users set full_name = 'self-serve' where id = v_viewer;
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then
    raise exception 'INVARIANT-FAIL (14): viewer updated % rows on itself', v_rows;
  end if;

  ------------------------------------------------------------------------
  -- (15) Nor may a pending account.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_pending, 'role', 'authenticated')::text, true);

  update public.users set full_name = 'let me in' where id = v_pending;
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then
    raise exception 'INVARIANT-FAIL (15): pending account updated % rows on itself', v_rows;
  end if;

  ------------------------------------------------------------------------
  -- (15b) Nor a suspended founder — the write half of (5b).
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_founder_sus, 'role', 'authenticated')::text, true);

  update public.users set full_name = 'reinstated' where id = v_founder_sus;
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then
    raise exception 'INVARIANT-FAIL (15b): suspended founder updated % rows', v_rows;
  end if;

  ------------------------------------------------------------------------
  -- (16) The escalation guard still bites. RLS cannot restrict which
  --      columns an update touches, so an admin is inside the policy for
  --      their own row and the 046 trigger is the only thing between them
  --      and the waitlist.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

  begin
    update public.users set is_founder = true where id = v_admin;
    raise exception 'INVARIANT-FAIL (16): admin granted themselves is_founder';
  exception when insufficient_privilege then null; end;

  ------------------------------------------------------------------------
  -- (17) Nor move their own row to another organisation — the shortest
  --      path to another customer's data, since every org-scoped policy in
  --      the product follows organization_id.
  ------------------------------------------------------------------------
  begin
    update public.users set organization_id = v_org_b where id = v_admin;
    raise exception 'INVARIANT-FAIL (17): admin moved themselves to another org';
  exception when insufficient_privilege then null; end;

  ------------------------------------------------------------------------
  -- (18) Nor demote the last active admin, which would lock member
  --      administration out of the product with no in-app way back.
  ------------------------------------------------------------------------
  begin
    update public.users set role = 'recruiter' where id = v_admin;
    raise exception 'INVARIANT-FAIL (18): org A lost its last admin';
  exception when insufficient_privilege then null; end;

  ------------------------------------------------------------------------
  -- (19) approveUserAction, end to end: the founder flips status and
  --      assigns an organisation in one statement, and the org's admin
  --      then sees six members where they saw five. Last on purpose —
  --      inverting it for the control run also proves execution reached
  --      the bottom of the file.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_founder, 'role', 'authenticated')::text, true);

  update public.users
     set status = 'active', organization_id = v_org_a, role = 'viewer'
   where id = v_pending;
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    raise exception 'INVARIANT-FAIL (19): founder approved % pending rows, expected 1', v_rows;
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

  select count(*) into v_count from public.users;
  if v_count <> 6 then
    raise exception 'INVARIANT-FAIL (19): admin sees % members after approval, expected 6', v_count;
  end if;

  raise notice 'ALL USERS-POLICY INVARIANTS PASSED';
end
$checks$;

rollback;
