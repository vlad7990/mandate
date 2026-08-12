import { describe, expect, test } from "vitest";
import {
  BLOCKED_SOURCE_DOMAINS,
  normalizeDomain,
  resolveAllowedDomains,
  type SourceConnector,
} from "./source-policy";

function connector(overrides: Partial<SourceConnector> = {}): SourceConnector {
  return {
    id: "src-1",
    organization_id: "org-1",
    provider: "web_search",
    label: "Test source",
    allowed_domains: ["github.com"],
    status: "active",
    ...overrides,
  };
}

describe("normalizeDomain", () => {
  test.each([
    ["https://www.GitHub.com/orgs/x", "github.com"],
    ["  crunchbase.com  ", "crunchbase.com"],
    ["http://news.ycombinator.com/", "news.ycombinator.com"],
    ["sub.example.co.uk/path?q=1", "sub.example.co.uk"],
  ])("%s → %s", (input, expected) => {
    expect(normalizeDomain(input)).toBe(expected);
  });

  test("rejects entries that are not domains", () => {
    expect(normalizeDomain("")).toBeNull();
    expect(normalizeDomain("   ")).toBeNull();
    expect(normalizeDomain("localhost")).toBeNull();
    expect(normalizeDomain("not a domain")).toBeNull();
  });
});

describe("resolveAllowedDomains", () => {
  test("collects active web_search connectors, normalized and sorted", () => {
    const domains = resolveAllowedDomains([
      connector({ allowed_domains: ["https://www.GitHub.com"] }),
      connector({ id: "src-2", allowed_domains: ["crunchbase.com"] }),
    ]);
    expect(domains).toEqual(["crunchbase.com", "github.com"]);
  });

  test("de-duplicates the same domain configured twice", () => {
    const domains = resolveAllowedDomains([
      connector({ allowed_domains: ["github.com"] }),
      connector({ id: "src-2", allowed_domains: ["https://www.github.com/"] }),
    ]);
    expect(domains).toEqual(["github.com"]);
  });

  test("ignores connectors that are not active", () => {
    expect(
      resolveAllowedDomains([
        connector({ status: "disabled" }),
        connector({ id: "src-2", status: "needs_auth", allowed_domains: ["crunchbase.com"] }),
      ])
    ).toBeNull();
  });

  test("ignores providers that do not use the web search tool", () => {
    expect(
      resolveAllowedDomains([
        connector({ provider: "linkedin_rsc", allowed_domains: ["example.com"] }),
        connector({ id: "s2", provider: "people_data_api", allowed_domains: ["example.org"] }),
      ])
    ).toBeNull();
  });

  test("strips blocked domains even when an org configures them", () => {
    const domains = resolveAllowedDomains([
      connector({ allowed_domains: ["linkedin.com", "github.com"] }),
    ]);
    expect(domains).toEqual(["github.com"]);
  });

  test("strips blocked domains written as a URL, with www, or as a subdomain", () => {
    const domains = resolveAllowedDomains([
      connector({
        allowed_domains: [
          "https://www.linkedin.com/in/someone",
          "uk.linkedin.com",
          "github.com",
        ],
      }),
    ]);
    expect(domains).toEqual(["github.com"]);
  });

  test("returns null rather than an empty list when every domain is stripped", () => {
    // Load-bearing: null makes the caller skip the search. An empty array
    // handed to the tool would mean "search the entire open web", i.e. the
    // exact thing the block list exists to prevent.
    expect(
      resolveAllowedDomains([connector({ allowed_domains: ["linkedin.com"] })])
    ).toBeNull();
  });

  test("returns null when an org has configured no sources at all", () => {
    expect(resolveAllowedDomains([])).toBeNull();
  });

  test("every blocked domain is actually rejected", () => {
    for (const blocked of BLOCKED_SOURCE_DOMAINS) {
      expect(
        resolveAllowedDomains([connector({ allowed_domains: [blocked] })])
      ).toBeNull();
    }
  });
});
