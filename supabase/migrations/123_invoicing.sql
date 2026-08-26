-- 123 — INVOICING (invoicing + print programme, gate 5f2820d, slice 1,
-- built on the founder's word 2026-08-26; all six D-decisions as
-- recommended).
--
-- The fee tables (050) already hold every number: placement_fee_lines
-- IS the line-item ledger, and 050's own header says scope stops at
-- "fee earned / invoiceable" because an invoice number and a payment
-- record belong to an accounting system. What the founder asked for is
-- the DOCUMENT: a templated, numbered, printable invoice assembled
-- from earned fee lines and sent to the client. So an invoice here is
-- a SELECTION plus a SNAPSHOT — never new money math. The one sum it
-- stores (`total_amount`) is a sum of its own snapshotted lines,
-- maintained by trigger, and every amount on it was computed by the
-- fee tables first.
--
-- ## The three decisions this schema encodes (gate §D, all ruled)
--
-- 1. **No new capability.** Template authoring is admin territory
--    (org:manage in the app, `is_org_admin()` here — the Skills/models
--    precedent); invoices ride 050's own split verbatim: SELECT
--    `can_read_fees()`, writes `can_write_mandates()`. Agents touch
--    none of this — invoicing is human work; the agent allowlist stays
--    29 and the anon roster stays TWELVE.
-- 2. **Numbers are minted at ISSUE.** Drafts are unnumbered; the
--    template carries the prefix and a per-template counter, and
--    `issue_invoice` takes the next number under a row lock. A draft
--    that is deleted never consumed a number, so the sequence has no
--    holes a bookkeeper has to explain.
-- 3. **Issue is a one-way door** (the 037/034 immutability family: a
--    trigger plus a transaction-local flag, promotion RPC-only). An
--    issued invoice went to a client; editing it would rewrite a
--    document someone else has a copy of. void never revives, and the
--    only path past a wrong issued invoice is void + reissue.
--
-- ## Why from/bill-to are captured, not joined
--
-- `organizations` is name+slug and `clients` have no billing address —
-- there is nothing to join. The template carries the org's billing
-- identity (editable jsonb, no organizations migration), and issue
-- freezes it into `from_snapshot` beside the `bill_to` the recruiter
-- typed, so the document still says what it said the day it went out
-- even after the template is edited or deleted. Same frozen-copy rule
-- as 050's terms snapshot and 053's actor_label.

-- ---------------------------------------------------------------------------
-- 1. The logo bucket — private, 2MB, raster image mimes only
--    (the cvs/call-audio precedent: org-first path segment, session
--    client uploads, RLS is the enforcement). No SVG: a logo that can
--    carry a script is not a logo.
-- ---------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'invoice-assets',
  'invoice-assets',
  false,
  2097152, -- 2 MB
  ARRAY['image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS invoice_assets_org_read ON storage.objects;
CREATE POLICY invoice_assets_org_read ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'invoice-assets'
    AND (storage.foldername(name))[1] = public.current_user_org_id()::text
  );

DROP POLICY IF EXISTS invoice_assets_org_insert ON storage.objects;
CREATE POLICY invoice_assets_org_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'invoice-assets'
    AND (storage.foldername(name))[1] = public.current_user_org_id()::text
  );

DROP POLICY IF EXISTS invoice_assets_org_delete ON storage.objects;
CREATE POLICY invoice_assets_org_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'invoice-assets'
    AND (storage.foldername(name))[1] = public.current_user_org_id()::text
  );

-- ---------------------------------------------------------------------------
-- 2. Templates — where the org's billing identity lives
-- ---------------------------------------------------------------------------
--
-- `structure` is jsonb rather than columns for the 050 instalment-plan
-- reason: it is a document header, always read whole, never queried
-- across. The app's `parseTemplateStructure` is the shape's edge. What
-- it carries: billing_name, address_lines, company_number, vat_number,
-- payment_instructions, header_text, footer_text, numbering_prefix,
-- default_payment_terms_days.
--
-- `numbering_next` is a column, not a jsonb key, because it is the one
-- value written under contention: issue takes it FOR UPDATE.

