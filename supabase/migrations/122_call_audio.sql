-- 122 — CALL AUDIO (call-logging cheap slice, gate adbb05f, built on
-- the founder's word 2026-08-26).
--
-- Recruiters call on their own phones; the app captures the call.
-- The typed half has existed since 020/054 (note_type='call' on both
-- note tables); this migration adds the recording half: an org-scoped
-- audio bucket on the cvs precedent (014), and four columns on BOTH
-- note tables, guarded by CHECKs rather than triggers:
--
--   * NO AUDIO WITHOUT CONSENT. `consent_confirmed` is the recruiter's
--     recorded attestation that every party agreed to the recording.
--     Two-party-consent law is the founder's obligation; the schema's
--     job is to make the claim recorded, not skippable (gate J.4).
--   * AUDIO ONLY ON CALL NOTES. A "general" note with a recording
--     would be a recording pretending to be something else.
--   * NO TRANSCRIPT WITHOUT AUDIO. transcript/transcript_error are
--     the ASR's bookkeeping (success or the honest failure sentence,
--     the generation_error precedent) — meaningless without a file.
--
-- The transcript is DATA on the note: it feeds no AI loop, no trail,
-- no recalibration this slice (the Art. 14 boundary restated in 054's
-- header holds — if call transcripts are ever fed to an agent, that
-- analysis is redone first, behind its own gate).
--
-- The trail is deliberately unchanged (gate J.5): notes have never
-- ridden it (053's design), and a call note with an attachment is
-- still a private note. CHECK stays 89, door 22, allowlist 29, anon
-- roster TWELVE — this migration adds no function, no grant, no
-- policy beyond the storage trio, and no principal.

-- ---------------------------------------------------------------------------
-- 1. The bucket — private, 50MB (~90 min of m4a), audio-only mimes
-- ---------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'call-audio',
  'call-audio',
  false,
  52428800, -- 50 MB
  ARRAY[
    'audio/mpeg',
    'audio/mp4',
    'audio/x-m4a',
    'audio/aac',
    'audio/wav',
    'audio/webm',
    'audio/ogg'
  ]
)
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Org-scoped object policies, the 014 trio verbatim: the org id is the
-- first path segment ({orgId}/candidate-notes/{noteId}.{ext} and
-- {orgId}/client-notes/{noteId}.{ext}), so RLS is the enforcement and
-- the upload can run under the SESSION client.

DROP POLICY IF EXISTS call_audio_org_read ON storage.objects;
CREATE POLICY call_audio_org_read ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'call-audio'
    AND (storage.foldername(name))[1] = public.current_user_org_id()::text
  );

DROP POLICY IF EXISTS call_audio_org_insert ON storage.objects;
CREATE POLICY call_audio_org_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'call-audio'
    AND (storage.foldername(name))[1] = public.current_user_org_id()::text
  );

DROP POLICY IF EXISTS call_audio_org_delete ON storage.objects;
CREATE POLICY call_audio_org_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'call-audio'
    AND (storage.foldername(name))[1] = public.current_user_org_id()::text
  );

-- ---------------------------------------------------------------------------
-- 2. The note columns — both tables, same four
-- ---------------------------------------------------------------------------

ALTER TABLE public.candidate_notes
  ADD COLUMN IF NOT EXISTS audio_path        text,
  ADD COLUMN IF NOT EXISTS consent_confirmed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS transcript        text,
  ADD COLUMN IF NOT EXISTS transcript_error  text;

ALTER TABLE public.candidate_notes
  ADD CONSTRAINT candidate_notes_audio_needs_consent
    CHECK (audio_path IS NULL OR consent_confirmed),
  ADD CONSTRAINT candidate_notes_audio_on_calls
    CHECK (audio_path IS NULL OR note_type = 'call'),
  ADD CONSTRAINT candidate_notes_transcript_needs_audio
    CHECK ((transcript IS NULL AND transcript_error IS NULL)
           OR audio_path IS NOT NULL);

ALTER TABLE public.client_notes
  ADD COLUMN IF NOT EXISTS audio_path        text,
  ADD COLUMN IF NOT EXISTS consent_confirmed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS transcript        text,
  ADD COLUMN IF NOT EXISTS transcript_error  text;

ALTER TABLE public.client_notes
  ADD CONSTRAINT client_notes_audio_needs_consent
    CHECK (audio_path IS NULL OR consent_confirmed),
  ADD CONSTRAINT client_notes_audio_on_calls
    CHECK (audio_path IS NULL OR note_type = 'call'),
  ADD CONSTRAINT client_notes_transcript_needs_audio
    CHECK ((transcript IS NULL AND transcript_error IS NULL)
           OR audio_path IS NOT NULL);

-- RLS: UNCHANGED on both tables — the new columns ride the existing
-- org-scoped (020) and org+commercial-tier (054) policies.
