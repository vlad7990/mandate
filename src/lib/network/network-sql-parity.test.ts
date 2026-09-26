import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * The fold now has TWO implementations (§205): `foldRowsIntoPeople` in
 * TypeScript, which the fixtures drive, and migration 145's SQL, which the
 * page actually reads. Two implementations of one rule drift, silently, and
 * this product has paid for that twice — §201's fourth `identityKey`, and
 * §204's badge counting keys while the page counted people.
 *
 * So these are structural guards over the pair, plus the invariants that make
 * paging honest at all. The behaviour itself is proven live in drive 137: a
 * source file can only ever say what it intends.
 */

const ROOT = process.cwd();
const RAW = fs.readFileSync(
  path.join(ROOT, "supabase", "migrations", "145_network_fold_in_postgres.sql"),
  "utf8"
);
/** Comments stripped before asserting about code — §202's lesson. */
const SQL = RAW.split("\n")
  .map((l) => l.replace(/--.*$/, ""))
  .join("\n");

function src(rel: string): string {
  return fs
    .readFileSync(path.join(ROOT, rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/, ""))
    .join("\n");
}

const AGGREGATOR = src("src/lib/network/network-aggregator.ts");
const PAGE = src("src/app/(dashboard)/app/candidates/network/page.tsx");
const TABLE = src("src/app/(dashboard)/app/candidates/network/network-table.tsx");

/** The RETURNS TABLE column list of a function in the migration. */
function returnsTable(fn: string): string[] {
  const at = SQL.indexOf(`CREATE OR REPLACE FUNCTION public.${fn}(`);
  expect(at, `function not found: ${fn}`).toBeGreaterThan(-1);
  const open = SQL.indexOf("RETURNS TABLE (", at);
  expect(open, `no RETURNS TABLE on ${fn}`).toBeGreaterThan(-1);
  const close = SQL.indexOf(")\nLANGUAGE", open);
  return SQL.slice(open + "RETURNS TABLE (".length, close)
    .split(",")
    .map((line) => line.trim().split(/\s+/)[0])
    .filter(Boolean);
}

