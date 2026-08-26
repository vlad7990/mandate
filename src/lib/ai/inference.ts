import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { randomUUID } from "crypto";
import { getAnthropic } from "@/lib/anthropic";
import { getServiceRoleSupabaseClient } from "@/lib/supabase-service-role";
import {
  CACHED_CONVERSATION_CAPABILITIES,
  CAPABILITY_THINKING,
  INFERENCE_PROVIDER,
  modelForCapability,
  type Capability,
} from "./model-map";

/**
 * The inference seam — every model call in the product flows through
 * here (LLM router slice 1, gate fda4764). The seam does exactly two
 * things the call sites used to do for themselves, and nothing more:
 * it resolves the model from the capability map, and it records one
 * inference_runs row per call.
 *
 * LAW (Part N of the review, ruled): this module never holds a
 * product Supabase client. It receives prompt strings and returns raw
 * responses — every read-under-RLS and write-under-RLS stays in the
 * callers, so provider choice can never change what an agent reads or
 * writes. Its ONLY database access is the service-role telemetry
 * insert below, which is fire-and-forget: a failed telemetry write
 * logs and never blocks, fails, or reshapes the model call it
 * describes. Skills keep influencing judgment only — they arrive here
 * already applied to the system prompt, and nothing in this module
 * gives them (or the model) a say in model choice.
 *
 * NOT here, deliberately (each is a later slice behind its own gate):
 * caching, cost math, prices, retries beyond the SDK's own,
 * fallbacks, escalation, providers, policy tables.
 */

export type InferenceRequest = Omit<
  Anthropic.Messages.MessageCreateParamsNonStreaming,
  "model" | "stream"
>;

export type InferenceStreamRequest = Omit<
  Anthropic.Messages.MessageCreateParamsStreaming,
  "model" | "stream"
>;

export type InferenceOutcome =
  | "ok"
  | "schema_failed"
  | "provider_error"
  | "refused";

/**
 * A refusal is the only stop_reason that changes the bookkeeping —
 * everything else (end_turn, tool_use, pause_turn, max_tokens) is a
 * response the caller's existing handling already deals with.
 */
export function outcomeForStopReason(
  stopReason: string | null | undefined
): "ok" | "refused" {
  return stopReason === "refusal" ? "refused" : "ok";
}

type InferenceRunRow = {
  id: string;
  capability: Capability;
  model: string;
  provider: string;
  input_tokens: number | null;
  cached_input_tokens: number | null;
  cache_creation_input_tokens: number | null;
  output_tokens: number | null;
  latency_ms: number;
  outcome: InferenceOutcome;
  retries: number;
  escalated_from: null;
  project_id: string | null;
};

/** Build the telemetry row from a usage block that may be absent
 * (mocked responses in tests carry none). Exported for its tests. */
export function buildRunRow(args: {
  id: string;
  capability: Capability;
  model: string;
  usage?: {
    input_tokens?: number | null;
    output_tokens?: number | null;
    cache_read_input_tokens?: number | null;
    cache_creation_input_tokens?: number | null;
  } | null;
  latencyMs: number;
  outcome: InferenceOutcome;
  projectId?: string | null;
}): InferenceRunRow {
  return {
    id: args.id,
    capability: args.capability,
    model: args.model,
    provider: INFERENCE_PROVIDER,
    input_tokens: args.usage?.input_tokens ?? null,
    cached_input_tokens: args.usage?.cache_read_input_tokens ?? null,
    cache_creation_input_tokens:
      args.usage?.cache_creation_input_tokens ?? null,
    output_tokens: args.usage?.output_tokens ?? null,
    latency_ms: args.latencyMs,
    outcome: args.outcome,
    // 0 is honest: the SDK's internal max_retries are not observable
    // per call, and app-level retries do not exist this slice.
    retries: 0,
    escalated_from: null,
    project_id: args.projectId ?? null,
  };
}

/** Log the first telemetry failure per process, then stay quiet — a
 * missing env in a test run must not drown the suite's output. */
let telemetryWarned = false;
function warnTelemetry(err: unknown): void {
  if (telemetryWarned) return;
  telemetryWarned = true;
  console.error(
    "[inference] telemetry write failed (model calls are unaffected):",
    err
  );
}

function insertRun(row: InferenceRunRow): void {
  if (EVAL_MODE()) {
    // The harness reads runs from memory; eval telemetry never lands
    // in the production table (gate 03bafc3, Part B.7).
    __evalRecordedRuns.push(row);
    return;
  }
  try {
    const supabase = getServiceRoleSupabaseClient();
    void supabase
      .from("inference_runs")
      .insert(row)
      .then(
        ({ error }) => {
          if (error) warnTelemetry(error);
        },
        (err: unknown) => warnTelemetry(err)
      );
  } catch (err) {
    warnTelemetry(err);
  }
}

