-- Manager role and mandate ownership invariants (migration 064).
--
-- Rolled back. Assertions run under `set local role authenticated` with a
-- forged `request.jwt.claims`, per users_policy_invariants.sql — what is
-- under test is what Postgres hands a real caller.
--
-- Two mechanisms are covered, and their refusals differ in kind, which the
-- assertions are explicit about: RLS *filters* (an UPDATE outside the
-- policy reports zero rows; an INSERT raises 42501), while the two
-- triggers *raise* (insufficient_privilege / check_violation /
-- foreign_key_violation). A test that expected the wrong kind would pass
-- against the wrong boundary.
--
--    1. A manager writes candidates — real insert accepted.
--    2. A manager opens a mandate, claiming themselves as lead — accepted
--       through both triggers.
--    3. A manager reassigns another's mandate — the D3 action — accepted,
--       and the row moved.
--    4. A recruiter attempting the same reassignment is refused
--       (insufficient_privilege). This is the column-level rule RLS cannot
--       express, same shape as the 046 escalation guard.
--    5. A recruiter opening a mandate claiming THEMSELVES is accepted —
--       the ordinary "I opened this" path takes no desk capability.
--    6. A recruiter opening a mandate claiming a COLLEAGUE is refused —
--       assigning someone else is reassignment by another door.
--    7. Assigning the viewer as lead is refused (check_violation): the
--       desk must not name someone who cannot carry a mandate.
--    8. Assigning org B's member is refused (foreign_key_violation, the
--       057 author trigger — in-org rides the same mechanism as
--       created_by).
--    9. A manager may NOT update another member's row — RLS filters to
--       zero rows; member administration stayed with the admin.
--   10. A manager may NOT author a skill — RLS WITH CHECK raises. The
--       skills studio stayed with the admin.
--   11. The predicate truth table, probed per principal: can_manage_desk
--       true for admin and manager; false for recruiter, researcher,
--       viewer; false for a SUSPENDED manager (the status check lives in
--       current_user_role and must cover the new role too).
--   12. can_read_fees is true for the manager — the desk shows money.
--   13. Moving a member who LEADS a mandate to another organisation still
--       works on the privileged path, and their org is updated — the
--       operation a composite FK would have broken, preserved on purpose
--       (057's argument, re-proven for the new column). Their led project
--       keeps its lead value; the desk reads it as a departed lead.
--   14. Every non-null lead_recruiter_id in the LIVE table belongs to the
--       project's own organisation (backfill integrity, asserted against
--       real data, not the fixture — fixture rows from (13) are excluded
--       by org).
--
-- On success: NOTICE 'ALL MANAGER-DESK INVARIANTS PASSED'.

begin;

insert into public.organizations (id, name, slug) values
  ('64de0000-0000-4000-8000-0000000000a0', 'Desk Org A', 'desk-org-a'),
  ('64de0000-0000-4000-8000-0000000000b0', 'Desk Org B', 'desk-org-b');

insert into auth.users (id, email) values
  ('64de0000-0000-4000-8000-0000000000a1', 'desk-admin@test.local'),
  ('64de0000-0000-4000-8000-0000000000a2', 'desk-manager@test.local'),
  ('64de0000-0000-4000-8000-0000000000a3', 'desk-recruiter@test.local'),
  ('64de0000-0000-4000-8000-0000000000a4', 'desk-recruiter2@test.local'),
  ('64de0000-0000-4000-8000-0000000000a5', 'desk-researcher@test.local'),
  ('64de0000-0000-4000-8000-0000000000a6', 'desk-viewer@test.local'),
  ('64de0000-0000-4000-8000-0000000000a7', 'desk-manager-suspended@test.local'),
  ('64de0000-0000-4000-8000-0000000000b1', 'desk-b-recruiter@test.local');

update public.users set organization_id = '64de0000-0000-4000-8000-0000000000a0',
       status = 'active', role = 'admin', full_name = 'Desk Admin'
 where id = '64de0000-0000-4000-8000-0000000000a1';
update public.users set organization_id = '64de0000-0000-4000-8000-0000000000a0',
       status = 'active', role = 'manager', full_name = 'Desk Manager'
 where id = '64de0000-0000-4000-8000-0000000000a2';
update public.users set organization_id = '64de0000-0000-4000-8000-0000000000a0',
       status = 'active', role = 'recruiter', full_name = 'Desk Recruiter'
 where id = '64de0000-0000-4000-8000-0000000000a3';
update public.users set organization_id = '64de0000-0000-4000-8000-0000000000a0',
       status = 'active', role = 'recruiter', full_name = 'Desk Recruiter Two'
 where id = '64de0000-0000-4000-8000-0000000000a4';
update public.users set organization_id = '64de0000-0000-4000-8000-0000000000a0',
       status = 'active', role = 'researcher', full_name = 'Desk Researcher'
 where id = '64de0000-0000-4000-8000-0000000000a5';
update public.users set organization_id = '64de0000-0000-4000-8000-0000000000a0',
       status = 'active', role = 'viewer', full_name = 'Desk Viewer'
 where id = '64de0000-0000-4000-8000-0000000000a6';
