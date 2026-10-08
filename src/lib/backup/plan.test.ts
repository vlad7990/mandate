import { describe, expect, it } from "vitest";
import { applyToManifest, planBackup, pruneSuppressed } from "./plan";
import { emptyManifest } from "./manifest";
import { destinationPathFor, looksUnchanged } from "./integrity";
import type { BackupManifest, ManifestEntry, SourceObject } from "./types";

/**
 * The reconciliation planner is where the backup's correctness lives, so
 * it is pure and these tests are exhaustive about the cases requirement
 * 10 names: changed files, missing files, and — the one with a regulator
 * attached — erased candidates.
 */

const NOW = "2026-10-07T12:00:00.000Z";

function src(partial: Partial<SourceObject> & { key: string }): SourceObject {
  return {
    bucket: "cvs",
    size: 100,
    etag: null,
    updatedAt: "2026-10-01T00:00:00.000Z",
    contentType: "application/pdf",
    ...partial,
  };
}

function entryFor(object: SourceObject, sha = "a".repeat(64)): ManifestEntry {
  return {
    bucket: object.bucket,
    key: object.key,
    sha256: sha,
    size: object.size,
    contentType: object.contentType,
    sourceUpdatedAt: object.updatedAt,
    backedUpAt: NOW,
    destinationPath: destinationPathFor(object.bucket, object.key, sha),
    encrypted: true,
  };
}

function manifestWith(entries: ManifestEntry[]): BackupManifest {
  return { ...emptyManifest(NOW), entries };
}

const NONE: ReadonlySet<string> = new Set();

describe("planBackup — reconciliation", () => {
  it("copies an object the manifest has never seen", () => {
    const a = src({ key: "org/a.pdf" });
    const plan = planBackup({
      sources: [a],
      manifest: emptyManifest(NOW),
      suppressedKeys: NONE,
    });
    expect(plan.actions).toEqual([{ action: "copy", object: a, reason: "new" }]);
    expect(plan.summary.copyNew).toBe(1);
    expect(plan.summary.bytesToCopy).toBe(100);
  });

  it("skips an object that is provably unchanged", () => {
    const a = src({ key: "org/a.pdf" });
    const plan = planBackup({
      sources: [a],
      manifest: manifestWith([entryFor(a)]),
      suppressedKeys: NONE,
    });
    expect(plan.summary).toMatchObject({ skipUnchanged: 1, copyNew: 0, copyChanged: 0 });
  });

  it("re-copies when the size changed", () => {
    const a = src({ key: "org/a.pdf" });
    const bigger = { ...a, size: 999 };
    const plan = planBackup({
      sources: [bigger],
      manifest: manifestWith([entryFor(a)]),
      suppressedKeys: NONE,
    });
    expect(plan.summary.copyChanged).toBe(1);
  });

  it("re-copies when the source timestamp moved but the size did not", () => {
    // The realistic 'changed file' case: a CV replaced with a revision
    // of coincidentally identical length.
    const a = src({ key: "org/a.pdf" });
    const touched = { ...a, updatedAt: "2026-10-06T00:00:00.000Z" };
    const plan = planBackup({
      sources: [touched],
      manifest: manifestWith([entryFor(a)]),
      suppressedKeys: NONE,
    });
    expect(plan.summary.copyChanged).toBe(1);
  });

  it("re-copies rather than assuming freshness when no timestamp exists", () => {
    const a = src({ key: "org/a.pdf", updatedAt: null });
    const plan = planBackup({
      sources: [a],
      manifest: manifestWith([entryFor(a)]),
      suppressedKeys: NONE,
    });
    // Conservative: cannot prove unchanged, so copy. Wasteful, correct.
    expect(plan.summary.copyChanged).toBe(1);
  });

  it("marks a manifest entry whose source is gone as forget", () => {
    const gone = src({ key: "org/gone.pdf" });
    const plan = planBackup({
      sources: [],
      manifest: manifestWith([entryFor(gone)]),
      suppressedKeys: NONE,
    });
    expect(plan.actions).toHaveLength(1);
    expect(plan.actions[0]).toMatchObject({ action: "forget", reason: "source_deleted" });
  });

  it("distinguishes objects with the same key in different buckets", () => {
    const cv = src({ key: "same/path", bucket: "cvs" });
    const audio = src({ key: "same/path", bucket: "call-audio" });
    const plan = planBackup({
      sources: [cv, audio],
      manifest: manifestWith([entryFor(cv)]),
      suppressedKeys: NONE,
    });
    expect(plan.summary).toMatchObject({ skipUnchanged: 1, copyNew: 1 });
  });

  it("is a no-op on a second identical run — duplicate cron delivery", () => {
    const a = src({ key: "org/a.pdf" });
    const m = manifestWith([entryFor(a)]);
    const first = planBackup({ sources: [a], manifest: m, suppressedKeys: NONE });
    const second = planBackup({ sources: [a], manifest: m, suppressedKeys: NONE });
    expect(first.summary).toEqual(second.summary);
    expect(second.summary.copyNew + second.summary.copyChanged).toBe(0);
  });

  it("converges after a missed run — reconciliation, not a delta window", () => {
    // Three objects arrive while the cron never fires. The next run must
    // plan all three, not just 'today's'.
    const objects = ["a", "b", "c"].map((n) => src({ key: `org/${n}.pdf` }));
    const plan = planBackup({
      sources: objects,
      manifest: emptyManifest(NOW),
      suppressedKeys: NONE,
    });
    expect(plan.summary.copyNew).toBe(3);
  });
});

