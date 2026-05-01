-- F6 — Request System Access
--
-- Public-facing waitlist for new users requesting access to Mandate.
-- Submissions land here (no auth required), founders triage from
-- /settings/waitlist.

CREATE TABLE IF NOT EXISTS public.waitlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  email text NOT NULL,
  company text,
  role text,
  referral_source text,
  use_case text,
  -- "pending" | "approved" | "rejected"
  status text NOT NULL DEFAULT 'pending',
  -- Free-form admin notes per applicant.
  notes text,
  reviewed_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS waitlist_email_unique
  ON public.waitlist (lower(email));

CREATE INDEX IF NOT EXISTS waitlist_status_idx
  ON public.waitlist (status, created_at DESC);

ALTER TABLE public.waitlist ENABLE ROW LEVEL SECURITY;

-- Public can INSERT (the request-access form is unauthenticated). We
-- allow anonymous inserts but never SELECT — the form gives no
-- feedback beyond a generic thank-you, so duplicate-email cases are
-- handled by the unique index returning a helpful error.
CREATE POLICY waitlist_anon_insert
  ON public.waitlist
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Founders see and update everything. The `is_founder` flag on
-- public.users is the single source of truth for admin access.
CREATE POLICY waitlist_founder_select
  ON public.waitlist
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.is_founder = true
    )
  );

CREATE POLICY waitlist_founder_update
  ON public.waitlist
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.is_founder = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.is_founder = true
    )
  );
