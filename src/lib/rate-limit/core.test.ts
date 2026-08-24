import { describe, expect, it } from "vitest";
import { hashRateKey, normalizeEmailKey, retryPhrase } from "./core";

/**
 * The D6 harness: a raw address, email, or token must never reach a
 * bucket key, and one caller must always land in one bucket.
 */

describe("hashRateKey — the D6 boundary", () => {
  it("never returns anything containing its input", () => {
    for (const raw of ["203.0.113.7", "vbreygin@gmail.com", "a4b3f2ce-8e6b-4f0e-9d3a-7c5b2e9f1a06"]) {
      const hashed = hashRateKey(raw, "s1");
      expect(hashed).not.toContain(raw);
      expect(hashed).toMatch(/^[0-9a-f]{32}$/);
    }
  });

  it("is deterministic per salt — one caller, one bucket", () => {
    expect(hashRateKey("203.0.113.7", "s1")).toBe(hashRateKey("203.0.113.7", "s1"));
  });

  it("changes with the salt — rotating the salt resets every window", () => {
    expect(hashRateKey("203.0.113.7", "s1")).not.toBe(hashRateKey("203.0.113.7", "s2"));
  });
});

describe("normalizeEmailKey", () => {
  it("folds case and whitespace so one address cannot mint fresh buckets", () => {
    expect(normalizeEmailKey("  A.Person@Example.COM ")).toBe("a.person@example.com");
  });
});

describe("retryPhrase", () => {
  it("speaks coarsely and honestly", () => {
    expect(retryPhrase(45)).toBe("a minute or two");
    expect(retryPhrase(600)).toBe("10 minutes");
    expect(retryPhrase(3600)).toBe("60 minutes");
    expect(retryPhrase(50000)).toBe("an hour or so");
  });
});
