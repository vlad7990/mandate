-- Invitations, mandate shares, and mandate grants.
--
-- The relationship half of the External Identity programme (067 is the
-- identity half; 069 is the portal read surface). Three tables and the
-- rules that make them honest:
--
--   * `invitations` — the one door into an external account (D4). Both
--     directions pass through it: staff holding clients:share invite any
--     external to their client; a client_admin invites colleagues at
--     their own client, granting at most what they can already see.
--   * `mandate_shares` — the D2 share act. A mandate is invisible to the
--     client side until a staff member deliberately shares it; a
--     confidential search stays confidential by default.
--   * `mandate_grants` — per-HM mandate access. client_hr and
--     client_admin are client-scoped over *shared* mandates;
--     hiring_manager sees only shared mandates individually granted.
--
-- ## Why issuance is an RPC and not an INSERT policy
--
-- Four rules live at issuance that RLS cannot express: the
-- one-account-per-email check reads users rows the caller cannot see (a
-- cross-org duplicate must be refused, not revealed); the client_admin
-- subset rule (grants ⊆ shared mandates) compares against rows in
-- another table; contact find-or-create keeps the CRM coherent in the
-- same transaction; and a staff grant auto-creates the share, because
-- inviting an HM to a mandate *is* the share act. One SECURITY DEFINER
-- door holds all four; the table takes no INSERT policy at all.
--
-- ## Token secrecy
--
-- An invitation token redeems into an account bearing the invitee's
-- email — whoever holds it can become that person in the product. So the
-- token is never readable client-side: staff read invitation rows at the
-- clients:share tier (the same trust that could mint a new invitation
-- anyway), and a client_admin lists their company's invitations through
-- `list_client_invitations`, which returns every column except the
-- token. hiring_manager and client_hr see nothing.
--
-- ## Two existing functions learn about externals
--
-- `guard_author_in_org` (057) refuses any author outside the row's org —
-- and an external's org is NULL, so every trail event a client_admin
-- causes would be refused, then silently swallowed by
-- write_activity_event's catch. The temporal claim extends honestly: the
-- author was a member of the organisation, a platform operator, *or an
-- external principal of one of the organisation's clients* at the moment
-- of writing.
--
-- `audit_member_changes` (053) routes events to the row's own org, which
-- an external does not have. External role/status changes now land in
-- the client's owning org at 'org' visibility — they are
-- client-relationship facts, like contact events, not member
-- administration. The birth transition (viewer/pending → external role
-- at redemption) is skipped: `external_joined` already tells that story.


