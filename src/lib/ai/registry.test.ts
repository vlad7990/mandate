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

import { __resetRegistryCache, assignedModelForCapability } from "./registry";

function clientReturning(
  rows: { capability: string; model_id: string }[] | null,
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
