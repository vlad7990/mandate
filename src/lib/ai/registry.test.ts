// The registry read path's unit proofs (LLM router slice 4, gate
// 1885da9): one query per TTL window, stale beats blind, a dead
// database warns once and costs one attempt per window — model calls
// are never blocked by registry availability.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getServiceClient: vi.fn(),
  select: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase-service-role", () => ({
  getServiceRoleSupabaseClient: mocks.getServiceClient,
}));

import {
  __resetRegistryCache,
  assignedModelForCapability,
  modelActivation,
} from "./registry";

function clientReturning(
  rows: Record<string, unknown>[] | null,
  error: { message: string } | null = null
) {
  return {
    from: () => ({
      select: () => {
        mocks.select();
        return Promise.resolve({ data: rows, error });
      },
    }),
  };
}

let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  __resetRegistryCache();
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  errorSpy.mockRestore();
  vi.restoreAllMocks();
});

describe("assignedModelForCapability", () => {
  it("returns the assigned model, and null where no row exists", async () => {
    mocks.getServiceClient.mockReturnValue(
      clientReturning([{ capability: "parse_cv", model_id: "claude-sonnet-5" }])
    );
    expect(await assignedModelForCapability("parse_cv")).toBe(
      "claude-sonnet-5"
    );
    expect(await assignedModelForCapability("copilot")).toBeNull();
  });

  it("reads once per TTL window — the second lookup hits the cache", async () => {
    mocks.getServiceClient.mockReturnValue(clientReturning([]));
    await assignedModelForCapability("parse_cv");
    await assignedModelForCapability("copilot");
    expect(mocks.select).toHaveBeenCalledTimes(1);
  });

  it("re-reads after the TTL expires — a founder's change is live within a minute", async () => {
    const t0 = Date.now();
    const now = vi.spyOn(Date, "now");
    now.mockReturnValue(t0);
    mocks.getServiceClient.mockReturnValue(clientReturning([]));
    expect(await assignedModelForCapability("parse_cv")).toBeNull();

    mocks.getServiceClient.mockReturnValue(
      clientReturning([{ capability: "parse_cv", model_id: "claude-sonnet-5" }])
    );
    now.mockReturnValue(t0 + 61_000);
    expect(await assignedModelForCapability("parse_cv")).toBe(
      "claude-sonnet-5"
    );
    expect(mocks.select).toHaveBeenCalledTimes(2);
  });

  it("a failed read returns null, warns ONCE, and stamps the window — one attempt per TTL, not one per call", async () => {
    mocks.getServiceClient.mockReturnValue(
      clientReturning(null, { message: "registry down" })
    );
    expect(await assignedModelForCapability("parse_cv")).toBeNull();
    expect(await assignedModelForCapability("parse_cv")).toBeNull();
    expect(mocks.select).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it("stale beats blind: a failed refresh keeps the last good read", async () => {
    const t0 = Date.now();
    const now = vi.spyOn(Date, "now");
    now.mockReturnValue(t0);
    mocks.getServiceClient.mockReturnValue(
      clientReturning([{ capability: "parse_cv", model_id: "claude-sonnet-5" }])
    );
    expect(await assignedModelForCapability("parse_cv")).toBe(
      "claude-sonnet-5"
    );

    now.mockReturnValue(t0 + 61_000);
    mocks.getServiceClient.mockImplementation(() => {
      throw new Error("registry down");
    });
    expect(await assignedModelForCapability("parse_cv")).toBe(
      "claude-sonnet-5"
    );
  });
});

describe("modelActivation (C9)", () => {
  const PRODUCTION = [
    { model_id: "claude-sonnet-5", status: "active" },
    { model_id: "claude-opus-5", status: "benchmarking" },
  ];

  it("distinguishes active, not-active and unknown — the three the caller needs", async () => {
    mocks.getServiceClient.mockReturnValue(clientReturning(PRODUCTION));
    expect(await modelActivation("claude-sonnet-5")).toBe("active");
    // Registered is not usable: the status CHECK forbids `active`
    // without a benchmark_ref, and opus-5 has no eval behind it.
    expect(await modelActivation("claude-opus-5")).toBe("not_active");
    // Absence is not permission either.
    expect(await modelActivation("claude-nonexistent")).toBe("not_active");
  });

  it("reads once per TTL window, and re-reads after it expires", async () => {
    const t0 = Date.now();
    const now = vi.spyOn(Date, "now");
    now.mockReturnValue(t0);
    mocks.getServiceClient.mockReturnValue(clientReturning(PRODUCTION));
    await modelActivation("claude-opus-5");
    await modelActivation("claude-sonnet-5");
    expect(mocks.select).toHaveBeenCalledTimes(1);

    // An activation through the models screen is live within a minute,
    // with no deploy — the same contract as an assignment change.
    now.mockReturnValue(t0 + 61_000);
    mocks.getServiceClient.mockReturnValue(
      clientReturning([{ model_id: "claude-opus-5", status: "active" }])
    );
    expect(await modelActivation("claude-opus-5")).toBe("active");
    expect(mocks.select).toHaveBeenCalledTimes(2);
  });

  it("an unreadable table is `unknown`, NOT `not_active` — warns once and costs one attempt per TTL", async () => {
    mocks.getServiceClient.mockReturnValue(
      clientReturning(null, { message: "registry down" })
    );
    expect(await modelActivation("claude-sonnet-5")).toBe("unknown");
    expect(await modelActivation("claude-sonnet-5")).toBe("unknown");
    expect(mocks.select).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it("stale beats blind here too: a failed refresh keeps the last good snapshot", async () => {
    // And the snapshot stays AUTHORITATIVE, not `unknown` — a database
    // blip must not disarm an escalation whose target the registry
    // showed active a minute ago.
    const t0 = Date.now();
    const now = vi.spyOn(Date, "now");
    now.mockReturnValue(t0);
    mocks.getServiceClient.mockReturnValue(
      clientReturning([{ model_id: "claude-opus-5", status: "active" }])
    );
    expect(await modelActivation("claude-opus-5")).toBe("active");

    now.mockReturnValue(t0 + 61_000);
    mocks.getServiceClient.mockImplementation(() => {
      throw new Error("registry down");
    });
    expect(await modelActivation("claude-opus-5")).toBe("active");
  });
});
