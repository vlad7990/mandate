import { describe, expect, test } from "vitest";
import {
  canAnalyseAperture,
  COVERAGE_DIMENSIONS,
  isCoverageDimension,
  MIN_ROWS_FOR_ANALYSIS,
  summariseAperture,
  type ApertureRow,
} from "./coverage";

function row(overrides: Partial<ApertureRow> = {}): ApertureRow {
  return {
    current_company: "BMO Capital Markets",
    current_title: "Director, Technology Operations",
    location: "Toronto",
    ...overrides,
  };
}

describe("the dimension enum", () => {
  test("is exactly the six structural facets", () => {
    expect([...COVERAGE_DIMENSIONS]).toEqual([
      "titles",
      "companies",
      "industries",
      "geography",
      "seniority",
      "exclusions",
    ]);
  });

  test("rejects demographic dimensions outright", () => {
    // The enum IS the guarantee — a prompt instruction can be argued with, a
    // missing enum value cannot be expressed. Title VII / GDPR Art. 9.
    for (const bad of [
      "gender",
      "ethnicity",
      "age",
      "nationality",
      "diversity",
      "demographics",
      "disability",
      "religion",
    ]) {
      expect(isCoverageDimension(bad)).toBe(false);
    }
  });

  test("rejects non-strings", () => {
    expect(isCoverageDimension(null)).toBe(false);
    expect(isCoverageDimension(7)).toBe(false);
    expect(isCoverageDimension({ dimension: "titles" })).toBe(false);
  });
});

describe("summariseAperture", () => {
  test("counts employers and reports the concentration", () => {
    const summary = summariseAperture([
      ...Array.from({ length: 6 }, () => row({ current_company: "BMO" })),
      ...Array.from({ length: 2 }, () => row({ current_company: "Scotiabank" })),
    ]);

    expect(summary.total_rows).toBe(8);
    expect(summary.companies[0]).toMatchObject({ value: "BMO", count: 6 });
    expect(summary.top_company_share).toBeCloseTo(0.75);
    expect(summary.distinct_companies).toBe(2);
  });

  test("folds case so one employer is not counted as several", () => {
    const summary = summariseAperture([
      row({ current_company: "BMO" }),
      row({ current_company: "bmo" }),
      row({ current_company: "  BMO  " }),
    ]);
    expect(summary.distinct_companies).toBe(1);
    expect(summary.companies[0].count).toBe(3);
    // First spelling seen is what the recruiter is shown back.
    expect(summary.companies[0].value).toBe("BMO");
  });

  test("reports missing facets rather than treating them as narrowness", () => {
    // A run whose export had no location column must not produce "your search
    // is geographically narrow" — it produced no geography data at all.
    const summary = summariseAperture([
      row({ location: null }),
      row({ location: null }),
      row({ location: "" }),
    ]);
    expect(summary.missing.locations).toBe(3);
    expect(summary.locations).toEqual([]);
    expect(summary.distinct_locations).toBe(0);
  });

  test("share is of rows that HAVE the facet, not of all rows", () => {
    const summary = summariseAperture([
      row({ current_company: "BMO" }),
      row({ current_company: "BMO" }),
      row({ current_company: null }),
      row({ current_company: null }),
    ]);
    // 2 of the 2 rows that named an employer, not 2 of 4.
    expect(summary.companies[0].share).toBeCloseTo(1);
    expect(summary.top_company_share).toBeCloseTo(1);
  });

  test("carries no personal data into the summary", () => {
    // The summary is prompt input. Names, emails and profile URLs have no
    // business crossing that boundary — the analysis is about the shape of the
    // search, not about the people it found.
    const summary = summariseAperture([row(), row()]);
    const serialised = JSON.stringify(summary);
    expect(serialised).not.toMatch(/@/);
    expect(serialised).not.toMatch(/linkedin\.com/);
    expect(Object.keys(summary)).not.toContain("full_name");
  });

  test("handles an empty run without dividing by zero", () => {
    const summary = summariseAperture([]);
    expect(summary.total_rows).toBe(0);
    expect(summary.top_company_share).toBeNull();
    expect(summary.companies).toEqual([]);
  });

  test("caps buckets so a wide run cannot flood the prompt", () => {
    const summary = summariseAperture(
      Array.from({ length: 40 }, (_, i) => row({ current_company: `Employer ${i}` }))
    );
    expect(summary.companies.length).toBeLessThanOrEqual(12);
    // The true distinct count survives the cap — the cap is a display limit,
    // not a miscount.
    expect(summary.distinct_companies).toBe(40);
  });
});

describe("canAnalyseAperture", () => {
  test("refuses to analyse a run too small to say anything about", () => {
    // "Concentrated in two employers" across four rows describes four rows,
    // not a strategy. Same reasoning as the conversion guard.
    const tiny = summariseAperture(Array.from({ length: 4 }, () => row()));
    expect(canAnalyseAperture(tiny)).toBe(false);

    const enough = summariseAperture(
      Array.from({ length: MIN_ROWS_FOR_ANALYSIS }, () => row())
    );
    expect(canAnalyseAperture(enough)).toBe(true);
  });
});
