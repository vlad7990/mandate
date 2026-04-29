-- Candidate CV storage and parsing-state columns.
--
-- 1. Create the private "cvs" storage bucket.
-- 2. RLS policies on storage.objects scoped via the existing
--    public.current_user_org_id() helper (SECURITY DEFINER from 004).
--    Object paths are written as {org_id}/{project_id}/{candidate_id}/{file},
--    so storage.foldername(name)[1] is the org id.
-- 3. Add cv_processing + cv_parse_error to public.candidates so the upload
--    UI can render a polling skeleton vs a terminal failure with retry.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'cvs',
  'cvs',
  false,
  10485760, -- 10 MB
  ARRAY[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Storage RLS — read scoped to caller's organisation.
DROP POLICY IF EXISTS cvs_org_read ON storage.objects;
CREATE POLICY cvs_org_read ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'cvs'
    AND (storage.foldername(name))[1] = public.current_user_org_id()::text
  );

-- Storage RLS — insert scoped to caller's organisation.
DROP POLICY IF EXISTS cvs_org_insert ON storage.objects;
CREATE POLICY cvs_org_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'cvs'
    AND (storage.foldername(name))[1] = public.current_user_org_id()::text
  );

-- Storage RLS — delete scoped to caller's organisation (so CV cleanup
-- works when a candidate is deleted).
DROP POLICY IF EXISTS cvs_org_delete ON storage.objects;
CREATE POLICY cvs_org_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'cvs'
    AND (storage.foldername(name))[1] = public.current_user_org_id()::text
  );

-- Candidate processing-state columns.
ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS cv_processing  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cv_parse_error text;
