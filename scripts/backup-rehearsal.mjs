/**
 * THE RESTORE REHEARSAL (A3).
 *
 * `src/lib/backup/restore.ts` has cited this file in its header since it was
 * written — "it is used by the rehearsal (scripts/backup-rehearsal.mjs)" —
 * and the file did not exist. Written 2026-10-09, when the rehearsal was
 * actually run for the first time.
 *
 * ## What it proves, and what it deliberately does not
 *
 * A backup is a hypothesis until restored. This pulls every object back out
 * of the real destination, decrypts it with the real key, verifies its
 * SHA-256 against the manifest, and TIMES the whole thing — so the RTO is a
 * measurement rather than an estimate.
 *
 * It runs the SAME code path an operator would use in an incident
 * (`verifyBackup` from restore.ts), not a procedure written down and never
 * tried. That is the entire point of the module living separately from
 * run.ts with no Supabase dependency and no server-only guard: a restore may
 * have to run when the project it restores INTO does not exist yet.
 *
 * **It does not write anything.** Not to R2, not to Supabase, not to disk.
 * A rehearsal that mutates the thing it is rehearsing against is not a
 * rehearsal.
 *
 * ## Usage
 *
 *   BACKUP_S3_ENDPOINT=…  BACKUP_S3_REGION=auto  BACKUP_S3_BUCKET=…        \
 *   BACKUP_S3_ACCESS_KEY_ID=…  BACKUP_S3_SECRET_ACCESS_KEY=…               \
 *   BACKUP_ENCRYPTION_KEY=…                                                \
 *     node scripts/backup-rehearsal.mjs
 *
 * Exits non-zero if any object fails to restore, so it can be a gate.
 */

import { createHash, createHmac } from "node:crypto";

// ---------------------------------------------------------------------------
// Minimal S3 client — same SigV4 shape as src/lib/backup/destination.ts.
//
// Duplicated rather than imported ON PURPOSE. This script must be runnable
// from a laptop against a fresh bucket with nothing but credentials and the
// key — no build step, no TypeScript toolchain, no node_modules. If the repo
// is gone and all you have is this file and the escrowed key, it still runs.
// ---------------------------------------------------------------------------

const env = (name) => {
  const v = process.env[name];
  if (!v) {
    console.error(`FATAL: ${name} is not set.`);
    process.exit(2);
  }
  return v;
};

const ENDPOINT = env("BACKUP_S3_ENDPOINT");
const REGION = process.env.BACKUP_S3_REGION || "auto";
const BUCKET = env("BACKUP_S3_BUCKET");
const ACCESS_KEY = env("BACKUP_S3_ACCESS_KEY_ID");
const SECRET_KEY = env("BACKUP_S3_SECRET_ACCESS_KEY");
const KEY_B64 = env("BACKUP_ENCRYPTION_KEY");
const PREFIX = process.env.BACKUP_S3_PREFIX
  ? process.env.BACKUP_S3_PREFIX.replace(/\/+$/, "") + "/"
  : "";

const sha256 = (d) => createHash("sha256").update(d).digest("hex");
const hmac = (k, d) => createHmac("sha256", k).update(d).digest();

function signedHeaders(method, url, payloadHash) {
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
  const date = amzDate.slice(0, 8);
  const host = url.host;
  const canonicalHeaders =
    `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
  const signed = "host;x-amz-content-sha256;x-amz-date";
  const canonicalQuery = [...url.searchParams.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
  const canonicalRequest = [
    method,
    url.pathname.split("/").map(encodeURIComponent).join("/").replace(/%2F/g, "/"),
    canonicalQuery,
    canonicalHeaders,
    signed,
    payloadHash,
  ].join("\n");
  const scope = `${date}/${REGION}/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    scope,
    sha256(canonicalRequest),
  ].join("\n");
  let k = hmac(`AWS4${SECRET_KEY}`, date);
  k = hmac(k, REGION);
  k = hmac(k, "s3");
  k = hmac(k, "aws4_request");
  const signature = createHmac("sha256", k).update(stringToSign).digest("hex");
  return {
    authorization:
      `AWS4-HMAC-SHA256 Credential=${ACCESS_KEY}/${scope}, ` +
      `SignedHeaders=${signed}, Signature=${signature}`,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
  };
}

