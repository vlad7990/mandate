/**
 * The invoice module's pure half — everything the builder and the
 * document derive without touching the database, so it can all be
 * proven in a node test.
 *
 * Nothing here computes new money: `invoiceTotal` sums lines that were
 * snapshotted from the fee ledger, and mixing currencies is refused
 * rather than converted (gate §C — FX bookkeeping stays in the fee
 * tables, an invoice bills in the fee line's own currency).
 */

import { roundMoney } from "@/lib/fees/compute";
import type { FeeLineRow } from "@/lib/fees/types";
import type { InvoiceLineRow, InvoiceRow } from "./types";

/** Sum of a draft's lines — must agree with the DB trigger's SUM. */
export function invoiceTotal(lines: readonly Pick<InvoiceLineRow, "amount">[]): number {
  return roundMoney(lines.reduce((sum, l) => sum + l.amount, 0));
}

/**
 * Which fee lines the builder may offer for a client: EARNED and not
 * already on a live invoice. "Live" means draft or issued — void
 * releases its lines (gate B.1: a visibility rule in this query, not
 * a schema constraint).
 */
export function billableFeeLines(
  feeLines: readonly FeeLineRow[],
  existingLines: readonly Pick<InvoiceLineRow, "fee_line_id" | "invoice_id">[],
  invoicesById: ReadonlyMap<string, Pick<InvoiceRow, "status">>
): { available: FeeLineRow[]; billedFeeLineIds: Set<string> } {
  const billedFeeLineIds = new Set<string>();
  for (const line of existingLines) {
    if (!line.fee_line_id) continue;
    const parent = invoicesById.get(line.invoice_id);
    if (parent && parent.status !== "void") billedFeeLineIds.add(line.fee_line_id);
  }
  const available = feeLines.filter(
    (l) => l.status === "earned" && !billedFeeLineIds.has(l.id)
  );
  return { available, billedFeeLineIds };
}

/**
 * The mail-draft body for an issued invoice. A pointer, honestly: the
 * mailto channel cannot carry an attachment (mail-draft.ts's own
 * ceiling), so the body says what the invoice is and that the PDF
 * travels beside it — printed from the same page, the one renderer.
 */
export function invoiceMailDraft(input: {
  invoiceNumber: string;
  billingName: string;
  clientName: string;
  totalLabel: string;
  issueDate: string;
  dueDate: string;
  paymentInstructions: string;
}): { subject: string; body: string } {
  const subject = `Invoice ${input.invoiceNumber} from ${input.billingName}`;
  const lines = [
    `Dear ${input.clientName},`,
    "",
    `Please find attached invoice ${input.invoiceNumber} for ${input.totalLabel}, issued ${input.issueDate} and due ${input.dueDate}.`,
  ];
  if (input.paymentInstructions) {
    lines.push("", input.paymentInstructions);
  }
  lines.push("", "Kind regards,", input.billingName);
  return { subject, body: lines.join("\n") };
}
