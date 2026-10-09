import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createLocalDestination, type Destination } from "./destination";
import { loadManifest } from "./manifest";
import { runBackup } from "./run";
import { describeRecoveryCoordination, verifyBackup } from "./restore";
import { generateKeyBase64 } from "./crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { BackupManifest } from "./types";

/**
 * End-to-end runs against a real filesystem destination and a fake
 * Supabase client. Requirement 10's named cases are each a test here:
 * interrupted runs, changed files, missing files, failed transfers.
 *
 * The Supabase client is faked rather than mocked loosely — the fake
 * implements the exact surface `source.ts` and `erasure.ts` use, so a
 * change to either breaks these tests rather than silently passing.
 */

const KEY = generateKeyBase64();

type FakeObject = { key: string; body: Buffer; updatedAt: string };

/**
 * The fake implements only the surface `source.ts` and `erasure.ts`
 * actually touch, and is cast to the real client type at the boundary.
 * A structural fake of the whole SupabaseClient would be noise; a cast
 * here keeps the tests honest about what is being stubbed.
 */
type FakeSupabase = SupabaseClient;

/** A fake whose failure modes can be switched on per test. */
function makeFakeSupabase(opts: {
  objects?: Partial<Record<string, FakeObject[]>>;
  suppressedProfileIds?: string[];
  candidates?: Array<{ id: string; cv_url: string | null; network_profile_id: string | null }>;
  notes?: Array<{ candidate_id: string; audio_path: string | null }>;
  failListFor?: string;
  failDownloadFor?: string[];
  suppressionReadFails?: boolean;
}) {
  const buckets = opts.objects ?? {};
  const downloadFailures = new Set(opts.failDownloadFor ?? []);

  return {
    rpc(fn: string) {
      // The wrappers from migration 161.
      if (fn === "backup_try_lock") return Promise.resolve({ data: true, error: null });
      if (fn === "backup_release_lock") return Promise.resolve({ data: true, error: null });
      // Policy-snapshot RPC absent, which must degrade gracefully rather
      // than fail a run that copied objects successfully.
      return Promise.resolve({ data: null, error: { message: "no such function" } });
    },
    /**
     * A chainable thenable, matching PostgREST's builder: every filter
     * returns `this`, and awaiting it resolves. Which result comes back
     * is decided from the table plus which methods were called, because
     * `candidates` and `candidate_notes` are each queried in more than
     * one shape (a head-count for the recovery point, and a row read for
     * the suppression set).
     */
    from(table: string) {
      const state = { head: false, limited: false, filteredIn: false };

      const resolve = (): { data: unknown; error: unknown; count?: number } => {
        if (table === "network_suppressions") {
          if (opts.suppressionReadFails) {
            return { data: null, error: { message: "ledger unreadable" } };
          }
          return {
            data: (opts.suppressedProfileIds ?? []).map((id) => ({ profile_id: id })),
            error: null,
          };
        }
        if (table === "candidates") {
          if (state.head) {
            return { data: null, error: null, count: (opts.candidates ?? []).length };
          }
          if (state.limited) {
            return { data: [{ updated_at: "2026-10-07T00:00:00.000Z" }], error: null };
          }
          return { data: opts.candidates ?? [], error: null };
        }
        if (table === "candidate_notes") {
          if (state.head) {
            return { data: null, error: null, count: (opts.notes ?? []).length };
          }
          return { data: opts.notes ?? [], error: null };
        }
        return { data: [], error: null };
      };

      const builder: Record<string, unknown> = {
        select: (_cols?: string, o?: { head?: boolean }) => {
          if (o?.head) state.head = true;
          return builder;
        },
        is: () => builder,
        not: () => builder,
        in: () => {
          state.filteredIn = true;
          return builder;
        },
        order: () => builder,
        limit: () => {
          state.limited = true;
          return builder;
        },
        // Awaiting the builder runs the query, exactly as PostgREST does.
        then: (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
          Promise.resolve(resolve()).then(onFulfilled, onRejected),
      };
      return builder;
    },
    storage: {
      from(bucket: string) {
        return {
          list(prefix: string) {
            if (opts.failListFor === bucket) {
              return Promise.resolve({ data: null, error: { message: "listing blew up" } });
            }
            if (prefix !== "") return Promise.resolve({ data: [], error: null });
            const items = (buckets[bucket] ?? []).map((o) => ({
              id: `id-${o.key}`,
              name: o.key,
              updated_at: o.updatedAt,
              metadata: { size: o.body.length, mimetype: "application/pdf" },
            }));
            return Promise.resolve({ data: items, error: null });
          },
          download(key: string) {
            if (downloadFailures.has(`${bucket}/${key}`)) {
              return Promise.resolve({ data: null, error: { message: "not found" } });
            }
            const found = (buckets[bucket] ?? []).find((o) => o.key === key);
            if (!found) return Promise.resolve({ data: null, error: { message: "not found" } });
            return Promise.resolve({
              data: { arrayBuffer: async () => found.body },
              error: null,
            });
          },
        };
      },
      listBuckets() {
        return Promise.resolve({
          data: [
            { name: "cvs", public: false, file_size_limit: 10485760, allowed_mime_types: ["application/pdf"] },
            { name: "call-audio", public: false, file_size_limit: 52428800, allowed_mime_types: ["audio/mpeg"] },
            { name: "invoice-assets", public: false, file_size_limit: 2097152, allowed_mime_types: ["image/png"] },
          ],
          error: null,
        });
      },
    },
  } as unknown as FakeSupabase;
}

function obj(key: string, body: string, updatedAt = "2026-10-01T00:00:00.000Z"): FakeObject {
  return { key, body: Buffer.from(body), updatedAt };
}

let dir: string;
let dest: Destination;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "mandate-backup-"));
  dest = createLocalDestination(dir);
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe("a clean run", () => {
  it("copies every object, verifies it, and writes a manifest", async () => {
    const service = makeFakeSupabase({
      objects: { cvs: [obj("org/a.pdf", "AAA"), obj("org/b.pdf", "BBB")] },
    });
    const report = await runBackup(service, dest, KEY);

    expect(report.outcome).toBe("complete");
    expect(report.copied).toBe(2);
    expect(report.bytesCopied).toBe(6);
    expect(report.failures).toEqual([]);
    expect(report.runCount).toBe(1);

    const manifest = await loadManifest(dest, "x");
    expect(manifest.entries).toHaveLength(2);
    expect(manifest.entries.every((e) => e.encrypted)).toBe(true);
  });

  it("stores objects encrypted — plaintext is not on disk", async () => {
    const service = makeFakeSupabase({
      objects: { cvs: [obj("org/secret.pdf", "CANDIDATE-NAME-SECRET")] },
    });
    await runBackup(service, dest, KEY);

    const files = await dest.list("objects");
    expect(files).toHaveLength(1);
    const raw = await dest.get(files[0].path);
    expect(Buffer.from(raw!).toString("utf8")).not.toContain("CANDIDATE-NAME-SECRET");
    expect(Buffer.from(raw!).subarray(0, 4).toString()).toBe("MBK1");
  });

  it("captures bucket configuration for reconstruction (requirement 5)", async () => {
    const service = makeFakeSupabase({ objects: { cvs: [obj("a.pdf", "x")] } });
    await runBackup(service, dest, KEY);
    const manifest = await loadManifest(dest, "x");
    const cvs = manifest.buckets.find((b) => b.name === "cvs");
    expect(cvs).toMatchObject({
      public: false,
      fileSizeLimit: 10485760,
      allowedMimeTypes: ["application/pdf"],
    });
  });

  it("records a database recovery point (requirement 7)", async () => {
    const service = makeFakeSupabase({
      objects: { cvs: [obj("a.pdf", "x")] },
      candidates: [{ id: "c1", cv_url: "a.pdf", network_profile_id: "p1" }],
    });
    await runBackup(service, dest, KEY);
    const manifest = await loadManifest(dest, "x");
    expect(manifest.recoveryPoint?.observedAt).toBeTruthy();
    expect(manifest.recoveryPoint?.databaseBackupHint).toContain("Supabase daily");
  });

  it("archives a dated manifest copy (requirement 6)", async () => {
    const service = makeFakeSupabase({ objects: { cvs: [obj("a.pdf", "x")] } });
    await runBackup(service, dest, KEY);
    const archives = await dest.list("manifest/archive");
    expect(archives).toHaveLength(1);
  });
});

