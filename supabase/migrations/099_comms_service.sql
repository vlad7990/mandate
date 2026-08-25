-- 099 — the Engage arc, slice three: the Candidate Communication
-- Service's data layer (D2/D3 of NEXT-comms-engagement.md, D1–D8
-- confirmed 2026-08-25; spec §5).
--
-- DETERMINISTIC INFRASTRUCTURE ONLY: no principal, no model call, no
-- vocabulary. The service (src/lib/comms/) is the only path by which
-- a candidate message will ever leave Mandate; this migration gives
-- it a record to write:
--
--   * `candidate_outreach` extensions (spec §5.1) — ALL nullable, so
--     every manual log and the mailto flow stay valid untouched. The
--     idempotency key is UNIQUE where present and recorded on a
--     'queued' row BEFORE the provider call (a double-click collides
--     in the database, not in the mailbox).
--   * `email_suppressions` — bounce/complaint/manual suppression as
--     data. Role-read; admin-insert; NO agent face; removal is
--     founder-hand (like the DNC clear, a suppression should not be
--     casually undone).
--   * `complete_candidate_send` — the atomic completion: provider
--     confirmation onto the queued row PLUS the Art. 14 notification
--     row PLUS the subject_notified_at stamp (via 044's
--     record_notification_sent, REUSED — the machinery that has
--     waited since 044 for exactly this caller) as ONE statement
--     family. The 043 two-writes-that-must-not-come-apart doctrine,
--     extended to three.
--   * `record_email_delivery_event` — the delivery webhook's door:
--     anon-callable but inert without a matching provider message id
--     (the route verifies the svix signature BEFORE calling; the RPC
--     can only move delivery_status on a row the provider itself
--     named, and suppress the address that bounced on it).
--
-- Agent actors are refused in the SERVICE by construction (no
-- mission system exists) and the RPC refuses them by name — sends
-- stay human; sent_by_principal stays false until Scout.

-- ---------------------------------------------------------------------------
-- 1. candidate_outreach extensions (spec §5.1) — nullable, additive.
-- ---------------------------------------------------------------------------

ALTER TABLE public.candidate_outreach
  ADD COLUMN IF NOT EXISTS mission_id          uuid,
  ADD COLUMN IF NOT EXISTS thread_key          text,
  ADD COLUMN IF NOT EXISTS provider            text,
  ADD COLUMN IF NOT EXISTS provider_message_id text,
  ADD COLUMN IF NOT EXISTS delivery_status     text,
  ADD COLUMN IF NOT EXISTS sent_by_principal   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS idempotency_key     text;

ALTER TABLE public.candidate_outreach
  DROP CONSTRAINT IF EXISTS candidate_outreach_delivery_status_known;
ALTER TABLE public.candidate_outreach
  ADD CONSTRAINT candidate_outreach_delivery_status_known CHECK (
    delivery_status IS NULL OR delivery_status IN
      ('queued', 'sent', 'delivered', 'bounced', 'complained', 'failed')
  );

-- A delivery status or provider ref without a provider is a claim
-- with no author.
ALTER TABLE public.candidate_outreach
  DROP CONSTRAINT IF EXISTS candidate_outreach_provider_coherent;
ALTER TABLE public.candidate_outreach
  ADD CONSTRAINT candidate_outreach_provider_coherent CHECK (
    provider IS NOT NULL
    OR (provider_message_id IS NULL AND delivery_status IS NULL)
  );

CREATE UNIQUE INDEX IF NOT EXISTS candidate_outreach_idempotency_key
  ON public.candidate_outreach (idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS candidate_outreach_provider_message_idx
  ON public.candidate_outreach (provider_message_id)
  WHERE provider_message_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. email_suppressions — the addresses Mandate must not mail again.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.email_suppressions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  address         text NOT NULL CHECK (address = lower(btrim(address)) AND address <> ''),
  reason          text NOT NULL CHECK (reason IN ('bounce', 'complaint', 'manual')),
  detail          text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT email_suppressions_unique UNIQUE (organization_id, address)
);

ALTER TABLE public.email_suppressions ENABLE ROW LEVEL SECURITY;

CREATE POLICY email_suppressions_role_select ON public.email_suppressions
  FOR SELECT TO authenticated
  USING (
    organization_id = (SELECT public.current_user_org_id())
    AND (SELECT public.can_read_org())
  );

CREATE POLICY email_suppressions_admin_insert ON public.email_suppressions
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = (SELECT public.current_user_org_id())
    AND (SELECT public.is_org_admin())
    AND NOT (SELECT public.is_agent())
    AND reason = 'manual'
  );

-- No UPDATE, no DELETE, no agent policies: bounce/complaint rows are
-- born by the webhook RPC (definer-side); removal is founder-hand.

