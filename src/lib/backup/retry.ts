import "server-only";
import type { Destination, DestinationObject } from "./destination";

/**
 * Bounded retries around the destination.
 *
 * ## The gap this closes
 *
 * `runBackup` already survives a failed object: it records an
 * `upload_failed` entry, carries on with the rest, and reports the run
 * as `partial`. The next run picks the object up again because the
 * manifest never recorded it.
 *
 * That is correct, and it is not sufficient. The cheapest and most
 * common failure against object storage is a transient one — a 500, a
 * 503, a throttle, a socket reset — and waiting a whole day to retry a
 * blip means a CV sits unbacked-up for 24 hours over an error that
 * would have cleared in 200 ms. Vercel does not retry a failed cron
 * invocation, so nothing else in the system will do it either.
 *
 * ## Why a decorator rather than retry logic inside the run
 *
 * `Destination` is a six-method interface and the run calls it through
 * that interface only. Wrapping it means the retry policy is in one
 * place, is testable without a backup run, and `run.ts` does not gain a
 * second concern. It also means the LOCAL destination gets the same
 * treatment in tests, so the retry path is exercised by the same suite.
 *
 * ## What is deliberately NOT retried
 *
 * Authentication and authorisation failures (401, 403), malformed
 * requests (400), and "no such bucket" (404 on a bucket, not an object).
 * These do not clear by waiting, and retrying them three times turns one
 * clear failure into three identical log lines and a slower run. A
 * misconfigured destination should fail fast and loudly.
 *
 * `get` and `head` returning `null` for a missing object is a VALUE, not
 * an error, and is passed straight through.
 */

export type RetryPolicy = {
  /** Total attempts including the first. 3 means one try and two retries. */
  readonly attempts: number;
  /** Delay before the first retry, doubled each time. */
  readonly baseDelayMs: number;
  /** Ceiling on any single delay, so backoff cannot eat the run budget. */
  readonly maxDelayMs: number;
};

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  // Three attempts with 200 ms and 400 ms waits costs at most 600 ms of
  // the 45 s budget per object, which is affordable. Five would not be:
  // a run that spends its budget waiting has copied nothing.
  attempts: 3,
  baseDelayMs: 200,
  maxDelayMs: 2_000,
};

/**
 * Status codes worth trying again. The destination throws `Error` with
 * the status in the message (`destination PUT failed with 503`), which
 * is what this reads — there is no typed error to match on, and
 * inventing one would mean changing every throw site.
 */
const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

/**
 * Network-level failures never reach a status code. `fetch` rejects
 * with a TypeError whose message varies by runtime, so this matches the
 * shapes Node and undici actually produce rather than a tidy list.
 */
const RETRYABLE_NETWORK = [
  "fetch failed",
  "network",
  "socket",
  "econnreset",
  "econnrefused",
  "etimedout",
  "enotfound",
  "timeout",
  "aborted",
];

export function isRetryable(err: unknown): boolean {
  const message = String(err instanceof Error ? err.message : err).toLowerCase();

  const status = message.match(/failed with (\d{3})/);
  if (status) return RETRYABLE_STATUS.has(Number(status[1]));

  return RETRYABLE_NETWORK.some((needle) => message.includes(needle));
}

export function delayFor(attempt: number, policy: RetryPolicy): number {
  // attempt is 1-based; the wait BEFORE attempt 2 is baseDelayMs.
  const raw = policy.baseDelayMs * 2 ** (attempt - 1);
  return Math.min(raw, policy.maxDelayMs);
}

/**
 * Attempts tried, and what finally happened. Surfaced so a report can
 * say "succeeded on attempt 2" rather than hiding a flaky destination
 * behind an eventual success.
 */
export type RetryStats = {
  /** Operations that needed more than one attempt but did succeed. */
  recovered: number;
  /** Total extra attempts spent. A rising number means a sick destination. */
  extraAttempts: number;
};

export function createRetryStats(): RetryStats {
  return { recovered: 0, extraAttempts: 0 };
}

/**
 * Wrap a destination so its network methods retry transient failures.
 *
 * `sleep` is injectable so tests do not actually wait; passing a no-op
 * keeps the suite fast without weakening what is asserted.
 */
export function withRetries(
  inner: Destination,
  options: {
    policy?: RetryPolicy;
    stats?: RetryStats;
    sleep?: (ms: number) => Promise<void>;
  } = {}
): Destination {
  const policy = options.policy ?? DEFAULT_RETRY_POLICY;
  const stats = options.stats;
  const sleep =
    options.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));

  async function attempt<T>(label: string, fn: () => Promise<T>): Promise<T> {
    let lastErr: unknown;
    for (let n = 1; n <= policy.attempts; n++) {
      try {
        const out = await fn();
        if (n > 1 && stats) stats.recovered += 1;
        return out;
      } catch (err) {
        lastErr = err;
        const canRetry = isRetryable(err) && n < policy.attempts;
        if (!canRetry) break;
        if (stats) stats.extraAttempts += 1;
        // Logged at warn, not error: this is the system working.
        console.warn(
          `[backup] ${label} attempt ${n}/${policy.attempts} failed, retrying: ${String(err)}`
        );
        await sleep(delayFor(n, policy));
      }
    }
    throw lastErr;
  }

  return {
    kind: inner.kind,
    label: inner.label,
    put: (path: string, bytes: Uint8Array) =>
      attempt(`PUT ${path}`, () => inner.put(path, bytes)),
    get: (path: string): Promise<Uint8Array | null> =>
      attempt(`GET ${path}`, () => inner.get(path)),
    head: (path: string): Promise<DestinationObject | null> =>
      attempt(`HEAD ${path}`, () => inner.head(path)),
    list: (prefix: string): Promise<DestinationObject[]> =>
      attempt(`LIST ${prefix}`, () => inner.list(prefix)),
    delete: (path: string) => attempt(`DELETE ${path}`, () => inner.delete(path)),
    // Not retried. This is the pre-flight check whose entire job is to
    // tell you the destination is unusable; retrying it three times
    // delays that answer and changes nothing.
    verifyAccess: () => inner.verifyAccess(),
  };
}
