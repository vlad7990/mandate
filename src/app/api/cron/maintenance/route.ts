import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { runScheduledSweep } from "@/lib/sweep/run-scheduled-sweep";
import { isSweepDay } from "@/lib/sweep/digest";

/**
 * Scheduled maintenance — the product's first scheduled path.
 *
 * Invoked by Vercel Cron (see vercel.json) once a day. Until 062 nothing
 * was scheduled anywhere: guarantee-expiry instalments had to be marked
 * earned by hand, which §5a of the handoff records as a consequence
 * carried, not a design.
 *
 * ## What runs, and what deliberately does not
 *
 * - **`run_guarantee_maintenance()`** — earns `guarantee_passed`
 *   instalments whose placement started and whose guarantee window has
 *   passed. The whole policy lives in the function (migration 062); this
 *   route only invokes it and reports the count. 053's audit trigger
 *   writes the `fee_line_earned` events on the same UPDATE, actor NULL,
 *   which the trail renders as "System".
 * - **Stalled-search alerts are detection without a channel**, so they are
 *   not here. Health is computed at render time on every portfolio load
 *   (`src/lib/metrics/health.ts`), so a cron adds nothing until there is
 *   somewhere to *push* an alert — and there is no email until Resend is
 *   provisioned (founder item, §7). Scheduling a job whose output nobody
 *   receives would be motion, not automation.
 * - **Agent 14's weekly sweep** (search-health suggestions, weekly
 *   reports) belongs here when it exists on a schedule — it is an
 *   Anthropic call per active mandate, so it lands together with the
 *   Phase 1 loop verification once the API credit exists. This route is
 *   where it plugs in.
 *
 * ## Auth — fails closed
 *
 * Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}` when the env
 * var is set on the project. No CRON_SECRET in the environment means 503,
 * not open — a scheduling endpoint that defaults to public would let
 * anyone drive our write cadence. The RPC itself is additionally safe if
 * reached around this gate (idempotent, no trusted input — see 062), so
 * the gate is about hygiene, not survival.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[cron/maintenance] CRON_SECRET is not set; refusing to run");
    return NextResponse.json({ error: "Not configured." }, { status: 503 });
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("run_guarantee_maintenance");

  if (error) {
    // Postgres details go to the log; the body says only that it failed.
    // Nobody but the scheduler reads this response, but the log is where a
    // silent revenue job must not be silent.
    console.error("[cron/maintenance] run_guarantee_maintenance failed", error);
    return NextResponse.json({ error: "Maintenance failed." }, { status: 500 });
  }

  const earned = typeof data === "number" ? data : 0;
  if (earned > 0) {
    console.log(`[cron/maintenance] guarantee instalments earned: ${earned}`);
  }

  // Agent 14's weekly sweep — the socket this route's own header
  // documented, filled by the Resend slice's D3 (§58's promise kept:
  // no new migration; the principal, the `scheduled` trigger, and the
  // kill switch were staged in 087). Mondays only — the route runs
  // daily; `?sweep=force` (still behind CRON_SECRET, above) exists so
  // a drive can prove the path without waiting a week.
  const now = new Date();
  const force = new URL(req.url).searchParams.get("sweep") === "force";
  let sweep: Record<string, unknown> = { ran: false, reason: "not sweep day" };
  if (isSweepDay(now) || force) {
    const result = await runScheduledSweep(now);
    if (result.ran) {
      console.log(
        `[cron/maintenance] sweep ran: ${result.outcome.results.length} mandate(s), digest ${result.digest}`
      );
      sweep = {
        ran: true,
        mandates: result.outcome.results.length,
        agent_refused: Boolean(result.outcome.agentRefusedReason),
        digest: result.digest,
      };
    } else {
      console.error(`[cron/maintenance] sweep did not run: ${result.reason}`);
      sweep = { ran: false, reason: result.reason };
    }
  }

  return NextResponse.json({
    ok: true,
    guarantee_instalments_earned: earned,
    sweep,
  });
}
