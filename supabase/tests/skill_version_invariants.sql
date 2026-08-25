-- Skill-version invariants (migration 103: the append-only history,
-- fed by the data layer — no app code has to remember, so none can
-- forget).
--
-- Rolled back; forged-JWT assertions per the house pattern:
--
--    1. CREATE produces v1 ('created', actor-stamped with the
--       label); UPDATE produces v2 preserving the NEW text while v1
--       keeps the OLD — the prior behavior is reconstructable.
--    2. Pause and reactivate are historically reconstructable: v3
--       carries is_active false, v4 true.
--    3. APPEND-ONLY: the admin's UPDATE and DELETE on a snapshot
--       land nowhere (no policy exists for anyone).
--    4. Deleting the current skill DELETES NOTHING of its history —
--       the four versions survive the row.
--    5. Boundaries: a second org's admin reads ZERO of org A's
--       versions; the AGENT reads zero (history is not its input —
--       it reads the active skill through 074's grant).
--
-- On success: NOTICE 'ALL SKILL-VERSION INVARIANTS PASSED'.
--
-- Control run (2026-08-25): the trigger DROPPED in-transaction ("the
-- app records versions anyway") — the admin's edit produced NO v2,
-- the prior text became unrecoverable, and the harness aborted at
-- INVARIANT-FAIL (1); drift and harness in ONE transaction, the
-- abort rolling the drop back.

begin;

insert into public.organizations (id, name, slug) values
  ('01030000-0000-4000-8000-0000000000a0', 'SV Org A', 'sv-org-a'),
  ('01030000-0000-4000-8000-0000000000b0', 'SV Org B', 'sv-org-b');

insert into auth.users (id, email) values
  ('01030000-0000-4000-8000-0000000000a1', 'sv-admin-a@test.local'),
  ('01030000-0000-4000-8000-0000000000b1', 'sv-admin-b@test.local'),
  ('01030000-0000-4000-8000-0000000000ab', 'sv-agent@test.local');

update public.users set organization_id = '01030000-0000-4000-8000-0000000000a0',
       status = 'active', role = 'admin', full_name = 'SV Admin A'
 where id = '01030000-0000-4000-8000-0000000000a1';
update public.users set organization_id = '01030000-0000-4000-8000-0000000000b0',
       status = 'active', role = 'admin', full_name = 'SV Admin B'
 where id = '01030000-0000-4000-8000-0000000000b1';
update public.users set organization_id = '01030000-0000-4000-8000-0000000000a0',
       status = 'active', role = 'agent', full_name = 'SV Agent'
 where id = '01030000-0000-4000-8000-0000000000ab';

do $checks$
declare
  v_admin_a uuid := '01030000-0000-4000-8000-0000000000a1';
  v_admin_b uuid := '01030000-0000-4000-8000-0000000000b1';
  v_agent   uuid := '01030000-0000-4000-8000-0000000000ab';
  v_org_a   uuid := '01030000-0000-4000-8000-0000000000a0';
  v_skill   uuid;
  v_count   int;
  v_text    text;
  v_uuid    uuid;
  v_bool    boolean;
begin
  execute 'set local role authenticated';

  ------------------------------------------------------------------------
  -- (1) v1 on create, v2 on edit; the OLD text survives on v1.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_admin_a, 'role', 'authenticated')::text, true);
  insert into public.skills
    (organization_id, created_by, name, description, skill_type,
     trigger_conditions, instructions, is_active)
  values
    (v_org_a, v_admin_a, 'SV Probe Skill', 'harness', 'search_skill',
     'always', 'FIRST WORDING (harness)', true)
  returning id into v_skill;

  update public.skills
     set instructions = 'SECOND WORDING (harness)', updated_at = now()
   where id = v_skill;

  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);

  select count(*) into v_count from public.skill_versions where skill_id = v_skill;
  if v_count <> 2 then
    raise exception 'INVARIANT-FAIL (1): % of 2 versions exist — the prior text is unrecoverable', v_count;
  end if;
  select instructions into v_text from public.skill_versions
   where skill_id = v_skill and version = 1;
  if v_text is distinct from 'FIRST WORDING (harness)' then
    raise exception 'INVARIANT-FAIL (1): v1 lost the original wording (%)', v_text;
  end if;
  select instructions into v_text from public.skill_versions
   where skill_id = v_skill and version = 2;
  if v_text is distinct from 'SECOND WORDING (harness)' then
    raise exception 'INVARIANT-FAIL (1): v2 does not carry the edit (%)', v_text;
  end if;
  select changed_by, changed_by_label into v_uuid, v_text
    from public.skill_versions where skill_id = v_skill and version = 1;
  if v_uuid is distinct from v_admin_a or v_text is distinct from 'SV Admin A' then
    raise exception 'INVARIANT-FAIL (1): the version wears the wrong face (% / %)', v_uuid, v_text;
  end if;
  select change_kind into v_text from public.skill_versions
   where skill_id = v_skill and version = 1;
  if v_text is distinct from 'created' then
    raise exception 'INVARIANT-FAIL (1): v1 is not marked created (%)', v_text;
  end if;
  execute 'set local role authenticated';

  ------------------------------------------------------------------------
  -- (2) Pause and reactivate are reconstructable.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_admin_a, 'role', 'authenticated')::text, true);
  update public.skills set is_active = false, updated_at = now() where id = v_skill;
  update public.skills set is_active = true,  updated_at = now() where id = v_skill;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  select is_active into v_bool from public.skill_versions
   where skill_id = v_skill and version = 3;
  if v_bool then
    raise exception 'INVARIANT-FAIL (2): the pause is not reconstructable';
  end if;
  select is_active into v_bool from public.skill_versions
   where skill_id = v_skill and version = 4;
  if not v_bool then
    raise exception 'INVARIANT-FAIL (2): the reactivation is not reconstructable';
  end if;
  execute 'set local role authenticated';

  ------------------------------------------------------------------------
  -- (3) APPEND-ONLY: the admin's rewrite and delete land nowhere.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_admin_a, 'role', 'authenticated')::text, true);
  update public.skill_versions
     set instructions = 'REWRITTEN HISTORY' where skill_id = v_skill;
  delete from public.skill_versions where skill_id = v_skill;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  select count(*) into v_count from public.skill_versions
   where skill_id = v_skill and instructions = 'REWRITTEN HISTORY';
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (3): history was REWRITTEN';
  end if;
  select count(*) into v_count from public.skill_versions where skill_id = v_skill;
  if v_count <> 4 then
    raise exception 'INVARIANT-FAIL (3): history was DELETED (% of 4 remain)', v_count;
  end if;
  execute 'set local role authenticated';

  ------------------------------------------------------------------------
  -- (4) Deleting the skill deletes NOTHING of its history.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_admin_a, 'role', 'authenticated')::text, true);
  delete from public.skills where id = v_skill;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  select count(*) into v_count from public.skills where id = v_skill;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (4): the skill row survived its deletion';
  end if;
  select count(*) into v_count from public.skill_versions where skill_id = v_skill;
  if v_count <> 4 then
    raise exception 'INVARIANT-FAIL (4): deletion took the history with it (% of 4 remain)', v_count;
  end if;
  execute 'set local role authenticated';

  ------------------------------------------------------------------------
  -- (5) Boundaries: org B reads zero; the agent reads zero.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_admin_b, 'role', 'authenticated')::text, true);
  select count(*) into v_count from public.skill_versions
   where organization_id = v_org_a;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (5): org B reads % of org A''s versions', v_count;
  end if;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_agent, 'role', 'authenticated')::text, true);
  select count(*) into v_count from public.skill_versions;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (5): the AGENT reads % versions', v_count;
  end if;

  raise notice 'ALL SKILL-VERSION INVARIANTS PASSED';
end
$checks$;

rollback;
