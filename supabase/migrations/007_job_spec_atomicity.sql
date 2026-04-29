-- Atomicity hardening for job_specs.
--
-- Addresses two race conditions surfaced by adversarial review:
--   1. markAsFinal could demote the existing final and then silently no-op the
--      promote, leaving the project with no canonical spec.
--   2. createNewVersion / requestRegenerate read MAX(version) and INSERT in
--      separate statements, so concurrent allocators could pick the same
--      version number.
--
-- Fix:
--   * UNIQUE (project_id, version) — hard backstop for version uniqueness.
--   * next_job_spec_version(project_id) — locks the parent project row and
--     returns MAX(version)+1 in a single transaction.
--   * finalize_job_spec(spec_id, project_id) — single UPDATE that flips
--     is_final atomically and raises if the target row was not actually
--     updated (RLS denial, missing row, or wrong project).
--
-- Both RPCs are SECURITY INVOKER, so existing org-scoped RLS policies on
-- public.job_specs / public.projects continue to enforce the org boundary.

ALTER TABLE public.job_specs
  ALTER COLUMN version SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS unique_job_spec_version_per_project
  ON public.job_specs (project_id, version);

-- ---------------------------------------------------------------------------
-- next_job_spec_version
--
-- Serialises version allocation for a single project. Acquires a row-level
-- lock on the project (which any concurrent allocator must also acquire),
-- then returns the next version number for that project's spec history.
--
-- Callers should INSERT the new row in the same transaction window if
-- possible. The unique (project_id, version) index is the hard backstop if
-- two callers race past the lock release.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.next_job_spec_version(p_project_id uuid)
RETURNS int
LANGUAGE plpgsql
AS $$
DECLARE
  v_next int;
  v_locked_id uuid;
BEGIN
  -- Lock the parent project row. If RLS hides the project (wrong org,
  -- missing project, etc.), the SELECT returns no rows and we raise.
  SELECT id INTO v_locked_id
    FROM public.projects
   WHERE id = p_project_id
   FOR UPDATE;

  IF v_locked_id IS NULL THEN
    RAISE EXCEPTION 'Project % not found or not accessible.', p_project_id
      USING ERRCODE = 'P0002';
  END IF;

  SELECT COALESCE(MAX(version), 0) + 1
    INTO v_next
    FROM public.job_specs
   WHERE project_id = p_project_id;

  RETURN v_next;
END;
$$;

REVOKE ALL ON FUNCTION public.next_job_spec_version(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.next_job_spec_version(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- finalize_job_spec
--
-- Atomically promotes one spec row to is_final=true and demotes every other
-- row for the same project. A single UPDATE statement is used so the partial
-- unique index (unique_final_spec_per_project) is checked at statement end
-- and the transition is consistent.
--
-- Raises if zero rows matching the target id were updated — covers RLS
-- denial, deleted row, or wrong project_id. The caller can rely on success
-- meaning the target row is now final.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.finalize_job_spec(
  p_spec_id    uuid,
  p_project_id uuid
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_target_updated int;
BEGIN
  WITH updated AS (
    UPDATE public.job_specs
       SET is_final   = (id = p_spec_id),
           updated_at = now()
     WHERE project_id = p_project_id
    RETURNING id
  )
  SELECT count(*)
    INTO v_target_updated
    FROM updated
   WHERE id = p_spec_id;

  IF v_target_updated = 0 THEN
    RAISE EXCEPTION
      'Target job spec % not found for project % (RLS denial, deleted row, or wrong project).',
      p_spec_id, p_project_id
      USING ERRCODE = 'P0002';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_job_spec(uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.finalize_job_spec(uuid, uuid) TO authenticated, service_role;
