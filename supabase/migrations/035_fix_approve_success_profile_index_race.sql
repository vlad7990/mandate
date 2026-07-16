-- Mirrors live migration 20260715204243_fix_approve_success_profile_index_race.
--
-- The version of approve_success_profile first applied in 034 promoted and
-- archived in a single CASE-based UPDATE, assuming the partial unique index
-- unique_approved_profile_per_search was checked at statement end. Partial
-- unique indexes are enforced PER ROW, so promoting before the old approved
-- row was archived could transiently create two approved rows and abort.
--
-- Fix: archive-then-promote in two statements. Both run inside the RPC's
-- transaction, so approve + archive still cannot partially apply.
--
-- The local 034 file already carries this corrected body (it was fixed before
-- ever being committed); this file exists so local migration history matches
-- the live database entry, and it is idempotent (CREATE OR REPLACE) so
-- fresh-db replay lands on the same final state.

CREATE OR REPLACE FUNCTION public.approve_success_profile(
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