CREATE TABLE IF NOT EXISTS public.invoice_templates (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

  name             text NOT NULL CHECK (length(btrim(name)) > 0),
  logo_path        text,
  structure        jsonb NOT NULL DEFAULT '{}'::jsonb,
  numbering_next   integer NOT NULL DEFAULT 1 CHECK (numbering_next >= 1),

  created_by       uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- Two templates with one name would make the builder's picker a coin
-- toss over which billing identity lands on the document.
CREATE UNIQUE INDEX IF NOT EXISTS invoice_templates_name_per_org
  ON public.invoice_templates (organization_id, name);

CREATE INDEX IF NOT EXISTS invoice_templates_org_idx
  ON public.invoice_templates (organization_id);
CREATE INDEX IF NOT EXISTS invoice_templates_created_by_idx
  ON public.invoice_templates (created_by);

-- ---------------------------------------------------------------------------
-- 3. Invoices — the document header
-- ---------------------------------------------------------------------------
--
-- Every FK that is not the org is SET NULL: the document outlives the
-- rows it billed. An issued invoice whose template, client or
-- placement is later deleted still reads exactly as it went out,
-- because everything it displays is snapshotted onto it.

CREATE TABLE IF NOT EXISTS public.invoices (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

  client_id           uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  template_id         uuid REFERENCES public.invoice_templates(id) ON DELETE SET NULL,

  status              text NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft', 'issued', 'void')),

  -- Minted at issue; unique per org among minted numbers. Drafts are
  -- unnumbered on purpose (gate D.2) — see the header.
  invoice_number      text,

  issue_date          date,
  due_date            date,
  payment_terms_days  integer NOT NULL DEFAULT 30 CHECK (payment_terms_days >= 0),

  currency            text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),

  -- The client's name and address AS TYPED on this document.
  bill_to             jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- The template's billing identity AS OF issue. Null until issue.
  from_snapshot       jsonb,

  -- Sum of this invoice's own lines, trigger-maintained while draft
  -- and frozen with everything else at issue. Stored rather than
  -- computed on read so the acceptance query ("what did we invoice")
  -- never disagrees with the printed document.
  total_amount        numeric(14,2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),

  notes               text,
  voided_at           timestamptz,

  created_by          uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  -- An issued document is complete or it is not issued.
  CONSTRAINT invoices_issued_is_complete CHECK (
    status = 'draft'
    OR (invoice_number IS NOT NULL
        AND issue_date IS NOT NULL
        AND due_date IS NOT NULL
        AND from_snapshot IS NOT NULL)
  ),
  CONSTRAINT invoices_draft_unnumbered CHECK (
    status <> 'draft' OR invoice_number IS NULL
  ),
  CONSTRAINT invoices_void_has_time CHECK (
    (status = 'void') = (voided_at IS NOT NULL)
  ),
  CONSTRAINT invoices_dates_ordered CHECK (
    issue_date IS NULL OR due_date IS NULL OR due_date >= issue_date
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS invoices_number_per_org
  ON public.invoices (organization_id, invoice_number)
  WHERE invoice_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS invoices_org_idx ON public.invoices (organization_id);
CREATE INDEX IF NOT EXISTS invoices_client_idx ON public.invoices (client_id);
CREATE INDEX IF NOT EXISTS invoices_template_idx ON public.invoices (template_id);
CREATE INDEX IF NOT EXISTS invoices_status_idx ON public.invoices (organization_id, status);
CREATE INDEX IF NOT EXISTS invoices_created_by_idx ON public.invoices (created_by);

-- ---------------------------------------------------------------------------
-- 4. Invoice lines — snapshots of what was billed
-- ---------------------------------------------------------------------------
--
-- label/amount/currency are COPIES taken from the fee line at add
-- time (the actor_label precedent applied to money): a fee edit after
-- issue must never rewrite a document a client already has. The FKs
-- exist so the builder can say "already billed" and so void can
-- release the right lines — they are provenance, not the data.
--
-- A fee line on at most one live invoice is a VISIBILITY rule in the
-- builder's query, not a constraint here (gate B.1): void releases
-- the line, and a schema constraint would have to know about status.

CREATE TABLE IF NOT EXISTS public.invoice_lines (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  invoice_id       uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,

  placement_id     uuid REFERENCES public.placements(id) ON DELETE SET NULL,
  fee_line_id      uuid REFERENCES public.placement_fee_lines(id) ON DELETE SET NULL,

  label            text NOT NULL CHECK (length(btrim(label)) > 0),
  sequence         integer NOT NULL DEFAULT 1,
  amount           numeric(14,2) NOT NULL,
  currency         text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),

  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS invoice_lines_org_idx ON public.invoice_lines (organization_id);
CREATE INDEX IF NOT EXISTS invoice_lines_invoice_idx ON public.invoice_lines (invoice_id);
CREATE INDEX IF NOT EXISTS invoice_lines_placement_idx ON public.invoice_lines (placement_id);
CREATE INDEX IF NOT EXISTS invoice_lines_fee_line_idx ON public.invoice_lines (fee_line_id);

-- ---------------------------------------------------------------------------
-- 5. The one-way door (037 family: trigger + transaction-local flag)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.guard_invoices()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_allowed boolean :=
    COALESCE(current_setting('mandate.allow_invoice_transition', true), '') = 'on';
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'draft' AND NOT v_allowed THEN
      RAISE EXCEPTION 'Invoices are created as drafts. Use issue_invoice() to issue.'
        USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    -- A numbered document is a record. Drafts never consumed a number
    -- and may go; issued and void rows stay (void + reissue is the
    -- path past a wrong one). The flag exception exists for ruled,
    -- founder-authorised sweeps only.
    IF OLD.status <> 'draft' AND NOT v_allowed THEN
      RAISE EXCEPTION 'Invoice % is % and is a record — it cannot be deleted. Void it instead.', OLD.id, OLD.status
        USING ERRCODE = 'P0001';
    END IF;
    RETURN OLD;
  END IF;

  -- UPDATE from here down.
  IF OLD.status = 'void' AND NOT v_allowed THEN
    RAISE EXCEPTION 'Invoice % is void and immutable.', OLD.id
      USING ERRCODE = 'P0001';
  END IF;

  IF OLD.status = 'issued' AND NOT v_allowed THEN
    RAISE EXCEPTION 'Invoice % is issued and immutable. Use void_invoice() and reissue.', OLD.id
      USING ERRCODE = 'P0001';
  END IF;

  IF NEW.status = 'issued' AND OLD.status IS DISTINCT FROM 'issued' AND NOT v_allowed THEN
    RAISE EXCEPTION 'Use issue_invoice() to issue an invoice.'
      USING ERRCODE = 'P0001';
  END IF;

  IF NEW.status = 'void' AND OLD.status IS DISTINCT FROM 'void' AND NOT v_allowed THEN
    RAISE EXCEPTION 'Use void_invoice() to void an invoice.'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

-- The 121 lesson, applied at birth: Postgres grants EXECUTE to PUBLIC
-- on every new function, and a trigger function has no caller — the
-- trigger machinery invokes it as the table owner.
REVOKE ALL ON FUNCTION public.guard_invoices() FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS invoices_guard ON public.invoices;
CREATE TRIGGER invoices_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.guard_invoices();

-- Lines freeze with their document, and an invoice bills in ONE
-- currency (gate §C: no conversion on the invoice — a fee line is
-- billed in its own currency, so lines in two currencies are two
-- invoices).
CREATE OR REPLACE FUNCTION public.guard_invoice_lines()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_allowed boolean :=
    COALESCE(current_setting('mandate.allow_invoice_transition', true), '') = 'on';
  v_status   text;
  v_currency text;
BEGIN
  SELECT status, currency
    INTO v_status, v_currency
    FROM public.invoices
   WHERE id = COALESCE(NEW.invoice_id, OLD.invoice_id);

  -- No parent row means the parent's DELETE is cascading through us,
  -- and the parent's own guard already ruled on that delete.
  IF v_status IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF v_status <> 'draft' AND NOT v_allowed THEN
    RAISE EXCEPTION 'Invoice lines are frozen once the invoice is %.', v_status
      USING ERRCODE = 'P0001';
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.currency <> v_currency THEN
    RAISE EXCEPTION 'This line is in % but the invoice bills in % — an invoice carries one currency.', NEW.currency, v_currency
      USING ERRCODE = 'P0001';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE ALL ON FUNCTION public.guard_invoice_lines() FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS invoice_lines_guard ON public.invoice_lines;
CREATE TRIGGER invoice_lines_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.invoice_lines
  FOR EACH ROW EXECUTE FUNCTION public.guard_invoice_lines();

-- The stored total tracks the lines while the document is a draft.
-- After issue the lines cannot change (guard above), so the frozen
-- total stays true by construction.
CREATE OR REPLACE FUNCTION public.refresh_invoice_total()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_invoice uuid := COALESCE(NEW.invoice_id, OLD.invoice_id);
BEGIN
  UPDATE public.invoices
     SET total_amount = COALESCE((
           SELECT sum(amount) FROM public.invoice_lines WHERE invoice_id = v_invoice
         ), 0),
         updated_at = now()
   WHERE id = v_invoice
     AND status = 'draft';
  RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_invoice_total() FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS invoice_lines_refresh_total ON public.invoice_lines;
CREATE TRIGGER invoice_lines_refresh_total
  AFTER INSERT OR UPDATE OR DELETE ON public.invoice_lines
  FOR EACH ROW EXECUTE FUNCTION public.refresh_invoice_total();

-- ---------------------------------------------------------------------------
-- 6. issue_invoice — number minted, snapshots frozen, one atomic step
-- ---------------------------------------------------------------------------
--
-- SECURITY DEFINER, unlike approve_interview_plan, for one reason: the
-- counter lives on the template, template writes are admin-only under
-- RLS, and a recruiter issuing an invoice must still advance it. The
-- definer body therefore re-states every check RLS would have made:
-- caller's org, and 050's own write predicate pair.

CREATE OR REPLACE FUNCTION public.issue_invoice(p_invoice_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org        uuid := (SELECT public.current_user_org_id());
  v_inv        public.invoices%ROWTYPE;
  v_tpl        public.invoice_templates%ROWTYPE;
  v_lines      integer;
  v_mismatched integer;
  v_number     text;
  v_total      numeric(14,2);
BEGIN
  IF (SELECT auth.uid()) IS NULL OR v_org IS NULL THEN
    RAISE EXCEPTION 'Authentication required to issue an invoice.'
      USING ERRCODE = 'P0001';
  END IF;

  -- The fee-writer's act: the trio that writes placements and sees
  -- money (gate D.1). coalesce because NOT NULL is NULL — the 064
  -- lesson.
  IF NOT (coalesce((SELECT public.can_write_mandates()), false)
          AND coalesce((SELECT public.can_read_fees()), false)) THEN
    RAISE EXCEPTION 'Issuing an invoice is a fee-writer''s act.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_inv
    FROM public.invoices
   WHERE id = p_invoice_id AND organization_id = v_org
   FOR UPDATE;

  IF v_inv.id IS NULL THEN
    RAISE EXCEPTION 'Invoice % was not found (or is not yours to issue).', p_invoice_id
      USING ERRCODE = 'P0002';
  END IF;
  IF v_inv.status <> 'draft' THEN
    RAISE EXCEPTION 'Invoice % is already % — only drafts issue.', p_invoice_id, v_inv.status
      USING ERRCODE = 'P0001';
  END IF;

  IF v_inv.template_id IS NULL THEN
    RAISE EXCEPTION 'The draft has no template — a template carries the billing identity and the number sequence.'
      USING ERRCODE = 'P0001';
  END IF;

  -- The template row lock is what serialises two concurrent issues
  -- against one sequence.
  SELECT * INTO v_tpl
    FROM public.invoice_templates
   WHERE id = v_inv.template_id AND organization_id = v_org
   FOR UPDATE;

  IF v_tpl.id IS NULL THEN
    RAISE EXCEPTION 'The draft''s template no longer exists — pick another before issuing.'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT count(*), count(*) FILTER (WHERE currency <> v_inv.currency)
    INTO v_lines, v_mismatched
    FROM public.invoice_lines
   WHERE invoice_id = v_inv.id;

  IF v_lines = 0 THEN
    RAISE EXCEPTION 'An invoice with no lines bills nothing — add at least one.'
      USING ERRCODE = 'P0001';
  END IF;
  IF v_mismatched > 0 THEN
    RAISE EXCEPTION 'The draft mixes currencies — an invoice carries one.'
      USING ERRCODE = 'P0001';
  END IF;

  IF coalesce(btrim(v_inv.bill_to->>'name'), '') = '' THEN
    RAISE EXCEPTION 'The document needs a bill-to name before it can issue.'
      USING ERRCODE = 'P0001';
  END IF;

  v_number := coalesce(v_tpl.structure->>'numbering_prefix', 'INV-')
              || lpad(v_tpl.numbering_next::text, 4, '0');

  UPDATE public.invoice_templates
     SET numbering_next = numbering_next + 1,
         updated_at = now()
   WHERE id = v_tpl.id;

  SELECT coalesce(sum(amount), 0) INTO v_total
    FROM public.invoice_lines
   WHERE invoice_id = v_inv.id;

  IF v_total < 0 THEN
    RAISE EXCEPTION 'The draft totals below zero — a negative invoice is a credit note, which this product does not write.'
      USING ERRCODE = 'P0001';
  END IF;

  PERFORM set_config('mandate.allow_invoice_transition', 'on', true);

  UPDATE public.invoices
     SET status         = 'issued',
         invoice_number = v_number,
         issue_date     = current_date,
         due_date       = current_date + v_inv.payment_terms_days,
         -- The template's identity as of THIS moment, logo included.
         from_snapshot  = v_tpl.structure
                          || jsonb_build_object(
                               'template_name', v_tpl.name,
                               'logo_path', v_tpl.logo_path),
         total_amount   = v_total,
         updated_at     = now()
   WHERE id = v_inv.id;

  PERFORM set_config('mandate.allow_invoice_transition', '', true);
END;
$$;

REVOKE ALL ON FUNCTION public.issue_invoice(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.issue_invoice(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 7. void_invoice — SECURITY INVOKER on purpose: the UPDATE runs under
--    the caller's own RLS (org + can_write_mandates), so the function
--    adds no reach; it only carries the flag past the one-way door.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.void_invoice(p_invoice_id uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Authentication required to void an invoice.'
      USING ERRCODE = 'P0001';
  END IF;

  PERFORM set_config('mandate.allow_invoice_transition', 'on', true);

  UPDATE public.invoices
     SET status = 'void',
         voided_at = now(),
         updated_at = now()
   WHERE id = p_invoice_id
     AND status = 'issued';

  IF NOT FOUND THEN
    PERFORM set_config('mandate.allow_invoice_transition', '', true);
    RAISE EXCEPTION 'Invoice % could not be voided (not found, not accessible, or not issued).', p_invoice_id
      USING ERRCODE = 'P0002';
  END IF;

  PERFORM set_config('mandate.allow_invoice_transition', '', true);
END;
$$;

REVOKE ALL ON FUNCTION public.void_invoice(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.void_invoice(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 8. RLS — 050's split verbatim; template writes admin (gate D.1)
-- ---------------------------------------------------------------------------

ALTER TABLE public.invoice_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_lines ENABLE ROW LEVEL SECURITY;

-- --- invoice_templates -----------------------------------------------------
-- SELECT is can_read_fees() rather than admin: the builder is the money
-- trio's surface and it has to list templates to put one on a draft.

DROP POLICY IF EXISTS invoice_templates_select ON public.invoice_templates;
CREATE POLICY invoice_templates_select ON public.invoice_templates
  FOR SELECT TO authenticated
  USING (organization_id = (SELECT public.current_user_org_id())
         AND (SELECT public.can_read_fees()));

DROP POLICY IF EXISTS invoice_templates_insert ON public.invoice_templates;
CREATE POLICY invoice_templates_insert ON public.invoice_templates
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = (SELECT public.current_user_org_id())
              AND (SELECT public.is_org_admin()));

DROP POLICY IF EXISTS invoice_templates_update ON public.invoice_templates;
CREATE POLICY invoice_templates_update ON public.invoice_templates
  FOR UPDATE TO authenticated
  USING (organization_id = (SELECT public.current_user_org_id())
         AND (SELECT public.is_org_admin()))
  WITH CHECK (organization_id = (SELECT public.current_user_org_id())
              AND (SELECT public.is_org_admin()));

DROP POLICY IF EXISTS invoice_templates_delete ON public.invoice_templates;
CREATE POLICY invoice_templates_delete ON public.invoice_templates
  FOR DELETE TO authenticated
  USING (organization_id = (SELECT public.current_user_org_id())
         AND (SELECT public.is_org_admin()));

-- --- invoices --------------------------------------------------------------

DROP POLICY IF EXISTS invoices_select ON public.invoices;
CREATE POLICY invoices_select ON public.invoices
  FOR SELECT TO authenticated
  USING (organization_id = (SELECT public.current_user_org_id())
         AND (SELECT public.can_read_fees()));

DROP POLICY IF EXISTS invoices_insert ON public.invoices;
CREATE POLICY invoices_insert ON public.invoices
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = (SELECT public.current_user_org_id())
              AND (SELECT public.can_write_mandates()));

DROP POLICY IF EXISTS invoices_update ON public.invoices;
CREATE POLICY invoices_update ON public.invoices
  FOR UPDATE TO authenticated
  USING (organization_id = (SELECT public.current_user_org_id())
         AND (SELECT public.can_write_mandates()))
  WITH CHECK (organization_id = (SELECT public.current_user_org_id())
              AND (SELECT public.can_write_mandates()));

DROP POLICY IF EXISTS invoices_delete ON public.invoices;
CREATE POLICY invoices_delete ON public.invoices
  FOR DELETE TO authenticated
  USING (organization_id = (SELECT public.current_user_org_id())
         AND (SELECT public.can_write_mandates()));

-- --- invoice_lines ---------------------------------------------------------

DROP POLICY IF EXISTS invoice_lines_select ON public.invoice_lines;
CREATE POLICY invoice_lines_select ON public.invoice_lines
  FOR SELECT TO authenticated
  USING (organization_id = (SELECT public.current_user_org_id())
         AND (SELECT public.can_read_fees()));

DROP POLICY IF EXISTS invoice_lines_insert ON public.invoice_lines;
CREATE POLICY invoice_lines_insert ON public.invoice_lines
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = (SELECT public.current_user_org_id())
              AND (SELECT public.can_write_mandates()));

DROP POLICY IF EXISTS invoice_lines_update ON public.invoice_lines;
CREATE POLICY invoice_lines_update ON public.invoice_lines
  FOR UPDATE TO authenticated
  USING (organization_id = (SELECT public.current_user_org_id())
         AND (SELECT public.can_write_mandates()))
  WITH CHECK (organization_id = (SELECT public.current_user_org_id())
              AND (SELECT public.can_write_mandates()));

DROP POLICY IF EXISTS invoice_lines_delete ON public.invoice_lines;
CREATE POLICY invoice_lines_delete ON public.invoice_lines
  FOR DELETE TO authenticated
  USING (organization_id = (SELECT public.current_user_org_id())
         AND (SELECT public.can_write_mandates()));

-- ---------------------------------------------------------------------------
-- 9. The trail. CHECK rebuilt from 120's list (89 values) + the three
--    invoice intents = 92. The intent door widens 22 → 25; the three
--    new intents are the fee-writer's act (can_read_fees AND
--    can_write_mandates — 050's split, both halves) and are written at
--    'fees' visibility: the org sees nothing, the money trio sees the
--    act, and amounts may ride detail ONLY because of that tier
--    (gate D.3). record_agent_event untouched at 29; anon roster
--    untouched at TWELVE.
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
    -- 123: the invoice lifecycle's three human acts.
    'invoice_created', 'invoice_issued', 'invoice_voided'
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
                          'invoice_voided') THEN
    RAISE EXCEPTION 'record_activity_event: % is not an app-recordable event', p_event_type;
  END IF;

  -- 102 + 120: skills and the model registry are admin territory —
  -- only the role that can change one can claim to have changed one.
  -- Agents are 'agent', not admin; the same refusal covers them.
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

  -- Assigning work is the desk's act; completing rides the actor
  -- stamp (the RLS pin already proved the right to complete).
  IF p_event_type = 'task_assigned'
     AND coalesce((SELECT public.can_manage_desk()), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'record_activity_event: % is a desk act', p_event_type
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- 107: setting or closing an objective is an okr-writer's act. The
  -- detail carries titles, scopes and outcomes — never amounts (R1:
  -- these rows are org-visible and the money is not).
  IF p_event_type IN ('objective_created', 'objective_closed')
     AND coalesce((SELECT public.can_write_okrs()), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'record_activity_event: % is an okr-writer act', p_event_type
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- 116 + 117: both interview lifecycles are a mandate-writer's act.
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

  -- 123: the invoice lifecycle is the fee-writer's act — 050's split,
  -- BOTH halves. The rows land at 'fees' visibility below, which is
  -- the only reason amounts may ride the detail (gate D.3).
  IF p_event_type IN ('invoice_created', 'invoice_issued', 'invoice_voided')
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
                                                 'invoice_voided')
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

-- CREATE OR REPLACE resets grants; re-declare the door's audience.
REVOKE ALL ON FUNCTION public.record_activity_event(text, uuid, uuid, uuid, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.record_activity_event(text, uuid, uuid, uuid, jsonb) TO authenticated, service_role;
