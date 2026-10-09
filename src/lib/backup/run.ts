import "server-only";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decrypt, encrypt, parseKey } from "./crypto";
import type { Destination } from "./destination";
import { loadSuppressedObjectKeys } from "./erasure";
import {
  destinationPathFor,
  sha256Hex,
  verifyBytes,
} from "./integrity";
import { loadManifest, saveManifest } from "./manifest";
import { applyToManifest, planBackup, pruneSuppressed } from "./plan";
import { sanitiseReason } from "./report";
import {
  captureAccessControl,
  captureBucketConfig,
  captureRecoveryPoint,
  downloadObject,
  listAllBuckets,
} from "./source";
import {
  MANIFEST_VERSION,
  type BackupRunReport,
  type BucketName,
  type ManifestEntry,
  type ObjectFailure,
} from "./types";

/**
 * The run orchestrator.
 *
 * Four properties make a once-daily, never-retried, possibly-duplicated,
 * time-capped invocation into a reliable backup. All four are verified
 * against Vercel's documented cron behaviour (2026-10-07):
 *
 *   LOCK          `pg_try_advisory_lock` — Vercel can start a second
 *                 invocation while the first runs. Postgres is already
 *                 here, so this costs no new infrastructure.
 *   RECONCILE     the plan is computed from source-vs-manifest, never
 *                 from a time window, so a MISSED run is a delay and
 *                 not a hole.
 *   IDEMPOTENT    objects are content-addressed and verified, so a
 *                 DUPLICATE run copies nothing twice.
 *   BUDGET        the run stops cleanly before the function limit and
 *                 the next run resumes, so volume cannot wedge it.
 *
 * Partial progress is a FIRST-CLASS outcome, not an error. A run that
 * copies 40 of 400 objects and stops on its budget has done its job; the
 * manifest records the 40 and tomorrow starts at 41.
 */


/**
 * THE LOCK IS A LEASE, NOT A SESSION LOCK (migration 166).
 *
 * 161 used `pg_try_advisory_lock`, which is SESSION-scoped, and reasoned
 * that "a dropped connection releases it, so a crashed run cannot wedge
 * the job forever". That is true of a dedicated connection and false
 * behind PostgREST's connection pool — which is what this code actually
 * talks to.
 *
 * The first real run against Cloudflare R2 (2026-10-09) proved it. The
 * run succeeded — 4 objects, 1,100,864 bytes, 0 failures — and then:
 *
 *   acquire  → pooled session A takes the lock
 *   release  → lands on pooled session B, where pg_advisory_unlock
 *              returns FALSE (not an error; B never held it)
 *   result   → session A goes back to the pool, idle, still holding it
 *
 *     pid 1783026 | advisory 8427301 | granted | PostgREST 14.5 | idle
 *
 * and the next invocation answered "another backup run holds the lock".
 * Every later run would have skipped. Had the cron been scheduled first,
 * the backup would have stopped working after exactly one good day while
 * the heartbeat still looked plausible — the worst failure shape a backup
 * can have.
 *
 * So lock identity moves from "which connection am I on" — unknowable and
 * unstable behind a pool — to "which run am I", passed as a value. The
 * lease also EXPIRES, which preserves what 161 was reaching for and
 * actually delivers it: a run killed at Vercel's 60 s ceiling cannot wedge
 * the job, because the next run takes the lock once the lease lapses.
 */

/** Lease length. Deliberately above `maxDuration` (60 s) and well above
 * DEFAULT_BUDGET_MS (45 s), so a LIVE run can never outlive its own lease
 * and have it stolen mid-copy; and low enough that a DEAD run is recovered
 * within two minutes. */
const LOCK_TTL_SECONDS = 120;

/**
 * Default wall-clock budget. Vercel's limit is the function's
 * `maxDuration`; this sits well inside it so the run always gets to
 * write its manifest. Writing the manifest is what makes progress
 * durable, so it must never be the thing that gets cut off.
 */
export const DEFAULT_BUDGET_MS = 45_000;

export type BackupOptions = {
  budgetMs?: number;
  /** Injected for tests. */
  now?: () => Date;
  /** Skip the advisory lock — tests only; production always locks. */
  skipLock?: boolean;
};

