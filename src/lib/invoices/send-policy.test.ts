import { describe, expect, it } from "vitest";
import {
  evaluateInvoiceSendPolicy,
  type InvoiceSendPolicyInput,
} from "./send-policy";

const OK: InvoiceSendPolicyInput = {
  status: "issued",
  fromEmail: "billing@mandatesearch.test",
  toAddress: "accounts@client.test",
  suppressed: null,
};

describe("evaluateInvoiceSendPolicy", () => {
  it("lets an issued invoice with both addresses through", () => {
    expect(evaluateInvoiceSendPolicy(OK)).toEqual({ ok: true });
  });

  /** The document's own state comes first — the rest is moot without it. */
  it("refuses anything that is not an issued invoice", () => {
    const draft = evaluateInvoiceSendPolicy({ ...OK, status: "draft" });
    expect(draft.ok).toBe(false);
    if (!draft.ok) {
      expect(draft.code).toBe("not_issued");
      expect(draft.message).toContain("issue it first");
    }

    const voided = evaluateInvoiceSendPolicy({ ...OK, status: "void" });
    expect(voided.ok).toBe(false);
    if (!voided.ok) expect(voided.code).toBe("already_void");
  });

  /**
   * D.1: the identity lives on the template. Without it the product
   * would fall back to `RESEND_FROM` — the PRODUCT's address — and put
   * Mandate's name on the agency's invoice.
   */
  it("refuses when the template carries no billing address", () => {
    for (const from of [null, "", "   "]) {
      const verdict = evaluateInvoiceSendPolicy({ ...OK, fromEmail: from });
      expect(verdict.ok).toBe(false);
      if (!verdict.ok) {
        expect(verdict.code).toBe("no_from_identity");
        expect(verdict.message).toContain("Invoice templates");
      }
    }
  });

  it("refuses a missing or malformed recipient", () => {
    const missing = evaluateInvoiceSendPolicy({ ...OK, toAddress: "  " });
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.code).toBe("no_recipient");

    for (const bad of ["nobody", "@client.test", "accounts@", "a b@c.test", "a@b@c"]) {
      const verdict = evaluateInvoiceSendPolicy({ ...OK, toAddress: bad });
      expect(verdict.ok, bad).toBe(false);
      if (!verdict.ok) expect(verdict.code).toBe("invalid_recipient");
    }
  });

  /**
   * Deliberately permissive beyond one `@`: plus-tags, long TLDs and
   * unicode domains are real addresses, and the provider is the real
   * arbiter.
   */
  it("accepts the address shapes over-strict validators reject", () => {
    for (const good of [
      "accounts+invoices@client.test",
      "a@b.technology",
      "facturación@empresa.test",
      "A.Person@Sub.Domain.Test",
    ]) {
      expect(evaluateInvoiceSendPolicy({ ...OK, toAddress: good }).ok, good).toBe(true);
    }
  });

  /**
   * D.2: the candidate CAPS do not cross over — a client owed three
   * invoices should get three — but suppression does, because the harm
   * is to the sending domain, not the recipient.
   */
  it("refuses a suppressed address and names the reason", () => {
    const verdict = evaluateInvoiceSendPolicy({
      ...OK,
      suppressed: { reason: "bounce" },
    });
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) {
      expect(verdict.code).toBe("suppressed");
      expect(verdict.message).toContain("bounce");
      expect(verdict.message).toContain("accounts@client.test");
    }
  });

  it("has no cap of any kind — the ladder cannot refuse for volume", () => {
    // The whole ladder, exercised: no input describes a count, so no
    // branch can turn on one. This is the D.2 ruling as a test.
    const codes = new Set<string>();
    for (const status of ["draft", "issued", "void"] as const) {
      for (const from of [null, "billing@a.test"]) {
        for (const to of [null, "bad", "ok@b.test"]) {
          for (const sup of [null, { reason: "complaint" }]) {
            const v = evaluateInvoiceSendPolicy({
              status,
              fromEmail: from,
              toAddress: to,
              suppressed: sup,
            });
            if (!v.ok) codes.add(v.code);
          }
        }
      }
    }
    expect([...codes].sort()).toEqual([
      "already_void",
      "invalid_recipient",
      "no_from_identity",
      "no_recipient",
      "not_issued",
      "suppressed",
    ]);
  });
});