-- ---------------------------------------------------------------------------
-- 1. invitations
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.invitations (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id        uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  -- CRM link; the contact survives the invitation and vice versa.
  contact_id       uuid REFERENCES public.client_contacts(id) ON DELETE SET NULL,

  email            text NOT NULL CHECK (position('@' in email) > 1),
  email_key        text GENERATED ALWAYS AS (lower(btrim(email))) STORED,
  -- The inviter names the person; the contact row and the account's
  -- default full_name both come from here.
  full_name        text NOT NULL CHECK (length(btrim(full_name)) > 0),
  role             text NOT NULL CHECK (role IN ('hiring_manager', 'client_hr', 'client_admin')),

  -- Mandate grants written at redemption. Only an HM invitation carries
  -- them — client_hr and client_admin are client-scoped and a grant
  -- would be a row that lies about mattering.
  grant_project_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  CONSTRAINT invitations_grants_hm_only
    CHECK (role = 'hiring_manager' OR grant_project_ids = '{}'::uuid[]),

  token            uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  invited_by       uuid REFERENCES public.users(id) ON DELETE SET NULL,
  -- Snapshot at issuance, trail-style: survives the inviter departing.
  invited_by_label text NOT NULL DEFAULT '',

  expires_at       timestamptz NOT NULL DEFAULT now() + interval '14 days',
  revoked_at       timestamptz,
  accepted_at      timestamptz,
  accepted_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,

  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- One live invitation per person per client; the index is the arbiter so
-- two staff inviting the same HM in the same minute cannot double-send.
CREATE UNIQUE INDEX IF NOT EXISTS invitations_live_per_client_email_idx
  ON public.invitations (client_id, email_key)
  WHERE revoked_at IS NULL AND accepted_at IS NULL;

CREATE INDEX IF NOT EXISTS invitations_client_idx
  ON public.invitations (client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS invitations_org_idx
  ON public.invitations (organization_id);
CREATE INDEX IF NOT EXISTS invitations_contact_idx
  ON public.invitations (contact_id);
CREATE INDEX IF NOT EXISTS invitations_invited_by_idx
  ON public.invitations (invited_by);
CREATE INDEX IF NOT EXISTS invitations_accepted_user_idx
  ON public.invitations (accepted_user_id);

ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

-- Read at the tier that could mint one anyway; see "Token secrecy".
-- No INSERT/UPDATE/DELETE policies: every write goes through the RPCs
-- below or the service-role redemption path.
DROP POLICY IF EXISTS invitations_staff_select ON public.invitations;
CREATE POLICY invitations_staff_select ON public.invitations
  FOR SELECT TO authenticated
  USING (organization_id IS NOT NULL
         AND organization_id = (SELECT public.current_user_org_id())
         AND (SELECT public.can_share_clients()));

-- Org/client agreement, 055's reasoning: a code path that takes the org
-- from one context and the client from another writes a row two orgs
-- each half-own.
CREATE OR REPLACE FUNCTION public.guard_invitation_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.client_org(NEW.client_id) IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION 'invitation client % does not belong to organisation %',
      NEW.client_id, NEW.organization_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF NEW.contact_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.client_contacts c
     WHERE c.id = NEW.contact_id AND c.client_id = NEW.client_id
  ) THEN
    RAISE EXCEPTION 'invitation contact % does not belong to client %',
      NEW.contact_id, NEW.client_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_invitation_integrity() FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS invitations_integrity ON public.invitations;
CREATE TRIGGER invitations_integrity
  BEFORE INSERT OR UPDATE ON public.invitations
  FOR EACH ROW EXECUTE FUNCTION public.guard_invitation_integrity();


-- ---------------------------------------------------------------------------
-- 2. mandate_shares — the D2 share act
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.mandate_shares (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id      uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  client_id       uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  shared_by       uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  -- A mandate is shared to its client or it is not; there is no second
  -- audience to share it to.
  CONSTRAINT mandate_shares_one_per_project UNIQUE (project_id)
);

CREATE INDEX IF NOT EXISTS mandate_shares_client_idx ON public.mandate_shares (client_id);
CREATE INDEX IF NOT EXISTS mandate_shares_org_idx ON public.mandate_shares (organization_id);
CREATE INDEX IF NOT EXISTS mandate_shares_shared_by_idx ON public.mandate_shares (shared_by);

ALTER TABLE public.mandate_shares ENABLE ROW LEVEL SECURITY;

-- Staff only. Externals learn what is shared with them through the 069
-- portal RPCs — a bare share row (three uuids) is meaningless to a
-- principal who cannot read projects, and meaningless reads are surface.
DROP POLICY IF EXISTS mandate_shares_select ON public.mandate_shares;
CREATE POLICY mandate_shares_select ON public.mandate_shares
  FOR SELECT TO authenticated
  USING (organization_id = (SELECT public.current_user_org_id())
         AND (SELECT public.can_read_org()));

DROP POLICY IF EXISTS mandate_shares_insert ON public.mandate_shares;
CREATE POLICY mandate_shares_insert ON public.mandate_shares
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = (SELECT public.current_user_org_id())
              AND (SELECT public.can_share_clients()));

DROP POLICY IF EXISTS mandate_shares_delete ON public.mandate_shares;
CREATE POLICY mandate_shares_delete ON public.mandate_shares
  FOR DELETE TO authenticated
  USING (organization_id = (SELECT public.current_user_org_id())
         AND (SELECT public.can_share_clients()));

CREATE OR REPLACE FUNCTION public.guard_mandate_share_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project_org    uuid;
  v_project_client uuid;
BEGIN
  SELECT p.organization_id, p.client_id
    INTO v_project_org, v_project_client
    FROM public.projects p WHERE p.id = NEW.project_id;

  IF v_project_org IS DISTINCT FROM NEW.organization_id
     OR v_project_client IS NULL
     OR v_project_client IS DISTINCT FROM NEW.client_id THEN
    RAISE EXCEPTION 'a mandate can only be shared to its own client'
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_mandate_share_integrity() FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS mandate_shares_integrity ON public.mandate_shares;
CREATE TRIGGER mandate_shares_integrity
  BEFORE INSERT OR UPDATE ON public.mandate_shares
  FOR EACH ROW EXECUTE FUNCTION public.guard_mandate_share_integrity();


