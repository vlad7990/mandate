// Search aperture — what a sourcing run actually reached.
//
// Design: docs/superpowers/specs/2026-08-12-sourcing-runs-design.md
//
// This is the deterministic half of coverage analysis. The app computes WHERE
// the search landed; the agent only says what that implies and what to widen.
// Same division of labour as risk-signals.ts ↔ executive-risk-synthesis-agent:
// facts here, wording there. A model asked to both observe and interpret will
// confidently observe things that are not in the data.
//
// ── The dimension enum is a compliance boundary, not a tidiness preference ──
//
// Coverage analysis widens a funnel STRUCTURALLY: titles, companies,
// industries, geography, seniority bands, over-tight exclusions. It never
// analyses or targets protected characteristics. That is live legal exposure in
// both major markets — Title VII in the US, Art. 9 special-category processing
// under GDPR — and it contradicts the guardrail already shipped in
// ROLE_ARCHITECT_SYSTEM_PROMPT.
//
// Enforcing it as a closed enum rather than a prompt instruction means the
// model cannot express the disallowed shape at all. Two further things follow,
// and both are deliberate:
//
//   1. The aperture summary below carries ONLY titles, companies and
//      locations. The agent cannot infer demography from data it never
//      receives, so the guarantee does not rest on the model's compliance.
//   2. normalizeCoverageAnalysis() drops any finding whose dimension is not in
//      the enum, so a model that invents one is silently ignored rather than
//      trusted.

/** The only dimensions coverage analysis may reason about. Closed on purpose. */
export const COVERAGE_DIMENSIONS = [
  "titles",
  "companies",
  "industries",
  "geography",
  "seniority",
  "exclusions",
] as const;

export type CoverageDimension = (typeof COVERAGE_DIMENSIONS)[number];

export function isCoverageDimension(v: unknown): v is CoverageDimension {
  return (
    typeof v === "string" &&
    (COVERAGE_DIMENSIONS as readonly string[]).includes(v)
  );
}

/** One observed value and how often the run returned it. */
export type ApertureBucket = {
  value: string;
  count: number;
  /** Share of rows carrying a value for this facet, 0–1. */
  share: number;
};

export type ApertureSummary = {
  total_rows: number;
  companies: ApertureBucket[];
  titles: ApertureBucket[];
  locations: ApertureBucket[];
  /**
   * Rows missing each facet. A run whose export carried no location column
   * cannot support a geography finding, and the agent needs to know that
   * rather than concluding the search was geographically narrow.
   */
  missing: { companies: number; titles: number; locations: number };
  /**
   * Share held by the single most common company, 0–1, or null when no row
   * carried one. The clearest single signal of a narrow aperture: eight names
   * all from one employer is a different problem from eight from eight.
   */
  top_company_share: number | null;
  distinct_companies: number;
  distinct_locations: number;
};

export type ApertureRow = {
  current_company: string | null;
  current_title: string | null;
  location: string | null;
};

/** Buckets beyond this are noise in a prompt and cost tokens to no purpose. */
const MAX_BUCKETS = 12;

function normalizeValue(v: string | null): string | null {
  const t = (v ?? "").trim();
  return t.length > 0 ? t : null;
}

function bucket(values: Array<string | null>): {
  buckets: ApertureBucket[];
  missing: number;
  distinct: number;
} {
  const counts = new Map<string, { display: string; count: number }>();
  let present = 0;
  let missing = 0;

  for (const raw of values) {
    const value = normalizeValue(raw);
    if (!value) {
      missing++;
      continue;
    }
    present++;
    // Case-folded so "BMO" and "bmo" are one employer, but the first spelling
    // seen is what gets shown back to the recruiter.
    const key = value.toLowerCase();
    const existing = counts.get(key);
    if (existing) existing.count++;
    else counts.set(key, { display: value, count: 1 });
  }

  const buckets = [...counts.values()]
    .sort((a, b) => b.count - a.count || a.display.localeCompare(b.display))
    .slice(0, MAX_BUCKETS)
    .map((c) => ({
      value: c.display,
      count: c.count,
      share: present > 0 ? c.count / present : 0,
    }));

  return { buckets, missing, distinct: counts.size };
}

/**
 * Summarise what a run's results actually contained.
 *
 * Only the three facets the dimension enum can act on. Nothing here carries a
 * name, an email, or a profile URL: this summary goes into a prompt, and the
 * less personal data crosses that boundary the better — the analysis is about
 * the shape of the search, not about the people it found.
 */
export function summariseAperture(
  rows: readonly ApertureRow[]
): ApertureSummary {
  const companies = bucket(rows.map((r) => r.current_company));
  const titles = bucket(rows.map((r) => r.current_title));
  const locations = bucket(rows.map((r) => r.location));

  const companiesPresent = rows.length - companies.missing;

  return {
    total_rows: rows.length,
    companies: companies.buckets,
    titles: titles.buckets,
    locations: locations.buckets,
    missing: {
      companies: companies.missing,
      titles: titles.missing,
      locations: locations.missing,
    },
    top_company_share:
      companiesPresent > 0 && companies.buckets.length > 0
        ? companies.buckets[0].count / companiesPresent
        : null,
    distinct_companies: companies.distinct,
    distinct_locations: locations.distinct,
  };
}

/**
 * Whether there is enough here to analyse at all.
 *
 * A run that returned four rows cannot support "your search is concentrated in
 * two employers" — that is a description of four rows, not a finding about the
 * strategy. Same reasoning as the conversion guard: the cost of a confident
 * wrong answer is a recruiter rewriting a working search.
 */
export const MIN_ROWS_FOR_ANALYSIS = 8;

export function canAnalyseAperture(summary: ApertureSummary): boolean {
  return summary.total_rows >= MIN_ROWS_FOR_ANALYSIS;
}
