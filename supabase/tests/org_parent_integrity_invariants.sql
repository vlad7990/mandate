-- Org/parent integrity invariants (migration 055).
--
-- Rolled back. Runs as a privileged role: this file is about *constraints*,
-- not policies, and a constraint that only holds for `authenticated` would be
-- no constraint at all. The RLS behaviour these back up is proven in
-- `client_contact_invariants.sql` and `placement_fee_invariants.sql`.
--
-- 055 added 68 composite foreign keys asserting that a row's
-- `organization_id` matches its parent's. Three things make that worth
-- testing rather than reading:
--
--   * the composite key had to be ON DELETE NO ACTION, because a composite
--     SET NULL would null `organization_id` itself;
--   * two whole classes are deliberately excluded, and an exclusion that
--     silently stopped working would break the product rather than secure it;
--   * over-constraining is as bad as under-constraining — the ordinary
--     same-org write has to still succeed.
--
--    1. The canonical hole is closed: a note in my org naming another org's
--       candidate is refused.
--    2. So is the one 054 found: a client-scoped row pointing at a foreign
--       parent, here `placements.client_id`.
--    3. And the chain one level up: `candidates.project_id`.
--    4. The ordinary same-org write still succeeds (no over-constraint).
--    5. ON DELETE SET NULL still nulls only the child column —
--       `organization_id` survives. This is the whole reason for NO ACTION.
--    6. ON DELETE CASCADE still cascades.
--    7. The global competency catalogue (NULL org) can still be attached to
--       a search — the exclusion is real and load-bearing.
--    8. A user can still be moved between organisations after authoring
--       rows — the `users` exclusion, and the reason for it.
--    9. Approving a pending account (null org -> org) still works.
--   10. Deleting an organisation still cascades its whole tree away.
--
-- On success: NOTICE 'ALL ORG-PARENT INTEGRITY INVARIANTS PASSED'.

begin;

insert into public.organizations (id, name, slug) values
  ('0be0be0b-0000-4000-8000-00000000a001', 'Integrity Org A', 'integrity-org-a'),
  ('0be0be0b-0000-4000-8000-00000000a002', 'Integrity Org B', 'integrity-org-b');

insert into auth.users (id, email) values
  ('0be0be0b-0000-4000-8000-00000000a010', 'integrity-a@test.local');

update public.users
   set organization_id = '0be0be0b-0000-4000-8000-00000000a001',
       status = 'active', role = 'admin', full_name = 'Integrity Admin'
 where id = '0be0be0b-0000-4000-8000-00000000a010';

-- Org A
insert into public.clients (id, organization_id, name) values
  ('0be0be0b-0000-4000-8000-00000000a020', '0be0be0b-0000-4000-8000-00000000a001', 'A Bank');
insert into public.projects (id, organization_id, title, company_name, one_line_input, client_id) values
  ('0be0be0b-0000-4000-8000-00000000a030', '0be0be0b-0000-4000-8000-00000000a001',
   'A Role', 'A Bank', 'A Role, London', '0be0be0b-0000-4000-8000-00000000a020');
insert into public.candidates (id, organization_id, project_id, full_name, cv_processing) values
  ('0be0be0b-0000-4000-8000-00000000a040', '0be0be0b-0000-4000-8000-00000000a001',
   '0be0be0b-0000-4000-8000-00000000a030', 'A Candidate', false);

-- Org B
insert into public.clients (id, organization_id, name) values
  ('0be0be0b-0000-4000-8000-00000000a021', '0be0be0b-0000-4000-8000-00000000a002', 'B Bank');
insert into public.projects (id, organization_id, title, company_name, one_line_input) values
  ('0be0be0b-0000-4000-8000-00000000a031', '0be0be0b-0000-4000-8000-00000000a002',
   'B Role', 'B Bank', 'B Role, NY');