-- ---------------------------------------------------------------------------
-- 3. mandate_grants — per-HM access within the shared set
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.mandate_grants (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id      uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  client_id       uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  granted_by      uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mandate_grants_one_per_user UNIQUE (project_id, user_id)
);

CREATE INDEX IF NOT EXISTS mandate_grants_user_idx ON public.mandate_grants (user_id);
CREATE INDEX IF NOT EXISTS mandate_grants_client_idx ON public.mandate_grants (client_id);
CREATE INDEX IF NOT EXISTS mandate_grants_org_idx ON public.mandate_grants (organization_id);
CREATE INDEX IF NOT EXISTS mandate_grants_granted_by_idx ON public.mandate_grants (granted_by);

ALTER TABLE public.mandate_grants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mandate_grants_select ON public.mandate_grants;
CREATE POLICY mandate_grants_select ON public.mandate_grants
  FOR SELECT TO authenticated
  USING (organization_id = (SELECT public.current_user_org_id())
         AND (SELECT public.can_read_org()));

DROP POLICY IF EXISTS mandate_grants_insert ON public.mandate_grants;
CREATE POLICY mandate_grants_insert ON public.mandate_grants
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = (SELECT public.current_user_org_id())
              AND (SELECT public.can_share_clients()));

DROP POLICY IF EXISTS mandate_grants_delete ON public.mandate_grants;
CREATE POLICY mandate_grants_delete ON public.mandate_grants
  FOR DELETE TO authenticated
  USING (organization_id = (SELECT public.current_user_org_id())
         AND (SELECT public.can_share_clients()));

CREATE OR REPLACE FUNCTION public.guard_mandate_grant_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project_org    uuid;
  v_project_client uuid;
  v_user_client    uuid;
  v_user_role      text;
BEGIN
  SELECT p.organization_id, p.client_id
    INTO v_project_org, v_project_client
    FROM public.projects p WHERE p.id = NEW.project_id;

  IF v_project_org IS DISTINCT FROM NEW.organization_id
     OR v_project_client IS NULL
     OR v_project_client IS DISTINCT FROM NEW.client_id THEN
    RAISE EXCEPTION 'a grant must name a mandate of its own client'
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  SELECT u.client_id, u.role INTO v_user_client, v_user_role
    FROM public.users u WHERE u.id = NEW.user_id;

  -- Only a hiring_manager takes grants: client_hr and client_admin are
  -- client-scoped, and a grant row for them would lie about mattering.
  IF v_user_client IS DISTINCT FROM NEW.client_id
     OR v_user_role IS DISTINCT FROM 'hiring_manager' THEN
    RAISE EXCEPTION 'a grant must name a hiring manager of the same client'
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_mandate_grant_integrity() FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS mandate_grants_integrity ON public.mandate_grants;
CREATE TRIGGER mandate_grants_integrity
  BEFORE INSERT OR UPDATE ON public.mandate_grants
  FOR EACH ROW EXECUTE FUNCTION public.guard_mandate_grant_integrity();


-- ---------------------------------------------------------------------------
-- 4. guard_author_in_org learns the third tier
-- ---------------------------------------------------------------------------

-- The temporal claim becomes: the author was a member of this row's
-- organisation, a platform operator, or an external principal of one of
-- this organisation's clients, at the moment the row was written. Without
-- the third arm, every trail event a client_admin causes is refused here
-- and silently swallowed by write_activity_event's catch — an invisible
-- hole in exactly the audit trail the programme adds.
CREATE OR REPLACE FUNCTION public.guard_author_in_org()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new       jsonb := to_jsonb(NEW);
  v_old       jsonb := CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END;
  v_org       uuid  := (v_new->>'organization_id')::uuid;
  v_col       text;
  v_author    uuid;
  v_author_org uuid;
  v_author_client uuid;
  v_founder   boolean;
  v_found     boolean;
