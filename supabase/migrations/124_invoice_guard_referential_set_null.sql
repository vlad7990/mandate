-- 124 — the frozen document admits its referential SET NULLs (found
-- live in drive 110, minutes after 123 applied).
--
-- 123 ruled that an issued invoice outlives its template: template_id
-- is ON DELETE SET NULL and the billing identity lives in
-- from_snapshot. But a referential action IS an UPDATE, and it fires
-- the row's BEFORE UPDATE trigger — so deleting a template that an
-- issued invoice pointed at was refused by the invoice's own
-- immutability guard, and the template delete died with "Invoice … is
-- issued and immutable". The same trap sat on client_id and
-- created_by (invoices), and on placement_id / fee_line_id
-- (invoice_lines): deleting a placement after invoicing it would have
-- been refused by the frozen lines that recorded it.
--
-- The fix admits exactly ONE edit shape through the frozen door: a
-- provenance FK moving to NULL while every other column is
-- byte-identical. That is the referential action's precise footprint,
-- and it is harmless by construction — the FKs are provenance, not
-- data; every printed fact was snapshotted onto the document at
-- issue. A hand-run UPDATE that only clears a provenance FK is
-- indistinguishable and equally harmless: nothing the document says
-- changes.

CREATE OR REPLACE FUNCTION public.guard_invoices()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_allowed boolean :=
    COALESCE(current_setting('mandate.allow_invoice_transition', true), '') = 'on';
  v_provenance_only boolean;
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

  -- UPDATE from here down. The one edit a frozen document admits:
  -- provenance FKs (template, client, author) going NULL because the
  -- row they pointed at was deleted — everything else identical.
  v_provenance_only :=
    (to_jsonb(NEW) - 'template_id' - 'client_id' - 'created_by')
      = (to_jsonb(OLD) - 'template_id' - 'client_id' - 'created_by')
    AND (NEW.template_id IS NOT DISTINCT FROM OLD.template_id OR NEW.template_id IS NULL)
    AND (NEW.client_id   IS NOT DISTINCT FROM OLD.client_id   OR NEW.client_id   IS NULL)
    AND (NEW.created_by  IS NOT DISTINCT FROM OLD.created_by  OR NEW.created_by  IS NULL);

  IF OLD.status = 'void' AND NOT v_allowed AND NOT v_provenance_only THEN
    RAISE EXCEPTION 'Invoice % is void and immutable.', OLD.id
      USING ERRCODE = 'P0001';
  END IF;

  IF OLD.status = 'issued' AND NOT v_allowed AND NOT v_provenance_only THEN
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

REVOKE ALL ON FUNCTION public.guard_invoices() FROM public, anon, authenticated;

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
  v_provenance_only boolean := false;
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

  -- The referential footprint (124): placement or fee line deleted
  -- after billing — the FK clears, the snapshot stays.
  IF TG_OP = 'UPDATE' THEN
    v_provenance_only :=
      (to_jsonb(NEW) - 'placement_id' - 'fee_line_id')
        = (to_jsonb(OLD) - 'placement_id' - 'fee_line_id')
      AND (NEW.placement_id IS NOT DISTINCT FROM OLD.placement_id OR NEW.placement_id IS NULL)
      AND (NEW.fee_line_id  IS NOT DISTINCT FROM OLD.fee_line_id  OR NEW.fee_line_id  IS NULL);
  END IF;

  IF v_status <> 'draft' AND NOT v_allowed AND NOT v_provenance_only THEN
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