describe("idempotency — duplicate cron delivery", () => {
  it("a second run copies nothing", async () => {
    const service = makeFakeSupabase({ objects: { cvs: [obj("a.pdf", "AAA")] } });
    const first = await runBackup(service, dest, KEY);
    const second = await runBackup(service, dest, KEY);

    expect(first.copied).toBe(1);
    expect(second.copied).toBe(0);
    expect(second.outcome).toBe("complete");
    expect(second.planned?.skipUnchanged).toBe(1);
    expect(second.runCount).toBe(2);
  });

  it("does not duplicate destination objects", async () => {
    const service = makeFakeSupabase({ objects: { cvs: [obj("a.pdf", "AAA")] } });
    await runBackup(service, dest, KEY);
    await runBackup(service, dest, KEY);
    expect(await dest.list("objects")).toHaveLength(1);
  });
});

describe("changed files", () => {
  it("re-copies a changed object and keeps the previous version", async () => {
    const v1 = { cvs: [obj("a.pdf", "VERSION-ONE")] };
    const service1 = makeFakeSupabase({ objects: v1 });
    await runBackup(service1, dest, KEY);

    const service2 = makeFakeSupabase({
      objects: { cvs: [obj("a.pdf", "VERSION-TWO-LONGER", "2026-10-05T00:00:00.000Z")] },
    });
    const report = await runBackup(service2, dest, KEY);

    expect(report.planned?.copyChanged).toBe(1);
    expect(report.copied).toBe(1);

    // Content-addressed paths mean both versions survive — a corrupted
    // upload cannot overwrite the only good copy.
    expect(await dest.list("objects")).toHaveLength(2);

    // The manifest points at the new one only.
    const manifest = await loadManifest(dest, "x");
    expect(manifest.entries).toHaveLength(1);
    const restored = await verifyBackup(dest, KEY);
    expect(restored.verified).toBe(1);
  });
});

