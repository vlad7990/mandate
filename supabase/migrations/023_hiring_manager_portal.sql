-- Hiring Manager Portal — token-based public read access + structured
-- HM feedback capture.
--
-- Two tables:
--
-- 1. hiring_manager_tokens
--    Founders generate a token-bearing share link per project. The
--    public /hm/[token] route verifies the token via a SECURITY DEFINER
--    RPC and renders a read-only portal. RLS on the table itself is
--    org-scoped so only authenticated members of the owning org can
--    list/revoke their own tokens.
--
-- 2. hiring_manager_reviews
--    The structured feedback the HM submits from the portal. Stored
--    separately from the existing `feedback` table so the HM workflow
--    can evolve (drag-to-reorder priority, per-candidate Strong-Yes/
--    Yes/Maybe/No, "what concerns you most") without changing the
--    feedback agent's schema. The submit action ALSO writes a feedback
--    row so the existing recalibration loop still fires.
--
-- The /hm/[token] route uses the service-role Supabase client to bypass
-- RLS — but only after the verification RPC has confirmed the token is
-- valid, unrevoked, and unexpired. The route only ever reads/writes
-- data scoped to the project that token authorises.

-- ───────────────────────────────────────────────────────────────────────
-- hiring_manager_tokens
-- ───────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.hiring_manager_tokens (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  -- The shareable secret. Random uuid; rendered into the URL as-is.
  token           uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  -- Recipient label so founders can recognise tokens at a glance ("Jane @ Acme").
  label           text NOT NULL DEFAULT '',
  created_by      uuid REFERENCES public.users(id) ON DELETE SET NULL,
  expires_at      timestamptz NOT NULL,
  revoked_at      timestamptz,
  last_used_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.hiring_manager_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS org_hm_tokens_only ON public.hiring_manager_tokens;
CREATE POLICY org_hm_tokens_only ON public.hiring_manager_tokens
  FOR ALL TO authenticated
  USING (
    organization_id IS NOT NULL
    AND organization_id = public.current_user_org_id()
  )
  WITH CHECK (
    organization_id IS NOT NULL
    AND organization_id = public.current_user_org_id()
  );

CREATE INDEX IF NOT EXISTS hm_tokens_project_idx
  ON public.hiring_manager_tokens (project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS hm_tokens_token_idx
  ON public.hiring_manager_tokens (token);

-- ───────────────────────────────────────────────────────────────────────
-- hiring_manager_reviews
-- ───────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.hiring_manager_reviews (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  token_id        uuid REFERENCES public.hiring_manager_tokens(id) ON DELETE SET NULL,
  -- One row per submission. candidate_ratings is keyed by candidate
  -- uuid:
  --   { "<uuid>": { "rating": "strong_yes"|"yes"|"maybe"|"no",
  --                 "feedback": string } }
  candidate_ratings jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Free-text answer to "What concerns you most?".
  top_concern     text NOT NULL DEFAULT '',
  -- Recruiter-presented order; updated by the drag handles in the UI.
  priority_order  uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
  -- Captured for audit; HM is anonymous.
  hm_label        text NOT NULL DEFAULT '',
  submitted_at    timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.hiring_manager_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS org_hm_reviews_only ON public.hiring_manager_reviews;
CREATE POLICY org_hm_reviews_only ON public.hiring_manager_reviews
  FOR ALL TO authenticated
  USING (
    organization_id IS NOT NULL
    AND organization_id = public.current_user_org_id()
  )
  WITH CHECK (
    organization_id IS NOT NULL
    AND organization_id = public.current_user_org_id()
  );

CREATE INDEX IF NOT EXISTS hm_reviews_project_idx
  ON public.hiring_manager_reviews (project_id, submitted_at DESC);

-- ───────────────────────────────────────────────────────────────────────
-- verify_hm_token RPC
--
-- Returns the {project_id, organization_id} pair the token authorises,
-- or NULL when the token doesn't exist / is revoked / has expired.
-- SECURITY DEFINER so the public /hm/[token] route can call it without
-- a Supabase session. Side-effect: bumps last_used_at.
-- ───────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.verify_hm_token(p_token uuid)
RETURNS TABLE(project_id uuid, organization_id uuid, label text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_token IS NULL THEN
    RETURN;
  END IF;

  -- Bump last_used_at and return the auth context in one round trip.
  RETURN QUERY
  UPDATE public.hiring_manager_tokens
     SET last_used_at = now(),
         updated_at   = now()
   WHERE token = p_token
     AND revoked_at IS NULL
     AND expires_at > now()
  RETURNING hiring_manager_tokens.project_id,
            hiring_manager_tokens.organization_id,
            hiring_manager_tokens.label;
END;
$$;

REVOKE ALL ON FUNCTION public.verify_hm_token(uuid) FROM public, authenticated;
-- Anonymous callers (the public route uses the anon key directly via
-- the Supabase client) need EXECUTE so the route can verify tokens
-- without a session. The function only returns the project_id/org_id
-- pair; it doesn't expose the candidates table itself.
GRANT EXECUTE ON FUNCTION public.verify_hm_token(uuid) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.verify_hm_token(uuid) IS
  'Verify a hiring-manager share token and bump its last_used_at. Returns (project_id, organization_id, label) when valid, empty result when revoked/expired/unknown. SECURITY DEFINER.';
