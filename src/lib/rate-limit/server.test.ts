// The limiter's server half — the D3 split, and C10's service-role
// tier. `core.test.ts` holds the pure rules; this file holds the two
// things that are only true on the server: WHICH client each tier
// reaches the database with, and what each tier does when the check
// cannot answer at all.

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  sessionClient: vi.fn(),
  serviceClient: vi.fn(),
  capture: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase-server", () => ({
  createServerSupabaseClient: mocks.sessionClient,
}));
vi.mock("@/lib/supabase-service-role", () => ({
  getServiceRoleSupabaseClient: mocks.serviceClient,
}));
vi.mock("@/lib/observability/sentry", () => ({
  captureSeamError: mocks.capture,
}));

import { limitClosed, limitClosedServiceRole, limitOpen } from "./server";

/** A client whose rpc() records its arguments and answers `verdict`. */
function clientAnswering(verdict: {
  allowed: boolean;
  reason: string;
  retry_after_seconds: number;
}) {
  return {
    rpc: (fn: string, args: Record<string, unknown>) => {
      mocks.rpc(fn, args);
      return { maybeSingle: () => Promise.resolve({ data: verdict, error: null }) };
    },
  };
}

const ALLOWED = { allowed: true, reason: "ok", retry_after_seconds: 0 };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.sessionClient.mockResolvedValue(clientAnswering(ALLOWED));
  mocks.serviceClient.mockReturnValue(clientAnswering(ALLOWED));
});

describe("limitClosedServiceRole (C10)", () => {
  it("reaches the database as SERVICE ROLE, never as a session", async () => {
    // Not a preference. The one caller is the inference seam, which may
    // not hold a product client (Part N) — and 32 of the product's 76
    // lifetime model calls came from cron, where there is no session to
    // hold. A session client here would break the law AND fail in cron,
    // which is the combination that stays hidden longest.
    await limitClosedServiceRole("ai_escalation_generate_evaluation", "proj-abc");
    expect(mocks.serviceClient).toHaveBeenCalled();
    expect(mocks.sessionClient).not.toHaveBeenCalled();
  });

  it("sends the key RAW — a project id is already a primary key in that database", async () => {
    await limitClosedServiceRole("ai_escalation_generate_evaluation", "proj-abc");
    expect(mocks.rpc).toHaveBeenCalledWith("check_rate_limit", {
      p_scope: "ai_escalation_generate_evaluation",
      p_key: "proj-abc",
    });
  });

  it("refuses when the check cannot answer — Tier 1, money fails closed", async () => {
    mocks.serviceClient.mockReturnValue({
      rpc: () => ({
        maybeSingle: () =>
          Promise.resolve({ data: null, error: { message: "limiter down" } }),
      }),
    });
    const verdict = await limitClosedServiceRole("ai_escalation_parse_cv", "p1");
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toBe("unavailable");
    expect(mocks.capture).toHaveBeenCalled();
  });

  it("refuses rather than throwing when the service-role env is missing", async () => {
    // getServiceRoleSupabaseClient() throws on an absent env. That must
    // land in the same refusal as a dead limiter, not propagate into the
    // caller — the seam's escalation branch is already handling an error.
    mocks.serviceClient.mockImplementation(() => {
      throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
    });
    const verdict = await limitClosedServiceRole("ai_escalation_parse_cv", "p1");
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toBe("unavailable");
  });

  it("passes a genuine refusal through unchanged", async () => {
    // A REFUSAL is not a failure: the tier split only governs what
    // happens when the check cannot answer.
    mocks.serviceClient.mockReturnValue(
      clientAnswering({ allowed: false, reason: "global", retry_after_seconds: 7200 })
    );
    const verdict = await limitClosedServiceRole("ai_escalation_parse_cv", "p1");
    expect(verdict).toEqual({
      allowed: false,
      reason: "global",
      retryAfterSeconds: 7200,
    });
  });
});

describe("the existing tiers are unchanged by C10's refactor", () => {
  it("limitClosed still uses the SESSION client and still HASHES its key", async () => {
    await limitClosed("demo_ip", "203.0.113.7");
    expect(mocks.sessionClient).toHaveBeenCalled();
    expect(mocks.serviceClient).not.toHaveBeenCalled();
    const args = mocks.rpc.mock.calls[0][1] as { p_key: string };
    // An IP is personal data: the database must never see it.
    expect(args.p_key).not.toBe("203.0.113.7");
    expect(args.p_key).toMatch(/^[0-9a-f]{32}$/);
  });

  it("limitClosed refuses an unreachable limiter; limitOpen allows it, loudly", async () => {
    const dead = {
      rpc: () => ({
        maybeSingle: () =>
          Promise.resolve({ data: null, error: { message: "down" } }),
      }),
    };
    mocks.sessionClient.mockResolvedValue(dead);
    expect((await limitClosed("demo_ip", "ip")).allowed).toBe(false);
    expect((await limitOpen("sign_in_ip", "ip")).allowed).toBe(true);
    expect(mocks.capture).toHaveBeenCalledTimes(2);
  });
});