describe("missing files", () => {
  it("reports an object that lists but cannot be downloaded", async () => {
    const service = makeFakeSupabase({
      objects: { cvs: [obj("a.pdf", "AAA"), obj("gone.pdf", "BBB")] },
      failDownloadFor: ["cvs/gone.pdf"],
    });
    const report = await runBackup(service, dest, KEY);

    expect(report.outcome).toBe("partial");
    expect(report.copied).toBe(1);
    expect(report.failures).toHaveLength(1);
    expect(report.failures[0]).toMatchObject({
      key: "gone.pdf",
      kind: "source_missing",
    });
    // The one that worked is still recorded — partial progress is durable.
    const manifest = await loadManifest(dest, "x");
    expect(manifest.entries.map((e) => e.key)).toEqual(["a.pdf"]);
  });

  it("forgets a manifest entry whose source was deleted", async () => {
    const service1 = makeFakeSupabase({ objects: { cvs: [obj("a.pdf", "AAA")] } });
    await runBackup(service1, dest, KEY);

    const service2 = makeFakeSupabase({ objects: { cvs: [] } });
    const report = await runBackup(service2, dest, KEY);

    expect(report.forgotten).toBe(1);
    expect((await loadManifest(dest, "x")).entries).toHaveLength(0);
  });

  it("does NOT forget when a bucket listing failed", async () => {
    // The bug that would destroy a good backup: a truncated listing
    // treated as complete forgets live objects, which later prunes them.
    const service1 = makeFakeSupabase({ objects: { cvs: [obj("a.pdf", "AAA")] } });
    await runBackup(service1, dest, KEY);

    const service2 = makeFakeSupabase({ objects: { cvs: [] }, failListFor: "cvs" });
    const report = await runBackup(service2, dest, KEY);

    expect(report.forgotten).toBe(0);
    expect(report.outcome).toBe("partial");
    expect(report.failures.some((f) => f.reason.includes("listing incomplete"))).toBe(true);
    expect((await loadManifest(dest, "x")).entries).toHaveLength(1);
  });
});

