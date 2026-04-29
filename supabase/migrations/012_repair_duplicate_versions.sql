-- One-time repair migration for duplicate (project_id, version) rows.
--
-- Background: migration 007 introduced the unique index
-- unique_job_spec_version_per_project. Before 007, version allocation read
-- MAX(version) and INSERTed in two separate statements (without a project
-- lock), so a production database could already contain duplicate
-- (project_id, version) pairs from race conditions. CREATE UNIQUE INDEX
-- aborts on such data, taking the whole migration with it and blocking
-- every later RPC/atomicity fix.
--
-- This migration is idempotent: a clean database performs no UPDATEs and
-- the verify step passes. If duplicates exist, it renumbers the lower-id
-- rows of each conflicting group to a high, deterministic version
-- (MAX(version)+100+offset) so the data is preserved in history but the
-- unique constraint is satisfied.
--
-- Strategy:
--   * For each duplicate (project_id, version) group, keep the row with
--     the lexicographically highest id (the user spec calls this "most
--     recent" — UUIDs aren't time-ordered with gen_random_uuid(), but the
--     sort is at least deterministic).
--   * Renumber the surviving duplicates to MAX(version) + 100 + n where n
--     is a per-project row_number. The +100 buffer leaves room for the
--     normal version sequence to grow without colliding with the repaired
--     rows.
--   * Verify zero duplicate groups remain. Raise loudly if not.
--   * Re-assert the unique index. CREATE UNIQUE INDEX IF NOT EXISTS is a
--     no-op when migration 007 already created it.

-- 1. Renumber duplicates. The CTE chain reads MAX(version) once per row
--    *before* the UPDATE applies, so concurrent renumbers within the same
--    project still get distinct values via the per-project ROW_NUMBER.
WITH duplicates AS (
  SELECT id,
         project_id,
         version,
         ROW_NUMBER() OVER (
           PARTITION BY project_id, version
           ORDER BY id DESC
         ) AS dup_rn
    FROM public.job_specs
),
renumber AS (
  SELECT d.id,
         d.project_id,
         (
           SELECT MAX(js.version)
             FROM public.job_specs js
            WHERE js.project_id = d.project_id
         ) + 100
         + ROW_NUMBER() OVER (
             PARTITION BY d.project_id
             ORDER BY d.id
           ) AS new_version
    FROM duplicates d
   WHERE d.dup_rn > 1
)
UPDATE public.job_specs js
   SET version    = r.new_version,
       updated_at = now()
  FROM renumber r
 WHERE js.id = r.id;

-- 2. Verify. RAISE EXCEPTION rolls back the whole migration if the
--    repair didn't fully clear the duplicates (would only happen if some
--    other writer raced this UPDATE between our read and write — vanishingly
--    unlikely under a single-statement UPDATE, but still worth asserting).
DO $$
DECLARE
  v_dup_groups int;
BEGIN
  SELECT count(*) INTO v_dup_groups
    FROM (
      SELECT 1
        FROM public.job_specs
       GROUP BY project_id, version
      HAVING count(*) > 1
    ) sub;

  IF v_dup_groups > 0 THEN
    RAISE EXCEPTION
      'Repair did not eliminate duplicate (project_id, version) rows: % groups remain.',
      v_dup_groups
      USING ERRCODE = '23505';
  END IF;
END
$$;

-- 3. Re-assert the unique index. No-op if migration 007 already created it.
--    On environments where 007 silently failed and was rolled back before
--    creating the index, this picks up the slack now that data is clean.
CREATE UNIQUE INDEX IF NOT EXISTS unique_job_spec_version_per_project
  ON public.job_specs (project_id, version);
