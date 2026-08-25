import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getServiceRoleSupabaseClient } from "@/lib/supabase-service-role";
import {
  CRON_HEARTBEAT_NAME,
  CRON_MAX_AGE_HOURS,
  heartbeatState,
  overallOk,
  type CheckState,
} from "./heartbeat";

// The status checks (§139 D1), shared by /api/health and /status so the
// machine answer and the human page can never disagree.
//
// R2: states, not internals — a check resolves to ok|degraded and nothing
// else leaves this module. Every probe is cheap, read-only, and bounded
// by a timeout so the health surface can never hang or become load:
//
//   db   — a zero-row round trip through PostgREST on the anon key,
//          against an existing anon door (verify_staff_invitation with a
//          random uuid). Proves API + database without exposing a row or
//          minting a thirteenth grant (R4).
//   auth — GoTrue's own /auth/v1/health.
//   cron — ops_heartbeats staleness (migration 115), read under the
//          service role inside this server-only module.

export type StatusReport = {
  ok: boolean;
  at: string;
  checks: { db: CheckState; auth: CheckState; cron: CheckState };
};

const CACHE_TTL_MS = 30_000;
const PROBE_TIMEOUT_MS = 3_000;

let cache: { at: number; report: StatusReport } | null = null;

async function probeDb(): Promise<CheckState> {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anonKey) return "degraded";
    const anon = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const probe = anon.rpc("verify_staff_invitation", {
      p_token: crypto.randomUUID(),
    });
    const { error } = await Promise.race([
      probe,
      new Promise<{ error: Error }>((resolve) =>
        setTimeout(
          () => resolve({ error: new Error("timeout") }),
          PROBE_TIMEOUT_MS
        )
      ),
    ]);
    return error ? "degraded" : "ok";
  } catch {
    return "degraded";
  }
}

async function probeAuth(): Promise<CheckState> {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anonKey) return "degraded";
    // The hosted gateway 401s health without an apikey (proven in
    // drive 101) — the anon key is the publishable one, not a secret.
    const res = await fetch(`${url}/auth/v1/health`, {
      cache: "no-store",
      headers: { apikey: anonKey },
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    return res.ok ? "ok" : "degraded";
  } catch {
    return "degraded";
  }
}

async function probeCron(now: Date): Promise<CheckState> {
  try {
    const service = getServiceRoleSupabaseClient();
    const { data, error } = await service
      .from("ops_heartbeats")
      .select("last_ok_at")
      .eq("name", CRON_HEARTBEAT_NAME)
      .maybeSingle<{ last_ok_at: string }>();
    if (error) return "degraded";
    return heartbeatState(data?.last_ok_at ?? null, now, CRON_MAX_AGE_HOURS);
  } catch {
    return "degraded";
  }
}

export async function runStatusChecks(): Promise<StatusReport> {
  const nowMs = Date.now();
  if (cache && nowMs - cache.at < CACHE_TTL_MS) {
    return cache.report;
  }

  const now = new Date(nowMs);
  const [db, auth, cron] = await Promise.all([
    probeDb(),
    probeAuth(),
    probeCron(now),
  ]);

  const checks = { db, auth, cron };
  const report: StatusReport = {
    ok: overallOk(checks),
    at: now.toISOString(),
    checks,
  };
  cache = { at: nowMs, report };
  return report;
}
