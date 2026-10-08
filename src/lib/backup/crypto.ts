/**
 * Encryption at rest in the destination (requirement 4).
 *
 * The destination holds candidate CVs outside Supabase's own access
 * controls, in a bucket belonging to a different vendor. Whatever that
 * vendor's server-side encryption does, the bytes should be unreadable
 * to anyone holding only the destination credentials — otherwise a
 * leaked backup key is a leaked CV archive.
 *
 * AES-256-GCM, from `node:crypto`. No dependency, authenticated
 * (tampering fails decryption rather than yielding garbage), and the
 * standard choice for data at rest.
 *
 * Envelope format, deliberately self-describing so a restore in five
 * years does not need this file to guess:
 *
 *     magic   4 bytes   "MBK1"  (Mandate BacKup v1)
 *     nonce  12 bytes   random per object
 *     tag    16 bytes   GCM authentication tag
 *     body    n bytes   ciphertext
 *
 * A fresh nonce per object is why integrity digests are taken over the
 * PLAINTEXT (see integrity.ts) — the same bytes produce different
 * ciphertext every run, so a ciphertext digest would make every object
 * look changed.
 *
 * KEY HANDLING. The key arrives as base64 in `BACKUP_ENCRYPTION_KEY` and
 * is never logged, never stored in the manifest, and never sent to the
 * destination. Losing it means losing the backup — which is why the
 * activation steps require it to be escrowed somewhere other than Vercel
 * before the first real run.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const MAGIC = Buffer.from("MBK1", "ascii");
const NONCE_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;
export const ENVELOPE_OVERHEAD = MAGIC.length + NONCE_BYTES + TAG_BYTES;

export class BackupKeyError extends Error {}

/**
 * Parse and validate the key. Throws a reader-facing sentence rather
 * than a crypto library's error, and never includes the value.
 */
export function parseKey(raw: string | undefined): Buffer {
  if (!raw) {
    throw new BackupKeyError(
      "BACKUP_ENCRYPTION_KEY is not set. The backup cannot encrypt and will not run."
    );
  }
  let key: Buffer;
  try {
    key = Buffer.from(raw, "base64");
  } catch {
    throw new BackupKeyError(
      "BACKUP_ENCRYPTION_KEY is not valid base64."
    );
  }
  if (key.length !== KEY_BYTES) {
    throw new BackupKeyError(
      `BACKUP_ENCRYPTION_KEY must decode to ${KEY_BYTES} bytes; got ${key.length}.`
    );
  }
  return key;
}

/** Generate a key for an operator to paste into the environment. */
export function generateKeyBase64(): string {
  return randomBytes(KEY_BYTES).toString("base64");
}

export function encrypt(plaintext: Uint8Array, key: Buffer): Buffer {
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  const body = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([MAGIC, nonce, tag, body]);
}

export class BackupDecryptError extends Error {}

export function decrypt(envelope: Uint8Array, key: Buffer): Buffer {
  const buf = Buffer.from(envelope);
  if (buf.length < ENVELOPE_OVERHEAD) {
    throw new BackupDecryptError(
      "Backup object is too short to be a valid envelope."
    );
  }
  if (!buf.subarray(0, MAGIC.length).equals(MAGIC)) {
    throw new BackupDecryptError(
      "Backup object is not in the expected envelope format."
    );
  }
  const nonce = buf.subarray(MAGIC.length, MAGIC.length + NONCE_BYTES);
  const tag = buf.subarray(
    MAGIC.length + NONCE_BYTES,
    MAGIC.length + NONCE_BYTES + TAG_BYTES
  );
  const body = buf.subarray(ENVELOPE_OVERHEAD);

  const decipher = createDecipheriv("aes-256-gcm", key, nonce);
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(body), decipher.final()]);
  } catch {
    // GCM authentication failed: wrong key, or the bytes were altered.
    // Both are the same answer to the caller — do not trust this object.
    throw new BackupDecryptError(
      "Backup object failed authentication. The key is wrong or the data was modified."
    );
  }
}
