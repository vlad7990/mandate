/**
 * The invoice email — rendered from the SAME frozen row the document
 * renders from (126, gate D.3).
 *
 * ## Why this is not "a second renderer"
 *
 * §133's rule exists to stop an exported copy disagreeing with the
 * screen: the danger is two LAYOUT engines drifting apart, one of them
 * server-side and untested against the other. That is why the invoice
 * has no server-side PDF and this slice does not add one.
 *
 * This is a different thing. Every value below is read from the invoice
 * row's own snapshots — `invoice_number`, `issue_date`, `due_date`,
 * `bill_to`, `from_snapshot`, its lines, its stored total — all of which
 * were frozen at issue and cannot change afterwards (123's one-way
 * door). The email is a second MEDIUM for the same immutable facts, and
 * it cannot state a number the document does not, because there is no
 * arithmetic here at all: `formatMoney` over stored amounts, nothing
 * computed, nothing summed.
 *
 * The recruiter still has print for a PDF to attach by hand, which is
 * why the body says the document is available on request rather than
 * pretending something is attached.
 *
 * Pure and client-safe: no `server-only`, so the composer can preview
 * exactly what will be sent.
 */

import { formatMoney } from "@/lib/fees/compute";
import { escapeHtml } from "@/lib/email/escape";
import type { InvoiceLineRow, InvoiceRow, TemplateStructure, BillTo } from "./types";

export type InvoiceEmailInput = {
  invoice: Pick<
    InvoiceRow,
    "invoice_number" | "issue_date" | "due_date" | "currency" | "total_amount" | "notes"
  >;
  lines: ReadonlyArray<Pick<InvoiceLineRow, "id" | "label" | "amount" | "currency">>;
  from: TemplateStructure;
  billTo: BillTo;
  /** Falls back to the org name when the template has no billing name. */
  orgName: string;
};

export function invoiceEmailSubject(input: InvoiceEmailInput): string {
  const who = input.from.billing_name || input.orgName;
  return `Invoice ${input.invoice.invoice_number ?? ""} from ${who}`.replace(/\s+/g, " ").trim();
}

/** The plain-text alternative. Always sent — some clients show only this. */
export function invoiceEmailText(input: InvoiceEmailInput): string {
  const { invoice, lines, from, billTo, orgName } = input;
  const who = from.billing_name || orgName;
  const out: string[] = [];

  out.push(`Dear ${billTo.name || "Sir or Madam"},`, "");
  out.push(
    `Please find the details of invoice ${invoice.invoice_number} below, issued ${invoice.issue_date} and due ${invoice.due_date}.`,
    ""
  );

  out.push(`INVOICE ${invoice.invoice_number}`);
  out.push(`From:    ${who}`);
  out.push(`Bill to: ${billTo.name}`);
  out.push(`Issued:  ${invoice.issue_date}`);
  out.push(`Due:     ${invoice.due_date}`);
  out.push("");

  for (const line of lines) {
    out.push(`  ${line.label} — ${formatMoney(line.amount, line.currency)}`);
  }
  out.push("");
  out.push(`TOTAL DUE: ${formatMoney(invoice.total_amount, invoice.currency)}`);

  if (invoice.notes) out.push("", invoice.notes);
  if (from.payment_instructions) out.push("", "PAYMENT", from.payment_instructions);

  out.push("", "A PDF copy is available on request.", "", "Kind regards,", who);
  if (from.footer_text) out.push("", from.footer_text);

  return out.join("\n");
}

/**
 * The HTML body. Table-based and inline-styled on purpose — email
 * clients are not browsers, and the terminal palette does not survive
 * them, so this is the one place in the product that renders as plain
 * ink on white by default rather than by a print rule.
 */
