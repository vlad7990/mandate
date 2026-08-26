import Link from "next/link";
import { notFound } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getServiceRoleSupabaseClient } from "@/lib/supabase-service-role";
import { requirePortalAccess } from "@/lib/auth/portal-access";
import { PrintReportButton } from "@/components/ui/print-report-button";
import {
  INVOICE_STATUS_LABELS,
  parseBillTo,
  parseTemplateStructure,
  type InvoiceLineRow,
  type InvoiceRow,
} from "@/lib/invoices/types";
import { InvoiceDocument } from "@/app/(dashboard)/app/placements/invoices/[invoiceId]/invoice-document";

/**
 * One invoice, seen from the client side (128, gate D4(b)/D5).
 *
 * §133's one-renderer rule crosses the desk/client boundary here: this
 * page mounts the SAME `InvoiceDocument` the agency looks at, fed from
 * the same frozen row. A second layout for the client would be a
 * second thing to disagree with — the exact failure the print pass
 * (§160) existed to end.
 *
 * The payload comes from `portal_get_invoice`, which decided access
 * in-database and returned only the document's own furniture: no
 * `from_email`, no numbering machinery, no line provenance. A NULL
 * means not theirs, still a draft, or not an invoice — and the page
 * does not distinguish, because the RPC did not.
 */

export const metadata = { title: "Invoice" };

type Payload = {
  invoice: {
    id: string;
    status: InvoiceRow["status"];
    invoice_number: string | null;
    issue_date: string | null;
    due_date: string | null;
    payment_terms_days: number;
    currency: string;
    bill_to: unknown;
    total_amount: number;
    notes: string | null;
    voided_at: string | null;
    created_at: string;
  };
  structure: unknown;
  logo_path: string | null;
  lines: Array<{
    id: string;
    label: string;
    sequence: number;
    amount: number;
    currency: string;
  }>;
};

// The scope id is written as a LITERAL in both places on purpose.
// print-report-button.test.ts pairs `scopeId="x"` against a declared
// `printId="x"`/`id="x"` by source text, so a shared constant would
// make this document invisible to the guard that exists to catch a
// dangling scope. The duplication IS the check.

export default async function PortalInvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const access = await requirePortalAccess();
  if (access.role !== "client_admin") {
    notFound();
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("portal_get_invoice", {
    p_invoice_id: id,
  });
  if (error) {
    console.error("[portal] invoice read failed", error);
  }
  const payload = (data ?? null) as Payload | null;
  if (!payload) {
    notFound();
  }

  // The logo is signed AFTER the RPC authorised the read, with the
  // service role: the bucket holds the agency's own assets and an
  // external has no policy on it. Authorise as them, then act as the
  // system — the answer door's shape (127), applied to storage.
  let logoUrl: string | null = null;
  if (payload.logo_path) {
    const { data: signed } = await getServiceRoleSupabaseClient()
      .storage.from("invoice-assets")
      .createSignedUrl(payload.logo_path, 3600);
    logoUrl = signed?.signedUrl ?? null;
  }

  const structure = parseTemplateStructure(payload.structure);
  const billTo = parseBillTo(payload.invoice.bill_to);

  // The document's own type wants the full row shape. The fields the
  // portal deliberately does not receive are the ones it never renders,
  // so they are filled with the absence they represent rather than
  // widened into the RPC's contract.
  const invoice: InvoiceRow = {
    ...payload.invoice,
    organization_id: "",
    client_id: null,
    template_id: null,
    from_snapshot: payload.structure,
    created_by: null,
    updated_at: payload.invoice.created_at,
  };

  const lines: InvoiceLineRow[] = payload.lines.map((l) => ({
    ...l,
    organization_id: "",
    invoice_id: payload.invoice.id,
    placement_id: null,
    fee_line_id: null,
    created_at: payload.invoice.created_at,
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <p className="font-mono-label text-mono-label uppercase tracking-widest text-outline">
          <Link href="/portal/invoices" className="transition-colors hover:text-primary">
            Invoices
          </Link>
          {" // "}
          {payload.invoice.invoice_number ?? "Invoice"}
          {payload.invoice.status === "void" && (
            <span className="ml-2 text-error">
              {INVOICE_STATUS_LABELS.void}
            </span>
          )}
        </p>
        <div className="w-full max-w-xs">
          {/* Scoped: the portal's header and footer are not
              `print:hidden` the way the dashboard shell is, so the
              document marks itself and the scoped-print CSS drops the
              rest of the page (§160). */}
          <PrintReportButton scopeId="portal-invoice-document" />
        </div>
      </div>

      {payload.invoice.status === "void" && (
        <p className="border border-error/40 bg-surface-container px-5 py-3 text-body-main text-on-surface-variant">
          This invoice was cancelled
          {payload.invoice.voided_at
            ? ` on ${new Date(payload.invoice.voided_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`
            : ""}{" "}
          and is not payable. It is kept here because you may have
          received it.
        </p>
      )}

      <InvoiceDocument
        invoice={invoice}
        lines={lines}
        structure={structure}
        billTo={billTo}
        logoUrl={logoUrl}
        orgName={access.organizationName}
        printId="portal-invoice-document"
      />
    </div>
  );
}
