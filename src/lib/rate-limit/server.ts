import "server-only";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { captureSeamError } from "@/lib/observability/sentry";
import { hashRateKey, type RateVerdict } from "./core";

/**
 * The server half of the rate limiter (NEXT-rate-limiting D1/D3).
 * One Postgres function is the mechanism (088's `check_rate_limit` —
 * caps as data, windows in the bucket key); this module is the D3
 * split and nothing else:
 *
 *   * `limitClosed` — Tier 1, the doors where a stranger can spend
 *     our money. The limiter being unreachable REFUSES: an outage
 *     should cost nothing (061's rule, kept).
 *   * `limitOpen` — Tier 2, the identity doors. The limiter being
 *     unreachable ALLOWS, loudly: a brief unlimited window on
 *     sign-in is survivable, a lockout is a self-inflicted outage.
 *     Every fail-open is a Sentry capture, so "the limiter was down"
 *     is a fact we hold rather than a thing we assume.
 *
 * A REFUSAL is not a failure: when the check answers "no", both
 * tiers refuse — the split only governs what happens when the check
 * cannot answer at all.
 */

/**
 * The salt is an internal secret (rotating it resets every window,
 * which is harmless). The fallback keeps keys hashed even where the
 * env never arrived — a raw address must not reach a bucket key on
 * any path.
 */
function salt(): string {
  return process.env.RATE_LIMIT_SALT ?? "mandate-rate-limit-fallback";
}

/**
 * The client IP that keys every per-IP limiter (the Tier-1 money doors and
 * the Tier-2 credential doors). Read ONLY from platform-controlled headers,
 * never a caller-nameable one.
 *
 * WHY LEFTMOST x-forwarded-for IS TRUSTED HERE (vuln finding 3, verified
 * against Vercel docs 2026-10-01): "Vercel overwrites this header and does
 * not forward external IPs to prevent spoofing" — so on this deployment a
 * client CANNOT inject the leftmost value. The one documented exception is
 * Enterprise "trusted proxy" mode, which this project does not use. If a
 * route is ever served OFF Vercel's edge, that guarantee is gone and this
 * must change — do not widen it to read an arbitrary client header.
 *
 * Absent both headers (local dev, a misconfig), callers share one "anon"
 * bucket — a MORE restrictive fallback, never a bypass.
 */
export function clientIpFrom(headers: Headers): string {
  // Leftmost non-empty segment of the Vercel-set XFF = the client Vercel saw.
  const xff = headers.get("x-forwarded-for");
  const first = xff?.split(",").map((s) => s.trim()).find(Boolean);
  if (first) return first;
  const real = headers.get("x-real-ip")?.trim();
  if (real) return real;
  return "anon";
}

async function check(scope: string, rawKey: string): Promise<RateVerdict> {
  try {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .rpc("check_rate_limit", {
        p_scope: scope,
        p_key: hashRateKey(rawKey, salt()),
      })
      .maybeSingle<{
        allowed: boolean;
        reason: string;
        retry_after_seconds: number;
      }>();

    if (error || !data) {
      captureSeamError(`[rate-limit] check unreachable for ${scope}`, error ?? new Error("no row"));
      return { allowed: false, reason: "unavailable", retryAfterSeconds: 60 };
    }
    return {
      allowed: data.allowed,
      reason: (data.reason as RateVerdict["reason"]) ?? "key",
      retryAfterSeconds: data.retry_after_seconds ?? 60,
    };
  } catch (err) {
    captureSeamError(`[rate-limit] check threw for ${scope}`, err);
    return { allowed: false, reason: "unavailable", retryAfterSeconds: 60 };
  }
}

/** Tier 1 — money. Unreachable limiter = refusal. */
export async function limitClosed(scope: string, rawKey: string): Promise<RateVerdict> {
  return check(scope, rawKey);
}

/** Tier 2 — identity. Unreachable limiter = allowed, captured above. */
export async function limitOpen(scope: string, rawKey: string): Promise<RateVerdict> {
  const verdict = await check(scope, rawKey);
  if (!verdict.allowed && verdict.reason === "unavailable") {
    return { allowed: true, reason: "unavailable", retryAfterSeconds: 0 };
  }
  return verdict;
}
