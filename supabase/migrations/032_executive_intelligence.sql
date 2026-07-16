-- Executive Hiring Intelligence — Phase 1 foundation.
--
-- New premium module for structured executive due diligence. This migration
-- creates the core tables, RLS, and the two RPCs that mirror the proven
-- job_specs versioning machinery (atomic version allocation, idempotent
-- generation, single-statement approval).
--
-- Deliberate reuse decisions:
--   * public.organizations already exists — no new tenant table.
--   * No executive_candidates table in Phase 1. Candidate linkage arrives in
--     Phase 2 as a join table onto the existing public.candidates model.
--
-- Audit trail (executive_audit_events) is append-only by policy: INSERT and
-- SELECT only, no UPDATE/DELETE policies exist, so rows are immutable for
-- app roles at the RLS layer.

-- ---------------------------------------------------------------------------
-- 1. Role templates — seeded intake presets. organization_id NULL = global
--    library row (readable by all tenants, managed out-of-band); non-NULL =
--    org-private template.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.executive_role_templates (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  key             text NOT NULL,
  title           text NOT NULL,
  summary         text NOT NULL DEFAULT '',
  role_family     text NOT NULL DEFAULT 'other',
  -- Prefill values for the Create Executive Search intake form.
  intake_defaults jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Array of { competency_key, weight, rationale } applied on search creation.
  competency_weights jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS executive_role_templates_global_key
  ON public.executive_role_templates (key) WHERE organization_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS executive_role_templates_org_key
  ON public.executive_role_templates (organization_id, key) WHERE organization_id IS NOT NULL;

ALTER TABLE public.executive_role_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY exec_templates_select ON public.executive_role_templates
  FOR SELECT TO authenticated
  USING (
    organization_id IS NULL
    OR organization_id = public.current_user_org_id()
  );

CREATE POLICY exec_templates_write ON public.executive_role_templates
  FOR ALL TO authenticated
  USING (
    organization_id IS NOT NULL
    AND organization_id = public.current_user_org_id()
  )
  WITH CHECK (
    organization_id IS NOT NULL
    AND organization_id = public.current_user_org_id()
  );

-- ---------------------------------------------------------------------------
-- 2. Competency library — evidence-based executive competencies. Same
--    global/org split as templates. Indicators are observable behaviors,
--    never psychological or protected-characteristic labels.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.executive_competencies (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  key                 text NOT NULL,
  name                text NOT NULL,
  category            text NOT NULL
                        CHECK (category IN ('leadership', 'functional', 'operating', 'governance')),
  definition          text NOT NULL,
  -- Observable evidence, e.g. "Has presented a technology strategy to a board".
  positive_indicators text[] NOT NULL DEFAULT ARRAY[]::text[],
  negative_indicators text[] NOT NULL DEFAULT ARRAY[]::text[],
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS executive_competencies_global_key
  ON public.executive_competencies (key) WHERE organization_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS executive_competencies_org_key
  ON public.executive_competencies (organization_id, key) WHERE organization_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS executive_competencies_category_idx
  ON public.executive_competencies (category);

ALTER TABLE public.executive_competencies ENABLE ROW LEVEL SECURITY;

CREATE POLICY exec_competencies_select ON public.executive_competencies
  FOR SELECT TO authenticated
  USING (
    organization_id IS NULL
    OR organization_id = public.current_user_org_id()
  );

CREATE POLICY exec_competencies_write ON public.executive_competencies
  FOR ALL TO authenticated
  USING (
    organization_id IS NOT NULL
    AND organization_id = public.current_user_org_id()
  )
  WITH CHECK (
    organization_id IS NOT NULL
    AND organization_id = public.current_user_org_id()
  );

-- ---------------------------------------------------------------------------
-- 3. Executive searches — one row per executive due-diligence engagement.
--    Intake fields are deliberately text (free-form ranges like "50–200 FTE")
--    — this is a structured brief, not an analytics schema.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.executive_searches (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by      uuid REFERENCES public.users(id),
  template_id     uuid REFERENCES public.executive_role_templates(id) ON DELETE SET NULL,
  status          text NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft', 'active', 'on_hold', 'closed')),
  service_tier    text NOT NULL DEFAULT 'standard'
                    CHECK (service_tier IN ('standard', 'premium', 'enterprise')),

  -- Company context
  company_name           text NOT NULL,
  industry               text,
  business_model         text,
  revenue_range          text,
  employee_count         text,
  funding_stage          text,
  ownership_structure    text,
  geographic_footprint   text,
  regulatory_environment text,

  -- Role definition
  role_title      text NOT NULL,
  role_family     text NOT NULL DEFAULT 'other',
  is_new_role     boolean,
  reason_for_hire text,
  reporting_line  text,
  board_exposure  text,
  team_size       text,
  budget_scope    text,

  -- Mandate & outcomes
  business_situation          text,
  expected_90_day_outcomes    text,
  expected_first_year_outcomes text,
  non_negotiables             text,
  preferred_leadership_style  text,

  -- Company Context Agent output + lifecycle. Mirrors the is_generating/
  -- generation_error pattern, flattened to one status column because the
  -- context lives on the search row itself rather than versioned rows.
  company_context        jsonb NOT NULL DEFAULT '{}'::jsonb,
  company_context_status text NOT NULL DEFAULT 'none'
                           CHECK (company_context_status IN ('none', 'generating', 'ready', 'failed')),
  company_context_error  text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS executive_searches_org_idx
  ON public.executive_searches (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS executive_searches_status_idx
  ON public.executive_searches (organization_id, status);
CREATE INDEX IF NOT EXISTS executive_searches_template_idx
  ON public.executive_searches (template_id);
CREATE INDEX IF NOT EXISTS executive_searches_created_by_idx
  ON public.executive_searches (created_by);

ALTER TABLE public.executive_searches ENABLE ROW LEVEL SECURITY;

-- Same org-scoping pattern used on every other org-owned table.
CREATE POLICY org_executive_searches_only ON public.executive_searches
  FOR ALL TO authenticated
  USING (
    organization_id IS NOT NULL
    AND organization_id = public.current_user_org_id()
  )
  WITH CHECK (
    organization_id IS NOT NULL
    AND organization_id = public.current_user_org_id()
  );

-- ---------------------------------------------------------------------------
-- 4. Role success profiles — versioned like job_specs. content_json holds the
--    structured Executive Success Profile; prompt_version/model_version give
--    full AI provenance. Approved rows are immutable by convention (guarded
--    in the app's UPDATE WHERE clauses) and superseded, never overwritten.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.role_success_profiles (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  search_id        uuid NOT NULL REFERENCES public.executive_searches(id) ON DELETE CASCADE,
  organization_id  uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  version          integer NOT NULL,
  content_json     jsonb NOT NULL DEFAULT '{}'::jsonb,
  status           text NOT NULL DEFAULT 'draft'
                     CHECK (status IN ('draft', 'approved', 'archived')),
  prompt_version   text,
  model_version    text,
  is_generating    boolean NOT NULL DEFAULT false,
  generation_error text,
  created_by       uuid REFERENCES public.users(id),
  approved_by      uuid REFERENCES public.users(id),
  approved_at      timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS unique_profile_version_per_search
  ON public.role_success_profiles (search_id, version);
-- At most one in-flight generation per search (idempotency backstop).
CREATE UNIQUE INDEX IF NOT EXISTS unique_generating_profile_per_search
  ON public.role_success_profiles (search_id) WHERE is_generating;
-- At most one approved profile per search (supersede invariant).
CREATE UNIQUE INDEX IF NOT EXISTS unique_approved_profile_per_search
  ON public.role_success_profiles (search_id) WHERE status = 'approved';
CREATE INDEX IF NOT EXISTS role_success_profiles_search_version_idx
  ON public.role_success_profiles (search_id, version DESC);
CREATE INDEX IF NOT EXISTS role_success_profiles_org_idx
  ON public.role_success_profiles (organization_id);
CREATE INDEX IF NOT EXISTS role_success_profiles_created_by_idx
  ON public.role_success_profiles (created_by);
CREATE INDEX IF NOT EXISTS role_success_profiles_approved_by_idx
  ON public.role_success_profiles (approved_by);

ALTER TABLE public.role_success_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY org_role_success_profiles_only ON public.role_success_profiles
  FOR ALL TO authenticated
  USING (
    organization_id IS NOT NULL
    AND organization_id = public.current_user_org_id()
  )
  WITH CHECK (
    organization_id IS NOT NULL
    AND organization_id = public.current_user_org_id()
  );

-- ---------------------------------------------------------------------------
-- 5. Per-search competency selections + weights.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.executive_search_competencies (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  search_id       uuid NOT NULL REFERENCES public.executive_searches(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  competency_id   uuid NOT NULL REFERENCES public.executive_competencies(id) ON DELETE CASCADE,
  weight          integer NOT NULL DEFAULT 50 CHECK (weight >= 0 AND weight <= 100),
  rationale       text NOT NULL DEFAULT '',
  source          text NOT NULL DEFAULT 'manual'
                    CHECK (source IN ('template', 'ai', 'manual')),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS unique_competency_per_search
  ON public.executive_search_competencies (search_id, competency_id);
CREATE INDEX IF NOT EXISTS exec_search_competencies_org_idx
  ON public.executive_search_competencies (organization_id);
CREATE INDEX IF NOT EXISTS exec_search_competencies_competency_idx
  ON public.executive_search_competencies (competency_id);

ALTER TABLE public.executive_search_competencies ENABLE ROW LEVEL SECURITY;

CREATE POLICY org_exec_search_competencies_only ON public.executive_search_competencies
  FOR ALL TO authenticated
  USING (
    organization_id IS NOT NULL
    AND organization_id = public.current_user_org_id()
  )
  WITH CHECK (
    organization_id IS NOT NULL
    AND organization_id = public.current_user_org_id()
  );

-- ---------------------------------------------------------------------------
-- 6. Append-only audit trail. INSERT + SELECT policies only — no UPDATE or
--    DELETE policy exists, so app roles cannot rewrite history.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.executive_audit_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  search_id       uuid REFERENCES public.executive_searches(id) ON DELETE CASCADE,
  profile_id      uuid REFERENCES public.role_success_profiles(id) ON DELETE SET NULL,
  actor_id        uuid REFERENCES public.users(id),
  event_type      text NOT NULL
                    CHECK (event_type IN (
                      'search_created',
                      'search_updated',
                      'profile_generation_requested',
                      'profile_generated',
                      'profile_generation_failed',
                      'profile_edited',
                      'profile_new_version',
                      'profile_regenerated',
                      'profile_approved'
                    )),
  detail          jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS executive_audit_events_search_idx
  ON public.executive_audit_events (search_id, created_at DESC);
CREATE INDEX IF NOT EXISTS executive_audit_events_org_idx
  ON public.executive_audit_events (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS executive_audit_events_profile_idx
  ON public.executive_audit_events (profile_id);
CREATE INDEX IF NOT EXISTS executive_audit_events_actor_idx
  ON public.executive_audit_events (actor_id);

ALTER TABLE public.executive_audit_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY exec_audit_select ON public.executive_audit_events
  FOR SELECT TO authenticated
  USING (
    organization_id IS NOT NULL
    AND organization_id = public.current_user_org_id()
  );

CREATE POLICY exec_audit_insert ON public.executive_audit_events
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id IS NOT NULL
    AND organization_id = public.current_user_org_id()
  );

-- ---------------------------------------------------------------------------
-- 7. RPC: atomic version allocation + insert, idempotent for generation.
--    Direct port of allocate_and_insert_job_spec (migration 011) onto
--    role_success_profiles: lock the parent search row, coalesce onto an
--    in-flight generation if one exists, otherwise allocate MAX(version)+1
--    and insert under the same lock.
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.allocate_and_insert_success_profile(
  p_search_id       uuid,
  p_organization_id uuid,
  p_content_json    jsonb,
  p_is_generating   boolean,
  p_created_by      uuid,
  p_prompt_version  text,
  p_model_version   text
)
RETURNS TABLE (id uuid, version int, was_existing boolean)
LANGUAGE plpgsql
AS $$
DECLARE
  v_locked_search_id uuid;
  v_existing_id      uuid;
  v_existing_version int;
  v_next_version     int;
  v_inserted_id      uuid;
BEGIN
  -- Lock the parent search row. RLS scopes by org (SECURITY INVOKER), so a
  -- NULL here means "not yours" or non-existent.
  SELECT executive_searches.id
    INTO v_locked_search_id
    FROM public.executive_searches
   WHERE executive_searches.id = p_search_id
   FOR UPDATE;

  IF v_locked_search_id IS NULL THEN
    RAISE EXCEPTION 'Executive search % not found or not accessible.', p_search_id
      USING ERRCODE = 'P0002';
  END IF;

  -- Idempotency: coalesce concurrent generation requests onto the in-flight
  -- placeholder instead of launching duplicate paid AI calls.
  IF p_is_generating THEN
    SELECT role_success_profiles.id, role_success_profiles.version
      INTO v_existing_id, v_existing_version
      FROM public.role_success_profiles
     WHERE role_success_profiles.search_id = p_search_id
       AND role_success_profiles.is_generating = true
     ORDER BY role_success_profiles.version DESC
     LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
      RETURN QUERY SELECT v_existing_id, v_existing_version, true::boolean;
      RETURN;
    END IF;
  END IF;

  SELECT COALESCE(MAX(role_success_profiles.version), 0) + 1
    INTO v_next_version
    FROM public.role_success_profiles
   WHERE role_success_profiles.search_id = p_search_id;

  INSERT INTO public.role_success_profiles (
    search_id, organization_id, version, content_json,
    status, is_generating, created_by, prompt_version, model_version
  )
  VALUES (
    p_search_id, p_organization_id, v_next_version, p_content_json,
    'draft', p_is_generating, p_created_by, p_prompt_version, p_model_version
  )
  RETURNING role_success_profiles.id INTO v_inserted_id;

  RETURN QUERY SELECT v_inserted_id, v_next_version, false::boolean;
END;
$$;

REVOKE ALL ON FUNCTION public.allocate_and_insert_success_profile(
  uuid, uuid, jsonb, boolean, uuid, text, text
) FROM public, anon;

GRANT EXECUTE ON FUNCTION public.allocate_and_insert_success_profile(
  uuid, uuid, jsonb, boolean, uuid, text, text
) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 8. RPC: approve a draft profile and archive the previously approved one in
--    a single UPDATE statement, so the partial unique index on
--    (search_id) WHERE status='approved' is checked at statement end and the
--    search can never end up with zero or two approved profiles on a partial
--    failure. Mirrors finalize_job_spec.
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.approve_success_profile(
  p_profile_id  uuid,
  p_search_id   uuid,
  p_approved_by uuid
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_target_id uuid;
BEGIN
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

  -- Single statement so the (search_id) WHERE status='approved' partial
  -- unique index is checked at statement end — approve + archive cannot
  -- partially apply.
  UPDATE public.role_success_profiles AS rsp
     SET status = CASE
                    WHEN rsp.id = p_profile_id THEN 'approved'
                    ELSE 'archived'
                  END,
         approved_by = CASE WHEN rsp.id = p_profile_id THEN p_approved_by ELSE rsp.approved_by END,
         approved_at = CASE WHEN rsp.id = p_profile_id THEN now() ELSE rsp.approved_at END,
         updated_at  = now()
   WHERE rsp.search_id = p_search_id
     AND (rsp.id = p_profile_id OR rsp.status = 'approved');
END;
$$;

REVOKE ALL ON FUNCTION public.approve_success_profile(uuid, uuid, uuid)
  FROM public, anon;

GRANT EXECUTE ON FUNCTION public.approve_success_profile(uuid, uuid, uuid)
  TO authenticated, service_role;
