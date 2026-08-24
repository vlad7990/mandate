-- Rate-limit invariants (migration 088 — 061 generalised: caps as
-- data, one SECURITY DEFINER function, zero-policy RLS, pre-hashed
-- keys).
--
-- Rolled back; the house harness pattern. This file pins the
-- limiter's five load-bearing properties:
--
--    1. The per-key window counts and refuses at the boundary: three
--       allowed under a limit of three, the fourth refused with
--       reason 'key' and an honest retry_after bounded by the window.
--    2. The window is a DELETE, not arithmetic: removing the bucket
--       row (exactly what expiry's prune does) re-admits the key —
--       and the opportunistic prune removes an expired row on the
--       next check, whoever's it was.
--    3. THE GLOBAL PIN — THE control-run tripwire: once the scope's
--       day is spent, a FRESH key is refused with reason 'global'.
--       The drift this control performs is the "helpful"
--       simplification that removes the global branch ("per-key
--       already limits everyone") — under it, a caller with many IPs
--       has NO ceiling and the spend is unbounded, which is the
--       exact hole 061 was built to close.
--    4. The boundary of the mechanism itself: an unknown scope
--       RAISES (a typo'd scope must route through the app's D3 fail
--       mode, not silently refuse); both tables answer ZERO rows to
--       authenticated and anon (the zero-policy pin), and a direct
--       INSERT is refused — the function is the entire API.
--    5. /api/demo's numbers survived the migration byte-for-byte
--       (10/hr/IP, 200/day) and the compat wrapper still answers in
--       the old vocabulary ('ok'/'ip'/'global').
--
-- On success: NOTICE 'ALL RATE-LIMIT INVARIANTS PASSED'.
--
-- Control run (2026-08-24, verified): check_rate_limit re-created
-- WITHOUT the global-cap branch. The fresh key's check LANDED with
-- the day already spent and the harness aborted at INVARIANT-FAIL
-- (3) — "the spend is unbounded"; drift and harness ran in one
-- transaction, so the abort itself rolled the rebuild back —
-- residue-free by construction, the live function verified to carry
-- the global branch after.

begin;

-- A scratch scope with caps small enough to exhaust by hand.
insert into public.rate_limit_policy (scope, per_key_limit, window_seconds, global_daily_limit)
values ('hz_test', 3, 3600, 5);

do $checks$
declare
  v_allowed  boolean;
  v_reason   text;
  v_retry    integer;
  v_count    int;
  v_raised   boolean;
  i          int;
begin
  execute 'set local role authenticated';

  ------------------------------------------------------------------------
  -- (1) The per-key window: three land, the fourth is refused.
  ------------------------------------------------------------------------
  for i in 1..3 loop
    select r.allowed, r.reason into v_allowed, v_reason
      from public.check_rate_limit('hz_test', 'hash-k1') r;
    if not v_allowed then
      raise exception 'INVARIANT-FAIL (1): call % of 3 was refused (%) under a limit of 3', i, v_reason;
    end if;
  end loop;

  select r.allowed, r.reason, r.retry_after_seconds
    into v_allowed, v_reason, v_retry
    from public.check_rate_limit('hz_test', 'hash-k1') r;
  if v_allowed or v_reason is distinct from 'key' then
    raise exception 'INVARIANT-FAIL (1): the fourth call was not refused by the per-key cap (allowed %, reason %)', v_allowed, v_reason;
  end if;
  if v_retry < 1 or v_retry > 3600 then
    raise exception 'INVARIANT-FAIL (1): retry_after % is not an honest window remainder', v_retry;
  end if;

  ------------------------------------------------------------------------
  -- (2) The window is a delete. Remove k1's bucket (what expiry does)
  --     and the key is re-admitted; plant an expired row and the next
  --     check prunes it.
  ------------------------------------------------------------------------
  execute 'reset role';
  delete from public.rate_limit
   where bucket_key like 'hz_test:hash-k1:%';
  insert into public.rate_limit (bucket_key, count, expires_at)
  values ('hz_test:hash-expired:0', 3, now() - interval '1 hour');
  execute 'set local role authenticated';

  select r.allowed into v_allowed
    from public.check_rate_limit('hz_test', 'hash-k1') r;
  if not v_allowed then
    raise exception 'INVARIANT-FAIL (2): the key was still refused after its bucket expired — the window did not roll';
  end if;

  execute 'reset role';
  select count(*) into v_count from public.rate_limit
   where bucket_key = 'hz_test:hash-expired:0';
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (2): the expired bucket survived the next check — the prune is gone';
  end if;
  execute 'set local role authenticated';

  ------------------------------------------------------------------------
  -- (3) THE GLOBAL PIN. The day is spent (global count now 5); a
  --     FRESH key must be refused with reason 'global'. The control
  --     tripwire: with the global branch dropped, this check LANDS
  --     and the spend is unbounded.
  ------------------------------------------------------------------------
  select r.allowed, r.reason, r.retry_after_seconds
    into v_allowed, v_reason, v_retry
    from public.check_rate_limit('hz_test', 'hash-fresh-key') r;
  if v_allowed or v_reason is distinct from 'global' then
    raise exception 'INVARIANT-FAIL (3): a fresh key was served with the scope''s day spent (allowed %, reason %) — THE SPEND IS UNBOUNDED: the global branch is gone and rotating keys defeats the limiter', v_allowed, v_reason;
  end if;
  if v_retry < 1 or v_retry > 86400 then
    raise exception 'INVARIANT-FAIL (3): the global retry_after % is not an honest until-midnight remainder', v_retry;
  end if;

  ------------------------------------------------------------------------
  -- (4) The mechanism's own boundary: unknown scope raises; both
  --     tables answer zero to authenticated AND anon; the direct
  --     INSERT is refused.
  ------------------------------------------------------------------------
  v_raised := false;
  begin
    perform public.check_rate_limit('hz_no_such_scope', 'k');
  exception when others then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (4): an unknown scope was answered rather than raised — a typo''d door would silently bypass the app''s fail-mode split';
  end if;

  select count(*) into v_count from public.rate_limit;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (4): authenticated reads % rate_limit rows (zero-policy pin)', v_count;
  end if;
  select count(*) into v_count from public.rate_limit_policy;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (4): authenticated reads % rate_limit_policy rows (zero-policy pin)', v_count;
  end if;
  v_raised := false;
  begin
    insert into public.rate_limit (bucket_key, count, expires_at)
    values ('forged:bucket:0', 999, now() + interval '1 day');
  exception when others then v_raised := true; end;
  if not v_raised then
    raise exception 'INVARIANT-FAIL (4): authenticated wrote a counter directly — the function is no longer the entire API';
  end if;

  execute 'reset role';
  execute 'set local role anon';
  select count(*) into v_count from public.rate_limit;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (4): anon reads % rate_limit rows', v_count;
  end if;
  select count(*) into v_count from public.rate_limit_policy;
  if v_count <> 0 then
    raise exception 'INVARIANT-FAIL (4): anon reads % policy rows', v_count;
  end if;
  execute 'reset role';
  execute 'set local role authenticated';

  ------------------------------------------------------------------------
  -- (5) /api/demo survived the migration: the caps are byte-for-byte
  --     061's, and the wrapper answers in the old vocabulary.
  ------------------------------------------------------------------------
  execute 'reset role';
  select count(*) into v_count from public.rate_limit_policy
   where scope = 'demo_ip' and per_key_limit = 10
     and window_seconds = 3600 and global_daily_limit = 200;
  if v_count <> 1 then
    raise exception 'INVARIANT-FAIL (5): demo_ip''s caps are not 061''s (10/hr, 200/day)';
  end if;
  execute 'set local role authenticated';

  select r.allowed, r.scope into v_allowed, v_reason
    from public.check_demo_rate_limit('hz-probe-ip') r;
  if not v_allowed or v_reason is distinct from 'ok' then
    raise exception 'INVARIANT-FAIL (5): the compat wrapper did not answer ok (allowed %, scope %)', v_allowed, v_reason;
  end if;

  raise notice 'ALL RATE-LIMIT INVARIANTS PASSED';
end
$checks$;

rollback;
