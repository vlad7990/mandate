import { notFound } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { isSampleId } from "@/lib/sample";
import { SampleNotBuilt } from "@/components/sample/sample-not-built";
import { SetBreadcrumbs } from "@/components/dashboard/breadcrumbs";
import { PageShell, TerminalTitle } from "@/components/ui/page-shell";
import { FEE_LINE_COLUMNS, type FeeLineRow } from "@/lib/fees/types";
import { billableFeeLines } from "@/lib/invoices/compute";
import {
  INVOICE_COLUMNS,
  INVOICE_LINE_COLUMNS,
  INVOICE_STATUS_LABELS,
  parseBillTo,
  parseTemplateStructure,
  type InvoiceLineRow,
  type InvoiceRow,
} from "@/lib/invoices/types";
import { InvoiceDocument } from "./invoice-document";
import {
  BuilderPanel,
  type AvailableFeeLine,
  type PanelInvoice,
} from "./builder-panel";

export const metadata = { title: "Invoice" };

type Params = Promise<{ invoiceId: string }>;

type InvoiceDetailRow = InvoiceRow & { clients: { name: string } | null };

type PlacementLite = {
  id: string;
  candidates: { full_name: string } | null;
  projects: { title: string } | null;
};

/**
 * One route, one renderer (§133): the document column IS the invoice —
 * draft, issued, or void — and printing changes the paper, nothing
 * else. The builder lives in the sidebar and is `print:hidden`; for a
 * draft it selects earned fee lines onto the document, and after issue
 * it shrinks to print / mail / void.
 */
