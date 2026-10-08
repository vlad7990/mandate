import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { createLocalDestination, type Destination } from "./destination";
import { loadManifest } from "./manifest";
import { runBackup } from "./run";
import { restoreEntry, verifyBackup } from "./restore";
import { generateKeyBase64 } from "./crypto";
import { withRetries } from "./retry";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Restore, proved by getting the bytes back.
 *
 * `run.test.ts` already covers verification thoroughly — wrong key,
 * missing object, tampered bytes, no plaintext in reports. What it does
 * not do is take the recovered bytes and compare them to what went in.
 * "Every object verified" and "every object is byte-identical to the
 * original" are different claims, and only the second one is a restore.
 *
 * So these tests run a real backup over synthetic files, then recover
 * every one of them to a fresh directory and compare SHA-256 against
 * the originals. The files are deliberately awkward: binary bytes that
 * are not valid UTF-8, an empty file, a large-ish file that crosses a
 * chunk boundary, and keys with spaces and unicode.
 */

const KEY = generateKeyBase64();

type FakeObject = { key: string; body: Buffer; updatedAt: string };

function makeFakeSupabase(objects: Partial<Record<string, FakeObject[]>>) {
  return {
    rpc(fn: string) {
      if (fn === "backup_try_lock") return Promise.resolve({ data: true, error: null });
      if (fn === "backup_release_lock") return Promise.resolve({ data: true, error: null });
      return Promise.resolve({ data: null, error: { message: "no such function" } });
    },
    from(table: string) {
      const state = { head: false };
      const resolve = (): { data: unknown; error: unknown; count?: number } => {
        if (table === "network_suppressions") return { data: [], error: null };
        if (table === "candidates") {
          if (state.head) return { data: null, error: null, count: 0 };
          return { data: [], error: null };
        }
        if (table === "candidate_notes") {
          if (state.head) return { data: null, error: null, count: 0 };
          return { data: [], error: null };
        }
        return { data: [], error: null };
      };
      const builder: Record<string, unknown> = {
        select: (_c?: string, o?: { head?: boolean }) => {
          if (o?.head) state.head = true;
          return builder;
        },
        is: () => builder,
        not: () => builder,
        in: () => builder,
        order: () => builder,
        limit: () => builder,
        then: (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) =>
          Promise.resolve(resolve()).then(ok, bad),
      };
      return builder;
    },
    storage: {
      from(bucket: string) {
        return {
          list(prefix: string) {
            if (prefix !== "") return Promise.resolve({ data: [], error: null });
            const items = (objects[bucket] ?? []).map((o) => ({
              id: `id-${o.key}`,
              name: o.key,
              updated_at: o.updatedAt,
              metadata: { size: o.body.length, mimetype: "application/octet-stream" },
            }));
            return Promise.resolve({ data: items, error: null });
          },
          download(key: string) {
            const found = (objects[bucket] ?? []).find((o) => o.key === key);
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
            { name: "cvs", public: false, file_size_limit: 10485760, allowed_mime_types: null },
            { name: "call-audio", public: false, file_size_limit: 52428800, allowed_mime_types: null },
            { name: "invoice-assets", public: false, file_size_limit: 2097152, allowed_mime_types: null },
          ],
          error: null,
        });
      },
    },
  } as unknown as SupabaseClient;
}

const sha = (b: Uint8Array | Buffer) =>
  createHash("sha256").update(Buffer.from(b)).digest("hex");

/**
 * Synthetic files across all three buckets. Nothing here resembles real
 * candidate data; the point is byte fidelity, so the awkward cases
 * matter more than realistic ones.
 */
function syntheticFiles(): Partial<Record<string, FakeObject[]>> {
  const binary = Buffer.from(Array.from({ length: 512 }, (_, i) => i % 256));
  const big = Buffer.alloc(300_000, 0xab);
  return {
    cvs: [
      { key: "SMOKE/plain.pdf", body: Buffer.from("%PDF-1.7 synthetic"), updatedAt: "2026-10-01T00:00:00.000Z" },
      { key: "SMOKE/binary.bin", body: binary, updatedAt: "2026-10-01T00:00:00.000Z" },
      { key: "SMOKE/empty.pdf", body: Buffer.alloc(0), updatedAt: "2026-10-01T00:00:00.000Z" },
      { key: "SMOKE/large.pdf", body: big, updatedAt: "2026-10-01T00:00:00.000Z" },
      { key: "SMOKE/naïve name (1).pdf", body: Buffer.from("unicode + space"), updatedAt: "2026-10-01T00:00:00.000Z" },
    ],
    "call-audio": [
      { key: "SMOKE/call.mp3", body: Buffer.from([0xff, 0xfb, 0x90, 0x00, 0x01]), updatedAt: "2026-10-01T00:00:00.000Z" },
    ],
    "invoice-assets": [
      { key: "SMOKE/logo.png", body: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), updatedAt: "2026-10-01T00:00:00.000Z" },
    ],
  };
}

let dir: string;
let restoreDir: string;
let dest: Destination;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "mandate-restore-"));
  restoreDir = await fs.mkdtemp(path.join(os.tmpdir(), "mandate-target-"));
  dest = createLocalDestination(dir);
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
  await fs.rm(restoreDir, { recursive: true, force: true });
});

