// The status readings, as pure rules (§139 D1/D3).
//
// R1: no light without a reading. These functions decide what a reading
// means — staleness and aggregation — so the decisions are unit-testable
// away from the routes that gather them.

export const CRON_HEARTBEAT_NAME = "cron_maintenance";

/**
 * The cron runs daily at 06:00 UTC; 26 hours allows one full cycle plus
 * scheduler jitter before the light turns.
 */
export const CRON_MAX_AGE_HOURS = 26;

export type CheckState = "ok" | "degraded";

export function heartbeatState(
  lastOkAt: string | null,
  now: Date,
  maxAgeHours: number
): CheckState {
  if (!lastOkAt) return "degraded";
  const then = new Date(lastOkAt).getTime();
  if (!Number.isFinite(then)) return "degraded";
  return now.getTime() - then <= maxAgeHours * 3600_000 ? "ok" : "degraded";
}

export function overallOk(checks: Record<string, CheckState>): boolean {
  return Object.values(checks).every((c) => c === "ok");
}
