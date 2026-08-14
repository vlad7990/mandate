-- Global catalogue invariants (migration 056).
--
-- Rolled back. The constraint cases run as a privileged role — a constraint
-- that only held for `authenticated` would be no constraint at all — and the
-- one RLS case switches roles explicitly and says so.
--
-- 056 replaced "global means a NULL `organization_id`" with an explicit
-- `is_global` flag, so the two relationships 055 had to exclude could finally
-- be constrained. The rule is a disjunction — *the competency is either
-- global, or owned by this row's own organisation* — which takes two foreign
-- keys and a generated column, so it is worth testing every branch rather
-- than reading the keys.
--
--    1. The flag and the null cannot disagree: global-with-an-owner and
--       private-with-nobody are both refused.
--    2. A global competency attaches to any org's search.
--    3. An org's own private competency attaches to its own search.
--    4. Another org's private competency does NOT — the hole 056 closes.
--    5. ...and it was genuinely open before: RLS hid the row from reads while
--       the insert went through. Recorded here as the reason this exists.
--    6. Lying about the tier does not help in either direction: claiming
--       `is_global` for a private competency is refused by the tier key, and
--       claiming private for a global one is refused by the org key.
--    7. The same rule holds for role templates on `executive_searches`.
--    8. A search with no template is unaffected — both keys skip on NULL.
--    9. A competency in use cannot be reclassified between tiers.
--   10. Deleting a global competency still cascades its search rows away.
--
-- On success: NOTICE 'ALL GLOBAL CATALOGUE INVARIANTS PASSED'.

begin;

insert into public.organizations (id, name, slug) values
  ('0be0be0b-0000-4000-8000-0000000000d1', 'Catalogue Org A', 'catalogue-org-a'),
  ('0be0be0b-0000-4000-8000-0000000000d2', 'Catalogue Org B', 'catalogue-org-b');

insert into auth.users (id, email) values
  ('0be0be0b-0000-4000-8000-0000000000d3', 'catalogue-a@test.local');

update public.users
   set organization_id = '0be0be0b-0000-4000-8000-0000000000d1',
       status = 'active', role = 'admin', full_name = 'Catalogue Admin'
 where id = '0be0be0b-0000-4000-8000-0000000000d3';

-- One private competency per org, and a private template for org B.
insert into public.executive_competencies
  (id, organization_id, is_global, key, name, category, definition) values
  ('0be0be0b-0000-4000-8000-0000000000d4', '0be0be0b-0000-4000-8000-0000000000d2', false,
   'b-private', 'B Private Competency', 'leadership', 'Org B intellectual property.'),
  ('0be0be0b-0000-4000-8000-0000000000d5', '0be0be0b-0000-4000-8000-0000000000d1', false,
   'a-private', 'A Private Competency', 'leadership', 'Org A intellectual property.');

insert into public.executive_role_templates
  (id, organization_id, is_global, key, title) values
  ('0be0be0b-0000-4000-8000-0000000000d6', '0be0be0b-0000-4000-8000-0000000000d2', false,
   'b-template', 'B Private Template');

insert into public.executive_searches (id, organization_id, company_name, role_title) values
  ('0be0be0b-0000-4000-8000-0000000000d7', '0be0be0b-0000-4000-8000-0000000000d1', 'A Co', 'CTO');

do $checks$
declare
  v_org_a   uuid := '0be0be0b-0000-4000-8000-0000000000d1';
  v_org_b   uuid := '0be0be0b-0000-4000-8000-0000000000d2';
  v_b_comp  uuid := '0be0be0b-0000-4000-8000-0000000000d4';
  v_a_comp  uuid := '0be0be0b-0000-4000-8000-0000000000d5';
  v_b_tmpl  uuid := '0be0be0b-0000-4000-8000-0000000000d6';
  v_search  uuid := '0be0be0b-0000-4000-8000-0000000000d7';
  v_g1      uuid;
  v_g2      uuid;
  v_count   int;
