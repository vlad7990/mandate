import { describe, expect, it, vi } from "vitest";
import type { Destination } from "./destination";
import {
  DEFAULT_RETRY_POLICY,
  createRetryStats,
  delayFor,
  isRetryable,
  withRetries,
} from "./retry";

/**
 * The retry layer exists for one failure the rest of the system handles
 * badly: a transient blip against object storage. Without it, a 503 on
 * a single CV means that CV waits a full day for the next cron.
 *
 * What these tests are careful about is the OTHER direction. A retry
 * policy that retries a 403 turns a clear misconfiguration into a slow
 * one, and a policy with no ceiling can spend the whole run budget
 * waiting. Both are asserted below.
 */

function stubDestination(overrides: Partial<Destination> = {}): Destination {
  return {
    kind: "local",
    label: "stub",
    put: async () => {},
    get: async () => null,
    head: async () => null,
    list: async () => [],
    delete: async () => {},
    verifyAccess: async () => ({ ok: true, detail: "stub" }),
    ...overrides,
  } as Destination;
}

const noSleep = async () => {};

describe("isRetryable", () => {
  it("retries the transient status codes", () => {
    for (const status of [408, 425, 429, 500, 502, 503, 504]) {
      expect(isRetryable(new Error(`destination PUT failed with ${status}`))).toBe(true);
    }
  });

  it("does NOT retry failures that will never clear", () => {
    // The whole point. A 403 is a wrong key; trying twice more just
    // makes the log three times as long and the run slower.
    for (const status of [400, 401, 403, 404, 405, 409, 422]) {
      expect(isRetryable(new Error(`destination PUT failed with ${status}`))).toBe(false);
    }
  });

  it("retries network-level failures that carry no status", () => {
    for (const msg of [
      "fetch failed",
      "socket hang up",
      "ECONNRESET",
      "connect ETIMEDOUT 10.0.0.1:443",
      "The operation was aborted",
    ]) {
      expect(isRetryable(new Error(msg))).toBe(true);
    }
  });

  it("does not retry an error it cannot classify", () => {
    // Defaulting to "retry" would mean a programming error (a TypeError
    // in our own code) is retried three times before surfacing.
    expect(isRetryable(new Error("Cannot read properties of undefined"))).toBe(false);
  });
});

describe("delayFor", () => {
  it("doubles, and then stops doubling", () => {
    const p = { attempts: 10, baseDelayMs: 200, maxDelayMs: 2_000 };
    expect(delayFor(1, p)).toBe(200);
    expect(delayFor(2, p)).toBe(400);
    expect(delayFor(3, p)).toBe(800);
    expect(delayFor(4, p)).toBe(1_600);
    expect(delayFor(5, p)).toBe(2_000); // ceiling
    expect(delayFor(9, p)).toBe(2_000); // still the ceiling
  });

  it("keeps the worst case affordable against the 45s run budget", () => {
    const p = DEFAULT_RETRY_POLICY;
    const worst = Array.from({ length: p.attempts - 1 }, (_, i) => delayFor(i + 1, p))
      .reduce((a, b) => a + b, 0);
    // Three attempts => 200 + 400 = 600ms of waiting per object.
    expect(worst).toBe(600);
    expect(worst).toBeLessThan(1_000);
  });
});

