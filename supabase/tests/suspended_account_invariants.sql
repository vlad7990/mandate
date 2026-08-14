-- Suspended and pending account invariants (migration 060).
--
-- Rolled back. Runs under `set local role authenticated` with a forged
-- `request.jwt.claims`, because the question is what Postgres hands back to
-- a real caller.
--
-- 059 closed the `users` roster leak. This file is the sweep that followed
-- it: 046 routed every *generated* org-scoped policy through
-- `can_read_org()`, which tests `status = 'active'`, but two tables were
-- written by hand and never went through that sweep — `users` (002/003) and
-- `waitlist` (030). Both scope by founder or by self, not by organisation,
-- which is exactly why the generated sweep did not touch them.
--
-- The interesting part of this file is assertion (1). Rather than naming
-- tables, it **loops over every RLS-enabled table in `public`** and asserts
-- the same rule against each. A table added by a future migration is
-- covered the day it exists, without anyone remembering to add it here —
-- which is the failure mode that produced the `waitlist` gap in the first
-- place.
--
-- The rule: if an active admin can see rows in a table, a suspended member
-- of the same organisation must see none of them. The `if the admin can
-- see any` half matters as much as the assertion — a table nobody seeded
-- would otherwise pass at zero rows and prove nothing. Assertion (2) pins
-- how many tables actually carried data, so the loop cannot quietly go
-- vacuous if a seed breaks.
--
--    1. For every RLS-enabled table in `public`: whatever an active admin
--       can read, a suspended member of the same org reads none of it.
--       `users` is the one deliberate exception — a suspended account
--       reads its own row and only its own, which 059 established and the
--       sign-out gate depends on.
--    2. The loop was not vacuous: at least 15 tables held rows the admin
--       could see.
--    3. The same loop for a pending account — no organisation, never
--       activated. It is a different shape from suspension and the org
--       branch is not the only thing standing in its way.
--    4. A suspended member cannot write either — reads and writes fail
--       independently, and a policy set that got one right and the other
--       wrong is exactly what 046 found on this table the first time.
--    5. A suspended FOUNDER reads no waitlist rows. Before 060 they read
--       every row: `waitlist_founder_select` tested `is_founder` with an
--       inline EXISTS against `users` and never looked at `status`.
--    6. ...and updates none. Triage — approving or rejecting an applicant —
--       is a write, and the read and the write were separate policies with
--       the same hole.
--    7. A suspended founder does not get the roster back through the
--       waitlist's own predicate either. This is the coupling 060 removes:
--       the old policy read `public.users` inline, so its meaning depended
--       on the `users` policy, and 059 changing one silently changed the
--       other.
--    8. An ACTIVE founder still reads the waitlist, and 060 did not
--       simply break triage. The direction that must keep working.
--    9. ...and still updates it — `approveWaitlistAction` end to end.
--   10. An active non-founder admin still reads no waitlist rows. Founder
--       scope is not org scope, and hoisting a status check must not have
--       widened it into one. Last on purpose: inverting it for the control
--       run also proves execution reached the bottom of the file.
--
-- On success: NOTICE 'ALL SUSPENDED-ACCOUNT INVARIANTS PASSED'.

begin;

insert into public.organizations (id, name, slug) values
  ('06000000-0000-4000-8000-0000000000a0', 'Suspended Probe Org A', 'suspended-probe-a'),
  ('06000000-0000-4000-8000-0000000000b0', 'Suspended Probe Org B', 'suspended-probe-b');

insert into auth.users (id, email) values
  ('06000000-0000-4000-8000-0000000000a1', 'sp-admin@test.local'),
  ('06000000-0000-4000-8000-0000000000a2', 'sp-member@test.local'),
  ('06000000-0000-4000-8000-0000000000a3', 'sp-pending@test.local'),
  ('06000000-0000-4000-8000-0000000000b1', 'sp-founder-suspended@test.local'),
  ('06000000-0000-4000-8000-0000000000b2', 'sp-founder-active@test.local');

update public.users set organization_id = '06000000-0000-4000-8000-0000000000a0',
       status = 'active', role = 'admin', full_name = 'Probe Admin'
 where id = '06000000-0000-4000-8000-0000000000a1';
-- Seeded active so the rows below can be authored by an org member, then
-- suspended at the end of the seed. Suspending first would trip 057's
-- author-in-org check for no useful reason.
update public.users set organization_id = '06000000-0000-4000-8000-0000000000a0',
       status = 'active', role = 'recruiter', full_name = 'Probe Member'
 where id = '06000000-0000-4000-8000-0000000000a2';
