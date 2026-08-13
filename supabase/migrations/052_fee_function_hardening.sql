-- Close the two advisor findings 050 introduced.
--
-- Both are the same shapes 048 already dealt with, and the reasoning there
-- applies unchanged: a SECURITY DEFINER function on the public API surface
-- is exactly what an advisor sweep should stay quiet about, and a warning
-- nobody can dismiss is a warning nobody reads.

-- 1. `sync_candidate_stage_with_placement` is a trigger function. 050
--    revoked it from `public` and `anon` but not from `authenticated`,
--    which left it listed at
--    `/rest/v1/rpc/sync_candidate_stage_with_placement`. Calling it
--    directly would fail anyway ("trigger functions can only be called as
--    triggers"), and revoking EXECUTE does not stop the trigger firing —
--    Postgres checks EXECUTE when the trigger is created, not each time it
--    fires. Same as `guard_user_privilege_changes` in 048.
REVOKE ALL ON FUNCTION public.sync_candidate_stage_with_placement() FROM authenticated;

-- 2. `fee_instalment_plan_is_valid` was created without a `search_path`.
--    It is IMMUTABLE and sits inside a CHECK constraint, so it is evaluated
--    on every write to `fee_terms` — including writes made by a superuser
--    during a migration, where a hostile `search_path` would be worth the
--    most. It only calls built-ins, and `pg_catalog` is searched first
--    whatever the setting, so pinning it changes no behaviour.
--
--    `SET search_path` on an IMMUTABLE function stops it being inlined.
--    That costs nothing here: it is called once per row written, not per
--    row scanned, and it is not an index expression.
CREATE OR REPLACE FUNCTION public.fee_instalment_plan_is_valid(p_plan jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT
    CASE
      WHEN p_plan IS NULL OR jsonb_typeof(p_plan) <> 'array' THEN false
      WHEN jsonb_array_length(p_plan) = 0 THEN true
      ELSE (
        SELECT bool_and(
                 jsonb_typeof(e.value) = 'object'
                 AND coalesce(btrim(e.value->>'label'), '') <> ''
                 AND (e.value->>'trigger') IN (
                       'engagement', 'shortlist', 'offer_accepted',
                       'start_date', 'guarantee_passed')
                 AND (e.value->>'percent_of_fee') ~ '^[0-9]+(\.[0-9]+)?$'
                 AND (e.value->>'percent_of_fee')::numeric > 0
               )
          FROM jsonb_array_elements(p_plan) e
      )
      AND (
        SELECT round(sum((e.value->>'percent_of_fee')::numeric), 4) = 100
          FROM jsonb_array_elements(p_plan) e
      )
    END
$$;

REVOKE ALL ON FUNCTION public.fee_instalment_plan_is_valid(jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.fee_instalment_plan_is_valid(jsonb)
  TO authenticated, service_role;

-- Note on what is deliberately left alone, as 048 did:
--
-- `is_placement_credited` is SECURITY INVOKER and stays executable by
-- `authenticated`, which is the point — it is called from the SELECT
-- policies on the fee tables and those evaluate as the calling role. It
-- reads `placements`, which has its own RLS, so it cannot report credit on
-- a placement the caller cannot already see.