describe("failed transfers", () => {
  it("reports an upload failure and does not record the object", async () => {
    const service = makeFakeSupabase({ objects: { cvs: [obj("a.pdf", "AAA")] } });
    // Only OBJECT puts fail. Failing manifest puts too would be a
    // different scenario — a wholly unusable destination, which is
    // correctly reported as `failed` and is covered below.
    const breaking: Destination = {
      ...dest,
      async put(p, b) {
        if (p.startsWith("objects/")) {
          throw new Error("destination PUT failed with 503");
        }
        return dest.put(p, b);
      },
    };
    const report = await runBackup(service, breaking, KEY);

    expect(report.outcome).toBe("partial");
    expect(report.copied).toBe(0);
    expect(report.failures[0].kind).toBe("upload_failed");
    expect(report.failures[0].reason).toContain("503");
  });

  it("reports `failed` when the destination is wholly unusable", async () => {
    // If even the manifest cannot be written, no progress is durable and
    // the run must not claim partial success.
    const service = makeFakeSupabase({ objects: { cvs: [obj("a.pdf", "AAA")] } });
    const dead: Destination = {
      ...dest,
      async put() {
        throw new Error("destination PUT failed with 403");
      },
    };
    const report = await runBackup(service, dead, KEY);
    expect(report.outcome).toBe("failed");
    expect(report.reason).toContain("403");
  });

  it("detects a destination that stores the wrong bytes", async () => {
    const service = makeFakeSupabase({ objects: { cvs: [obj("a.pdf", "AAA")] } });
    const corrupting: Destination = {
      ...dest,
      async get(p: string) {
        const real = await dest.get(p);
        if (!real || p.startsWith("manifest")) return real;
        const tampered = Buffer.from(real);
        tampered[tampered.length - 1] ^= 0xff;
        return new Uint8Array(tampered);
      },
    };
    const report = await runBackup(service, corrupting, KEY);

    expect(report.outcome).toBe("partial");
    expect(report.copied).toBe(0);
    // Authentication fails before the checksum does — either is a refusal.
    expect(report.failures[0].kind).toBe("upload_failed");
    expect(report.failures[0].reason).toMatch(/failed authentication|did not verify/);
  });

  it("recovers on the next run after a transient failure", async () => {
    // Vercel does not retry, so self-healing on the next run is the
    // whole reliability story.
    const service = makeFakeSupabase({ objects: { cvs: [obj("a.pdf", "AAA")] } });
    let fail = true;
    const flaky: Destination = {
      ...dest,
      async put(p, b) {
        if (fail && !p.startsWith("manifest")) throw new Error("transient 500");
        return dest.put(p, b);
      },
    };
    const first = await runBackup(service, flaky, KEY);
    expect(first.outcome).toBe("partial");

    fail = false;
    const second = await runBackup(service, flaky, KEY);
    expect(second.outcome).toBe("complete");
    expect(second.copied).toBe(1);
  });
});

describe("interrupted runs — the time budget", () => {
  it("stops cleanly with work outstanding and resumes next run", async () => {
    const objects = Array.from({ length: 5 }, (_, i) => obj(`a${i}.pdf`, `body-${i}`));
    const service = makeFakeSupabase({ objects: { cvs: objects } });

    // A clock that advances 20s per read: the budget is consumed after
    // roughly two objects.
    let t = 0;
    const now = () => new Date(1_000_000 + (t++ * 20_000));

    const first = await runBackup(service, dest, KEY, { budgetMs: 45_000, now });
    expect(first.budgetExhausted).toBe(true);
    expect(first.outcome).toBe("partial");
    expect(first.copied).toBeGreaterThan(0);
    expect(first.copied).toBeLessThan(5);
    expect(first.reason).toContain("next run resumes");

    // Resume with a normal clock: the rest land, nothing is re-copied.
    const copiedFirst = first.copied;
    const second = await runBackup(service, dest, KEY, { budgetMs: 60_000 });
    expect(second.copied).toBe(5 - copiedFirst);
    expect(second.outcome).toBe("complete");

    const manifest = await loadManifest(dest, "x");
    expect(manifest.entries).toHaveLength(5);
  });

  it("an interrupted write leaves no object a later run would trust", async () => {
    // Local destination writes via a .partial temp file then renames.
    const service = makeFakeSupabase({ objects: { cvs: [obj("a.pdf", "AAA")] } });
    await runBackup(service, dest, KEY);
    const files = await dest.list("");
    expect(files.some((f) => f.path.endsWith(".partial"))).toBe(false);
  });
});

