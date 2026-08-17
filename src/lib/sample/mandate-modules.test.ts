import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { DIMENSION_KEYS } from "@/lib/ai/onboarding-analysis";
import { SAMPLE_CANDIDATES, sampleMandate } from "./data";
import {
  SAMPLE_CALIBRATION_HISTORY,
  SAMPLE_FEEDBACK,
  SAMPLE_HM,
  SAMPLE_MANDATE_ID,
  SAMPLE_METRICS,
  SAMPLE_MODULES,
  SAMPLE_MODULES_PENDING,
  SAMPLE_REPORTS,
  sampleFunnel,
  sampleModuleMandateExists,
} from "./mandate-modules";

/**
 * The W3 module fixtures describe one search across seven screens, and every
 * figure on them is either derived from `SAMPLE_MANDATES` or has to agree
 * with it by hand. These are the places the second kind can drift.
 *
 * The failure this guards against is not a crash — it is a demo in which the
 * mandate list says 18 candidates, the metrics funnel says 24, and the
 * weekly report names a candidate who is not in the pool. Nothing would
 * throw; the sample would simply stop being one coherent search.
 */

const ROUTES = path.resolve(
  __dirname,
  "../../app/(dashboard)/app/projects/[id]"
);

describe("sample mandate modules", () => {
  it("hangs off a mandate that exists", () => {
    expect(sampleModuleMandateExists()).toBe(true);
    expect(sampleMandate(SAMPLE_MANDATE_ID)).toBeDefined();
  });

  it("has a real route behind every module slug", () => {
    // A renamed route would leave the rail linking at a 404 — and the rail is
    // the only way into these screens.
    for (const m of [...SAMPLE_MODULES, ...SAMPLE_MODULES_PENDING]) {
      expect(
        fs.existsSync(path.join(ROUTES, m.slug, "page.tsx")),
        `no route for ${m.slug}`
      ).toBe(true);
    }
  });

  it("keeps built and pending modules disjoint", () => {
    const built = SAMPLE_MODULES.map((m) => m.slug);
    const pending = SAMPLE_MODULES_PENDING.map((m) => m.slug);
    expect(new Set([...built, ...pending]).size).toBe(built.length + pending.length);
  });

  it("pins the funnel head to the mandate's own candidate count", () => {
    const mandate = sampleMandate(SAMPLE_MANDATE_ID)!;
    const funnel = sampleFunnel();
    expect(funnel[0].stage).toBe("Sourced");
    expect(funnel[0].count).toBe(mandate.candidates);
  });

  it("never widens as it goes down the funnel", () => {
    const counts = sampleFunnel().map((f) => f.count);
    for (let i = 1; i < counts.length; i++) {
      expect(counts[i], `stage ${i} is larger than the one before`).toBeLessThanOrEqual(
        counts[i - 1]
      );
    }
  });

  it("pins the two counts that are written out in prose", () => {
    // Most figures are derived, but two sentences spell a number out: the
    // search-health paragraph on `sample-project-detail.tsx` and the first
    // search-health suggestion both say "two of the four submitted
    // candidates". Prose cannot derive, so the number it depends on is
    // pinned here instead.
    const funnel = sampleFunnel();
    expect(funnel.find((f) => f.stage === "Submitted")?.count).toBe(4);

    // The same paragraph and the metrics banner both say six days.
    expect(SAMPLE_METRICS.daysSinceLastMovement).toBe(6);
  });

  it("has calibration weights that sum to 100 in every version", () => {
    for (const s of SAMPLE_CALIBRATION_HISTORY) {
      const total = s.weights.reduce((n, w) => n + w.weight, 0);
      expect(total, `v${s.version} sums to ${total}`).toBe(100);
    }
  });

  it("uses the product's five scoring dimensions and no others", () => {
    // The scoring engine has exactly five fixed keys. The sample used to
    // invent five prose names, which read better and taught a vocabulary a
    // customer would never see again after signing up. Every calibration
    // version, and the feedback screen's weight changes, are checked —
    // drifting on one screen is how the two stopped agreeing last time.
    const expected = new Set(
      DIMENSION_KEYS.map((k) => k[0].toUpperCase() + k.slice(1))
    );

    for (const snapshot of SAMPLE_CALIBRATION_HISTORY) {
      const names = snapshot.weights.map((w) => w.name);
      expect(new Set(names)).toEqual(expected);
      expect(names.length).toBe(DIMENSION_KEYS.length);
    }
    for (const a of SAMPLE_FEEDBACK.interpreted.weightAdjustments) {
      expect(expected.has(a.dimension), `${a.dimension} is not a dimension`).toBe(true);
    }
  });

  it("orders calibration history newest first, with unique versions", () => {
    const versions = SAMPLE_CALIBRATION_HISTORY.map((s) => s.version);
    expect(versions).toEqual([...versions].sort((a, b) => b - a));
    expect(new Set(versions).size).toBe(versions.length);
  });

  it("names only dimensions that exist in the current model", () => {
    const current = new Set(SAMPLE_CALIBRATION_HISTORY[0].weights.map((w) => w.name));
    for (const s of SAMPLE_CALIBRATION_HISTORY) {
      for (const name of s.changed) {
        expect(current.has(name), `${name} is not a dimension`).toBe(true);
      }
    }
    for (const a of SAMPLE_FEEDBACK.interpreted.weightAdjustments) {
      expect(current.has(a.dimension), `${a.dimension} is not a dimension`).toBe(true);
    }
  });

  it("makes the feedback screen's weight changes match the version it claims", () => {
    // The feedback screen says "Applied as v03". If the numbers there and the
    // numbers on the calibration screen disagree, one of the two screens is
    // lying about the same event — the exact drift this file exists for.
    const v3 = SAMPLE_CALIBRATION_HISTORY.find((s) => s.version === 3)!;
    const v2 = SAMPLE_CALIBRATION_HISTORY.find((s) => s.version === 2)!;

    for (const a of SAMPLE_FEEDBACK.interpreted.weightAdjustments) {
      expect(v2.weights.find((w) => w.name === a.dimension)?.weight).toBe(a.from);
      expect(v3.weights.find((w) => w.name === a.dimension)?.weight).toBe(a.to);
    }
  });

  it("sends the client a slate of candidates that exist", () => {
    const byId = new Map(SAMPLE_CANDIDATES.map((c) => [c.id, c]));
    for (const s of SAMPLE_HM.slate) {
      const c = byId.get(s.candidateId);
      expect(c, `${s.candidateId} is not a sample candidate`).toBeDefined();
      expect(c!.name).toBe(s.name);
      expect(c!.tier).toBe(s.tier);
      expect(c!.fit).toBe(s.fit);
      expect(c!.mandateId).toBe(SAMPLE_MANDATE_ID);
    }
  });

  it("gives every candidate on the slate its evidence", () => {
    // The rule from `sample-candidate-detail.tsx`: a score never travels
    // without the fact that produced it, which is what stops a number
    // reading as a verdict. Nothing here should render a bare tier.
    for (const s of SAMPLE_HM.slate) {
      expect(s.evidence.trim().length).toBeGreaterThan(20);
    }
    for (const c of SAMPLE_REPORTS[0].topCandidates) {
      expect(c.evidence.trim().length).toBeGreaterThan(20);
    }
  });

  it("only reviews and reports candidates who are on the slate", () => {
    const onSlate = new Set<string>(SAMPLE_HM.slate.map((s) => s.name));
    for (const r of SAMPLE_HM.reviews) {
      for (const rating of r.ratings) {
        expect(onSlate.has(rating.candidate), `${rating.candidate} was not sent`).toBe(
          true
        );
      }
    }
    for (const c of SAMPLE_REPORTS[0].topCandidates) {
      expect(onSlate.has(c.name), `${c.name} is not on the slate`).toBe(true);
    }
  });

  it("orders reports newest first and numbers the weeks uniquely", () => {
    const weeks = SAMPLE_REPORTS.map((r) => r.weekNumber);
    expect(weeks).toEqual([...weeks].sort((a, b) => b - a));
    expect(new Set(weeks).size).toBe(weeks.length);

    const ages = SAMPLE_REPORTS.map((r) => r.generatedDaysAgo);
    expect(ages).toEqual([...ages].sort((a, b) => a - b));
  });

  it("keeps the report inside the search it reports on", () => {
    // Week 4 of a 90-day search that is on day 27. A report dated before the
    // mandate opened, or after it should have closed, is a fixture bug that
    // only shows up as a reader doing arithmetic.
    const mandate = sampleMandate(SAMPLE_MANDATE_ID)!;
    for (const r of SAMPLE_REPORTS) {
      expect(r.generatedDaysAgo).toBeLessThan(mandate.dayOfSearch);
      expect(r.weekNumber * 7).toBeLessThanOrEqual(mandate.searchLengthDays);
    }
  });

  it("sources candidates who are actually in the sample", () => {
    // The week-4 report names three people it sourced. They are sample
    // candidates on this mandate, so a reader can click from the report into
    // the pipeline and find them — which is the difference between a report
    // and a screenshot of one.
    const onMandate = new Set<string>(
      SAMPLE_CANDIDATES.filter((c) => c.mandateId === SAMPLE_MANDATE_ID).map(
        (c) => c.name
      )
    );
    for (const name of SAMPLE_REPORTS[0].sourcedNames) {
      expect(onMandate.has(name), `${name} is not on this mandate`).toBe(true);
    }
  });

  it("shows every pipeline stage the mandate list groups by", () => {
    // Three candidates produced two groups, which teaches a pipeline with
    // two stages in it. The list needs enough spread to show the shape.
    const stages = new Set(
      SAMPLE_CANDIDATES.filter((c) => c.mandateId === SAMPLE_MANDATE_ID).map(
        (c) => c.stage
      )
    );
    expect(stages.size).toBeGreaterThanOrEqual(4);
  });

  it("never shows more candidates than the mandate says it has", () => {
    const mandate = sampleMandate(SAMPLE_MANDATE_ID)!;
    const shown = SAMPLE_CANDIDATES.filter(
      (c) => c.mandateId === SAMPLE_MANDATE_ID
    ).length;
    expect(shown).toBeLessThanOrEqual(mandate.candidates);
  });

  it("shows no more tier-1 candidates than the mandate claims", () => {
    // The candidate list puts "Tier 1 in the pool" beside the rows it
    // renders. More tier-1 rows than the pool contains would make the tile
    // read as a smaller number than the list beneath it.
    const mandate = sampleMandate(SAMPLE_MANDATE_ID)!;
    const shownTierOne = SAMPLE_CANDIDATES.filter(
      (c) => c.mandateId === SAMPLE_MANDATE_ID && c.tier === 1
    ).length;
    expect(shownTierOne).toBeLessThanOrEqual(mandate.tierOne ?? 0);
  });

  it("marks exactly one feedback entry as having recalibrated", () => {
    // Three versions exist and v3 is attributed to feedback. More than one
    // entry claiming it would make the calibration screen unreadable.
    const triggered = SAMPLE_FEEDBACK.entries.filter((e) => e.triggeredRecalibration);
    expect(triggered).toHaveLength(1);
    expect(SAMPLE_FEEDBACK.interpreted.applied).toBe(true);
  });
});
