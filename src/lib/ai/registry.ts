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

/** What the registry holds about one model, for the two questions the
 * seam asks of it: may we route here (C9), and can we price it (C11). */
type ModelFacts = { status: string; priced: boolean };

let statusCache: {
  fetchedAt: number;
  models: ReadonlyMap<string, ModelFacts>;
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

async function modelFacts(): Promise<{
  models: ReadonlyMap<string, ModelFacts>;
  readable: boolean;
}> {
  const now = Date.now();
  if (!statusCache || now - statusCache.fetchedAt >= TTL_MS) {
    let models = statusCache?.models ?? new Map<string, ModelFacts>();
    let readable = statusCache?.readable ?? false;
    try {
      const supabase = getServiceRoleSupabaseClient();
      const { data, error } = await supabase
        .from("provider_models")
        .select(
          "model_id, status, price_input_per_mtok, price_output_per_mtok"
        );
      if (error) throw error;
      models = new Map(
        (
          data as {
            model_id: string;
            status: string;
            price_input_per_mtok: number | null;
            price_output_per_mtok: number | null;
          }[]
        ).map((r) => [
          r.model_id,
          {
            status: r.status,
            // BOTH prices, because the cost formula needs both and
            // returns NULL without either. Half a price is no price.
            priced:
              r.price_input_per_mtok !== null &&
              r.price_output_per_mtok !== null,
          },
        ])
      );
      readable = true;
    } catch (err) {
      // Same shape as the assignment read: keep the last good snapshot
      // (stale beats blind), stamp the window either way so a dead
      // database costs one attempt per TTL rather than one per call.
      warnStatusRegistry(err);
    }
    statusCache = { fetchedAt: now, models, readable };
  }
  return statusCache;
}

export async function modelActivation(
  modelId: string
): Promise<ModelActivation> {
  const { models, readable } = await modelFacts();
  if (!readable) return "unknown";
  return models.get(modelId)?.status === "active" ? "active" : "not_active";
}

/**
 * Whether the registry can price `modelId` (C11) — one more question of
 * the SAME cached read, so asking it costs no extra query.
 *
 *   "priced"   — both prices present; `ai_run_cost_usd` returns a number.
 *   "unpriced" — the row exists with a NULL price, or there is no row.
 *                `ai_run_cost_usd` returns NULL for it, so spend against
 *                this model is invisible to the budget.
 *   "unknown"  — the registry could not be read.
 *
 * As with `modelActivation`, the two non-affirmative answers are kept
 * apart for the caller's FAIL DIRECTION rather than for the log: the
 * budget guard refuses an `unpriced` model and allows an `unknown` one,
 * because this question is asked on the PRIMARY call path, where an
 * unreadable registry must never stop the product.
 */
export type ModelPricing = "priced" | "unpriced" | "unknown";

export async function modelPricing(modelId: string): Promise<ModelPricing> {
  const { models, readable } = await modelFacts();
  if (!readable) return "unknown";
  return models.get(modelId)?.priced ? "priced" : "unpriced";
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