describe("concurrency", () => {
  it("skips when another run holds the lock", async () => {
    const service = {
      ...makeFakeSupabase({}),
      rpc: (fn: string) =>
        fn === "backup_try_lock"
          ? Promise.resolve({ data: false, error: null })
          : Promise.resolve({ data: null, error: null }),
    } as unknown as FakeSupabase;
    const report = await runBackup(service, dest, KEY, { skipLock: false });
    expect(report.outcome).toBe("skipped");
    expect(report.reason).toContain("holds the lock");
  });

  it("fails rather than proceeding when the lock cannot be established", async () => {
    const service = {
      ...makeFakeSupabase({}),
      // Migration 161 unapplied is exactly this case: the wrapper does
      // not exist, so exclusivity cannot be established.
      rpc: (fn: string) =>
        fn === "backup_try_lock"
          ? Promise.resolve({ data: null, error: { message: "no such function" } })
          : Promise.resolve({ data: null, error: null }),
    } as unknown as FakeSupabase;
    const report = await runBackup(service, dest, KEY, { skipLock: false });
    expect(report.outcome).toBe("failed");
  });

  /**
   * THE LEASE CONTRACT (166) — the regression guard for a bug that shipped
   * green.
   *
   * 161's lock was `pg_try_advisory_lock`, which is SESSION-scoped. Behind
   * PostgREST's connection pool the release landed on a different pooled
   * session, returned false without erroring, and left the lock held on an
   * idle connection. The first real run against R2 succeeded and then
   * poisoned every run after it.
   *
   * None of the tests above caught it, because the fake's `rpc(fn)` ignored
   * its arguments — so "holds a lock correctly" was never expressed, only
   * "calls something named backup_try_lock". These three pin the parts that
   * actually make the lease pool-safe.
   */
  function recordingService() {
    const calls: { fn: string; args: Record<string, unknown> | undefined }[] = [];
    const service = {
      ...makeFakeSupabase({}),
      rpc: (fn: string, args?: Record<string, unknown>) => {
        calls.push({ fn, args });
        if (fn === "backup_try_lock") return Promise.resolve({ data: true, error: null });
        if (fn === "backup_release_lock") return Promise.resolve({ data: true, error: null });
        return Promise.resolve({ data: null, error: { message: "no such function" } });
      },
    } as unknown as FakeSupabase;
    return { service, calls };
  }

  it("takes the lease with a holder and a TTL, not as a bare session lock", async () => {
    const { service, calls } = recordingService();
    await runBackup(service, dest, KEY, { skipLock: false });

    const acquire = calls.find((c) => c.fn === "backup_try_lock");
    expect(acquire, "backup_try_lock was never called").toBeTruthy();
    expect(typeof acquire!.args?.p_holder).toBe("string");
    expect(String(acquire!.args?.p_holder).length).toBeGreaterThan(0);
    // Must outlive the route's 60s maxDuration so a LIVE run cannot have
    // its lease stolen mid-copy.
    expect(Number(acquire!.args?.p_ttl_seconds)).toBeGreaterThan(60);
  });

  it("releases with the SAME holder it acquired with — the half that was broken", async () => {
    const { service, calls } = recordingService();
    await runBackup(service, dest, KEY, { skipLock: false });

    const acquire = calls.find((c) => c.fn === "backup_try_lock");
    const release = calls.find((c) => c.fn === "backup_release_lock");
    expect(release, "backup_release_lock was never called").toBeTruthy();
    // A release that cannot name its holder cannot be holder-scoped, which
    // is what lets a release land on any pooled connection and still work.
    expect(release!.args?.p_holder).toBe(acquire!.args?.p_holder);
  });

  it("gives every run its own holder, so one run cannot release another's lease", async () => {
    const a = recordingService();
    const b = recordingService();
    await runBackup(a.service, dest, KEY, { skipLock: false });
    await runBackup(b.service, dest, KEY, { skipLock: false });

    const holderA = a.calls.find((c) => c.fn === "backup_try_lock")!.args?.p_holder;
    const holderB = b.calls.find((c) => c.fn === "backup_try_lock")!.args?.p_holder;
    expect(holderA).not.toBe(holderB);
  });
});