update public.users set full_name = 'Probe Pending', organization_id = null,
       status = 'pending'
 where id = '06000000-0000-4000-8000-0000000000a3';
update public.users set organization_id = '06000000-0000-4000-8000-0000000000b0',
       status = 'suspended', role = 'admin', is_founder = true, full_name = 'Ops (suspended)'
 where id = '06000000-0000-4000-8000-0000000000b1';
update public.users set organization_id = '06000000-0000-4000-8000-0000000000b0',
       status = 'active', role = 'admin', is_founder = true, full_name = 'Ops'
 where id = '06000000-0000-4000-8000-0000000000b2';

-- Data in org A, so that "a suspended member reads nothing" is a claim
-- about rows that exist and that their own admin can see.
insert into public.clients (id, organization_id, name, created_by)
values ('06000000-0000-4000-8000-0000000000c1', '06000000-0000-4000-8000-0000000000a0',
        'Probe Bank', '06000000-0000-4000-8000-0000000000a1');

insert into public.projects (id, organization_id, client_id, title, company_name, one_line_input, created_by)
values ('06000000-0000-4000-8000-0000000000d1', '06000000-0000-4000-8000-0000000000a0',
        '06000000-0000-4000-8000-0000000000c1', 'MD, Markets', 'Probe Bank',
        'MD Markets at Probe Bank', '06000000-0000-4000-8000-0000000000a1');

insert into public.candidates (id, organization_id, project_id, full_name)
values ('06000000-0000-4000-8000-0000000000e1', '06000000-0000-4000-8000-0000000000a0',
        '06000000-0000-4000-8000-0000000000d1', 'Probe Candidate');

insert into public.candidate_scores (organization_id, project_id, candidate_id)
values ('06000000-0000-4000-8000-0000000000a0', '06000000-0000-4000-8000-0000000000d1',
        '06000000-0000-4000-8000-0000000000e1');

insert into public.feedback (organization_id, project_id, candidate_id, content, feedback_type)
values ('06000000-0000-4000-8000-0000000000a0', '06000000-0000-4000-8000-0000000000d1',
        '06000000-0000-4000-8000-0000000000e1', 'Strong on markets.', 'recruiter_note');

insert into public.job_specs (organization_id, project_id, content, created_by)
values ('06000000-0000-4000-8000-0000000000a0', '06000000-0000-4000-8000-0000000000d1',
        'Spec body.', '06000000-0000-4000-8000-0000000000a1');

insert into public.shortlists (organization_id, project_id, created_by)
values ('06000000-0000-4000-8000-0000000000a0', '06000000-0000-4000-8000-0000000000d1',
        '06000000-0000-4000-8000-0000000000a1');

insert into public.skills (organization_id, name, skill_type, instructions, created_by)
values ('06000000-0000-4000-8000-0000000000a0', 'Probe Skill', 'search_skill',
        'Do the thing.', '06000000-0000-4000-8000-0000000000a1');

insert into public.client_contacts (organization_id, client_id, full_name, created_by)
values ('06000000-0000-4000-8000-0000000000a0', '06000000-0000-4000-8000-0000000000c1',
        'Probe Contact', '06000000-0000-4000-8000-0000000000a1');

insert into public.client_notes (organization_id, client_id, content, created_by)
values ('06000000-0000-4000-8000-0000000000a0', '06000000-0000-4000-8000-0000000000c1',
        'Spoke to the CFO.', '06000000-0000-4000-8000-0000000000a1');

insert into public.candidate_notes (organization_id, project_id, candidate_id, content, created_by)
values ('06000000-0000-4000-8000-0000000000a0', '06000000-0000-4000-8000-0000000000d1',
        '06000000-0000-4000-8000-0000000000e1', 'Call scheduled.',
        '06000000-0000-4000-8000-0000000000a1');

insert into public.placements (id, organization_id, project_id, candidate_id, offer_date, owner_user_id)
values ('06000000-0000-4000-8000-0000000000f1', '06000000-0000-4000-8000-0000000000a0',
        '06000000-0000-4000-8000-0000000000d1', '06000000-0000-4000-8000-0000000000e1',
        date '2026-08-01', '06000000-0000-4000-8000-0000000000a1');

insert into public.placement_fees (id, organization_id, placement_id, fee_model, fee_basis,
                                   currency, base_currency, total_fee_amount)
