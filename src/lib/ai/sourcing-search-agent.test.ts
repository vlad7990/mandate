import { describe, expect, test } from "vitest";
import {
  EMPTY_SOURCING_SEARCH,
  normalizeSourcingSearch,
} from "./sourcing-search-agent";

const ALLOWED = ["github.com", "crunchbase.com"];

function lead(overrides: Record<string, unknown> = {}) {
  return {
    full_name: "Dana Reed",
    current_title: "VP Engineering",
    current_company: "Northwind",
    location: "Berlin",
    rationale: "Led platform engineering through a scaling inflection.",
    evidence: [{ url: "https://github.com/dana", claim: "Maintains the core repo." }],
    confidence: "high",
    ...overrides,
  };
}

describe("normalizeSourcingSearch", () => {
  test("returns an empty result for non-object input", () => {
    expect(normalizeSourcingSearch(null)).toEqual(EMPTY_SOURCING_SEARCH);
    expect(normalizeSourcingSearch("nope")).toEqual(EMPTY_SOURCING_SEARCH);
    expect(normalizeSourcingSearch(undefined)).toEqual(EMPTY_SOURCING_SEARCH);
  });

  test("keeps a well-formed, cited lead", () => {
    const result = normalizeSourcingSearch(
      { summary: "Two leads.", leads: [lead()], coverage_notes: ["Thin in DACH."] },
      ALLOWED
    );
    expect(result.summary).toBe("Two leads.");
    expect(result.coverage_notes).toEqual(["Thin in DACH."]);
    expect(result.leads).toHaveLength(1);
    expect(result.leads[0]).toMatchObject({
      full_name: "Dana Reed",
      current_company: "Northwind",
      confidence: "high",
    });
  });

  test("drops a lead with no evidence at all", () => {
    // The whole premise is that every name traces to a source a recruiter
    // can open. An uncited name is the hallucination this must not ship.
    const result = normalizeSourcingSearch(
      { leads: [lead({ evidence: [] }), lead({ full_name: "Cited Person" })] },
      ALLOWED
    );
    expect(result.leads.map((l) => l.full_name)).toEqual(["Cited Person"]);
  });

  test("drops a lead whose only citation is off-domain", () => {
    const result = normalizeSourcingSearch(
      {
        leads: [
          lead({
            full_name: "Off Domain",
            evidence: [{ url: "https://linkedin.com/in/x", claim: "Profile." }],
          }),
        ],
      },
      ALLOWED
    );
    expect(result.leads).toHaveLength(0);
  });

  test("keeps the on-domain citations and discards the rest", () => {
    const result = normalizeSourcingSearch(
      {
        leads: [
          lead({
            evidence: [
              { url: "https://linkedin.com/in/x", claim: "off-domain" },
              { url: "https://github.com/dana", claim: "on-domain" },
            ],
          }),
        ],
      },
      ALLOWED
    );
    expect(result.leads[0].evidence).toEqual([
      { url: "https://github.com/dana", claim: "on-domain" },
    ]);
  });

  test("accepts a subdomain of an allowed domain", () => {
    const result = normalizeSourcingSearch(
      {
        leads: [
          lead({ evidence: [{ url: "https://gist.github.com/dana", claim: "Gist." }] }),
        ],
      },
      ALLOWED
    );
    expect(result.leads).toHaveLength(1);
  });

  test("drops malformed and non-http URLs", () => {
    const result = normalizeSourcingSearch(
      {
        leads: [
          lead({
            evidence: [
              { url: "not-a-url", claim: "junk" },
              { url: "javascript:alert(1)", claim: "hostile" },
              { url: "ftp://github.com/x", claim: "wrong scheme" },
            ],
          }),
        ],
      },
      ALLOWED
    );
    expect(result.leads).toHaveLength(0);
  });

  test("collapses the same person surfaced by two queries", () => {
    const result = normalizeSourcingSearch(
      {
        leads: [
          lead({ rationale: "first" }),
          lead({ rationale: "second" }),
          lead({ full_name: "DANA REED", rationale: "case variant" }),
        ],
      },
      ALLOWED
    );
    expect(result.leads).toHaveLength(1);
    expect(result.leads[0].rationale).toBe("first");
  });

  test("treats the same name at a different company as a different person", () => {
    const result = normalizeSourcingSearch(
      {
        leads: [lead(), lead({ current_company: "Contoso" })],
      },
      ALLOWED
    );
    expect(result.leads).toHaveLength(2);
  });

  test("drops a lead with no name", () => {
    const result = normalizeSourcingSearch(
      { leads: [lead({ full_name: "  " }), lead({ full_name: "Real Name" })] },
      ALLOWED
    );
    expect(result.leads.map((l) => l.full_name)).toEqual(["Real Name"]);
  });

  test("coerces missing optional fields to null and unknown confidence to low", () => {
    const result = normalizeSourcingSearch(
      {
        leads: [
          lead({
            current_title: 42,
            current_company: "",
            location: null,
            confidence: "certain",
          }),
        ],
      },
      ALLOWED
    );
    expect(result.leads[0]).toMatchObject({
      current_title: null,
      current_company: null,
      location: null,
      confidence: "low",
    });
  });

  test("survives malformed leads without throwing", () => {
    const result = normalizeSourcingSearch(
      { leads: ["garbage", null, 7, {}, lead()] },
      ALLOWED
    );
    expect(result.leads).toHaveLength(1);
  });

  test("without a domain list, keeps any well-formed http(s) citation", () => {
    const result = normalizeSourcingSearch({
      leads: [
        lead({ evidence: [{ url: "https://example.org/talk", claim: "Keynote." }] }),
      ],
    });
    expect(result.leads).toHaveLength(1);
  });
});
