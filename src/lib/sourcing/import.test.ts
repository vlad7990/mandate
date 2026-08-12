import { describe, expect, test } from "vitest";
import {
  MAX_IMPORT_ROWS,
  dedupeImportRows,
  detectDelimiter,
  firstTouchRun,
  parseImport,
  splitDelimitedLine,
  type ExistingCandidate,
  type ParsedImportRow,
} from "./import";

describe("splitDelimitedLine", () => {
  test("splits on the delimiter and trims", () => {
    expect(splitDelimitedLine("a, b ,c", ",")).toEqual(["a", "b", "c"]);
  });

  test("keeps a quoted delimiter inside the field", () => {
    // The failure this exists to prevent: an unquoted split here shifts every
    // later column, silently importing a title as a company.
    expect(
      splitDelimitedLine('Dana,"Smith, Jones & Co",Berlin', ",")
    ).toEqual(["Dana", "Smith, Jones & Co", "Berlin"]);
  });

  test("unescapes a doubled quote", () => {
    expect(splitDelimitedLine('"He said ""hi""",x', ",")).toEqual([
      'He said "hi"',
      "x",
    ]);
  });

  test("preserves empty fields", () => {
    expect(splitDelimitedLine("a,,c", ",")).toEqual(["a", "", "c"]);
  });
});

describe("detectDelimiter", () => {
  test.each([
    ["a,b,c", ","],
    ["a\tb\tc", "\t"],
    ["a;b;c", ";"],
  ])("%s → %s", (line, expected) => {
    expect(detectDelimiter(line)).toBe(expected);
  });
});

describe("parseImport", () => {
  test("maps common headers to fields", () => {
    const result = parseImport(
      [
        "Name,Title,Company,Location,Profile URL,Email",
        "Dana Reed,VP Engineering,Northwind,Berlin,https://x/dana,dana@x.com",
      ].join("\n")
    );
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      full_name: "Dana Reed",
      current_title: "VP Engineering",
      current_company: "Northwind",
      location: "Berlin",
      profile_url: "https://x/dana",
      email: "dana@x.com",
    });
  });

  test("matches header aliases regardless of case and punctuation", () => {
    const result = parseImport(
      ["FIRST-NAME,LAST_NAME,Employer", "Dana,Reed,Northwind"].join("\n")
    );
    expect(result.rows[0].full_name).toBe("Dana Reed");
    expect(result.rows[0].current_company).toBe("Northwind");
  });

  test("keeps every original column in raw", () => {
    const result = parseImport(
      ["Name,Seniority", "Dana Reed,Executive"].join("\n")
    );
    expect(result.rows[0].raw).toEqual({ Name: "Dana Reed", Seniority: "Executive" });
  });

  test("skips rows with no usable name and counts them", () => {
    const result = parseImport(
      ["Name,Company", "Dana Reed,Northwind", ",Orphan Co", "  ,Another"].join("\n")
    );
    expect(result.rows).toHaveLength(1);
    expect(result.skippedUnnamed).toBe(2);
  });

  test("caps rows and reports the overflow rather than dropping silently", () => {
    const lines = ["Name"];
    for (let i = 0; i < MAX_IMPORT_ROWS + 25; i++) lines.push(`Person ${i}`);
    const result = parseImport(lines.join("\n"));
    expect(result.rows).toHaveLength(MAX_IMPORT_ROWS);
    expect(result.droppedForCap).toBe(25);
  });

  test("handles empty input", () => {
    expect(parseImport("").rows).toEqual([]);
    expect(parseImport("   \n  \n").rows).toEqual([]);
  });

  test("handles CRLF line endings", () => {
    const result = parseImport("Name,Company\r\nDana Reed,Northwind\r\n");
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].current_company).toBe("Northwind");
  });

  test("tolerates a short row without shifting fields", () => {
    const result = parseImport(
      ["Name,Title,Company", "Dana Reed,VP Engineering"].join("\n")
    );
    expect(result.rows[0].current_company).toBeNull();
  });
});

function row(overrides: Partial<ParsedImportRow> = {}): ParsedImportRow {
  return {
    full_name: "Dana Reed",
    current_title: null,
    current_company: "Northwind",
    location: null,
    profile_url: null,
    email: null,
    raw: {},
    ...overrides,
  };
}