describe("backup and restore round trip over synthetic files", () => {
  it("recovers every object byte-identically, across all three buckets", async () => {
    const files = syntheticFiles();
    const report = await runBackup(makeFakeSupabase(files), dest, KEY);
    expect(report.outcome).toBe("complete");

    const manifest = await loadManifest(dest, new Date(0).toISOString());
    expect(manifest.entries).toHaveLength(7);

    const expected = new Map<string, string>();
    for (const [bucket, list] of Object.entries(files)) {
      for (const o of list ?? []) expected.set(`${bucket}/${o.key}`, sha(o.body));
    }

    // Recover each entry and write it to a fresh directory, the way a
    // real restore would write into a replacement bucket.
    const recovered = new Map<string, string>();
    for (const entry of manifest.entries) {
      const verdict = await restoreEntry(dest, entry, Buffer.from(KEY, "base64"));
      expect(verdict.status, `${entry.bucket}/${entry.key}`).toBe("ok");
      expect(verdict.bytes).not.toBeNull();

      const target = path.join(restoreDir, entry.bucket, entry.key);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, Buffer.from(verdict.bytes!));
      recovered.set(`${entry.bucket}/${entry.key}`, sha(verdict.bytes!));
    }

    expect(recovered.size).toBe(expected.size);
    for (const [id, hash] of expected) {
      expect(recovered.get(id), `${id} must round trip byte-identically`).toBe(hash);
    }

    // And the bytes are really on disk, not just in memory.
    const onDisk = await fs.readFile(path.join(restoreDir, "cvs", "SMOKE/binary.bin"));
    expect(sha(onDisk)).toBe(expected.get("cvs/SMOKE/binary.bin"));
  });

  it("recovers an empty file as empty, not as missing", async () => {
    // A zero-byte object is the classic thing a backup quietly drops.
    const report = await runBackup(makeFakeSupabase(syntheticFiles()), dest, KEY);
    expect(report.outcome).toBe("complete");

    const manifest = await loadManifest(dest, new Date(0).toISOString());
    const entry = manifest.entries.find((e) => e.key === "SMOKE/empty.pdf");
    expect(entry, "the empty file must be in the manifest at all").toBeDefined();

    const verdict = await restoreEntry(dest, entry!, Buffer.from(KEY, "base64"));
    expect(verdict.status).toBe("ok");
    expect(verdict.bytes).not.toBeNull();
    expect(verdict.bytes!.length).toBe(0);
  });

  it("recovers a key containing spaces and non-ASCII characters", async () => {
    const report = await runBackup(makeFakeSupabase(syntheticFiles()), dest, KEY);
    expect(report.outcome).toBe("complete");

    const manifest = await loadManifest(dest, new Date(0).toISOString());
    const entry = manifest.entries.find((e) => e.key.includes("naïve"));
    expect(entry).toBeDefined();

    const verdict = await restoreEntry(dest, entry!, Buffer.from(KEY, "base64"));
    expect(verdict.status).toBe("ok");
    expect(Buffer.from(verdict.bytes!).toString()).toBe("unicode + space");
  });

  it("refuses a tampered object instead of returning corrupt bytes", async () => {
    const report = await runBackup(makeFakeSupabase(syntheticFiles()), dest, KEY);
    expect(report.outcome).toBe("complete");

    const manifest = await loadManifest(dest, new Date(0).toISOString());
    const entry = manifest.entries.find((e) => e.key === "SMOKE/plain.pdf")!;

    // Corrupt one byte at the destination, as bit rot or an attacker
    // would. The restore must notice; silently returning damaged bytes
    // is the worst possible outcome for a recovery tool.
    const stored = await dest.get(entry.destinationPath);
    const damaged = Buffer.from(stored!);
    damaged[Math.floor(damaged.length / 2)] ^= 0xff;
    await dest.put(entry.destinationPath, damaged);

    const verdict = await restoreEntry(dest, entry, Buffer.from(KEY, "base64"));
    expect(verdict.status).not.toBe("ok");
    expect(verdict.bytes).toBeNull();
  });

  it("verifies the whole backup and streams every object out", async () => {
    await runBackup(makeFakeSupabase(syntheticFiles()), dest, KEY);

    const seen: string[] = [];
    const out = await verifyBackup(dest, KEY, {
      onObject: async (entry, bytes) => {
        const target = path.join(restoreDir, entry.bucket, entry.key);
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.writeFile(target, Buffer.from(bytes));
        seen.push(`${entry.bucket}/${entry.key}`);
      },
    });

    expect(out.failed).toBe(0);
    expect(out.verified).toBe(7);
    expect(seen).toHaveLength(7);
    expect(seen).toContain("call-audio/SMOKE/call.mp3");
    expect(seen).toContain("invoice-assets/SMOKE/logo.png");
  });

  it("round trips unchanged when the destination is wrapped in retries", async () => {
    // The route wraps the real destination in withRetries. If that
    // decorator broke byte handling, every restore would be corrupt, so
    // the round trip is asserted through it too.
    const flaky = (() => {
      let puts = 0;
      const inner = createLocalDestination(dir);
      return withRetries(
        {
          ...inner,
          put: async (p: string, b: Uint8Array) => {
            puts++;
            if (puts % 3 === 0) throw new Error("destination PUT failed with 503");
            return inner.put(p, b);
          },
        } as Destination,
        { sleep: async () => {} }
      );
    })();

    const report = await runBackup(makeFakeSupabase(syntheticFiles()), flaky, KEY);
    expect(report.outcome).toBe("complete");

    const manifest = await loadManifest(flaky, new Date(0).toISOString());
    for (const entry of manifest.entries) {
      const verdict = await restoreEntry(flaky, entry, Buffer.from(KEY, "base64"));
      expect(verdict.status, `${entry.key}`).toBe("ok");
    }
  });
});
