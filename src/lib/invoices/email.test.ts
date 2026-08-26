import { describe, expect, it } from "vitest";
import {
  invoiceEmailHtml,
  invoiceEmailSubject,
  invoiceEmailText,
  type InvoiceEmailInput,
} from "./email";
import { parseTemplateStructure } from "./types";

const INPUT: InvoiceEmailInput = {
  invoice: {
    invoice_number: "INV-2026-0001",
    issue_date: "2026-08-26",
    due_date: "2026-09-25",
    currency: "USD",
    total_amount: 45000,
    notes: "Thank you for the introduction.",
  },
  lines: [
    { id: "l1", label: "Engagement — Yusuf Demirci", amount: 15000, currency: "USD" },
    { id: "l2", label: "Completion — Yusuf Demirci", amount: 30000, currency: "USD" },
  ],
  from: parseTemplateStructure({
    billing_name: "Mandate Search Partners Ltd",
    address_lines: ["1 Terminal Way", "London EC2A 4BX"],
    company_number: "14523901",
    vat_number: "GB 452 3901 88",
    payment_instructions: "Barclays — Sort 20-00-00, Account 55667788.",
    from_email: "billing@mandatesearch.test",
    footer_text: "Registered in England and Wales",
  }),
  billTo: { name: "RBC Capital Markets", address_lines: ["200 Bay Street", "Toronto"] },
  orgName: "Mandate HQ",
};

describe("the invoice email", () => {
  it("names the document and the biller in the subject", () => {
    expect(invoiceEmailSubject(INPUT)).toBe(
      "Invoice INV-2026-0001 from Mandate Search Partners Ltd"
    );
  });

  it("falls back to the org name when the template has no billing name", () => {
    const bare = { ...INPUT, from: parseTemplateStructure({}) };
    expect(invoiceEmailSubject(bare)).toBe("Invoice INV-2026-0001 from Mandate HQ");
  });

  /**
   * The point of gate D.3: the email is a second MEDIUM for the frozen
   * row, never a second source of truth. Nothing here is computed, so
   * it cannot state a figure the document does not.
   */
  it("carries every stored figure and invents none", () => {
    for (const render of [invoiceEmailText(INPUT), invoiceEmailHtml(INPUT)]) {
      expect(render).toContain("INV-2026-0001");
      expect(render).toContain("2026-08-26");
      expect(render).toContain("2026-09-25");
      expect(render).toContain("RBC Capital Markets");
      expect(render).toContain("Mandate Search Partners Ltd");
      expect(render).toContain("Engagement — Yusuf Demirci");
      expect(render).toContain("US$15,000");
      expect(render).toContain("US$30,000");
      // The TOTAL is the invoice's stored total, not a sum of the lines.
      expect(render).toContain("US$45,000");
      expect(render).toContain("Barclays");
    }
  });

  it("prints the stored total even when it disagrees with the lines", () => {
    // A contrived row: the document shows what was frozen at issue, and
    // so does the email. If this ever started summing the lines instead,
    // the two could diverge — which is the whole thing D.3 forbids.
    const odd = { ...INPUT, invoice: { ...INPUT.invoice, total_amount: 1 } };
    expect(invoiceEmailText(odd)).toContain("TOTAL DUE: US$1");
    expect(invoiceEmailText(odd)).not.toContain("US$45,000");
  });

  it("escapes anything a client typed into the document", () => {
    const hostile = {
      ...INPUT,
      billTo: {
        name: '<script>alert("x")</script>',
        address_lines: ['" onload="evil()'],
      },
    };
    const html = invoiceEmailHtml(hostile);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&quot;");
  });

  it("omits the optional blocks rather than printing empty furniture", () => {
    const bare: InvoiceEmailInput = {
      ...INPUT,
      invoice: { ...INPUT.invoice, notes: null },
      from: parseTemplateStructure({ billing_name: "Solo Ltd", from_email: "a@b.test" }),
    };
    const html = invoiceEmailHtml(bare);
    expect(html).not.toContain("PAYMENT");
    expect(html).not.toContain("Thank you for the introduction");
    const text = invoiceEmailText(bare);
    expect(text).not.toContain("PAYMENT");
  });

  it("always produces a plain-text alternative", () => {
    const text = invoiceEmailText(INPUT);
    expect(text).not.toContain("<");
    expect(text.split("\n").length).toBeGreaterThan(8);
  });
});
