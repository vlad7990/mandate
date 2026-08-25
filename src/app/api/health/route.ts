import { NextResponse } from "next/server";
import { runStatusChecks } from "@/lib/status/checks";

/**
 * The machine-readable status answer (§139 D1). Public and
 * unauthenticated — it joins ALWAYS_PUBLIC_PREFIXES in the proxy —
 * and R2-bounded: per-subsystem ok|degraded and a timestamp, nothing
 * else. The checks module caches for ~30 s, so scraping this cannot
 * become load.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const report = await runStatusChecks();
  return NextResponse.json(report, {
    status: report.ok ? 200 : 503,
    headers: { "cache-control": "no-store" },
  });
}