/**
 * THE EVAL FENCE (slice 3, gate 03bafc3). `MANDATE_EVAL=1` is the
 * offline eval harness's flag and never set in any deployment. Behind
 * it, and ONLY behind it: a per-call model/thinking override for
 * benchmarking, and an in-memory record of every run so the harness
 * reads honest tokens/latency without a database. Product code and
 * agents can never choose a model (Part N): an override without the
 * fence THROWS rather than being silently ignored.
 */
const EVAL_MODE = () => process.env.MANDATE_EVAL === "1";

export type InferenceOverrides = {
  /** Eval-only: run this exact model instead of the map's. */
  modelOverride?: string;
  /** Eval-only: an explicit thinking config (e.g. {type:"disabled"}). */
  thinkingOverride?: { type: "adaptive" | "disabled" };
};

/** Harness-set overrides for calls the seams make internally (the
 * product functions don't — and must not — take a model parameter).
 * Fence-guarded on both set and use; always null in production. */
let evalOverrides: InferenceOverrides | null = null;
export function __setEvalOverrides(o: InferenceOverrides | null): void {
  if (!EVAL_MODE()) {
    throw new Error(
      "[inference] __setEvalOverrides is eval-only (MANDATE_EVAL=1)."
    );
  }
  evalOverrides = o;
}

function resolveOverrides(
  capability: Capability,
  opts?: InferenceOverrides
): { model: string; extra: Record<string, unknown> } {
  const wantsOverride = opts?.modelOverride ?? opts?.thinkingOverride;
  if (wantsOverride && !EVAL_MODE()) {
    throw new Error(
      "[inference] model/thinking overrides are eval-only (MANDATE_EVAL=1); " +
        "production model choice lives in the capability map alone."
    );
  }
  // The map's own thinking config is PRODUCTION behavior (§150's
  // flip word: generate_evaluation = Sonnet 5 thinking-off).
  const mapThinking = CAPABILITY_THINKING[capability];
  if (!EVAL_MODE()) {
    return {
      model: modelForCapability(capability),
      extra: mapThinking ? { thinking: mapThinking } : {},
    };
  }
  const model =
    opts?.modelOverride ??
    evalOverrides?.modelOverride ??
    modelForCapability(capability);
  const thinking =
    opts?.thinkingOverride ?? evalOverrides?.thinkingOverride ?? mapThinking;
  return { model, extra: thinking ? { thinking } : {} };
}

/** Eval-only run capture — populated behind the fence, drained by the
 * harness. Always empty in production. */
export const __evalRecordedRuns: InferenceRunRow[] = [];

/** response object → run id, so a caller's normalize-failure branch
 * can re-mark the row without the row id ever entering its shape. */
const runIdByResponse = new WeakMap<object, string>();

/**
 * Mark a run's outcome as schema_failed — the one-liner a seam adds
 * inside its EXISTING parse/normalize failure branch. Fire-and-forget
 * like the insert; a response the seam did not produce is a no-op.
 */
export function markInferenceSchemaFailed(response: object): void {
  const id = runIdByResponse.get(response);
  if (!id) return;
  try {
    const supabase = getServiceRoleSupabaseClient();
    void supabase
      .from("inference_runs")
      .update({ outcome: "schema_failed" })
      .eq("id", id)
      .then(
        ({ error }) => {
          if (error) warnTelemetry(error);
        },
        (err: unknown) => warnTelemetry(err)
      );
  } catch (err) {
    warnTelemetry(err);
  }
}

/**
 * Stamp the LAST user message with an ephemeral cache_control so the
 * whole conversation prefix (tools → system → every prior turn)
 * caches, and the next turn reads it at ~0.1× (slice 2, gate
 * 0788898). Pure and exported for its tests. String content becomes
 * its equivalent single text block — wire-identical otherwise. A
 * list that doesn't end on a user turn is returned untouched: there
 * is nothing safe to stamp.
 */
export function stampConversationCache(
  messages: ReadonlyArray<Anthropic.Messages.MessageParam>
): Anthropic.Messages.MessageParam[] {
  const last = messages[messages.length - 1];
  if (!last || last.role !== "user") return [...messages];

  const ephemeral = { type: "ephemeral" as const };
  let content: Anthropic.Messages.MessageParam["content"];
  if (typeof last.content === "string") {
    content = [{ type: "text", text: last.content, cache_control: ephemeral }];
  } else {
    const blocks = [...last.content];
    const tail = blocks[blocks.length - 1];
    // Only block kinds the API accepts a cache_control on; anything
    // else (e.g. a thinking block) means nothing safe to stamp.
    if (
      !tail ||
      typeof tail !== "object" ||
      !["text", "image", "document", "tool_use", "tool_result"].includes(
        tail.type
      )
    ) {
      return [...messages];
    }
    blocks[blocks.length - 1] = {
      ...tail,
      cache_control: ephemeral,
    } as Anthropic.Messages.ContentBlockParam;
    content = blocks;
  }
  return [...messages.slice(0, -1), { ...last, content }];
}

