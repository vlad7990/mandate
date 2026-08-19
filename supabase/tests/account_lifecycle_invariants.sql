-- Account lifecycle invariants (migration 070: resend invitation).
--
-- Rolled back; forged-JWT assertions per the house pattern. Refusal
-- kinds are explicit: the RPC raises insufficient_privilege for the
-- wrong principal, check_violation for the wrong state, no_data_found
-- for a missing row.
--
--    1. The authz truth table: the owning org's recruiter and the
--       client's own admin may resend; a viewer, foreign staff,
--       client_hr and a hiring manager may not.
--    2. A resend moves the expiry forward and does NOT rotate the
--       token — same link, fresh clock, by design (D4).
--    3. An accepted invitation refuses: the account exists.
--    4. A revoked invitation refuses: the withdrawal was deliberate,
--       and Revoke must not be undone by a resend button.
--    5. The trail: external_invitation_resent landed in the owning
--       org once per successful resend, with the caller as actor —
--       including the external client_admin (the 068 author-guard
--       extension carrying this slice too).
--
-- On success: NOTICE 'ALL ACCOUNT-LIFECYCLE INVARIANTS PASSED'.

begin;

insert into public.organizations (id, name, slug) values
  ('07a00000-0000-4000-8000-0000000000a0', 'Life Org A', 'life-org-a'),
  ('07a00000-0000-4000-8000-0000000000b0', 'Life Org B', 'life-org-b');

insert into public.clients (id, organization_id, name) values
  ('07a00000-0000-4000-8000-00000000ca01', '07a00000-0000-4000-8000-0000000000a0', 'Life Client');

insert into auth.users (id, email) values
  ('07a00000-0000-4000-8000-0000000000a1', 'life-recruiter@test.local'),
  ('07a00000-0000-4000-8000-0000000000a2', 'life-viewer@test.local'),
  ('07a00000-0000-4000-8000-0000000000b1', 'life-b-recruiter@test.local'),
  ('07a00000-0000-4000-8000-0000000000e1', 'life-cadmin@test.local'),
  ('07a00000-0000-4000-8000-0000000000e2', 'life-chr@test.local'),
  ('07a00000-0000-4000-8000-0000000000e3', 'life-hm@test.local');

update public.users set organization_id = '07a00000-0000-4000-8000-0000000000a0',
       status = 'active', role = 'recruiter', full_name = 'Life Recruiter'
 where id = '07a00000-0000-4000-8000-0000000000a1';
update public.users set organization_id = '07a00000-0000-4000-8000-0000000000a0',
       status = 'active', role = 'viewer', full_name = 'Life Viewer'
 where id = '07a00000-0000-4000-8000-0000000000a2';
update public.users set organization_id = '07a00000-0000-4000-8000-0000000000b0',
       status = 'active', role = 'recruiter', full_name = 'Life B Recruiter'
 where id = '07a00000-0000-4000-8000-0000000000b1';
update public.users set role = 'client_admin', status = 'active',
       client_id = '07a00000-0000-4000-8000-00000000ca01', full_name = 'Life Cadmin'
 where id = '07a00000-0000-4000-8000-0000000000e1';
update public.users set role = 'client_hr', status = 'active',
       client_id = '07a00000-0000-4000-8000-00000000ca01', full_name = 'Life CHR'
 where id = '07a00000-0000-4000-8000-0000000000e2';
update public.users set role = 'hiring_manager', status = 'active',
       client_id = '07a00000-0000-4000-8000-00000000ca01', full_name = 'Life HM'
 where id = '07a00000-0000-4000-8000-0000000000e3';

-- Three invitations: live (short clock, to prove the refresh moves it),
-- accepted, revoked.
insert into public.invitations
  (id, organization_id, client_id, email, full_name, role, expires_at, accepted_at, revoked_at)
values
  ('07a00000-0000-4000-8000-000000000101', '07a00000-0000-4000-8000-0000000000a0',
   '07a00000-0000-4000-8000-00000000ca01', 'life-live@test.local', 'Live Person',
   'client_hr', now() + interval '1 day', null, null),
  ('07a00000-0000-4000-8000-000000000102', '07a00000-0000-4000-8000-0000000000a0',
   '07a00000-0000-4000-8000-00000000ca01', 'life-accepted@test.local', 'Accepted Person',
   'client_hr', now() + interval '14 days', now(), null),
  ('07a00000-0000-4000-8000-000000000103', '07a00000-0000-4000-8000-0000000000a0',
   '07a00000-0000-4000-8000-00000000ca01', 'life-revoked@test.local', 'Revoked Person',
   'client_hr', now() + interval '14 days', null, now());

