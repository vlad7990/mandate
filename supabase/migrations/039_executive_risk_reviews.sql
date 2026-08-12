-- Executive Intelligence Phase 2d — Risk Reviews.
--
-- Per-candidate risk register: where the recorded evidence fails to address the
-- role's non-negotiables, derailers, required capabilities, and high-weight
-- competencies. AI-assisted (agent 18 words app-computed signals), so this
-- mirrors executive_interview_plans (mig 037) rather than the human-authored
-- assessments (mig 038): the generation columns are kept, along with the same
-- DB-level hardening — immutability trigger + RPC-only approval, atomic version
-- allocation that locks the candidate link, one-approved-per-candidate.
-- Keyed per (search_id, candidate_id).
--
-- Two things are specific to this table:
--
-- 1. The creation gate is stricter. A risk review is analysis OF an approved
--    assessment, so allocate_and_insert_risk_review requires one to exist —
--    which transitively requires the approved plan, profile, and linkage behind
--    it. The RPC looks the approved assessment up itself and stamps it as
--    source_assessment_id rather than accepting one from the caller, so the
--    recorded provenance is always the assessment that actually gated the row.
--
-- 2. Everything numeric in content_json (risk_signals, severity_summary) is
--    computed by the application from the approved profile + assessment +
--    operational weights and re-stamped on every save; it is never trusted from
--    the client. The severity counts measure unaddressed areas in the evidence
--    on file — diligence exposure — never a score of the person and never a
--    hire/no-hire recommendation.