update public.users set organization_id = '64de0000-0000-4000-8000-0000000000a0',
       status = 'suspended', role = 'manager', full_name = 'Desk Manager (suspended)'
 where id = '64de0000-0000-4000-8000-0000000000a7';
update public.users set organization_id = '64de0000-0000-4000-8000-0000000000b0',
       status = 'active', role = 'recruiter', full_name = 'B Recruiter'
 where id = '64de0000-0000-4000-8000-0000000000b1';

-- A mandate led by Recruiter, seeded privileged (no JWT → both 064 guards
-- pass, as the service path must).
insert into public.projects (id, organization_id, created_by, lead_recruiter_id,
                             title, company_name, one_line_input)
values ('64de0000-0000-4000-8000-00000000c001',
        '64de0000-0000-4000-8000-0000000000a0',
        '64de0000-0000-4000-8000-0000000000a3',
        '64de0000-0000-4000-8000-0000000000a3',
        'Desk CTO', 'Desk Co', 'CTO for Desk Co');

-- 053's member-audit trigger fired on the seed. Scoped, never bare.
delete from public.activity_events
 where organization_id in ('64de0000-0000-4000-8000-0000000000a0',
                           '64de0000-0000-4000-8000-0000000000b0');

do $checks$
declare
  v_org_a      uuid := '64de0000-0000-4000-8000-0000000000a0';
  v_org_b      uuid := '64de0000-0000-4000-8000-0000000000b0';
  v_admin      uuid := '64de0000-0000-4000-8000-0000000000a1';
  v_manager    uuid := '64de0000-0000-4000-8000-0000000000a2';
  v_recruiter  uuid := '64de0000-0000-4000-8000-0000000000a3';
  v_recruiter2 uuid := '64de0000-0000-4000-8000-0000000000a4';
  v_researcher uuid := '64de0000-0000-4000-8000-0000000000a5';
  v_viewer     uuid := '64de0000-0000-4000-8000-0000000000a6';
  v_manager_sus uuid := '64de0000-0000-4000-8000-0000000000a7';
  v_b_recruiter uuid := '64de0000-0000-4000-8000-0000000000b1';
  v_project    uuid := '64de0000-0000-4000-8000-00000000c001';
  v_rows       int;
  v_lead       uuid;
  v_raised     boolean;
  v_ok         boolean;
  v_bad        int;
