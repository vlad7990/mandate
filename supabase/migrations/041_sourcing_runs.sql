-- Search Intelligence — sourcing runs, staged import results, attribution.
--
-- Design: docs/superpowers/specs/2026-08-12-sourcing-runs-design.md
--
-- A sourcing run makes an AI-guided search strategy a first-class object: the
-- brief, the reasoning, a SNAPSHOT of the queries, where it was run, what came
-- back, and — through candidates.pipeline_stage — what it eventually hired.
--
-- Two things differ from the versioned-artifact pattern this borrows from
-- (role_success_profiles / executive_interview_plans / …), and both are
-- deliberate:
--
--   1. Lineage BRANCHES rather than supersedes. Approving an interview plan v2
--      archives v1 because only one can be current. A search strategy is the
--      opposite: v1 must stay valid, because its yield is the baseline v2 is
--      measured against. So there is no archive-on-promote and no
--      one-current-per-project partial unique index.
--
--   2. The immutability guard freezes only PART of an executed row.
--      content_json is frozen for the same reason approved artifacts are —
--      edit the Boolean after importing results and the attribution silently
--      becomes a lie — but analysis_json stays writable, because coverage
--      analysis happens after execution by definition.

-- ---------------------------------------------------------------------------
-- 1. sourcing_runs
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.sourcing_runs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  organization_id   uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  -- Lineage. A v1 carries root_run_id = its own id; children inherit the
  -- ancestor's root so a whole family is one indexed read.
  parent_run_id     uuid REFERENCES public.sourcing_runs(id) ON DELETE SET NULL,
  root_run_id       uuid NOT NULL,
  version           integer NOT NULL,
  label             text,
  status            text NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft', 'executed', 'archived')),
  -- Brief + strategy_rationale + query SNAPSHOT. Snapshotted rather than
  -- referencing boolean_queries because those rows are themselves versioned:
  -- a later edit would otherwise rewrite the history of a completed run.
  content_json      jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Coverage findings + suggested next version. Written AFTER execution.
  analysis_json     jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Denormalized on purpose: the metrics page reads these per run and must not
  -- scan sourcing_run_results to render a list.
  result_count      integer NOT NULL DEFAULT 0,
  imported_count    integer NOT NULL DEFAULT 0,
  executed_at       timestamptz,
  executed_by       uuid REFERENCES public.users(id),
  prompt_version    text,
  model_version     text,
  created_by        uuid REFERENCES public.users(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS unique_sourcing_run_version_per_lineage
  ON public.sourcing_runs (root_run_id, version);
CREATE INDEX IF NOT EXISTS sourcing_runs_project_created_idx
  ON public.sourcing_runs (project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS sourcing_runs_org_idx
  ON public.sourcing_runs (organization_id);
CREATE INDEX IF NOT EXISTS sourcing_runs_parent_idx
  ON public.sourcing_runs (parent_run_id);
CREATE INDEX IF NOT EXISTS sourcing_runs_root_idx
  ON public.sourcing_runs (root_run_id);
CREATE INDEX IF NOT EXISTS sourcing_runs_created_by_idx
  ON public.sourcing_runs (created_by);
CREATE INDEX IF NOT EXISTS sourcing_runs_executed_by_idx
  ON public.sourcing_runs (executed_by);

ALTER TABLE public.sourcing_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY org_sourcing_runs_only ON public.sourcing_runs
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
-- 2. sourcing_run_results — staged imports. NOT candidates yet.
--
--    Pasted and exported data is messy, frequently duplicates people already
--    in the pool, and for anyone sourced rather than applied it creates a
--    personal-data record with obligations attached. A human confirms each row
--    before a candidates row exists.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.sourcing_run_results (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id                uuid NOT NULL REFERENCES public.sourcing_runs(id) ON DELETE CASCADE,
  organization_id       uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  full_name             text NOT NULL,
  current_title         text,
  current_company       text,
  location              text,
  profile_url           text,
  email                 text,
  -- Where this row came off. Free text rather than an enum so a new platform
  -- (or, later, a provider gateway source) needs no migration.
  source_platform       text NOT NULL,
  raw                   jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Dedupe verdict computed at import against the existing pool, using the
  -- same identity rule as count_network_people (mig 040) and identityKey.
  match_status          text NOT NULL DEFAULT 'new'
                          CHECK (match_status IN ('new', 'duplicate', 'ambiguous')),
  matched_candidate_id  uuid REFERENCES public.candidates(id) ON DELETE SET NULL,
  promoted_candidate_id uuid REFERENCES public.candidates(id) ON DELETE SET NULL,
  promoted_at           timestamptz,
  promoted_by           uuid REFERENCES public.users(id),
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sourcing_run_results_run_status_idx
  ON public.sourcing_run_results (run_id, match_status);
CREATE INDEX IF NOT EXISTS sourcing_run_results_org_idx
  ON public.sourcing_run_results (organization_id);
CREATE INDEX IF NOT EXISTS sourcing_run_results_matched_idx
  ON public.sourcing_run_results (matched_candidate_id);
CREATE INDEX IF NOT EXISTS sourcing_run_results_promoted_idx
  ON public.sourcing_run_results (promoted_candidate_id);
CREATE INDEX IF NOT EXISTS sourcing_run_results_promoted_by_idx
  ON public.sourcing_run_results (promoted_by);

ALTER TABLE public.sourcing_run_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY org_sourcing_run_results_only ON public.sourcing_run_results
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
-- 3. sourcing_run_candidates — attribution.
--
--    Every appearance is recorded so multi-touch is visible; the ATTRIBUTED
--    run is derived (earliest executed), never stored. Storing a winner would
--    leave it stale when an earlier run is back-filled later.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.sourcing_run_candidates (
  run_id          uuid NOT NULL REFERENCES public.sourcing_runs(id) ON DELETE CASCADE,
  candidate_id    uuid NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (run_id, candidate_id)
);

CREATE INDEX IF NOT EXISTS sourcing_run_candidates_candidate_idx
  ON public.sourcing_run_candidates (candidate_id);
CREATE INDEX IF NOT EXISTS sourcing_run_candidates_org_idx
  ON public.sourcing_run_candidates (organization_id);

ALTER TABLE public.sourcing_run_candidates ENABLE ROW LEVEL SECURITY;

CREATE POLICY org_sourcing_run_candidates_only ON public.sourcing_run_candidates
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
-- 4. Candidate provenance.
--
--    source_kind = 'sourced' marks a person who is in the system without
--    having approached us. GDPR Art. 14 requires notifying such a person when
--    their data is obtained from a third party; tracking it here makes the
--    obligation visible and actionable instead of implicit. These columns are
--    cheap to add now and painful to retrofit onto a populated table.
-- ---------------------------------------------------------------------------

ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS source_kind text
    CHECK (source_kind IS NULL
           OR source_kind IN ('applied', 'sourced', 'referred', 'imported')),
  ADD COLUMN IF NOT EXISTS source_platform text,
  ADD COLUMN IF NOT EXISTS source_url text,
  ADD COLUMN IF NOT EXISTS sourced_at timestamptz,
  ADD COLUMN IF NOT EXISTS subject_notified_at timestamptz;

CREATE INDEX IF NOT EXISTS candidates_source_kind_idx
  ON public.candidates (source_kind) WHERE source_kind IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 5. Attribution view — first touch.
--
--    A person surfaced by three runs would otherwise credit one hire to all
--    three and inflate every strategy's conversion. The attributed run is the
--    executed one with the earliest executed_at; id breaks ties so the result
--    is deterministic. Draft runs never attribute — nothing was executed.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.sourcing_candidate_attribution
WITH (security_invoker = true) AS
  SELECT DISTINCT ON (src.candidate_id)
    src.candidate_id,
    src.run_id           AS attributed_run_id,
    r.root_run_id        AS attributed_root_run_id,
    r.project_id,
    r.organization_id,
    r.executed_at        AS attributed_at
  FROM public.sourcing_run_candidates AS src
  JOIN public.sourcing_runs AS r ON r.id = src.run_id
  WHERE r.status = 'executed'
    AND r.executed_at IS NOT NULL
  ORDER BY src.candidate_id, r.executed_at ASC, r.id ASC;

-- `security_invoker` matters: without it the view would run as its owner and
-- leak attribution across organizations regardless of the RLS on the tables
-- underneath.

-- ---------------------------------------------------------------------------
-- 6. Immutability guard.
--
--    Freezes the executed record without freezing the analysis of it. Getting
--    this wrong in either direction is a real bug: freeze too much and
--    coverage analysis can never be written; freeze too little and the
--    strategy a run claims to have executed becomes editable after the fact.
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.guard_sourcing_runs()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_transition_allowed boolean :=
    COALESCE(current_setting('mandate.allow_sourcing_run_transition', true), '') = 'on';
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'draft' AND NOT v_transition_allowed THEN
      RAISE EXCEPTION 'Sourcing runs are created as drafts. Use mark_sourcing_run_executed() to execute.'
        USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status IN ('executed', 'archived') THEN
    -- The executed record is frozen. analysis_json, label, imported_count and
    -- retirement stay open — see the header note.
    IF NEW.content_json IS DISTINCT FROM OLD.content_json THEN
      RAISE EXCEPTION 'Sourcing run % is % — its strategy is frozen. Create a new version instead.', OLD.id, OLD.status
        USING ERRCODE = 'P0001';
    END IF;
    IF NEW.parent_run_id IS DISTINCT FROM OLD.parent_run_id
       OR NEW.root_run_id IS DISTINCT FROM OLD.root_run_id
       OR NEW.version IS DISTINCT FROM OLD.version THEN
      RAISE EXCEPTION 'Sourcing run % is % — its lineage is frozen.', OLD.id, OLD.status
        USING ERRCODE = 'P0001';
    END IF;
    IF NEW.executed_at IS DISTINCT FROM OLD.executed_at
       OR NEW.result_count IS DISTINCT FROM OLD.result_count THEN
      RAISE EXCEPTION 'Sourcing run % is % — its execution record is frozen.', OLD.id, OLD.status
        USING ERRCODE = 'P0001';
    END IF;
    IF NEW.status = 'draft' THEN
      RAISE EXCEPTION 'Sourcing run % cannot return to draft.', OLD.id
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF NEW.status = 'executed'
     AND OLD.status IS DISTINCT FROM 'executed'
     AND NOT v_transition_allowed THEN
    RAISE EXCEPTION 'Use mark_sourcing_run_executed() to execute a sourcing run.'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER sourcing_runs_guard
  BEFORE INSERT OR UPDATE ON public.sourcing_runs
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_sourcing_runs();

-- ---------------------------------------------------------------------------
-- 7. RPC: allocate a version within a lineage and insert.
--
--    The id is minted here rather than defaulted, because a v1's root_run_id
--    is its OWN id and a column default cannot be referenced by a sibling
--    column in the same INSERT.
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.allocate_and_insert_sourcing_run(
  p_project_id      uuid,
  p_organization_id uuid,
  p_parent_run_id   uuid,
  p_label           text,
  p_content_json    jsonb,
  p_created_by      uuid,
  p_prompt_version  text,
  p_model_version   text
)
RETURNS TABLE (id uuid, version int, root_run_id uuid)
LANGUAGE plpgsql
AS $$
DECLARE
  v_new_id       uuid := gen_random_uuid();
  v_root         uuid;
  v_next_version int;
  v_parent_proj  uuid;
BEGIN
  IF p_parent_run_id IS NULL THEN
    -- v1 of a new lineage: it is its own root.
    v_root := v_new_id;
    v_next_version := 1;
  ELSE
    -- Lock the parent so two concurrent refinements cannot allocate the same
    -- version number within one lineage.
    SELECT sr.root_run_id, sr.project_id
      INTO v_root, v_parent_proj
      FROM public.sourcing_runs AS sr
     WHERE sr.id = p_parent_run_id
     FOR UPDATE;

    IF v_root IS NULL THEN
      RAISE EXCEPTION 'Parent sourcing run % not found (or not accessible).', p_parent_run_id
        USING ERRCODE = 'P0002';
    END IF;

    IF v_parent_proj <> p_project_id THEN
      RAISE EXCEPTION 'Parent sourcing run % belongs to a different project.', p_parent_run_id
        USING ERRCODE = 'P0002';
    END IF;

    SELECT COALESCE(MAX(sr.version), 0) + 1
      INTO v_next_version
      FROM public.sourcing_runs AS sr
     WHERE sr.root_run_id = v_root;
  END IF;

  INSERT INTO public.sourcing_runs (
    id, project_id, organization_id, parent_run_id, root_run_id, version,
    label, status, content_json, created_by, prompt_version, model_version
  )
  VALUES (
    v_new_id, p_project_id, p_organization_id, p_parent_run_id, v_root,
    v_next_version, p_label, 'draft', COALESCE(p_content_json, '{}'::jsonb),
    p_created_by, p_prompt_version, p_model_version
  );

  RETURN QUERY SELECT v_new_id, v_next_version, v_root;
END;
$$;

REVOKE ALL ON FUNCTION public.allocate_and_insert_sourcing_run(
  uuid, uuid, uuid, text, jsonb, uuid, text, text
) FROM public, anon;

GRANT EXECUTE ON FUNCTION public.allocate_and_insert_sourcing_run(
  uuid, uuid, uuid, text, jsonb, uuid, text, text
) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 8. RPC: mark executed. The transition the guard keys on, so it is the only
--    sanctioned path out of draft.
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.mark_sourcing_run_executed(
  p_run_id       uuid,
  p_result_count integer
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_actor  uuid := auth.uid();
  v_target uuid;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required to execute a sourcing run.'
      USING ERRCODE = 'P0001';
  END IF;

  PERFORM set_config('mandate.allow_sourcing_run_transition', 'on', true);

  SELECT sr.id INTO v_target
    FROM public.sourcing_runs AS sr
   WHERE sr.id = p_run_id
     AND sr.status = 'draft'
   FOR UPDATE;

  IF v_target IS NULL THEN
    RAISE EXCEPTION 'Sourcing run % could not be executed (not found, not accessible, or not a draft).', p_run_id
      USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.sourcing_runs AS sr
     SET status = 'executed',
         executed_at = now(),
         executed_by = v_actor,
         result_count = GREATEST(COALESCE(p_result_count, 0), 0),
         updated_at = now()
   WHERE sr.id = p_run_id;

  PERFORM set_config('mandate.allow_sourcing_run_transition', '', true);
END;
$$;

REVOKE ALL ON FUNCTION public.mark_sourcing_run_executed(uuid, integer)
  FROM public, anon;

GRANT EXECUTE ON FUNCTION public.mark_sourcing_run_executed(uuid, integer)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 9. Erasure cascade for staged results.
--
--    candidates ON DELETE CASCADE clears the attribution link and NULLs the
--    matched/promoted pointers, but the staged row still holds the same
--    person's name, title, employer and profile URL. Erasing a candidate must
--    erase the staged copy too, or a deletion request is only half honoured.
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.purge_staged_results_for_candidate()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM public.sourcing_run_results AS srr
   WHERE srr.promoted_candidate_id = OLD.id
      OR srr.matched_candidate_id = OLD.id;
  RETURN OLD;
END;
$$;

CREATE TRIGGER candidates_purge_staged_results
  BEFORE DELETE ON public.candidates
  FOR EACH ROW
  EXECUTE FUNCTION public.purge_staged_results_for_candidate();
