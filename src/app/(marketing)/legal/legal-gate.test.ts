import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  LEGAL_DOCUMENTS,
  PROHIBITED_PHRASES,
  isPublished,
  legalDocument,
} from "./_registry";

/**
 * The publication gate.
 *
 * ## The failure this exists to prevent
 *
 * A client asks for terms before signing. The drafts are sitting in
 * `docs/legal/drafts/`, they read well, and the quickest way to unblock
 * the deal is to paste one into the registry and ship it. That is how
 * unreviewed legal text goes live, and it is a worse outcome than
 * having no legal page at all — an unreviewed notice is relied upon by
 * the person reading it.
 *
 * So publication requires a review record naming a reviewer and a date.
 * These tests fail the build if that is bypassed, if a draft marker
 * survives into published copy, or if a body contains one of the
 * standing factual prohibitions.
 *
 * ## Today every document is unpublished, and that is asserted
 *
 * The last test pins the current state. When the first document is
 * genuinely reviewed and published, that test fails — deliberately. It
 * is the moment to check the rest of this file still says what it
 * should, rather than a line to delete in passing.
 */

const DRAFT_MARKERS = [
  /\bDRAFT\b/,
  /\[DECISION:/i,
  /NOT APPROVED/i,
  /NOT PUBLISHED/i,
  /NOT LEGAL ADVICE/i,
  /\bTBD\b/,
  /\bTODO\b/,
  /\[\s*placeholder\s*\]/i,
  /\bXXX\b/,
];

describe("the legal publication gate", () => {
  it("has a document for every draft that exists on disk", () => {
    const dir = path.resolve(__dirname, "../../../../docs/legal/drafts");
    const drafts = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".DRAFT.md"));
    // If a sixth draft appears, it needs a registry entry or it will
    // never be reachable, and nobody will notice until a client asks.
    expect(drafts).toHaveLength(LEGAL_DOCUMENTS.length);
  });

  it("points every registry entry at a draft file that exists", () => {
    const root = path.resolve(__dirname, "../../../..");
    for (const doc of LEGAL_DOCUMENTS) {
      const full = path.join(root, doc.draftPath);
      expect(fs.existsSync(full), `${doc.slug}: missing ${doc.draftPath}`).toBe(true);
    }
  });

  it("publishes nothing without a named reviewer and a date", () => {
    for (const doc of LEGAL_DOCUMENTS) {
      if (!isPublished(doc)) continue;
      expect(doc.review?.reviewedBy, `${doc.slug}: no reviewer`).toBeTruthy();
      expect(doc.review?.reviewedAt, `${doc.slug}: no review date`).toMatch(
        /^\d{4}-\d{2}-\d{2}$/
      );
      expect(doc.review?.reference, `${doc.slug}: no reviewed reference`).toBeTruthy();
    }
  });

  it("refuses to treat a body with no review as published", () => {
    // The gate is the conjunction. A body alone must not publish.
    const bodyOnly = { ...LEGAL_DOCUMENTS[0], body: "Some terms." };
    expect(isPublished(bodyOnly)).toBe(false);

    const reviewOnly = {
      ...LEGAL_DOCUMENTS[0],
      review: { reviewedBy: "A Lawyer", reviewedAt: "2026-11-01", reference: "v1" },
    };
    expect(isPublished(reviewOnly)).toBe(false);

    const both = { ...bodyOnly, ...reviewOnly };
    expect(isPublished(both)).toBe(true);
  });

  it("never publishes copy that still carries a draft marker", () => {
    for (const doc of LEGAL_DOCUMENTS) {
      if (!isPublished(doc)) continue;
      for (const marker of DRAFT_MARKERS) {
        expect(
          marker.test(doc.body),
          `${doc.slug}: published body still matches ${marker}`
        ).toBe(false);
      }
    }
  });

  it("never publishes any of the standing prohibited claims", () => {
    for (const doc of LEGAL_DOCUMENTS) {
      if (!isPublished(doc)) continue;
      for (const { pattern, why } of PROHIBITED_PHRASES) {
        expect(pattern.test(doc.body), `${doc.slug}: ${why}`).toBe(false);
      }
    }
  });

  it("catches a zero-retention claim if one is ever written", () => {
    // Mutation check: the prohibition list is only worth something if
    // it can fire.
    const zdr = PROHIBITED_PHRASES[0].pattern;
    expect(zdr.test("We operate under a zero-data-retention agreement.")).toBe(true);
    expect(zdr.test("We hold a ZDR arrangement with the provider.")).toBe(true);
    expect(zdr.test("Content is retained for up to 30 days.")).toBe(false);
  });

  it("catches training and retention collapsed into one sentence", () => {
    const collapsed = PROHIBITED_PHRASES[1].pattern;
    expect(
      collapsed.test("Your content is not used for training and not retained."),
      "the two-facts-as-one claim must be caught"
    ).toBe(true);
    // The honest version, as two separate statements, must pass.
    expect(
      collapsed.test(
        "Your content is not used to train models. Separately, the provider retains content for up to 30 days, longer if flagged."
      )
    ).toBe(false);
  });

  it("has unique slugs and resolves each one", () => {
    const slugs = LEGAL_DOCUMENTS.map((d) => d.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const s of slugs) expect(legalDocument(s)?.slug).toBe(s);
    expect(legalDocument("not-a-document")).toBeUndefined();
  });

  it("gives every unpublished document a reason it is not live", () => {
    for (const doc of LEGAL_DOCUMENTS) {
      if (isPublished(doc)) continue;
      expect(doc.blockedBy, `${doc.slug}: unpublished with no stated reason`).toBeTruthy();
    }
  });

  it("CURRENT STATE: no legal document is published", () => {
    // Pinned on purpose. The day this fails is the day something went
    // live; make sure it went live through review and not through a
    // shortcut.
    const live = LEGAL_DOCUMENTS.filter(isPublished).map((d) => d.slug);
    expect(live).toEqual([]);
  });
});
