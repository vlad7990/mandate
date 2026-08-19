-- Self-service invariants (migration 071: users_update_self + the guard's
-- self branch).
--
-- Rolled back; forged-JWT assertions per the house pattern. Writes are
-- made as the principal and their effects verified privileged (reset
-- role) — an RLS-filtered count is a false failure, the §21 lesson.
--
--    1. A staff non-admin renames themself, and the roster shows it.
--    2. The same principal cannot touch their own role, status or email —
--       three raises from the guard's self branch.
--    3. A pending signup (role never yet granted by anyone: org NULL,
--       status pending) can fix their name, and can NOT self-assign a
--       role or self-activate. This is the fail-open tripwire: with the
--       self branch's is_org_admin() read uncoalesced, a pending user's
--       NULL role skips the branch and falls through to RETURN NEW —
--       the control run simulates exactly that regression and must
--       abort here.
--    4. Externals rename themselves: the hiring manager (whom 067's
--       guard would have refused with "only a client admin ..." — the
--       misfire this slice removes) and the client_admin (whose 067
--       column rule forbade full_name even on their own row).
--    5. Status is not self-service off the admin tiers: the active HM
--       cannot self-suspend; the suspended HM can still fix their name
--       (the policy is deliberately not status-gated) but cannot
--       self-reactivate — is_client_admin() is active-only, so the
--       carried client_admin power cannot be reached from suspension.
--    6. The client_admin keeps their 067 power on their own row:
--       self-suspension goes through.
--    7. An org admin's self-edit keeps working (rename accepted), and
--       the last-admin rules still hold on the self path: the sole
--       active admin can neither self-demote nor self-suspend.
--    8. The policy grants reach to one's own row only: a viewer's
--       UPDATE aimed at a colleague is filtered to zero rows by RLS,
--       verified by effect, privileged.
--
-- On success: NOTICE 'ALL SELF-SERVICE INVARIANTS PASSED'.

begin;

insert into public.organizations (id, name, slug) values
  ('07100000-0000-4000-8000-0000000000a0', 'Self Org A', 'self-org-a');

insert into public.clients (id, organization_id, name) values
  ('07100000-0000-4000-8000-00000000ca01', '07100000-0000-4000-8000-0000000000a0', 'Self Client');

insert into auth.users (id, email) values
  ('07100000-0000-4000-8000-0000000000a1', 'self-admin@test.local'),
  ('07100000-0000-4000-8000-0000000000a2', 'self-viewer@test.local'),
  ('07100000-0000-4000-8000-0000000000a3', 'self-pending@test.local'),
  ('07100000-0000-4000-8000-0000000000e1', 'self-cadmin@test.local'),
  ('07100000-0000-4000-8000-0000000000e2', 'self-hm@test.local'),
  ('07100000-0000-4000-8000-0000000000e3', 'self-hm-susp@test.local');

-- The signup trigger created every row as (org NULL, role recruiter,
-- status pending). a3 stays exactly that — the pending signup under test.
update public.users set organization_id = '07100000-0000-4000-8000-0000000000a0',
       status = 'active', role = 'admin', full_name = 'Self Admin'
 where id = '07100000-0000-4000-8000-0000000000a1';
update public.users set organization_id = '07100000-0000-4000-8000-0000000000a0',
       status = 'active', role = 'viewer', full_name = 'Self Viewer'
 where id = '07100000-0000-4000-8000-0000000000a2';
update public.users set full_name = 'Self Pending'
 where id = '07100000-0000-4000-8000-0000000000a3';
update public.users set role = 'client_admin', status = 'active',
       client_id = '07100000-0000-4000-8000-00000000ca01', full_name = 'Self Cadmin'
 where id = '07100000-0000-4000-8000-0000000000e1';
update public.users set role = 'hiring_manager', status = 'active',
       client_id = '07100000-0000-4000-8000-00000000ca01', full_name = 'Self HM'
 where id = '07100000-0000-4000-8000-0000000000e2';
update public.users set role = 'hiring_manager', status = 'suspended',
       client_id = '07100000-0000-4000-8000-00000000ca01', full_name = 'Self HM Susp'
 where id = '07100000-0000-4000-8000-0000000000e3';

do $checks$
declare
  v_admin   uuid := '07100000-0000-4000-8000-0000000000a1';
  v_viewer  uuid := '07100000-0000-4000-8000-0000000000a2';
  v_pending uuid := '07100000-0000-4000-8000-0000000000a3';
  v_cadmin  uuid := '07100000-0000-4000-8000-0000000000e1';
  v_hm      uuid := '07100000-0000-4000-8000-0000000000e2';
  v_hm_s    uuid := '07100000-0000-4000-8000-0000000000e3';
  v_raised  boolean;
  v_text    text;
  v_count   int;
