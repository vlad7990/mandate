import { decrypt, parseKey } from "./crypto";
import type { Destination } from "./destination";
import { verifyBytes } from "./integrity";
import { loadManifest } from "./manifest";
import type { BackupManifest, ManifestEntry } from "./types";

/**
 * Restore — and the reason this file exists separately from `run.ts`.
 *
 * A backup is a hypothesis until it has been restored. This module is
 * the executable form of that claim: it is used by the rehearsal
 * (`scripts/backup-rehearsal.mjs`) so the restore path is exercised by
 * the same code an operator would run in an incident, rather than by a
 * procedure written down and never tried.
 *
 * It deliberately has NO Supabase dependency and no `server-only` guard.
 * A restore may have to run when the project it is restoring INTO does
 * not exist yet — from a laptop, against a fresh bucket, with nothing
 * but the destination credentials and the encryption key. Coupling it to
 * a live client would make it useless in the one situation it is for.
 */

export type RestoreVerdict = {
  bucket: string;
  key: string;
  status: "ok" | "missing_at_destination" | "checksum_mismatch" | "decrypt_failed";
  detail: string | null;
  bytes: Uint8Array | null;
};

export type RestoreReport = {
  manifestUpdatedAt: string;
  manifestRunCount: number;
  totalEntries: number;
  verified: number;
  failed: number;
  verdicts: RestoreVerdict[];
  /** Requirement 7 — what to pair this with on the database side. */
  recoveryPoint: BackupManifest["recoveryPoint"];
  /** Requirement 5 — what buckets must look like before objects land. */
  bucketConfig: BackupManifest["buckets"];
  accessControl: BackupManifest["accessControl"];
  /** Requirement 8 — keys deliberately absent because of suppression. */
  suppressedKeys: string[];
  durationMs: number;
};

/**
 * Fetch, decrypt and verify one entry. Returns the plaintext bytes on
 * success so a caller can write them wherever the restore target is.
 */
export async function restoreEntry(
  destination: Destination,
  entry: ManifestEntry,
  key: Buffer
): Promise<RestoreVerdict> {
  const stored = await destination.get(entry.destinationPath);
  if (!stored) {
    return {
      bucket: entry.bucket,
      key: entry.key,
      status: "missing_at_destination",
      detail: `manifest lists ${entry.destinationPath} but the destination has no such object`,
      bytes: null,
    };
  }

  let plain: Uint8Array;
  try {
    plain = entry.encrypted ? decrypt(stored, key) : stored;
  } catch (err) {
    return {
      bucket: entry.bucket,
      key: entry.key,
      status: "decrypt_failed",
      detail: err instanceof Error ? err.message : String(err),
      bytes: null,
    };
  }

  const verdict = verifyBytes(plain, entry.sha256);
  if (!verdict.ok) {
    return {
      bucket: entry.bucket,
      key: entry.key,
      status: "checksum_mismatch",
      detail: `expected ${entry.sha256.slice(0, 12)}, got ${verdict.actual.slice(0, 12)}`,
      bytes: null,
    };
  }

  return {
    bucket: entry.bucket,
    key: entry.key,
    status: "ok",
    detail: null,
    bytes: plain,
  };
}

/**
 * Verify an entire backup without writing anything.
 *
 * This is the function a monthly "is the backup still good?" check
 * calls. It proves every object is present, decryptable and
 * byte-identical — which is a materially stronger statement than "the
 * bucket has 400 objects in it".
 *
 * `onObject` lets a caller stream each verified object somewhere (a
 * bucket, a directory) without this module knowing what the target is.
 */
export async function verifyBackup(
  destination: Destination,
  encryptionKeyBase64: string | undefined,
  options: {
    now?: () => Date;
    onObject?: (entry: ManifestEntry, bytes: Uint8Array) => Promise<void>;
    /** Stop after this many entries. For spot checks on large backups. */
    limit?: number;
  } = {}
): Promise<RestoreReport> {
  const now = options.now ?? (() => new Date());
  const started = now().getTime();
  const key = parseKey(encryptionKeyBase64);
  const manifest = await loadManifest(destination, new Date(0).toISOString());

  const entries = options.limit
    ? manifest.entries.slice(0, options.limit)
    : manifest.entries;

  const verdicts: RestoreVerdict[] = [];
  for (const entry of entries) {
    const verdict = await restoreEntry(destination, entry, key);
    if (verdict.status === "ok" && options.onObject && verdict.bytes) {
      await options.onObject(entry, verdict.bytes);
    }
    // Do not retain plaintext in the report — the bytes are candidate
    // CVs, and a report is a thing that gets logged and pasted.
    verdicts.push({ ...verdict, bytes: null });
  }

  const verified = verdicts.filter((v) => v.status === "ok").length;
  return {
    manifestUpdatedAt: manifest.updatedAt,
    manifestRunCount: manifest.runCount,
    totalEntries: manifest.entries.length,
    verified,
    failed: verdicts.length - verified,
    verdicts,
    recoveryPoint: manifest.recoveryPoint,
    bucketConfig: manifest.buckets,
    accessControl: manifest.accessControl,
    suppressedKeys: manifest.suppressedKeys,
    durationMs: now().getTime() - started,
  };
}

/**
 * Requirement 7, the operator-facing half: compare the manifest's
 * recorded database recovery point against the database as restored,
 * and say plainly which side is ahead.
 *
 * Nothing can make two independent backups atomic. What this does is
 * replace a mid-incident guess with a stated number.
 */
export function describeRecoveryCoordination(
  manifest: BackupManifest,
  restoredDatabase: { candidates: number; candidateNotes: number }
): string {
  const rp = manifest.recoveryPoint;
  if (!rp) {
    return (
      "This manifest records no database recovery point, so file-to-database " +
      "alignment cannot be stated. Treat object references as unverified and " +
      "reconcile manually."
    );
  }
  const dc = restoredDatabase.candidates - rp.markers.candidates;
  const dn = restoredDatabase.candidateNotes - rp.markers.candidateNotes;

  const lines = [
    `File backup observed the database at ${rp.observedAt}.`,
    `Candidates: manifest ${rp.markers.candidates}, restored ${restoredDatabase.candidates} (${signed(dc)}).`,
    `Call notes with audio: manifest ${rp.markers.candidateNotes}, restored ${restoredDatabase.candidateNotes} (${signed(dn)}).`,
  ];

  if (dc > 0 || dn > 0) {
    lines.push(
      "The restored DATABASE IS AHEAD of the file backup: some rows will reference " +
        "objects this backup does not hold. Those references will 404 until the " +
        "affected records are re-uploaded or cleared. Expected count: " +
        `${Math.max(dc, 0) + Math.max(dn, 0)} record(s).`
    );
  } else if (dc < 0 || dn < 0) {
    lines.push(
      "The FILE BACKUP IS AHEAD of the restored database: it holds objects no " +
        "restored row references. These are harmless orphans — do not delete " +
        "them, they may belong to records restored later."
    );
  } else {
    lines.push("Counts agree. No reconciliation needed.");
  }
  return lines.join("\n");
}

function signed(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}
