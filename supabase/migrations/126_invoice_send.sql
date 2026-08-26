-- 126 — INVOICE SEND (invoicing + print programme, slice 2, gate
-- 2026-08-26-invoice-send-gate.md, built on the founder's word
-- 2026-08-26 with D.1–D.5 taken as recommended).
--
-- Slice 1 shipped the free half of sending: `openMailDraft` hands the
-- recruiter's own mail client a pointer and the PDF travels by the
-- print path. That stays. This slice is the app sending the invoice
-- ITSELF, from the agency's own identity, with what happened recorded.
--
-- ## The five rulings this encodes
--
-- **D.1 — the from identity lives on the TEMPLATE, not in env.**
-- `RESEND_FROM` is the product's address and is right for digests and
-- waitlist mail, which are Mandate writing to its own users. An invoice
-- is the AGENCY billing its client and must come from the agency. The
-- template already carries the billing identity (123), so it carries
-- the address too — in `structure`, which is jsonb and needs no
-- migration. A template with no `from_email` cannot send: the affordance
-- is absent and the refusal says why (the §155 honest-absence pattern).
--
-- **D.2 — client email is LOGGED and SUPPRESSION-CHECKED, but not
-- CAPPED.** 099's ladder is candidate-scoped by design: the per-day and
-- per-week caps protect people who never asked to be contacted. A
-- client who is owed three invoices should receive three invoices, so
-- the caps do not apply. What does apply is `email_suppressions` — an
-- address that hard-bounced or complained is refused, for the same
-- reason it is refused for a candidate: continuing to send at it
-- damages the sending domain for every other recipient.
--
-- **D.3 — the email carries the invoice, not a second layout.** There
-- is no server-side PDF and this slice does not add one: §133 put the
-- renderer in the browser precisely so an export cannot disagree with
-- the screen, and a server-side layout engine would reintroduce that
-- divergence. The email is rendered from the SAME frozen row — number,
-- dates, bill_to, from_snapshot, lines, total, payment instructions —
-- so it cannot say anything the document does not, and the recruiter
-- still has print for a PDF to attach by hand.
--
-- **D.4 — every send is kept.** A row per delivery, never a stamp that
-- moves: "what did this client actually receive, and when" is an audit
-- question, and an invoice re-sent after a bounce has two answers.
--
-- **D.5 — the bounce path is wired and dark.** `RESEND_WEBHOOK_SECRET`
-- is not provisioned, and the webhook route already refuses without it,
-- so no delivery feedback arrives today. The resolver below is extended
-- anyway: the day the secret lands, invoice deliveries start receiving
-- their statuses with no further migration. Dark, not absent.

-- ---------------------------------------------------------------------------
-- 1. The delivery record — one row per send, on candidate_outreach's shape
-- ---------------------------------------------------------------------------
--
-- Addresses and subject are SNAPSHOTS, like everything else the invoice
-- family stores: a contact renamed or deleted next year must not change
-- what the record says was sent. `invoice_id` cascades because a
-- delivery of a deleted invoice is meaningless — and issued invoices
-- cannot be deleted (123), so in practice only a draft's rows can go,
-- and a draft can never have sent anything.