BEGIN
  IF v_org IS NULL THEN
    RETURN NEW;
  END IF;

  FOREACH v_col IN ARRAY TG_ARGV LOOP
    IF v_old IS NOT NULL
       AND (v_old->>v_col) IS NOT DISTINCT FROM (v_new->>v_col) THEN
      CONTINUE;
    END IF;

    v_author := (v_new->>v_col)::uuid;
    IF v_author IS NULL THEN
      CONTINUE;
    END IF;

    SELECT u.organization_id, u.client_id, u.is_founder, true
      INTO v_author_org, v_author_client, v_founder, v_found
      FROM public.users u
     WHERE u.id = v_author;

    IF NOT coalesce(v_found, false) THEN
      CONTINUE;
    END IF;

    IF coalesce(v_founder, false) THEN
      CONTINUE;
    END IF;

    -- The external tier: a principal of one of this organisation's
    -- clients participates in its trail and its client-facing rows.
    IF v_author_client IS NOT NULL
       AND public.client_org(v_author_client) = v_org THEN
      CONTINUE;
    END IF;

    IF v_author_org IS DISTINCT FROM v_org THEN
      RAISE EXCEPTION
        '%.% names %, who is not a member of organisation %',
        TG_TABLE_NAME, v_col, v_author, v_org
        USING ERRCODE = 'foreign_key_violation';
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_author_in_org() FROM public, anon, authenticated;


-- ---------------------------------------------------------------------------
-- 5. The vocabulary grows; member auditing learns about externals
-- ---------------------------------------------------------------------------

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
    'external_invited', 'external_invitation_revoked', 'external_joined',
    'external_role_changed', 'external_status_changed',
    'mandate_shared', 'mandate_unshared',
    'external_access_granted', 'external_access_revoked'
  ));

-- record_activity_event's allowlist deliberately does not grow: every new
-- event is written by a trigger or a definer RPC below, so the intent API
-- cannot fabricate any of them.

CREATE OR REPLACE FUNCTION public.audit_member_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid := coalesce(NEW.organization_id, OLD.organization_id);
BEGIN
  -- Externals: events land in the client's owning org at 'org'
  -- visibility — client-relationship facts, like contact events, not
  -- member administration. The birth transition (a fresh signup row
  -- becoming an external at redemption) is external_joined's story.
  IF NEW.client_id IS NOT NULL THEN
    IF OLD.client_id IS NULL THEN
      RETURN NEW;
    END IF;

    v_org := public.client_org(NEW.client_id);

    IF NEW.role IS DISTINCT FROM OLD.role THEN
      PERFORM public.write_activity_event(
        p_organization_id => v_org,
        p_event_type      => 'external_role_changed',
        p_visibility      => 'org',
        p_client_id       => NEW.client_id,
        p_target_user_id  => NEW.id,
        p_detail          => jsonb_build_object(
                               'from', OLD.role, 'to', NEW.role,
                               'member', coalesce(nullif(btrim(NEW.full_name), ''), NEW.email)));
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status THEN
      PERFORM public.write_activity_event(
        p_organization_id => v_org,
        p_event_type      => 'external_status_changed',
        p_visibility      => 'org',
        p_client_id       => NEW.client_id,
        p_target_user_id  => NEW.id,
        p_detail          => jsonb_build_object(
                               'from', OLD.status, 'to', NEW.status,
                               'member', coalesce(nullif(btrim(NEW.full_name), ''), NEW.email)));
    END IF;

    RETURN NEW;
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role THEN
    PERFORM public.write_activity_event(
      p_organization_id => v_org,
      p_event_type      => 'member_role_changed',
      p_visibility      => 'admin',
      p_target_user_id  => NEW.id,
      p_detail          => jsonb_build_object(
                             'from', OLD.role, 'to', NEW.role,
                             'member', coalesce(nullif(btrim(NEW.full_name), ''), NEW.email)));
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM public.write_activity_event(
      p_organization_id => v_org,
      p_event_type      => 'member_status_changed',
      p_visibility      => 'admin',
      p_target_user_id  => NEW.id,
      p_detail          => jsonb_build_object(
                             'from', OLD.status, 'to', NEW.status,
                             'member', coalesce(nullif(btrim(NEW.full_name), ''), NEW.email)));
  END IF;

  IF NEW.is_founder IS DISTINCT FROM OLD.is_founder THEN
    PERFORM public.write_activity_event(
      p_organization_id => v_org,
      p_event_type      => 'member_founder_changed',
      p_visibility      => 'admin',
      p_target_user_id  => NEW.id,
      p_detail          => jsonb_build_object(
                             'from', OLD.is_founder, 'to', NEW.is_founder,
                             'member', coalesce(nullif(btrim(NEW.full_name), ''), NEW.email)));
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.audit_member_changes() FROM public, anon, authenticated;


