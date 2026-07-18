-- Executive Intelligence Phase 2c — Assessments.
--
-- Per-candidate evidence capture: structured observations from interviews that
-- actually happened, rated per competency and scored against the operational
-- competency weights (executive_search_competencies). Human-authored — there is
-- NO AI agent and NO generation placeholder, so the AI-only columns from
-- executive_interview_plans (is_generating, generation_error, prompt/model
-- version) are intentionally omitted. Everything else mirrors mig 037: one
-- versioned row per version, full body in content_json, draft→approved→archived
-- lifecycle with the same DB-level hardening (immutability trigger + RPC-only
-- approval, atomic version allocation that locks the candidate link,
-- one-approved-per-candidate invariant). Keyed per (search_id, candidate_id).
--
-- The evidence rollup / weighted strength inside content_json is computed by the
-- application server-side from the operational weights and re-stamped on every
-- save; it is never trusted from the client. It is an "evidence strength"
-- summary, never a hire/no-hire recommendation.

-- ---------------------------------------------------------------------------
-- 1. Table
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.executive_assessments (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  search_id         uuid NOT NULL REFERENCES public.executive_searches(id) ON DELETE CASCADE,
  candidate_id      uuid NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  organization_id   uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  -- Which approved interview plan this assessment was structured from (provenance).
  source_plan_id    uuid REFERENCES public.executive_interview_plans(id) ON DELETE SET NULL,
  version           integer NOT NULL,
  content_json      jsonb NOT NULL DEFAULT '{}'::jsonb,
  status            text NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft', 'approved', 'archived')),
  created_by        uuid REFERENCES public.users(id),
  approved_by       uuid REFERENCES public.users(id),
  approved_at       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS unique_assessment_version_per_candidate
  ON public.executive_assessments (search_id, candidate_id, version);
CREATE UNIQUE INDEX IF NOT EXISTS unique_approved_assessment_per_candidate
  ON public.executive_assessments (search_id, candidate_id) WHERE status = 'approved';
CREATE INDEX IF NOT EXISTS assessments_candidate_version_idx
  ON public.executive_assessments (search_id, candidate_id, version DESC);
CREATE INDEX IF NOT EXISTS assessments_org_idx
  ON public.executive_assessments (organization_id);
CREATE INDEX IF NOT EXISTS assessments_candidate_idx
  ON public.executive_assessments (candidate_id);
CREATE INDEX IF NOT EXISTS assessments_source_plan_idx
  ON public.executive_assessments (source_plan_id);
CREATE INDEX IF NOT EXISTS assessments_created_by_idx
  ON public.executive_assessments (created_by);
CREATE INDEX IF NOT EXISTS assessments_approved_by_idx
  ON public.executive_assessments (approved_by);

ALTER TABLE public.executive_assessments ENABLE ROW LEVEL SECURITY;

CREATE POLICY org_assessments_only ON public.executive_assessments
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
-- 2. Immutability guard — same pattern as executive_interview_plans (mig 037).
--    Approved/archived rows are unmodifiable, and promotion to approved is
--    RPC-only, for every role, unless the transaction-local flag is set. Uses a
--    dedicated flag so assessment, plan, and profile approvals never interfere.
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.guard_executive_assessments()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_transition_allowed boolean :=
    COALESCE(current_setting('mandate.allow_assessment_transition', true), '') = 'on';
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'draft' AND NOT v_transition_allowed THEN
      RAISE EXCEPTION 'Assessments are created as drafts. Use approve_assessment() to approve.'
        USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status IN ('approved', 'archived') AND NOT v_transition_allowed THEN
    RAISE EXCEPTION 'Assessment % is % and immutable. Create a new version instead.', OLD.id, OLD.status
      USING ERRCODE = 'P0001';
  END IF;

  IF NEW.status = 'approved'
     AND OLD.status IS DISTINCT FROM 'approved'
     AND NOT v_transition_allowed THEN
    RAISE EXCEPTION 'Use approve_assessment() to approve an assessment.'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER executive_assessments_guard
  BEFORE INSERT OR UPDATE ON public.executive_assessments
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_executive_assessments();

-- ---------------------------------------------------------------------------
-- 3. RPC: atomic version allocation + insert. Locks the
--    executive_search_candidates link row for (search, candidate) — this both
--    serializes concurrent creation and enforces that the candidate is actually
--    linked to the search. No is_generating idempotency branch (human-authored,
--    no placeholder); was_existing is returned for signature symmetry with the
--    plan RPC and is always false.
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.allocate_and_insert_assessment(
  p_search_id       uuid,
  p_candidate_id    uuid,
  p_organization_id uuid,
  p_source_plan_id  uuid,
  p_content_json    jsonb,
  p_created_by      uuid
)
RETURNS TABLE (id uuid, version int, was_existing boolean)
LANGUAGE plpgsql
AS $$
DECLARE
  v_locked_link_id uuid;
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

  SELECT COALESCE(MAX(ea.version), 0) + 1
    INTO v_next_version
    FROM public.executive_assessments AS ea
   WHERE ea.search_id = p_search_id
     AND ea.candidate_id = p_candidate_id;

  INSERT INTO public.executive_assessments (
    search_id, candidate_id, organization_id, source_plan_id, version,
    content_json, status, created_by
  )
  VALUES (
    p_search_id, p_candidate_id, p_organization_id, p_source_plan_id, v_next_version,
    p_content_json, 'draft', p_created_by
  )
  RETURNING executive_assessments.id INTO v_inserted_id;

  RETURN QUERY SELECT v_inserted_id, v_next_version, false::boolean;
END;
$$;

REVOKE ALL ON FUNCTION public.allocate_and_insert_assessment(
  uuid, uuid, uuid, uuid, jsonb, uuid
) FROM public, anon;

GRANT EXECUTE ON FUNCTION public.allocate_and_insert_assessment(
  uuid, uuid, uuid, uuid, jsonb, uuid
) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. RPC: approve a draft assessment, archive the previously approved one.
--    Approver from auth.uid(); archive-then-promote to respect the per-row
--    partial unique index. Mirrors approve_interview_plan (mig 037).
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.approve_assessment(
  p_assessment_id uuid,
  p_search_id     uuid,
  p_candidate_id  uuid
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_actor     uuid := auth.uid();
  v_target_id uuid;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required to approve an assessment.'
      USING ERRCODE = 'P0001';
  END IF;

  PERFORM set_config('mandate.allow_assessment_transition', 'on', true);

  SELECT ea.id
    INTO v_target_id
    FROM public.executive_assessments AS ea
   WHERE ea.id = p_assessment_id
     AND ea.search_id = p_search_id
     AND ea.candidate_id = p_candidate_id
     AND ea.status IN ('draft', 'archived')
   FOR UPDATE;

  IF v_target_id IS NULL THEN
    RAISE EXCEPTION 'Assessment % could not be approved (not found, not accessible, or not a draft).', p_assessment_id
      USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.executive_assessments AS ea
     SET status = 'archived', updated_at = now()
   WHERE ea.search_id = p_search_id
     AND ea.candidate_id = p_candidate_id
     AND ea.status = 'approved'
     AND ea.id <> p_assessment_id;

  UPDATE public.executive_assessments AS ea
     SET status = 'approved',
         approved_by = v_actor,
         approved_at = now(),
         updated_at = now()
   WHERE ea.id = p_assessment_id;

  PERFORM set_config('mandate.allow_assessment_transition', '', true);
END;
$$;

REVOKE ALL ON FUNCTION public.approve_assessment(uuid, uuid, uuid)
  FROM public, anon;

GRANT EXECUTE ON FUNCTION public.approve_assessment(uuid, uuid, uuid)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Audit: add a nullable assessment_id column (symmetric with plan_id) and
--    the assessment event types.
-- ---------------------------------------------------------------------------

ALTER TABLE public.executive_audit_events
  ADD COLUMN IF NOT EXISTS assessment_id uuid
    REFERENCES public.executive_assessments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS executive_audit_events_assessment_idx
  ON public.executive_audit_events (assessment_id);

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
    'assessment_approved'
  ));
