-- Art. 14 notification as a COMPLETED EVENT, not a recruiter attestation.
--
-- Migration 043 made the obligation dischargeable, but it discharged it on the
-- recruiter ticking "this message carried the notice". That is an attestation:
-- the record says the person was told because someone said so. This migration
-- replaces it with evidence — subject_notified_at is stamped only after a
-- notification has actually been sent and the provider confirmed it.
--
-- Three guarantees, all in the database rather than in application care:
--
--   1. log_candidate_outreach() loses its stamping power entirely. Combined
--      with the guard_subject_notified trigger from 043, record_notification_sent()
--      becomes the ONLY path to subject_notified_at.
--   2. At most ONE successful statutory notice per candidate, enforced by a
--      partial unique index. Not "the code checks first" — the database refuses.
--   3. A unique idempotency_key, so a double-click, a retried server action or
--      a provider-level retry collides instead of sending a second notice to a
--      real person.
--
-- Failure is recorded too. A failed attempt must leave subject_notified_at NULL
-- so the obligation stays in the action queue, but the attempt itself is
-- evidence of diligence and is worth keeping.

CREATE TABLE IF NOT EXISTS public.candidate_notifications (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id        uuid NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  project_id          uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  organization_id     uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  channel             text NOT NULL DEFAULT 'email' CHECK (channel IN ('email')),
  recipient           text NOT NULL,
  -- Which wording was actually served. A later revision of the notice must
  -- stay attributable to the people who received the earlier one.
  template_key        text NOT NULL,
  template_version    text NOT NULL,
  notice_version      text NOT NULL,
  provider            text NOT NULL DEFAULT 'resend',
  provider_message_id text,
  status              text NOT NULL CHECK (status IN ('sent', 'failed')),
  error               text,
  sent_at             timestamptz,
  created_by          uuid REFERENCES public.users(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  -- Deterministic per (candidate, notice version). A retry lands on this.
  idempotency_key     text NOT NULL,
  CONSTRAINT sent_requires_timestamp
    CHECK ((status = 'sent') = (sent_at IS NOT NULL)),
  CONSTRAINT failed_requires_reason
    CHECK (status <> 'failed' OR error IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS candidate_notifications_idempotency_idx
  ON public.candidate_notifications (idempotency_key);

-- The guarantee that a person cannot be served two statutory notices.
CREATE UNIQUE INDEX IF NOT EXISTS candidate_notifications_one_sent_idx
  ON public.candidate_notifications (candidate_id)
  WHERE status = 'sent';

CREATE INDEX IF NOT EXISTS candidate_notifications_candidate_idx
  ON public.candidate_notifications (candidate_id, created_at DESC);
CREATE INDEX IF NOT EXISTS candidate_notifications_org_idx
  ON public.candidate_notifications (organization_id);
CREATE INDEX IF NOT EXISTS candidate_notifications_project_idx
  ON public.candidate_notifications (project_id);
CREATE INDEX IF NOT EXISTS candidate_notifications_created_by_idx
  ON public.candidate_notifications (created_by);

ALTER TABLE public.candidate_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY org_candidate_notifications_only ON public.candidate_notifications
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
-- log_candidate_outreach() loses the power to stamp.
--
-- It still records contact — that is useful and honest. It simply no longer
-- decides whether a statutory obligation was met, because a recruiter saying
-- so is not evidence that it happened.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.log_candidate_outreach(
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

  -- Deliberately returns the EXISTING value and changes nothing. Notification
  -- is recorded by record_notification_sent(), after a provider confirms.
  RETURN QUERY SELECT v_id, v_candidate.subject_notified_at;
END;
$$;

-- ---------------------------------------------------------------------------
-- record_notification_sent — the only path to subject_notified_at.
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.record_notification_sent(
  p_candidate_id        uuid,
  p_recipient           text,
  p_template_key        text,
  p_template_version    text,
  p_notice_version      text,
  p_provider_message_id text,
  p_idempotency_key     text,
  p_sent_at             timestamptz
)
RETURNS TABLE (id uuid, subject_notified_at timestamptz)
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_actor     uuid := auth.uid();
  v_candidate public.candidates%ROWTYPE;
  v_id        uuid;
  v_when      timestamptz := COALESCE(p_sent_at, now());
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required to record a notification.'
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

  INSERT INTO public.candidate_notifications (
    candidate_id, project_id, organization_id, recipient, template_key,
    template_version, notice_version, provider_message_id, status, sent_at,
    created_by, idempotency_key
  )
  VALUES (
    p_candidate_id, v_candidate.project_id, v_candidate.organization_id,
    p_recipient, p_template_key, p_template_version, p_notice_version,
    p_provider_message_id, 'sent', v_when, v_actor, p_idempotency_key
  )
  RETURNING candidate_notifications.id INTO v_id;

  -- Earliest successful notice only. A second one does not move the date: the
  -- obligation was met when the person was first told, and overwriting would
  -- reset a compliance clock that has already stopped.
  IF v_candidate.subject_notified_at IS NULL THEN
    PERFORM set_config('mandate.allow_notification_stamp', 'on', true);
    UPDATE public.candidates AS c
       SET subject_notified_at = v_when, updated_at = now()
     WHERE c.id = p_candidate_id;
    PERFORM set_config('mandate.allow_notification_stamp', '', true);
  END IF;

  RETURN QUERY
    SELECT v_id, COALESCE(v_candidate.subject_notified_at, v_when);
END;
$$;

-- ---------------------------------------------------------------------------
-- record_notification_failed — evidence of the attempt, and nothing else.
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.record_notification_failed(
  p_candidate_id    uuid,
  p_recipient       text,
  p_template_key    text,
  p_template_version text,
  p_notice_version  text,
  p_error           text,
  p_idempotency_key text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_actor     uuid := auth.uid();
  v_candidate public.candidates%ROWTYPE;
  v_id        uuid;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required to record a notification.'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_candidate
    FROM public.candidates AS c WHERE c.id = p_candidate_id;

  IF v_candidate.id IS NULL THEN
    RAISE EXCEPTION 'Candidate % not found (or not accessible).', p_candidate_id
      USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.candidate_notifications (
    candidate_id, project_id, organization_id, recipient, template_key,
    template_version, notice_version, status, error, created_by, idempotency_key
  )
  VALUES (
    p_candidate_id, v_candidate.project_id, v_candidate.organization_id,
    p_recipient, p_template_key, p_template_version, p_notice_version,
    'failed', COALESCE(p_error, 'unknown error'), v_actor, p_idempotency_key
  )
  RETURNING candidate_notifications.id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_notification_sent(
  uuid, text, text, text, text, text, text, timestamptz) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.record_notification_sent(
  uuid, text, text, text, text, text, text, timestamptz) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.record_notification_failed(
  uuid, text, text, text, text, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.record_notification_failed(
  uuid, text, text, text, text, text, text) TO authenticated, service_role;
