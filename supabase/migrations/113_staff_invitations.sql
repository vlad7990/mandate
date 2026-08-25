-- 113 — STAFF INVITATIONS (admin member management, gate confirmed §134/§135)
--
-- The invitation shape COPIED from the external family (invitations, 068),
-- never shared — invitations.client_id is NOT NULL, that table is
-- structurally external and stays closed. Staff vocabulary only; the CHECK
-- excludes 'agent' and every external role by whitelist.
--
-- Issuance and revocation are RLS-anchored writes from the admin's own
-- session (org-match + is_org_admin(), an anchored policy per §126 R2's
-- law). Two definer doors only:
--   * verify_staff_invitation — the anon token door: the TWELFTH named
--     load-bearing anon grant. The /join/[token] visitor has no account by
--     definition; the uuid is the only credential. DO NOT "fix" this grant
--     in any future sweep.
--   * redeem_staff_invitation — SERVICE-ROLE-ONLY (the redeem_invitation
--     precedent): stamps the users row org+role+ACTIVE and spends the
--     token. The invite IS the approval (R1) — redeemed staff never touch
--     the /ops pending queue.

create table public.staff_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  email_key text generated always as (lower(btrim(email))) stored,
  full_name text not null,
  role text not null check (role in ('admin','manager','recruiter','researcher','viewer')),
  token uuid not null unique default gen_random_uuid(),
  invited_by uuid references public.users(id) on delete set null,
  invited_by_label text,
  expires_at timestamptz not null default now() + interval '14 days',
  revoked_at timestamptz,
  accepted_at timestamptz,
  accepted_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One LIVE invitation per address per organisation.
create unique index staff_invitations_live_email_idx
  on public.staff_invitations (organization_id, email_key)
  where revoked_at is null and accepted_at is null;
create index staff_invitations_org_idx on public.staff_invitations (organization_id);
create index staff_invitations_invited_by_idx on public.staff_invitations (invited_by);
create index staff_invitations_accepted_user_idx on public.staff_invitations (accepted_user_id);

alter table public.staff_invitations enable row level security;

create policy staff_invitations_admin_select on public.staff_invitations
  for select to authenticated
  using (
    organization_id = (select current_user_org_id())
    and ((select is_org_admin()) or (select is_current_user_founder()))
  );

create policy staff_invitations_admin_insert on public.staff_invitations
  for insert to authenticated
  with check (
    organization_id = (select current_user_org_id())
    and ((select is_org_admin()) or (select is_current_user_founder()))
    and invited_by = (select auth.uid())
  );

create policy staff_invitations_admin_update on public.staff_invitations
  for update to authenticated
  using (
    organization_id = (select current_user_org_id())
    and ((select is_org_admin()) or (select is_current_user_founder()))
  )
  with check (
    organization_id = (select current_user_org_id())
    and ((select is_org_admin()) or (select is_current_user_founder()))
  );

-- ── The anon token door (LOAD-BEARING anon grant #12) ───────────────────
create or replace function public.verify_staff_invitation(p_token uuid)
returns table (
  email text,
  full_name text,
  role text,
  organization_name text,
  invited_by_label text,
  expires_at timestamptz
)
language sql
security definer
set search_path to 'public'
as $$
  select i.email, i.full_name, i.role, o.name as organization_name,
         coalesce(i.invited_by_label, '') as invited_by_label, i.expires_at
    from public.staff_invitations i
    join public.organizations o on o.id = i.organization_id
   where i.token = p_token
     and i.revoked_at is null
     and i.accepted_at is null
     and i.expires_at > now();
$$;

revoke all on function public.verify_staff_invitation(uuid) from public;
grant execute on function public.verify_staff_invitation(uuid) to anon, authenticated;

-- ── The redemption door (service-role only) ─────────────────────────────
create or replace function public.redeem_staff_invitation(p_token uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_inv public.staff_invitations%rowtype;
  v_user public.users%rowtype;
begin
  select * into v_inv
    from public.staff_invitations
   where token = p_token
     and revoked_at is null
     and accepted_at is null
     and expires_at > now()
   for update;
  if not found then
    raise exception 'redeem_staff_invitation: invitation is not live';
  end if;

  select * into v_user from public.users where id = p_user_id;
  if not found then
    raise exception 'redeem_staff_invitation: no user row for %', p_user_id;
  end if;

  if lower(btrim(v_user.email)) is distinct from v_inv.email_key then
    raise exception 'redeem_staff_invitation: the account email does not match the invitation';
  end if;

  if v_user.organization_id is not null
     and v_user.organization_id is distinct from v_inv.organization_id then
    raise exception 'redeem_staff_invitation: the account already belongs to another organisation';
  end if;

  if v_user.client_id is not null then
    raise exception 'redeem_staff_invitation: a client-side account cannot redeem a staff invitation';
  end if;

  update public.users
     set organization_id = v_inv.organization_id,
         role = v_inv.role,
         status = 'active',
         full_name = coalesce(nullif(btrim(full_name), ''), v_inv.full_name),
         updated_at = now()
   where id = p_user_id;

  update public.staff_invitations
     set accepted_at = now(),
         accepted_user_id = p_user_id,
         updated_at = now()
   where id = v_inv.id;
end;
$$;

revoke all on function public.redeem_staff_invitation(uuid, uuid) from public, anon, authenticated;
