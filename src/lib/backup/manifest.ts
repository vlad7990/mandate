/**
 * The manifest — read, write, and the version gate.
 *
 * Requirement 6 asks for a versioned manifest. Two kinds of versioning
 * are meant and both are implemented:
 *
 *   * SHAPE versioning (`MANIFEST_VERSION`) so a restore reading an
 *     older manifest knows whether it can trust its own parser. A
 *     silently misread manifest is how a backup becomes a false sense
 *     of security, so an unknown version REFUSES rather than guessing.
 *   * HISTORICAL versioning: the live manifest is overwritten each run,
 *     and a dated copy is archived. An operator deciding how far back to
 *     restore needs to see what the backup looked like on a given day,
 *     not just today.
 */

import {
  MANIFEST_PATH,
  manifestArchivePath,
  sha256Hex,
} from "./integrity";
import type { Destination } from "./destination";
import { MANIFEST_VERSION, type BackupManifest } from "./types";

export class ManifestVersionError extends Error {}
export class ManifestCorruptError extends Error {}

export function emptyManifest(now: string): BackupManifest {
  return {
    version: MANIFEST_VERSION,
    updatedAt: now,
    runCount: 0,
    entries: [],
    buckets: [],
    accessControl: null,
    recoveryPoint: null,
    suppressedKeys: [],
    lastRunFailures: [],
  };
}

/**
 * Parse a manifest, refusing anything this code cannot faithfully read.
 *
 * Exported separately from `loadManifest` so the version gate is
 * testable without a destination.
 */
export function parseManifest(raw: string): BackupManifest {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ManifestCorruptError(
      "The backup manifest is not valid JSON. Refusing to overwrite it — " +
        "a fresh manifest would silently orphan every object already stored."
    );
  }
  if (!parsed || typeof parsed !== "object") {
    throw new ManifestCorruptError("The backup manifest is not an object.");
  }
  const version = (parsed as { version?: unknown }).version;
  if (version !== MANIFEST_VERSION) {
    throw new ManifestVersionError(
      `The backup manifest is version ${String(version)}; this code reads ` +
        `version ${MANIFEST_VERSION}. Refusing to proceed rather than ` +
        "misinterpret an existing backup."
    );
  }
  const m = parsed as BackupManifest;
  if (!Array.isArray(m.entries)) {
    throw new ManifestCorruptError("The backup manifest has no entries array.");
  }
  return {
    ...emptyManifest(m.updatedAt ?? new Date(0).toISOString()),
    ...m,
    // Defend against older or hand-edited manifests missing newer fields.
    suppressedKeys: Array.isArray(m.suppressedKeys) ? m.suppressedKeys : [],
    lastRunFailures: Array.isArray(m.lastRunFailures) ? m.lastRunFailures : [],
    buckets: Array.isArray(m.buckets) ? m.buckets : [],
  };
}

/**
 * Load the manifest from the destination. A MISSING manifest is a
 * first run and returns an empty one; a CORRUPT or wrong-version
 * manifest throws, because those are not the same thing and treating
 * them alike is how a backup silently restarts from zero.
 */
export async function loadManifest(
  destination: Destination,
  now: string
): Promise<BackupManifest> {
  const bytes = await destination.get(MANIFEST_PATH);
  if (!bytes) return emptyManifest(now);
  return parseManifest(Buffer.from(bytes).toString("utf8"));
}

/**
 * Write the manifest, then archive a dated copy.
 *
 * Order matters: the live manifest is written FIRST, so that an
 * interruption between the two writes leaves the authoritative copy
 * current and merely skips an archive. The reverse order could leave an
 * archive that is ahead of the live manifest, which is confusing at
 * exactly the wrong moment.
 *
 * The manifest itself is stored in CLEAR TEXT, deliberately. It holds
 * object paths, sizes and checksums — no CV content, no names, no email
 * addresses — and an operator restoring under pressure must be able to
 * read it without first recovering an encryption key. Keeping it legible
 * is the difference between a recoverable backup and a puzzle.
 */
export async function saveManifest(
  destination: Destination,
  manifest: BackupManifest
): Promise<{ checksum: string; archivedAt: string | null }> {
  const json = JSON.stringify(manifest, null, 2);
  const bytes = new TextEncoder().encode(json);
  await destination.put(MANIFEST_PATH, bytes);

  let archivedAt: string | null = null;
  try {
    await destination.put(manifestArchivePath(manifest.updatedAt), bytes);
    archivedAt = manifest.updatedAt;
  } catch {
    // An archive failure is not a run failure. The live manifest is
    // already written and is what a restore reads.
  }

  return { checksum: sha256Hex(bytes), archivedAt };
}