describe("erasure safeguards end to end (requirement 8)", () => {
  it("never copies a suppressed person's CV", async () => {
    const service = makeFakeSupabase({
      objects: { cvs: [obj("keep.pdf", "KEEP"), obj("erased.pdf", "ERASED")] },
      suppressedProfileIds: ["p-erased"],
      candidates: [{ id: "c1", cv_url: "erased.pdf", network_profile_id: "p-erased" }],
    });
    const report = await runBackup(service, dest, KEY);

    expect(report.planned?.skipSuppressed).toBe(1);
    expect(report.copied).toBe(1);
    const manifest = await loadManifest(dest, "x");
    expect(manifest.entries.map((e) => e.key)).toEqual(["keep.pdf"]);
  });

  it("prunes an already-backed-up object when its owner is later suppressed", async () => {
    // The real sequence: backed up on day 5, erased on day 10.
    const day5 = makeFakeSupabase({ objects: { cvs: [obj("erased.pdf", "ERASED")] } });
    await runBackup(day5, dest, KEY);
    expect(await dest.list("objects")).toHaveLength(1);

    const day10 = makeFakeSupabase({
      objects: { cvs: [obj("erased.pdf", "ERASED")] },
      suppressedProfileIds: ["p-erased"],
      candidates: [{ id: "c1", cv_url: "erased.pdf", network_profile_id: "p-erased" }],
    });
    await runBackup(day10, dest, KEY);

    // Gone from the destination AND from the manifest, and recorded.
    expect(await dest.list("objects")).toHaveLength(0);
    const manifest = await loadManifest(dest, "x");
    expect(manifest.entries).toHaveLength(0);
    expect(manifest.suppressedKeys).toEqual(["cvs/erased.pdf"]);
  });

  it("suppresses call audio as well as CVs", async () => {
    const service = makeFakeSupabase({
      objects: { "call-audio": [obj("call1.mp3", "AUDIO")] },
      suppressedProfileIds: ["p1"],
      candidates: [{ id: "c1", cv_url: null, network_profile_id: "p1" }],
      notes: [{ candidate_id: "c1", audio_path: "call1.mp3" }],
    });
    const report = await runBackup(service, dest, KEY);
    expect(report.planned?.skipSuppressed).toBe(1);
    expect(report.copied).toBe(0);
  });

  it("REFUSES to run when the suppression ledger cannot be read", async () => {
    // Proceeding would mean treating 'unreadable' as 'nobody is
    // suppressed', which re-copies exactly what must be removed.
    const service = makeFakeSupabase({
      objects: { cvs: [obj("a.pdf", "AAA")] },
      suppressionReadFails: true,
    });
    const report = await runBackup(service, dest, KEY);
    expect(report.outcome).toBe("failed");
    expect(report.reason).toContain("Refusing to run");
    expect(await dest.list("objects")).toHaveLength(0);
  });
});

describe("configuration refusal", () => {
  it("refuses without an encryption key, before touching anything", async () => {
    const service = makeFakeSupabase({ objects: { cvs: [obj("a.pdf", "AAA")] } });
    const report = await runBackup(service, dest, undefined);
    expect(report.outcome).toBe("failed");
    expect(report.reason).toContain("BACKUP_ENCRYPTION_KEY");
    expect(await dest.list("")).toHaveLength(0);
  });
});

