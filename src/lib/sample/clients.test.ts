import { describe, expect, it } from "vitest";
import {
  SAMPLE_CLIENTS,
  SAMPLE_MANDATES,
  sampleClient,
  sampleClientLiveMandates,
  sampleClientMandateCount,
} from "./data";

/**
 * The sample client list is a projection of the sample mandate list, and
 * these are the ways the two can silently stop agreeing.
 *
 * The fixture is not type-checked against anything — it is object literals —
 * so a company renamed in one array and not the other, or a mandate id that
 * no longer exists, produces a client page with an empty mandate list and no
 * error anywhere. That is exactly the failure the counts are derived to
 * avoid, and deriving them only helps if something checks the inputs.
 */

describe("sample clients", () => {
  it("prefixes every id, so none can reach a query", () => {
    // `isSampleId` is the whole routing contract. An id here without the
    // prefix would be handed to Supabase as a uuid.
    for (const c of SAMPLE_CLIENTS) {
      expect(c.id.startsWith("sample-")).toBe(true);
      for (const contact of c.contacts) {
        expect(contact.id.startsWith("sample-")).toBe(true);
      }
      for (const note of c.notes) {
        expect(note.id.startsWith("sample-")).toBe(true);
      }
    }
  });

  it("has a client for every sample mandate, and no orphans either way", () => {
    const claimed = SAMPLE_CLIENTS.flatMap((c) => c.liveMandateIds).sort();
    const actual = SAMPLE_MANDATES.map((m) => m.id).sort();

    // Both directions. A mandate with no client leaves the client list
    // short; a client naming a mandate that does not exist renders a
    // mandate count it cannot show rows for.
    expect(claimed).toEqual(actual);
    expect(new Set(claimed).size).toBe(claimed.length);
  });

  it("names the same company as the mandate it claims", () => {
    for (const c of SAMPLE_CLIENTS) {
      for (const m of sampleClientLiveMandates(c)) {
        expect(m.company).toBe(c.name);
      }
    }
  });

  it("counts live plus closed mandates", () => {
    const larkspur = sampleClient("sample-client-larkspur");
    expect(larkspur).toBeDefined();
    // One in flight, three closed. If this ever reads 1 the closed searches
    // have been dropped and the client list is back to a column of 01s.
    // (Was 3 — W7 added the Director of Data Engineering closure, which is
    // the search `sample-placement-demirci` actually belongs to.)
    expect(sampleClientMandateCount(larkspur!)).toBe(4);

    for (const c of SAMPLE_CLIENTS) {
      expect(sampleClientMandateCount(c)).toBe(
        c.liveMandateIds.length + c.closedMandates.length
      );
    }
  });

  it("keeps at most one primary contact per client", () => {
    // The database enforces this with a partial unique index and a trigger
    // (054). The fixture has neither, so a second primary would render two
    // "Primary" chips and teach a rule the product does not have.
    for (const c of SAMPLE_CLIENTS) {
      expect(c.contacts.filter((x) => x.isPrimary).length).toBeLessThanOrEqual(1);
    }
  });

  it("gives every client at least one contact and one note", () => {
    // The point of W2: four panels, none of them empty. A client added
    // later without these renders the bare empty states this replaced.
    for (const c of SAMPLE_CLIENTS) {
      expect(c.contacts.length).toBeGreaterThan(0);
      expect(c.notes.length).toBeGreaterThan(0);
    }
  });

  it("has at least one client a reader without fees:read still sees notes on", () => {
    // Filtering `commercial` notes must not empty the panel for a
    // researcher. If every note on a client were commercial, that client's
    // notes panel would be blank for two of the four roles.
    for (const c of SAMPLE_CLIENTS) {
      expect(c.notes.some((n) => n.visibility === "org")).toBe(true);
    }
  });

  it("has instalment plans that sum to 100%", () => {
    // §5a: thirds of a retainer are quoted as 33.333, and a plan that sums
    // to 99.999 is the bug the real `parseInstalmentPlan` guards against.
    for (const c of SAMPLE_CLIENTS) {
      const plan = c.feeTerms?.instalments ?? [];
      if (plan.length === 0) continue;
      const total = plan.reduce((n, i) => n + Number(i.share.replace("%", "")), 0);
      expect(total).toBeCloseTo(100, 3);
    }
  });

  it("covers the states worth teaching", () => {
    // A demo in which every record is complete teaches that the product
    // arrives full. These are the three partial states the fixture carries
    // on purpose; losing one is a quiet regression in what the page shows.
    expect(SAMPLE_CLIENTS.some((c) => c.researchedDaysAgo === null)).toBe(true);
    expect(SAMPLE_CLIENTS.some((c) => c.feeTerms === null)).toBe(true);
    expect(SAMPLE_CLIENTS.some((c) => c.closedMandates.length > 0)).toBe(true);
    expect(SAMPLE_CLIENTS.some((c) => c.feeTerms?.model === "retained")).toBe(true);
  });
});
