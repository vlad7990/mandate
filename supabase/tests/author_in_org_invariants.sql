-- Author-in-org invariants (migration 057).
--
-- Rolled back. The write checks run as a privileged role; the RLS case
-- switches roles and says so.
--
-- 057 is the one place in this sweep that is a trigger rather than a
-- constraint, so the tests have to prove two things at once: that the rule
-- holds, and that the operations a foreign key would have broken still work.
-- The second half is the whole argument for the shape.
--
--    1. A cross-org author is refused on insert.
--    2. An own-org author is accepted.
--    3. A platform operator may author inside any organisation — the
--       disjunction 056 draws, read at write time.
--    4. A null author is accepted: migrations, jobs, departed colleagues.
--    5. Rewriting the attribution to a foreigner is refused on UPDATE too.
--    6. ...but touching any OTHER column of a row whose author has since
--       left is fine. This is the freeze problem, and the reason the check
--       is per-changed-column rather than per-row.
--    7. A founder may move a member between organisations after they have
--       authored rows. A composite key refuses this; measured, not assumed.
--    8. A founder may clear a departed member's organisation.
--    9. A founder may toggle `is_founder` on somebody who has authored.
--       The 056 tier shape refuses this.
--   10. The check sees across organisations — it must, since `users` is
--       RLS'd to the caller's own org and the cross-org author is exactly
--       what would come back as no rows.
--   11. The credit columns are covered, not just `created_by`.
--
-- On success: NOTICE 'ALL AUTHOR-IN-ORG INVARIANTS PASSED'.

begin;

insert into public.organizations (id, name, slug) values
  ('0be0be0b-0000-4000-8000-00000000ab01', 'Author Org A', 'author-org-a'),
  ('0be0be0b-0000-4000-8000-00000000ab02', 'Author Org B', 'author-org-b');

insert into auth.users (id, email) values
  ('0be0be0b-0000-4000-8000-00000000ab10', 'author-a@test.local'),
  ('0be0be0b-0000-4000-8000-00000000ab11', 'author-b@test.local'),
  ('0be0be0b-0000-4000-8000-00000000ab12', 'author-founder@test.local');

update public.users set organization_id = '0be0be0b-0000-4000-8000-00000000ab01',
       status = 'active', role = 'admin', full_name = 'Member A'
 where id = '0be0be0b-0000-4000-8000-00000000ab10';
update public.users set organization_id = '0be0be0b-0000-4000-8000-00000000ab02',
       status = 'active', role = 'admin', full_name = 'Member B'
 where id = '0be0be0b-0000-4000-8000-00000000ab11';
-- The platform operator sits in org B, so authoring in org A is genuinely
-- cross-organisation for them.
update public.users set organization_id = '0be0be0b-0000-4000-8000-00000000ab02',
       status = 'active', role = 'admin', is_founder = true, full_name = 'Ops'
 where id = '0be0be0b-0000-4000-8000-00000000ab12';

do $checks$
declare
  v_org_a  uuid := '0be0be0b-0000-4000-8000-00000000ab01';
  v_org_b  uuid := '0be0be0b-0000-4000-8000-00000000ab02';
  v_a      uuid := '0be0be0b-0000-4000-8000-00000000ab10';
  v_b      uuid := '0be0be0b-0000-4000-8000-00000000ab11';
  v_ops    uuid := '0be0be0b-0000-4000-8000-00000000ab12';
  v_client uuid;
  v_proj   uuid;
  v_cand   uuid;
  v_count  int;
