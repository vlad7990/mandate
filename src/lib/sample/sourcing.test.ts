import { describe, expect, it } from "vitest";
import { SLOTS } from "@/lib/ai/sourcing-analysis";
import { SAMPLE_CANDIDATES } from "./data";
import { SAMPLE_MANDATE_ID } from "./mandate-modules";
import {
  SAMPLE_RUNS,
  SAMPLE_SEARCH,
  SAMPLE_SLOTS,
  SAMPLE_TARGET_COMPANIES,
  sampleSlotsInOrder,
} from "./sourcing";

/**
 * The sourcing fixture describes the same search as the rest of the sample,
 * one layer earlier: the queries that produced the candidates the leaderboard
 * ranks. These are the joins where it can stop being the same search.
 */

describe("sample sourcing", () => {
  it("fills every slot the product defines, and no others", () => {
    // A slot added to `SLOTS` and not here renders an empty card; one here
    // that the product dropped renders nothing at all.
    expect(SAMPLE_SLOTS.map((s) => s.slot).sort()).toEqual(
      SLOTS.map((s) => s.key).sort()
    );
    expect(sampleSlotsInOrder()).toHaveLength(SLOTS.length);
  });

  it("writes boolean strings rather than prose", () => {
    // The claim of the feature is that it saves a researcher an hour. Each
    // string has to look like something you would paste into a search box.
    for (const s of SAMPLE_SLOTS) {
      expect(s.content.length, s.slot).toBeGreaterThan(80);
      expect(/\bOR\b|\bAND\b|site:|title:/.test(s.content), s.slot).toBe(true);
    }
  });

  it("orders each slot's history newest first, below its current version", () => {
    for (const s of SAMPLE_SLOTS) {
      const versions = s.history.map((h) => h.version);
      expect(versions).toEqual([...versions].sort((a, b) => b - a));
      for (const h of s.history) {
        expect(h.version).toBeLessThan(s.version);
        expect(h.daysAgo).toBeGreaterThanOrEqual(s.daysAgo);
      }
      // A slot at v3 has two earlier versions, not zero.
      expect(s.history.length).toBe(s.version - 1);
    }
  });

  it("runs only slots that exist, and imports no more than it found", () => {
    const keys = new Set(SLOTS.map((s) => s.key));
    for (const r of SAMPLE_RUNS) {
      expect(keys.has(r.slot), r.slot).toBe(true);
      expect(r.imported).toBeLessThanOrEqual(r.found);
    }
  });

  it("names the client in the target list as excluded", () => {
    // Listing the client and marking it excluded is the point: an omission
    // reads as an oversight, a marked exclusion reads as a decision.
    const client = SAMPLE_TARGET_COMPANIES.companies.find(
      (c) => c.name === "Larkspur Health"
    );
    expect(client).toBeDefined();
    expect(client!.category).toBe("Excluded");
  });

  it("returns matches that are real candidates on this mandate", () => {
    const onMandate = new Set(
      SAMPLE_CANDIDATES.filter((c) => c.mandateId === SAMPLE_MANDATE_ID).map(
        (c) => c.id
      )
    );
    for (const m of SAMPLE_SEARCH.matches) {
      expect(onMandate.has(m.candidateId), m.candidateId).toBe(true);
    }
  });

  it("ranks the search by score and reasons about every match", () => {
    const scores = SAMPLE_SEARCH.matches.map((m) => m.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
    for (const m of SAMPLE_SEARCH.matches) {
      // A bare score is a list; the reasoning is the feature.
      expect(m.reasoning.trim().length, m.candidateId).toBeGreaterThan(80);
      // The product's own noise floor is 30 — nothing below it is returned.
      expect(m.score).toBeGreaterThanOrEqual(30);
    }
  });
});
