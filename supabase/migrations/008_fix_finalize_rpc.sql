-- Fix finalize_job_spec to never race the partial unique index on is_final.
--
-- The previous implementation flipped every row for a project in a single
-- UPDATE statement (`SET is_final = (id = p_spec_id)`). Per-row index checks
-- on a non-deferrable partial unique index can observe two is_final=true rows
-- for the same project mid-statement and reject the update with
--   ERROR: duplicate key value violates unique constraint
--           "unique_final_spec_per_project"
-- This breaks final-to-final replacement, the most common path. Partial
-- unique indexes cannot be made deferrable, so we replace the bulk UPDATE
-- with an explicit transactional sequence:
--
--   1. Lock the parent project row (serialises concurrent finalize calls for
--      the same project; matches next_job_spec_version's locking pattern).
--   2. Lock the target spec row to keep a concurrent delete from racing the
--      promote step.
--   3. Demote every other final for this project in its own statement (so the
--      index sees zero is_final=true rows for this project at the boundary).
--   4. Promote the target in its own statement (the index sees zero or one
--      is_final=true rows; never two).
--   5. Verify exactly one row was promoted; raise P0002 otherwise.
--
-- Function bodies are atomic with respect to the calling transaction — any
-- raise rolls back the demotion automatically.

CREATE OR REPLACE FUNCTION public.finalize_job_spec(
  p_spec_id    uuid,
  p_project_id uuid
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_locked_project_id uuid;
  v_target_id         uuid;
  v_promoted          int;
BEGIN
  -- 1. Lock the parent project row. RLS hides projects outside the caller's
  --    organisation, so a NULL here means "not yours" (or non-existent).
  --    This also serialises concurrent finalize / next_job_spec_version
  --    calls for the same project.
  SELECT id INTO v_locked_project_id
    FROM public.projects
   WHERE id = p_project_id
   FOR UPDATE;

  IF v_locked_project_id IS NULL THEN
    RAISE EXCEPTION 'Project % not found or not accessible.', p_project_id
      USING ERRCODE = 'P0002';
  END IF;

  -- 2. Lock the target spec row and prove it belongs to this project.
  --    RLS scopes by org, so a missing row here means RLS denial, deletion,
  --    or wrong project.
  SELECT id INTO v_target_id
    FROM public.job_specs
   WHERE id         = p_spec_id
     AND project_id = p_project_id
   FOR UPDATE;

  IF v_target_id IS NULL THEN
    RAISE EXCEPTION
      'Target job spec % not found for project % (RLS denial, deleted row, or wrong project).',
      p_spec_id, p_project_id
      USING ERRCODE = 'P0002';
  END IF;

  -- 3. Demote any existing finals for this project, excluding the target.
  --    Separate statement: the partial unique index is checked at the end of
  --    this statement and sees zero is_final=true rows for the project.
  UPDATE public.job_specs
     SET is_final   = false,
         updated_at = now()
   WHERE project_id = p_project_id
     AND is_final = true
     AND id <> p_spec_id;

  -- 4. Promote the target. Separate statement: the index now sees zero or
  --    one is_final=true rows for the project, never two.
  WITH promoted AS (
    UPDATE public.job_specs
       SET is_final   = true,
           updated_at = now()
     WHERE id         = p_spec_id
       AND project_id = p_project_id
    RETURNING id
  )
  SELECT count(*) INTO v_promoted FROM promoted;

  -- 5. Belt-and-braces: confirm the promotion landed. The FOR UPDATE earlier
  --    guarantees the row existed for this caller; v_promoted <> 1 here
  --    would indicate something pathological (concurrent delete after our
  --    lock, RLS write-deny that didn't deny the read). Surface loudly so
  --    callers don't silently lose finalisation.
  IF v_promoted <> 1 THEN
    RAISE EXCEPTION
      'Failed to promote job spec % to final (rows updated: %).',
      p_spec_id, v_promoted
      USING ERRCODE = 'P0002';
  END IF;
END;
$$;

-- GRANTs are preserved across CREATE OR REPLACE FUNCTION, but re-stated here
-- for explicitness and to match the pattern in 007.
REVOKE ALL ON FUNCTION public.finalize_job_spec(uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.finalize_job_spec(uuid, uuid) TO authenticated, service_role;
