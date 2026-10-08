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
 *
 * `modelActivation` below is the second read (C9, 2026-10-08) and obeys
 * the same doctrine, with the direction of its fallback inverted for
 * the one caller it has. See its own comment: it serves OPTIONAL paths
 * — today just the escalation hop — where "we cannot tell whether this
 * model is activated" has to mean "do not use it", because the model it
 * guards has never been benchmarked. It must never be consulted on a
 * primary call path; there, an unreadable registry falls back to the
 * code map and the call proceeds.
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

let statusCache: {
  fetchedAt: number;
  statuses: ReadonlyMap<string, string>;
  /** False when the window was stamped by a FAILED read with nothing
   * cached before it — the difference between "this model is not in the
   * table" and "we could not read the table". */
  readable: boolean;
} | null = null;
let statusWarned = false;

function warnStatusRegistry(err: unknown): void {
  if (statusWarned) return;
  statusWarned = true;
  console.error(
    "[registry] provider_models read failed (model status is unknown; " +
      "escalation skips its optional hop and no primary call is affected):",
    err
  );
}

/**
 * What the registry says about a model's lifecycle status.
 *
 *   "active"     — the row exists at status 'active', which per the
 *                  provider_models_active_needs_evidence CHECK means a
 *                  benchmark_ref names the eval behind it.
 *   "not_active" — the table was read and the model is either absent or
 *                  at 'benchmarking'/'retired'.
 *   "unknown"    — the table could not be read at all.
 *
 * The two negatives are kept apart for the LOG, not for the decision:
 * every caller treats both as "do not use this model". Callers must be
 * optional paths only — this read can never gate a primary model call
 * (that is the doctrine at the top of this file).
 */
export type ModelActivation = "active" | "not_active" | "unknown";

export async function modelActivation(
  modelId: string
): Promise<ModelActivation> {
  const now = Date.now();
  if (!statusCache || now - statusCache.fetchedAt >= TTL_MS) {
    let statuses = statusCache?.statuses ?? new Map<string, string>();
    let readable = statusCache?.readable ?? false;
    try {
      const supabase = getServiceRoleSupabaseClient();
      const { data, error } = await supabase
        .from("provider_models")
        .select("model_id, status");
      if (error) throw error;
      statuses = new Map(
        (data as { model_id: string; status: string }[]).map((r) => [
          r.model_id,
          r.status,
        ])
      );
      readable = true;
    } catch (err) {
      // Same shape as the assignment read: keep the last good snapshot
      // (stale beats blind), stamp the window either way so a dead
      // database costs one attempt per TTL rather than one per call.
      warnStatusRegistry(err);
    }
    statusCache = { fetchedAt: now, statuses, readable };
  }
  if (!statusCache.readable) return "unknown";
  return statusCache.statuses.get(modelId) === "active" ? "active" : "not_active";
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

/** Test-only: drop both caches and the warn-once latches between cases. */
export function __resetRegistryCache(): void {
  cache = null;
  warned = false;
  statusCache = null;
  statusWarned = false;
}
