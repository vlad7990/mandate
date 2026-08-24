import { createHash } from "node:crypto";

/**
 * The pure half of the rate limiter (NEXT-rate-limiting D6) — no
 * server-only import so the vitest harness can hold these rules the
 * way `scrub.test.ts` holds the PII boundary's.
 *
 * ## Why keys are hashed
 *
 * An IP address is personal data, and an email address obviously is;
 * the HM token is a credential outright. The counter needs
 * identity-of-CALLER, not identity-of-PERSON — a salted hash serves
 * the former exactly and stores none of the latter. The database
 * only ever sees the hash (088's comment says so from its side).
 */

export type RateVerdict = {
  allowed: boolean;
  reason: "ok" | "key" | "global" | "unavailable";
  retryAfterSeconds: number;
};

/**
 * Salted, truncated SHA-256. Truncation to 32 hex chars keeps bucket
 * keys short; 128 bits of a keyed digest is far beyond collision
 * concern for a counter.
 */
export function hashRateKey(value: string, salt: string): string {
  return createHash("sha256")
    .update(`${salt}:${value}`)
    .digest("hex")
    .slice(0, 32);
}

/** One email, one key: case and whitespace must not mint fresh buckets. */
export function normalizeEmailKey(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * The D5 sentences say when to come back. Coarse on purpose — a
 * refusal is not a countdown widget.
 */
export function retryPhrase(seconds: number): string {
  if (seconds <= 90) return "a minute or two";
  if (seconds <= 3600) return `${Math.ceil(seconds / 60)} minutes`;
  return "an hour or so";
}
