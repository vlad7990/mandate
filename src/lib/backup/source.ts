import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  BACKED_UP_BUCKETS,
  type AccessControlSnapshot,
  type BucketConfigSnapshot,
  type BucketName,
  type RecoveryPoint,
  type SourceObject,
} from "./types";

/**
 * Reading the source of truth: what objects exist, how the buckets are
 * configured, and where the database stood when we looked.
 *
 * Listing is paged and reports completeness, because the planner's
 * `forget` action is only safe to honour when a bucket listed cleanly.
 * A truncated listing that looked complete would cause the next run to
 * forget — and therefore eventually prune — objects that still exist.
 * That is the one bug in this module that would destroy a good backup,
 * so the completeness flag travels with the data rather than being
 * assumed by the caller.
 */

export class SourceListError extends Error {}

export type BucketListing = {
  bucket: BucketName;
  objects: SourceObject[];
  /** False when paging failed partway. The runner must not forget then. */
  complete: boolean;
  error: string | null;
};

const PAGE_SIZE = 1000;

/**
 * List one bucket exhaustively, recursing into prefixes.
 *
 * Supabase's `list()` is directory-shaped: an entry with no `id` is a
 * prefix, not an object. Flat listing is not offered, so this walks.
 */
export async function listBucket(
  service: SupabaseClient,
  bucket: BucketName
): Promise<BucketListing> {
  const objects: SourceObject[] = [];
  let complete = true;
  let error: string | null = null;

  async function walk(prefix: string): Promise<void> {
    let offset = 0;
    for (;;) {
      const { data, error: listErr } = await service.storage
        .from(bucket)
        .list(prefix, { limit: PAGE_SIZE, offset, sortBy: { column: "name", order: "asc" } });

      if (listErr) {
        complete = false;
        error = listErr.message;
        return;
      }
      const page = data ?? [];
      for (const item of page) {
        const childPath = prefix ? `${prefix}/${item.name}` : item.name;
        // No `id` means this is a prefix (a "folder"), not an object.
        if (!item.id) {
          await walk(childPath);
          continue;
        }
        const meta = (item.metadata ?? {}) as Record<string, unknown>;
        objects.push({
          bucket,
          key: childPath,
          size: Number(meta.size ?? 0),
          etag: typeof meta.eTag === "string" ? meta.eTag : null,
          updatedAt: item.updated_at ?? null,
          contentType: typeof meta.mimetype === "string" ? meta.mimetype : null,
        });
      }
      if (page.length < PAGE_SIZE) return;
      offset += PAGE_SIZE;
    }
  }

  await walk("");
  return { bucket, objects, complete, error };
}

export async function listAllBuckets(
  service: SupabaseClient
): Promise<BucketListing[]> {
  const out: BucketListing[] = [];
  for (const bucket of BACKED_UP_BUCKETS) {
    out.push(await listBucket(service, bucket));
  }
  return out;
}

/** Download one object's bytes. Null when the source no longer has it. */
export async function downloadObject(
  service: SupabaseClient,
  bucket: BucketName,
  key: string
): Promise<Uint8Array | null> {
  const { data, error } = await service.storage.from(bucket).download(key);
  if (error) {
    // Supabase does not type a 404 distinctly; treat "not found" as a
    // missing source rather than a transport failure, since the runner
    // reports those differently.
    if (/not.?found|does not exist/i.test(error.message)) return null;
    throw new SourceListError(`download failed for ${bucket}/${key}: ${error.message}`);
  }
  if (!data) return null;
  return new Uint8Array(await data.arrayBuffer());
}

/**
 * Requirement 5 — bucket configuration, so a restore into a fresh
 * project re-creates buckets with the same privacy, size limit and MIME
 * allowlist. Restoring objects into a bucket that is public, or that
 * accepts different MIME types, changes the product's behaviour silently.
 */
export async function captureBucketConfig(
  service: SupabaseClient
): Promise<BucketConfigSnapshot[]> {
  const { data, error } = await service.storage.listBuckets();
  if (error) {
    throw new SourceListError(`could not read bucket configuration: ${error.message}`);
  }
  return (data ?? [])
    .filter((b) => (BACKED_UP_BUCKETS as readonly string[]).includes(b.name))
    .map((b) => ({
      name: b.name,
      public: Boolean(b.public),
      fileSizeLimit:
        typeof b.file_size_limit === "number" ? b.file_size_limit : null,
      allowedMimeTypes: Array.isArray(b.allowed_mime_types)
        ? (b.allowed_mime_types as string[])
        : null,
    }));
}

/**
 * Requirement 5 — an access-control snapshot. The migrations remain the
 * source of truth for storage RLS; this exists so a restore can be
 * VERIFIED against what was actually in force, rather than assumed from
 * a migration that may post-date the backup.
 *
 * Best-effort: a failure here degrades the manifest, it does not fail
 * the run. Objects without a policy snapshot are still recoverable;
 * objects not backed up at all are not.
 */
export async function captureAccessControl(
  service: SupabaseClient
): Promise<AccessControlSnapshot | null> {
  const { data, error } = await service.rpc("backup_storage_policy_snapshot");
  if (error || !data) {
    // The RPC is optional and may not exist. Returning null is honest:
    // the manifest records that no snapshot was captured.
    return null;
  }
  try {
    const rows = data as Array<{
      policyname: string;
      cmd: string;
      roles: string[] | null;
    }>;
    return {
      storagePolicies: rows.map((r) => ({
        policyName: r.policyname,
        command: r.cmd,
        roles: r.roles ?? [],
      })),
    };
  } catch {
    return null;
  }
}

/**
 * Requirement 7 — the database recovery point this manifest pairs with.
 *
 * The problem: Supabase's managed database backup runs on its own
 * schedule, and this file backup runs on ours. If the database is
 * restored to 02:00 and files to 06:00, four hours of objects exist that
 * no row references, and — worse — rows may reference objects the file
 * backup does not have.
 *
 * Nothing can make two independent backups atomic. What CAN be done is
 * record enough of the database's observed state that an operator can
 * see which side is ahead and by how much, instead of discovering it
 * mid-restore. Counts and a max-timestamp are cheap, need no new table,
 * and are exactly the comparison a restore wants.
 */
export async function captureRecoveryPoint(
  service: SupabaseClient,
  now: Date
): Promise<RecoveryPoint> {
  const [candidates, notes, latest] = await Promise.all([
    service.from("candidates").select("id", { count: "exact", head: true }),
    service
      .from("candidate_notes")
      .select("id", { count: "exact", head: true })
      .not("audio_path", "is", null),
    service
      .from("candidates")
      .select("updated_at")
      .order("updated_at", { ascending: false })
      .limit(1),
  ]);

  return {
    observedAt: now.toISOString(),
    markers: {
      candidates: candidates.count ?? -1,
      candidateNotes: notes.count ?? -1,
      latestCandidateUpdate:
        (latest.data?.[0]?.updated_at as string | undefined) ?? null,
    },
    databaseBackupHint:
      "Pair with the Supabase daily database backup taken nearest BEFORE observedAt. " +
      "If the database backup is older than observedAt, rows may reference objects " +
      "this manifest does not list; if newer, this manifest may list objects no row " +
      "references. Neither is corruption — see the runbook's reconciliation step.",
  };
}