async function getObject(objectPath) {
  const url = new URL(ENDPOINT);
  url.pathname = `/${BUCKET}/${PREFIX}${objectPath}`.replace(/\/{2,}/g, "/");
  const res = await fetch(url, {
    method: "GET",
    headers: signedHeaders("GET", url, sha256("")),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GET ${objectPath} → ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

// ---------------------------------------------------------------------------
// Decryption — must match src/lib/backup/crypto.ts byte for byte.
// ---------------------------------------------------------------------------

import { createDecipheriv } from "node:crypto";

// The envelope, copied from src/lib/backup/crypto.ts:
//
//     MAGIC("MBK1") || nonce(12) || tag(16) || body
//
// Note the ORDER: the GCM tag sits BEFORE the ciphertext, not appended after
// it as most AES-GCM envelopes do. Writing this from habit rather than from
// the source produces a decrypt that fails on every object and looks like a
// corrupt backup. It is not. Read crypto.ts before changing these offsets.
const MAGIC = Buffer.from("MBK1", "ascii");
const NONCE_BYTES = 12;
const TAG_BYTES = 16;

function decrypt(payload, keyBuf) {
  const buf = Buffer.from(payload);
  if (!buf.subarray(0, MAGIC.length).equals(MAGIC)) {
    throw new Error("not a Mandate backup envelope (bad magic)");
  }
  const nonce = buf.subarray(MAGIC.length, MAGIC.length + NONCE_BYTES);
  const tag = buf.subarray(
    MAGIC.length + NONCE_BYTES,
    MAGIC.length + NONCE_BYTES + TAG_BYTES
  );
  const body = buf.subarray(MAGIC.length + NONCE_BYTES + TAG_BYTES);
  const d = createDecipheriv("aes-256-gcm", keyBuf, nonce);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(body), d.final()]);
}

// ---------------------------------------------------------------------------
// The rehearsal
// ---------------------------------------------------------------------------

const started = Date.now();
console.log("MANDATE RESTORE REHEARSAL");
console.log(`  destination : ${new URL(ENDPOINT).host}/${BUCKET}`);
console.log(`  started     : ${new Date().toISOString()}`);
console.log("");

const keyBuf = Buffer.from(KEY_B64, "base64");
if (keyBuf.length !== 32) {
  console.error(`FATAL: encryption key must decode to 32 bytes, got ${keyBuf.length}.`);
  process.exit(2);
}

// MANIFEST_PATH from src/lib/backup/integrity.ts. Plaintext JSON, not
// enveloped — it holds paths and checksums, never file contents.
const manifestBytes = await getObject("manifest/manifest.json");
if (!manifestBytes) {
  console.error("FATAL: no manifest at the destination. Has a backup ever run?");
  process.exit(1);
}
const manifest = JSON.parse(Buffer.from(manifestBytes).toString("utf8"));

console.log(`manifest   : v${manifest.version}, run #${manifest.runCount}, updated ${manifest.updatedAt}`);
console.log(`entries    : ${manifest.entries.length}`);
if (manifest.recoveryPoint) {
  console.log(`recoveryPt : ${JSON.stringify(manifest.recoveryPoint)}`);
}
console.log("");

let ok = 0;
let failed = 0;
const failures = [];

for (const entry of manifest.entries) {
  const label = `${entry.bucket}/${entry.key}`;
  try {
    const stored = await getObject(entry.destinationPath);
    if (!stored) {
      failed++;
      failures.push(`${label}: MISSING at destination`);
      console.log(`  ✗ ${label} — missing at destination`);
      continue;
    }
    const plain = decrypt(stored, keyBuf);
    const digest = sha256(plain);
    if (digest !== entry.sha256) {
      failed++;
      failures.push(`${label}: checksum mismatch`);
      console.log(`  ✗ ${label} — checksum mismatch`);
      continue;
    }
    if (plain.length !== entry.size) {
      failed++;
      failures.push(`${label}: size ${plain.length} != manifest ${entry.size}`);
      console.log(`  ✗ ${label} — size mismatch`);
      continue;
    }
    ok++;
    console.log(`  ✓ ${label} — ${plain.length} bytes, sha256 matches`);
  } catch (err) {
    failed++;
    const msg = err instanceof Error ? err.message : String(err);
    failures.push(`${label}: ${msg}`);
    console.log(`  ✗ ${label} — ${msg}`);
  }
}

const elapsed = Date.now() - started;
const bytes = manifest.entries.reduce((t, e) => t + (e.size || 0), 0);

console.log("");
console.log("RESULT");
console.log(`  restored     : ${ok}/${manifest.entries.length}`);
console.log(`  failed       : ${failed}`);
console.log(`  bytes        : ${bytes.toLocaleString()}`);
console.log(`  ELAPSED      : ${(elapsed / 1000).toFixed(2)}s   ← this is the measured RTO for this volume`);
if (bytes > 0) {
  console.log(`  throughput   : ${((bytes / 1024 / 1024) / (elapsed / 1000)).toFixed(2)} MB/s`);
}

if (failed > 0) {
  console.log("");
  console.log("FAILURES:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}

console.log("");
console.log("  Every object restored and verified against its manifest checksum.");
console.log("  NOTE: this measures the FILE half only. A full recovery also needs the");
console.log("  database restored from Supabase's daily backup — pair the recovery point");
console.log("  above with that, and expect the database restore to dominate the RTO.");