values ('06000000-0000-4000-8000-0000000000f2', '06000000-0000-4000-8000-0000000000a0',
        '06000000-0000-4000-8000-0000000000f1', 'fixed', 'base_salary',
        'GBP', 'GBP', 90000);

insert into public.placement_fee_lines (organization_id, placement_id, placement_fee_id,
                                        label, amount, currency, base_currency)
values ('06000000-0000-4000-8000-0000000000a0', '06000000-0000-4000-8000-0000000000f1',
        '06000000-0000-4000-8000-0000000000f2', 'Instalment 1', 30000, 'GBP', 'GBP');

insert into public.hiring_manager_tokens (organization_id, project_id, expires_at, created_by)
values ('06000000-0000-4000-8000-0000000000a0', '06000000-0000-4000-8000-0000000000d1',
        now() + interval '7 days', '06000000-0000-4000-8000-0000000000a1');

insert into public.project_reports (organization_id, project_id, week_starting, content, generated_by)
values ('06000000-0000-4000-8000-0000000000a0', '06000000-0000-4000-8000-0000000000d1',
        date '2026-08-10', '{"summary":"probe"}'::jsonb, '06000000-0000-4000-8000-0000000000a1');

insert into public.boolean_queries (organization_id, project_id, content)
values ('06000000-0000-4000-8000-0000000000a0', '06000000-0000-4000-8000-0000000000d1',
        '("MD" OR "Managing Director") AND markets');

insert into public.activity_events (organization_id, event_type, visibility, project_id)
values ('06000000-0000-4000-8000-0000000000a0', 'shortlist_published', 'org',
        '06000000-0000-4000-8000-0000000000d1');

insert into public.waitlist (full_name, email, company, use_case)
values ('Probe Applicant', 'sp-applicant@test.local', 'Probe Capital', 'Evaluating Mandate.');

-- Only now is the member suspended: the rows above needed an author who
-- belonged to the organisation at the time they were written.
update public.users set status = 'suspended'
 where id = '06000000-0000-4000-8000-0000000000a2';

do $checks$
declare
  v_org_a        uuid := '06000000-0000-4000-8000-0000000000a0';
  v_admin        uuid := '06000000-0000-4000-8000-0000000000a1';
  v_suspended    uuid := '06000000-0000-4000-8000-0000000000a2';
  v_pending      uuid := '06000000-0000-4000-8000-0000000000a3';
  v_founder_sus  uuid := '06000000-0000-4000-8000-0000000000b1';
  v_founder      uuid := '06000000-0000-4000-8000-0000000000b2';
  v_tbl          text;
  v_admin_n      bigint;
  v_other_n      bigint;
  v_nonempty     int := 0;
  v_rows         int;
  v_leaks        text := '';
