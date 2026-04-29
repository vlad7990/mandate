-- Atomic allocate-and-insert for job_specs versions.
--
-- Migration 007 introduced next_job_spec_version() which locked the parent
-- project row, but the lock was released when the RPC returned, before the
-- caller's INSERT statement reached the database. Concurrent allocators
-- could therefore all observe the same MAX(version), call the RPC, get
-- the same N+1, and then race on the INSERT — only one wins, the rest
-- collide on unique_job_spec_version_per_project. The single retry didn't
-- guarantee progress under sustained concurrency.
--
-- This RPC moves both steps into one transaction so the project row lock
-- is held continuously from acquisition through the INSERT. Concurrent
-- callers serialise on the lock and each gets a distinct, monotonically
-- increasing version — no collisions, no retries needed.
--
-- next_job_spec_version is left in place: still useful as a building
-- block, and removing it would break compatibility with anything that
-- happens to call it. New code should prefer this RPC.

CREATE OR REPLACE FUNCTION public.allocate_and_insert_job_spec(
  p_project_id      uuid,
  p_organization_id uuid,
  p_content         text,
  p_content_json    jsonb,
  p_is_final        boolean,
  p_is_generating   boolean,
  p_created_by      uuid
)
RETURNS TABLE (id uuid, version int)
LANGUAGE plpgsql
AS $$
DECLARE
  v_locked_project_id uuid;
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

  -- 2. Allocate the next version. The lock acquired in step 1 is still
  --    held — concurrent callers wait on it.
  SELECT COALESCE(MAX(job_specs.version), 0) + 1
    INTO v_next_version
    FROM public.job_specs
   WHERE job_specs.project_id = p_project_id;

  -- 3. INSERT in the same transaction. Lock is still held; the INSERT
  --    completes before any concurrent caller can read MAX(version).
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

  -- 4. Return the new row's id and version. RETURN QUERY is the canonical
  --    way to emit a row from a RETURNS TABLE function.
  RETURN QUERY SELECT v_inserted_id, v_next_version;
END;
$$;

REVOKE ALL ON FUNCTION public.allocate_and_insert_job_spec(
  uuid, uuid, text, jsonb, boolean, boolean, uuid
) FROM public, anon;

GRANT EXECUTE ON FUNCTION public.allocate_and_insert_job_spec(
  uuid, uuid, text, jsonb, boolean, boolean, uuid
) TO authenticated, service_role;
