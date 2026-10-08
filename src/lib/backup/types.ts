/**
 * The backup module's vocabulary.
 *
 * Storage objects are the one asset class no Supabase plan backs up —
 * verified 2026-10-07: "Database backups do not include objects you
 * store via the Storage API, as the database only includes metadata
 * about these objects." The `cvs` bucket holds candidate CVs, which are
 * the agency's primary working material, so a database-only restore
 * yields rows whose `cv_url` points at nothing.
 *
 * Design constraints this vocabulary exists to serve (all verified
 * against Vercel's cron documentation, 2026-10-07):
 *
 *   * Vercel "will not retry an invocation if a cron job fails", so a
 *     run must leave enough state behind that the NEXT run finishes the
 *     job. Hence a durable manifest rather than a log line.
 *   * Delivery is "best effort" and can both MISS a run and fire the
 *     same run TWICE. So planning is reconciliation — source truth
 *     against destination manifest — never "what changed yesterday",
 *     and every action is idempotent.
 *   * Invocations can overlap, so a run holds a lock.
 *   * Duration is capped, so a run stops on a budget and resumes.
 *
 * The manifest is VERSIONED because its shape is a restore dependency:
 * a restore reads manifests written by older code, and silently
 * misreading one is how a backup becomes a false sense of security.
 */

/** Bumped only when the on-disk manifest shape changes incompatibly. */
export const MANIFEST_VERSION = 1 as const;

/** Buckets this module backs up. Mirrors `storage.buckets`. */
export const BACKED_UP_BUCKETS = [
  "cvs",
  "call-audio",
  "invoice-assets",
] as const;

export type BucketName = (typeof BACKED_UP_BUCKETS)[number];

/**
 * One object as the SOURCE describes it. `sha256` is absent until the
 * bytes have been read — listing gives us size and etag cheaply, and we
 * avoid downloading an object we can already prove is unchanged.
 */
export type SourceObject = {
  bucket: BucketName;
  /** Object key within the bucket, byte-exact — a restore depends on it. */
  key: string;
  size: number;
  /** Storage's own etag, when available. A cheap change hint, not proof. */
  etag: string | null;
  /** Last-modified per the source, ISO 8601. */
  updatedAt: string | null;
  contentType: string | null;
};

/**
 * One object as the BACKUP holds it. `sha256` is mandatory here: an
 * entry without a checksum cannot be verified, and an unverifiable
 * backup is the thing this module exists to avoid.
 */
export type ManifestEntry = {
  bucket: BucketName;
  key: string;
  /** Of the PLAINTEXT bytes, so integrity is independent of encryption. */
  sha256: string;
  /** Plaintext size. The stored object is larger (nonce + tag). */
  size: number;
  contentType: string | null;
  /** Source's last-modified at copy time, for operator forensics. */
  sourceUpdatedAt: string | null;
  /** When this backup copied it, ISO 8601. */
  backedUpAt: string;
  /** Destination path, so a restore never has to recompute a layout. */
  destinationPath: string;
  /** Whether the stored bytes are encrypted. Always true in production. */
  encrypted: boolean;
};

/**
 * Everything a restore needs that is NOT an object: bucket settings and
 * an access-control snapshot. Requirement 5 — a restore into a fresh
 * project must re-create buckets with the same privacy, size limit and
 * MIME allowlist, or uploads silently change behaviour.
 */
export type BucketConfigSnapshot = {
  name: string;
  public: boolean;
  fileSizeLimit: number | null;
  allowedMimeTypes: string[] | null;
};

export type AccessControlSnapshot = {
  /** Storage RLS policies, captured so a restore can be VERIFIED rather
   * than assumed. The migrations remain the source of truth. */
  storagePolicies: Array<{
    policyName: string;
    command: string;
    roles: string[];
  }>;
};

/**
 * The recovery point this manifest pairs with. Requirement 7: a file
 * backup at 06:00 beside a database backup at 02:00 leaves a window
 * where the database references objects the file backup lacks. Recording
 * the database's observed state makes the pairing explicit instead of
 * something an operator reconstructs under pressure.
 */
export type RecoveryPoint = {
  /** When this run observed the database, ISO 8601. */
  observedAt: string;
  /**
   * Monotonic-ish database markers, so a restore can tell which side is
   * ahead. Counts are cheap and need no new table.
   */
  markers: {
    candidates: number;
    candidateNotes: number;
    /** Newest `updated_at` seen across the referencing tables. */
    latestCandidateUpdate: string | null;
  };
  /**
   * What the operator must pair this with. Free-text because the
   * database side is a managed Supabase backup, not ours to name.
   */
  databaseBackupHint: string;
};

/** Why an object was not copied. Reported, never silently dropped. */
export type FailureKind =
  | "download_failed"
  | "upload_failed"
  | "checksum_mismatch"
  | "suppressed_by_erasure"
  | "source_missing";

export type ObjectFailure = {
  bucket: BucketName;
  key: string;
  kind: FailureKind;
  /**
   * A short reason. NEVER object content, never a credential — the
   * scrubber in `report.ts` enforces a cap and a shape.
   */
  reason: string;
};

/** A versioned, self-describing backup manifest. */
export type BackupManifest = {
  version: typeof MANIFEST_VERSION;
  /** When this manifest was last written, ISO 8601. */
  updatedAt: string;
  /** Monotonic run counter, for operator legibility. */
  runCount: number;
  entries: ManifestEntry[];
  buckets: BucketConfigSnapshot[];
  accessControl: AccessControlSnapshot | null;
  recoveryPoint: RecoveryPoint | null;
  /**
   * Objects this module REFUSED to back up because the person they
   * belong to has an active suppression. Requirement 8 — recorded by
   * key so a restore cannot quietly resurrect them, and deliberately
   * without a name or an email.
   */
  suppressedKeys: string[];
  /** Carried forward so a reader sees the last run's honest outcome. */
  lastRunFailures: ObjectFailure[];
};

/** What a reconciliation decided to do about one object. */
export type PlannedAction =
  | { action: "copy"; object: SourceObject; reason: "new" | "changed" }
  | { action: "skip"; object: SourceObject; reason: "unchanged" }
  | { action: "skip"; object: SourceObject; reason: "suppressed" }
  | { action: "forget"; entry: ManifestEntry; reason: "source_deleted" };

export type BackupPlan = {
  actions: PlannedAction[];
  /** Totals, so a caller can log a summary without walking the list. */
  summary: {
    copyNew: number;
    copyChanged: number;
    skipUnchanged: number;
    skipSuppressed: number;
    forget: number;
    bytesToCopy: number;
  };
};

/** The outcome of one run. Partial success is a first-class result. */
export type BackupRunReport = {
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  /**
   * `complete` — the plan was fully executed.
   * `partial` — the time budget stopped us, or some objects failed. The
   *   next run resumes; this is NOT an error state.
   * `failed` — nothing useful happened.
   * `skipped` — another run holds the lock, or the feature is off.
   */
  outcome: "complete" | "partial" | "failed" | "skipped";
  reason: string | null;
  planned: BackupPlan["summary"] | null;
  copied: number;
  bytesCopied: number;
  forgotten: number;
  failures: ObjectFailure[];
  /** True when the budget ended the run with work outstanding. */
  budgetExhausted: boolean;
  manifestVersion: number;
  runCount: number;
};