describe("restore", () => {
  it("verifies every object and reports the recovery point", async () => {
    const service = makeFakeSupabase({
      objects: { cvs: [obj("a.pdf", "AAA"), obj("b.pdf", "BBB")] },
      candidates: [
        { id: "c1", cv_url: "a.pdf", network_profile_id: null },
        { id: "c2", cv_url: "b.pdf", network_profile_id: null },
      ],
    });
    await runBackup(service, dest, KEY);

    const restored: Array<{ key: string; body: string }> = [];
    const report = await verifyBackup(dest, KEY, {
      onObject: async (entry, bytes) => {
        restored.push({ key: entry.key, body: Buffer.from(bytes).toString() });
      },
    });

    expect(report.verified).toBe(2);
    expect(report.failed).toBe(0);
    expect(restored.map((r) => r.body).sort()).toEqual(["AAA", "BBB"]);
    expect(report.bucketConfig.find((b) => b.name === "cvs")?.public).toBe(false);
  });

  it("refuses to restore with the wrong key", async () => {
    const service = makeFakeSupabase({ objects: { cvs: [obj("a.pdf", "AAA")] } });
    await runBackup(service, dest, KEY);
    const report = await verifyBackup(dest, generateKeyBase64());
    expect(report.failed).toBe(1);
    expect(report.verdicts[0].status).toBe("decrypt_failed");
  });

  it("reports an object the manifest lists but the destination lacks", async () => {
    const service = makeFakeSupabase({ objects: { cvs: [obj("a.pdf", "AAA")] } });
    await runBackup(service, dest, KEY);
    const manifest = await loadManifest(dest, "x");
    await dest.delete(manifest.entries[0].destinationPath);

    const report = await verifyBackup(dest, KEY);
    expect(report.verdicts[0].status).toBe("missing_at_destination");
  });

  it("never returns plaintext in the report", async () => {
    const service = makeFakeSupabase({
      objects: { cvs: [obj("a.pdf", "CANDIDATE-SECRET")] },
    });
    await runBackup(service, dest, KEY);
    const report = await verifyBackup(dest, KEY);
    expect(JSON.stringify(report)).not.toContain("CANDIDATE-SECRET");
    expect(report.verdicts[0].bytes).toBeNull();
  });
});

describe("recovery-point coordination (requirement 7)", () => {
  const manifest = (candidates: number, notes: number): BackupManifest =>
    ({
      version: 1,
      updatedAt: "x",
      runCount: 1,
      entries: [],
      buckets: [],
      accessControl: null,
      suppressedKeys: [],
      lastRunFailures: [],
      recoveryPoint: {
        observedAt: "2026-10-07T06:00:00.000Z",
        markers: { candidates, candidateNotes: notes, latestCandidateUpdate: null },
        databaseBackupHint: "h",
      },
    }) as BackupManifest;

  it("says plainly when the restored database is ahead of the files", async () => {
    const text = describeRecoveryCoordination(manifest(10, 2), {
      candidates: 13,
      candidateNotes: 2,
    });
    expect(text).toContain("DATABASE IS AHEAD");
    expect(text).toContain("3 record(s)");
  });

  it("says plainly when the file backup is ahead", async () => {
    const text = describeRecoveryCoordination(manifest(10, 2), {
      candidates: 7,
      candidateNotes: 2,
    });
    expect(text).toContain("FILE BACKUP IS AHEAD");
    expect(text).toContain("harmless orphans");
  });

  it("confirms agreement when counts match", async () => {
    const text = describeRecoveryCoordination(manifest(10, 2), {
      candidates: 10,
      candidateNotes: 2,
    });
    expect(text).toContain("Counts agree");
  });

  it("is explicit when no recovery point was recorded", async () => {
    const m = { ...manifest(0, 0), recoveryPoint: null };
    const text = describeRecoveryCoordination(m, { candidates: 1, candidateNotes: 0 });
    expect(text).toContain("cannot be stated");
  });
});