-- ---------------------------------------------------------------------------
-- 6. Audit triggers — the trail is written by construction
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.audit_invitations()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.write_activity_event(
      p_organization_id => NEW.organization_id,
      p_event_type      => 'external_invited',
      p_visibility      => 'org',
      p_client_id       => NEW.client_id,
      p_detail          => jsonb_build_object(
                             'email', NEW.email,
                             'invitee', NEW.full_name,
                             'role', NEW.role,
                             'mandates', coalesce(array_length(NEW.grant_project_ids, 1), 0)));
    RETURN NEW;
  END IF;

  IF NEW.revoked_at IS NOT NULL AND OLD.revoked_at IS NULL THEN
    PERFORM public.write_activity_event(
      p_organization_id => NEW.organization_id,
      p_event_type      => 'external_invitation_revoked',
      p_visibility      => 'org',
      p_client_id       => NEW.client_id,
      p_detail          => jsonb_build_object(
                             'email', NEW.email, 'invitee', NEW.full_name,
                             'role', NEW.role));
  END IF;

  IF NEW.accepted_at IS NOT NULL AND OLD.accepted_at IS NULL THEN
    PERFORM public.write_activity_event(
      p_organization_id => NEW.organization_id,
      p_event_type      => 'external_joined',
      p_visibility      => 'org',
      p_client_id       => NEW.client_id,
      p_target_user_id  => NEW.accepted_user_id,
      p_detail          => jsonb_build_object(
                             'email', NEW.email, 'member', NEW.full_name,
                             'role', NEW.role));
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.audit_invitations() FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS invitations_audit ON public.invitations;
CREATE TRIGGER invitations_audit
  AFTER INSERT OR UPDATE ON public.invitations
  FOR EACH ROW EXECUTE FUNCTION public.audit_invitations();

CREATE OR REPLACE FUNCTION public.audit_mandate_shares()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.write_activity_event(
      p_organization_id => NEW.organization_id,
      p_event_type      => 'mandate_shared',
      p_visibility      => 'org',
      p_project_id      => NEW.project_id,
      p_client_id       => NEW.client_id);
    RETURN NEW;
  END IF;

  PERFORM public.write_activity_event(
    p_organization_id => OLD.organization_id,
    p_event_type      => 'mandate_unshared',
    p_visibility      => 'org',
    p_project_id      => OLD.project_id,
    p_client_id       => OLD.client_id);
  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.audit_mandate_shares() FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS mandate_shares_audit ON public.mandate_shares;
CREATE TRIGGER mandate_shares_audit
  AFTER INSERT OR DELETE ON public.mandate_shares
  FOR EACH ROW EXECUTE FUNCTION public.audit_mandate_shares();

CREATE OR REPLACE FUNCTION public.audit_mandate_grants()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member text;
BEGIN
  SELECT coalesce(nullif(btrim(u.full_name), ''), u.email) INTO v_member
    FROM public.users u
   WHERE u.id = coalesce(NEW.user_id, OLD.user_id);

  IF TG_OP = 'INSERT' THEN
    PERFORM public.write_activity_event(
      p_organization_id => NEW.organization_id,
      p_event_type      => 'external_access_granted',
      p_visibility      => 'org',
      p_project_id      => NEW.project_id,
      p_client_id       => NEW.client_id,
      p_target_user_id  => NEW.user_id,
      p_detail          => jsonb_build_object('member', v_member));
    RETURN NEW;
  END IF;

  PERFORM public.write_activity_event(
    p_organization_id => OLD.organization_id,
    p_event_type      => 'external_access_revoked',
    p_visibility      => 'org',
    p_project_id      => OLD.project_id,
    p_client_id       => OLD.client_id,
    p_target_user_id  => OLD.user_id,
    p_detail          => jsonb_build_object('member', v_member));
  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.audit_mandate_grants() FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS mandate_grants_audit ON public.mandate_grants;
CREATE TRIGGER mandate_grants_audit
  AFTER INSERT OR DELETE ON public.mandate_grants
  FOR EACH ROW EXECUTE FUNCTION public.audit_mandate_grants();


