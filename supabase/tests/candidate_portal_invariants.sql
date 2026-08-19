-- Candidate portal invariants (migration 073: the token door).
--
-- Rolled back. Staff acts run under forged JWTs; the candidate's calls
-- run as `anon` with only the token — the trust shape of the door
-- itself. D8's negatives are the spine.
--
--    1. Issuance is the clients:share tier: the viewer is refused, the
--       recruiter issues, and a second issue returns the SAME link (one
--       live door per person per org), with exactly one issued event.
--    2. The context read: the person as held, and NOTHING else — the
--       returned key set is pinned exactly, so a column added to the
--       RPC without meaning to fails here by name.
--    3. The searches list: both of the org's searches holding the
--       person, the other candidate absent, org B's search absent
--       (D11: two orgs, two links), and the row shape pinned — no
--       client name, no score, no anything.
--    4. The token grants no table reach: as anon, candidates, scores,
--       notes and projects all read zero rows. The RPCs are the whole
--       surface.
--    5. Contact correction lands on EVERY row of the group (the person
--       is one, their rows are many) and writes one attributed-by-label
--       event naming the changed fields.
--    6. Withdrawal moves one search's stage to 'withdrawn' and leaves
--       the other search alone; withdrawing twice refuses; the event
--       carries the candidate row.
--    7. Erasure: one open request per person per org (the second click
--       refuses); the owning org's viewer sees it, the foreign org's
--       staff never; the event lands.
--    8. A revoked link is dead: every RPC refuses. The control run
--       re-creates the validator without the revoked_at check and must
--       abort here — a revoked link that still reads is the fail-open
--       this file exists to prevent.
--
-- On success: NOTICE 'ALL CANDIDATE-PORTAL INVARIANTS PASSED'.

begin;

insert into public.organizations (id, name, slug) values
  ('07300000-0000-4000-8000-0000000000a0', 'Cand Org A', 'cand-org-a'),
  ('07300000-0000-4000-8000-0000000000b0', 'Cand Org B', 'cand-org-b');

insert into auth.users (id, email) values
  ('07300000-0000-4000-8000-0000000000a1', 'cand-recruiter@test.local'),
  ('07300000-0000-4000-8000-0000000000a2', 'cand-viewer@test.local'),
  ('07300000-0000-4000-8000-0000000000b1', 'cand-b-staff@test.local');

update public.users set organization_id = '07300000-0000-4000-8000-0000000000a0',
       status = 'active', role = 'recruiter', full_name = 'Cand Recruiter'
 where id = '07300000-0000-4000-8000-0000000000a1';
update public.users set organization_id = '07300000-0000-4000-8000-0000000000a0',
       status = 'active', role = 'viewer', full_name = 'Cand Viewer'
 where id = '07300000-0000-4000-8000-0000000000a2';
update public.users set organization_id = '07300000-0000-4000-8000-0000000000b0',
       status = 'active', role = 'recruiter', full_name = 'Cand B Staff'
 where id = '07300000-0000-4000-8000-0000000000b1';

insert into public.projects (id, organization_id, title, company_name, one_line_input, status) values
  ('07300000-0000-4000-8000-000000000f01', '07300000-0000-4000-8000-0000000000a0',
   'Chief Technology Officer', 'Confidential Client', 'CTO search', 'active'),
  ('07300000-0000-4000-8000-000000000f02', '07300000-0000-4000-8000-0000000000a0',
   'VP Engineering', 'Confidential Client', 'VPE search', 'active'),
  ('07300000-0000-4000-8000-000000000f03', '07300000-0000-4000-8000-0000000000b0',
   'Head of Data', 'Confidential Client', 'HoD search', 'active');

-- Nell in both of org A's searches (one person, two rows), a second
-- candidate beside her, and the same person in org B (two links, D11).
insert into public.candidates (id, organization_id, project_id, full_name, email, phone, pipeline_stage) values
  ('07300000-0000-4000-8000-000000000c01', '07300000-0000-4000-8000-0000000000a0',
   '07300000-0000-4000-8000-000000000f01', 'Nell Sorven', 'nell@test.local', null, 'shortlisted'),
  ('07300000-0000-4000-8000-000000000c02', '07300000-0000-4000-8000-0000000000a0',
   '07300000-0000-4000-8000-000000000f02', 'Nell Sorven', 'nell@test.local', null, 'found'),
  ('07300000-0000-4000-8000-000000000c03', '07300000-0000-4000-8000-0000000000a0',
   '07300000-0000-4000-8000-000000000f01', 'Other Person', 'other@test.local', null, 'found'),
  ('07300000-0000-4000-8000-000000000c04', '07300000-0000-4000-8000-0000000000b0',
   '07300000-0000-4000-8000-000000000f03', 'Nell Sorven', 'nell@test.local', null, 'found');

