import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * The Network page's read path after §205 (migrations 144–148), and the seams
 * that can drift apart silently.
 *
 * The fold lives in ONE place — the `network_people_folded` view — and is read
 * two ways: the page sends PostgREST clauses for the rows it draws, and the
 * rollup runs the same predicate in SQL for the figures above them. Those two
 * expressions of one rule are the seam these guards hold, because when they
 * disagree the page counts people it does not show, which is the §175 class
 * this slice exists to end.
 *
 * Structural, so they prove only what the code SAYS. Drive 137 proved the
 * behaviour — four times over, and each time it found something no guard here
 * could have.
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

function src(rel: string): string {
  return fs
    .readFileSync(path.join(ROOT, rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/, ""))
    .join("\n");
}

/** 148 is the current definition; 146 added the search column; 144 the badge. */
const SQL = sql("148_network_page_reads_the_view.sql");
const SQL146 = sql("146_network_fold_as_a_view.sql");
const AGGREGATOR = src("src/lib/network/network-aggregator.ts");
const PAGE = src("src/app/(dashboard)/app/candidates/network/page.tsx");
const TABLE = src("src/app/(dashboard)/app/candidates/network/network-table.tsx");

const VIEW = SQL.slice(
  SQL.indexOf("CREATE OR REPLACE VIEW public.network_people_folded"),
  SQL.indexOf("COMMENT ON VIEW")
);
const ROLLUP = SQL.slice(
  SQL.indexOf("CREATE OR REPLACE FUNCTION public.network_people_rollup("),
  SQL.indexOf("COMMENT ON FUNCTION public.network_people_rollup")
);
const MATCHES = SQL146.slice(
  SQL146.indexOf("CREATE OR REPLACE FUNCTION public.network_people_matches("),
  SQL146.indexOf("COMMENT ON FUNCTION public.network_people_matches")
);

describe("the fold is one view, and it folds by the person", () => {
  it("is a VIEW the planner can inline, not a function it cannot", () => {
    // 785 ms inside a row-set function against 13 ms for the same SQL read
    // from the app, at 2,135 people (drive 137).
    expect(SQL).toMatch(
      /CREATE OR REPLACE VIEW public\.network_people_folded\s+WITH \(security_invoker = true\)/
    );
    // …and the slow second way to read the same rows is gone, not left behind.
    expect(SQL).toMatch(
      /DROP FUNCTION IF EXISTS public\.network_people\(text, text, text, text, text, text, text, text, integer, integer\)/
    );
  });

  it("groups on the person and excludes rows that have none", () => {
    expect(VIEW).toMatch(/c\.network_profile_id AS pid/);
    // §196/139 + §204 D2: no person yet is not a person.
    expect(VIEW).toMatch(/WHERE c\.network_profile_id IS NOT NULL/);
    expect(VIEW).toMatch(/GROUP BY b\.pid/);
  });

  it("keeps the canonical record as the newest one (D3)", () => {
    expect(VIEW).toMatch(
      /PARTITION BY c\.network_profile_id ORDER BY c\.updated_at DESC/
    );
    expect(VIEW).toMatch(/FILTER \(WHERE b\.rn = 1\)/);
  });

  it("ranks tier_1 above tier_4 rather than alphabetically", () => {
    expect(VIEW).toMatch(
      /min\(\s*CASE b\.tier WHEN 'tier_1' THEN 1 WHEN 'tier_2' THEN 2/
    );
  });

  it("keeps the search a PERSON-level question", () => {
    // Any of a person's records may match — the semantics 146 had through a
    // semijoin, in one predicate the page can send.
    expect(VIEW).toMatch(/string_agg\(b\.cv_search, ' '\) AS search_text/);
  });
});

describe("the page reads the view", () => {
  const readBlock = AGGREGATOR.slice(
    AGGREGATOR.indexOf('.from("network_people_folded")'),
    AGGREGATOR.indexOf("const [pageQ, rollupQ")
  );

  it("selects exactly the columns the row type reads, and all exist on the view", () => {
    // §205 deleted the TypeScript fold: once the page reads the view, an
    // implementation with no caller IS the drift it was meant to guard
    // against. This is the surviving seam.
    const selected = /\.select\(\s*\n?\s*"([^"]*)"/.exec(readBlock);
    expect(selected, "the page's select() on the view").not.toBeNull();
    const columns = selected![1].split(",").map((c) => c.trim()).sort();

    const typeBody = AGGREGATOR.slice(
      AGGREGATOR.indexOf("type PersonRow = {"),
      AGGREGATOR.indexOf("function num(")
    );
    const keys = [...typeBody.matchAll(/^\s{2}(\w+):/gm)].map((m) => m[1]).sort();

    expect(keys.length).toBeGreaterThan(15);
    expect(columns).toEqual(keys);
    for (const column of columns) {
      expect(VIEW, `the view is missing ${column}`).toContain(column);
    }
  });

  it("asks for one row beyond the page, and trims it", () => {
    expect(readBlock).toMatch(
      /\.range\(input\.offset, input\.offset \+ input\.perPage\)/
    );
    expect(AGGREGATOR).toMatch(/rows\.length > input\.perPage/);
  });

  it("orders by the sort key AND a unique tiebreak, in that order", () => {
    // Without a total order, two people on the same score sit in an undefined
    // relative position and OFFSET paging can show one twice or never, while
    // the pager looks perfectly fine.
    const sortAt = readBlock.indexOf("SORT_COLUMNS[input.sort]");
    const tieAt = readBlock.indexOf('.order("profile_id"');
    expect(sortAt).toBeGreaterThan(-1);
    expect(tieAt).toBeGreaterThan(sortAt);
  });

  it("gathers appearances for the page's people only, naming every FK", () => {
    const appearances = AGGREGATOR.slice(
      AGGREGATOR.indexOf("async function loadAppearances")
    );
    expect(appearances).toMatch(/\.in\("network_profile_id", profileIds\)/);
    // §158's standing lesson: a bare embed of a table with two paths to the
    // same parent nulls the whole embed.
    expect(appearances).toMatch(/projects!candidates_project_id_fkey/);
    expect(appearances).toMatch(
      /candidate_scores!candidate_scores_candidate_id_fkey/
    );
  });

  it("fetches the relationship overlay for the page's people only", () => {
    expect(PAGE).toMatch(
      /loadRelationshipProfiles\(page\.people\.map\(\(p\) => p\.profile_id\)\)/
    );
  });
});

