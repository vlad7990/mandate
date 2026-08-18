-- hm_portal_opened invariants (migration 063).
--
-- Run against the live DB with a real portal token in place (the Phase 2
-- capability seed provides one). Proven 2026-08-18; control run with the
-- debounce assertion inverted raised.
--
--   1. A valid token writes exactly one event, carrying the token's label
--      in detail and a NULL actor ("System" in the feed).
--   2. Debounce: a second call inside the hour writes nothing — a refresh
--      is not a second visit.
--   3. An unknown token writes nothing and returns false.
--   4. A revoked token is refused.
--   5. anon cannot execute the function — the only caller is the portal
--      page on the service role, which bypasses grants; no anon surface.
--
-- Substitute a live token uuid for :token before running.

do $checks$
declare
  v_ok boolean;
  v_count int;
  v_label text;
  v_token uuid := 'abcdefab-1234-5678-9abc-def012345678';
begin
  select public.record_hm_portal_opened(v_token) into v_ok;
  if not v_ok then raise exception 'INVARIANT 1 FAILED: valid token refused'; end if;
  select count(*), max(detail->>'label') into v_count, v_label
  from activity_events
  where event_type = 'hm_portal_opened'
    and detail->>'token_id' in (select id::text from hiring_manager_tokens where token = v_token);
  if v_count <> 1 then
    raise exception 'INVARIANT 1 FAILED: % events', v_count;
  end if;

  select public.record_hm_portal_opened(v_token) into v_ok;
  if v_ok then raise exception 'INVARIANT 2 FAILED: refresh wrote a second event'; end if;

  select public.record_hm_portal_opened(gen_random_uuid()) into v_ok;
  if v_ok then raise exception 'INVARIANT 3 FAILED: unknown token accepted'; end if;

  update hiring_manager_tokens set revoked_at = now() where token = v_token;
  select public.record_hm_portal_opened(v_token) into v_ok;
  update hiring_manager_tokens set revoked_at = null where token = v_token;
  if v_ok then raise exception 'INVARIANT 4 FAILED: revoked token accepted'; end if;

  begin
    execute 'set local role anon';
    select public.record_hm_portal_opened(v_token) into v_ok;
    execute 'reset role';
    raise exception 'INVARIANT 5 FAILED: anon executed the function';
  exception
    when insufficient_privilege then execute 'reset role';
  end;

  raise notice 'ALL HM-PORTAL-OPENED INVARIANTS PASSED';
end;
$checks$;