-- Data that must stay unreachable through the door.
insert into public.candidate_notes (candidate_id, project_id, organization_id, content)
values ('07300000-0000-4000-8000-000000000c01', '07300000-0000-4000-8000-000000000f01',
        '07300000-0000-4000-8000-0000000000a0', 'SECRET-NOTE: strong but pricey');

delete from public.activity_events
 where organization_id in ('07300000-0000-4000-8000-0000000000a0',
                           '07300000-0000-4000-8000-0000000000b0');

do $checks$
declare
  v_org_a  uuid := '07300000-0000-4000-8000-0000000000a0';
  v_org_b  uuid := '07300000-0000-4000-8000-0000000000b0';
  v_rec    uuid := '07300000-0000-4000-8000-0000000000a1';
  v_view   uuid := '07300000-0000-4000-8000-0000000000a2';
  v_bstaff uuid := '07300000-0000-4000-8000-0000000000b1';
  v_c1     uuid := '07300000-0000-4000-8000-000000000c01';
  v_p1     uuid := '07300000-0000-4000-8000-000000000f01';
  v_p2     uuid := '07300000-0000-4000-8000-000000000f02';
  v_raised boolean;
  v_count  int;
  v_text   text;
  v_token  uuid;
  v_token2 uuid;
  v_tokid  uuid;
  v_keys   text[];