-- ---------------------------------------------------------------------------
-- 7. Issuance
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.issue_external_invitation(
  p_client_id   uuid,
  p_email       text,
  p_full_name   text,
  p_role        text,
  p_project_ids uuid[] DEFAULT '{}'::uuid[],
  p_contact_id  uuid DEFAULT NULL
)
RETURNS TABLE(invitation_id uuid, invitation_token uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller        uuid := (SELECT auth.uid());
  v_caller_org    uuid := (SELECT public.current_user_org_id());
  v_caller_client uuid := (SELECT public.current_user_client_id());
  v_client_org    uuid := public.client_org(p_client_id);
  v_is_staff      boolean;
  v_is_cadmin     boolean;
  v_email         text := btrim(coalesce(p_email, ''));
  v_full_name     text := btrim(coalesce(p_full_name, ''));
  v_project_ids   uuid[];
  v_pid           uuid;
  v_contact_id    uuid := p_contact_id;
  v_label         text;
  v_id            uuid;
  v_token         uuid;
BEGIN
  IF v_client_org IS NULL THEN
    RAISE EXCEPTION 'unknown client' USING ERRCODE = 'foreign_key_violation';
  END IF;

  v_is_staff  := v_caller_org IS NOT NULL
                 AND v_caller_org = v_client_org
                 AND coalesce(public.can_share_clients(), false);
  v_is_cadmin := public.is_client_admin() AND v_caller_client = p_client_id;

  IF NOT (v_is_staff OR v_is_cadmin) THEN
    RAISE EXCEPTION 'not allowed to invite to this client'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_role NOT IN ('hiring_manager', 'client_hr', 'client_admin') THEN
    RAISE EXCEPTION '% is not an external role', p_role
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_email = '' OR position('@' in v_email) <= 1 THEN
    RAISE EXCEPTION 'an invitation needs a real email address'
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_full_name = '' THEN
    RAISE EXCEPTION 'an invitation needs the person''s name'
      USING ERRCODE = 'check_violation';
  END IF;

  -- One email, one account, one client relationship (D1). The check runs
  -- as definer because the duplicate may be a row the caller must not
  -- see; the error deliberately says no more than it has to.
  IF EXISTS (SELECT 1 FROM public.users u WHERE lower(u.email) = lower(v_email)) THEN
    RAISE EXCEPTION 'this email already has a Mandate account'
      USING ERRCODE = 'unique_violation';
  END IF;

  -- Grants: HM only (the table CHECK repeats this), each named mandate
  -- must belong to this client, and a client_admin may hand out only
  -- what is already shared. For staff, inviting an HM to a mandate IS
  -- the share act — the share row is created here, not assumed.
  v_project_ids := (SELECT coalesce(array_agg(DISTINCT pid), '{}'::uuid[])
                      FROM unnest(coalesce(p_project_ids, '{}'::uuid[])) pid);

  IF p_role <> 'hiring_manager' AND v_project_ids <> '{}'::uuid[] THEN
    RAISE EXCEPTION 'only a hiring manager invitation carries mandate grants'
      USING ERRCODE = 'check_violation';
  END IF;

  FOREACH v_pid IN ARRAY v_project_ids LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.projects p
       WHERE p.id = v_pid
         AND p.organization_id = v_client_org
         AND p.client_id = p_client_id
    ) THEN
      RAISE EXCEPTION 'mandate % does not belong to this client', v_pid
        USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF v_is_cadmin THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.mandate_shares s WHERE s.project_id = v_pid
      ) THEN
        RAISE EXCEPTION 'a client admin can only grant mandates already shared with the company'
          USING ERRCODE = 'insufficient_privilege';
      END IF;
    ELSE
      INSERT INTO public.mandate_shares (organization_id, project_id, client_id, shared_by)
      VALUES (v_client_org, v_pid, p_client_id, v_caller)
      ON CONFLICT (project_id) DO NOTHING;
    END IF;
  END LOOP;

  -- The CRM stays coherent: the invitee is a contact of the client,
  -- linked if they exist, created if they do not.
  IF v_contact_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.client_contacts c
       WHERE c.id = v_contact_id AND c.client_id = p_client_id
    ) THEN
      RAISE EXCEPTION 'contact does not belong to this client'
        USING ERRCODE = 'foreign_key_violation';
    END IF;
  ELSE
    SELECT c.id INTO v_contact_id
      FROM public.client_contacts c
     WHERE c.client_id = p_client_id
       AND c.email_key = lower(v_email)
     LIMIT 1;

    IF v_contact_id IS NULL THEN
      INSERT INTO public.client_contacts
        (organization_id, client_id, full_name, email, contact_type, created_by)
      VALUES
        (v_client_org, p_client_id, v_full_name, v_email,
         CASE p_role WHEN 'hiring_manager' THEN 'hiring_manager'
                     WHEN 'client_hr' THEN 'hr'
                     ELSE 'other' END,
         v_caller)
      RETURNING id INTO v_contact_id;
    END IF;
  END IF;

  SELECT coalesce(nullif(btrim(u.full_name), ''), u.email) INTO v_label
    FROM public.users u WHERE u.id = v_caller;

  INSERT INTO public.invitations
    (organization_id, client_id, contact_id, email, full_name, role,
     grant_project_ids, invited_by, invited_by_label)
  VALUES
    (v_client_org, p_client_id, v_contact_id, v_email, v_full_name, p_role,
     v_project_ids, v_caller, coalesce(v_label, ''))
  RETURNING id, token INTO v_id, v_token;

  RETURN QUERY SELECT v_id, v_token;
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'there is already a live invitation for % at this client', v_email
    USING ERRCODE = 'unique_violation';
