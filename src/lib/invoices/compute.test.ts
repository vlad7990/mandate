import { describe, expect, it } from "vitest";
import { MAILTO_URL_CEILING, buildMailtoUrl } from "@/lib/mail-draft";
import type { FeeLineRow } from "@/lib/fees/types";
import { billableFeeLines, invoiceMailDraft, invoiceTotal } from "./compute";

function feeLine(overrides: Partial<FeeLineRow>): FeeLineRow {
  return {
    id: "line-1",
    organization_id: "org-1",
    placement_id: "placement-1",
    placement_fee_id: "fee-1",
    kind: "instalment",
    label: "Completion",
    sequence: 1,
    trigger: "start_date",
    amount: 30_000,
    currency: "USD",
    base_currency: "USD",
    fx_rate: 1,
    base_amount: 30_000,
    status: "earned",
    earned_on: "2026-08-01",
    due_on: null,
    reason: null,
    reverses_line_id: null,
    created_by: null,
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-01T00:00:00Z",
    ...overrides,
  };
}

describe("invoiceTotal", () => {
  it("sums to the cent, the float way Postgres would not", () => {
    expect(invoiceTotal([{ amount: 0.1 }, { amount: 0.2 }])).toBe(0.3);
    expect(invoiceTotal([])).toBe(0);
    expect(invoiceTotal([{ amount: 30_000 }, { amount: -1_500.5 }])).toBe(28_499.5);
  });
});

describe("billableFeeLines", () => {
  const earned = feeLine({ id: "fl-earned" });
  const pending = feeLine({ id: "fl-pending", status: "pending", earned_on: null });
  const billed = feeLine({ id: "fl-billed" });
  const released = feeLine({ id: "fl-released" });

  const invoicesById = new Map([
    ["inv-live", { status: "issued" as const }],
    ["inv-draft", { status: "draft" as const }],
    ["inv-void", { status: "void" as const }],
  ]);

  it("offers earned lines only, and treats draft and issued as live", () => {
    const { available, billedFeeLineIds } = billableFeeLines(
      [earned, pending, billed, released],
      [
        { fee_line_id: "fl-billed", invoice_id: "inv-live" },
        { fee_line_id: "fl-released", invoice_id: "inv-void" },
        { fee_line_id: null, invoice_id: "inv-draft" },
      ],
      invoicesById
    );
    // Pending is not billable, the live-invoiced line is marked, and
    // the void invoice released its line (gate B.1).
    expect(available.map((l) => l.id)).toEqual(["fl-earned", "fl-released"]);
    expect(billedFeeLineIds).toEqual(new Set(["fl-billed"]));
  });

  it("marks a line on a draft as billed too — one draft at a time", () => {
    const { billedFeeLineIds } = billableFeeLines(
      [billed],
      [{ fee_line_id: "fl-billed", invoice_id: "inv-draft" }],
      invoicesById
    );
    expect(billedFeeLineIds.has("fl-billed")).toBe(true);
  });
});

describe("invoiceMailDraft", () => {
  const input = {
    invoiceNumber: "INV-2026-0001",
    billingName: "Mandate Search Ltd",
    clientName: "Larkspur Health",
    totalLabel: "US$64,000",
    issueDate: "2026-08-26",
    dueDate: "2026-09-25",
    paymentInstructions: "Sort 00-00-00, account 12345678. Reference the invoice number.",
  };

  it("names the document, the money, and the dates", () => {
    const draft = invoiceMailDraft(input);
    expect(draft.subject).toBe("Invoice INV-2026-0001 from Mandate Search Ltd");
    expect(draft.body).toContain("Dear Larkspur Health,");
    expect(draft.body).toContain("INV-2026-0001");
    expect(draft.body).toContain("US$64,000");
    expect(draft.body).toContain("due 2026-09-25");
    expect(draft.body).toContain("Sort 00-00-00");
  });

  it("omits the payment block when the template has none", () => {
    const draft = invoiceMailDraft({ ...input, paymentInstructions: "" });
    expect(draft.body).not.toContain("\n\n\n");
    expect(draft.body).toContain("Kind regards,");
  });

  it("stays under the mailto ceiling, so the body is never clipped", () => {
    // The body is a pointer by design — even with generous payment
    // instructions it must open as-is rather than via the clipboard.
    const url = buildMailtoUrl({ subject: invoiceMailDraft(input).subject, body: invoiceMailDraft(input).body });
    expect(url.length).toBeLessThan(MAILTO_URL_CEILING);
  });
});
