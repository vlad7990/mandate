import "server-only";
import { getServiceRoleSupabaseClient } from "@/lib/supabase-service-role";
import type { Capability } from "./model-map";

/**
 * The capability-assignment read path (LLM router slice 4, Part R;
 * gate 1885da9). A row in capability_assignments is an explicit
 * founder override that WINS over the code map; absence means the
 * ruled map in model-map.ts governs — which is why the map's
 * tripwire test stays authoritative wherever no row exists.
 *
 * The whole table (≤35 rows) is read through the service-role client
 * into an in-process cache, TTL 60 seconds — one query per process
 * per minute, never one per call, and a founder's change is live
 * within a minute of the click with no deploy. Any read failure
 * warns ONCE and falls back to the map: a registry outage can never
 * block, fail, or reshape a model call — the same doctrine as the
 * seam's telemetry insert. A failed read still stamps the cache
 * window so a database outage costs one attempt per TTL, not one
 * per call.
 *
 * Never consulted under MANDATE_EVAL=1: benchmark runs must be
 * reproducible from the harness's own overrides and the map alone,
 * not from mutable production state.
 */

const TTL_MS = 60_000;

let cache: { fetchedAt: number; assignments: ReadonlyMap<string, string> } | null =
  null;
let warned = false;

function warnRegistry(err: unknown): void {
  if (warned) return;
  warned = true;
  console.error(
    "[registry] assignment read failed (the code map governs; model calls are unaffected):",
    err
  );
}

/**
 * The model a founder assignment names for `capability`, or null when
 * no row exists (or the registry cannot be read) — the caller then
 * falls back to the code map.
 */
export async function assignedModelForCapability(
  capability: Capability
): Promise<string | null> {
  const now = Date.now();
  if (!cache || now - cache.fetchedAt >= TTL_MS) {
    let assignments = cache?.assignments ?? new Map<string, string>();
    try {
      const supabase = getServiceRoleSupabaseClient();
      const { data, error } = await supabase
        .from("capability_assignments")
        .select("capability, model_id");
      if (error) throw error;
      assignments = new Map(
        (data as { capability: string; model_id: string }[]).map((r) => [
          r.capability,
          r.model_id,
        ])
      );
    } catch (err) {
      // Keep the last good read if there was one (stale beats blind);
      // stamp the window either way so a dead database is retried
      // once per TTL, not once per model call.
      warnRegistry(err);
    }
    cache = { fetchedAt: now, assignments };
  }
  return cache.assignments.get(capability) ?? null;
}

/** Test-only: drop the cache and the warn-once latch between cases. */
export function __resetRegistryCache(): void {
  cache = null;
  warned = false;
}
