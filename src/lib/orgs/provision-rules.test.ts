import { describe, expect, it } from "vitest";
import { deriveOrgSlug, orgProvisionRefusal } from "./provision-rules";

describe("deriveOrgSlug", () => {
  it("lowercases and hyphenates", () => {
    expect(deriveOrgSlug("Acme Search Partners")).toBe("acme-search-partners");
  });

  it("collapses punctuation runs to single hyphens", () => {
    expect(deriveOrgSlug("Smith & Co. (London)")).toBe("smith-co-london");
  });

  it("strips diacritics", () => {
    expect(deriveOrgSlug("Café Zürich")).toBe("cafe-zurich");
  });

  it("trims leading and trailing hyphens", () => {
    expect(deriveOrgSlug("  --Acme--  ")).toBe("acme");
  });

  it("returns empty for a name with no usable characters", () => {
    expect(deriveOrgSlug("!!!")).toBe("");
  });

  it("caps at 50 characters without a trailing hyphen", () => {
    const slug = deriveOrgSlug("a".repeat(49) + " " + "b".repeat(20));
    expect(slug.length).toBeLessThanOrEqual(50);
    expect(slug.endsWith("-")).toBe(false);
  });
});

describe("orgProvisionRefusal", () => {
  it("admits a legal name and slug", () => {
    expect(
      orgProvisionRefusal({ name: "Acme Search", slug: "acme-search" })
    ).toBeNull();
  });

  it("refuses a blank name", () => {
    expect(orgProvisionRefusal({ name: "   ", slug: "acme" })).toMatch(
      /needs a name/
    );
  });

  it("refuses an overlong name", () => {
    expect(
      orgProvisionRefusal({ name: "x".repeat(121), slug: "acme" })
    ).toMatch(/too long/);
  });

  it("refuses a blank slug", () => {
    expect(orgProvisionRefusal({ name: "Acme", slug: "" })).toMatch(
      /needs a slug/
    );
  });

  it("refuses a one-character slug", () => {
    expect(orgProvisionRefusal({ name: "Acme", slug: "a" })).toMatch(
      /2 to 50/
    );
  });

  it("refuses an overlong slug", () => {
    expect(
      orgProvisionRefusal({ name: "Acme", slug: "a".repeat(51) })
    ).toMatch(/2 to 50/);
  });

  it("refuses uppercase, spaces, and edge hyphens", () => {
    for (const slug of ["Acme", "acme search", "-acme", "acme-", "ac--me", "acme_x"]) {
      expect(orgProvisionRefusal({ name: "Acme", slug })).toMatch(
        /lowercase letters/
      );
    }
  });
});
