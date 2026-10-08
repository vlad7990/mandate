/**
 * Requirement 9 — monitoring that never logs CV contents or secrets.
 *
 * The risk is specific and it is not hypothetical: this module reads
 * candidate CVs into memory and talks to a credentialed destination.
 * An error thrown from either side can quote what it was handling, so an
 * unsanitised failure message is a CV excerpt — or an access key — in a
 * log line, a heartbeat row, or a Sentry event.
 *
 * The same reasoning the Sentry scrubber already applies to provider
 * errors (`src/lib/observability/scrub.ts`), applied to this module's
 * own reporting surface. That module's own comment puts it best: an
 * uncapped provider error message is a candidate-data leak wearing a
 * stack trace.
 *
 * Three rules, enforced here and tested:
 *
 *   1. Object KEYS are reportable; object BYTES never are. A key is a
 *      path, and an operator cannot restore without it.
 *   2. Anything resembling a credential is redacted by shape, not by
 *      name — a denylist of variable names misses the one that matters.
 *   3. Everything is length-capped, because truncation is the only
 *      defence that works against content we have not anticipated.
 */

import type { BackupRunReport, ObjectFailure } from "./types";

/** Matches the Sentry scrubber's threshold, for the same reason. */
export const REASON_CAP = 200;

/**
 * Credential shapes, matched on structure rather than on a name list.
 * Covers AWS-style access key ids, long base64/hex secrets, bearer
 * tokens, URL userinfo, and anything self-labelled as a key.
 */
const CREDENTIAL_PATTERNS: Array<[RegExp, string]> = [
  // URL userinfo: https://user:secret@host
  [/\/\/[^/\s:@]+:[^/\s@]+@/g, "//[redacted]@"],
  // Bearer / Authorization values. The scheme word is consumed along
  // with the token, because `Authorization: Bearer <token>` has TWO
  // words before the secret — an earlier version of this pattern
  // stopped at "Bearer" and left the token in the message. Caught by
  // its own test.
  [/\b(?:bearer|authorization)\b\s*[=:]?\s*(?:bearer\b\s*)?\S+/gi, "[redacted-auth]"],
  // AWS-style access key ids
  [/\b(?:AKIA|ASIA)[0-9A-Z]{12,}\b/g, "[redacted-key-id]"],
  // AWS4 signing material
  [/AWS4-HMAC-SHA256[^\s]*/g, "[redacted-signature]"],
  [/Signature=[0-9a-f]{32,}/gi, "Signature=[redacted]"],
  // Long opaque secrets: 32+ chars of base64/hex-ish material
  [/\b[A-Za-z0-9+/_-]{40,}={0,2}\b/g, "[redacted-secret]"],
  // Anything self-describing
  [/((?:secret|password|token|apikey|api_key|access_key)[^\s=:]*)[=:]\s*\S+/gi, "$1=[redacted]"],
];

/**
 * Sanitise a failure reason: redact credential-shaped substrings, strip
 * newlines (which break single-line log parsing and hide content below
 * the fold), then cap.
 */
export function sanitiseReason(raw: unknown): string {
  let text = typeof raw === "string" ? raw : String(raw ?? "");
  for (const [pattern, replacement] of CREDENTIAL_PATTERNS) {
    text = text.replace(pattern, replacement);
  }
  text = text.replace(/\s+/g, " ").trim();
  if (text.length > REASON_CAP) {
    text = `${text.slice(0, REASON_CAP)}… [truncated]`;
  }
  return text || "no detail";
}

export function sanitiseFailure(failure: ObjectFailure): ObjectFailure {
  return { ...failure, reason: sanitiseReason(failure.reason) };
}

/**
 * The shape written to `ops_heartbeats.detail` and the cron response.
 *
 * Counts and keys only. No bytes, no names, no credentials, and
 * deliberately no `destination` credential material — only the
 * destination's label, which is a host and bucket name.
 */
export type BackupHeartbeatDetail = {
  outcome: BackupRunReport["outcome"];
  reason: string | null;
  copied: number;
  bytesCopied: number;
  forgotten: number;
  failureCount: number;
  /** Capped sample, so a systemic failure does not write a huge row. */
  failureSample: ObjectFailure[];
  budgetExhausted: boolean;
  runCount: number;
  manifestVersion: number;
  durationMs: number;
  suppressedSkipped: number;
};

const FAILURE_SAMPLE_CAP = 10;

export function toHeartbeatDetail(
  report: BackupRunReport
): BackupHeartbeatDetail {
  return {
    outcome: report.outcome,
    reason: report.reason ? sanitiseReason(report.reason) : null,
    copied: report.copied,
    bytesCopied: report.bytesCopied,
    forgotten: report.forgotten,
    failureCount: report.failures.length,
    failureSample: report.failures.slice(0, FAILURE_SAMPLE_CAP).map(sanitiseFailure),
    budgetExhausted: report.budgetExhausted,
    runCount: report.runCount,
    manifestVersion: report.manifestVersion,
    durationMs: report.durationMs,
    suppressedSkipped: report.planned?.skipSuppressed ?? 0,
  };
}

/**
 * One honest log line. Requirement 6 says partial failures are reported
 * honestly, which means a run that copied 3 of 400 objects must not read
 * as a success — and a run that stopped on its time budget with work
 * outstanding must not read as a failure either, because it is the
 * design working.
 */
export function summaryLine(report: BackupRunReport): string {
  const parts = [
    `outcome=${report.outcome}`,
    `copied=${report.copied}`,
    `bytes=${report.bytesCopied}`,
    `forgotten=${report.forgotten}`,
    `failures=${report.failures.length}`,
    `budget_exhausted=${report.budgetExhausted}`,
    `run=${report.runCount}`,
    `ms=${report.durationMs}`,
  ];
  if (report.planned) {
    parts.push(
      `planned_new=${report.planned.copyNew}`,
      `planned_changed=${report.planned.copyChanged}`,
      `skipped_unchanged=${report.planned.skipUnchanged}`,
      `skipped_suppressed=${report.planned.skipSuppressed}`
    );
  }
  if (report.reason) parts.push(`reason="${sanitiseReason(report.reason)}"`);
  return `[backup] ${parts.join(" ")}`;
}
