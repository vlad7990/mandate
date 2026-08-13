import { describe, expect, test } from "vitest";
import { firstTouchRun, type RunLink } from "./import";
import {
  defaultDecision,
  groupLineages,
  lineageTotals,
  normalizeRunContent,
  platformLabel,
  PROVENANCE_KEY,
  readProvenance,
  readRawColumns,
  type SourcingRunRow,
} from "./runs";

function run(overrides: Partial<SourcingRunRow> = {}): SourcingRunRow {
  return {
    id: "run-1",
    parent_run_id: null,
    root_run_id: "run-1",
    version: 1,
    label: "Conservative",
    status: "executed",
    content_json: {},
    result_count: 0,
    imported_count: 0,
    executed_at: "2026-08-01T00:00:00.000Z",
    created_at: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("groupLineages", () => {
  test("groups by root and orders versions ascending", () => {
    const lineages = groupLineages([
      run({ id: "c", root_run_id: "a", version: 3, created_at: "2026-08-03T00:00:00Z" }),
      run({ id: "a", root_run_id: "a", version: 1, created_at: "2026-08-01T00:00:00Z" }),
      run({ id: "b", root_run_id: "a", version: 2, created_at: "2026-08-02T00:00:00Z" }),
    ]);

    expect(lineages).toHaveLength(1);
    expect(lineages[0].runs.map((r) => r.version)).toEqual([1, 2, 3]);
  });

  test("keeps every version — a later one does not replace an earlier one", () => {
    // The whole reason this differs from the other versioned artefacts: v1's
    // yield is the baseline v2 is judged against, so v1 must survive grouping.
    const lineages = groupLineages([
      run({ id: "a", root_run_id: "a", version: 1, result_count: 200, imported_count: 18 }),
      run({ id: "b", root_run_id: "a", version: 2, result_count: 40, imported_count: 2 }),
    ]);

    expect(lineages[0].runs).toHaveLength(2);
    expect(lineages[0].runs[0].imported_count).toBe(18);
  });

  test("separates independent lineages and orders families by latest activity", () => {
    const lineages = groupLineages([
      run({ id: "old", root_run_id: "old", created_at: "2026-07-01T00:00:00Z" }),
      run({ id: "new", root_run_id: "new", created_at: "2026-08-09T00:00:00Z" }),
    ]);

    expect(lineages.map((l) => l.root_run_id)).toEqual(["new", "old"]);
  });

  test("handles an empty set", () => {
    expect(groupLineages([])).toEqual([]);
  });
});

describe("lineageTotals", () => {
  test("counts executed runs and sums yield across the family", () => {
    const [lineage] = groupLineages([
      run({ id: "a", root_run_id: "a", version: 1, result_count: 213, imported_count: 18 }),
      run({ id: "b", root_run_id: "a", version: 2, result_count: 327, imported_count: 13 }),
      run({ id: "c", root_run_id: "a", version: 3, status: "draft", executed_at: null }),
    ]);

    expect(lineageTotals(lineage)).toEqual({
      executed: 2,
      results: 540,
      imported: 31,
    });
  });
});

describe("normalizeRunContent", () => {
  test("reads a well-formed snapshot", () => {
    const content = normalizeRunContent({
      brief: { role_title: "Global Head of RegTech", must_haves: ["post-trade"] },
      strategy_rationale: "Tier-1 banks only.",
      queries: [
        {
          slot: "linkedin_exact",
          query_type: "linkedin",
          search_type: "exact",
          content: '("Global Head")',
          platform: "linkedin",
        },
      ],
    });

    expect(content.brief.role_title).toBe("Global Head of RegTech");
    expect(content.brief.must_haves).toEqual(["post-trade"]);
    expect(content.queries).toHaveLength(1);
    expect(content.strategy_rationale).toBe("Tier-1 banks only.");
  });

  test("drops queries with no content rather than rendering empty code blocks", () => {
    const content = normalizeRunContent({
      queries: [{ slot: "ats", content: "   " }, { slot: "ats", content: "x" }],
    });
    expect(content.queries).toHaveLength(1);
  });

  test("survives junk", () => {
    expect(normalizeRunContent(null).queries).toEqual([]);
    expect(normalizeRunContent("nope").queries).toEqual([]);
    expect(normalizeRunContent({ queries: "nope" }).queries).toEqual([]);
    expect(normalizeRunContent({ brief: 7 }).brief.role_title).toBeNull();
  });
});

describe("import provenance", () => {
  const raw = {
    Name: "Dana Reed",
    Seniority: "Executive",
    [PROVENANCE_KEY]: {
      source: "csv",
      filename: "export.csv",
      imported_at: "2026-08-12T10:00:00.000Z",
      row_number: 7,
    },
  };

  test("reads the provenance a staged row was imported with", () => {
    expect(readProvenance(raw)).toEqual({
      source: "csv",
      filename: "export.csv",
      imported_at: "2026-08-12T10:00:00.000Z",
      row_number: 7,
    });
  });

  test("keeps the reserved key out of the displayed columns", () => {
    expect(readRawColumns(raw)).toEqual({
      Name: "Dana Reed",
      Seniority: "Executive",
    });
  });

  test("returns null for a row imported before provenance was recorded", () => {
    expect(readProvenance({ Name: "Dana Reed" })).toBeNull();
    expect(readProvenance(null)).toBeNull();
    expect(readProvenance({ [PROVENANCE_KEY]: { source: "screenshot" } })).toBeNull();
  });
});

describe("defaultDecision", () => {
  test("a new row is pre-selected to create", () => {
    expect(defaultDecision("new", null)).toBe("create");
  });

  test("a strong duplicate is pre-selected to link", () => {
    expect(defaultDecision("duplicate", "cand-1")).toBe("link");
  });

  test("an ambiguous row gets NO default", () => {
    // Name-only matches collide for common names at large employers. A default
    // either way converts "we could not tell" into a silent merge or a silent
    // duplicate; the recruiter is the one who can resolve it.
    expect(defaultDecision("ambiguous", "cand-1")).toBeNull();
    expect(defaultDecision("ambiguous", null)).toBeNull();
  });

  test("a duplicate with nothing to link to is not pre-selected either", () => {
    expect(defaultDecision("duplicate", null)).toBeNull();
  });
});

describe("platformLabel", () => {
  test("labels a known platform and passes an unknown one through", () => {
    expect(platformLabel("linkedin_recruiter")).toBe("LinkedIn Recruiter");
    expect(platformLabel("some_future_gateway")).toBe("some_future_gateway");
  });
});

// ---------------------------------------------------------------------------
// The end-to-end attribution scenario, in the client-side mirror of the view.
//
//   Run A executed  -> candidate imported
//   Run B executed  -> SAME candidate imported again
//   candidate advances to hired
//
// firstTouchRun() and `sourcing_candidate_attribution` must agree exactly, or
// the number a recruiter reads on screen differs from the one the metrics page
// computes. The database side of this scenario is pinned in
// supabase/tests/sourcing_promotion_invariants.sql.
// ---------------------------------------------------------------------------

describe("first-touch attribution", () => {
  const RUN_A: RunLink = {
    run_id: "run-a",
    status: "executed",
    executed_at: "2026-08-01T09:00:00.000Z",
  };
  const RUN_B: RunLink = {
    run_id: "run-b",
    status: "executed",
    executed_at: "2026-08-09T09:00:00.000Z",
  };

  test("credits the earlier executed run when both surfaced the person", () => {
    expect(firstTouchRun([RUN_A, RUN_B])).toBe("run-a");
  });

  test("the answer does not depend on the order the links were recorded", () => {
    expect(firstTouchRun([RUN_B, RUN_A])).toBe("run-a");
  });

  test("multi-touch is visible but not double-counted", () => {
    // Three runs surfaced the same person; exactly one is credited, so a single
    // hire cannot inflate three strategies' conversion rates at once.
    const RUN_C: RunLink = {
      run_id: "run-c",
      status: "executed",
      executed_at: "2026-08-11T09:00:00.000Z",
    };
    const links = [RUN_C, RUN_B, RUN_A];
    expect(links).toHaveLength(3);
    expect(firstTouchRun(links)).toBe("run-a");
  });

  test("back-filling an earlier run moves the credit to it", () => {
    // The reason attribution is derived and never stored: an earlier run
    // imported later must correct the answer, not leave a stale winner.
    const EARLIER: RunLink = {
      run_id: "run-zero",
      status: "executed",
      executed_at: "2026-07-20T09:00:00.000Z",
    };
    expect(firstTouchRun([RUN_A, RUN_B])).toBe("run-a");
    expect(firstTouchRun([RUN_A, RUN_B, EARLIER])).toBe("run-zero");
  });

  test("a draft run never takes the credit, however early it was created", () => {
    const DRAFT: RunLink = { run_id: "run-draft", status: "draft", executed_at: null };
    expect(firstTouchRun([DRAFT, RUN_A])).toBe("run-a");
    expect(firstTouchRun([DRAFT])).toBeNull();
  });

  test("ties break deterministically, matching the view's ORDER BY", () => {
    const tieA: RunLink = { ...RUN_A, run_id: "aaa", executed_at: "2026-08-01T09:00:00.000Z" };
    const tieB: RunLink = { ...RUN_A, run_id: "bbb", executed_at: "2026-08-01T09:00:00.000Z" };
    expect(firstTouchRun([tieB, tieA])).toBe("aaa");
    expect(firstTouchRun([tieA, tieB])).toBe("aaa");
  });
});
