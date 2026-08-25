import { describe, expect, it } from "vitest";
import {
  FINANCIAL_METRICS,
  METRIC_LABELS,
  QUANTITATIVE_METRICS,
  elapsedFraction,
  measuredStatus,
  qualitativeStatus,
} from "./types";

describe("the metric vocabulary", () => {
  /**
   * Mirrors the `okr_metric_matches_kind` CHECK in migration 107. If
   * either side grows without the other, a key result the form offers
   * is one the database refuses — or the reverse.
   */
  it("matches the 108 CHECK, slug for slug", () => {
    expect([...QUANTITATIVE_METRICS]).toEqual([
      "candidates_added",
      "stage_moves",
      "submissions",
      "interviews",
      "offers",
      "hires",
      "placements_started",
      "placements_sourced",
      "feedback_captured",
      "weekly_velocity",
    ]);
    expect([...FINANCIAL_METRICS]).toEqual(["fees_earned", "fees_billed_forecast"]);
  });

  it("labels every metric", () => {
    for (const metric of [...QUANTITATIVE_METRICS, ...FINANCIAL_METRICS]) {
      expect(METRIC_LABELS[metric]).toBeTruthy();
    }
  });

  /**
   * R2, asserted where the vocabulary lives: no metric takes a
   * CANDIDATE as its subject. `placements_sourced` (108, D4) is
   * owner-attributed — it measures a staff member's delivery, which
   * is what the founder asked OKRs to measure — and that is the line:
   * staff delivery yes, candidates as people never.
   */
  it("holds no per-candidate metric", () => {
    for (const metric of [...QUANTITATIVE_METRICS, ...FINANCIAL_METRICS]) {
      expect(metric).not.toMatch(/candidate_(?!s_added)/);
      expect(metric).not.toMatch(/person|individual/);
    }
  });
});

describe("elapsedFraction", () => {
  it("clamps to the period", () => {
    expect(elapsedFraction("2026-01-01", "2026-12-31", "2025-06-01")).toBe(0);
    expect(elapsedFraction("2026-01-01", "2026-12-31", "2027-06-01")).toBe(1);
  });

  it("reads the midpoint as half", () => {
    expect(elapsedFraction("2026-01-01", "2026-01-31", "2026-01-16")).toBeCloseTo(0.5, 1);
  });

  it("treats a degenerate period as elapsed", () => {
    expect(elapsedFraction("2026-01-01", "2026-01-01", "2026-01-01")).toBe(1);
  });

  it("returns zero for unparseable dates rather than NaN", () => {
    expect(elapsedFraction("not a date", "2026-01-31", "2026-01-16")).toBe(0);
  });
});

describe("measuredStatus", () => {
  it("judges at_least targets against the pro-rata expectation", () => {
    // Halfway through, 6 of 12 is on pace; 4 is behind; 2 is at risk.
    expect(measuredStatus(6, 12, "at_least", 0.5)).toBe("on_track");
    expect(measuredStatus(4, 12, "at_least", 0.5)).toBe("behind");
    expect(measuredStatus(2, 12, "at_least", 0.5)).toBe("at_risk");
  });

  it("reads a full target as met whatever the date", () => {
    expect(measuredStatus(12, 12, "at_least", 0.1)).toBe("met");
    expect(measuredStatus(15, 12, "at_least", 1)).toBe("met");
  });

  it("does not pro-rate a ceiling — at_most holds or it does not", () => {
    expect(measuredStatus(3, 5, "at_most", 0.5)).toBe("on_track");
    expect(measuredStatus(6, 5, "at_most", 0.5)).toBe("behind");
  });

  it("is generous at the period's very start", () => {
    expect(measuredStatus(0, 12, "at_least", 0)).toBe("on_track");
  });
});

describe("qualitativeStatus", () => {
  it("reads attested as met", () => {
    expect(qualitativeStatus(true, 0.2)).toBe("met");
    expect(qualitativeStatus(true, 1)).toBe("met");
  });

  it("reads unattested as pending in-period and behind after it", () => {
    expect(qualitativeStatus(false, 0.6)).toBe("pending");
    expect(qualitativeStatus(false, 1)).toBe("behind");
  });
});