export default async function InvoicePage({ params }: { params: Params }) {
  const { invoiceId } = await params;

  // Sample ids never touch the database. The list's sample rows are not
  // links, but a typed URL still arrives (the routes.test.ts rule).
  if (isSampleId(invoiceId)) {
    return (
      <SampleNotBuilt
        title="Invoice"
        context="Placements // Invoices"
        backHref="/app/placements/invoices"
        backLabel="Invoices"
        scope="invoices"
      />
    );
  }

  const supabase = await createServerSupabaseClient();

  const { data: invoice } = await supabase
    .from("invoices")
    .select(`${INVOICE_COLUMNS}, clients(name)`)
    .eq("id", invoiceId)
    .maybeSingle<InvoiceDetailRow>();

  if (!invoice) notFound();

  const [{ data: lineRows }, { data: orgRow }] = await Promise.all([
    supabase
      .from("invoice_lines")
      .select(INVOICE_LINE_COLUMNS)
      .eq("invoice_id", invoiceId)
      .order("sequence", { ascending: true })
      .returns<InvoiceLineRow[]>(),
    supabase
      .from("organizations")
      .select("name")
      .eq("id", invoice.organization_id)
      .maybeSingle<{ name: string }>(),
  ]);

  const lines = lineRows ?? [];
  const isDraft = invoice.status === "draft";

  // A draft renders the LIVE template — edits show until issue. An
  // issued or void document renders its own from_snapshot and nothing
  // else: the snapshot is the document.
  let structureSource: unknown = invoice.from_snapshot;
  let logoPath: string | null = null;
  if (isDraft) {
    if (invoice.template_id) {
      const { data: template } = await supabase
        .from("invoice_templates")
        .select("structure, logo_path")
        .eq("id", invoice.template_id)
        .maybeSingle<{ structure: unknown; logo_path: string | null }>();
      structureSource = template?.structure ?? {};
      logoPath = template?.logo_path ?? null;
    } else {
      structureSource = {};
    }
  } else {
    const snapshot = invoice.from_snapshot as Record<string, unknown> | null;
    logoPath = typeof snapshot?.logo_path === "string" ? snapshot.logo_path : null;
  }
  const structure = parseTemplateStructure(structureSource);

  let logoUrl: string | null = null;
  if (logoPath) {
    const { data: signed } = await supabase.storage
      .from("invoice-assets")
      .createSignedUrl(logoPath, 3600);
    logoUrl = signed?.signedUrl ?? null;
  }

  // The builder's offer: the client's EARNED fee lines, with the ones
  // already on a live invoice marked billed (void releases them —
  // gate B.1, a query rule, not a schema constraint).
  let available: AvailableFeeLine[] = [];
  if (isDraft && invoice.client_id) {
    const { data: placementRows } = await supabase
      .from("placements")
      .select("id, candidates(full_name), projects(title)")
      .eq("client_id", invoice.client_id)
      .returns<PlacementLite[]>();
    const placements = placementRows ?? [];

    if (placements.length > 0) {
      const [{ data: feeLineRows }, { data: allInvoiceLines }, { data: allInvoices }] =
        await Promise.all([
          supabase
            .from("placement_fee_lines")
            .select(FEE_LINE_COLUMNS)
            .in("placement_id", placements.map((p) => p.id))
            .eq("status", "earned")
            .order("earned_on", { ascending: true })
            .returns<FeeLineRow[]>(),
          supabase
            .from("invoice_lines")
            .select("fee_line_id, invoice_id")
            .not("fee_line_id", "is", null)
            .returns<{ fee_line_id: string; invoice_id: string }[]>(),
          supabase
            .from("invoices")
            .select("id, status")
            .returns<{ id: string; status: InvoiceRow["status"] }[]>(),
        ]);

      const invoicesById = new Map(
        (allInvoices ?? []).map((i) => [i.id, { status: i.status }])
      );
      const { billedFeeLineIds } = billableFeeLines(
        feeLineRows ?? [],
        allInvoiceLines ?? [],
        invoicesById
      );
      const placementById = new Map(placements.map((p) => [p.id, p]));

      available = (feeLineRows ?? []).map((line) => {
        const placement = placementById.get(line.placement_id);
        return {
          id: line.id,
          label: line.label,
          amount: line.amount,
          currency: line.currency,
          candidate: placement?.candidates?.full_name ?? "Unknown",
          mandate: placement?.projects?.title ?? "—",
          billed: billedFeeLineIds.has(line.id),
        };
      });
    }
  }

  const billTo = parseBillTo(invoice.bill_to);
  const orgName = orgRow?.name ?? "";
  const clientName = invoice.clients?.name ?? "";

  const panelInvoice: PanelInvoice = {
    id: invoice.id,
    status: invoice.status,
    invoice_number: invoice.invoice_number,
    currency: invoice.currency,
    total_amount: invoice.total_amount,
    payment_terms_days: invoice.payment_terms_days,
    issue_date: invoice.issue_date,
    due_date: invoice.due_date,
    notes: invoice.notes ?? "",
    bill_to_name: billTo.name,
    bill_to_address: billTo.address_lines.join("\n"),
  };

  return (
    <PageShell className="space-y-5">
      <SetBreadcrumbs
        crumbs={[
          { label: "Placements", href: "/app/placements" },
          { label: "Invoices", href: "/app/placements/invoices" },
          { label: invoice.invoice_number ?? "Draft" },
        ]}
      />

      <div className="print:hidden">
        <TerminalTitle>
          {invoice.invoice_number ? `INVOICE_${invoice.invoice_number}` : "INVOICE_DRAFT"}
        </TerminalTitle>
        <p className="mt-2 font-mono-label text-mono-label uppercase tracking-widest text-on-surface-variant">
          {INVOICE_STATUS_LABELS[invoice.status]}
          {clientName ? ` · ${clientName}` : ""}
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px] print:block">
        <InvoiceDocument
          invoice={invoice}
          lines={lines}
          structure={structure}
          billTo={billTo}
          logoUrl={logoUrl}
          orgName={orgName}
        />

        <aside className="print:hidden xl:sticky xl:top-6 xl:self-start">
          <BuilderPanel
            invoice={panelInvoice}
            lines={lines.map((l) => ({
              id: l.id,
              label: l.label,
              amount: l.amount,
              currency: l.currency,
            }))}
            available={available}
            billingName={structure.billing_name || orgName}
            paymentInstructions={structure.payment_instructions}
            clientName={clientName}
          />
        </aside>
      </div>
    </PageShell>
  );
}
