-- The existing policy `users_see_own_org_users` ran a SELECT against public.users
-- inside a policy on public.users, causing "infinite recursion detected in policy
-- for relation users". Replace the subquery with a SECURITY DEFINER helper that
-- bypasses RLS, mirroring the pattern of public.is_current_user_founder().

CREATE OR REPLACE FUNCTION public.current_user_org_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id FROM public.users WHERE id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.current_user_org_id() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.current_user_org_id() TO authenticated, service_role;

-- Drop the recursive policy and recreate it using the helper. The replacement is
-- SELECT-only (the original was FOR ALL but had no WITH CHECK, which silently
-- blocked all writes — writes are governed by separate policies such as
-- founders_can_update_users).
DROP POLICY IF EXISTS users_see_own_org_users ON public.users;

CREATE POLICY users_see_own_org_users ON public.users
  FOR SELECT TO authenticated
  USING (
    organization_id IS NOT NULL
    AND organization_id = public.current_user_org_id()
  );
