import { describe, expect, it } from "vitest";
import {
  buildListHref,
  isFiltered,
  pageCount,
  pageRange,
  parseListParams,
  rangeFor,
  splitOverfetch,
} from "./list-params";

const SPEC = {
  perPage: 25,
  filters: ["tier", "stage"] as const,
  sorts: ["updated_at", "full_name"] as const,
  defaultSort: "updated_at",
} as const;

describe("parseListParams", () => {
  it("defaults to the first page with nothing applied", () => {
    const p = parseListParams({}, SPEC);
    expect(p).toMatchObject({ page: 1, q: "", filters: {}, dir: "desc" });
  });

  it("drops filter keys the page did not declare", () => {
    // The key reaches `.eq()` as a column name, so an undeclared one must
    // not survive parsing.
    const p = parseListParams(
      { tier: "1", organization_id: "other-org", cv_raw: "x" },
      SPEC
    );
    expect(p.filters).toEqual({ tier: "1" });
  });

  it("drops a sort key the page did not declare", () => {
    // Same reasoning: this reaches `.order()`.
    const p = parseListParams({ sort: "cv_raw" }, SPEC);
    expect(p.sort).toBe("updated_at");
  });

  it("ignores an unknown direction rather than passing it through", () => {
    expect(parseListParams({ dir: "sideways" }, SPEC).dir).toBe("desc");
    expect(parseListParams({ dir: "asc" }, SPEC).dir).toBe("asc");
  });

  it.each([
    ["0", 1],
    ["-3", 1],
    ["abc", 1],
    ["1.5", 1],
    ["", 1],
    ["1e9", 1],
    ["7", 7],
  ])("clamps page %j to %i", (raw, expected) => {
    expect(parseListParams({ page: raw }, SPEC).page).toBe(expected);
  });

  it("takes the first value when a param is repeated", () => {
    // ?tier=1&tier=2 arrives as an array; `.eq()` needs one scalar.
    expect(parseListParams({ tier: ["1", "2"] }, SPEC).filters.tier).toBe("1");
  });

  it("treats a whitespace-only search as no search", () => {
    expect(parseListParams({ q: "   " }, SPEC).q).toBe("");
  });

  it("bounds perPage so one request cannot ask for everything", () => {
    expect(parseListParams({}, { perPage: 5000 }).perPage).toBe(200);
    expect(parseListParams({}, { perPage: 0 }).perPage).toBe(1);
  });
});

describe("rangeFor", () => {
  it("overfetches one row past the page", () => {
    // The extra row is what makes the Next button correct without a count.
    expect(rangeFor(parseListParams({}, SPEC))).toEqual({ from: 0, to: 25 });
    expect(rangeFor(parseListParams({ page: "3" }, SPEC))).toEqual({
      from: 50,
      to: 75,
    });
  });
});

describe("splitOverfetch", () => {
  const params = parseListParams({}, { perPage: 3 });

  it("reports more pages and hands back only the page", () => {
    const { rows, hasMore } = splitOverfetch([1, 2, 3, 4], params);
    expect(rows).toEqual([1, 2, 3]);
    expect(hasMore).toBe(true);
  });

  it("reports no more when the page is exactly full", () => {
    const { rows, hasMore } = splitOverfetch([1, 2, 3], params);
    expect(rows).toEqual([1, 2, 3]);
    expect(hasMore).toBe(false);
  });

  it("handles a short final page", () => {
    expect(splitOverfetch([1], params)).toEqual({ rows: [1], hasMore: false });
  });
});

describe("pageCount", () => {
  it.each([
    [0, 25, 1],
    [1, 25, 1],
    [25, 25, 1],
    [26, 25, 2],
    [340, 25, 14],
  ])("%i rows at %i per page is %i pages", (total, per, expected) => {
    expect(pageCount(total, per)).toBe(expected);
  });
});

describe("pageRange", () => {
  it("numbers the rows on the current page", () => {
    const p = parseListParams({ page: "2" }, SPEC);
    expect(pageRange(p, 25)).toEqual({ first: 26, last: 50 });
  });

  it("collapses to zero when the page is empty", () => {
    expect(pageRange(parseListParams({}, SPEC), 0)).toEqual({
      first: 0,
      last: 0,
    });
  });
});

describe("buildListHref", () => {
  const base = "/app/candidates";

  it("omits everything at its default so a clean list is a clean URL", () => {
    expect(buildListHref(base, parseListParams({}, { perPage: 25 }))).toBe(base);
  });

  it("returns to page one when the query changes", () => {
    // Searching from page 4 must not land on an empty page 4 of the results.
    const p = parseListParams({ page: "4" }, SPEC);
    expect(buildListHref(base, p, { q: "priya" })).toBe(
      "/app/candidates?q=priya&sort=updated_at&dir=desc"
    );
  });

  it("returns to page one when a filter changes", () => {
    const p = parseListParams({ page: "4" }, SPEC);
    const href = buildListHref(base, p, { filters: { tier: "1" } });
    expect(href).toContain("tier=1");
    expect(href).not.toContain("page=");
  });

  it("keeps the rest of the state when only the page changes", () => {
    const p = parseListParams({ q: "priya", tier: "1", page: "2" }, SPEC);
    const href = buildListHref(base, p, { page: 3 });
    expect(href).toContain("q=priya");
    expect(href).toContain("tier=1");
    expect(href).toContain("page=3");
  });

  it("encodes a search that would otherwise break the URL", () => {
    const href = buildListHref(base, parseListParams({}, {}), {
      q: "a&b=c d",
    });
    expect(href).toContain("q=a%26b%3Dc+d");
  });

  it("drops a filter set back to empty", () => {
    const p = parseListParams({ tier: "1" }, SPEC);
    expect(buildListHref(base, p, { filters: {} })).not.toContain("tier");
  });
});

describe("isFiltered", () => {
  it("is false for a clean list and true once anything narrows it", () => {
    expect(isFiltered(parseListParams({}, SPEC))).toBe(false);
    expect(isFiltered(parseListParams({ q: "x" }, SPEC))).toBe(true);
    expect(isFiltered(parseListParams({ tier: "1" }, SPEC))).toBe(true);
  });
});
