import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getServiceRoleSupabaseClient } from "@/lib/supabase-service-role";
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
 *   * `limitClosedServiceRole` — Tier 1 from a context that has no
 *     user session (C10). Same refusal semantics as `limitClosed`;
 *     see its own comment for why the client differs.
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

async function check(
  scope: string,
  rawKey: string,
  // How to obtain the client, not the client itself: a thrown
  // getServiceRoleSupabaseClient() (a missing env) must land in the
  // same catch as a failed RPC, so a misconfigured environment refuses
  // a money door rather than crashing the caller.
  clientFor: () => Promise<SupabaseClient> = createServerSupabaseClient,
  // The hash exists because an IP or an email is personal data. A key
  // that is already a database primary key gains nothing from it and
  // loses the ops trail, so the caller may opt out (C10).
  hashKey = true
): Promise<RateVerdict> {
  try {
    const supabase = await clientFor();
    const { data, error } = await supabase
      .rpc("check_rate_limit", {
        p_scope: scope,
        p_key: hashKey ? hashRateKey(rawKey, salt()) : rawKey,
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

/**
 * Tier 1 from a context with no user session (C10 — the escalation
 * ceiling). Same refusal semantics as `limitClosed`; two things differ
 * and both are deliberate.
 *
 * THE CLIENT. The one caller is the inference seam, and `inference.ts`
 * states the law that it never holds a product Supabase client — every
 * read-under-RLS stays in the callers, so provider choice can never
 * change what an agent reads. A session client would break that. It
 * would also not work: 32 of the product's 76 lifetime model calls came
 * from the Monday sweep cron, where there is no user to have a session.
 * `rate_limit` and `rate_limit_policy` are two of the four deny-all-RLS
 * tables and `check_rate_limit` is SECURITY DEFINER, so service-role is
 * the correct reach — it is an ops counter, not product data.
 *
 * THE KEY IS NOT HASHED. 088 hashes because "the database never learns
 * a caller's address". This caller's key is a `project_id` — already a
 * primary key in that same database — so hashing would obscure the ops
 * trail and protect nothing.
 */
export async function limitClosedServiceRole(
  scope: string,
  rawKey: string
): Promise<RateVerdict> {
  return check(scope, rawKey, async () => getServiceRoleSupabaseClient(), false);
}

/** Tier 2 — identity. Unreachable limiter = allowed, captured above. */
export async function limitOpen(scope: string, rawKey: string): Promise<RateVerdict> {
  const verdict = await check(scope, rawKey);
  if (!verdict.allowed && verdict.reason === "unavailable") {
    return { allowed: true, reason: "unavailable", retryAfterSeconds: 0 };
  }
  return verdict;
}