begin
  execute 'set local role authenticated';

  ------------------------------------------------------------------------
  -- (1) A manager writes candidates.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_manager, 'role', 'authenticated')::text, true);

  insert into public.candidates (organization_id, project_id, full_name)
  values (v_org_a, v_project, 'Desk Candidate');

  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    raise exception 'INVARIANT-FAIL (1): manager candidate insert wrote % rows', v_rows;
  end if;

  ------------------------------------------------------------------------
  -- (2) A manager opens a mandate claiming themselves as lead.
  ------------------------------------------------------------------------
  insert into public.projects (id, organization_id, created_by, lead_recruiter_id,
                               title, company_name, one_line_input)
  values ('64de0000-0000-4000-8000-00000000c002', v_org_a, v_manager, v_manager,
          'Desk COO', 'Desk Co', 'COO for Desk Co');

  ------------------------------------------------------------------------
  -- (3) A manager reassigns the recruiter's mandate to recruiter two.
  ------------------------------------------------------------------------
  update public.projects set lead_recruiter_id = v_recruiter2
   where id = v_project;

  get diagnostics v_rows = row_count;
  select lead_recruiter_id into v_lead from public.projects where id = v_project;
  if v_rows <> 1 or v_lead is distinct from v_recruiter2 then
    raise exception 'INVARIANT-FAIL (3): manager reassignment rows=%, lead=%', v_rows, v_lead;
  end if;

  ------------------------------------------------------------------------
  -- (4) A recruiter may not reassign — the trigger raises, it does not
  --     filter.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_recruiter, 'role', 'authenticated')::text, true);

  v_raised := false;
  begin
    update public.projects set lead_recruiter_id = v_recruiter
     where id = v_project;
  exception when insufficient_privilege then v_raised := true; end;

  if not v_raised then
    raise exception 'INVARIANT-FAIL (4): recruiter reassignment was not refused';
  end if;

  ------------------------------------------------------------------------
  -- (5) A recruiter opens a mandate claiming themselves.
  ------------------------------------------------------------------------
  insert into public.projects (id, organization_id, created_by, lead_recruiter_id,
                               title, company_name, one_line_input)
  values ('64de0000-0000-4000-8000-00000000c003', v_org_a, v_recruiter, v_recruiter,
          'Desk CFO', 'Desk Co', 'CFO for Desk Co');

  ------------------------------------------------------------------------
  -- (6) A recruiter may not open a mandate claiming a colleague.
  ------------------------------------------------------------------------
  v_raised := false;
  begin
    insert into public.projects (id, organization_id, created_by, lead_recruiter_id,
                                 title, company_name, one_line_input)
    values ('64de0000-0000-4000-8000-00000000c004', v_org_a, v_recruiter, v_recruiter2,
            'Desk CIO', 'Desk Co', 'CIO for Desk Co');
  exception when insufficient_privilege then v_raised := true; end;

  if not v_raised then
    raise exception 'INVARIANT-FAIL (6): recruiter assigned a colleague at creation';
  end if;

  ------------------------------------------------------------------------
  -- (7) The lead must be able to carry a mandate: a viewer is refused.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_manager, 'role', 'authenticated')::text, true);

  v_raised := false;
  begin
    update public.projects set lead_recruiter_id = v_viewer
     where id = v_project;
  exception when check_violation then v_raised := true; end;

  if not v_raised then
    raise exception 'INVARIANT-FAIL (7): a viewer was accepted as lead';
  end if;

  ------------------------------------------------------------------------
  -- (8) A member of another organisation is refused (057's trigger, now
  --     covering the lead column).
  ------------------------------------------------------------------------
  v_raised := false;
  begin
    update public.projects set lead_recruiter_id = v_b_recruiter
     where id = v_project;
  exception when foreign_key_violation then v_raised := true; end;

  if not v_raised then
    raise exception 'INVARIANT-FAIL (8): a cross-org lead was accepted';
  end if;

  ------------------------------------------------------------------------
  -- (9) A manager may not administer members — RLS filters the UPDATE to
  --     zero rows rather than raising.
  ------------------------------------------------------------------------
  update public.users set role = 'recruiter' where id = v_researcher;
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then
    raise exception 'INVARIANT-FAIL (9): manager updated a member row (% rows)', v_rows;
  end if;

  ------------------------------------------------------------------------
  -- (10) A manager may not author a skill — RLS raises on INSERT.
  ------------------------------------------------------------------------
  v_raised := false;
  begin
    insert into public.skills (organization_id, name, instructions, skill_type, created_by)
    values (v_org_a, 'Desk Skill', 'noop', 'search_skill', v_manager);
  exception when insufficient_privilege then v_raised := true; end;

  if not v_raised then
    raise exception 'INVARIANT-FAIL (10): manager authored a skill';
  end if;

  ------------------------------------------------------------------------
  -- (11) The predicate truth table, per principal.
  ------------------------------------------------------------------------
  declare
    v_who  uuid;
    v_want boolean;
  begin
    for v_who, v_want in
      select * from (values
        ('64de0000-0000-4000-8000-0000000000a1'::uuid, true),   -- admin
        ('64de0000-0000-4000-8000-0000000000a2'::uuid, true),   -- manager
        ('64de0000-0000-4000-8000-0000000000a3'::uuid, false),  -- recruiter
        ('64de0000-0000-4000-8000-0000000000a5'::uuid, false),  -- researcher
        ('64de0000-0000-4000-8000-0000000000a6'::uuid, false),  -- viewer
        ('64de0000-0000-4000-8000-0000000000a7'::uuid, false)   -- suspended manager
      ) as t(who, want)
    loop
      perform set_config('request.jwt.claims',
        json_build_object('sub', v_who, 'role', 'authenticated')::text, true);
      select public.can_manage_desk() into v_ok;
      if v_ok is distinct from v_want then
        raise exception 'INVARIANT-FAIL (11): can_manage_desk() = % for %', v_ok, v_who;
      end if;
    end loop;
  end;

  ------------------------------------------------------------------------
  -- (12) The desk shows money: can_read_fees is true for the manager.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_manager, 'role', 'authenticated')::text, true);
  select public.can_read_fees() into v_ok;
  if not v_ok then
    raise exception 'INVARIANT-FAIL (12): manager cannot read fees';
  end if;

  ------------------------------------------------------------------------
  -- (13) Moving a member who leads a mandate between organisations still
  --      works on the privileged path — the operation a composite FK
  --      would have broken. Their led project keeps its lead value.
  ------------------------------------------------------------------------
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);

  update public.users set organization_id = v_org_b where id = v_recruiter2;
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    raise exception 'INVARIANT-FAIL (13): member move wrote % rows', v_rows;
  end if;

  select lead_recruiter_id into v_lead from public.projects where id = v_project;
  if v_lead is distinct from v_recruiter2 then
    raise exception 'INVARIANT-FAIL (13): lead value changed on member move (%)', v_lead;
  end if;

  ------------------------------------------------------------------------
  -- (14) Backfill integrity on the LIVE table: every non-null lead
  --      belongs to the project''s organisation — except leads departed
  --      by (13)-style moves, which is why the fixture orgs are excluded.
  ------------------------------------------------------------------------
  select count(*) into v_bad
    from public.projects p
    join public.users u on u.id = p.lead_recruiter_id
   where p.organization_id not in (v_org_a, v_org_b)
     and u.organization_id is distinct from p.organization_id;

  if v_bad <> 0 then
    raise exception 'INVARIANT-FAIL (14): % live projects have an out-of-org lead', v_bad;
  end if;

  raise notice 'ALL MANAGER-DESK INVARIANTS PASSED';
end
$checks$;

rollback;
