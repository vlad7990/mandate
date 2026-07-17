-- Executive Intelligence Phase 2 — Interview Plans.
--
-- Per-candidate interview plans built from the approved Role Success Profile,
-- the operational competency weights (executive_search_competencies), and
-- candidate context. Modeled exactly like role_success_profiles: one versioned
-- row per version, full plan in content_json, draft→approved→archived lifecycle
-- with the same DB-level hardening (immutability trigger + RPC-only approval,
-- atomic version allocation, one-approved-per-plan invariant).
--
-- Design note — why one table with content_json, not the suggested
-- plans/stages/questions triple: the plan is authored, reviewed, and approved
-- as a single document, and versioning normalized child rows (stages,
-- questions) would require parallel version columns and cascade bookkeeping on
-- every child. Storing the stages+questions structure in content_json keeps the
-- proven success-profile versioning/immutability machinery intact and the
-- editor consistent. The plan is keyed per (search_id, candidate_id).

-- ---------------------------------------------------------------------------
-- 1. Table
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.executive_interview_plans (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  search_id         uuid NOT NULL REFERENCES public.executive_searches(id) ON DELETE CASCADE,
  candidate_id      uuid NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  organization_id   uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  -- Which approved success profile this plan was generated from (provenance).
  source_profile_id uuid REFERENCES public.role_success_profiles(id) ON DELETE SET NULL,
  version           integer NOT NULL,
  content_json      jsonb NOT NULL DEFAULT '{}'::jsonb,
  status            text NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft', 'approved', 'archived')),
  prompt_version    text,
  model_version     text,
  is_generating     boolean NOT NULL DEFAULT false,
  generation_error  text,
  created_by        uuid REFERENCES public.users(id),
  approved_by       uuid REFERENCES public.users(id),
  approved_at       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS unique_plan_version_per_candidate
  ON public.executive_interview_plans (search_id, candidate_id, version);
CREATE UNIQUE INDEX IF NOT EXISTS unique_generating_plan_per_candidate
  ON public.executive_interview_plans (search_id, candidate_id) WHERE is_generating;
CREATE UNIQUE INDEX IF NOT EXISTS unique_approved_plan_per_candidate
  ON public.executive_interview_plans (search_id, candidate_id) WHERE status = 'approved';
CREATE INDEX IF NOT EXISTS interview_plans_candidate_version_idx
  ON public.executive_interview_plans (search_id, candidate_id, version DESC);
CREATE INDEX IF NOT EXISTS interview_plans_org_idx
  ON public.executive_interview_plans (organization_id);
CREATE INDEX IF NOT EXISTS interview_plans_candidate_idx
  ON public.executive_interview_plans (candidate_id);
CREATE INDEX IF NOT EXISTS interview_plans_source_profile_idx
  ON public.executive_interview_plans (source_profile_id);
CREATE INDEX IF NOT EXISTS interview_plans_created_by_idx
  ON public.executive_interview_plans (created_by);
CREATE INDEX IF NOT EXISTS interview_plans_approved_by_idx
  ON public.executive_interview_plans (approved_by);

ALTER TABLE public.executive_interview_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY org_interview_plans_only ON public.executive_interview_plans
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
-- 2. Immutability guard — same pattern as role_success_profiles (migration
--    034). Approved/archived rows are unmodifiable, and promotion to approved
--    is RPC-only, for every role, unless the transaction-local flag is set.
--    Uses a dedicated flag so plan and profile approvals never interfere.
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.guard_executive_interview_plans()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_transition_allowed boolean :=
    COALESCE(current_setting('mandate.allow_plan_transition', true), '') = 'on';
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'draft' AND NOT v_transition_allowed THEN
      RAISE EXCEPTION 'Interview plans are created as drafts. Use approve_interview_plan() to approve.'
        USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status IN ('approved', 'archived') AND NOT v_transition_allowed THEN
    RAISE EXCEPTION 'Interview plan % is % and immutable. Create a new version instead.', OLD.id, OLD.status
      USING ERRCODE = 'P0001';
  END IF;

  IF NEW.status = 'approved'
     AND OLD.status IS DISTINCT FROM 'approved'
     AND NOT v_transition_allowed THEN
    RAISE EXCEPTION 'Use approve_interview_plan() to approve an interview plan.'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER executive_interview_plans_guard
  BEFORE INSERT OR UPDATE ON public.executive_interview_plans
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_executive_interview_plans();

-- ---------------------------------------------------------------------------
-- 3. RPC: atomic version allocation + insert, idempotent for generation.
--    Locks the executive_search_candidates link row for (search, candidate) —
--    this both serializes concurrent generation for the same candidate-plan
--    and enforces that the candidate is actually linked to the search.
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.allocate_and_insert_interview_plan(
  p_search_id         uuid,
  p_candidate_id      uuid,
  p_organization_id   uuid,
  p_source_profile_id uuid,
  p_content_json      jsonb,
  p_is_generating     boolean,
  p_created_by        uuid,
  p_prompt_version    text,
  p_model_version     text
)
RETURNS TABLE (id uuid, version int, was_existing boolean)
LANGUAGE plpgsql
AS $$
DECLARE
  v_locked_link_id uuid;
  v_existing_id    uuid;
  v_existing_ver   int;
  v_next_version   int;
  v_inserted_id    uuid;
BEGIN
  -- Lock the candidate-linkage row. RLS scopes by org, so a NULL means the
  -- candidate is not linked to this search (or not accessible).
  SELECT esc.id
    INTO v_locked_link_id
    FROM public.executive_search_candidates AS esc
   WHERE esc.search_id = p_search_id
     AND esc.candidate_id = p_candidate_id
   FOR UPDATE;

  IF v_locked_link_id IS NULL THEN
    RAISE EXCEPTION 'Candidate % is not linked to search % (or not accessible).', p_candidate_id, p_search_id
      USING ERRCODE = 'P0002';
  END IF;

  IF p_is_generating THEN
    SELECT eip.id, eip.version
      INTO v_existing_id, v_existing_ver
      FROM public.executive_interview_plans AS eip
     WHERE eip.search_id = p_search_id
       AND eip.candidate_id = p_candidate_id
       AND eip.is_generating = true
     ORDER BY eip.version DESC
     LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
      RETURN QUERY SELECT v_existing_id, v_existing_ver, true::boolean;
      RETURN;
    END IF;
  END IF;

  SELECT COALESCE(MAX(eip.version), 0) + 1
    INTO v_next_version
    FROM public.executive_interview_plans AS eip
   WHERE eip.search_id = p_search_id
     AND eip.candidate_id = p_candidate_id;

  INSERT INTO public.executive_interview_plans (
    search_id, candidate_id, organization_id, source_profile_id, version,
    content_json, status, is_generating, created_by, prompt_version, model_version
  )
  VALUES (
    p_search_id, p_candidate_id, p_organization_id, p_source_profile_id, v_next_version,
    p_content_json, 'draft', p_is_generating, p_created_by, p_prompt_version, p_model_version
  )
  RETURNING executive_interview_plans.id INTO v_inserted_id;

  RETURN QUERY SELECT v_inserted_id, v_next_version, false::boolean;
END;
$$;

REVOKE ALL ON FUNCTION public.allocate_and_insert_interview_plan(
  uuid, uuid, uuid, uuid, jsonb, boolean, uuid, text, text
) FROM public, anon;

GRANT EXECUTE ON FUNCTION public.allocate_and_insert_interview_plan(
  uuid, uuid, uuid, uuid, jsonb, boolean, uuid, text, text
) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. RPC: approve a draft plan, archive the previously approved one. Approver
--    from auth.uid(); archive-then-promote to respect the per-row partial
--    unique index. Mirrors approve_success_profile (migration 035).
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.approve_interview_plan(
  p_plan_id      uuid,
  p_search_id    uuid,
  p_candidate_id uuid
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_actor     uuid := auth.uid();
  v_target_id uuid;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required to approve an interview plan.'
      USING ERRCODE = 'P0001';
  END IF;

  PERFORM set_config('mandate.allow_plan_transition', 'on', true);

  SELECT eip.id
    INTO v_target_id
    FROM public.executive_interview_plans AS eip
   WHERE eip.id = p_plan_id
     AND eip.search_id = p_search_id
     AND eip.candidate_id = p_candidate_id
     AND eip.is_generating = false
     AND eip.generation_error IS NULL
     AND eip.status IN ('draft', 'archived')
   FOR UPDATE;

  IF v_target_id IS NULL THEN
    RAISE EXCEPTION 'Interview plan % could not be approved (not found, not accessible, or not a healthy draft).', p_plan_id
      USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.executive_interview_plans AS eip
     SET status = 'archived', updated_at = now()
   WHERE eip.search_id = p_search_id
     AND eip.candidate_id = p_candidate_id
     AND eip.status = 'approved'
     AND eip.id <> p_plan_id;

  UPDATE public.executive_interview_plans AS eip
     SET status = 'approved',
         approved_by = v_actor,
         approved_at = now(),
         updated_at = now()
   WHERE eip.id = p_plan_id;

  PERFORM set_config('mandate.allow_plan_transition', '', true);
END;
$$;

REVOKE ALL ON FUNCTION public.approve_interview_plan(uuid, uuid, uuid)
  FROM public, anon;

GRANT EXECUTE ON FUNCTION public.approve_interview_plan(uuid, uuid, uuid)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Audit: add a nullable plan_id column (symmetric with profile_id) and the
--    interview-plan event types.
-- ---------------------------------------------------------------------------

ALTER TABLE public.executive_audit_events
  ADD COLUMN IF NOT EXISTS plan_id uuid
    REFERENCES public.executive_interview_plans(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS executive_audit_events_plan_idx
  ON public.executive_audit_events (plan_id);

ALTER TABLE public.executive_audit_events
  DROP CONSTRAINT IF EXISTS executive_audit_events_event_type_check;

ALTER TABLE public.executive_audit_events
  ADD CONSTRAINT executive_audit_events_event_type_check
  CHECK (event_type IN (
    'search_created',
    'search_updated',
    'profile_generation_requested',
    'profile_generated',
    'profile_generation_failed',
    'profile_edited',
    'profile_new_version',
    'profile_regenerated',
    'profile_approved',
    'candidate_linked',
    'candidate_unlinked',
    'candidate_stage_changed',
    'interview_plan_generation_requested',
    'interview_plan_generated',
    'interview_plan_generation_failed',
    'interview_plan_edited',
    'interview_plan_new_version',
    'interview_plan_regenerated',
    'interview_plan_approved'
  ));