describe("planBackup — erasure safeguards (requirement 8)", () => {
  it("never copies an object belonging to a suppressed person", () => {
    const a = src({ key: "org/erased.pdf" });
    const plan = planBackup({
      sources: [a],
      manifest: emptyManifest(NOW),
      suppressedKeys: new Set(["cvs/org/erased.pdf"]),
    });
    expect(plan.summary).toMatchObject({ skipSuppressed: 1, copyNew: 0 });
  });

  it("checks suppression BEFORE the unchanged test", () => {
    // The ordering bug this guards: an already-backed-up object that has
    // not changed would otherwise be skipped as 'unchanged' and never
    // reconsidered, leaving erased data in the backup indefinitely.
    const a = src({ key: "org/erased.pdf" });
    const plan = planBackup({
      sources: [a],
      manifest: manifestWith([entryFor(a)]),
      suppressedKeys: new Set(["cvs/org/erased.pdf"]),
    });
    expect(plan.summary.skipSuppressed).toBe(1);
    expect(plan.summary.skipUnchanged).toBe(0);
  });

  it("prunes an already-stored object once its owner is suppressed", () => {
    const a = src({ key: "org/erased.pdf" });
    const m = manifestWith([entryFor(a)]);
    const { toDelete, keysToRecord } = pruneSuppressed({
      manifest: m,
      suppressedKeys: new Set(["cvs/org/erased.pdf"]),
    });
    expect(toDelete).toHaveLength(1);
    expect(toDelete[0].destinationPath).toBe(entryFor(a).destinationPath);
    expect(keysToRecord).toEqual(["cvs/org/erased.pdf"]);
  });

  it("records a suppressed key so a restore sees a deliberate removal", () => {
    const a = src({ key: "org/erased.pdf" });
    const next = applyToManifest({
      manifest: manifestWith([entryFor(a)]),
      copied: [],
      forgotten: [],
      suppressedKeysRecorded: ["cvs/org/erased.pdf"],
      allowForget: true,
      now: NOW,
    });
    expect(next.entries).toHaveLength(0);
    expect(next.suppressedKeys).toEqual(["cvs/org/erased.pdf"]);
  });

  it("removes suppressed entries even when listings were incomplete", () => {
    // A deliberate deletion is not a reconciliation guess, so it must
    // not be gated on listing completeness the way `forget` is.
    const a = src({ key: "org/erased.pdf" });
    const next = applyToManifest({
      manifest: manifestWith([entryFor(a)]),
      copied: [],
      forgotten: [],
      suppressedKeysRecorded: ["cvs/org/erased.pdf"],
      allowForget: false,
      now: NOW,
    });
    expect(next.entries).toHaveLength(0);
  });

  it("does not resurrect a suppressed key on a later run", () => {
    const a = src({ key: "org/erased.pdf" });
    const after = applyToManifest({
      manifest: manifestWith([entryFor(a)]),
      copied: [],
      forgotten: [],
      suppressedKeysRecorded: ["cvs/org/erased.pdf"],
      allowForget: true,
      now: NOW,
    });
    // Next run: the object is still in storage, still suppressed.
    const plan = planBackup({
      sources: [a],
      manifest: after,
      suppressedKeys: new Set(["cvs/org/erased.pdf"]),
    });
    expect(plan.summary.copyNew).toBe(0);
    expect(plan.summary.skipSuppressed).toBe(1);
  });
});

