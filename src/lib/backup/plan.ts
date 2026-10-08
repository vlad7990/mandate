/**
 * Reconciliation — the heart of the module, and pure.
 *
 * Vercel's cron delivery is "best effort": it can MISS a run and it can
 * fire the same run TWICE, and it never retries a failure. A planner
 * that asked "what changed since yesterday" would therefore lose
 * whatever changed during a missed run, permanently and silently.
 *
 * So this planner asks a different question: given the source as it is
 * NOW and the manifest as it is NOW, what work is outstanding? Every run
 * independently converges on the same answer, which makes a missed run
 * a delay rather than a hole, and a duplicated run a no-op.
 *
 * Pure by construction — no clock, no network, no filesystem — because
 * the failure modes that matter here (a changed file, a deleted file, an
 * erased candidate) are precisely the ones that are tedious to provoke
 * against a live system and trivial to assert on a pure function.
 */

import { looksUnchanged } from "./integrity";
import type {
  BackupManifest,
  BackupPlan,
  ManifestEntry,
  PlannedAction,
  SourceObject,
} from "./types";

function indexKey(bucket: string, key: string): string {
  return `${bucket}/${key}`;
}

/**
 * Build a plan.
 *
 * `suppressedKeys` is requirement 8's input: object paths belonging to
 * people with an active suppression (erasure honoured, withdrawal,
 * do-not-contact set by the system). See `erasure.ts` for how the set is
 * derived — this function only has to honour it.
 */
export function planBackup(args: {
  sources: SourceObject[];
  manifest: BackupManifest;
  suppressedKeys: ReadonlySet<string>;
}): BackupPlan {
  const { sources, manifest, suppressedKeys } = args;

  const byKey = new Map<string, ManifestEntry>();
  for (const entry of manifest.entries) {
    byKey.set(indexKey(entry.bucket, entry.key), entry);
  }

  const actions: PlannedAction[] = [];
  const seen = new Set<string>();

  for (const object of sources) {
    const id = indexKey(object.bucket, object.key);
    seen.add(id);

    // Requirement 8, FIRST — before any copy decision. A suppressed
    // person's object is never copied, and an object that was backed up
    // BEFORE the suppression is handled by `pruneSuppressed` below. The
    // ordering matters: checking suppression after the unchanged test
    // would let an already-backed-up object stay in the manifest
    // forever simply because it had not changed.
    if (suppressedKeys.has(id)) {
      actions.push({ action: "skip", object, reason: "suppressed" });
      continue;
    }

    const entry = byKey.get(id);
    if (!entry) {
      actions.push({ action: "copy", object, reason: "new" });
      continue;
    }

    if (looksUnchanged(object, entry)) {
      actions.push({ action: "skip", object, reason: "unchanged" });
    } else {
      actions.push({ action: "copy", object, reason: "changed" });
    }
  }

  // In the manifest but no longer in the source. Two causes, and they
  // are NOT the same thing:
  //
  //   * the object was genuinely deleted (a candidate record removed, a
  //     CV replaced) — the manifest should stop claiming it;
  //   * the source listing failed or was truncated — in which case
  //     forgetting it would quietly discard a good backup.
  //
  // This planner emits `forget`, and the RUNNER decides whether to
  // honour it: it only applies forgets when the listing for that bucket
  // completed cleanly. A planner cannot know that, so it does not guess.
  for (const entry of manifest.entries) {
    const id = indexKey(entry.bucket, entry.key);
    if (!seen.has(id)) {
      actions.push({ action: "forget", entry, reason: "source_deleted" });
    }
  }

  return { actions, summary: summarise(actions) };
}

function summarise(actions: PlannedAction[]): BackupPlan["summary"] {
  const summary: BackupPlan["summary"] = {
    copyNew: 0,
    copyChanged: 0,
    skipUnchanged: 0,
    skipSuppressed: 0,
    forget: 0,
    bytesToCopy: 0,
  };
  for (const a of actions) {
    if (a.action === "copy") {
      summary.bytesToCopy += a.object.size;
      if (a.reason === "new") summary.copyNew += 1;
      else summary.copyChanged += 1;
    } else if (a.action === "skip") {
      if (a.reason === "unchanged") summary.skipUnchanged += 1;
      else summary.skipSuppressed += 1;
    } else {
      summary.forget += 1;
    }
  }
  return summary;
}

/**
 * Requirement 8's other half, and the one that is easy to miss.
 *
 * Skipping a suppressed object stops it being backed up GOING FORWARD.
 * It does nothing about an object that was already in the backup when
 * the person asked to be erased — and that copy is precisely what would
 * resurrect them if the backup were ever restored.
 *
 * So a suppression also PRUNES: the entry leaves the manifest, its
 * destination object is deleted, and the key is recorded in
 * `suppressedKeys` so that a restore reading this manifest can see the
 * object was deliberately removed rather than lost.
 *
 * Returns the entries to delete at the destination. Pure; the caller
 * performs the deletions and reports failures honestly.
 */
export function pruneSuppressed(args: {
  manifest: BackupManifest;
  suppressedKeys: ReadonlySet<string>;
}): { toDelete: ManifestEntry[]; keysToRecord: string[] } {
  const toDelete: ManifestEntry[] = [];
  const keysToRecord: string[] = [];
  for (const entry of args.manifest.entries) {
    const id = indexKey(entry.bucket, entry.key);
    if (args.suppressedKeys.has(id)) {
      toDelete.push(entry);
      keysToRecord.push(id);
    }
  }
  return { toDelete, keysToRecord };
}

/**
 * Apply a plan's bookkeeping to a manifest. Pure, so the runner's
 * partial-progress semantics are testable without a destination.
 *
 * `copied` carries only the objects that actually landed AND verified.
 * `allowForget` is the runner's answer to the listing-completeness
 * question the planner refused to guess at.
 */
export function applyToManifest(args: {
  manifest: BackupManifest;
  copied: ManifestEntry[];
  forgotten: ManifestEntry[];
  suppressedKeysRecorded: string[];
  allowForget: boolean;
  now: string;
}): BackupManifest {
  const { manifest, copied, forgotten, suppressedKeysRecorded, allowForget, now } =
    args;

  const next = new Map<string, ManifestEntry>();
  for (const entry of manifest.entries) {
    next.set(indexKey(entry.bucket, entry.key), entry);
  }

  // A copy REPLACES any prior entry for the same bucket/key, which is
  // what makes a re-run of a changed object idempotent.
  for (const entry of copied) {
    next.set(indexKey(entry.bucket, entry.key), entry);
  }

  if (allowForget) {
    for (const entry of forgotten) {
      next.delete(indexKey(entry.bucket, entry.key));
    }
  }

  // Suppressed keys are always removed, listing completeness or not: a
  // deliberate deletion is not a reconciliation guess.
  for (const id of suppressedKeysRecorded) {
    next.delete(id);
  }

  const suppressed = new Set(manifest.suppressedKeys);
  for (const id of suppressedKeysRecorded) suppressed.add(id);

  return {
    ...manifest,
    updatedAt: now,
    entries: [...next.values()].sort((a, b) =>
      indexKey(a.bucket, a.key).localeCompare(indexKey(b.bucket, b.key))
    ),
    suppressedKeys: [...suppressed].sort(),
  };
}