export function invoiceEmailHtml(input: InvoiceEmailInput): string {
  const { invoice, lines, from, billTo, orgName } = input;
  const who = escapeHtml(from.billing_name || orgName);
  const e = escapeHtml;

  const addressBlock = from.address_lines
    .map((l) => `<div>${e(l)}</div>`)
    .join("");
  const billToBlock = billTo.address_lines.map((l) => `<div>${e(l)}</div>`).join("");

  const idLine = [
    from.company_number ? `Company ${e(from.company_number)}` : null,
    from.vat_number ? `VAT ${e(from.vat_number)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const lineRows = lines
    .map(
      (line) => `
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid #e4e4e7;">${e(line.label)}</td>
          <td style="padding:8px 0;border-bottom:1px solid #e4e4e7;text-align:right;white-space:nowrap;">
            ${e(formatMoney(line.amount, line.currency))}
          </td>
        </tr>`
    )
    .join("");

  return `
<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#14161c;max-width:640px;">
  <p style="margin:0 0 1em 0;">Dear ${e(billTo.name || "Sir or Madam")},</p>
  <p style="margin:0 0 1.5em 0;line-height:1.5;">
    Please find the details of invoice <strong>${e(invoice.invoice_number ?? "")}</strong>
    below, issued ${e(invoice.issue_date ?? "")} and due ${e(invoice.due_date ?? "")}.
  </p>

  <table style="width:100%;border-collapse:collapse;border:1px solid #c6c9d2;">
    <tr>
      <td style="padding:16px;vertical-align:top;">
        <div style="font-size:18px;font-weight:600;">${who}</div>
        <div style="color:#5b5f6d;font-size:13px;line-height:1.5;">${addressBlock}</div>
        ${idLine ? `<div style="color:#5b5f6d;font-size:12px;margin-top:4px;">${idLine}</div>` : ""}
      </td>
      <td style="padding:16px;vertical-align:top;text-align:right;">
        <div style="letter-spacing:2px;font-size:16px;">INVOICE</div>
        <div style="font-size:13px;color:#5b5f6d;">${e(invoice.invoice_number ?? "")}</div>
      </td>
    </tr>
    <tr>
      <td style="padding:0 16px 16px 16px;vertical-align:top;">
        <div style="font-size:11px;letter-spacing:1px;color:#5b5f6d;">BILL TO</div>
        <div>${e(billTo.name)}</div>
        <div style="color:#5b5f6d;font-size:13px;line-height:1.5;">${billToBlock}</div>
      </td>
      <td style="padding:0 16px 16px 16px;text-align:right;font-size:13px;color:#5b5f6d;">
        <div>Issued ${e(invoice.issue_date ?? "")}</div>
        <div>Due ${e(invoice.due_date ?? "")}</div>
        <div>${e(invoice.currency)}</div>
      </td>
    </tr>
    <tr>
      <td colspan="2" style="padding:0 16px 16px 16px;">
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          <tr>
            <th style="text-align:left;font-size:11px;letter-spacing:1px;color:#5b5f6d;font-weight:normal;padding-bottom:6px;">DESCRIPTION</th>
            <th style="text-align:right;font-size:11px;letter-spacing:1px;color:#5b5f6d;font-weight:normal;padding-bottom:6px;">AMOUNT</th>
          </tr>
          ${lineRows}
          <tr>
            <td style="padding:12px 0 0 0;font-size:11px;letter-spacing:1px;">TOTAL DUE</td>
            <td style="padding:12px 0 0 0;text-align:right;font-size:18px;font-weight:600;">
              ${e(formatMoney(invoice.total_amount, invoice.currency))}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>

  ${invoice.notes ? `<p style="margin:1.5em 0 0 0;line-height:1.5;">${e(invoice.notes)}</p>` : ""}

  ${
    from.payment_instructions
      ? `<div style="margin-top:1.5em;padding:12px 16px;border:1px solid #c6c9d2;">
           <div style="font-size:11px;letter-spacing:1px;color:#5b5f6d;">PAYMENT</div>
           <div style="white-space:pre-line;line-height:1.5;">${e(from.payment_instructions)}</div>
         </div>`
      : ""
  }

  <p style="margin:1.5em 0 0 0;color:#5b5f6d;font-size:13px;">A PDF copy is available on request.</p>
  <p style="margin:1.5em 0 0 0;">Kind regards,<br/>${who}</p>
  ${from.footer_text ? `<p style="margin:1.5em 0 0 0;color:#5b5f6d;font-size:12px;">${e(from.footer_text)}</p>` : ""}
</div>`.trim();
}
