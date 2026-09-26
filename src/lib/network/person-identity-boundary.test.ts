import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * The boundary between the product's TWO answers to "are these the same
 * person?" (§204).
 *
 *   identityKey(row)        -> who is this INCOMING thing?   (no row yet)
 *   row.network_profile_id  -> who is this EXISTING row?     (moves on merge)
 *
 * Structural, because the failure is silent in both directions: a render
 * path that recomputes identity shows a merged person twice — and the
 * second of them wears the neutral chip even when they are suppressed —
 * while a dedupe-before-insert that reached for the profile id would be
 * reading a column that does not exist yet.
 */

const SRC = path.join(process.cwd(), "src");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

/** Comments stripped before asserting about code — §202's lesson. */
function code(file: string): string {
  return fs
    .readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/, ""))
    .join("\n");
}

const FILES = walk(SRC);

/**
 * The `.select("…")` that FEEDS a given call site — the nearest one above it.
 *
 * Mutation testing found this hole twice, and the second one was this
 * file's own fault: asserting that a file "mentions network_profile_id"
 * passed while the column had been dropped from the query, because a type
 * annotation still named it. A row read without the column has
 * `network_profile_id: undefined`, so `personKey` degrades to the computed
 * key on EVERY row and the fold sends every person to the pending pile —
 * silently, in the direction of forgetting. §202: mentioning is not
 * handling; bind the assertion to the construct that does the work.
 */
function selectFeeding(body: string, marker: string): string {
  const at = body.indexOf(marker);
  expect(at, `marker not found: ${marker}`).toBeGreaterThan(-1);
  // The CANDIDATES read above the call site — not merely the nearest
  // select, which in the aggregator is the scores query sitting beside it.
  const from = body.lastIndexOf('.from("candidates")', at);
  expect(from, `no candidates read above: ${marker}`).toBeGreaterThan(-1);
  const sel = /\.select\(\s*(?:\n\s*)?"([^"]*)"/.exec(body.slice(from, at));
  expect(sel, `no .select() on that read: ${marker}`).not.toBeNull();
  return sel![1];
}

/**
 * Every file allowed to compute person identity, and the question each one
 * asks. A new entry here is a claim that the file runs BEFORE the row —
 * and therefore before the person — exists. Nothing joins this list by
 * accident.
 */
const ASKS_ABOUT_INCOMING_THINGS: Record<string, string> = {
  "src/lib/network/person-key.ts":
    "the fallback itself: a row whose CV is still being read has no person",
  "src/lib/candidates/dedupe.ts":
    "§201 — is this uploaded CV somebody we already hold? asked pre-insert",
  "src/lib/sourcing/import.ts":
    "the importer, deciding duplicate/ambiguous before any row is written",
  "src/lib/comms/send-candidate-message.ts":
    "the erasure lookup, keyed on identity_key by 073 — named OUT of §204 (D4)",
};