const EXISTING: ExistingCandidate[] = [
  {
    id: "cand-email",
    full_name: "Email Person",
    email: "dupe@x.com",
    linkedin_url: null,
    current_company: "Acme",
  },
  {
    id: "cand-li",
    full_name: "LinkedIn Person",
    email: null,
    linkedin_url: "https://li/in/bob",
    current_company: "Acme",
  },
  {
    id: "cand-name",
    full_name: "Dana Reed",
    email: null,
    linkedin_url: null,
    current_company: "Northwind",
  },
];

describe("dedupeImportRows", () => {
  test("an unmatched row is new", () => {
    const [r] = dedupeImportRows([row({ full_name: "Nobody Known" })], EXISTING);
    expect(r.match_status).toBe("new");
    expect(r.matched_candidate_id).toBeNull();
  });

  test("an email match is a duplicate", () => {
    const [r] = dedupeImportRows([row({ email: "DUPE@x.com" })], EXISTING);
    expect(r.match_status).toBe("duplicate");
    expect(r.matched_candidate_id).toBe("cand-email");
  });

  test("a profile-url match is a duplicate, ignoring case and trailing slash", () => {
    const [r] = dedupeImportRows(
      [row({ profile_url: "https://LI/in/bob/" })],
      EXISTING
    );
    expect(r.match_status).toBe("duplicate");
    expect(r.matched_candidate_id).toBe("cand-li");
  });

  test("a name-only match is AMBIGUOUS, not duplicate", () => {
    // Same name at the same employer is a real collision for common names —
    // the recruiter resolves it, we do not guess.
    const [r] = dedupeImportRows([row()], EXISTING);
    expect(r.match_status).toBe("ambiguous");
    expect(r.matched_candidate_id).toBe("cand-name");
  });

  test("the same person twice in one import marks the second occurrence", () => {
    const rows = dedupeImportRows(
      [row({ email: "new@x.com" }), row({ email: "new@x.com" })],
      []
    );
    expect(rows[0].match_status).toBe("new");
    expect(rows[1].match_status).toBe("duplicate");
  });

  test("an empty pool leaves everything new", () => {
    const rows = dedupeImportRows([row(), row({ email: "a@x.com" })], []);
    expect(rows.map((r) => r.match_status)).toEqual(["new", "new"]);
  });

  test("preserves input order and length", () => {
    const rows = dedupeImportRows(
      [row({ full_name: "A" }), row({ full_name: "B" }), row({ full_name: "C" })],
      EXISTING
    );
    expect(rows.map((r) => r.full_name)).toEqual(["A", "B", "C"]);
  });
});

describe("firstTouchRun", () => {
  test("returns the earliest executed run", () => {
    expect(
      firstTouchRun([
        { run_id: "v2", status: "executed", executed_at: "2026-08-02T00:00:00Z" },
        { run_id: "v1", status: "executed", executed_at: "2026-08-01T00:00:00Z" },
      ])
    ).toBe("v1");
  });

  test("ignores draft runs entirely", () => {
    expect(
      firstTouchRun([
        { run_id: "draft", status: "draft", executed_at: null },
        { run_id: "v1", status: "executed", executed_at: "2026-08-05T00:00:00Z" },
      ])
    ).toBe("v1");
  });

  test("returns null when nothing was executed", () => {
    expect(
      firstTouchRun([{ run_id: "draft", status: "draft", executed_at: null }])
    ).toBeNull();
    expect(firstTouchRun([])).toBeNull();
  });

  test("ignores an executed run with no timestamp", () => {
    expect(
      firstTouchRun([{ run_id: "broken", status: "executed", executed_at: null }])
    ).toBeNull();
  });

  test("breaks ties by run_id so the answer is deterministic", () => {
    // Matches the view's `ORDER BY executed_at ASC, id ASC` — otherwise the
    // UI and the analytics could name different winners for the same data.
    const links = [
      { run_id: "bbb", status: "executed" as const, executed_at: "2026-08-01T00:00:00Z" },
      { run_id: "aaa", status: "executed" as const, executed_at: "2026-08-01T00:00:00Z" },
    ];
    expect(firstTouchRun(links)).toBe("aaa");
    expect(firstTouchRun([...links].reverse())).toBe("aaa");
  });

  test("a later-executed run never steals attribution", () => {
    expect(
      firstTouchRun([
        { run_id: "v1", status: "executed", executed_at: "2026-08-01T00:00:00Z" },
        { run_id: "v2", status: "executed", executed_at: "2026-08-09T00:00:00Z" },
        { run_id: "v3", status: "executed", executed_at: "2026-08-20T00:00:00Z" },
      ])
    ).toBe("v1");
  });
});
