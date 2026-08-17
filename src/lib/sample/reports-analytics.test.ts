import { describe, expect, it } from "vitest";
import { SAMPLE_CANDIDATES, SAMPLE_MANDATES } from "./data";
import { SAMPLE_MANDATE_ID } from "./mandate-modules";
import {
  DIMENSIONS,
  SAMPLE_COMPARISON,
  SAMPLE_TRADE_OFF,
  currentWeights,
  sampleRanking,
  samplePortfolio,
  sampleUnranked,
} from "./reports-analytics";

/**
 * The leaderboard, the comparison and the portfolio are all projections of
 * numbers that live elsewhere, and the ways they can quietly stop agreeing
 * are arithmetic rather than structural — which is exactly the kind of drift
 * nobody notices in a demo.
 *
 * The one that matters most: a candidate's `fit` is on the mandate list, the
 * candidate list and the client slate. If the leaderboard's overall column
 * disagrees with it, a prospect clicking between two screens sees the same
 * person scored twice, differently.
 */

const ranked = sampleRanking(SAMPLE_MANDATE_ID);

describe("sample ranking and comparison", () => {
  it("scores somebody", () => {
    expect(ranked.length).toBeGreaterThanOrEqual(5);
  });

  it("computes an overall that agrees with the candidate's own fit", () => {
    // `fit` is the rounded weighted score. Every other screen shows `fit`;
    // this one shows the weighted mean. They have to be the same number.
    for (const r of ranked) {
      expect(Math.round(r.overall * 10), `${r.candidate.name}`).toBe(
        r.candidate.fit
      );
    }
  });

  it("weights against the current calibration model, which sums to 100", () => {
    const weights = currentWeights();
    expect(Object.keys(weights).sort()).toEqual([...DIMENSIONS].sort());
    expect(Object.values(weights).reduce((n, w) => n + w, 0)).toBe(100);
  });

  it("ranks in descending order with no gaps", () => {
    expect(ranked.map((r) => r.rank)).toEqual(
      ranked.map((_, i) => i + 1)
    );
    for (let i = 1; i < ranked.length; i++) {
      expect(ranked[i].overall).toBeLessThanOrEqual(ranked[i - 1].overall);
    }
  });

  it("agrees with the tier on the candidate row", () => {
    // A leaderboard that ranks somebody first and labels them Tier 2 is
    // reporting two different judgements about the same person.
    for (const r of ranked) {
      expect(r.tier).toBe(r.candidate.tier);
    }
    // And the ordering must not put a worse tier above a better one.
    for (let i = 1; i < ranked.length; i++) {
      expect(ranked[i].tier).toBeGreaterThanOrEqual(ranked[i - 1].tier);
    }
  });

  it("gives every score its evidence", () => {
    // The rule `sample-candidate-detail.tsx` set and this surface exists to
    // demonstrate at scale: thirty scores, thirty facts.
    for (const r of ranked) {
      for (const d of DIMENSIONS) {
        expect(r.evidence[d]?.trim().length, `${r.candidate.name} / ${d}`).
          toBeGreaterThan(10);
      }
    }
  });

  it("leaves unscored candidates out of the ranking and in the pending list", () => {
    const rankedIds = new Set(ranked.map((r) => r.candidate.id));
    for (const c of sampleUnranked(SAMPLE_MANDATE_ID)) {
      expect(rankedIds.has(c.id)).toBe(false);
      expect(c.fit).toBeNull();
    }
    const total = SAMPLE_CANDIDATES.filter(
      (c) => c.mandateId === SAMPLE_MANDATE_ID
    ).length;
    expect(ranked.length + sampleUnranked(SAMPLE_MANDATE_ID).length).toBe(total);
  });

  it("compares three candidates who are all on the leaderboard", () => {
    const rankedIds = new Set(ranked.map((r) => r.candidate.id));
    for (const id of SAMPLE_TRADE_OFF.candidateIds) {
      expect(rankedIds.has(id), `${id} is not ranked`).toBe(true);
    }
  });

  it("makes every callout name a real dimension and direction", () => {
    for (const c of SAMPLE_TRADE_OFF.callouts) {
      expect(DIMENSIONS).toContain(c.dimension);
      expect(["stronger", "weaker"]).toContain(c.direction);
      expect(
        SAMPLE_TRADE_OFF.candidateIds as readonly string[]
      ).toContain(c.candidateId);
    }
  });

  it("quotes scores in the partner take that match the leaderboard", () => {
    // The take spells three numbers out in prose. Prose cannot derive, so
    // the numbers it depends on are pinned — the same technique the W3
    // fixture uses for the two counts written out in sentences.
    const top = ranked.slice(0, 3).map((r) => r.overall.toFixed(2));
    for (const n of top) {
      expect(
        SAMPLE_COMPARISON.partnerTake.includes(n),
        `${n} is not in the partner take`
      ).toBe(true);
    }
  });

  it("counts the tiers the way the reality statement says it does", () => {
    // The statement spells the tier split out in prose and the tier band
    // tiles count it from the rows. An earlier draft said "two at Tier 2"
    // beside a table showing three — caught in a screenshot, not by a test,
    // which is why there is one now.
    const t1 = ranked.filter((r) => r.tier === 1).length;
    const t2 = ranked.filter((r) => r.tier === 2).length;
    expect(t1).toBe(2);
    expect(t2).toBe(3);
    expect(SAMPLE_COMPARISON.realityStatement).toContain("Two land at Tier 1");
    expect(SAMPLE_COMPARISON.realityStatement).toContain("three at Tier 2");
    expect(SAMPLE_COMPARISON.realityStatement).toContain(String(ranked.length));
  });

  it("puts only ranked candidates on the recommended slates", () => {
    const rankedIds = new Set(ranked.map((r) => r.candidate.id));
    for (const id of [
      ...SAMPLE_COMPARISON.primarySlate,
      ...SAMPLE_COMPARISON.backupSlate,
    ]) {
      expect(rankedIds.has(id), `${id} is on a slate but not ranked`).toBe(true);
    }
    // Primary should not be weaker than backup — a slate that recommends a
    // lower-scored candidate first needs a reason, and the sample has none.
    const scoreOf = (id: string) =>
      ranked.find((r) => r.candidate.id === id)!.overall;
    const worstPrimary = Math.min(...SAMPLE_COMPARISON.primarySlate.map(scoreOf));
    const bestBackup = Math.max(...SAMPLE_COMPARISON.backupSlate.map(scoreOf));
    expect(worstPrimary).toBeGreaterThan(bestBackup);
  });
});

describe("sample portfolio analytics", () => {
  const p = samplePortfolio();

  it("derives its totals from the mandate list", () => {
    expect(p.activeSearches).toBe(SAMPLE_MANDATES.length);
    expect(p.totalCandidates).toBe(
      SAMPLE_MANDATES.reduce((n, m) => n + m.candidates, 0)
    );
  });

  it("buckets every mandate into exactly one health state", () => {
    expect(p.byHealth.reduce((n, h) => n + h.count, 0)).toBe(
      SAMPLE_MANDATES.length
    );
    expect(p.atRisk.length).toBe(
      SAMPLE_MANDATES.filter((m) => m.health !== "on_track").length
    );
  });

  it("counts every sample candidate exactly once by stage", () => {
    expect(p.byStage.reduce((n, s) => n + s.count, 0)).toBe(
      SAMPLE_CANDIDATES.length
    );
  });

  it("has eight weeks of velocity", () => {
    expect(p.velocity).toHaveLength(8);
  });
});
