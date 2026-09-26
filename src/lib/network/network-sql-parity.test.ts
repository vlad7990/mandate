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
/** Comments stripped before asserting about code — §202's lesson. */
function sql(file: string): string {
  return fs
    .readFileSync(path.join(ROOT, "supabase", "migrations", file), "utf8")
    .split("\n")
    .map((l) => l.replace(/--.*$/, ""))
    .join("\n");
}

/**
 * 146 supersedes 145's fold: the function became a VIEW because Postgres
 * could not inline the function, and five trigram indexes became one
 * generated column because a five-way OR planned as a Seq Scan. Drive 137
 * measured both. The guards read the CURRENT definition; 145 stays history.
 */
const SQL = sql("146_network_fold_as_a_view.sql");

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

  it("is a VIEW, so the planner folds it into the caller rather than materialising every person", () => {
    // As a function this was a `Function Scan`: 830 ms at 2,135 people
    // against 8 ms for the same SQL as a view (drive 137).
    expect(SQL).toMatch(
      /CREATE OR REPLACE VIEW public\.network_people_folded\s+WITH \(security_invoker = true\)/
    );
    expect(SQL).toMatch(
      /DROP FUNCTION IF EXISTS public\.network_people_folded\(/
    );
  });

  it("groups on the person and excludes rows that have none", () => {
    // Bound to the view's inner scan, not the file: `network_profile_id`
    // appears in several places, and asserting it anywhere proves the
    // vocabulary exists and nothing about what the fold groups on. Mutation
    // testing caught exactly that — §202's lesson, fourth costume.
    const view = SQL.slice(
      SQL.indexOf("CREATE OR REPLACE VIEW public.network_people_folded"),
      SQL.indexOf("COMMENT ON VIEW")
    );
    expect(view).toMatch(/c\.network_profile_id AS pid/);
    // §196/139 + §204 D2: no person yet is not a person.
    expect(view).toMatch(/WHERE c\.network_profile_id IS NOT NULL/);
    expect(view).toMatch(/GROUP BY b\.pid/);
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
  it("reads the same fold and the same predicate the table reads", () => {
    const rollup = SQL.slice(
      SQL.indexOf("CREATE OR REPLACE FUNCTION public.network_people_rollup("),
      SQL.indexOf("COMMENT ON FUNCTION public.network_people_rollup")
    );
    expect(rollup).toMatch(/FROM public\.network_people_folded v/);
    expect(rollup).toMatch(/public\.network_people_matches\(/);
    // The search is a semijoin in both callers; it must be the SAME one.
    const searchLine = /m\.cv_search LIKE '%' \|\| lower\(btrim\(p_q\)\) \|\| '%'/;
    expect(rollup).toMatch(searchLine);
    const paged = SQL.slice(
      SQL.indexOf("CREATE OR REPLACE FUNCTION public.network_people("),
      SQL.indexOf("COMMENT ON FUNCTION public.network_people(")
    );
    expect(paged).toMatch(searchLine);
    expect(paged).toMatch(/public\.network_people_matches\(/);
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
    expect(sql("145_network_fold_in_postgres.sql")).toMatch(
      /CREATE OR REPLACE FUNCTION public\.network_domains\(/
    );
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

  it("narrows on each one, in the rule both callers share", () => {
    const matches = SQL.slice(
      SQL.indexOf("CREATE OR REPLACE FUNCTION public.network_people_matches("),
      SQL.indexOf("COMMENT ON FUNCTION public.network_people_matches")
    );
    expect(matches).toMatch(/p_archetype IS NULL OR p_row_archetype = p_archetype/);
    expect(matches).toMatch(/p_domain\s+IS NULL OR p_row_domain = p_domain/);
    expect(matches).toMatch(/p_tier\s+IS NULL OR p_row_tier = p_tier/);
    expect(matches).toMatch(/p_stage\s+IS NULL OR p_stage = ANY/);
    expect(matches).toMatch(/p_years IS NULL OR CASE p_years/);
  });

  it("searches the five fields the box promises, from one indexed column", () => {
    // The five-way OR across five indexes planned as a Seq Scan (EXPLAIN,
    // drive 137) and detoasted a 15 KB CV per row: 403 ms. One generated
    // column with one GIN index: 1 ms.
    const column = SQL.slice(
      SQL.indexOf("ADD COLUMN IF NOT EXISTS cv_search"),
      SQL.indexOf("COMMENT ON COLUMN public.candidates.cv_search")
    );
    for (const field of [
      "full_name",
      "current_title",
      "current_company",
      "cv_structured ->> 'domain'",
      "(cv_structured -> 'tech_exposure')::text",
    ]) {
      expect(column, field).toContain(field);
    }
    expect(column).toContain("STORED");
    expect(column).toContain("lower(");
    expect(SQL).toMatch(
      /CREATE INDEX IF NOT EXISTS candidates_cv_search_trgm\s+ON public\.candidates USING gin \(cv_search extensions\.gin_trgm_ops\)/
    );
    // …and the superseded five are dropped rather than left to slow writes.
    for (const index of [
      "candidates_full_name_trgm",
      "candidates_current_title_trgm",
      "candidates_current_company_trgm",
      "candidates_cv_domain_trgm",
      "candidates_cv_tech_trgm",
    ]) {
      expect(SQL, index).toContain(`DROP INDEX IF EXISTS public.${index}`);
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
    // pool into another's count. The view needs saying explicitly — a view
    // runs as its OWNER unless it is told otherwise, which would leak the
    // whole table past RLS.
    expect(SQL).not.toMatch(/SECURITY\s+DEFINER/i);
    expect(SQL).toMatch(/WITH \(security_invoker = true\)/);
    expect(SQL.match(/LANGUAGE sql\s+(STABLE|IMMUTABLE)/g)?.length).toBe(3);
  });

  it("grants the ruled roles and revokes anon on every function", () => {
    for (const fn of ["network_people", "network_people_rollup"]) {
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
    // and the view itself
    expect(SQL).toMatch(/REVOKE ALL ON public\.network_people_folded FROM public, anon/);
    expect(SQL).toMatch(
      /GRANT SELECT ON public\.network_people_folded TO authenticated, service_role/
    );
  });

  it("writes nothing — this slice is a read path", () => {
    expect(SQL).not.toMatch(/\bINSERT INTO\b|\bUPDATE\b\s+public\.|\bDELETE FROM\b/);
    // The one schema change is a DERIVED column: generated, never written.
    expect(SQL).toMatch(/GENERATED ALWAYS AS/);
  });
});
