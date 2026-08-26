-- 128 — INVOICE VISIBILITY IN THE CLIENT PORTAL
--
-- Client portal programme, slice 2. Gate:
-- docs/superpowers/specs/2026-08-26-client-portal-gate.md, confirmed by
-- the founder 2026-08-26 — D4(b), D5, D6(a).
--
-- §162 closed the invoicing + print programme and named client-portal
-- invoice visibility as something it deliberately did not do. This is
-- that, and nothing more than that: a client admin can SEE what their
-- company has been billed, and print it. There is no write path of any
-- kind — no pay, no dispute, no acknowledge, not even a "seen" flag,
-- which would be a write to the invoice domain from outside the desk.
--
-- The 069 doctrine holds unchanged: externals hold no base-table policy
-- on `invoices` or `invoice_lines`, and these two SECURITY DEFINER RPCs
-- are their entire view of the money. A signed-in external holds their
-- session and the anon key, so both are reachable from a browser
-- console — each therefore returns only what its page renders.
--
-- D5, as three rules in the WHERE clauses below:
--   * ISSUED and VOID only. A draft is the desk thinking aloud and must
--     never cross. Void must cross: a client who saw an invoice is
--     owed the fact that it was cancelled.
--   * LINES CROSS. A total with no explanation invites exactly the
--     email the portal exists to prevent.
--   * The document renders from `from_snapshot` and nothing live —
--     which is already true of every issued invoice (123), so the
--     portal inherits the frozen-row guarantee rather than restating
--     it. An invoice a client saw in 2026 renders identically in 2036.
--
-- D6(a): `client_admin` ONLY, gated on is_client_admin() the way
-- portal_list_grants (069) already gates its ledger. A hiring manager
-- seeing the agency's fee for the person they just hired is a
-- real-world awkwardness with no upside.
--
-- Counts unmoved: anon roster stays TWELVE (both functions granted to
-- `authenticated`, revoked from `anon`); allowlist 29; doors 26; CHECK
-- 93 — nothing here writes a trail event, because nothing here writes.

-- ---------------------------------------------------------------------------
-- 1. The list
-- ---------------------------------------------------------------------------

-- Deliberately narrower than the document: a list row carries what the
-- list prints and no snapshot, so the index page cannot leak the
-- billing identity of an invoice the caller never opens.
--
-- Every branch fails closed. For staff, for a hiring manager, and for
-- a suspended or pending external, is_client_admin() is false; and
-- current_user_client_id() is NULL for all of them, so the equality is
-- NULL and matches nothing even if the first test were somehow passed.
CREATE OR REPLACE FUNCTION public.portal_list_invoices()
RETURNS TABLE(
  id uuid, invoice_number text, status text,
  issue_date date, due_date date,
  currency text, total_amount numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT i.id, i.invoice_number, i.status, i.issue_date, i.due_date,
         i.currency, i.total_amount
    FROM public.invoices i
   WHERE public.is_client_admin()
     AND i.client_id = (SELECT public.current_user_client_id())
     AND i.status IN ('issued', 'void')
   ORDER BY i.issue_date DESC NULLS LAST, i.invoice_number DESC
$$;

REVOKE ALL ON FUNCTION public.portal_list_invoices() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.portal_list_invoices() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. The document
-- ---------------------------------------------------------------------------

-- One invoice as the client's page renders it: the frozen row, its
-- lines, and the billing identity the document prints.
--
-- The snapshot is NOT passed through whole. `from_snapshot` carries the
-- template's `from_email`, `reply_to`, `numbering_prefix` and default
-- terms — desk machinery the document does not render, and the 069
-- rule is that a portal RPC returns what the page shows rather than
-- the row it was computed from. `logo_path` crosses because the page
-- must sign it; the signing itself happens server-side with the
-- service role AFTER this function has authorised the read.
--
-- `placement_id` and `fee_line_id` are dropped from the lines for the
-- same reason: they are provenance for the desk, and a client has no
-- use for the id of a fee line they cannot look up.
CREATE OR REPLACE FUNCTION public.portal_get_invoice(p_invoice_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv  public.invoices%ROWTYPE;
  v_snap jsonb;
BEGIN
  IF NOT public.is_client_admin() THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_inv
    FROM public.invoices i
   WHERE i.id = p_invoice_id
     AND i.client_id = (SELECT public.current_user_client_id())
     AND i.status IN ('issued', 'void');

  IF NOT FOUND THEN
    -- Not theirs, still a draft, or not an invoice at all. The caller
    -- does not learn which, and neither should the page.
    RETURN NULL;
  END IF;

  v_snap := coalesce(v_inv.from_snapshot, '{}'::jsonb);

  RETURN jsonb_build_object(
    'invoice', jsonb_build_object(
      'id', v_inv.id,
      'status', v_inv.status,
      'invoice_number', v_inv.invoice_number,
      'issue_date', v_inv.issue_date,
      'due_date', v_inv.due_date,
      'payment_terms_days', v_inv.payment_terms_days,
      'currency', v_inv.currency,
      'bill_to', v_inv.bill_to,
      'total_amount', v_inv.total_amount,
      'notes', v_inv.notes,
      'voided_at', v_inv.voided_at,
      'created_at', v_inv.created_at),
    -- Only the furniture the document prints.
    'structure', jsonb_build_object(
      'billing_name', v_snap->>'billing_name',
      'address_lines', coalesce(v_snap->'address_lines', '[]'::jsonb),
      'company_number', v_snap->>'company_number',
      'vat_number', v_snap->>'vat_number',
      'payment_instructions', v_snap->>'payment_instructions',
      'header_text', v_snap->>'header_text',
      'footer_text', v_snap->>'footer_text'),
    'logo_path', v_snap->>'logo_path',
    'lines', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'id', l.id,
               'label', l.label,
               'sequence', l.sequence,
               'amount', l.amount,
               'currency', l.currency)
             ORDER BY l.sequence)
        FROM public.invoice_lines l
       WHERE l.invoice_id = v_inv.id
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.portal_get_invoice(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.portal_get_invoice(uuid) TO authenticated, service_role;