-- ---------------------------------------------------------------------------
-- 1. Table
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.executive_risk_reviews (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  search_id            uuid NOT NULL REFERENCES public.executive_searches(id) ON DELETE CASCADE,
  candidate_id         uuid NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  organization_id      uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  -- The approved assessment this review analyses (primary input + provenance).
  source_assessment_id uuid REFERENCES public.executive_assessments(id) ON DELETE SET NULL,
  -- Provenance for the rest of the chain the signals were computed against.
  source_profile_id    uuid REFERENCES public.role_success_profiles(id) ON DELETE SET NULL,
  source_plan_id       uuid REFERENCES public.executive_interview_plans(id) ON DELETE SET NULL,
  version              integer NOT NULL,
  content_json         jsonb NOT NULL DEFAULT '{}'::jsonb,
  status               text NOT NULL DEFAULT 'draft'
                         CHECK (status IN ('draft', 'approved', 'archived')),
  prompt_version       text,
  model_version        text,
  is_generating        boolean NOT NULL DEFAULT false,
  generation_error     text,
  created_by           uuid REFERENCES public.users(id),
  approved_by          uuid REFERENCES public.users(id),
  approved_at          timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS unique_risk_review_version_per_candidate
  ON public.executive_risk_reviews (search_id, candidate_id, version);
CREATE UNIQUE INDEX IF NOT EXISTS unique_generating_risk_review_per_candidate
  ON public.executive_risk_reviews (search_id, candidate_id) WHERE is_generating;
CREATE UNIQUE INDEX IF NOT EXISTS unique_approved_risk_review_per_candidate
  ON public.executive_risk_reviews (search_id, candidate_id) WHERE status = 'approved';
CREATE INDEX IF NOT EXISTS risk_reviews_candidate_version_idx
  ON public.executive_risk_reviews (search_id, candidate_id, version DESC);
CREATE INDEX IF NOT EXISTS risk_reviews_org_idx
  ON public.executive_risk_reviews (organization_id);
CREATE INDEX IF NOT EXISTS risk_reviews_candidate_idx
  ON public.executive_risk_reviews (candidate_id);
CREATE INDEX IF NOT EXISTS risk_reviews_source_assessment_idx
  ON public.executive_risk_reviews (source_assessment_id);
CREATE INDEX IF NOT EXISTS risk_reviews_source_profile_idx
  ON public.executive_risk_reviews (source_profile_id);
CREATE INDEX IF NOT EXISTS risk_reviews_source_plan_idx
  ON public.executive_risk_reviews (source_plan_id);
CREATE INDEX IF NOT EXISTS risk_reviews_created_by_idx
  ON public.executive_risk_reviews (created_by);
CREATE INDEX IF NOT EXISTS risk_reviews_approved_by_idx
  ON public.executive_risk_reviews (approved_by);

ALTER TABLE public.executive_risk_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY org_risk_reviews_only ON public.executive_risk_reviews
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
-- 2. Immutability guard — same pattern as executive_interview_plans (mig 037)
--    and executive_assessments (mig 038). Approved/archived rows are
--    unmodifiable, and promotion to approved is RPC-only, for every role,
--    unless the transaction-local flag is set. Dedicated flag so risk-review,
--    assessment, plan, and profile approvals never interfere.
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.guard_executive_risk_reviews()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_transition_allowed boolean :=
    COALESCE(current_setting('mandate.allow_risk_review_transition', true), '') = 'on';
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'draft' AND NOT v_transition_allowed THEN
      RAISE EXCEPTION 'Risk reviews are created as drafts. Use approve_risk_review() to approve.'
        USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status IN ('approved', 'archived') AND NOT v_transition_allowed THEN
    RAISE EXCEPTION 'Risk review % is % and immutable. Create a new version instead.', OLD.id, OLD.status
      USING ERRCODE = 'P0001';
  END IF;

  IF NEW.status = 'approved'
     AND OLD.status IS DISTINCT FROM 'approved'
     AND NOT v_transition_allowed THEN
    RAISE EXCEPTION 'Use approve_risk_review() to approve a risk review.'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER executive_risk_reviews_guard
  BEFORE INSERT OR UPDATE ON public.executive_risk_reviews
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_executive_risk_reviews();

-- ---------------------------------------------------------------------------
-- 3. RPC: atomic version allocation + insert, idempotent for generation.
--    Locks the executive_search_candidates link row for (search, candidate) —
--    serializing concurrent generation and enforcing linkage — and then
--    requires an APPROVED assessment for that pair. source_assessment_id is
--    taken from that lookup, not from the caller.
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.allocate_and_insert_risk_review(
  p_search_id         uuid,
  p_candidate_id      uuid,
  p_organization_id   uuid,
  p_source_profile_id uuid,
  p_source_plan_id    uuid,
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
  v_locked_link_id  uuid;
  v_assessment_id   uuid;
  v_existing_id     uuid;
  v_existing_ver    int;
  v_next_version    int;
  v_inserted_id     uuid;
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

  -- The gate: a risk review is analysis of an approved assessment, which
  -- transitively requires the approved plan, profile, and linkage behind it.
  SELECT ea.id
    INTO v_assessment_id
    FROM public.executive_assessments AS ea
   WHERE ea.search_id = p_search_id
     AND ea.candidate_id = p_candidate_id
     AND ea.status = 'approved';

  IF v_assessment_id IS NULL THEN
    RAISE EXCEPTION 'Candidate % has no approved assessment for search % — approve one before generating a risk review.', p_candidate_id, p_search_id
      USING ERRCODE = 'P0002';
  END IF;

  IF p_is_generating THEN
    SELECT err.id, err.version
      INTO v_existing_id, v_existing_ver
      FROM public.executive_risk_reviews AS err
     WHERE err.search_id = p_search_id
       AND err.candidate_id = p_candidate_id
       AND err.is_generating = true
     ORDER BY err.version DESC
     LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
      RETURN QUERY SELECT v_existing_id, v_existing_ver, true::boolean;
      RETURN;
    END IF;
  END IF;

  SELECT COALESCE(MAX(err.version), 0) + 1
    INTO v_next_version
    FROM public.executive_risk_reviews AS err
   WHERE err.search_id = p_search_id
     AND err.candidate_id = p_candidate_id;

  INSERT INTO public.executive_risk_reviews (
    search_id, candidate_id, organization_id, source_assessment_id,
    source_profile_id, source_plan_id, version, content_json, status,
    is_generating, created_by, prompt_version, model_version
  )
  VALUES (
    p_search_id, p_candidate_id, p_organization_id, v_assessment_id,
    p_source_profile_id, p_source_plan_id, v_next_version, p_content_json, 'draft',
    p_is_generating, p_created_by, p_prompt_version, p_model_version
  )
  RETURNING executive_risk_reviews.id INTO v_inserted_id;

  RETURN QUERY SELECT v_inserted_id, v_next_version, false::boolean;
END;
$$;

REVOKE ALL ON FUNCTION public.allocate_and_insert_risk_review(
  uuid, uuid, uuid, uuid, uuid, jsonb, boolean, uuid, text, text
) FROM public, anon;

GRANT EXECUTE ON FUNCTION public.allocate_and_insert_risk_review(
  uuid, uuid, uuid, uuid, uuid, jsonb, boolean, uuid, text, text
) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. RPC: approve a draft risk review, archive the previously approved one.
--    Approver from auth.uid(); archive-then-promote to respect the per-row
--    partial unique index. Mirrors approve_interview_plan (mig 037), including
--    the healthy-draft requirement (not mid-generation, no generation error).
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.approve_risk_review(
  p_risk_review_id uuid,
  p_search_id      uuid,
  p_candidate_id   uuid
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_actor     uuid := auth.uid();
  v_target_id uuid;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required to approve a risk review.'
      USING ERRCODE = 'P0001';
  END IF;

  PERFORM set_config('mandate.allow_risk_review_transition', 'on', true);

  SELECT err.id
    INTO v_target_id
    FROM public.executive_risk_reviews AS err
   WHERE err.id = p_risk_review_id
     AND err.search_id = p_search_id
     AND err.candidate_id = p_candidate_id
     AND err.is_generating = false
     AND err.generation_error IS NULL
     AND err.status IN ('draft', 'archived')
   FOR UPDATE;

  IF v_target_id IS NULL THEN
    RAISE EXCEPTION 'Risk review % could not be approved (not found, not accessible, or not a healthy draft).', p_risk_review_id
      USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.executive_risk_reviews AS err
     SET status = 'archived', updated_at = now()
   WHERE err.search_id = p_search_id
     AND err.candidate_id = p_candidate_id
     AND err.status = 'approved'
     AND err.id <> p_risk_review_id;

  UPDATE public.executive_risk_reviews AS err
     SET status = 'approved',
         approved_by = v_actor,
         approved_at = now(),
         updated_at = now()
   WHERE err.id = p_risk_review_id;

  PERFORM set_config('mandate.allow_risk_review_transition', '', true);
END;
$$;

REVOKE ALL ON FUNCTION public.approve_risk_review(uuid, uuid, uuid)
  FROM public, anon;

GRANT EXECUTE ON FUNCTION public.approve_risk_review(uuid, uuid, uuid)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Audit: add a nullable risk_review_id column (symmetric with plan_id and
--    assessment_id) and the risk-review event types.
-- ---------------------------------------------------------------------------

ALTER TABLE public.executive_audit_events
  ADD COLUMN IF NOT EXISTS risk_review_id uuid
    REFERENCES public.executive_risk_reviews(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS executive_audit_events_risk_review_idx
  ON public.executive_audit_events (risk_review_id);

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
    'interview_plan_approved',
    'assessment_created',
    'assessment_edited',
    'assessment_new_version',
    'assessment_approved',
    'risk_review_generation_requested',
    'risk_review_generated',
    'risk_review_generation_failed',
    'risk_review_edited',
    'risk_review_new_version',
    'risk_review_regenerated',
    'risk_review_approved'
  ));
