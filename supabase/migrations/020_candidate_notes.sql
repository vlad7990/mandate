-- Candidate notes — recruiter-authored qualitative log per candidate.
--
-- Distinct from `feedback` (which is the structured hiring-manager
-- feedback that drives recalibration). Notes are free-form: phone-call
-- summaries, meeting recaps, email paraphrases, interview debriefs, or
-- general observations. They never feed any AI loop today, but a
-- future "Recruiter Copilot" could read them as context.
--
-- One row per note. Idempotency is left to the UI — recruiters create
-- discrete entries, edit them inline, pin the important ones, and
-- delete the cruft. Pinned notes float to the top of the profile feed.
--
-- `call_duration_minutes` is only meaningful when note_type='call';
-- the schema allows NULL for the other types so the UI doesn't have to
-- pretend they had zero-minute calls.

CREATE TABLE IF NOT EXISTS public.candidate_notes (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id           uuid NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  project_id             uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  organization_id        uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by             uuid REFERENCES public.users(id) ON DELETE SET NULL,
  note_type              text NOT NULL DEFAULT 'general'
                           CHECK (note_type IN ('general', 'call', 'meeting', 'email', 'interview')),
  content                text NOT NULL CHECK (length(btrim(content)) > 0),
  is_pinned              boolean NOT NULL DEFAULT false,
  call_duration_minutes  integer
                           CHECK (call_duration_minutes IS NULL OR call_duration_minutes >= 0),
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.candidate_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS org_candidate_notes_only ON public.candidate_notes;
CREATE POLICY org_candidate_notes_only ON public.candidate_notes
  FOR ALL TO authenticated
  USING (
    organization_id IS NOT NULL
    AND organization_id = public.current_user_org_id()
  )
  WITH CHECK (
    organization_id IS NOT NULL
    AND organization_id = public.current_user_org_id()
  );

-- Hot path: load all notes for a candidate, pinned first then newest.
-- The composite index lets the candidate page list query stay cheap as
-- the table grows across many recruiters and many candidates.
CREATE INDEX IF NOT EXISTS candidate_notes_candidate_idx
  ON public.candidate_notes (candidate_id, is_pinned DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS candidate_notes_org_idx
  ON public.candidate_notes (organization_id);