begin
  ------------------------------------------------------------------------
  -- (1) A cross-org author is refused.
  ------------------------------------------------------------------------
  begin
    insert into public.clients (organization_id, name, created_by)
    values (v_org_a, 'Foreign Author Bank', v_b);
    raise exception 'INVARIANT-FAIL (1): org B member authored a row in org A';
  exception when foreign_key_violation then null; end;

  ------------------------------------------------------------------------
  -- (2) The org's own member authors freely.
  ------------------------------------------------------------------------
  insert into public.clients (organization_id, name, created_by)
  values (v_org_a, 'A Bank', v_a)
  returning id into v_client;

  ------------------------------------------------------------------------
  -- (3) A platform operator authors in any organisation.
  ------------------------------------------------------------------------
  insert into public.clients (organization_id, name, created_by)
  values (v_org_a, 'Ops Authored Bank', v_ops);

  ------------------------------------------------------------------------
  -- (4) An unattributed row is fine — migrations, background jobs, and the
  -- ON DELETE SET NULL left behind by a departed colleague.
  ------------------------------------------------------------------------
  insert into public.clients (organization_id, name, created_by)
  values (v_org_a, 'Unattributed Bank', null);

  ------------------------------------------------------------------------
  -- (5) Rewriting the attribution to a foreigner is refused on UPDATE.
  ------------------------------------------------------------------------
  begin
    update public.clients set created_by = v_b where id = v_client;
    raise exception 'INVARIANT-FAIL (5): attribution was rewritten to a foreigner';
  exception when foreign_key_violation then null; end;

  ------------------------------------------------------------------------
  -- (6) The freeze test. Move the author out of the org by hand, then edit
  -- an unrelated column of the row they wrote. A constraint would refuse
  -- this forever; the trigger only looks at columns being rewritten.
  ------------------------------------------------------------------------
  update public.users set organization_id = v_org_b where id = v_a;

  update public.clients set domain = 'still-editable.test' where id = v_client;

  select count(*) into v_count
    from public.clients where id = v_client and domain = 'still-editable.test';
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL (6): a row whose author left could not be edited';
  end if;

  -- (7) ...and that move itself is the operation a composite key refused.
  select organization_id into v_org_b from public.users where id = v_a;
  if v_org_b <> '0be0be0b-0000-4000-8000-00000000ab02' then
    raise exception 'INVARIANT-FAIL (7): the author was not moved between orgs';
  end if;
  v_org_b := '0be0be0b-0000-4000-8000-00000000ab02';

  ------------------------------------------------------------------------
  -- (8) Clearing a departed member's organisation.
  ------------------------------------------------------------------------
  update public.users set organization_id = null, status = 'suspended' where id = v_a;
  select count(*) into v_count
    from public.users where id = v_a and organization_id is null;
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL (8): a departed member''s org could not be cleared';
  end if;

  ------------------------------------------------------------------------
  -- (9) Toggling is_founder on somebody who has authored rows. The 056 tier
  -- shape refuses this, which is why 057 is not that shape.
  ------------------------------------------------------------------------
  update public.users set is_founder = true where id = v_b;
  update public.users set is_founder = false where id = v_b;
  select count(*) into v_count
    from public.users where id = v_b and is_founder = false;
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL (9): is_founder could not be toggled';
  end if;

  ------------------------------------------------------------------------
  -- (11) The credit columns, not just `created_by`.
  ------------------------------------------------------------------------
  insert into public.projects (organization_id, title, company_name, one_line_input)
  values (v_org_a, 'A Role', 'A Bank', 'A Role, London')
  returning id into v_proj;

  insert into public.candidates (organization_id, project_id, full_name, cv_processing)
  values (v_org_a, v_proj, 'A Candidate', false)
  returning id into v_cand;

  begin
    insert into public.placements
      (organization_id, project_id, candidate_id, status, offer_date, sourced_by_user_id)
    values (v_org_a, v_proj, v_cand, 'offered', '2026-03-01', v_b);
    raise exception 'INVARIANT-FAIL (11): a foreign researcher was credited on a placement';
  exception when foreign_key_violation then null; end;

  ------------------------------------------------------------------------
  -- (10) The check must see across organisations. `users` is RLS'd to the
  -- caller's own org, so a non-definer version would read the foreign
  -- author as no rows and wave it through as "unknown user" — passing in
  -- exactly the case it exists for. Run as a real member of org A.
  ------------------------------------------------------------------------
  insert into auth.users (id, email) values
    ('0be0be0b-0000-4000-8000-00000000ab13', 'author-a2@test.local');
  update public.users set organization_id = v_org_a, status = 'active',
         role = 'admin', full_name = 'Member A2'
   where id = '0be0be0b-0000-4000-8000-00000000ab13';

  perform set_config('request.jwt.claims',
    json_build_object('sub','0be0be0b-0000-4000-8000-00000000ab13',
                      'role','authenticated')::text, true);
  execute 'set local role authenticated';

  -- The caller genuinely cannot see the foreign user...
  select count(*) into v_count from public.users where id = v_b;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (10): org A can read an org B user row';
  end if;

  -- ...and still cannot name them as an author.
  begin
    insert into public.clients (organization_id, name, created_by)
    values (v_org_a, 'Definer Probe Bank', v_b);
    raise exception 'INVARIANT-FAIL (10): the check was blinded by RLS';
  exception when foreign_key_violation then null; end;

  reset role;

  raise notice 'ALL AUTHOR-IN-ORG INVARIANTS PASSED';
end
$checks$;

rollback;
