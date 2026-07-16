-- Executive Intelligence — hardening pass.
--
-- 1. Database-layer immutability for role_success_profiles. App-level WHERE
--    guards are advisory only; this trigger makes approved/archived rows
--    unmodifiable for ANY role (including service_role) unless the sanctioned
--    transaction-local flag is set — and only approve_success_profile sets it.
--    Promotion to 'approved' is likewise RPC-only, so approved_by can never
--    be forged through a direct PostgREST UPDATE or INSERT.
--
-- 2. approve_success_profile now derives the approver from auth.uid() instead
--    of trusting a parameter — an authenticated user can no longer record an
--    approval under someone else's identity by calling the RPC directly.
--
-- 3. executive_audit_events INSERT now requires actor_id = auth.uid(), so
--    audit rows cannot be forged on behalf of another actor. (The table
--    already has no UPDATE/DELETE policies — it stays append-only.)

-- ---------------------------------------------------------------------------
-- 1. Immutability guard trigger
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.guard_role_success_profiles()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  -- Transaction-local escape hatch, set exclusively by
  -- approve_success_profile via set_config(..., is_local => true).
  v_transition_allowed boolean :=
    COALESCE(current_setting('mandate.allow_profile_transition', true), '') = 'on';
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Every profile is born a draft; approval must flow through the RPC so
    -- approved_by/approved_at are stamped from auth.uid().
    IF NEW.status <> 'draft' AND NOT v_transition_allowed THEN
      RAISE EXCEPTION 'Profiles are created as drafts. Use approve_success_profile() to approve.'
        USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE:
  IF OLD.status IN ('approved', 'archived') AND NOT v_transition_allowed THEN
    RAISE EXCEPTION 'Profile % is % and immutable. Create a new version instead.', OLD.id, OLD.status
      USING ERRCODE = 'P0001';
  END IF;

  IF NEW.status = 'approved'
     AND OLD.status IS DISTINCT FROM 'approved'
     AND NOT v_transition_allowed THEN
    RAISE EXCEPTION 'Use approve_success_profile() to approve a profile.'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER role_success_profiles_guard
  BEFORE INSERT OR UPDATE ON public.role_success_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_role_success_profiles();

-- ---------------------------------------------------------------------------
-- 2. approve_success_profile v2 — approver from auth.uid(), sets the guard
--    flag for its own statements. Signature changes (drops p_approved_by),
--    so the old function must be removed.
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.approve_success_profile(uuid, uuid, uuid);

CREATE FUNCTION public.approve_success_profile(
  p_profile_id uuid,
  p_search_id  uuid
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_actor     uuid := auth.uid();
  v_target_id uuid;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required to approve a profile.'
      USING ERRCODE = 'P0001';
  END IF;

  -- Sanction this transaction's status transitions for the guard trigger.
  -- is_local => true scopes the flag to the current transaction.
  PERFORM set_config('mandate.allow_profile_transition', 'on', true);

  -- Validate the target under lock BEFORE touching any row. A missing,
  -- inaccessible, generating, or failed target must not demote the
  -- currently-approved profile.
  SELECT rsp.id
    INTO v_target_id
    FROM public.role_success_profiles AS rsp
   WHERE rsp.id = p_profile_id
     AND rsp.search_id = p_search_id
     AND rsp.is_generating = false
     AND rsp.generation_error IS NULL
     AND rsp.status IN ('draft', 'archived')
   FOR UPDATE;

  IF v_target_id IS NULL THEN
    RAISE EXCEPTION 'Profile % could not be approved (not found, not accessible, or not a healthy draft).', p_profile_id
      USING ERRCODE = 'P0002';
  END IF;

  -- Archive-then-promote, in that order: the partial unique index on
  -- (search_id) WHERE status='approved' is enforced per row, so promoting
  -- first would transiently create two approved rows and abort. Both
  -- statements run in this function's transaction — a failure in either
  -- rolls back the pair, so approve + archive still cannot partially apply.
  UPDATE public.role_success_profiles AS rsp
     SET status = 'archived',
         updated_at = now()
   WHERE rsp.search_id = p_search_id
     AND rsp.status = 'approved'
     AND rsp.id <> p_profile_id;

  UPDATE public.role_success_profiles AS rsp
     SET status = 'approved',
         approved_by = v_actor,
         approved_at = now(),
         updated_at = now()
   WHERE rsp.id = p_profile_id;

  -- Clear the flag for any statements that follow in the same transaction.
  PERFORM set_config('mandate.allow_profile_transition', '', true);
END;
$$;

REVOKE ALL ON FUNCTION public.approve_success_profile(uuid, uuid)
  FROM public, anon;

GRANT EXECUTE ON FUNCTION public.approve_success_profile(uuid, uuid)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Audit INSERT: the actor must be the caller.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS exec_audit_insert ON public.executive_audit_events;

CREATE POLICY exec_audit_insert ON public.executive_audit_events
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id IS NOT NULL
    AND organization_id = public.current_user_org_id()
    AND actor_id = (SELECT auth.uid())
  );