export async function runBackup(
  service: SupabaseClient,
  destination: Destination,
  encryptionKeyBase64: string | undefined,
  options: BackupOptions = {}
): Promise<BackupRunReport> {
  const now = options.now ?? (() => new Date());
  const budgetMs = options.budgetMs ?? DEFAULT_BUDGET_MS;
  const startedAt = now();
  const deadline = startedAt.getTime() + budgetMs;

  // This run's identity for the lease (166). Random per run, never
  // derived from anything about the connection — that is the whole point.
  const holder = randomUUID();

  const base = {
    startedAt: startedAt.toISOString(),
    manifestVersion: MANIFEST_VERSION,
  };
  const finish = (
    partial: Omit<BackupRunReport, keyof typeof base | "finishedAt" | "durationMs">
  ): BackupRunReport => {
    const finishedAt = now();
    return {
      ...base,
      ...partial,
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - startedAt.getTime(),
    };
  };

  // The key is parsed before anything else: an unencryptable run must
  // not list, download, or touch the destination at all.
  let key: Buffer;
  try {
    key = parseKey(encryptionKeyBase64);
  } catch (err) {
    return finish({
      outcome: "failed",
      reason: sanitiseReason(err instanceof Error ? err.message : err),
      planned: null,
      copied: 0,
      bytesCopied: 0,
      forgotten: 0,
      failures: [],
      budgetExhausted: false,
      runCount: 0,
    });
  }

  // ---- LOCK ------------------------------------------------------------
  let locked = false;
  if (!options.skipLock) {
    // `backup_try_lock(holder, ttl)` takes the lease (166). An error here
    // means exclusivity cannot be established at all — the run refuses,
    // because two concurrent runs racing on one manifest is worse than a
    // skipped day.
    const { data, error } = await service.rpc("backup_try_lock", {
      p_holder: holder,
      p_ttl_seconds: LOCK_TTL_SECONDS,
    });
    if (error) {
      // Cannot establish exclusivity → refuse. Two concurrent runs
      // racing on one manifest is worse than a skipped day.
      return finish({
        outcome: "failed",
        reason: sanitiseReason(`could not acquire backup lock: ${error.message}`),
        planned: null,
        copied: 0,
        bytesCopied: 0,
        forgotten: 0,
        failures: [],
        budgetExhausted: false,
        runCount: 0,
      });
    }
    if (data !== true) {
      return finish({
        outcome: "skipped",
        reason: "another backup run holds the lock",
        planned: null,
        copied: 0,
        bytesCopied: 0,
        forgotten: 0,
        failures: [],
        budgetExhausted: false,
        runCount: 0,
      });
    }
    locked = true;
  }

  try {
    // ---- READ STATE ----------------------------------------------------
    const manifest = await loadManifest(destination, startedAt.toISOString());

    // Requirement 8: a failed suppression read FAILS the run. Treating
    // it as "nobody is suppressed" would re-copy objects this module
    // exists to remove.
    const suppressed = await loadSuppressedObjectKeys(service);

    const listings = await listAllBuckets(service);
    const sources = listings.flatMap((l) => l.objects);
    const completeBuckets = new Set(
      listings.filter((l) => l.complete).map((l) => l.bucket)
    );
    const listingFailures: ObjectFailure[] = listings
      .filter((l) => !l.complete)
      .map((l) => ({
        bucket: l.bucket,
        key: "(listing)",
        kind: "source_missing" as const,
        reason: sanitiseReason(`bucket listing incomplete: ${l.error ?? "unknown"}`),
      }));

    const plan = planBackup({ sources, manifest, suppressedKeys: suppressed.keys });

    // ---- PRUNE SUPPRESSED (requirement 8, second half) -----------------
    const { toDelete } = pruneSuppressed({
      manifest,
      suppressedKeys: suppressed.keys,
    });
    const failures: ObjectFailure[] = [...listingFailures];
    const prunedKeys: string[] = [];
    for (const entry of toDelete) {
      try {
        await destination.delete(entry.destinationPath);
        prunedKeys.push(`${entry.bucket}/${entry.key}`);
      } catch (err) {
        // A failed prune is reported and NOT recorded as pruned, so the
        // next run tries again. Silently dropping it from the manifest
        // would leave an orphaned copy of erased data at the destination.
        failures.push({
          bucket: entry.bucket,
          key: entry.key,
          kind: "upload_failed",
          reason: sanitiseReason(`suppression prune failed: ${String(err)}`),
        });
      }
    }

    // ---- COPY ----------------------------------------------------------
    const copied: ManifestEntry[] = [];
    let bytesCopied = 0;
    let budgetExhausted = false;

    for (const action of plan.actions) {
      if (action.action !== "copy") continue;
      if (now().getTime() >= deadline) {
        budgetExhausted = true;
        break;
      }

      const { object } = action;
      try {
        const bytes = await downloadObject(service, object.bucket, object.key);
        if (!bytes) {
          failures.push({
            bucket: object.bucket,
            key: object.key,
            kind: "source_missing",
            reason: "object was listed but could not be downloaded",
          });
          continue;
        }

        const digest = sha256Hex(bytes);
        const destinationPath = destinationPathFor(
          object.bucket,
          object.key,
          digest
        );

        // Idempotency: if the content-addressed object is already there
        // at the right size, do not re-upload. Under duplicate cron
        // delivery this is the common path.
        const existing = await destination.head(destinationPath);
        const envelope = encrypt(bytes, key);
        if (!existing || existing.size !== envelope.length) {
          await destination.put(destinationPath, envelope);
        }

        // Integrity: read back and prove the round trip. A destination
        // that accepted a PUT and stored something else is a real
        // failure mode and the whole point of a checksum.
        const readBack = await destination.get(destinationPath);
        if (!readBack) {
          failures.push({
            bucket: object.bucket,
            key: object.key,
            kind: "upload_failed",
            reason: "object was written but could not be read back",
          });
          continue;
        }
        const plain = decrypt(readBack, key);
        const verdict = verifyBytes(plain, digest);
        if (!verdict.ok) {
          failures.push({
            bucket: object.bucket,
            key: object.key,
            kind: "checksum_mismatch",
            reason: `stored object did not verify (expected ${digest.slice(0, 12)}, got ${verdict.actual.slice(0, 12)})`,
          });
          continue;
        }

        copied.push({
          bucket: object.bucket,
          key: object.key,
          sha256: digest,
          size: bytes.length,
          contentType: object.contentType,
          sourceUpdatedAt: object.updatedAt,
          backedUpAt: now().toISOString(),
          destinationPath,
          encrypted: true,
        });
        bytesCopied += bytes.length;
      } catch (err) {
        failures.push({
          bucket: object.bucket,
          key: object.key,
          kind: "upload_failed",
          reason: sanitiseReason(String(err)),
        });
      }
    }

    // ---- BOOKKEEPING ---------------------------------------------------
    // `forget` is only honoured for buckets that listed CLEANLY. A
    // truncated listing that we treated as complete would forget — and
    // later prune — objects that still exist. That is the one bug here
    // capable of destroying a good backup.
    const forgettable = plan.actions
      .filter((a) => a.action === "forget")
      .map((a) => (a as { entry: ManifestEntry }).entry)
      .filter((e) => completeBuckets.has(e.bucket as BucketName));

    const allBucketsComplete = listings.every((l) => l.complete);

    let buckets = manifest.buckets;
    let accessControl = manifest.accessControl;
    let recoveryPoint = manifest.recoveryPoint;
    try {
      buckets = await captureBucketConfig(service);
      accessControl = (await captureAccessControl(service)) ?? accessControl;
      recoveryPoint = await captureRecoveryPoint(service, now());
    } catch (err) {
      // Metadata capture degrades the manifest; it does not fail a run
      // that successfully copied objects.
      failures.push({
        bucket: "cvs",
        key: "(metadata)",
        kind: "download_failed",
        reason: sanitiseReason(`metadata capture failed: ${String(err)}`),
      });
    }

    const updated = applyToManifest({
      manifest: { ...manifest, buckets, accessControl, recoveryPoint },
      copied,
      forgotten: forgettable,
      suppressedKeysRecorded: prunedKeys,
      allowForget: allBucketsComplete,
      now: now().toISOString(),
    });

    const outstanding =
      plan.summary.copyNew + plan.summary.copyChanged - copied.length;

    const finalManifest = {
      ...updated,
      runCount: manifest.runCount + 1,
      lastRunFailures: failures,
    };
    await saveManifest(destination, finalManifest);

    const outcome: BackupRunReport["outcome"] =
      failures.length === 0 && outstanding === 0 ? "complete" : "partial";

    return finish({
      outcome,
      reason:
        outcome === "partial"
          ? describePartial(outstanding, failures.length, budgetExhausted)
          : null,
      planned: plan.summary,
      copied: copied.length,
      bytesCopied,
      forgotten: allBucketsComplete ? forgettable.length : 0,
      failures,
      budgetExhausted,
      runCount: finalManifest.runCount,
    });
  } catch (err) {
    return finish({
      outcome: "failed",
      reason: sanitiseReason(err instanceof Error ? err.message : String(err)),
      planned: null,
      copied: 0,
      bytesCopied: 0,
      forgotten: 0,
      failures: [],
      budgetExhausted: false,
      runCount: 0,
    });
  } finally {
    if (locked) {
      // Holder-scoped release. Unlike 161's version this genuinely works
      // from whichever pooled connection serves it, because the lease is
      // a row keyed by THIS run's holder token rather than by session.
      // Still best-effort — if it fails, the lease expires on its own
      // within LOCK_TTL_SECONDS, which is the property 161 only claimed.
      // The builder is thenable but not a Promise, so wrap before catching.
      await Promise.resolve(
        service.rpc("backup_release_lock", { p_holder: holder })
      ).catch(() => {});
    }
  }
}

function describePartial(
  outstanding: number,
  failureCount: number,
  budgetExhausted: boolean
): string {
  const bits: string[] = [];
  if (budgetExhausted) {
    bits.push(
      `stopped on the time budget with ${outstanding} object(s) outstanding — the next run resumes`
    );
  } else if (outstanding > 0) {
    bits.push(`${outstanding} object(s) were not copied`);
  }
  if (failureCount > 0) bits.push(`${failureCount} failure(s) recorded`);
  return bits.join("; ") || "partial";
}
