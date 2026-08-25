-- 112 — PLATFORM AGENTS, the trail (F-1 fix, part two — same ruling as 111)
--
-- 111 re-anchored the agent policies and taught record_agent_event to file
-- events under the SUBJECT's organization. Drive 0fb then proved the parse
-- persists cross-org — and that the trail write still died, silently, in
-- write_activity_event's WARNING catch: guard_author_in_org (057) refuses
-- any author who is not a member of the event's organization, and the agent
-- principals are members of Mandate HQ only.
--
-- The guard was right for humans and stays right for humans. It gains ONE
-- exception, the same one 111 named: an ACTIVE agent principal is the
-- platform's workforce and may author any organization's trail — under its
-- own face, with the kill switch still honoured (a suspended agent's row
-- fails the status test and is refused like anyone else).

create or replace function public.guard_author_in_org()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_new       jsonb := to_jsonb(new);
  v_old       jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else null end;
  v_org       uuid  := (v_new->>'organization_id')::uuid;
  v_col       text;
  v_author    uuid;
  v_author_org uuid;
  v_author_client uuid;
  v_founder   boolean;
  v_role      text;
  v_status    text;
  v_found     boolean;
begin
  if v_org is null then
    return new;
  end if;

  foreach v_col in array tg_argv loop
    if v_old is not null
       and (v_old->>v_col) is not distinct from (v_new->>v_col) then
      continue;
    end if;

    v_author := (v_new->>v_col)::uuid;
    if v_author is null then
      continue;
    end if;

    select u.organization_id, u.client_id, u.is_founder, u.role, u.status, true
      into v_author_org, v_author_client, v_founder, v_role, v_status, v_found
      from public.users u
     where u.id = v_author;

    if not coalesce(v_found, false) then
      continue;
    end if;

    if coalesce(v_founder, false) then
      continue;
    end if;

    -- Platform workforce (111's ruling): an ACTIVE agent authors any org's
    -- trail. A suspended agent falls through to the membership test and is
    -- refused — the kill switch keeps its reach.
    if v_role = 'agent' and v_status = 'active' then
      continue;
    end if;

    if v_author_client is not null
       and public.client_org(v_author_client) = v_org then
      continue;
    end if;

    if v_author_org is distinct from v_org then
      raise exception
        '%.% names %, who is not a member of organisation %',
        tg_table_name, v_col, v_author, v_org
        using errcode = 'foreign_key_violation';
    end if;
  end loop;

  return new;
end;
$$;

-- The 057/068/110 pattern re-asserted: trigger functions hold no session grants.
revoke all on function public.guard_author_in_org() from public, anon, authenticated;
