import Link from "next/link";
import { cookies } from "next/headers";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { SetBreadcrumbs } from "@/components/dashboard/breadcrumbs";
import { ListPanel, PageShell, TerminalTitle } from "@/components/ui/page-shell";
import { StatusChip, type ChipTone } from "@/components/ui/status-chip";
import { SampleBanner } from "@/components/sample/sample-banner";
import { IconPlus } from "@/components/icons";
import { formatMoney } from "@/lib/fees/compute";
import {
  SAMPLE_DISMISSED_COOKIE,
  SAMPLE_INVOICES,
  shouldShowSample,
} from "@/lib/sample";
import {
  INVOICE_COLUMNS,
  INVOICE_STATUS_LABELS,
  type InvoiceRow,
  type InvoiceStatus,
} from "@/lib/invoices/types";

export const metadata = { title: "Invoices" };

/**
 * The invoice book — every document this org has drafted, issued or
 * voided. The route guard holds `fees:read` (the money trio); RLS
 * would return nothing to anyone else anyway.
 */

type InvoiceListRow = InvoiceRow & { clients: { name: string } | null };

const STATUS_CHIP: Record<InvoiceStatus, ChipTone> = {
  draft: "neutral",
  issued: "primary",
  void: "warn",
};

export default async function InvoicesPage() {
  const supabase = await createServerSupabaseClient();

  const [{ data: invoiceRows }, { count: templateCount }] = await Promise.all([
    supabase
      .from("invoices")
      .select(`${INVOICE_COLUMNS}, clients(name)`)
      .order("created_at", { ascending: false })
      .returns<InvoiceListRow[]>(),
    supabase
      .from("invoice_templates")
      .select("id", { count: "exact", head: true }),
  ]);

  const invoices = invoiceRows ?? [];
  const issued = invoices.filter((i) => i.status === "issued");
  const hasTemplates = (templateCount ?? 0) > 0;

  const dismissed = (await cookies()).get(SAMPLE_DISMISSED_COOKIE)?.value === "1";
  const showSample = shouldShowSample({
    hasRealData: invoices.length > 0,
    dismissed,
  });

  return (
    <PageShell className="space-y-5">
      <SetBreadcrumbs
        crumbs={[
          { label: "Placements", href: "/app/placements" },
          { label: "Invoices" },
        ]}
      />

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 space-y-2">
          <TerminalTitle>INVOICES</TerminalTitle>
          <p className="font-mono-label text-mono-label uppercase leading-[1.5] tracking-widest text-on-surface-variant tabular-nums">
            {showSample
              ? `${SAMPLE_INVOICES.length} example invoices // sample data`
              : `${invoices.length} document${invoices.length === 1 ? "" : "s"} · ${issued.length} issued`}
          </p>
        </div>
        <Link
          href="/app/placements/invoices/new"
          prefetch={false}
          className="flex items-center gap-2 btn-notch bg-primary-container px-3 py-1.5 font-mono-label text-mono-label uppercase tracking-widest text-on-primary-container transition-[filter,transform] hover:brightness-110 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <IconPlus size={14} />
          New invoice
        </Link>
      </header>

      {!hasTemplates && (
        <div className="border border-outline-variant bg-surface-container-low px-[18px] py-4">
          <p className="font-mono-label text-mono-label uppercase tracking-widest text-primary">
            No template yet
          </p>
          <p className="mt-2 max-w-[68ch] text-body-s leading-relaxed text-on-surface-variant">
            An invoice cannot issue without a template — it carries the billing
            identity and the number sequence. An admin creates one under{" "}
            <Link
              href="/app/settings/invoice-templates"
              prefetch={false}
              className="text-primary hover:underline"
            >
              Settings → Invoice templates
            </Link>
            .
          </p>
        </div>
      )}

      {showSample && <SampleBanner scope="invoices" />}

      {showSample ? (
        <SampleInvoiceTable />
      ) : invoices.length === 0 ? (
        <div className="border border-outline-variant bg-surface-container-low px-[18px] py-8">
          <p className="font-mono-label text-mono-label uppercase tracking-widest text-outline">
            No invoices yet
          </p>
          <p className="mt-2 max-w-[68ch] text-body-s leading-relaxed text-on-surface-variant">
            An invoice is built from a placement&apos;s earned fee lines: pick the
            client, pull the lines onto the draft, and issue. The number is
            minted at issue and the document freezes — what the client received
            never changes afterwards.
          </p>
        </div>
      ) : (
        <ListPanel>
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-left">
              <thead>
                <tr className="border-b border-outline-variant/60">
                  <Th>Number</Th>
                  <Th>Client</Th>
                  <Th>Status</Th>
                  <Th>Issued</Th>
                  <Th>Due</Th>
                  <Th align="right">Total</Th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => (
                  <tr
                    key={invoice.id}
                    className="border-b border-outline-variant/30 last:border-0"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/app/placements/invoices/${invoice.id}`}
                        prefetch={false}
                        className="font-mono-label text-mono-label text-on-surface tabular-nums hover:text-primary hover:underline"
                      >
                        {invoice.invoice_number ?? "— draft —"}
                      </Link>
                    </td>
                    <td className="max-w-0 truncate px-4 py-3 text-body-s text-on-surface-variant">
                      {invoice.clients?.name ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <StatusChip tone={STATUS_CHIP[invoice.status]} dot>
                        {INVOICE_STATUS_LABELS[invoice.status]}
                      </StatusChip>
                    </td>
                    <td className="px-4 py-3 font-mono-label text-[11px] tracking-[0.08em] text-outline tabular-nums">
                      {invoice.issue_date ?? "—"}
                    </td>
                    <td className="px-4 py-3 font-mono-label text-[11px] tracking-[0.08em] text-outline tabular-nums">
                      {invoice.due_date ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-mono-label text-mono-label text-on-surface tabular-nums">
                      {formatMoney(invoice.total_amount, invoice.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ListPanel>
      )}
    </PageShell>
  );
}

/** The sample rows, in the same columns as the real table. */
function SampleInvoiceTable() {
  return (
    <ListPanel>
      <div className="relative overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-left">
          <thead>
            <tr className="border-b border-outline-variant/60">
              <Th>Number</Th>
              <Th>Client</Th>
              <Th>Status</Th>
              <Th>Issued</Th>
              <Th>Due</Th>
              <Th align="right">Total</Th>
            </tr>
          </thead>
          <tbody>
            {SAMPLE_INVOICES.map((invoice) => (
              <tr
                key={invoice.id}
                className="border-b border-outline-variant/30 last:border-0"
              >
                <td className="px-4 py-3 font-mono-label text-mono-label text-on-surface tabular-nums">
                  {invoice.number ?? "— draft —"}
                </td>
                <td className="max-w-0 truncate px-4 py-3 text-body-s text-on-surface-variant">
                  {invoice.client}
                </td>
                <td className="px-4 py-3 font-mono-label text-[11px] uppercase tracking-[0.08em] text-on-surface-variant">
                  {invoice.status}
                </td>
                <td className="px-4 py-3 font-mono-label text-[11px] tracking-[0.08em] text-outline tabular-nums">
                  {invoice.issueDate ?? "—"}
                </td>
                <td className="px-4 py-3 font-mono-label text-[11px] tracking-[0.08em] text-outline tabular-nums">
                  {invoice.dueDate ?? "—"}
                </td>
                <td className="px-4 py-3 text-right font-mono-label text-mono-label text-on-surface tabular-nums">
                  {formatMoney(invoice.total, "USD")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ListPanel>
  );
}

function Th({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      className={`px-4 py-2.5 font-mono-label text-[11px] font-normal uppercase tracking-[0.08em] text-outline ${
        align === "right" ? "text-right" : "text-left"
      }`}
    >
      {children}
    </th>
  );
}
