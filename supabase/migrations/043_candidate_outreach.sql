-- Candidate outreach — the contact record, and the act that discharges the
-- GDPR Art. 14 notification duty.
--
-- Design note: docs/superpowers/specs/2026-08-12-sourcing-runs-design.md added
-- candidates.subject_notified_at so the obligation would be VISIBLE. Nothing
-- has ever written it. This migration is the other half: the obligation becomes
-- dischargeable, and it is discharged by a recorded act of contact rather than
-- by a checkbox.
--
-- Why that distinction matters. Art. 14 applies when personal data is obtained
-- from someone other than the data subject — exactly the case for
-- source_kind = 'sourced'. It requires telling that person what you hold and
-- where it came from, generally within one month. A boolean the recruiter can
-- tick means the record says "notified" when nobody was told anything, which is
-- worse than no record at all: it converts an open obligation into a false
-- attestation. So subject_notified_at is stamped ONLY as a side effect of
-- logging an outreach that actually carried the privacy notice, and only by the
-- RPC below.

-- ---------------------------------------------------------------------------
-- 1. candidate_outreach
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.candidate_outreach (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id            uuid NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  project_id              uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  organization_id         uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  channel                 text NOT NULL
                            CHECK (channel IN ('email', 'linkedin', 'phone', 'referral', 'other')),
  -- Replies live in the same table. A contact record that only holds what we
  -- said is a send log, not a relationship.
  direction               text NOT NULL DEFAULT 'outbound'
                            CHECK (direction IN ('outbound', 'inbound')),
  subject                 text,
  body                    text,
  -- Whether THIS message carried the Art. 14 privacy notice. Only an outbound
  -- message can: you cannot discharge the duty by receiving a reply.
  includes_privacy_notice boolean NOT NULL DEFAULT false,
  occurred_at             timestamptz NOT NULL DEFAULT now(),
  created_by              uuid REFERENCES public.users(id),
  created_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inbound_cannot_carry_notice
    CHECK (NOT (includes_privacy_notice AND direction = 'inbound'))
);

CREATE INDEX IF NOT EXISTS candidate_outreach_candidate_idx
  ON public.candidate_outreach (candidate_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS candidate_outreach_org_idx
  ON public.candidate_outreach (organization_id);
CREATE INDEX IF NOT EXISTS candidate_outreach_project_idx
  ON public.candidate_outreach (project_id);
CREATE INDEX IF NOT EXISTS candidate_outreach_created_by_idx
  ON public.candidate_outreach (created_by);

ALTER TABLE public.candidate_outreach ENABLE ROW LEVEL SECURITY;

CREATE POLICY org_candidate_outreach_only ON public.candidate_outreach
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
-- 2. subject_notified_at is stamped by the RPC, never by hand.
--
--    Without this guard the column is a free-text attestation: any client could
--    set it without a corresponding contact record, which is precisely the
--    false-attestation failure the design is trying to avoid.
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.guard_subject_notified()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_allowed boolean :=
    COALESCE(current_setting('mandate.allow_notification_stamp', true), '') = 'on';
BEGIN
  IF NEW.subject_notified_at IS DISTINCT FROM OLD.subject_notified_at
     AND NOT v_allowed THEN
    RAISE EXCEPTION 'subject_notified_at is set by log_candidate_outreach(), not directly — it records that a person was actually told.'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER candidates_guard_subject_notified
  BEFORE UPDATE ON public.candidates
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_subject_notified();

-- ---------------------------------------------------------------------------
-- 3. RPC: log one contact, and stamp the notification if it carried the notice.
--
--    Two writes, one truth — the same reason promote_sourcing_results exists.
--    An outreach row that carried the notice but failed to stamp the candidate
--    leaves an obligation looking open when it was met; a stamp with no
--    outreach row behind it is an attestation with no evidence.
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.log_candidate_outreach(
  p_candidate_id            uuid,
  p_channel                 text,
  p_direction               text,
  p_subject                 text,
  p_body                    text,
  p_includes_privacy_notice boolean,
  p_occurred_at             timestamptz
)
RETURNS TABLE (id uuid, subject_notified_at timestamptz)
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_actor     uuid := auth.uid();
  v_candidate public.candidates%ROWTYPE;
  v_id        uuid;
  v_when      timestamptz := COALESCE(p_occurred_at, now());
  v_notified  timestamptz;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required to log outreach.'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_candidate
    FROM public.candidates AS c
   WHERE c.id = p_candidate_id
   FOR UPDATE;

  IF v_candidate.id IS NULL THEN
    RAISE EXCEPTION 'Candidate % not found (or not accessible).', p_candidate_id
      USING ERRCODE = 'P0002';
  END IF;

  IF p_includes_privacy_notice AND p_direction = 'inbound' THEN
    RAISE EXCEPTION 'An inbound message cannot carry the privacy notice.'
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.candidate_outreach (
    candidate_id, project_id, organization_id, channel, direction,
    subject, body, includes_privacy_notice, occurred_at, created_by
  )
  VALUES (
    p_candidate_id, v_candidate.project_id, v_candidate.organization_id,
    p_channel, COALESCE(p_direction, 'outbound'), p_subject, p_body,
    COALESCE(p_includes_privacy_notice, false), v_when, v_actor
  )
  RETURNING candidate_outreach.id INTO v_id;

  v_notified := v_candidate.subject_notified_at;

  -- Stamped once, to the EARLIEST qualifying contact. A later notice does not
  -- move the date: the obligation was met when the person was first told, and
  -- overwriting it would quietly reset a compliance clock.
  IF COALESCE(p_includes_privacy_notice, false)
     AND v_candidate.subject_notified_at IS NULL THEN
    PERFORM set_config('mandate.allow_notification_stamp', 'on', true);
    UPDATE public.candidates AS c
       SET subject_notified_at = v_when,
           updated_at = now()
     WHERE c.id = p_candidate_id;
    PERFORM set_config('mandate.allow_notification_stamp', '', true);
    v_notified := v_when;
  END IF;

  RETURN QUERY SELECT v_id, v_notified;
END;
$$;

REVOKE ALL ON FUNCTION public.log_candidate_outreach(
  uuid, text, text, text, text, boolean, timestamptz
) FROM public, anon;

GRANT EXECUTE ON FUNCTION public.log_candidate_outreach(
  uuid, text, text, text, text, boolean, timestamptz
) TO authenticated, service_role;