begin
  execute 'set local role authenticated';

  ------------------------------------------------------------------------
  -- (1) The viewer renames themself.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_viewer, 'role', 'authenticated')::text, true);
  update public.users set full_name = 'Self Viewer Renamed' where id = v_viewer;

  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  select full_name into v_text from public.users where id = v_viewer;
  if v_text is distinct from 'Self Viewer Renamed' then
    raise exception 'INVARIANT-FAIL (1): the viewer''s self-rename did not land (found %)', v_text;
  end if;
  execute 'set local role authenticated';

  ------------------------------------------------------------------------
  -- (2) The same viewer cannot touch own role / status / email.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_viewer, 'role', 'authenticated')::text, true);

  v_raised := false;
  begin
    update public.users set role = 'admin' where id = v_viewer;
  exception when insufficient_privilege then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (2): the viewer promoted themself';
  end if;

  v_raised := false;
  begin
    update public.users set status = 'suspended' where id = v_viewer;
  exception when insufficient_privilege then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (2): the viewer changed their own status';
  end if;

  v_raised := false;
  begin
    update public.users set email = 'other@test.local' where id = v_viewer;
  exception when insufficient_privilege then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (2): the viewer changed their own email';
  end if;

  ------------------------------------------------------------------------
  -- (3) The pending signup: name yes, privileges no. The fail-open
  --     tripwire — the control run must abort here.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_pending, 'role', 'authenticated')::text, true);

  update public.users set full_name = 'Self Pending Fixed' where id = v_pending;

  v_raised := false;
  begin
    update public.users set role = 'admin' where id = v_pending;
  exception when insufficient_privilege then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (3): a pending signup wrote its own role';
  end if;

  v_raised := false;
  begin
    update public.users set status = 'active' where id = v_pending;
  exception when insufficient_privilege then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (3): a pending signup self-activated';
  end if;

  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  select full_name into v_text from public.users where id = v_pending;
  if v_text is distinct from 'Self Pending Fixed' then
    raise exception 'INVARIANT-FAIL (3): the pending signup''s rename did not land (found %)', v_text;
  end if;
  execute 'set local role authenticated';

  ------------------------------------------------------------------------
  -- (4) Externals rename themselves — the 067 misfire, gone.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_hm, 'role', 'authenticated')::text, true);
  update public.users set full_name = 'Self HM Renamed' where id = v_hm;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_cadmin, 'role', 'authenticated')::text, true);
  update public.users set full_name = 'Self Cadmin Renamed' where id = v_cadmin;

  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  select count(*) into v_count from public.users
   where (id = v_hm and full_name = 'Self HM Renamed')
      or (id = v_cadmin and full_name = 'Self Cadmin Renamed');
  if v_count <> 2 then
    raise exception 'INVARIANT-FAIL (4): an external self-rename did not land (% of 2)', v_count;
  end if;
  execute 'set local role authenticated';

  ------------------------------------------------------------------------
  -- (5) Status is not self-service below the admin tiers.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_hm, 'role', 'authenticated')::text, true);
  v_raised := false;
  begin
    update public.users set status = 'suspended' where id = v_hm;
  exception when insufficient_privilege then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (5): the hiring manager changed their own status';
  end if;

  -- The suspended HM: rename lands (the policy is not status-gated) …
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_hm_s, 'role', 'authenticated')::text, true);
  update public.users set full_name = 'Self HM Susp Renamed' where id = v_hm_s;

  -- … but self-reactivation is refused: is_client_admin() is active-only.
  v_raised := false;
  begin
    update public.users set status = 'active' where id = v_hm_s;
  exception when insufficient_privilege then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (5): a suspended external self-reactivated';
  end if;

  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  select full_name into v_text from public.users where id = v_hm_s;
  if v_text is distinct from 'Self HM Susp Renamed' then
    raise exception 'INVARIANT-FAIL (5): the suspended rename did not land (found %)', v_text;
  end if;
  execute 'set local role authenticated';

  ------------------------------------------------------------------------
  -- (6) The client_admin keeps their 067 status power on their own row.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_cadmin, 'role', 'authenticated')::text, true);
  update public.users set status = 'suspended' where id = v_cadmin;

  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  select status into v_text from public.users where id = v_cadmin;
  if v_text is distinct from 'suspended' then
    raise exception 'INVARIANT-FAIL (6): the client_admin''s self-suspension did not land';
  end if;
  -- Restore privileged so nothing later trips over a suspended admin.
  update public.users set status = 'active' where id = v_cadmin;
  execute 'set local role authenticated';

  ------------------------------------------------------------------------
  -- (7) The org admin: self-edit works, the last-admin rules hold.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  update public.users set full_name = 'Self Admin Renamed' where id = v_admin;

  v_raised := false;
  begin
    update public.users set role = 'recruiter' where id = v_admin;
  exception when insufficient_privilege then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (7): the sole active admin self-demoted';
  end if;

  v_raised := false;
  begin
    update public.users set status = 'suspended' where id = v_admin;
  exception when insufficient_privilege then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (7): the sole active admin self-suspended';
  end if;

  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  select full_name into v_text from public.users where id = v_admin;
  if v_text is distinct from 'Self Admin Renamed' then
    raise exception 'INVARIANT-FAIL (7): the admin''s self-rename did not land (found %)', v_text;
  end if;
  execute 'set local role authenticated';

  ------------------------------------------------------------------------
  -- (8) Reach is one's own row only. The viewer aims at the admin: RLS
  --     filters the UPDATE to zero rows — no error, no effect. Verified
  --     by effect, privileged.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_viewer, 'role', 'authenticated')::text, true);
  update public.users set full_name = 'Should Not Land' where id = v_admin;

  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  select full_name into v_text from public.users where id = v_admin;
  if v_text is distinct from 'Self Admin Renamed' then
    raise exception 'INVARIANT-FAIL (8): the viewer renamed the admin (found %)', v_text;
  end if;

  raise notice 'ALL SELF-SERVICE INVARIANTS PASSED';
end
$checks$;

rollback;
