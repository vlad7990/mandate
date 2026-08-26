import { formatMoney } from "@/lib/fees/compute";
import {
  INVOICE_STATUS_LABELS,
  type BillTo,
  type InvoiceRow,
  type InvoiceLineRow,
  type TemplateStructure,
} from "@/lib/invoices/types";

/**
 * The document — the §133 one-renderer pattern applied to money. This
 * column IS the A4 layout: `@media print` rebinds `.m-report-doc`'s
 * tokens to ink on paper and the browser's own print dialog produces
 * the PDF, so the exported copy cannot disagree with the screen.
 *
 * Server component on purpose. Everything it shows is a stored fact —
 * an issued invoice renders from its own snapshots and would look the
 * same rendered in ten years.
 */
export function InvoiceDocument({
  invoice,
  lines,
  structure,
  billTo,
  logoUrl,
  orgName,
}: {
  invoice: InvoiceRow;
  lines: InvoiceLineRow[];
  /** Live template structure for drafts; from_snapshot once issued. */
  structure: TemplateStructure;
  billTo: BillTo;
  logoUrl: string | null;
  orgName: string;
}) {
  const billingName = structure.billing_name || orgName;
  const isDraft = invoice.status === "draft";

  return (
    <article className="m-report-doc mx-auto w-full max-w-[780px] border border-outline-variant bg-surface-container-low px-8 py-10 sm:px-14 sm:py-12 print:rounded-none print:border-0 print:px-0 print:py-0">
      {/* Letterhead */}
      <header className="flex flex-wrap items-start justify-between gap-6">
        <div className="min-w-0 space-y-3">
          {logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- signed URL, short-lived
            <img
              src={logoUrl}
              alt={`${billingName} logo`}
              className="h-14 w-auto max-w-[240px] object-contain object-left"
            />
          )}
          <div>
            <p className="font-h2 text-h2 text-on-surface">{billingName}</p>
            {structure.address_lines.map((line) => (
              <p key={line} className="text-body-s leading-relaxed text-on-surface-variant">
                {line}
              </p>
            ))}
            {(structure.company_number || structure.vat_number) && (
              <p className="mt-1 font-mono-label text-[11px] uppercase tracking-[0.08em] text-on-surface-variant">
                {[
                  structure.company_number ? `Company ${structure.company_number}` : null,
                  structure.vat_number ? `VAT ${structure.vat_number}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            )}
          </div>
        </div>

        <div className="text-right">
          <p className="font-h1 text-[28px] uppercase leading-none tracking-[0.12em] text-on-surface">
            Invoice
          </p>
          <p className="mt-2 font-mono-label text-mono-label tabular-nums text-on-surface-variant">
            {invoice.invoice_number ?? "DRAFT — unnumbered until issued"}
          </p>
          {isDraft && (
            <p className="mt-1 font-mono-label text-[11px] uppercase tracking-[0.12em] text-tertiary">
              {INVOICE_STATUS_LABELS[invoice.status]} — not yet a document
            </p>
          )}
          {invoice.status === "void" && (
            <p className="mt-1 font-mono-label text-[11px] uppercase tracking-[0.12em] text-tertiary">
              VOID{invoice.voided_at ? ` — ${invoice.voided_at.slice(0, 10)}` : ""}
            </p>
          )}
        </div>
      </header>

      {structure.header_text && (
        <p className="mt-6 text-body-s leading-relaxed text-on-surface-variant">
          {structure.header_text}
        </p>
      )}

      {/* Parties and dates */}
      <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2">
        <div>
          <p className="font-mono-label text-[11px] uppercase tracking-[0.12em] text-outline">
            Bill to
          </p>
          <p className="mt-1.5 text-body-main text-on-surface">
            {billTo.name || "—"}
          </p>
          {billTo.address_lines.map((line) => (
            <p key={line} className="text-body-s leading-relaxed text-on-surface-variant">
              {line}
            </p>
          ))}
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 self-start sm:justify-self-end">
          <Dt>Issue date</Dt>
          <Dd>{invoice.issue_date ?? "on issue"}</Dd>
          <Dt>Due date</Dt>
          <Dd>
            {invoice.due_date ?? `${invoice.payment_terms_days} days from issue`}
          </Dd>
          <Dt>Currency</Dt>
          <Dd>{invoice.currency}</Dd>
        </dl>
      </div>

      {/* Lines */}
      <table className="mt-8 w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-outline-variant">
            <th className="py-2 pr-4 font-mono-label text-[11px] font-normal uppercase tracking-[0.08em] text-outline">
              Description
            </th>
            <th className="py-2 text-right font-mono-label text-[11px] font-normal uppercase tracking-[0.08em] text-outline">
              Amount
            </th>
          </tr>
        </thead>
        <tbody>
          {lines.length === 0 ? (
            <tr>
              <td
                colSpan={2}
                className="py-4 font-mono-label text-mono-label uppercase tracking-widest text-outline"
              >
                No lines yet — pull earned fee lines from the panel
              </td>
            </tr>
          ) : (
            lines.map((line) => (
              <tr
                key={line.id}
                className="m-report-keep border-b border-outline-variant/40 last:border-0"
              >
                <td className="py-2.5 pr-4 text-body-s leading-relaxed text-on-surface">
                  {line.label}
                </td>
                <td className="py-2.5 text-right font-mono-label text-mono-label tabular-nums text-on-surface">
                  {formatMoney(line.amount, line.currency)}
                </td>
              </tr>
            ))
          )}
        </tbody>
        <tfoot>
          <tr className="border-t border-outline-variant">
            <td className="py-3 pr-4 font-mono-label text-mono-label uppercase tracking-[0.12em] text-on-surface">
              Total due
            </td>
            <td className="py-3 text-right font-h1 text-[20px] tabular-nums text-on-surface">
              {formatMoney(invoice.total_amount, invoice.currency)}
            </td>
          </tr>
        </tfoot>
      </table>

      {invoice.notes && (
        <p className="mt-6 text-body-s leading-relaxed text-on-surface-variant">
          {invoice.notes}
        </p>
      )}

      {structure.payment_instructions && (
        <div className="m-report-keep mt-8 border border-outline-variant px-4 py-3">
          <p className="font-mono-label text-[11px] uppercase tracking-[0.12em] text-outline">
            Payment
          </p>
          <p className="mt-1.5 whitespace-pre-line text-body-s leading-relaxed text-on-surface">
            {structure.payment_instructions}
          </p>
        </div>
      )}

      {structure.footer_text && (
        <p className="mt-8 border-t border-outline-variant/60 pt-4 text-center font-mono-label text-[11px] uppercase tracking-[0.08em] text-on-surface-variant">
          {structure.footer_text}
        </p>
      )}
    </article>
  );
}

function Dt({ children }: { children: React.ReactNode }) {
  return (
    <dt className="font-mono-label text-[11px] uppercase tracking-[0.12em] text-outline">
      {children}
    </dt>
  );
}

function Dd({ children }: { children: React.ReactNode }) {
  return (
    <dd className="text-right font-mono-label text-mono-label tabular-nums text-on-surface-variant">
      {children}
    </dd>
  );
}
