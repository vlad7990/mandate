import { describe, expect, it } from "vitest";
import { clientIpFrom } from "./server";

/**
 * §212 / vuln finding 3 — the per-IP limiter must key off a PLATFORM-controlled
 * header, never a caller-nameable one.
 *
 * Verified against Vercel's docs: Vercel overwrites `x-forwarded-for` and does
 * not forward external IPs, so the leftmost value is the real client and is not
 * spoofable on this deployment (the one exception, Enterprise trusted-proxy, is
 * not in use). These guards pin that reasoning into behaviour so a later change
 * cannot quietly widen the trusted source or take the wrong end of the list.
 */

const h = (init: Record<string, string>) => new Headers(init);

describe("clientIpFrom — the trusted-source boundary", () => {
  it("takes the LEFTMOST x-forwarded-for (the client Vercel saw)", () => {
    // Vercel sets the leftmost to the real client; any later hops are infra.
    expect(clientIpFrom(h({ "x-forwarded-for": "203.0.113.7, 10.0.0.1, 10.0.0.2" })))
      .toBe("203.0.113.7");
  });

  it("prefers x-forwarded-for over x-real-ip when both are present", () => {
    expect(
      clientIpFrom(h({ "x-forwarded-for": "203.0.113.7", "x-real-ip": "198.51.100.9" }))
    ).toBe("203.0.113.7");
  });

  it("falls back to x-real-ip only when XFF is absent", () => {
    expect(clientIpFrom(h({ "x-real-ip": "198.51.100.9" }))).toBe("198.51.100.9");
  });

  it("skips empty leading segments rather than returning a blank key", () => {
    // A blank key is one shared bucket for everyone — correctness, not security,
    // but a silent collapse of the limiter all the same.
    expect(clientIpFrom(h({ "x-forwarded-for": " , 203.0.113.7" }))).toBe("203.0.113.7");
    expect(clientIpFrom(h({ "x-forwarded-for": "   " }))).toBe("anon");
  });

  it("falls back to a SHARED 'anon' bucket when no platform header is set", () => {
    // More restrictive, never a bypass: unknown callers share one bucket.
    expect(clientIpFrom(h({}))).toBe("anon");
  });

  it("reads ONLY platform headers — a caller-nameable header is ignored", () => {
    // The whole finding: the key must not come from anything a client can set
    // at will. A made-up header, or the client's own 'forwarded'/'true-client-ip',
    // must not become the bucket.
    expect(clientIpFrom(h({ "x-attacker-ip": "1.2.3.4" }))).toBe("anon");
    expect(clientIpFrom(h({ forwarded: "for=1.2.3.4" }))).toBe("anon");
    expect(clientIpFrom(h({ "true-client-ip": "1.2.3.4" }))).toBe("anon");
  });
});
