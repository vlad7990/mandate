-- Add status & founder flag to public.users
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS is_founder boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('active','pending','suspended'));

CREATE INDEX IF NOT EXISTS users_status_idx ON public.users (status);
CREATE INDEX IF NOT EXISTS users_is_founder_idx ON public.users (is_founder) WHERE is_founder = true;

-- SECURITY DEFINER bypasses RLS so founder-check policies don't recurse into themselves.
CREATE OR REPLACE FUNCTION public.is_current_user_founder()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT is_founder FROM public.users WHERE id = auth.uid()),
    false
  );
$$;

REVOKE ALL ON FUNCTION public.is_current_user_founder() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.is_current_user_founder() TO authenticated, service_role;

-- Founder allowlist is duplicated here as the source of truth at the DB layer.
-- Keep in sync with src/lib/auth/founders.ts.
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_founder_emails text[] := ARRAY[
    'vbreygin@gmail.com',
    'v.breygin7990@gmail.com',
    'filmreecon@gmail.com'
  ];
  v_is_founder boolean;
  v_org_id uuid;
  v_role text;
  v_status text;
  v_full_name text;
BEGIN
  v_is_founder := lower(NEW.email) = ANY(v_founder_emails);
  v_full_name := NULLIF(NEW.raw_user_meta_data->>'full_name', '');

  IF v_is_founder THEN
    SELECT id INTO v_org_id FROM public.organizations WHERE slug = 'mandate-hq';
    IF v_org_id IS NULL THEN
      INSERT INTO public.organizations (name, slug)
      VALUES ('Mandate HQ', 'mandate-hq')
      RETURNING id INTO v_org_id;
    END IF;
    v_role   := 'admin';
    v_status := 'active';
  ELSE
    v_org_id := NULL;
    v_role   := 'recruiter';
    v_status := 'pending';
  END IF;

  INSERT INTO public.users (id, email, full_name, organization_id, role, is_founder, status)
  VALUES (NEW.id, NEW.email, v_full_name, v_org_id, v_role, v_is_founder, v_status);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

DROP POLICY IF EXISTS users_can_read_self ON public.users;
CREATE POLICY users_can_read_self ON public.users
  FOR SELECT TO authenticated
  USING (id = auth.uid());

DROP POLICY IF EXISTS founders_can_read_all_users ON public.users;
CREATE POLICY founders_can_read_all_users ON public.users
  FOR SELECT TO authenticated
  USING (public.is_current_user_founder());

DROP POLICY IF EXISTS founders_can_update_users ON public.users;
CREATE POLICY founders_can_update_users ON public.users
  FOR UPDATE TO authenticated
  USING (public.is_current_user_founder())
  WITH CHECK (public.is_current_user_founder());