begin
  execute 'set local role authenticated';

  ------------------------------------------------------------------------
  -- (1) Issuance.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_view, 'role', 'authenticated')::text, true);
  v_raised := false;
  begin
    perform public.issue_candidate_portal_token(v_c1);
  exception when insufficient_privilege then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (1): the viewer issued a candidate link';
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_rec, 'role', 'authenticated')::text, true);
  select t.portal_token, t.token_id into v_token, v_tokid
    from public.issue_candidate_portal_token(v_c1) t;
  select t.portal_token into v_token2
    from public.issue_candidate_portal_token(v_c1) t;
  if v_token is distinct from v_token2 then
    raise exception 'INVARIANT-FAIL (1): a second issue minted a second door';
  end if;

  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  select count(*) into v_count from public.activity_events
   where organization_id = v_org_a and event_type = 'candidate_portal_link_issued';
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL (1): % issued events, expected 1', v_count;
  end if;

  ------------------------------------------------------------------------
  -- (2) The context read, shape pinned exactly.
  ------------------------------------------------------------------------
  execute 'set local role anon';
  perform set_config('request.jwt.claims', '', true);

  select array_agg(k order by k) into v_keys
    from (select jsonb_object_keys(to_jsonb(r)) as k
            from public.candidate_portal_context(v_token) r) s;
  if v_keys is distinct from array[
       'current_company','current_title','email','expires_at','github_url',
       'has_cv','identity_basis','linkedin_url','location','notified_at',
       'organization_id','organization_name','person_name','phone','source_kind',
       'source_platform','sourced_at','twitter_url','website_url'] then
    raise exception 'INVARIANT-FAIL (2): context shape drifted: %', v_keys;
  end if;

  select r.person_name || '/' || r.organization_name into v_text
    from public.candidate_portal_context(v_token) r;
  if v_text is distinct from 'Nell Sorven/Cand Org A' then
    raise exception 'INVARIANT-FAIL (2): context reads % — wrong person or org', v_text;
  end if;

  ------------------------------------------------------------------------
  -- (3) The searches list: hers, org A's only, shape pinned.
  ------------------------------------------------------------------------
  select count(*) into v_count from public.candidate_portal_list_searches(v_token);
  if v_count <> 2 then
    raise exception 'INVARIANT-FAIL (3): % searches, expected exactly her 2 in org A', v_count;
  end if;

  -- LIMIT the rows before expanding keys — a LIMIT after the
  -- set-returning jsonb_object_keys keeps one KEY, not one row (this
  -- file's own first run caught it).
  select array_agg(k order by k) into v_keys
    from (select jsonb_object_keys(to_jsonb(r)) as k
            from (select * from public.candidate_portal_list_searches(v_token) limit 1) r) s;
  if v_keys is distinct from array['added_at','project_id','role_title','stage'] then
    raise exception 'INVARIANT-FAIL (3): list shape drifted: %', v_keys;
  end if;

  ------------------------------------------------------------------------
  -- (4) No table reach as anon.
  ------------------------------------------------------------------------
  select count(*) into v_count from public.candidates;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (4): anon reads % candidate rows', v_count;
  end if;
  select count(*) into v_count from public.candidate_notes;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (4): anon reads % candidate notes', v_count;
  end if;
  select count(*) into v_count from public.projects;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (4): anon reads % projects', v_count;
  end if;

  ------------------------------------------------------------------------
  -- (5) Contact correction: every row of the group, one event.
  ------------------------------------------------------------------------
  perform public.candidate_portal_update_contact(
    v_token, p_phone => '+44 20 7946 0000', p_location => 'London');

  execute 'reset role';
  select count(*) into v_count from public.candidates c
   where c.email = 'nell@test.local' and c.organization_id = '07300000-0000-4000-8000-0000000000a0'
     and c.phone = '+44 20 7946 0000' and c.location = 'London';
  if v_count <> 2 then
    raise exception 'INVARIANT-FAIL (5): the correction landed on % of her 2 rows', v_count;
  end if;

  select count(*) into v_count from public.candidates c
   where c.id = '07300000-0000-4000-8000-000000000c04' and c.phone is not null;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (5): the correction leaked into org B''s row';
  end if;

  select count(*) into v_count from public.activity_events
   where organization_id = '07300000-0000-4000-8000-0000000000a0'
     and event_type = 'candidate_self_updated'
     and detail->'fields' ? 'phone';
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL (5): % self-update events, expected 1', v_count;
  end if;
  execute 'set local role anon';

  ------------------------------------------------------------------------
  -- (6) Withdrawal: one search, not the other, never twice.
  ------------------------------------------------------------------------
  perform public.candidate_portal_withdraw(v_token, v_p1);

  v_raised := false;
  begin
    perform public.candidate_portal_withdraw(v_token, v_p1);
  exception when check_violation then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (6): a second withdrawal was accepted';
  end if;

  execute 'reset role';
  select c1.pipeline_stage || '/' || c2.pipeline_stage into v_text
    from public.candidates c1, public.candidates c2
   where c1.id = '07300000-0000-4000-8000-000000000c01'
     and c2.id = '07300000-0000-4000-8000-000000000c02';
  if v_text is distinct from 'withdrawn/found' then
    raise exception 'INVARIANT-FAIL (6): stages read % — expected withdrawn on P1 only', v_text;
  end if;

  select count(*) into v_count from public.activity_events
   where organization_id = '07300000-0000-4000-8000-0000000000a0'
     and event_type = 'candidate_withdrew' and candidate_id = v_c1;
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL (6): % withdrawal events, expected 1', v_count;
  end if;
  execute 'set local role anon';

  ------------------------------------------------------------------------
  -- (7) Erasure: once, visible to the right people.
  ------------------------------------------------------------------------
  perform public.candidate_portal_request_erasure(v_token, 'please remove me');

  v_raised := false;
  begin
    perform public.candidate_portal_request_erasure(v_token, 'again');
  exception when check_violation then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (7): a second open erasure request was accepted';
  end if;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_view, 'role', 'authenticated')::text, true);
  select count(*) into v_count from public.candidate_erasure_requests;
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL (7): the org''s viewer reads % requests, expected 1', v_count;
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_bstaff, 'role', 'authenticated')::text, true);
  select count(*) into v_count from public.candidate_erasure_requests;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (7): foreign staff read % requests, expected 0', v_count;
  end if;

  ------------------------------------------------------------------------
  -- (8) A revoked link is dead — the control run's tripwire.
  ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_rec, 'role', 'authenticated')::text, true);
  perform public.revoke_candidate_portal_token(v_tokid);

  execute 'set local role anon';
  perform set_config('request.jwt.claims', '', true);
  v_raised := false;
  begin
    perform public.candidate_portal_context(v_token);
  exception when no_data_found then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (8): a revoked link still reads';
  end if;

  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);

  raise notice 'ALL CANDIDATE-PORTAL INVARIANTS PASSED';
end
$checks$;

rollback;