END;
$$;

REVOKE ALL ON FUNCTION public.issue_external_invitation(uuid, text, text, text, uuid[], uuid)
  FROM public, anon;
GRANT EXECUTE ON FUNCTION public.issue_external_invitation(uuid, text, text, text, uuid[], uuid)
  TO authenticated, service_role;


-- ---------------------------------------------------------------------------
-- 8. Revocation, and the token-free listing
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.revoke_external_invitation(p_invitation_id uuid)
RETURNS void
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
  SELECT * INTO v_inv FROM public.invitations WHERE id = p_invitation_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'unknown invitation' USING ERRCODE = 'no_data_found';
  END IF;

  v_allowed := (v_caller_org IS NOT NULL
                AND v_caller_org = v_inv.organization_id
                AND coalesce(public.can_share_clients(), false))
            OR (public.is_client_admin() AND v_caller_client = v_inv.client_id);

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'not allowed to revoke this invitation'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_inv.accepted_at IS NOT NULL THEN
    RAISE EXCEPTION 'this invitation was already accepted — suspend the account instead'
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.invitations
     SET revoked_at = coalesce(revoked_at, now()),
         updated_at = now()
   WHERE id = p_invitation_id;
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_external_invitation(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.revoke_external_invitation(uuid) TO authenticated, service_role;

-- Every column except the token — a client_admin's People view lists
-- their company's invitations without ever holding the secret that could
-- impersonate a colleague.
CREATE OR REPLACE FUNCTION public.list_client_invitations(p_client_id uuid)
RETURNS TABLE(
  id uuid, email text, full_name text, role text,
  invited_by_label text, mandate_count int,
  expires_at timestamptz, revoked_at timestamptz, accepted_at timestamptz,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT i.id, i.email, i.full_name, i.role,
         i.invited_by_label,
         coalesce(array_length(i.grant_project_ids, 1), 0),
         i.expires_at, i.revoked_at, i.accepted_at, i.created_at
    FROM public.invitations i
   WHERE i.client_id = p_client_id
     AND (
       ((SELECT public.current_user_org_id()) = i.organization_id
         AND coalesce(public.can_share_clients(), false))
       OR (public.is_client_admin()
         AND (SELECT public.current_user_client_id()) = p_client_id)
     )
   ORDER BY i.created_at DESC
$$;

REVOKE ALL ON FUNCTION public.list_client_invitations(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.list_client_invitations(uuid) TO authenticated, service_role;


-- ---------------------------------------------------------------------------
-- 9. Verification and redemption
-- ---------------------------------------------------------------------------

-- The public /invite/[token] page, anon like verify_hm_token: returns the
-- invitation's face when it is live, nothing otherwise. No side effects —
-- viewing an invitation is not accepting it.
CREATE OR REPLACE FUNCTION public.verify_invitation(p_token uuid)
RETURNS TABLE(
  email text, full_name text, role text,
  client_name text, organization_name text,
  invited_by_label text, expires_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT i.email, i.full_name, i.role,
         c.name, o.name,
         i.invited_by_label, i.expires_at
    FROM public.invitations i
    JOIN public.clients c ON c.id = i.client_id
    JOIN public.organizations o ON o.id = i.organization_id
   WHERE i.token = p_token
     AND i.revoked_at IS NULL
     AND i.accepted_at IS NULL
     AND i.expires_at > now()
$$;

REVOKE ALL ON FUNCTION public.verify_invitation(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.verify_invitation(uuid) TO anon, authenticated, service_role;

-- Service-role only: called by the redemption action after the auth
-- account exists (admin-created, email confirmed by construction — the
-- invitation click is the confirmation, D4). handle_new_auth_user has
-- already written the default viewer/pending row; this turns it into the
-- external the invitation describes, in one statement so the XOR CHECK
-- sees a consistent row.
CREATE OR REPLACE FUNCTION public.redeem_invitation(p_token uuid, p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv  record;
  v_user record;
BEGIN
  SELECT * INTO v_inv
    FROM public.invitations
   WHERE token = p_token
     AND revoked_at IS NULL
     AND accepted_at IS NULL
     AND expires_at > now()
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invitation is not redeemable' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO v_user FROM public.users WHERE id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'no account for %', p_user_id USING ERRCODE = 'no_data_found';
  END IF;

  IF lower(v_user.email) IS DISTINCT FROM v_inv.email_key THEN
    RAISE EXCEPTION 'account email does not match the invitation'
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_user.organization_id IS NOT NULL OR v_user.client_id IS NOT NULL THEN
    RAISE EXCEPTION 'this account already belongs somewhere'
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.users
     SET role       = v_inv.role,
         client_id  = v_inv.client_id,
         status     = 'active',
         full_name  = coalesce(nullif(btrim(full_name), ''), v_inv.full_name),
         updated_at = now()
   WHERE id = p_user_id;

  UPDATE public.invitations
     SET accepted_at      = now(),
         accepted_user_id = p_user_id,
         updated_at       = now()
   WHERE id = v_inv.id;

  -- Grants promised at issuance. The share may have been revoked in the
  -- meantime — the grant row is written regardless and stays inert until
  -- the mandate is shared again, which is the D2 conjunction working.
  INSERT INTO public.mandate_grants (organization_id, project_id, client_id, user_id, granted_by)
  SELECT v_inv.organization_id, pid, v_inv.client_id, p_user_id, v_inv.invited_by
    FROM unnest(v_inv.grant_project_ids) pid
  ON CONFLICT (project_id, user_id) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.redeem_invitation(uuid, uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_invitation(uuid, uuid) TO service_role;


-- ---------------------------------------------------------------------------
-- 10. Grant management after the fact
-- ---------------------------------------------------------------------------

-- Staff write mandate_grants directly under RLS. A client_admin goes
-- through here: same subset rule as issuance — only shared mandates,
-- only their own company's hiring managers.
CREATE OR REPLACE FUNCTION public.grant_mandate_access(p_project_id uuid, p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_client uuid := (SELECT public.current_user_client_id());
  v_share         record;
BEGIN
  IF NOT (public.is_client_admin() AND v_caller_client IS NOT NULL) THEN
    RAISE EXCEPTION 'only a client admin may grant access here'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT s.* INTO v_share
    FROM public.mandate_shares s
   WHERE s.project_id = p_project_id AND s.client_id = v_caller_client;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'this mandate is not shared with your company'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- The integrity trigger re-checks the target is a hiring_manager of
  -- the same client; this insert simply carries the caller as grantor.
  INSERT INTO public.mandate_grants (organization_id, project_id, client_id, user_id, granted_by)
  VALUES (v_share.organization_id, p_project_id, v_caller_client, p_user_id, (SELECT auth.uid()))
  ON CONFLICT (project_id, user_id) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_mandate_access(p_project_id uuid, p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_client uuid := (SELECT public.current_user_client_id());
BEGIN
  IF NOT (public.is_client_admin() AND v_caller_client IS NOT NULL) THEN
    RAISE EXCEPTION 'only a client admin may revoke access here'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  DELETE FROM public.mandate_grants
   WHERE project_id = p_project_id
     AND user_id = p_user_id
     AND client_id = v_caller_client;
END;
$$;

REVOKE ALL ON FUNCTION public.grant_mandate_access(uuid, uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.revoke_mandate_access(uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.grant_mandate_access(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.revoke_mandate_access(uuid, uuid) TO authenticated, service_role;