begin
  execute 'set local role authenticated';

  ------------------------------------------------------------------------
  -- (1) Every RLS-enabled table in public, not a list someone maintains.
  --     Whatever the org's own admin can read, the suspended member reads
  --     none of — except their own row in `users`.
  ------------------------------------------------------------------------
  for v_tbl in
    select c.relname
      from pg_class c
     where c.relnamespace = 'public'::regnamespace
       and c.relkind = 'r'
       and c.relrowsecurity
     order by c.relname
  loop
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
    execute format('select count(*) from public.%I', v_tbl) into v_admin_n;

    perform set_config('request.jwt.claims',
      json_build_object('sub', v_suspended, 'role', 'authenticated')::text, true);
    execute format('select count(*) from public.%I', v_tbl) into v_other_n;

    if v_admin_n > 0 then
      v_nonempty := v_nonempty + 1;
    end if;

    if v_tbl = 'users' then
      -- The deliberate exception, established by 059 and depended on by
      -- the sign-out gate: self, and nothing else.
      if v_other_n <> 1 then
        v_leaks := v_leaks || format(' users(self expected 1, got %s)', v_other_n);
      end if;
    elsif v_other_n <> 0 then
      v_leaks := v_leaks || format(' %s(%s of %s)', v_tbl, v_other_n, v_admin_n);
    end if;
  end loop;

  if v_leaks <> '' then
    raise exception 'INVARIANT-FAIL (1): suspended member still reads:%', v_leaks;
  end if;

  ------------------------------------------------------------------------
  -- (2) The loop was not vacuous. Without this, a broken seed turns every
  --     assertion above into "an empty table leaked nothing".
  ------------------------------------------------------------------------
  if v_nonempty < 15 then
    raise exception 'INVARIANT-FAIL (2): only % tables held visible rows — the fixture is too thin to prove anything', v_nonempty;
  end if;

  ------------------------------------------------------------------------
  -- (3) The same sweep for a pending account. Never activated, and no
  --     organisation — a different shape from suspension.
  ------------------------------------------------------------------------
  v_leaks := '';
  for v_tbl in
    select c.relname from pg_class c
     where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and c.relrowsecurity
     order by c.relname
  loop
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_pending, 'role', 'authenticated')::text, true);
    execute format('select count(*) from public.%I', v_tbl) into v_other_n;

    if v_tbl = 'users' then
      if v_other_n <> 1 then
        v_leaks := v_leaks || format(' users(self expected 1, got %s)', v_other_n);
      end if;
    elsif v_other_n <> 0 then
      v_leaks := v_leaks || format(' %s(%s)', v_tbl, v_other_n);
    end if;
  end loop;

  if v_leaks <> '' then
    raise exception 'INVARIANT-FAIL (3): pending account still reads:%', v_leaks;
  end if;

  ------------------------------------------------------------------------
  -- (4) Reads and writes fail independently. 046 found this table with
  --     the write side open and the read side never examined.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_suspended, 'role', 'authenticated')::text, true);

  begin
    insert into public.candidates (organization_id, project_id, full_name)
    values (v_org_a, '06000000-0000-4000-8000-0000000000d1', 'Written While Suspended');
    raise exception 'INVARIANT-FAIL (4): suspended member inserted a candidate';
  exception when insufficient_privilege then null; end;

  update public.clients set name = 'Renamed While Suspended'
   where id = '06000000-0000-4000-8000-0000000000c1';
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then
    raise exception 'INVARIANT-FAIL (4): suspended member updated % client rows', v_rows;
  end if;

  ------------------------------------------------------------------------
  -- (5) A suspended founder reads no waitlist rows. Before 060 this read
  --     every applicant Mandate has ever had.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_founder_sus, 'role', 'authenticated')::text, true);

  select count(*) into v_other_n from public.waitlist;
  if v_other_n <> 0 then
    raise exception 'INVARIANT-FAIL (5): suspended founder read % waitlist rows', v_other_n;
  end if;

  ------------------------------------------------------------------------
  -- (6) ...nor triages one. Approving and rejecting are writes, and the
  --     read and the write were two policies with the same hole.
  ------------------------------------------------------------------------
  update public.waitlist set status = 'approved', notes = 'by a suspended founder'
   where email = 'sp-applicant@test.local';
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then
    raise exception 'INVARIANT-FAIL (6): suspended founder triaged % waitlist rows', v_rows;
  end if;

  ------------------------------------------------------------------------
  -- (7) Nor does the roster come back. 060 replaced an inline EXISTS over
  --     `public.users` with the SECURITY DEFINER helper, so the waitlist
  --     policy no longer changes meaning when the users policy changes —
  --     the coupling that made 059 subtle.
  ------------------------------------------------------------------------
  select count(*) into v_other_n from public.users;
  if v_other_n <> 1 then
    raise exception 'INVARIANT-FAIL (7): suspended founder read % user rows, expected self only', v_other_n;
  end if;

  ------------------------------------------------------------------------
  -- (8) The direction that must keep working: an ACTIVE founder still
  --     reads the waitlist.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_founder, 'role', 'authenticated')::text, true);

  select count(*) into v_other_n from public.waitlist
   where email = 'sp-applicant@test.local';
  if v_other_n <> 1 then
    raise exception 'INVARIANT-FAIL (8): active founder read % of the seeded waitlist row', v_other_n;
  end if;

  ------------------------------------------------------------------------
  -- (9) ...and still triages it. approveWaitlistAction, end to end.
  ------------------------------------------------------------------------
  update public.waitlist set status = 'approved', reviewed_by = v_founder, reviewed_at = now()
   where email = 'sp-applicant@test.local';
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    raise exception 'INVARIANT-FAIL (9): active founder triaged % waitlist rows, expected 1', v_rows;
  end if;

  ------------------------------------------------------------------------
  -- (10) An active, non-founder org admin still reads no waitlist rows.
  --      Founder scope is not org scope, and hoisting a status check must
  --      not have quietly turned one into the other. Last on purpose.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

  select count(*) into v_other_n from public.waitlist;
  if v_other_n <> 0 then
    raise exception 'INVARIANT-FAIL (10): a non-founder admin read % waitlist rows', v_other_n;
  end if;

  raise notice 'ALL SUSPENDED-ACCOUNT INVARIANTS PASSED';
end
$checks$;

rollback;