/** The seam's caching decision — per-capability flag, never the
 * prompt builder's business (Part J's own rule). */
function withConversationCache<
  R extends { messages: Anthropic.Messages.MessageParam[] },
>(capability: Capability, request: R): R {
  if (!CACHED_CONVERSATION_CAPABILITIES.has(capability)) return request;
  return { ...request, messages: stampConversationCache(request.messages) };
}

/**
 * One non-streaming model call. `request` is the caller's request
 * exactly as it built it today — same system, messages, tools,
 * output_config, per-seam max_tokens; the seam supplies ONLY the
 * model. Returns the raw Anthropic message; provider errors are
 * recorded and RETHROWN unchanged so every seam's existing
 * agent-errors/090 handling fires exactly as before.
 */
export async function runInference(
  capability: Capability,
  request: InferenceRequest,
  opts?: { projectId?: string | null } & InferenceOverrides
): Promise<Anthropic.Message> {
  const { model, extra } = resolveOverrides(capability, opts);
  const anthropic = getAnthropic();
  const id = randomUUID();
  const started = Date.now();

  let response: Anthropic.Message;
  try {
    response = await anthropic.messages.create({
      ...withConversationCache(capability, request),
      ...extra,
      model,
    });
  } catch (err) {
    insertRun(
      buildRunRow({
        id,
        capability,
        model,
        latencyMs: Date.now() - started,
        outcome: "provider_error",
        projectId: opts?.projectId,
      })
    );
    throw err;
  }

  insertRun(
    buildRunRow({
      id,
      capability,
      model,
      usage: response.usage,
      latencyMs: Date.now() - started,
      outcome: outcomeForStopReason(response.stop_reason),
      projectId: opts?.projectId,
    })
  );
  runIdByResponse.set(response, id);
  return response;
}

/**
 * The one streaming call shape (copilot's SSE). Events pass through
 * byte-identical; usage is read off message_start / message_delta and
 * the row is written when the stream completes or throws. A stream
 * the consumer abandons mid-flight (client disconnect) may leave no
 * row — acceptable for ops telemetry, never worth buffering an SSE
 * response over.
 */
export async function runInferenceStream(
  capability: Capability,
  request: InferenceStreamRequest,
  opts?: { projectId?: string | null } & InferenceOverrides
): Promise<AsyncIterable<Anthropic.Messages.RawMessageStreamEvent>> {
  const { model, extra } = resolveOverrides(capability, opts);
  const anthropic = getAnthropic();
  const id = randomUUID();
  const started = Date.now();

  let upstream: AsyncIterable<Anthropic.Messages.RawMessageStreamEvent>;
  try {
    upstream = await anthropic.messages.create({
      ...withConversationCache(capability, request),
      ...extra,
      model,
      stream: true,
    });
  } catch (err) {
    insertRun(
      buildRunRow({
        id,
        capability,
        model,
        latencyMs: Date.now() - started,
        outcome: "provider_error",
        projectId: opts?.projectId,
      })
    );
    throw err;
  }

  const projectId = opts?.projectId;

  return (async function* () {
    const usage: {
      input_tokens: number | null;
      cache_read_input_tokens: number | null;
      cache_creation_input_tokens: number | null;
      output_tokens: number | null;
    } = {
      input_tokens: null,
      cache_read_input_tokens: null,
      cache_creation_input_tokens: null,
      output_tokens: null,
    };
    let stopReason: string | null = null;

    try {
      for await (const event of upstream) {
        if (event.type === "message_start") {
          usage.input_tokens = event.message.usage?.input_tokens ?? null;
          usage.cache_read_input_tokens =
            event.message.usage?.cache_read_input_tokens ?? null;
          usage.cache_creation_input_tokens =
            event.message.usage?.cache_creation_input_tokens ?? null;
        } else if (event.type === "message_delta") {
          usage.output_tokens = event.usage?.output_tokens ?? null;
          stopReason = event.delta?.stop_reason ?? stopReason;
        }
        yield event;
      }
    } catch (err) {
      insertRun(
        buildRunRow({
          id,
          capability,
          model,
          usage,
          latencyMs: Date.now() - started,
          outcome: "provider_error",
          projectId,
        })
      );
      throw err;
    }

    insertRun(
      buildRunRow({
        id,
        capability,
        model,
        usage,
        latencyMs: Date.now() - started,
        outcome: outcomeForStopReason(stopReason),
        projectId,
      })
    );
  })();
}
