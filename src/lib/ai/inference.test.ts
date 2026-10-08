// The inference seam's unit proofs (LLM router slice 1, gate fda4764).
// The live drive proves a real capability end to end; these pin the
// seam's contract: the model comes from the map and only the map, the
// caller's request and the raw response pass through untouched,
// provider errors are recorded and rethrown unchanged, and telemetry
// can never fail a model call.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  getServiceClient: vi.fn(),
  // Rows the registry read (slice 4) returns; empty = no overrides,
  // the map governs — which is every pre-slice-4 test's assumption.
  assignmentRows: [] as { capability: string; model_id: string }[],
  // Rows provider_models returns (C9). The default set in beforeEach is
  // PRODUCTION as of migration 162 — opus-5 registered at
  // `benchmarking`, never benchmarked — so the suite's baseline is the
  // real world: the armed pair's target is not usable.
  providerModelRows: [] as { model_id: string; status: string }[],
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/anthropic", () => ({
  getAnthropic: () => ({ messages: { create: mocks.create } }),
}));
vi.mock("@/lib/supabase-service-role", () => ({
  getServiceRoleSupabaseClient: mocks.getServiceClient,
}));

import {
  __evalRecordedRuns,
  __resetEscalationWarnings,
  __setEvalOverrides,
  buildRunRow,
  escalateInference,
  markInferenceSchemaFailed,
  outcomeForStopReason,
  runInference,
  runInferenceStream,
  stampConversationCache,
} from "./inference";
import {
  CACHED_CONVERSATION_CAPABILITIES,
  CAPABILITY_MODEL,
  ESCALATION_PAIRS,
} from "./model-map";
import { __resetRegistryCache } from "./registry";

/** Production provider_models as of migration 162: three active models
 * and claude-opus-5 registered at `benchmarking` because the armed
 * generate_evaluation escalation targets it. */
const PRODUCTION_PROVIDER_MODELS = [
  { model_id: "claude-haiku-4-5", status: "active" },
  { model_id: "claude-sonnet-4-6", status: "active" },
  { model_id: "claude-sonnet-5", status: "active" },
  { model_id: "claude-opus-5", status: "benchmarking" },
];