describe("the SQL fold and the TypeScript fold describe the same person", () => {
  it("hands back every field the page's row type reads", () => {
    const columns = returnsTable("network_people");
    const typeBody = AGGREGATOR.slice(
      AGGREGATOR.indexOf("type PersonRow = {"),
      AGGREGATOR.indexOf("function num(")
    );
    const keys = [...typeBody.matchAll(/^\s{2}(\w+):/gm)].map((m) => m[1]);

    expect(keys.length).toBeGreaterThan(15);
    expect(columns.sort()).toEqual(keys.sort());
  });

  it("groups on the person and excludes rows that have none", () => {
    // Bound to the BASE cte, not the function: `c.network_profile_id AS pid`
    // also appears in the search CTE, so asserting it anywhere in the body
    // proves the vocabulary exists and nothing about what the fold groups on.
    // Mutation testing caught exactly that — §202's lesson, fourth costume.
    const base = SQL.slice(SQL.indexOf("base AS ("), SQL.indexOf("people AS ("));
    expect(base).toMatch(/c\.network_profile_id AS pid/);
    // §196/139 + §204 D2: no person yet is not a person.
    expect(base).toMatch(/WHERE c\.network_profile_id IS NOT NULL/);

    const grouped = SQL.slice(
      SQL.indexOf("people AS ("),
      SQL.indexOf("CREATE OR REPLACE FUNCTION public.network_people(")
    );
    expect(grouped).toMatch(/GROUP BY b\.pid/);
  });

  it("keeps the canonical record as the newest one (D3)", () => {
    expect(SQL).toMatch(
      /PARTITION BY c\.network_profile_id ORDER BY c\.updated_at DESC/
    );
    expect(SQL).toMatch(/FILTER \(WHERE b\.rn = 1\)/);
  });

  it("ranks tier_1 above tier_4 rather than alphabetically", () => {
    expect(SQL).toMatch(
      /min\(\s*CASE b\.tier WHEN 'tier_1' THEN 1 WHEN 'tier_2' THEN 2/
    );
  });
});

describe("paging is honest", () => {
  const paged = SQL.slice(
    SQL.indexOf("CREATE OR REPLACE FUNCTION public.network_people("),
    SQL.indexOf("CREATE OR REPLACE FUNCTION public.network_people_rollup(")
  );

  it("breaks ties on a unique column, so OFFSET cannot repeat or skip a person", () => {
    // Two people on the same score have no defined order without this, and
    // the pager looks perfectly fine while dropping somebody.
    const order = paged.slice(paged.indexOf("ORDER BY"), paged.indexOf("LIMIT"));
    expect(order).toMatch(/f\.profile_id\s*$/m);
  });

  it("never lets a query-string sort key reach SQL unchecked", () => {
    // The allowlist in parseListParams is not the last line of defence: the
    // function compares p_sort to literals and falls through to the tiebreak.
    expect(paged).toMatch(/CASE WHEN p_sort = 'best_score'/);
    expect(paged).not.toMatch(/EXECUTE|format\(/);
  });

  it("asks for one row beyond the page, and the reader trims it", () => {
    expect(AGGREGATOR).toMatch(/p_limit: input\.perPage \+ 1/);
    expect(AGGREGATOR).toMatch(/rows\.length > input\.perPage/);
  });

  it("gathers appearances for the page only", () => {
    // The gather is correlated to the PAGE's rows, not to the fold: that
    // correlation is the whole difference between 13 KB and 42 MB.
    const at = paged.indexOf("WITH page AS (");
    const gathered = paged.indexOf("AS appearances");
    expect(gathered).toBeGreaterThan(at);
    expect(paged).toMatch(/WHERE c\.network_profile_id = pg\.profile_id/);
  });
});

describe("the figures describe the pool, not the page (D2)", () => {
  it("reads the same fold the table reads, with the same filters", () => {
    const rollup = SQL.slice(
      SQL.indexOf("CREATE OR REPLACE FUNCTION public.network_people_rollup("),
      SQL.indexOf("CREATE OR REPLACE FUNCTION public.network_domains(")
    );
    expect(rollup).toMatch(
      /FROM public\.network_people_folded\(\s*p_q, p_archetype, p_tier, p_domain, p_stage, p_years\)/
    );
  });

  it("puts the rollup on the page's header and tiles, never the loaded rows", () => {
    // Bound to the header element itself. "PAGE mentions rollup.total" passed
    // while the headline read `page.people.length` — under paging, 25 rows
    // wearing the word "network".
    const header = PAGE.slice(PAGE.indexOf("<header"), PAGE.indexOf("</header>"));
    expect(header).toContain("rollup.total");
    expect(header).toContain("rollup.returning");
    expect(header).not.toContain("page.people");

    expect(PAGE).toMatch(/AnalyticsBlock rollup=\{rollup\}/);
    expect(PAGE).not.toMatch(/computeAnalytics/);
  });

  it("offers every domain in the pool to the filter, not this page's", () => {
    expect(SQL).toMatch(/CREATE OR REPLACE FUNCTION public\.network_domains\(/);
    expect(PAGE).toMatch(/options: page\.domains\.map/);
  });

  it("still says how many rows have no person yet", () => {
    expect(SQL).toMatch(/'people_pending'/);
    expect(PAGE).toMatch(/rollup\.people_pending > 0/);
  });
});

describe("every filter the page offers is applied in SQL", () => {
  const FILTERS = ["archetype", "tier", "domain", "stage", "years"];

  it("passes each one from the URL to the function", () => {
    for (const key of FILTERS) {
      expect(PAGE, key).toContain(`params.filters.${key}`);
      expect(AGGREGATOR, key).toContain(`p_${key}: f.${key} || null`);
    }
    expect(AGGREGATOR).toContain("p_q: f.q?.trim() || null");
  });

  it("narrows on each one in the fold", () => {
    expect(SQL).toMatch(/p_archetype IS NULL OR p\.archetype = p_archetype/);
    expect(SQL).toMatch(/p_domain\s+IS NULL OR p\.domain = p_domain/);
    expect(SQL).toMatch(/p_stage\s+IS NULL OR p_stage = ANY/);
    expect(SQL).toMatch(/p_tier\s+IS NULL OR p\.best_tier_rank =/);
    expect(SQL).toMatch(/p_years IS NULL OR CASE p_years/);
  });

  it("searches the five fields the box promises, against indexed columns", () => {
    const matched = SQL.slice(SQL.indexOf("matched AS ("), SQL.indexOf("base AS ("));
    for (const field of [
      "c.full_name ILIKE",
      "c.current_title ILIKE",
      "c.current_company ILIKE",
      "(c.cv_structured ->> 'domain') ILIKE",
      "((c.cv_structured -> 'tech_exposure')::text) ILIKE",
    ]) {
      expect(matched, field).toContain(field);
    }
    // 617 ms per keystroke unindexed was the measurement that bought these.
    for (const index of [
      "candidates_full_name_trgm",
      "candidates_current_title_trgm",
      "candidates_current_company_trgm",
      "candidates_cv_domain_trgm",
      "candidates_cv_tech_trgm",
    ]) {
      expect(SQL, index).toContain(index);
    }
  });
});

describe("the cap and its client-side machinery are gone", () => {
  it("has no row window left anywhere", () => {
    expect(AGGREGATOR).not.toContain("CANDIDATE_ROW_CAP");
    expect(PAGE).not.toContain("truncated");
    expect(PAGE).not.toContain("rows_considered");
  });

  it("leaves no second toolbar filtering one page behind the first", () => {
    // A search box over 25 rows beside a header counting the whole pool is
    // two answers to one question on one screen.
    //
    // Bound to NetworkTable's OWN body: the card below it legitimately holds
    // state (whether its relationship panel is open), so a file-wide "no
    // useState" assertion would be both wrong and easy to satisfy by moving
    // the state one function down.
    const body = TABLE.slice(
      TABLE.indexOf("export function NetworkTable("),
      TABLE.indexOf("function NetworkCard(")
    );
    expect(body).not.toMatch(/useState|useMemo/);
    expect(body).not.toMatch(/\.filter\(|\.sort\(|\.slice\(/);
    expect(body).not.toMatch(/type="search"/);
    expect(TABLE).not.toMatch(/slice\(\s*\(currentPage/);
  });

  it("keeps the page's state in the URL, like every other list", () => {
    expect(PAGE).toMatch(/parseListParams\(/);
    expect(PAGE).toMatch(/rangeFor\(params\)/);
    expect(PAGE).toMatch(/<Pagination/);
    expect(PAGE).toMatch(/<ListToolbar/);
  });

  it("fetches the relationship overlay for the page's people only", () => {
    expect(PAGE).toMatch(
      /loadRelationshipProfiles\(page\.people\.map\(\(p\) => p\.profile_id\)\)/
    );
  });
});

describe("scope (D4)", () => {
  it("keeps every function SECURITY INVOKER, so RLS still scopes the org", () => {
    // 045's comment: a DEFINER function here aggregates one organisation's
    // pool into another's count.
    expect(SQL).not.toMatch(/SECURITY\s+DEFINER/i);
    expect(SQL.match(/LANGUAGE sql\s+STABLE/g)?.length).toBe(4);
  });

  it("grants the ruled roles and revokes anon on every function", () => {
    for (const fn of [
      "network_people_folded",
      "network_people",
      "network_people_rollup",
      "network_domains",
    ]) {
      const revokes = SQL.match(
        new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}\\([^)]*\\) FROM public, anon`)
      );
      expect(revokes, `revoke missing for ${fn}`).not.toBeNull();
      const grants = SQL.match(
        new RegExp(
          `GRANT EXECUTE ON FUNCTION public\\.${fn}\\([^)]*\\) TO authenticated, service_role`
        )
      );
      expect(grants, `grant missing for ${fn}`).not.toBeNull();
    }
    expect(SQL).not.toMatch(/TO anon/);
  });

  it("writes nothing — this slice is a read path", () => {
    expect(SQL).not.toMatch(/\bINSERT INTO\b|\bUPDATE\b\s+public\.|\bDELETE FROM\b/);
  });
});