describe("only pre-row code computes person identity", () => {
  it("has exactly the ruled set of consumers", () => {
    const importers = FILES.filter((f) =>
      /from\s+"@\/lib\/candidate-identity"/.test(code(f))
    )
      .map((f) => path.relative(process.cwd(), f))
      .sort();

    expect(importers).toEqual(Object.keys(ASKS_ABOUT_INCOMING_THINGS).sort());
  });

  it("keeps identity out of the Network page's render path entirely", () => {
    // The fold, the overlay and the page. Before §204 all three computed a
    // key; the middle one silently stopped matching the moment §203 shipped.
    for (const rel of [
      "src/lib/network/network-aggregator.ts",
      "src/lib/network/profile-resolver.ts",
      "src/app/(dashboard)/app/candidates/network/page.tsx",
      "src/app/(dashboard)/app/candidates/network/network-table.tsx",
    ]) {
      const body = code(path.join(process.cwd(), rel));
      expect(body).not.toMatch(/\bidentityKey\s*\(/);
      expect(body).not.toMatch(/candidate-identity/);
    }
  });

  it("folds and joins the overlay on the profile id, not on anything derived", () => {
    const fold = code(
      path.join(process.cwd(), "src/lib/network/network-aggregator.ts")
    );
    // The rows change, not merely the vocabulary: the bucket key IS the
    // column, and a person carries it out.
    expect(fold).toMatch(/const key = c\.network_profile_id;/);
    expect(fold).toMatch(/profile_id,/);

    const resolver = code(
      path.join(process.cwd(), "src/lib/network/profile-resolver.ts")
    );
    expect(resolver).toMatch(/map\.set\(row\.id, row\)/);
    expect(resolver).not.toMatch(/map\.set\(row\.identity_key/);

    const table = code(
      path.join(
        process.cwd(),
        "src/app/(dashboard)/app/candidates/network/network-table.tsx"
      )
    );
    expect(table).toMatch(/profiles\[p\.profile_id\]/);
  });

  it("asks mandate membership of the person, in both §200 doors", () => {
    for (const rel of [
      "src/app/(dashboard)/app/candidates/network/actions.ts",
      "src/app/(dashboard)/app/projects/[id]/pool-suggestions/actions.ts",
    ]) {
      const body = code(path.join(process.cwd(), rel));
      // APPLIED, not merely imported — `.map(personKey)` counts, a mention
      // in a type or a comment does not (§202: mentioning is not handling).
      expect(body).toMatch(/personKey\(|\.map\(personKey\)/);
      expect(body).not.toMatch(/\bidentityKey\s*\(/);
    }
  });

  it("READS the person on every query that then asks who somebody is", () => {
    // Each pair is (file, the call site that consumes the row). The
    // assertion is about the query feeding that exact call.
    // §205 — the aggregator dropped off this list because it no longer
    // queries candidates at all: the fold runs in Postgres now, and
    // network-sql-parity.test.ts guards that the SQL groups on the column.
    const sites: Array<[string, string]> = [
      ["src/lib/ai/run-candidate-search.ts", "personKey({"],
      [
        "src/app/(dashboard)/app/projects/[id]/pool-suggestions/actions.ts",
        ".map(personKey)",
      ],
      [
        "src/app/(dashboard)/app/candidates/network/actions.ts",
        "personKey(source)",
      ],
      [
        "src/app/(dashboard)/app/candidates/network/actions.ts",
        "personKey(r) === dupKey",
      ],
    ];
    for (const [rel, marker] of sites) {
      const body = code(path.join(process.cwd(), rel));
      expect(
        selectFeeding(body, marker),
        `${rel} → ${marker}`
      ).toContain("network_profile_id");
    }
  });
});

describe("the panel does not describe a page that no longer exists", () => {
  // §203 added an honest sentence: the table still groups by identifier. §204
  // made that sentence false, and a stale honesty note is worse than none —
  // it is §175's class with a citation. Drive 136 read it on the live page.
  const panel = code(
    path.join(
      process.cwd(),
      "src/app/(dashboard)/app/candidates/network/merge-people-panel.tsx"
    )
  );

  it("says the table groups by the PERSON", () => {
    expect(panel).toMatch(/table above groups by the person/);
  });

  it("no longer claims the table groups by each record's identifier", () => {
    expect(panel).not.toMatch(/still groups by the identifier/);
  });
});

describe("the badge counts what the page folds (migration 144)", () => {
  const RAW = fs.readFileSync(
    path.join(process.cwd(), "supabase", "migrations", "144_count_people_by_person.sql"),
    "utf8"
  );
  const SQL = RAW.split("\n")
    .map((l) => l.replace(/--.*$/, ""))
    .join("\n");

  it("counts distinct people, not distinct keys", () => {
    const fn = SQL.indexOf(
      "CREATE OR REPLACE FUNCTION public.count_network_people"
    );
    const body = SQL.slice(fn, SQL.indexOf("$$;", fn));
    expect(body).toMatch(/COUNT\(DISTINCT c\.network_profile_id\)/);
    // The old rule, gone from the body: while it counted keys, a merge
    // moved the page by one and the badge by nothing (4 -> 6, proven live).
    expect(body).not.toMatch(/candidate_identity_key/);
  });

  it("excludes rows with no person yet, exactly as the fold does", () => {
    const fn = SQL.indexOf(
      "CREATE OR REPLACE FUNCTION public.count_network_people"
    );
    const body = SQL.slice(fn, SQL.indexOf("$$;", fn));
    expect(body).toMatch(/WHERE c\.network_profile_id IS NOT NULL/);
  });

  it("stays RLS-scoped — it is not security definer", () => {
    const fn = SQL.indexOf(
      "CREATE OR REPLACE FUNCTION public.count_network_people"
    );
    const body = SQL.slice(fn, SQL.indexOf("$$;", fn));
    expect(body).not.toMatch(/SECURITY\s+DEFINER/i);
    expect(body).toMatch(/STABLE/);
  });
});