describe("applyToManifest — progress is durable", () => {
  it("records only what actually copied, so a partial run resumes", () => {
    const a = src({ key: "org/a.pdf" });
    const b = src({ key: "org/b.pdf" });
    const next = applyToManifest({
      manifest: emptyManifest(NOW),
      copied: [entryFor(a)],
      forgotten: [],
      suppressedKeysRecorded: [],
      allowForget: true,
      now: NOW,
    });
    expect(next.entries.map((e) => e.key)).toEqual(["org/a.pdf"]);

    // The next run plans only the object that did not make it.
    const plan = planBackup({
      sources: [a, b],
      manifest: next,
      suppressedKeys: NONE,
    });
    expect(plan.summary).toMatchObject({ copyNew: 1, skipUnchanged: 1 });
  });

  it("replaces a prior entry for the same key rather than duplicating it", () => {
    const a = src({ key: "org/a.pdf" });
    const old = entryFor(a, "a".repeat(64));
    const fresh = entryFor({ ...a, size: 200 }, "b".repeat(64));
    const next = applyToManifest({
      manifest: manifestWith([old]),
      copied: [fresh],
      forgotten: [],
      suppressedKeysRecorded: [],
      allowForget: true,
      now: NOW,
    });
    expect(next.entries).toHaveLength(1);
    expect(next.entries[0].sha256).toBe("b".repeat(64));
  });

  it("refuses to forget when a bucket listing was incomplete", () => {
    // The one bug capable of destroying a good backup: a truncated
    // listing treated as complete would forget live objects.
    const gone = entryFor(src({ key: "org/still-there.pdf" }));
    const next = applyToManifest({
      manifest: manifestWith([gone]),
      copied: [],
      forgotten: [gone],
      suppressedKeysRecorded: [],
      allowForget: false,
      now: NOW,
    });
    expect(next.entries).toHaveLength(1);
  });

  it("forgets when the listing was clean", () => {
    const gone = entryFor(src({ key: "org/really-gone.pdf" }));
    const next = applyToManifest({
      manifest: manifestWith([gone]),
      copied: [],
      forgotten: [gone],
      suppressedKeysRecorded: [],
      allowForget: true,
      now: NOW,
    });
    expect(next.entries).toHaveLength(0);
  });

  it("keeps entries sorted so manifest diffs are readable", () => {
    const next = applyToManifest({
      manifest: emptyManifest(NOW),
      copied: [
        entryFor(src({ key: "z.pdf" })),
        entryFor(src({ key: "a.pdf" })),
        entryFor(src({ key: "m.pdf", bucket: "call-audio" })),
      ],
      forgotten: [],
      suppressedKeysRecorded: [],
      allowForget: true,
      now: NOW,
    });
    expect(next.entries.map((e) => `${e.bucket}/${e.key}`)).toEqual([
      "call-audio/m.pdf",
      "cvs/a.pdf",
      "cvs/z.pdf",
    ]);
  });
});

describe("looksUnchanged — the cheap pre-filter", () => {
  it("requires both size and timestamp to match", () => {
    const a = src({ key: "k" });
    expect(looksUnchanged(a, entryFor(a))).toBe(true);
    expect(looksUnchanged({ ...a, size: 1 }, entryFor(a))).toBe(false);
    expect(looksUnchanged({ ...a, updatedAt: "2026-01-01T00:00:00.000Z" }, entryFor(a))).toBe(false);
  });

  it("treats a missing timestamp on either side as changed", () => {
    const a = src({ key: "k" });
    expect(looksUnchanged({ ...a, updatedAt: null }, entryFor(a))).toBe(false);
    expect(looksUnchanged(a, { ...entryFor(a), sourceUpdatedAt: null })).toBe(false);
  });
});
