// The inference seam's unit proofs (LLM router slice 1, gate fda4764).
// The live drive proves a real capability end to end; these pin the
// seam's contract: the model comes from the map and only the map, the
// caller's request and the raw response pass through untouched,
// provider errors are recorded and rethrown unchanged, and telemetry
// can never fail a model call.

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  getServiceClient: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/anthropic", () => ({
  getAnthropic: () => ({ messages: { create: mocks.create } }),
}));
vi.mock("@/lib/supabase-service-role", () => ({
  getServiceRoleSupabaseClient: mocks.getServiceClient,
}));

import {
  buildRunRow,
  markInferenceSchemaFailed,
  outcomeForStopReason,
  runInference,
  runInferenceStream,
  stampConversationCache,
} from "./inference";
import {
  CACHED_CONVERSATION_CAPABILITIES,
  CAPABILITY_MODEL,
} from "./model-map";

function workingServiceClient() {
  return {
    from: () => ({
      insert: (row: unknown) => {
        mocks.insert(row);
        return Promise.resolve({ error: null });
      },
      update: (patch: unknown) => ({
        eq: (_col: string, id: string) => {
          mocks.update(patch, id);
          return Promise.resolve({ error: null });
        },
      }),
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getServiceClient.mockImplementation(workingServiceClient);
});

describe("the capability map", () => {
  it("holds exactly the 35 ruled capabilities", () => {
    expect(Object.keys(CAPABILITY_MODEL)).toHaveLength(35);
  });

  it("pins every capability to claude-sonnet-4-6 this slice — a tier flip is slice 3's gate, and this test is the tripwire", () => {
    for (const [capability, model] of Object.entries(CAPABILITY_MODEL)) {
      expect(model, capability).toBe("claude-sonnet-4-6");
    }
  });
});

describe("outcomeForStopReason", () => {
  it("maps refusal to refused and everything else to ok", () => {
    expect(outcomeForStopReason("refusal")).toBe("refused");
    for (const reason of ["end_turn", "tool_use", "pause_turn", "max_tokens", null, undefined]) {
      expect(outcomeForStopReason(reason)).toBe("ok");
    }
  });
});

describe("buildRunRow", () => {
  it("maps the usage block, including cache reads", () => {
    const row = buildRunRow({
      id: "r1",
      capability: "parse_cv",
      model: "claude-sonnet-4-6",
      usage: { input_tokens: 100, output_tokens: 40, cache_read_input_tokens: 25 },
      latencyMs: 1234,
      outcome: "ok",
      projectId: "p1",
    });
    expect(row).toMatchObject({
      capability: "parse_cv",
      model: "claude-sonnet-4-6",
      provider: "anthropic",
      input_tokens: 100,
      cached_input_tokens: 25,
      output_tokens: 40,
      latency_ms: 1234,
      outcome: "ok",
      retries: 0,
      escalated_from: null,
      project_id: "p1",
    });
  });

  it("is honest about absent usage — nulls, never zeros", () => {
    const row = buildRunRow({
      id: "r2",
      capability: "copilot",
      model: "claude-sonnet-4-6",
      latencyMs: 5,
      outcome: "provider_error",
    });
    expect(row.input_tokens).toBeNull();
    expect(row.cached_input_tokens).toBeNull();
    expect(row.cache_creation_input_tokens).toBeNull();
    expect(row.output_tokens).toBeNull();
    expect(row.project_id).toBeNull();
  });

  it("captures cache writes alongside cache reads (slice 2)", () => {
    const row = buildRunRow({
      id: "r3",
      capability: "copilot",
      model: "claude-sonnet-4-6",
      usage: {
        input_tokens: 20,
        output_tokens: 5,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 7800,
      },
      latencyMs: 900,
      outcome: "ok",
    });
    expect(row.cache_creation_input_tokens).toBe(7800);
    expect(row.cached_input_tokens).toBe(0);
  });
});

describe("stampConversationCache (slice 2)", () => {
  it("only copilot carries the conversation-cache flag this slice", () => {
    expect([...CACHED_CONVERSATION_CAPABILITIES]).toEqual(["copilot"]);
  });

  it("converts a trailing user message's string content into one stamped text block", () => {
    const stamped = stampConversationCache([
      { role: "user", content: "snapshot + question" },
      { role: "assistant", content: "answer" },
      { role: "user", content: "follow-up" },
    ]);
    expect(stamped[0]).toEqual({ role: "user", content: "snapshot + question" });
    expect(stamped[1]).toEqual({ role: "assistant", content: "answer" });
    expect(stamped[2]).toEqual({
      role: "user",
      content: [
        {
          type: "text",
          text: "follow-up",
          cache_control: { type: "ephemeral" },
        },
      ],
    });
  });

  it("stamps the LAST block of block-form content and leaves the rest alone", () => {
    const stamped = stampConversationCache([
      {
        role: "user",
        content: [
          { type: "text", text: "part one" },
          { type: "text", text: "part two" },
        ],
      },
    ]);
    expect(stamped[0].content).toEqual([
      { type: "text", text: "part one" },
      {
        type: "text",
        text: "part two",
        cache_control: { type: "ephemeral" },
      },
    ]);
  });

  it("returns an assistant-tailed or empty list untouched — nothing safe to stamp", () => {
    const tailed: Parameters<typeof stampConversationCache>[0] = [
      { role: "user", content: "q" },
      { role: "assistant", content: "a" },
    ];
    expect(stampConversationCache(tailed)).toEqual(tailed);
    expect(stampConversationCache([])).toEqual([]);
  });

  it("does not mutate the caller's array", () => {
    const original: Parameters<typeof stampConversationCache>[0] = [
      { role: "user", content: "q" },
    ];
    stampConversationCache(original);
    expect(original[0].content).toBe("q");
  });
});

describe("runInference", () => {
  it("supplies the model from the map and passes the request through untouched", async () => {
    mocks.create.mockResolvedValue({
      content: [{ type: "text", text: "{}" }],
      stop_reason: "end_turn",
      usage: { input_tokens: 10, output_tokens: 3 },
    });

    const request = {
      max_tokens: 4096,
      system: "sys",
      messages: [{ role: "user" as const, content: "hi" }],
    };
    await runInference("parse_cv", request);

    expect(mocks.create).toHaveBeenCalledWith({
      ...request,
      model: "claude-sonnet-4-6",
    });
  });

  it("sends unflagged capabilities' messages byte-identically — no cache stamp", async () => {
    mocks.create.mockResolvedValue({ content: [], stop_reason: "end_turn", usage: {} });
    const messages = [{ role: "user" as const, content: "hi" }];
    await runInference("parse_cv", { max_tokens: 10, messages });
    expect(mocks.create.mock.calls[0][0].messages).toBe(messages);
  });

  it("returns the raw response and records an ok row with tokens and project", async () => {
    const upstream = {
      content: [{ type: "text", text: "{}" }],
      stop_reason: "end_turn",
      usage: { input_tokens: 10, output_tokens: 3, cache_read_input_tokens: 0 },
    };
    mocks.create.mockResolvedValue(upstream);

    const response = await runInference(
      "generate_evaluation",
      { max_tokens: 100, messages: [] },
      { projectId: "p9" }
    );

    expect(response).toBe(upstream);
    expect(mocks.insert).toHaveBeenCalledTimes(1);
    expect(mocks.insert.mock.calls[0][0]).toMatchObject({
      capability: "generate_evaluation",
      outcome: "ok",
      input_tokens: 10,
      output_tokens: 3,
      project_id: "p9",
    });
  });

  it("records a refusal as refused", async () => {
    mocks.create.mockResolvedValue({
      content: [],
      stop_reason: "refusal",
      usage: { input_tokens: 7, output_tokens: 0 },
    });
    await runInference("run_triangulation", { max_tokens: 10, messages: [] });
    expect(mocks.insert.mock.calls[0][0]).toMatchObject({ outcome: "refused" });
  });

  it("records provider errors and rethrows the SAME error, unchanged", async () => {
    const boom = Object.assign(new Error("overloaded"), { status: 529 });
    mocks.create.mockRejectedValue(boom);

    await expect(
      runInference("run_search_health", { max_tokens: 10, messages: [] })
    ).rejects.toBe(boom);
    expect(mocks.insert.mock.calls[0][0]).toMatchObject({
      capability: "run_search_health",
      outcome: "provider_error",
      input_tokens: null,
    });
  });

  it("never lets a telemetry failure touch the model call", async () => {
    mocks.getServiceClient.mockImplementation(() => {
      throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
    });
    const upstream = { content: [], stop_reason: "end_turn", usage: {} };
    mocks.create.mockResolvedValue(upstream);

    const response = await runInference("analyze_role", { max_tokens: 10, messages: [] });
    expect(response).toBe(upstream);
  });
});

describe("markInferenceSchemaFailed", () => {
  it("re-marks the run that produced the response, by its own id", async () => {
    mocks.create.mockResolvedValue({
      content: [{ type: "text", text: "not json" }],
      stop_reason: "end_turn",
      usage: {},
    });
    const response = await runInference("interpret_feedback", {
      max_tokens: 10,
      messages: [],
    });
    const insertedId = (mocks.insert.mock.calls[0][0] as { id: string }).id;

    markInferenceSchemaFailed(response);
    expect(mocks.update).toHaveBeenCalledWith({ outcome: "schema_failed" }, insertedId);
  });

  it("is a no-op for a response the seam did not produce", () => {
    markInferenceSchemaFailed({ content: [] });
    expect(mocks.update).not.toHaveBeenCalled();
  });
});

describe("runInferenceStream", () => {
  it("passes events through untouched and records usage off the stream", async () => {
    const events = [
      {
        type: "message_start",
        message: { usage: { input_tokens: 50, cache_read_input_tokens: 12 } },
      },
      { type: "content_block_delta", delta: { type: "text_delta", text: "Hello" } },
      { type: "message_delta", usage: { output_tokens: 9 }, delta: { stop_reason: "end_turn" } },
    ];
    mocks.create.mockResolvedValue(
      (async function* () {
        for (const e of events) yield e;
      })()
    );

    const stream = await runInferenceStream(
      "copilot",
      { max_tokens: 1500, messages: [] },
      { projectId: "p3" }
    );
    const seen = [];
    for await (const event of stream) seen.push(event);

    expect(seen).toEqual(events);
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({ model: "claude-sonnet-4-6", stream: true })
    );
    expect(mocks.insert.mock.calls[0][0]).toMatchObject({
      capability: "copilot",
      outcome: "ok",
      input_tokens: 50,
      cached_input_tokens: 12,
      output_tokens: 9,
      project_id: "p3",
    });
  });

  it("stamps the flagged copilot conversation before sending (slice 2)", async () => {
    mocks.create.mockResolvedValue((async function* () {})());
    await runInferenceStream("copilot", {
      max_tokens: 1500,
      messages: [{ role: "user", content: "snapshot + question" }],
    });
    expect(mocks.create.mock.calls[0][0].messages).toEqual([
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "snapshot + question",
            cache_control: { type: "ephemeral" },
          },
        ],
      },
    ]);
  });

  it("records a mid-stream provider error and rethrows it", async () => {
    const boom = new Error("stream died");
    mocks.create.mockResolvedValue(
      (async function* () {
        yield {
          type: "message_start",
          message: { usage: { input_tokens: 5 } },
        };
        throw boom;
      })()
    );

    const stream = await runInferenceStream("copilot", { max_tokens: 10, messages: [] });
    await expect(async () => {
      for await (const _event of stream) {
        void _event;
      }
    }).rejects.toBe(boom);
    expect(mocks.insert.mock.calls[0][0]).toMatchObject({
      outcome: "provider_error",
      input_tokens: 5,
    });
  });
});
