-- Make AI generation idempotent per project.
--
-- Without this, double-clicks, concurrent tabs, retries, or direct server-
-- action posts can each create a placeholder version and launch a paid
-- Anthropic call for the same project. The atomic version RPC from 009
-- gave every duplicate a clean version number — but that meant every
-- duplicate succeeded.
--
-- Two parts:
--   1. Partial unique index — at most one is_generating=true row per
--      project. Hard backstop at the database layer.
--   2. RPC update — under the project lock, return the existing
--      in-flight row instead of inserting a new one when a generation is
--      already active. Adds a `was_existing` flag so callers can skip
--      launching a duplicate Anthropic call.
--
-- The RPC's return shape changes (added column), so the function must be
-- DROPped before re-CREATEd; CREATE OR REPLACE cannot change the
-- RETURNS TABLE signature.

CREATE UNIQUE INDEX IF NOT EXISTS unique_generating_per_project
  ON public.job_specs (project_id)
  WHERE is_generating = true;

DROP FUNCTION IF EXISTS public.allocate_and_insert_job_spec(
  uuid, uuid, text, jsonb, boolean, boolean, uuid
);

CREATE FUNCTION public.allocate_and_insert_job_spec(
  p_project_id      uuid,
  p_organization_id uuid,
  p_content         text,
  p_content_json    jsonb,
  p_is_final        boolean,
  p_is_generating   boolean,
  p_created_by      uuid
)
RETURNS TABLE (id uuid, version int, was_existing boolean)
LANGUAGE plpgsql
AS $$
DECLARE
  v_locked_project_id uuid;
  v_existing_id       uuid;
  v_existing_version  int;
  v_next_version      int;
  v_inserted_id       uuid;
BEGIN
  -- 1. Lock the parent project row. RLS scopes by org (SECURITY INVOKER),
  --    so a NULL here means "not yours" or non-existent.
  SELECT projects.id
    INTO v_locked_project_id
    FROM public.projects
   WHERE projects.id = p_project_id
   FOR UPDATE;

  IF v_locked_project_id IS NULL THEN
    RAISE EXCEPTION 'Project % not found or not accessible.', p_project_id
      USING ERRCODE = 'P0002';
  END IF;

  -- 2. Idempotency: if this is a generation request and a generation is
  --    already in flight for this project, return that row instead of
  --    creating a duplicate. Snapshots (p_is_generating=false) skip this
  --    check — they don't trigger the AI and don't need coalescing.
  IF p_is_generating THEN
    SELECT job_specs.id, job_specs.version
      INTO v_existing_id, v_existing_version
      FROM public.job_specs
     WHERE job_specs.project_id  = p_project_id
       AND job_specs.is_generating = true
     ORDER BY job_specs.version DESC
     LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
      RETURN QUERY SELECT v_existing_id, v_existing_version, true::boolean;
      RETURN;
    END IF;
  END IF;

  -- 3. Allocate the next version (lock still held).
  SELECT COALESCE(MAX(job_specs.version), 0) + 1
    INTO v_next_version
    FROM public.job_specs
   WHERE job_specs.project_id = p_project_id;

  -- 4. INSERT in the same transaction.
  INSERT INTO public.job_specs (
    project_id, organization_id, version,
    content,    content_json,
    is_final,   is_generating, created_by
  )
  VALUES (
    p_project_id, p_organization_id, v_next_version,
    p_content,    p_content_json,
    p_is_final,   p_is_generating,   p_created_by
  )
  RETURNING job_specs.id INTO v_inserted_id;

  RETURN QUERY SELECT v_inserted_id, v_next_version, false::boolean;
END;
$$;

REVOKE ALL ON FUNCTION public.allocate_and_insert_job_spec(
  uuid, uuid, text, jsonb, boolean, boolean, uuid
) FROM public, anon;

GRANT EXECUTE ON FUNCTION public.allocate_and_insert_job_spec(
  uuid, uuid, text, jsonb, boolean, boolean, uuid
) TO authenticated, service_role;