begin
  select id into v_g1 from public.executive_competencies where is_global order by key limit 1;
  select id into v_g2 from public.executive_competencies where is_global order by key offset 1 limit 1;
  if v_g1 is null or v_g2 is null then
    raise exception 'INVARIANT-FAIL: fewer than two global competencies to test with';
  end if;

  ------------------------------------------------------------------------
  -- (1) The flag and the null cannot disagree.
  ------------------------------------------------------------------------
  begin
    insert into public.executive_competencies
      (organization_id, is_global, key, name, category, definition)
    values (v_org_a, true, 'bad-1', 'Global With Owner', 'leadership', 'x');
    raise exception 'INVARIANT-FAIL (1): a global competency with an owner was accepted';
  exception when check_violation then null; end;

  begin
    insert into public.executive_competencies
      (organization_id, is_global, key, name, category, definition)
    values (null, false, 'bad-2', 'Private With Nobody', 'leadership', 'x');
    raise exception 'INVARIANT-FAIL (1): a private competency with no owner was accepted';
  exception when check_violation then null; end;

  ------------------------------------------------------------------------
  -- (2) A global competency attaches.
  ------------------------------------------------------------------------
  insert into public.executive_search_competencies
    (organization_id, search_id, competency_id, competency_is_global)
  values (v_org_a, v_search, v_g1, true);

  ------------------------------------------------------------------------
  -- (3) The org's own private competency attaches.
  ------------------------------------------------------------------------
  insert into public.executive_search_competencies
    (organization_id, search_id, competency_id, competency_is_global)
  values (v_org_a, v_search, v_a_comp, false);

  ------------------------------------------------------------------------
  -- (4) Another org's private competency does not. This is the hole.
  ------------------------------------------------------------------------
  begin
    insert into public.executive_search_competencies
      (organization_id, search_id, competency_id, competency_is_global)
    values (v_org_a, v_search, v_b_comp, false);
    raise exception 'INVARIANT-FAIL (4): org A attached org B private competency';
  exception when foreign_key_violation then null; end;

  ------------------------------------------------------------------------
  -- (6) Lying about the tier fails in both directions.
  --
  -- Claiming global for a private competency is caught by the tier key;
  -- claiming private for a global one is caught by the org key. Neither
  -- alone is sufficient, which is why there are two.
  ------------------------------------------------------------------------
  begin
    insert into public.executive_search_competencies
      (organization_id, search_id, competency_id, competency_is_global)
    values (v_org_a, v_search, v_b_comp, true);
    raise exception 'INVARIANT-FAIL (6): claiming global smuggled a private competency in';
  exception when foreign_key_violation then null; end;

  begin
    insert into public.executive_search_competencies
      (organization_id, search_id, competency_id, competency_is_global)
    values (v_org_a, v_search, v_g2, false);
    raise exception 'INVARIANT-FAIL (6): a global competency was accepted as org-private';
  exception when foreign_key_violation then null; end;

  -- Only the two legitimate rows survived.
  select count(*) into v_count
    from public.executive_search_competencies where search_id = v_search;
  if v_count <> 2 then
    raise exception 'INVARIANT-FAIL (2,3): expected 2 legitimate rows, got %', v_count;
  end if;

  ------------------------------------------------------------------------
  -- (5) The RLS asymmetry that made this worth fixing: org A could never
  -- *read* org B's private competency, and could still name it. The read
  -- half is checked as the real role; the write half is (4) above.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub','0be0be0b-0000-4000-8000-0000000000d3',
                      'role','authenticated')::text, true);
  execute 'set local role authenticated';

  select count(*) into v_count
    from public.executive_competencies where id = v_b_comp;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (5): org A can read org B private competency';
  end if;

  select count(*) into v_count
    from public.executive_competencies where id = v_a_comp;
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL (5): org A cannot read its own competency';
  end if;

  reset role;

  ------------------------------------------------------------------------
  -- (7) Templates, same rule.
  ------------------------------------------------------------------------
  begin
    update public.executive_searches
       set template_id = v_b_tmpl, template_is_global = false
     where id = v_search;
    raise exception 'INVARIANT-FAIL (7): a search took another org private template';
  exception when foreign_key_violation then null; end;

  ------------------------------------------------------------------------
  -- (8) No template is unaffected — both keys skip on a NULL id.
  ------------------------------------------------------------------------
  update public.executive_searches
     set template_id = null, template_is_global = false
   where id = v_search;

  select count(*) into v_count
    from public.executive_searches where id = v_search and template_id is null;
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL (8): a templateless search was refused';
  end if;

  ------------------------------------------------------------------------
  -- (9) A competency in use cannot be reclassified.
  --
  -- The tier key references `is_global`, so promoting or demoting a
  -- competency that searches already weight is refused. Correct — it would
  -- silently change who may see that search's competency list — but it
  -- means publishing a private competency is copy-and-repoint, not UPDATE.
  ------------------------------------------------------------------------
  begin
    update public.executive_competencies
       set is_global = true, organization_id = null
     where id = v_a_comp;
    raise exception 'INVARIANT-FAIL (9): an in-use competency was reclassified';
  exception when foreign_key_violation then null; end;

  ------------------------------------------------------------------------
  -- (10) Deleting a competency still cascades its search rows.
  ------------------------------------------------------------------------
  delete from public.executive_competencies where id = v_a_comp;

  select count(*) into v_count
    from public.executive_search_competencies where competency_id = v_a_comp;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (10): % search rows outlived their competency', v_count;
  end if;

  raise notice 'ALL GLOBAL CATALOGUE INVARIANTS PASSED';
end
$checks$;

rollback;
