import { describe, expect, it } from "vitest";
import {
  CLIENT_PROFILE_FIELDS,
  clientNameKey,
  isResolvableClientName,
} from "./types";

describe("isResolvableClientName", () => {
  it("accepts a real company name", () => {
    expect(isResolvableClientName("RBC Capital Markets")).toBe(true);
  });

  /**
   * `projects/new/actions.ts` inserts the mandate with "Analyzing…" and lets
   * the role-analysis agent fill the real name in afterwards. Treating that
   * as a company would attach every half-analysed mandate in the org to one
   * client literally called "Analyzing…" — which is exactly what the first
   * draft of migration 049's backfill would have done.
   */
  it("refuses the analysis placeholder in both spellings", () => {
    expect(isResolvableClientName("Analyzing…")).toBe(false);
    expect(isResolvableClientName("Analyzing...")).toBe(false);
    expect(isResolvableClientName("  analyzing…  ")).toBe(false);
    expect(isResolvableClientName("ANALYZING...")).toBe(false);
  });

  it("refuses blanks and nullish values", () => {
    for (const value of ["", "   ", "\t", null, undefined]) {
      expect(isResolvableClientName(value)).toBe(false);
    }
  });

  // A company genuinely named this would be unfortunate, but the guard is on
  // the exact placeholder, not on the substring.
  it("does not refuse a name that merely contains the word", () => {
    expect(isResolvableClientName("Analyzing Systems Ltd")).toBe(true);
  });
});

describe("clientNameKey", () => {
  // Must agree with the `name_key` generated column in 049, which is what
  // the unique index dedupes on. If these two ever disagree, the app thinks
  // a client is new and Postgres disagrees.
  it("matches lower(btrim(name))", () => {
    expect(clientNameKey("  RBC Capital Markets ")).toBe("rbc capital markets");
    expect(clientNameKey("ACME")).toBe("acme");
  });

  it("treats case and surrounding space as the same client", () => {
    expect(clientNameKey("Acme Corp")).toBe(clientNameKey("  acme corp  "));
  });

  // Deliberately NOT normalised: "Acme Ltd" and "Acme Limited" are different
  // keys, and merging them is a human decision the product does not make.
  it("does not attempt to normalise legal suffixes", () => {
    expect(clientNameKey("Acme Ltd")).not.toBe(clientNameKey("Acme Limited"));
  });
});

describe("CLIENT_PROFILE_FIELDS", () => {
  it("covers the eight intake fields lifted from executive_searches", () => {
    expect(CLIENT_PROFILE_FIELDS.map((f) => f.key)).toEqual([
      "industry",
      "business_model",
      "revenue_range",
      "employee_count",
      "funding_stage",
      "ownership_structure",
      "geographic_footprint",
      "regulatory_environment",
    ]);
  });

  it("labels every field", () => {
    for (const f of CLIENT_PROFILE_FIELDS) {
      expect(f.label.trim()).not.toBe("");
    }
  });
});