function workingServiceClient() {
  return {
    from: (table: string) => ({
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
      select: () =>
        Promise.resolve({
          data:
            table === "provider_models"
              ? mocks.providerModelRows
              : mocks.assignmentRows,
          error: null,
        }),
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.assignmentRows = [];
  mocks.providerModelRows = [...PRODUCTION_PROVIDER_MODELS];
  __resetRegistryCache();
  __resetEscalationWarnings();
  mocks.getServiceClient.mockImplementation(workingServiceClient);
});

describe("the capability map", () => {
  it("holds exactly the 36 ruled capabilities", () => {
    // 35 + verify_evaluation (§182 slice R, the founder's word).
    expect(Object.keys(CAPABILITY_MODEL)).toHaveLength(36);
  });

  it("pins the RULED mapping (§150 flip word) — any edit here without a gate behind it is the defect this tripwire exists to catch", () => {
    const flipped: Record<string, string> = {
      generate_sourcing: "claude-haiku-4-5",
      run_relationship: "claude-haiku-4-5",
      run_target_companies: "claude-haiku-4-5",
      generate_evaluation: "claude-sonnet-5",
      // §182: the refuter audits generate_evaluation at the same tier.
      verify_evaluation: "claude-sonnet-5",
    };
    for (const [capability, model] of Object.entries(CAPABILITY_MODEL)) {
      expect(model, capability).toBe(
        flipped[capability] ?? "claude-sonnet-4-6"
      );
    }
  });

  it("pins the RULED escalation pairs (gate ef832fc, the founder's word) — an edit here without a gate is the defect this tripwire catches", () => {
    expect(ESCALATION_PAIRS).toEqual({
      parse_cv: { from: "claude-haiku-4-5", to: "claude-sonnet-4-6" },
      generate_evaluation: { from: "claude-sonnet-5", to: "claude-opus-5" },
    });
  });

  it("sends the benchmarked thinking-off variant for generate_evaluation — bare Sonnet 5 runs adaptive, which truncated", async () => {
    mocks.create.mockResolvedValue({
      content: [{ type: "text", text: "{}" }],
      stop_reason: "end_turn",
      usage: {},
    });
    await runInference("generate_evaluation", { max_tokens: 10, messages: [] });
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "claude-sonnet-5",
        thinking: { type: "disabled" },
      })
    );
    mocks.create.mockClear();
    await runInference("run_target_companies", { max_tokens: 10, messages: [] });
    const sent = mocks.create.mock.calls[0][0];
    expect(sent.model).toBe("claude-haiku-4-5");
    expect(sent).not.toHaveProperty("thinking");
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

describe("the eval fence (slice 3)", () => {
  it("REFUSES a model override outside eval mode — production model choice is the map's alone", async () => {
    await expect(
      runInference(
        "parse_cv",
        { max_tokens: 10, messages: [] },
        { modelOverride: "claude-haiku-4-5" }
      )
    ).rejects.toThrow(/eval-only/);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("REFUSES __setEvalOverrides outside eval mode", () => {
    expect(() => __setEvalOverrides({ modelOverride: "x" })).toThrow(
      /eval-only/
    );
  });

  it("under MANDATE_EVAL=1: honors the override, records in memory, never touches the DB", async () => {
    process.env.MANDATE_EVAL = "1";
    try {
      mocks.create.mockResolvedValue({
        content: [],
        stop_reason: "end_turn",
        usage: { input_tokens: 5, output_tokens: 2 },
      });
      const before = __evalRecordedRuns.length;
      __setEvalOverrides({
        modelOverride: "claude-haiku-4-5",
        thinkingOverride: { type: "disabled" },
      });
      await runInference("parse_cv", { max_tokens: 10, messages: [] });
      __setEvalOverrides(null);

      expect(mocks.create).toHaveBeenCalledWith(
        expect.objectContaining({
          model: "claude-haiku-4-5",
          thinking: { type: "disabled" },
        })
      );
      expect(__evalRecordedRuns.length).toBe(before + 1);
      expect(__evalRecordedRuns[before]).toMatchObject({
        capability: "parse_cv",
        model: "claude-haiku-4-5",
        outcome: "ok",
      });
      expect(mocks.insert).not.toHaveBeenCalled();
    } finally {
      delete process.env.MANDATE_EVAL;
    }
  });
});

describe("the assignment override (slice 4)", () => {
  const ok = () =>
    mocks.create.mockResolvedValue({
      content: [],
      stop_reason: "end_turn",
      usage: {},
    });

  it("a registry row wins over the map — and drops the map's thinking config when the model differs (gate J.6)", async () => {
    ok();
    mocks.assignmentRows = [
      { capability: "generate_evaluation", model_id: "claude-sonnet-4-6" },
    ];
    await runInference("generate_evaluation", { max_tokens: 10, messages: [] });
    const sent = mocks.create.mock.calls[0][0];
    expect(sent.model).toBe("claude-sonnet-4-6");
    // CAPABILITY_THINKING was benchmarked FOR the map's model; a
    // different resolved model sends no thinking param.
    expect(sent).not.toHaveProperty("thinking");
  });

  it("an assignment naming the map's own model keeps the benchmarked thinking config", async () => {
    ok();
    mocks.assignmentRows = [
      { capability: "generate_evaluation", model_id: "claude-sonnet-5" },
    ];
    await runInference("generate_evaluation", { max_tokens: 10, messages: [] });
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "claude-sonnet-5",
        thinking: { type: "disabled" },
      })
    );
  });

  it("no row = the ruled map governs; the telemetry row records the override model when one rides", async () => {
    ok();
    await runInference("run_target_companies", { max_tokens: 10, messages: [] });
    expect(mocks.create.mock.calls[0][0].model).toBe("claude-haiku-4-5");

    mocks.create.mockClear();
    __resetRegistryCache();
    mocks.assignmentRows = [
      { capability: "run_target_companies", model_id: "claude-sonnet-5" },
    ];
    await runInference("run_target_companies", { max_tokens: 10, messages: [] });
    expect(mocks.create.mock.calls[0][0].model).toBe("claude-sonnet-5");
    expect(mocks.insert).toHaveBeenLastCalledWith(
      expect.objectContaining({
        capability: "run_target_companies",
        model: "claude-sonnet-5",
      })
    );
  });

  it("a failed registry read falls back to the map and never blocks the call", async () => {
    ok();
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      mocks.getServiceClient.mockImplementation(() => ({
        from: () => ({
          insert: () => Promise.resolve({ error: null }),
          select: () => Promise.reject(new Error("registry down")),
        }),
      }));
      const response = await runInference("run_target_companies", {
        max_tokens: 10,
        messages: [],
      });
      expect(response.stop_reason).toBe("end_turn");
      expect(mocks.create.mock.calls[0][0].model).toBe("claude-haiku-4-5");
    } finally {
      spy.mockRestore();
    }
  });

  it("under MANDATE_EVAL=1 the registry is never consulted — benchmarks are reproducible from the harness alone", async () => {
    process.env.MANDATE_EVAL = "1";
    try {
      ok();
      mocks.assignmentRows = [
        { capability: "parse_cv", model_id: "claude-sonnet-5" },
      ];
      await runInference("parse_cv", { max_tokens: 10, messages: [] });
      expect(mocks.create.mock.calls[0][0].model).toBe(
        CAPABILITY_MODEL.parse_cv
      );
    } finally {
      delete process.env.MANDATE_EVAL;
    }
  });
});

describe("the escalation hop (Part G / O.5)", () => {
  const ok = () =>
    mocks.create.mockResolvedValue({
      content: [{ type: "text", text: "not json" }],
      stop_reason: "end_turn",
      usage: {},
    });
  const request = { max_tokens: 10, messages: [] };

  /** C9: the hop now requires its target to be `active` in
   * provider_models, and in production opus-5 is `benchmarking`. A test
   * about the hop's MECHANICS has to activate it first. */
  const activateOpus = () => {
    mocks.providerModelRows = [
      ...PRODUCTION_PROVIDER_MODELS.filter(
        (m) => m.model_id !== "claude-opus-5"
      ),
      { model_id: "claude-opus-5", status: "active" },
    ];
  };

  it("fires for generate_evaluation: marks the failed run, retries the SAME request on opus-5, records escalated_from", async () => {
    ok();
    activateOpus();
    const first = await runInference("generate_evaluation", request);
    mocks.create.mockClear();
    mocks.insert.mockClear();

    const second = await escalateInference(
      "generate_evaluation",
      request,
      undefined,
      first
    );
    expect(second).not.toBeNull();
    // The failed run was re-marked schema_failed by its own id.
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "schema_failed" }),
      expect.any(String)
    );
    // The hop carried the identical request, the pair's to-model, and
    // NO thinking param (the config was benchmarked for the map's model).
    const sent = mocks.create.mock.calls[0][0];
    expect(sent.model).toBe("claude-opus-5");
    expect(sent.max_tokens).toBe(10);
    expect(sent).not.toHaveProperty("thinking");
    // The new row is honest about the hop.
    expect(mocks.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        capability: "generate_evaluation",
        model: "claude-opus-5",
        escalated_from: "claude-sonnet-5",
      })
    );
  });

  it("the from-guard is the arming pin: parse_cv (still on sonnet-4-6) gets NO hop", async () => {
    ok();
    const first = await runInference("parse_cv", request);
    mocks.create.mockClear();
    const second = await escalateInference("parse_cv", request, undefined, first);
    expect(second).toBeNull();
    expect(mocks.create).not.toHaveBeenCalled();
    // The failed run is still marked — honesty precedes the guard.
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "schema_failed" }),
      expect.any(String)
    );
  });

  it("a founder registry override disarms the pair rather than escalating off the founder's model", async () => {
    ok();
    mocks.assignmentRows = [
      { capability: "generate_evaluation", model_id: "claude-sonnet-4-6" },
    ];
    const first = await runInference("generate_evaluation", request);
    mocks.create.mockClear();
    const second = await escalateInference(
      "generate_evaluation",
      request,
      undefined,
      first
    );
    expect(second).toBeNull();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("a capability with no ruled pair never hops", async () => {
    ok();
    const first = await runInference("copilot", request);
    mocks.create.mockClear();
    const second = await escalateInference("copilot", request, undefined, first);
    expect(second).toBeNull();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("never hops under MANDATE_EVAL — benchmarks measure ONE model", async () => {
    process.env.MANDATE_EVAL = "1";
    try {
      ok();
      const first = await runInference("generate_evaluation", request);
      mocks.create.mockClear();
      const second = await escalateInference(
        "generate_evaluation",
        request,
        undefined,
        first
      );
      expect(second).toBeNull();
      expect(mocks.create).not.toHaveBeenCalled();
    } finally {
      delete process.env.MANDATE_EVAL;
    }
  });

  describe("the activation gate (C9)", () => {
    /** Each case asserts the SAME two things: no provider call was made
     * with the pair's to-model, and the failed run was still marked
     * schema_failed — honesty precedes the gate, exactly as it precedes
     * the from-guard. */
    async function attemptHop() {
      ok();
      const first = await runInference("generate_evaluation", request);
      mocks.create.mockClear();
      return escalateInference("generate_evaluation", request, undefined, first);
    }

    let errorSpy: ReturnType<typeof vi.spyOn>;
    beforeEach(() => {
      errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    });
    afterEach(() => {
      errorSpy.mockRestore();
    });

    it("refuses the hop in PRODUCTION's own state: opus-5 is `benchmarking`, so the armed pair does not fire", async () => {
      // This is the C9 defect closed. The pair is armed (default is
      // sonnet-5, the pair's from is sonnet-5) and before this gate the
      // to-model was a code constant handed straight to the provider —
      // so the first hop would also have been the first opus-5 call ever
      // made, on a model that has never been benchmarked.
      expect(await attemptHop()).toBeNull();
      expect(mocks.create).not.toHaveBeenCalled();
      expect(mocks.update).toHaveBeenCalledWith(
        expect.objectContaining({ outcome: "schema_failed" }),
        expect.any(String)
      );
      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(String(errorSpy.mock.calls[0][0])).toContain(
        "not active in provider_models"
      );
    });

    it("refuses a `retired` target", async () => {
      mocks.providerModelRows = [
        ...PRODUCTION_PROVIDER_MODELS.filter(
          (m) => m.model_id !== "claude-opus-5"
        ),
        { model_id: "claude-opus-5", status: "retired" },
      ];
      expect(await attemptHop()).toBeNull();
      expect(mocks.create).not.toHaveBeenCalled();
    });

    it("refuses a target that is in no row at all", async () => {
      // The state before migration 162. Absence is not permission.
      mocks.providerModelRows = PRODUCTION_PROVIDER_MODELS.filter(
        (m) => m.model_id !== "claude-opus-5"
      );
      expect(await attemptHop()).toBeNull();
      expect(mocks.create).not.toHaveBeenCalled();
    });

    it("SKIPS the hop when provider_models cannot be read — the conservative direction, and the opposite of resolveOverrides", async () => {
      // The registry doctrine ("a read failure never blocks, fails or
      // reshapes a model call") protects the PRIMARY call, which still
      // falls back to the code map and proceeds. This is an optional
      // retry: skipping it returns the caller to its pre-escalation
      // behaviour, whereas failing open would spend an unevidenced
      // premium call precisely when the product cannot tell whether the
      // model is sanctioned.
      ok();
      const first = await runInference("generate_evaluation", request);
      mocks.create.mockClear();
      mocks.getServiceClient.mockImplementation(() => ({
        from: (table: string) => ({
          insert: () => Promise.resolve({ error: null }),
          update: () => ({ eq: () => Promise.resolve({ error: null }) }),
          select: () =>
            table === "provider_models"
              ? Promise.reject(new Error("registry down"))
              : Promise.resolve({ data: [], error: null }),
        }),
      }));
      __resetRegistryCache();

      const second = await escalateInference(
        "generate_evaluation",
        request,
        undefined,
        first
      );
      expect(second).toBeNull();
      expect(mocks.create).not.toHaveBeenCalled();
      expect(
        errorSpy.mock.calls.some((c: unknown[]) =>
          String(c[0]).includes("of unknown status")
        )
      ).toBe(true);
    });

    it("warns ONCE per reason, not once per failure", async () => {
      expect(await attemptHop()).toBeNull();
      expect(await attemptHop()).toBeNull();
      expect(await attemptHop()).toBeNull();
      expect(errorSpy).toHaveBeenCalledTimes(1);
    });

    it("reads provider_models only when a hop would otherwise fire — a dormant pair costs no query", async () => {
      ok();
      // parse_cv's pair is dormant (default sonnet-4-6, from haiku-4-5),
      // so the from-guard returns first and the registry is untouched.
      const first = await runInference("parse_cv", request);
      __resetRegistryCache();
      const selects: string[] = [];
      mocks.getServiceClient.mockImplementation(() => ({
        from: (table: string) => ({
          insert: () => Promise.resolve({ error: null }),
          update: () => ({ eq: () => Promise.resolve({ error: null }) }),
          select: () => {
            selects.push(table);
            return Promise.resolve({ data: [], error: null });
          },
        }),
      }));
      expect(
        await escalateInference("parse_cv", request, undefined, first)
      ).toBeNull();
      expect(selects).not.toContain("provider_models");
    });
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
