-- 114 — APPROVAL PROVISIONS (onboarding gate confirmed §137)
--
-- The access-request journey gets its middle: approving a waitlist request
-- becomes a provisioning act — a new organisation (or a seat in an existing
-- one) and a staff invitation for the requester, issued from the founder's
-- own session. The gate's two claims, plus the two policies the act cannot
-- run without:
--
--   * waitlist.staff_invitation_id — the queue records which approvals have
--     been handed their door.
--   * organizations_founder_insert — this table's FIRST legal INSERT policy.
--     R1: the founder remains the only door-opener for new organisations;
--     until now no code path could birth an org at all (the one live org was
--     made by hand in SQL).
--   * staff_invitations_founder_insert / _founder_select — 113's admin
--     policies are org-matched, so the founder's session (org = mandate-hq)
--     could neither issue nor read back an invitation for any OTHER
--     organisation. Provisioning invites the requester into the org being
--     provisioned, so the founder needs the cross-org pair. Anchored
--     policies per §126 R2's law — the founder's own session writes, RLS
--     decides; no definer door.
--
-- R2 stands: approval issues an INVITATION, never an account. Nothing here
-- touches auth — the requester's account exists only when they set their
-- own password at /join.

alter table public.waitlist
  add column staff_invitation_id uuid
    references public.staff_invitations(id) on delete set null;

create index waitlist_staff_invitation_idx
  on public.waitlist (staff_invitation_id);

create policy organizations_founder_insert on public.organizations
  for insert to authenticated
  with check (
    (select public.can_read_org())
    and (select public.is_current_user_founder())
  );

create policy staff_invitations_founder_select on public.staff_invitations
  for select to authenticated
  using (
    (select public.can_read_org())
    and (select public.is_current_user_founder())
  );

create policy staff_invitations_founder_insert on public.staff_invitations
  for insert to authenticated
  with check (
    (select public.can_read_org())
    and (select public.is_current_user_founder())
    and invited_by = (select auth.uid())
  );