describe("withRetries", () => {
  it("succeeds on a later attempt and reports that it had to", async () => {
    let calls = 0;
    const stats = createRetryStats();
    const d = withRetries(
      stubDestination({
        put: async () => {
          calls++;
          if (calls < 3) throw new Error("destination PUT failed with 503");
        },
      }),
      { stats, sleep: noSleep }
    );

    await d.put("a/b.bin", new Uint8Array([1]));

    expect(calls).toBe(3);
    // Recovered, but the flakiness is still visible rather than hidden.
    expect(stats.recovered).toBe(1);
    expect(stats.extraAttempts).toBe(2);
  });

  it("gives up after the bound and rethrows the LAST error", async () => {
    let calls = 0;
    const d = withRetries(
      stubDestination({
        put: async () => {
          calls++;
          // Same retryable status each time; the attempt number rides
          // along so the assertion can prove it is the LAST error that
          // propagates, not the first one captured.
          throw new Error(`destination PUT failed with 503 (attempt ${calls})`);
        },
      }),
      { sleep: noSleep }
    );

    await expect(d.put("a", new Uint8Array())).rejects.toThrow("attempt 3");
    expect(calls).toBe(DEFAULT_RETRY_POLICY.attempts);
  });

  it("stops immediately on a status that is not in the retryable set", async () => {
    // 501 is the case that caught a bug in this file's own first draft:
    // "5xx" is not the rule, the explicit set is. Not Implemented does
    // not clear by waiting.
    let calls = 0;
    const d = withRetries(
      stubDestination({
        put: async () => {
          calls++;
          throw new Error("destination PUT failed with 501");
        },
      }),
      { sleep: noSleep }
    );
    await expect(d.put("a", new Uint8Array())).rejects.toThrow("501");
    expect(calls).toBe(1);
  });

  it("fails a 403 immediately, without retrying", async () => {
    let calls = 0;
    const stats = createRetryStats();
    const d = withRetries(
      stubDestination({
        put: async () => {
          calls++;
          throw new Error("destination PUT failed with 403");
        },
      }),
      { stats, sleep: noSleep }
    );

    await expect(d.put("a", new Uint8Array())).rejects.toThrow("403");
    expect(calls).toBe(1);
    expect(stats.extraAttempts).toBe(0);
  });

  it("treats a null from get/head as a value, not a failure", async () => {
    let calls = 0;
    const d = withRetries(
      stubDestination({
        get: async () => {
          calls++;
          return null;
        },
      }),
      { sleep: noSleep }
    );

    expect(await d.get("missing")).toBeNull();
    expect(calls).toBe(1);
  });

  it("waits with real backoff between attempts", async () => {
    const waits: number[] = [];
    let calls = 0;
    const d = withRetries(
      stubDestination({
        list: async () => {
          calls++;
          if (calls < 3) throw new Error("destination LIST failed with 500");
          return [];
        },
      }),
      {
        sleep: async (ms) => {
          waits.push(ms);
        },
      }
    );

    await d.list("prefix/");
    expect(waits).toEqual([200, 400]);
  });

  it("does not retry verifyAccess", async () => {
    // Pre-flight's job is to answer "is this destination usable". Three
    // attempts just delays a no.
    let calls = 0;
    const d = withRetries(
      stubDestination({
        verifyAccess: async () => {
          calls++;
          return { ok: false, detail: "nope" };
        },
      }),
      { sleep: noSleep }
    );

    expect(await d.verifyAccess()).toEqual({ ok: false, detail: "nope" });
    expect(calls).toBe(1);
  });

  it("passes through kind and label unchanged", async () => {
    const d = withRetries(stubDestination({ kind: "s3", label: "s3:host/bucket" }));
    expect(d.kind).toBe("s3");
    expect(d.label).toBe("s3:host/bucket");
  });

  it("retries every network method, not just put", async () => {
    const methods: Array<keyof Destination> = ["put", "get", "head", "list", "delete"];
    for (const m of methods) {
      let calls = 0;
      const d = withRetries(
        stubDestination({
          [m]: async () => {
            calls++;
            if (calls < 2) throw new Error("destination failed with 503");
            return m === "list" ? [] : m === "get" || m === "head" ? null : undefined;
          },
        } as Partial<Destination>),
        { sleep: noSleep }
      );
      await (d[m] as (...a: unknown[]) => Promise<unknown>)("x", new Uint8Array());
      expect(calls, `${m} should have retried`).toBe(2);
    }
  });

  it("uses a real timer when no sleep is injected", async () => {
    vi.useFakeTimers();
    try {
      let calls = 0;
      const d = withRetries(
        stubDestination({
          put: async () => {
            calls++;
            if (calls < 2) throw new Error("destination PUT failed with 503");
          },
        }),
        { policy: { attempts: 2, baseDelayMs: 50, maxDelayMs: 50 } }
      );
      const p = d.put("a", new Uint8Array());
      await vi.advanceTimersByTimeAsync(50);
      await p;
      expect(calls).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