CREATE TABLE IF NOT EXISTS public.invoice_deliveries (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  invoice_id          uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,

  to_address          text NOT NULL CHECK (length(btrim(to_address)) > 0),
  to_label            text,
  from_address        text NOT NULL CHECK (length(btrim(from_address)) > 0),
  subject             text NOT NULL CHECK (length(btrim(subject)) > 0),

  provider            text NOT NULL DEFAULT 'resend',
  provider_message_id text,

  delivery_status     text NOT NULL DEFAULT 'sent'
                        CHECK (delivery_status IN
                          ('sent', 'delivered', 'bounced', 'complained', 'failed')),
  failure_detail      text,

  sent_by             uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),

  -- A failure must carry its sentence, or "failed" is a status nobody
  -- can act on.
  CONSTRAINT invoice_deliveries_failure_has_detail CHECK (
    delivery_status <> 'failed' OR failure_detail IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS invoice_deliveries_org_idx
  ON public.invoice_deliveries (organization_id);
CREATE INDEX IF NOT EXISTS invoice_deliveries_invoice_idx
  ON public.invoice_deliveries (invoice_id);
CREATE INDEX IF NOT EXISTS invoice_deliveries_sent_by_idx
  ON public.invoice_deliveries (sent_by);

-- The webhook resolves by provider message id; without this the lookup
-- is a sequential scan of every delivery the org has ever made.
CREATE INDEX IF NOT EXISTS invoice_deliveries_provider_message_idx
  ON public.invoice_deliveries (provider_message_id)
  WHERE provider_message_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. RLS — the fee family verbatim, with NO user-facing UPDATE or DELETE
-- ---------------------------------------------------------------------------
--
-- A delivery is a record of something that left the building. Nobody
-- edits it: the only writer after insert is the webhook's definer
-- resolver, which runs outside these policies. Deletion happens exactly
-- one way — the invoice cascade — so there is no DELETE policy either.

ALTER TABLE public.invoice_deliveries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS invoice_deliveries_select ON public.invoice_deliveries;
CREATE POLICY invoice_deliveries_select ON public.invoice_deliveries
  FOR SELECT TO authenticated
  USING (organization_id = (SELECT public.current_user_org_id())
         AND (SELECT public.can_read_fees()));

DROP POLICY IF EXISTS invoice_deliveries_insert ON public.invoice_deliveries;
CREATE POLICY invoice_deliveries_insert ON public.invoice_deliveries
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = (SELECT public.current_user_org_id())
              AND (SELECT public.can_write_mandates()));

-- ---------------------------------------------------------------------------
-- 3. The delivery resolver reaches invoices too (D.5, wired dark)
-- ---------------------------------------------------------------------------
--
-- Candidate outreach is tried first and still wins — it is the older
-- and busier path. An invoice delivery is only looked up when no
-- outreach row owns the message id, so the two can never collide.
-- Suppression behaviour is identical on both sides, and deliberately
-- so: a bounced client address damages the sending domain exactly as
-- much as a bounced candidate one.

