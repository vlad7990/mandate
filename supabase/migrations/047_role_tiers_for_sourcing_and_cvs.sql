-- Two corrections to the tiers 046 assigned, both found by walking the
-- server actions a researcher would actually run rather than by reading the
-- table list.
--
-- ## 1. boolean_queries belongs to sourcing, not to the mandate
--
-- 046 filed it under `can_write_mandates` because it hangs off a project.
-- But a Boolean string is the sourcing agent's output, and sourcing is the
-- researcher's whole job — the route `/app/projects/:id/sourcing` is gated
-- at `candidates:write` for exactly that reason. Left as it was, a
-- researcher would reach the sourcing screen and have every button on it
-- fail at the database. The route guard and RLS have to agree, and this is
-- the half that was wrong.
--
-- ## 2. The CV bucket was never role-governed
--
-- `cvs` is a storage bucket, so it is not in `public` and 046 did not touch
-- it. Its three policies scope to the org folder and stop there, which means
-- a viewer — the role that is supposed to write nothing anywhere — could
-- upload a CV, overwrite an existing one via `upsert`, or delete the pool's
-- documents. Uploading a CV is `candidates:write` in the product; it is now
-- `can_write_candidates()` in the database too.
--
-- Reading stays open to any active member, matching every other read policy:
-- a viewer who can see the candidate can see the candidate's CV.


-- ---------------------------------------------------------------------------
-- 1. boolean_queries → the candidates tier
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS boolean_queries_role_insert ON public.boolean_queries;
DROP POLICY IF EXISTS boolean_queries_role_update ON public.boolean_queries;
DROP POLICY IF EXISTS boolean_queries_role_delete ON public.boolean_queries;

CREATE POLICY boolean_queries_role_insert ON public.boolean_queries
  FOR INSERT TO authenticated
  WITH CHECK (organization_id IS NOT NULL
              AND organization_id = (SELECT public.current_user_org_id())
              AND (SELECT public.can_write_candidates()));

CREATE POLICY boolean_queries_role_update ON public.boolean_queries
  FOR UPDATE TO authenticated
  USING (organization_id IS NOT NULL
         AND organization_id = (SELECT public.current_user_org_id())
         AND (SELECT public.can_write_candidates()))
  WITH CHECK (organization_id IS NOT NULL
              AND organization_id = (SELECT public.current_user_org_id())
              AND (SELECT public.can_write_candidates()));

CREATE POLICY boolean_queries_role_delete ON public.boolean_queries
  FOR DELETE TO authenticated
  USING (organization_id IS NOT NULL
         AND organization_id = (SELECT public.current_user_org_id())
         AND (SELECT public.can_write_candidates()));


-- ---------------------------------------------------------------------------
-- 2. The cvs storage bucket
-- ---------------------------------------------------------------------------
--
-- The folder check is unchanged — `{org_id}/{project_id}/{candidate_id}/cv.*`
-- is the path shape the upload actions build, and the first segment is what
-- keeps one customer's documents out of another's. The role predicate is
-- added alongside it, not instead of it.

DROP POLICY IF EXISTS cvs_org_read ON storage.objects;
DROP POLICY IF EXISTS cvs_org_insert ON storage.objects;
DROP POLICY IF EXISTS cvs_org_delete ON storage.objects;

CREATE POLICY cvs_org_read ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'cvs'
         AND (storage.foldername(name))[1] = (SELECT public.current_user_org_id())::text
         AND (SELECT public.can_read_org()));

CREATE POLICY cvs_org_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'cvs'
              AND (storage.foldername(name))[1] = (SELECT public.current_user_org_id())::text
              AND (SELECT public.can_write_candidates()));

-- `upsert: true` on an existing object is an UPDATE, not an INSERT, and
-- there was no UPDATE policy at all — so overwriting a CV in place was
-- already blocked for everyone, and the upload actions only ever hit the
-- insert path for a fresh candidate id. Added explicitly so the tier is
-- stated rather than relying on the absence of a policy.
CREATE POLICY cvs_org_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'cvs'
         AND (storage.foldername(name))[1] = (SELECT public.current_user_org_id())::text
         AND (SELECT public.can_write_candidates()))
  WITH CHECK (bucket_id = 'cvs'
              AND (storage.foldername(name))[1] = (SELECT public.current_user_org_id())::text
              AND (SELECT public.can_write_candidates()));

CREATE POLICY cvs_org_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'cvs'
         AND (storage.foldername(name))[1] = (SELECT public.current_user_org_id())::text
         AND (SELECT public.can_write_candidates()));
