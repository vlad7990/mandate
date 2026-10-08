// The spend ceiling's unit proofs (C11, migration 164).
//
// The behaviour worth pinning is not "does it add up" — Postgres does the
// arithmetic — but the FAIL DIRECTIONS, because they deliberately differ
// from every other check in the seam: this is the one guard allowed to
// refuse a primary model call, and it may only do so on a measured fact.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  getServiceClient: vi.fn(),
  capture: vi.fn(),
  pricing: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase-service-role", () => ({
  getServiceRoleSupabaseClient: mocks.getServiceClient,
}));
vi.mock("@/lib/observability/sentry", () => ({
  captureSeamError: mocks.capture,
}));
vi.mock("./registry", () => ({ modelPricing: mocks.pricing }));

import {
  BudgetExceededError,
  __resetBudgetCache,
  assertWithinBudget,
} from "./budget";

/** The live shape: PostgREST returns numeric as a string, which is the
 * detail that would make every comparison below silently wrong if the
 * module forgot to coerce. */
function verdict(over: {
  spend?: string;
  enabled?: boolean;
  over_soft?: boolean;
  over_hard?: boolean;
}) {
  return {
    enabled: over.enabled ?? true,
    window_days: 30,
    spend_usd: over.spend ?? "3.83",
    soft_usd: "50",
    hard_usd: "250",
    over_soft: over.over_soft ?? false,
    over_hard: over.over_hard ?? false,
    unpriced_runs: 0,
  };
}

function clientReturning(data: unknown, error: unknown = null) {
  return {
    rpc: (fn: string) => {
      mocks.rpc(fn);
      return { maybeSingle: () => Promise.resolve({ data, error }) };
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  __resetBudgetCache();
  mocks.pricing.mockResolvedValue("priced");
  mocks.getServiceClient.mockReturnValue(clientReturning(verdict({})));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("assertWithinBudget", () => {
  it("allows a call under the cap", async () => {
    await expect(
      assertWithinBudget("claude-sonnet-4-6")
    ).resolves.toBeUndefined();
  });

  it("REFUSES once over the hard cap — the one measured refusal on the primary path", async () => {
    mocks.getServiceClient.mockReturnValue(
      clientReturning(verdict({ spend: "251.40", over_hard: true, over_soft: true }))
    );
    await expect(assertWithinBudget("claude-sonnet-4-6")).rejects.toThrow(
      BudgetExceededError
    );
    // The message carries the figures for the server log; what a
    // recruiter sees is agentErrorMessage's generic sentence, because a
    // BudgetExceededError has no HTTP status.
    await expect(assertWithinBudget("claude-sonnet-4-6")).rejects.toThrow(
      /251\.40[\s\S]*250\.00/
    );
  });

  it("ALLOWS when the verdict cannot be read — a budget outage must not take the product down", async () => {
    mocks.getServiceClient.mockReturnValue(
      clientReturning(null, { message: "budget unreadable" })
    );
    await expect(
      assertWithinBudget("claude-sonnet-4-6")
    ).resolves.toBeUndefined();
    expect(mocks.capture).toHaveBeenCalledWith(
      expect.stringContaining("UNCAPPED"),
      expect.anything()
    );
  });

  it("allows when the budget row is disabled, and does not even ask about pricing", async () => {
    mocks.getServiceClient.mockReturnValue(
      clientReturning(verdict({ enabled: false, over_hard: true }))
    );
    await expect(
      assertWithinBudget("claude-sonnet-4-6")
    ).resolves.toBeUndefined();
    expect(mocks.pricing).not.toHaveBeenCalled();
  });

  it("refuses an UNPRICED model while a budget is enabled — we cannot bound what we cannot price", async () => {
    // sum() skips the NULL that ai_run_cost_usd returns for an unpriced
    // model, so spend against it is invisible to the ceiling. A budget
    // with such a model in play is not a budget.
    mocks.pricing.mockResolvedValue("unpriced");
    await expect(assertWithinBudget("claude-opus-5")).rejects.toThrow(
      /no price in provider_models/
    );
  });

  it("allows when PRICING is unknown — an unreadable registry is not an unpriced model", async () => {
    mocks.pricing.mockResolvedValue("unknown");
    await expect(
      assertWithinBudget("claude-sonnet-4-6")
    ).resolves.toBeUndefined();
  });

  it("warns ONCE past the soft threshold and never blocks there", async () => {
    mocks.getServiceClient.mockReturnValue(
      clientReturning(verdict({ spend: "61.00", over_soft: true }))
    );
    await assertWithinBudget("claude-sonnet-4-6");
    await assertWithinBudget("claude-sonnet-4-6");
    await assertWithinBudget("claude-sonnet-4-6");
    const softCalls = mocks.capture.mock.calls.filter((c: unknown[]) =>
      String(c[0]).includes("soft threshold")
    );
    expect(softCalls).toHaveLength(1);
  });

  it("reads once per TTL window, then re-reads — a raised cap is live within a minute", async () => {
    const t0 = Date.now();
    const now = vi.spyOn(Date, "now").mockReturnValue(t0);
    await assertWithinBudget("claude-sonnet-4-6");
    await assertWithinBudget("claude-sonnet-4-6");
    expect(mocks.rpc).toHaveBeenCalledTimes(1);

    // This is the whole reason a guard on the hottest path in the product
    // is affordable: one read per minute, not one write per call.
    now.mockReturnValue(t0 + 61_000);
    await assertWithinBudget("claude-sonnet-4-6");
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
  });

  it("stale beats blind: a failed refresh keeps enforcing the last good verdict", async () => {
    const t0 = Date.now();
    const now = vi.spyOn(Date, "now").mockReturnValue(t0);
    mocks.getServiceClient.mockReturnValue(
      clientReturning(verdict({ spend: "900.00", over_hard: true }))
    );
    await expect(assertWithinBudget("claude-sonnet-4-6")).rejects.toThrow(
      BudgetExceededError
    );

    // A blip must not UNCAP a budget that was known to be blown.
    now.mockReturnValue(t0 + 61_000);
    mocks.getServiceClient.mockImplementation(() => {
      throw new Error("budget down");
    });
    await expect(assertWithinBudget("claude-sonnet-4-6")).rejects.toThrow(
      BudgetExceededError
    );
  });
});