CREATE OR REPLACE FUNCTION public.record_email_delivery_event(
  p_provider_message_id text,
  p_status text,
  p_address text DEFAULT NULL::text,
  p_detail text DEFAULT NULL::text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_row      public.candidate_outreach%ROWTYPE;
  v_delivery public.invoice_deliveries%ROWTYPE;
  v_org      uuid;
BEGIN
  IF p_status NOT IN ('delivered', 'bounced', 'complained') THEN
    RETURN 0;
  END IF;
  IF nullif(btrim(coalesce(p_provider_message_id, '')), '') IS NULL THEN
    RETURN 0;
  END IF;

  SELECT * INTO v_row FROM public.candidate_outreach AS o
   WHERE o.provider_message_id = btrim(p_provider_message_id)
     AND o.provider IS NOT NULL
   FOR UPDATE;

  IF v_row.id IS NOT NULL THEN
    IF v_row.delivery_status IN ('bounced', 'complained') THEN
      RETURN 0;
    END IF;

    UPDATE public.candidate_outreach AS o
       SET delivery_status = p_status
     WHERE o.id = v_row.id;

    v_org := v_row.organization_id;
  ELSE
    -- 126: no outreach row owns this id — try the invoice deliveries.
    SELECT * INTO v_delivery FROM public.invoice_deliveries AS d
     WHERE d.provider_message_id = btrim(p_provider_message_id)
     FOR UPDATE;

    IF v_delivery.id IS NULL THEN
      RETURN 0;
    END IF;
    IF v_delivery.delivery_status IN ('bounced', 'complained') THEN
      RETURN 0;
    END IF;

    UPDATE public.invoice_deliveries AS d
       SET delivery_status = p_status,
           failure_detail = CASE
             WHEN p_status IN ('bounced', 'complained')
               THEN nullif(btrim(coalesce(p_detail, '')), '')
             ELSE d.failure_detail
           END
     WHERE d.id = v_delivery.id;

    v_org := v_delivery.organization_id;
  END IF;

  IF p_status IN ('bounced', 'complained')
     AND v_org IS NOT NULL
     AND nullif(lower(btrim(coalesce(p_address, ''))), '') IS NOT NULL THEN
    INSERT INTO public.email_suppressions (organization_id, address, reason, detail)
    VALUES (
      v_org,
      lower(btrim(p_address)),
      CASE p_status WHEN 'bounced' THEN 'bounce' ELSE 'complaint' END,
      nullif(btrim(coalesce(p_detail, '')), '')
    )
    ON CONFLICT (organization_id, address) DO NOTHING;
  END IF;

  RETURN 1;
END;
$$;

-- CREATE OR REPLACE resets grants; this function is one of the ruled
-- TWELVE anon grants (110) because the webhook has no session. The
-- roster stays at TWELVE — this re-declares an existing member, it does
-- not add one.
REVOKE ALL ON FUNCTION public.record_email_delivery_event(text, text, text, text)
  FROM public;
GRANT EXECUTE ON FUNCTION public.record_email_delivery_event(text, text, text, text)
  TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. The trail. CHECK 92 → 93, intent door 25 → 26.
--    `invoice_sent` joins the invoice family: fee-writer-gated, written
--    at 'fees' visibility. The detail carries the invoice number and
--    the recipient — never the body.
-- ---------------------------------------------------------------------------

ALTER TABLE public.activity_events
  DROP CONSTRAINT IF EXISTS activity_events_type_known;

ALTER TABLE public.activity_events
  ADD CONSTRAINT activity_events_type_known CHECK (event_type IN (
    'placement_recorded', 'placement_status_changed',
    'placement_signoff_changed', 'placement_deleted',
    'fee_recorded', 'fee_updated', 'fee_line_earned',
    'fee_line_cancelled', 'fee_reversed', 'fee_terms_created',
    'fee_terms_updated', 'fee_terms_deleted',
    'client_contact_added', 'client_contact_updated',
    'client_contact_removed',
    'member_role_changed', 'member_status_changed',
    'member_founder_changed', 'member_org_changed',
    'shortlist_published', 'report_exported', 'hm_portal_opened',
    'mandate_reassigned',
    'external_invited', 'external_invitation_revoked',
    'external_invitation_resent', 'external_joined',
    'external_role_changed', 'external_status_changed',
    'mandate_shared', 'mandate_unshared',
    'external_access_granted', 'external_access_revoked',
    'candidate_portal_link_issued', 'candidate_portal_link_revoked',
    'candidate_self_updated', 'candidate_withdrew',
    'candidate_erasure_requested', 'candidate_cv_submitted',
    'feedback_interpreted', 'candidates_ranked', 'candidate_parsed',
    'candidate_evaluated', 'candidate_positioned',
    'candidate_researched', 'candidate_triangulated',
    'candidate_profiled', 'desk_digest_generated',
    'company_researched', 'hm_researched', 'culture_profiled',
    'sourcing_queries_generated', 'intake_analyzed',
    'health_suggested', 'weekly_report_generated',
    'calibration_derived', 'job_spec_generated',
    'shortlist_report_generated', 'copilot_answered',
    'success_profile_generated', 'interview_plan_generated',
    'executive_context_researched', 'candidate_search_answered',
    'sourcing_search_executed', 'outreach_strategy_drafted',
    'relationship_updated', 'network_dnc_set', 'network_dnc_cleared',
    'engagement_updated', 'prescreen_updated',
    'skill_created', 'skill_updated', 'skill_paused',
    'skill_activated', 'skill_deleted',
    'candidate_stage_changed',
    'task_assigned', 'task_completed',
    'objective_created', 'objective_closed',
    'interview_plan_generation_requested',
    'interview_plan_generation_failed',
    'interview_plan_approved',
    'client_interview_generation_requested',
    'client_interview_generation_failed',
    'client_interview_approved',
    'client_interview_answered',
    'model_provider_added', 'model_assignment_changed',
    'invoice_created', 'invoice_issued', 'invoice_voided',
    -- 126: the invoice left the building.
    'invoice_sent'
  ));

CREATE OR REPLACE FUNCTION public.record_activity_event(
  p_event_type   text,
  p_project_id   uuid DEFAULT NULL,
  p_candidate_id uuid DEFAULT NULL,
  p_client_id    uuid DEFAULT NULL,
  p_detail       jsonb DEFAULT '{}'::jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_org uuid := (SELECT public.current_user_org_id());
BEGIN
  IF p_event_type NOT IN ('shortlist_published', 'report_exported',
                          'hm_portal_opened', 'mandate_reassigned',
                          'skill_created', 'skill_updated', 'skill_paused',
                          'skill_activated', 'skill_deleted',
                          'candidate_stage_changed',
                          'task_assigned', 'task_completed',
                          'objective_created', 'objective_closed',
                          'interview_plan_generation_requested',
                          'interview_plan_generation_failed',
                          'interview_plan_approved',
                          'client_interview_generation_requested',
                          'client_interview_generation_failed',
                          'client_interview_approved',
                          'model_provider_added',
                          'model_assignment_changed',
                          'invoice_created', 'invoice_issued',
                          'invoice_voided', 'invoice_sent') THEN
    RAISE EXCEPTION 'record_activity_event: % is not an app-recordable event', p_event_type;
  END IF;

  IF (p_event_type LIKE 'skill\_%'
      OR p_event_type IN ('model_provider_added', 'model_assignment_changed'))
     AND (SELECT public.is_org_admin()) IS NOT TRUE THEN
    RAISE EXCEPTION 'record_activity_event: % is an admin act', p_event_type
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_event_type = 'candidate_stage_changed'
     AND (SELECT public.can_write_candidates()) IS NOT TRUE THEN
    RAISE EXCEPTION 'record_activity_event: % is a candidate-writer act', p_event_type
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_event_type = 'task_assigned'
     AND coalesce((SELECT public.can_manage_desk()), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'record_activity_event: % is a desk act', p_event_type
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_event_type IN ('objective_created', 'objective_closed')
     AND coalesce((SELECT public.can_write_okrs()), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'record_activity_event: % is an okr-writer act', p_event_type
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_event_type IN ('interview_plan_generation_requested',
                      'interview_plan_generation_failed',
                      'interview_plan_approved',
                      'client_interview_generation_requested',
                      'client_interview_generation_failed',
                      'client_interview_approved')
     AND coalesce((SELECT public.can_write_mandates()), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'record_activity_event: % is a mandate-writer act', p_event_type
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- 123 + 126: the invoice lifecycle is the fee-writer's act — 050's
  -- split, BOTH halves. These rows land at 'fees' visibility below,
  -- which is the only reason amounts may ride the detail.
  IF p_event_type IN ('invoice_created', 'invoice_issued',
                      'invoice_voided', 'invoice_sent')
     AND NOT (coalesce((SELECT public.can_read_fees()), false)
              AND coalesce((SELECT public.can_write_mandates()), false)) THEN
    RAISE EXCEPTION 'record_activity_event: % is a fee-writer act', p_event_type
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_org IS NULL OR (SELECT public.can_read_org()) IS NOT TRUE THEN
    RETURN;
  END IF;
  PERFORM public.write_activity_event(
    p_organization_id => v_org,
    p_event_type      => p_event_type,
    p_visibility      => CASE
                           WHEN p_event_type IN ('invoice_created',
                                                 'invoice_issued',
                                                 'invoice_voided',
                                                 'invoice_sent')
                             THEN 'fees'
                           ELSE 'org'
                         END,
    p_project_id      => p_project_id,
    p_candidate_id    => p_candidate_id,
    p_client_id       => p_client_id,
    p_detail          => p_detail
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_activity_event(text, uuid, uuid, uuid, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.record_activity_event(text, uuid, uuid, uuid, jsonb) TO authenticated, service_role;
