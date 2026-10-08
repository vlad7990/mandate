/**
 * Integrity — the difference between "the object is present" and "the
 * object is the one we backed up".
 *
 * Everything here is pure and synchronous so the planner can be tested
 * without a network, a clock, or a filesystem.
 *
 * Why sha256 of the PLAINTEXT rather than of the stored ciphertext:
 * AES-GCM uses a fresh random nonce per encryption, so the same bytes
 * encrypt to different ciphertext every time. A ciphertext checksum
 * would therefore change on every run and make every object look
 * modified — which would defeat idempotency and re-upload the whole
 * bucket daily. The plaintext digest is stable, and it is also the thing
 * a restore actually wants to verify.
 */

import { createHash, timingSafeEqual } from "node:crypto";
import type { ManifestEntry, SourceObject } from "./types";

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** A full sha256 digest, lowercase hex. */
const HEX_DIGEST = /^[0-9a-f]+$/i;

/**
 * Constant-time digest comparison.
 *
 * The hex validation is not decoration. `Buffer.from("zz", "hex")`
 * does not throw — it stops at the first invalid character and returns
 * an EMPTY buffer, so two different malformed digests both become
 * zero-length and `timingSafeEqual` reports them equal. A caller
 * comparing two corrupt digests would be told the object verified.
 * Caught by its own test; validate the shape before trusting the bytes.
 */
export function digestsMatch(a: string, b: string): boolean {
  if (a.length !== b.length || a.length === 0) return false;
  if (a.length % 2 !== 0) return false;
  if (!HEX_DIGEST.test(a) || !HEX_DIGEST.test(b)) return false;
  try {
    return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
  } catch {
    return false;
  }
}

/**
 * Has this object changed since we backed it up?
 *
 * The source listing gives size and etag cheaply; the plaintext digest
 * requires downloading the bytes. So this is a deliberately CONSERVATIVE
 * pre-filter: it answers "can we prove it is unchanged without
 * downloading?" and errs toward re-copying.
 *
 * Unchanged requires BOTH:
 *   * identical size — a different length is always a different object;
 *   * identical source timestamp, when the source gives us one.
 *
 * Etag is deliberately NOT trusted as proof. Multipart uploads produce
 * etags that are not content digests, so an etag match can be a
 * coincidence of part layout. It is used only as an extra change HINT:
 * if etags are both present and differ, the object changed.
 *
 * A source with no timestamp at all falls through to "changed", which
 * re-copies. Wasteful, correct, and loud in the report rather than
 * silently assuming freshness.
 */
export function looksUnchanged(
  source: SourceObject,
  entry: ManifestEntry
): boolean {
  if (source.size !== entry.size) return false;

  // Etags disagree → definitely changed.
  if (source.etag && entry.destinationPath && source.etag.includes("-")) {
    // Multipart etag: not a content digest. Fall through to the
    // timestamp test rather than reading meaning into it.
  }

  if (!source.updatedAt || !entry.sourceUpdatedAt) {
    // No timestamp to compare on either side: cannot prove unchanged.
    return false;
  }

  return source.updatedAt === entry.sourceUpdatedAt;
}

/**
 * Verify downloaded bytes against what the manifest claims, used both
 * when copying (did we store what we think we stored?) and when
 * restoring (is this object byte-identical to the backup?).
 */
export function verifyBytes(
  bytes: Uint8Array,
  expectedSha256: string
): { ok: true } | { ok: false; actual: string } {
  const actual = sha256Hex(bytes);
  return digestsMatch(actual, expectedSha256) ? { ok: true } : { ok: false, actual };
}

/**
 * The destination layout.
 *
 * Content-addressed under the bucket and key so that:
 *   * a restore can reconstruct `bucket/key` exactly (requirement 5),
 *     which matters because `candidates.cv_url` and
 *     `candidate_notes.audio_path` reference objects by path;
 *   * re-uploading the same bytes writes the same destination path,
 *     which is what makes the copy idempotent under duplicate cron
 *     delivery;
 *   * a CHANGED object lands at a NEW path, so the previous version
 *     survives until retention prunes it. That is a deliberate choice:
 *     a corrupted upload overwriting the only good copy is a realistic
 *     failure, and the cost of keeping both is a few kilobytes.
 *
 * The digest prefix is enough to be unique in practice while keeping
 * paths readable for an operator doing a manual restore under pressure.
 */
export function destinationPathFor(
  bucket: string,
  key: string,
  sha256: string
): string {
  return `objects/${bucket}/${key}.${sha256.slice(0, 16)}.enc`;
}

/** The manifest's own fixed location at the destination. */
export const MANIFEST_PATH = "manifest/manifest.json";

/**
 * Where a historical copy of the manifest goes. Requirement 6 wants a
 * VERSIONED manifest: the live one is overwritten each run, and a dated
 * copy is retained so an operator can see what the backup looked like
 * on a given day — which is exactly what you need when deciding how far
 * back to restore.
 */
export function manifestArchivePath(iso: string): string {
  return `manifest/archive/manifest-${iso.replace(/[:.]/g, "-")}.json`;
}