describe("every filter the page offers is applied twice, the same way", () => {
  const FILTERS = ["archetype", "tier", "domain", "stage", "years"] as const;

  it("has a page clause and a rollup argument for each", () => {
    const clauses: Record<string, RegExp> = {
      archetype: /page\.eq\("archetype", f\.archetype\)/,
      tier: /page\.eq\("best_tier", f\.tier\)/,
      domain: /page\.eq\("domain", f\.domain\)/,
      stage: /page\.contains\("stages", \[f\.stage\]\)/,
      years: /YEARS_BUCKETS\[f\.years\]/,
    };
    for (const key of FILTERS) {
      expect(PAGE, key).toContain(`params.filters.${key}`);
      expect(AGGREGATOR, `page clause for ${key}`).toMatch(clauses[key]);
      expect(AGGREGATOR, `rollup arg for ${key}`).toContain(
        `p_${key}: f.${key} || null`
      );
    }
    expect(AGGREGATOR).toContain("p_q: q");
    expect(AGGREGATOR).toMatch(/page\.ilike\("search_text", `%\$\{q\}%`\)/);
  });

  it("narrows on each one in the rule the rollup shares", () => {
    expect(MATCHES).toMatch(/p_archetype IS NULL OR p_row_archetype = p_archetype/);
    expect(MATCHES).toMatch(/p_domain\s+IS NULL OR p_row_domain = p_domain/);
    expect(MATCHES).toMatch(/p_tier\s+IS NULL OR p_row_tier = p_tier/);
    expect(MATCHES).toMatch(/p_stage\s+IS NULL OR p_stage = ANY/);
    expect(MATCHES).toMatch(/p_years IS NULL OR CASE p_years/);
    expect(ROLLUP).toMatch(/public\.network_people_matches\(v\.archetype/);
  });

  it("treats a person with no stated experience as 0 years, on both sides", () => {
    // `coalesce(years, 0)` in SQL; the page has to say the same thing or the
    // first bucket silently loses everybody whose CV omits it.
    expect(AGGREGATOR).toMatch(/years_experience\.is\.null,years_experience\.lte/);
    expect(MATCHES).toMatch(/coalesce\(p_row_years, 0\) <= 5/);
  });

  it("searches the five fields the box promises, from one indexed column", () => {
    // The five-way OR across five indexes planned as a Seq Scan (EXPLAIN,
    // drive 137) and detoasted a 15 KB CV per row: 403 ms. One generated
    // column with one GIN index: 1 ms.
    const column = SQL146.slice(
      SQL146.indexOf("ADD COLUMN IF NOT EXISTS cv_search"),
      SQL146.indexOf("COMMENT ON COLUMN public.candidates.cv_search")
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
    expect(SQL146).toMatch(
      /CREATE INDEX IF NOT EXISTS candidates_cv_search_trgm\s+ON public\.candidates USING gin \(cv_search extensions\.gin_trgm_ops\)/
    );
    for (const index of [
      "candidates_full_name_trgm",
      "candidates_cv_domain_trgm",
      "candidates_cv_tech_trgm",
    ]) {
      expect(SQL146, index).toContain(`DROP INDEX IF EXISTS public.${index}`);
    }
  });
});

describe("the figures describe the pool, not the page (D2)", () => {
  it("aggregates the view with a custom plan per call", () => {
    // As a plain SQL function the same aggregate took 835 ms at 2,135 people
    // and 12 ms this way: the filters arrive as parameters, and a generic plan
    // cannot prune what a NULL filter makes irrelevant.
    expect(ROLLUP).toMatch(/LANGUAGE plpgsql/);
    expect(ROLLUP).toMatch(/EXECUTE format\(/);
    expect(ROLLUP).toMatch(
      /USING '%' \|\| lower\(btrim\(coalesce\(p_q, ''\)\)\) \|\| '%'/
    );
    expect(ROLLUP).toMatch(/FROM public\.network_people_folded v/);
  });

  it("never puts caller text into the statement", () => {
    // Dynamic SQL is safe here because the fragments are FIXED and chosen by
    // comparing parameters to NULL; the values are bound. A single `|| p_` in
    // the WHERE builder would end that.
    const builder = ROLLUP.slice(0, ROLLUP.indexOf("EXECUTE format("));
    expect(builder).toMatch(
      /v_where := v_where \|\| ' AND v\.search_text LIKE \$1'/
    );
    expect(builder).not.toMatch(/\|\|\s*p_(q|archetype|tier|domain|stage|years)\b/);
  });

  it("puts the rollup on the page's header and tiles, never the loaded rows", () => {
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
    expect(ROLLUP).toMatch(/'people_pending'/);
    expect(PAGE).toMatch(/rollup\.people_pending > 0/);
  });
});

describe("the cap and its client-side machinery are gone", () => {
  it("has no row window left anywhere", () => {
    expect(AGGREGATOR).not.toContain("CANDIDATE_ROW_CAP");
    expect(PAGE).not.toContain("truncated");
    expect(PAGE).not.toContain("rows_considered");
  });

  it("leaves no second toolbar filtering one page behind the first", () => {
    // Bound to NetworkTable's OWN body: the card below it legitimately holds
    // state (whether its relationship panel is open).
    const body = TABLE.slice(
      TABLE.indexOf("export function NetworkTable("),
      TABLE.indexOf("function NetworkCard(")
    );
    expect(body).not.toMatch(/useState|useMemo/);
    expect(body).not.toMatch(/\.filter\(|\.sort\(|\.slice\(/);
    expect(body).not.toMatch(/type="search"/);
  });

  it("keeps the page's state in the URL, like every other list", () => {
    expect(PAGE).toMatch(/parseListParams\(/);
    expect(PAGE).toMatch(/rangeFor\(params\)/);
    expect(PAGE).toMatch(/<Pagination/);
    expect(PAGE).toMatch(/<ListToolbar/);
  });
});

describe("scope (D4)", () => {
  it("is SECURITY INVOKER throughout, so RLS still scopes the org", () => {
    // 045's comment: a DEFINER function here aggregates one organisation's pool
    // into another's count. A VIEW needs saying out loud — it runs as its OWNER
    // unless told otherwise, which would hand over the whole table.
    expect(SQL).not.toMatch(/SECURITY\s+DEFINER/i);
    expect(SQL).toMatch(/WITH \(security_invoker = true\)/);
  });

  it("grants the ruled roles and revokes anon", () => {
    expect(SQL).toMatch(
      /REVOKE ALL ON public\.network_people_folded FROM public, anon/
    );
    expect(SQL).toMatch(
      /GRANT SELECT ON public\.network_people_folded TO authenticated, service_role/
    );
    expect(SQL).toMatch(
      /REVOKE ALL ON FUNCTION public\.network_people_rollup\([^)]*\) FROM public, anon/
    );
    expect(SQL).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.network_people_rollup\([^)]*\) TO authenticated, service_role/
    );
    expect(SQL).not.toMatch(/TO anon/);
  });

  it("writes nothing — this slice is a read path", () => {
    expect(SQL).not.toMatch(/\bINSERT INTO\b|\bUPDATE\b\s+public\.|\bDELETE FROM\b/);
    // The one schema change, in 146, is a DERIVED column: generated, never
    // written to.
    expect(SQL146).toMatch(/GENERATED ALWAYS AS/);
    expect(SQL146).not.toMatch(/\bINSERT INTO\b|\bDELETE FROM\b/);
  });
});
