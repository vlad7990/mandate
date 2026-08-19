-- Resend an invitation: same token, fresh clock.
--
-- Account Lifecycle slice, D4 (plan in docs/handoffs/NEXT-account-lifecycle.md,
-- D1–D5 confirmed by the founder 2026-08-19). The 068 invitation's only
-- answer to "the link expired" or "the email never came" was revoke +
-- re-invite — two steps and a new token for what is really one act:
-- send it again.
--
-- The token deliberately does not rotate. It has only ever existed in
-- the invitee's inbox and the inviter's hand; minting a new one would
-- orphan a link that may already be sitting in the right inbox, and the
-- expiry refresh is the part that actually helps. Accepted invitations
-- refuse (there is an account now — nothing to resend), and revoked
-- ones refuse too: a withdrawal was deliberate, and quietly reviving it
-- from a resend button would make Revoke a lie. Re-invite is the honest
-- path back.
--
-- The audit trigger from 068 only speaks on the revoked/accepted
-- transitions, so the RPC writes its own `external_invitation_resent`
-- event — trigger-or-RPC-written like the rest of the external
-- vocabulary; record_activity_event's allowlist stays closed.

ALTER TABLE public.activity_events
  DROP CONSTRAINT IF EXISTS activity_events_type_known;

ALTER TABLE public.activity_events
  ADD CONSTRAINT activity_events_type_known
  CHECK (event_type IN (
    'placement_recorded', 'placement_status_changed',
    'placement_signoff_changed', 'placement_deleted',
    'fee_recorded', 'fee_updated', 'fee_line_earned', 'fee_line_cancelled',
    'fee_reversed', 'fee_terms_created', 'fee_terms_updated',
    'fee_terms_deleted',
    'client_contact_added', 'client_contact_updated', 'client_contact_removed',
    'member_role_changed', 'member_status_changed', 'member_founder_changed',
    'shortlist_published', 'report_exported', 'hm_portal_opened',
    'mandate_reassigned',
    'external_invited', 'external_invitation_revoked',
    'external_invitation_resent', 'external_joined',
    'external_role_changed', 'external_status_changed',
    'mandate_shared', 'mandate_unshared',
    'external_access_granted', 'external_access_revoked'
  ));

-- Same authorization pair as revoke_external_invitation (068): staff at
-- the clients:share tier of the owning org, or the client's own admin.
-- Returns what the mailer needs so the caller makes exactly one trip.
CREATE OR REPLACE FUNCTION public.resend_external_invitation(p_invitation_id uuid)
RETURNS TABLE(
  invitation_token uuid, email text, full_name text, role text,
  expires_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv           record;
  v_caller_org    uuid := (SELECT public.current_user_org_id());
  v_caller_client uuid := (SELECT public.current_user_client_id());
  v_allowed       boolean;
BEGIN
  SELECT * INTO v_inv FROM public.invitations i WHERE i.id = p_invitation_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'unknown invitation' USING ERRCODE = 'no_data_found';
  END IF;

  v_allowed := (v_caller_org IS NOT NULL
                AND v_caller_org = v_inv.organization_id
                AND coalesce(public.can_share_clients(), false))
            OR (public.is_client_admin() AND v_caller_client = v_inv.client_id);

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'not allowed to resend this invitation'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_inv.accepted_at IS NOT NULL THEN
    RAISE EXCEPTION 'this invitation was already accepted — the account exists'
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_inv.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'this invitation was withdrawn — send a fresh one instead'
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.invitations i
     SET expires_at = now() + interval '14 days',
         updated_at = now()
   WHERE i.id = p_invitation_id;

  PERFORM public.write_activity_event(
    p_organization_id => v_inv.organization_id,
    p_event_type      => 'external_invitation_resent',
    p_visibility      => 'org',
    p_client_id       => v_inv.client_id,
    p_detail          => jsonb_build_object(
                           'email', v_inv.email,
                           'invitee', v_inv.full_name,
                           'role', v_inv.role));

  RETURN QUERY
  SELECT i.token, i.email, i.full_name, i.role, i.expires_at
    FROM public.invitations i
   WHERE i.id = p_invitation_id;
END;
$$;

REVOKE ALL ON FUNCTION public.resend_external_invitation(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.resend_external_invitation(uuid) TO authenticated, service_role;