delete from public.activity_events
 where organization_id in ('07a00000-0000-4000-8000-0000000000a0',
                           '07a00000-0000-4000-8000-0000000000b0');

do $checks$
declare
  v_org_a    uuid := '07a00000-0000-4000-8000-0000000000a0';
  v_rec      uuid := '07a00000-0000-4000-8000-0000000000a1';
  v_view     uuid := '07a00000-0000-4000-8000-0000000000a2';
  v_b_rec    uuid := '07a00000-0000-4000-8000-0000000000b1';
  v_cadmin   uuid := '07a00000-0000-4000-8000-0000000000e1';
  v_chr      uuid := '07a00000-0000-4000-8000-0000000000e2';
  v_hm       uuid := '07a00000-0000-4000-8000-0000000000e3';
  v_live     uuid := '07a00000-0000-4000-8000-000000000101';
  v_accepted uuid := '07a00000-0000-4000-8000-000000000102';
  v_revoked  uuid := '07a00000-0000-4000-8000-000000000103';
  v_raised   boolean;
  v_count    int;
  v_tok_before uuid;
  v_tok_after  uuid;
  v_exp_before timestamptz;
  v_exp_after  timestamptz;
begin
  select i.token, i.expires_at into v_tok_before, v_exp_before
    from public.invitations i where i.id = v_live;

  execute 'set local role authenticated';

  ------------------------------------------------------------------------
  -- (1) The authz truth table — refusals first, then the two who may.
  ------------------------------------------------------------------------
  declare
    v_who uuid;
  begin
    foreach v_who in array array[v_view, v_b_rec, v_chr, v_hm] loop
      perform set_config('request.jwt.claims',
        json_build_object('sub', v_who, 'role', 'authenticated')::text, true);
      v_raised := false;
      begin
        perform public.resend_external_invitation(v_live);
      exception when insufficient_privilege then v_raised := true; end;
      if not v_raised then
        raise exception 'INVARIANT-FAIL (1): % resent an invitation without the tier', v_who;
      end if;
    end loop;
  end;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_rec, 'role', 'authenticated')::text, true);
  perform public.resend_external_invitation(v_live);

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_cadmin, 'role', 'authenticated')::text, true);
  perform public.resend_external_invitation(v_live);

  ------------------------------------------------------------------------
  -- (2) Fresh clock, same token.
  ------------------------------------------------------------------------
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);

  select i.token, i.expires_at into v_tok_after, v_exp_after
    from public.invitations i where i.id = v_live;

  if v_exp_after <= v_exp_before then
    raise exception 'INVARIANT-FAIL (2): resend did not move the expiry (% -> %)',
      v_exp_before, v_exp_after;
  end if;
  if v_tok_after is distinct from v_tok_before then
    raise exception 'INVARIANT-FAIL (2): resend rotated the token';
  end if;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_rec, 'role', 'authenticated')::text, true);

  ------------------------------------------------------------------------
  -- (3) Accepted refuses.
  ------------------------------------------------------------------------
  v_raised := false;
  begin
    perform public.resend_external_invitation(v_accepted);
  exception when check_violation then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (3): an accepted invitation was resent';
  end if;

  ------------------------------------------------------------------------
  -- (4) Revoked refuses — Revoke must stay revoked.
  ------------------------------------------------------------------------
  v_raised := false;
  begin
    perform public.resend_external_invitation(v_revoked);
  exception when check_violation then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (4): a revoked invitation was revived by resend';
  end if;

  ------------------------------------------------------------------------
  -- (5) The trail, read privileged: one event per successful resend,
  --     each with its caller as actor — the client_admin included.
  ------------------------------------------------------------------------
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);

  select count(*) into v_count from public.activity_events
   where organization_id = v_org_a
     and event_type = 'external_invitation_resent'
     and actor_id is not null;
  if v_count <> 2 then
    raise exception 'INVARIANT-FAIL (5): % resent events with actors, expected 2', v_count;
  end if;

  select count(*) into v_count from public.activity_events
   where organization_id = v_org_a
     and event_type = 'external_invitation_resent'
     and actor_id = v_cadmin;
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL (5): the client_admin''s resend left no attributed event';
  end if;

  raise notice 'ALL ACCOUNT-LIFECYCLE INVARIANTS PASSED';
end
$checks$;

rollback;
