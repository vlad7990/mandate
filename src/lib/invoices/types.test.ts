import { describe, expect, it } from "vitest";
import {
  DEFAULT_NUMBERING_PREFIX,
  DEFAULT_PAYMENT_TERMS_DAYS,
  formatInvoiceNumber,
  parseBillTo,
  parseInvoiceStatus,
  parseTemplateStructure,
  validateLogoFile,
  MAX_LOGO_BYTES,
} from "./types";

describe("parseInvoiceStatus", () => {
  it("admits the three statuses and nothing else", () => {
    expect(parseInvoiceStatus("draft")).toBe("draft");
    expect(parseInvoiceStatus(" ISSUED ")).toBe("issued");
    expect(parseInvoiceStatus("void")).toBe("void");
    expect(parseInvoiceStatus("paid")).toBeNull();
    expect(parseInvoiceStatus(null)).toBeNull();
  });
});

describe("parseTemplateStructure", () => {
  it("reads a full structure through", () => {
    const structure = parseTemplateStructure({
      billing_name: "Mandate Search Ltd",
      address_lines: ["1 Terminal Way", " London EC2 ", ""],
      company_number: "12345678",
      vat_number: "GB 123 4567 89",
      payment_instructions: "Sort 00-00-00, account 12345678",
      header_text: "Executive search",
      footer_text: "Thank you",
      numbering_prefix: "MND-2026-",
      default_payment_terms_days: 14,
    });
    expect(structure.billing_name).toBe("Mandate Search Ltd");
    // Blank address lines are dropped, kept ones trimmed.
    expect(structure.address_lines).toEqual(["1 Terminal Way", "London EC2"]);
    expect(structure.numbering_prefix).toBe("MND-2026-");
    expect(structure.default_payment_terms_days).toBe(14);
  });

  it("loses the field, never the screen, on anything malformed", () => {
    for (const junk of [null, undefined, "a string", 7, ["array"]]) {
      const structure = parseTemplateStructure(junk);
      expect(structure.billing_name).toBe("");
      expect(structure.address_lines).toEqual([]);
      expect(structure.numbering_prefix).toBe(DEFAULT_NUMBERING_PREFIX);
      expect(structure.default_payment_terms_days).toBe(DEFAULT_PAYMENT_TERMS_DAYS);
    }
    // A structure with a corrupt corner keeps its healthy fields.
    const partial = parseTemplateStructure({
      billing_name: "Mandate",
      address_lines: "not-an-array",
      default_payment_terms_days: -3,
    });
    expect(partial.billing_name).toBe("Mandate");
    expect(partial.address_lines).toEqual([]);
    expect(partial.default_payment_terms_days).toBe(DEFAULT_PAYMENT_TERMS_DAYS);
  });
});

describe("formatInvoiceNumber", () => {
  /**
   * Must agree with issue_invoice's `prefix || lpad(n, 4, '0')` — the
   * studio previews the next number with this, and a preview that
   * disagrees with what issue mints is a lie on an admin screen.
   */
  it("mirrors the SQL minting format", () => {
    expect(formatInvoiceNumber("INV-2026-", 1)).toBe("INV-2026-0001");
    expect(formatInvoiceNumber("INV-", 42)).toBe("INV-0042");
    // Five digits outgrow the pad rather than truncating.
    expect(formatInvoiceNumber("INV-", 10001)).toBe("INV-10001");
    // A blank prefix falls to the default, as the SQL coalesce does.
    expect(formatInvoiceNumber("", 7)).toBe("INV-0007");
  });
});

describe("parseBillTo", () => {
  it("reads name and address, defaulting to empty", () => {
    expect(parseBillTo({ name: " Larkspur Health ", address_lines: ["1 Bio Way"] })).toEqual({
      name: "Larkspur Health",
      address_lines: ["1 Bio Way"],
    });
    expect(parseBillTo(null)).toEqual({ name: "", address_lines: [] });
    expect(parseBillTo({ address_lines: [1, "x"] })).toEqual({
      name: "",
      address_lines: ["x"],
    });
  });
});

describe("validateLogoFile", () => {
  it("mirrors the invoice-assets bucket's limits", () => {
    expect(validateLogoFile({ type: "image/png", size: 1000 })).toEqual({
      ok: true,
      extension: "png",
    });
    expect(validateLogoFile({ type: "image/svg+xml", size: 1000 }).ok).toBe(false);
    expect(validateLogoFile({ type: "image/png", size: 0 }).ok).toBe(false);
    expect(validateLogoFile({ type: "image/png", size: MAX_LOGO_BYTES + 1 }).ok).toBe(false);
    expect(validateLogoFile({ type: "image/webp", size: MAX_LOGO_BYTES })).toEqual({
      ok: true,
      extension: "webp",
    });
  });
});