-- ---------------------------------------------------------------------------
-- 3. complete_candidate_send — provider confirmation + notification +
--    stamp, atomically. SECURITY INVOKER (the 044 family): RLS decides
--    what the caller may touch; agents are refused by name.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.complete_candidate_send(
  p_outreach_id           uuid,
  p_provider_message_id   text,
  -- The Art. 14 half — passed only when the send carried the notice.
  p_recipient             text DEFAULT NULL,
  p_template_key          text DEFAULT NULL,
  p_template_version      text DEFAULT NULL,
  p_notice_version        text DEFAULT NULL,
  p_notice_idempotency_key text DEFAULT NULL
)
RETURNS TABLE (id uuid, subject_notified_at timestamptz)
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_row   public.candidate_outreach%ROWTYPE;
  v_notified timestamptz;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required to complete a send.'
      USING ERRCODE = 'P0001';
  END IF;
  IF (SELECT public.is_agent()) THEN
    RAISE EXCEPTION 'complete_candidate_send: candidate sends are human acts — no mission system exists for an agent to send under.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF nullif(btrim(coalesce(p_provider_message_id, '')), '') IS NULL THEN
    RAISE EXCEPTION 'complete_candidate_send: a completion without the provider''s reference is not a confirmation.'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_row FROM public.candidate_outreach AS o
   WHERE o.id = p_outreach_id FOR UPDATE;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Outreach row % not found (or not accessible).', p_outreach_id
      USING ERRCODE = 'P0002';
  END IF;
  IF v_row.delivery_status IS DISTINCT FROM 'queued' THEN
    RAISE EXCEPTION 'complete_candidate_send: row % is %, not queued — a send completes exactly once.',
      p_outreach_id, coalesce(v_row.delivery_status, 'not a provider send')
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.candidate_outreach AS o
     SET delivery_status = 'sent',
         provider_message_id = p_provider_message_id
   WHERE o.id = p_outreach_id;

  -- The Art. 14 half: the notice went with this message, so the
  -- notification row and the stamp land in the SAME transaction —
  -- through 044's own door. 044 permits ONE sent notification per
  -- candidate EVER (candidate_notifications_one_sent_idx): if the
  -- duty is already met, a later notice-carrying send is belt-and-
  -- braces text, not a statutory record — the completion skips the
  -- record rather than failing a send the provider already made.
  SELECT c.subject_notified_at INTO v_notified
    FROM public.candidates c WHERE c.id = v_row.candidate_id;
  IF v_row.includes_privacy_notice AND v_notified IS NULL THEN
    IF p_recipient IS NULL OR p_template_key IS NULL
       OR p_template_version IS NULL OR p_notice_version IS NULL
       OR p_notice_idempotency_key IS NULL THEN
      RAISE EXCEPTION 'complete_candidate_send: a notice-carrying send must record its notification.'
        USING ERRCODE = 'P0001';
    END IF;
    SELECT n.subject_notified_at INTO v_notified
      FROM public.record_notification_sent(
        v_row.candidate_id, p_recipient, p_template_key,
        p_template_version, p_notice_version, p_provider_message_id,
        p_notice_idempotency_key, now()) AS n;
  END IF;

  RETURN QUERY SELECT p_outreach_id, v_notified;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_candidate_send(
  uuid, text, text, text, text, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.complete_candidate_send(
  uuid, text, text, text, text, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. record_email_delivery_event — the delivery webhook's door. Anon-
--    callable but INERT without a provider-named row: it can only move
--    delivery_status on the row Resend itself identified, and suppress
--    the address that bounced ON that row. The route verifies the svix
--    signature before this is ever called.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.record_email_delivery_event(
  p_provider_message_id text,
  p_status              text,
  p_address             text DEFAULT NULL,
  p_detail              text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row   public.candidate_outreach%ROWTYPE;
BEGIN
  IF p_status NOT IN ('delivered', 'bounced', 'complained') THEN
    RETURN 0;   -- other provider events are not this record's business
  END IF;
  IF nullif(btrim(coalesce(p_provider_message_id, '')), '') IS NULL THEN
    RETURN 0;
  END IF;

  SELECT * INTO v_row FROM public.candidate_outreach AS o
   WHERE o.provider_message_id = btrim(p_provider_message_id)
     AND o.provider IS NOT NULL
   FOR UPDATE;
  IF v_row.id IS NULL THEN
    RETURN 0;   -- unknown reference: nothing to say, nothing touched
  END IF;

  -- Delivery facts only move forward: a bounce is not overwritten by
  -- a late 'delivered'.
  IF v_row.delivery_status IN ('bounced', 'complained') THEN
    RETURN 0;
  END IF;

  UPDATE public.candidate_outreach AS o
     SET delivery_status = p_status
   WHERE o.id = v_row.id;

  -- The address guard is explicit rather than an exception handler:
  -- a plpgsql exception block would roll the status update back with
  -- the failed insert, and the status update is the more important
  -- half.
  IF p_status IN ('bounced', 'complained')
     AND v_row.organization_id IS NOT NULL
     AND nullif(lower(btrim(coalesce(p_address, ''))), '') IS NOT NULL THEN
    INSERT INTO public.email_suppressions (organization_id, address, reason, detail)
    VALUES (
      v_row.organization_id,
      lower(btrim(p_address)),
      CASE p_status WHEN 'bounced' THEN 'bounce' ELSE 'complaint' END,
      nullif(btrim(coalesce(p_detail, '')), '')
    )
    ON CONFLICT (organization_id, address) DO NOTHING;
  END IF;

  RETURN 1;
END;
$$;

REVOKE ALL ON FUNCTION public.record_email_delivery_event(text, text, text, text)
  FROM public;
GRANT EXECUTE ON FUNCTION public.record_email_delivery_event(text, text, text, text)
  TO anon, authenticated;