insert into public.candidates (id, organization_id, project_id, full_name, cv_processing) values
  ('0be0be0b-0000-4000-8000-00000000a041', '0be0be0b-0000-4000-8000-00000000a002',
   '0be0be0b-0000-4000-8000-00000000a031', 'B Candidate', false);

do $checks$
declare
  v_org_a   uuid := '0be0be0b-0000-4000-8000-00000000a001';
  v_org_b   uuid := '0be0be0b-0000-4000-8000-00000000a002';
  v_user    uuid := '0be0be0b-0000-4000-8000-00000000a010';
  v_client_a uuid := '0be0be0b-0000-4000-8000-00000000a020';
  v_client_b uuid := '0be0be0b-0000-4000-8000-00000000a021';
  v_proj_a  uuid := '0be0be0b-0000-4000-8000-00000000a030';
  v_proj_b  uuid := '0be0be0b-0000-4000-8000-00000000a031';
  v_cand_a  uuid := '0be0be0b-0000-4000-8000-00000000a040';
  v_cand_b  uuid := '0be0be0b-0000-4000-8000-00000000a041';
  v_search  uuid := '0be0be0b-0000-4000-8000-00000000a050';
  v_place   uuid := '0be0be0b-0000-4000-8000-00000000a060';
  v_comp    uuid;
  v_count   int;
  v_org     uuid;
begin
  ------------------------------------------------------------------------
  -- (1) The canonical hole. Before 055 every policy in the product
  -- accepted this row, because RLS only inspects organization_id.
  ------------------------------------------------------------------------
  begin
    insert into public.candidate_notes
      (organization_id, candidate_id, project_id, content)
    values (v_org_a, v_cand_b, v_proj_a, 'Reaching into another org.');
    raise exception 'INVARIANT-FAIL (1): a cross-org candidate note was accepted';
  exception when foreign_key_violation then
    null;
  end;

  ------------------------------------------------------------------------
  -- (2) The shape 054 found on contacts, here on the placement's client.
  ------------------------------------------------------------------------
  begin
    insert into public.placements
      (organization_id, project_id, candidate_id, client_id, status, offer_date)
    values (v_org_a, v_proj_a, v_cand_a, v_client_b, 'offered', '2026-03-01');
    raise exception 'INVARIANT-FAIL (2): a cross-org placement client was accepted';
  exception when foreign_key_violation then
    null;
  end;

  ------------------------------------------------------------------------
  -- (3) One level up the chain: a candidate on a foreign mandate.
  ------------------------------------------------------------------------
  begin
    insert into public.candidates (organization_id, project_id, full_name, cv_processing)
    values (v_org_a, v_proj_b, 'Smuggled Candidate', false);
    raise exception 'INVARIANT-FAIL (3): a cross-org candidate was accepted';
  exception when foreign_key_violation then
    null;
  end;

  ------------------------------------------------------------------------
  -- (4) The ordinary write still works. Over-constraining would break the
  -- product just as thoroughly as under-constraining leaves it open.
  ------------------------------------------------------------------------
  insert into public.candidate_notes (organization_id, candidate_id, project_id, content)
  values (v_org_a, v_cand_a, v_proj_a, 'A legitimate note.');

  insert into public.placements
    (id, organization_id, project_id, candidate_id, client_id, status, offer_date)
  values (v_place, v_org_a, v_proj_a, v_cand_a, v_client_a, 'offered', '2026-03-01');

  select count(*) into v_count from public.placements where id = v_place;
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL (4): a legitimate same-org placement was refused';
  end if;

  ------------------------------------------------------------------------
  -- (5) THE ONE THAT MATTERS. `placements.client_id` is ON DELETE SET NULL.
  -- A composite SET NULL would null organization_id too and drop the row
  -- out of RLS entirely — visible to nobody, still in the revenue book.
  ------------------------------------------------------------------------
  delete from public.clients where id = v_client_a;

  select organization_id into v_org from public.placements where id = v_place;

  if v_org is null then
    raise exception 'INVARIANT-FAIL (5): organization_id was nulled by the cascade';
  end if;
  if v_org <> v_org_a then
    raise exception 'INVARIANT-FAIL (5): organization_id changed to %', v_org;
  end if;

  select count(*) into v_count
    from public.placements where id = v_place and client_id is null;
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL (5): client_id was not nulled';
  end if;

  ------------------------------------------------------------------------
  -- (6) CASCADE still cascades: deleting the candidate takes its notes.
  ------------------------------------------------------------------------
  delete from public.candidates where id = v_cand_a;

  select count(*) into v_count
    from public.candidate_notes where candidate_id = v_cand_a;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (6): % notes outlived their candidate', v_count;
  end if;

  ------------------------------------------------------------------------
  -- (7) The global catalogue is still attachable.
  --
  -- All 24 competencies carry a NULL organization_id, which is what makes
  -- them global. Constraining `competency_id` would compare a non-null
  -- child org against a null parent org and reject every row in the
  -- catalogue — so 055 excludes it, and this is the case that says so.
  ------------------------------------------------------------------------
  select id into v_comp from public.executive_competencies
   where organization_id is null limit 1;

  if v_comp is null then
    raise exception 'INVARIANT-FAIL (7): no global competency to test with';
  end if;

  insert into public.executive_searches (id, organization_id, company_name, role_title)
  values (v_search, v_org_a, 'A Bank', 'Chief Risk Officer');

  insert into public.executive_search_competencies
    (organization_id, search_id, competency_id)
  values (v_org_a, v_search, v_comp);

  select count(*) into v_count
    from public.executive_search_competencies where search_id = v_search;
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL (7): a global competency could not be attached';
  end if;

  ------------------------------------------------------------------------
  -- (8) A user can still change organisation after authoring rows.
  --
  -- This is why every `users` reference is excluded. `created_by` is an
  -- attribution, not a scope: constraining it would make moving somebody
  -- between orgs fail against every row they had ever written.
  ------------------------------------------------------------------------
  insert into public.clients (id, organization_id, name, created_by)
  values ('0be0be0b-0000-4000-8000-00000000a070', v_org_a, 'Authored Bank', v_user);

  update public.users set organization_id = v_org_b where id = v_user;

  select organization_id into v_org from public.users where id = v_user;
  if v_org <> v_org_b then
    raise exception 'INVARIANT-FAIL (8): the user could not be moved between orgs';
  end if;

  select count(*) into v_count
    from public.clients where id = '0be0be0b-0000-4000-8000-00000000a070';
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL (8): moving the author destroyed their row';
  end if;

  ------------------------------------------------------------------------
  -- (9) Onboarding still works: a pending account has no org, and
  -- approving it assigns one. A constraint on `users` would have made the
  -- null-org state unreachable.
  ------------------------------------------------------------------------
  update public.users set organization_id = null, status = 'pending' where id = v_user;
  update public.users set organization_id = v_org_a, status = 'active' where id = v_user;

  select organization_id into v_org from public.users where id = v_user;
  if v_org <> v_org_a then
    raise exception 'INVARIANT-FAIL (9): approving a pending account failed';
  end if;

  ------------------------------------------------------------------------
  -- (10) Deleting an organisation still takes its whole tree with it.
  ------------------------------------------------------------------------
  delete from public.organizations where id = v_org_a;

  select count(*) into v_count from public.projects where organization_id = v_org_a;
  if v_count <> 0 then raise exception 'INVARIANT-FAIL (10): % projects survived', v_count; end if;

  select count(*) into v_count from public.clients where organization_id = v_org_a;
  if v_count <> 0 then raise exception 'INVARIANT-FAIL (10): % clients survived', v_count; end if;

  select count(*) into v_count from public.executive_searches where organization_id = v_org_a;
  if v_count <> 0 then raise exception 'INVARIANT-FAIL (10): % searches survived', v_count; end if;

  raise notice 'ALL ORG-PARENT INTEGRITY INVARIANTS PASSED';
end
$checks$;

rollback;
