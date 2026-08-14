import { describe, expect, it } from "vitest";
import { agentErrorMessage } from "./agent-errors";

/**
 * The exact body `/app/candidates/search` rendered to the browser the first
 * time it was opened from the nav rail. Kept verbatim as the fixture,
 * because the whole point of the module is that none of it reaches a person.
 */
const CREDIT_BALANCE_ERROR = Object.assign(
  new Error(
    '400 {"type":"error","error":{"type":"invalid_request_error","message":' +
      '"Your credit balance is too low to access the Anthropic API. Please go ' +
      'to Plans & Billing to upgrade or purchase credits."},' +
      '"request_id":"req_011Ce2hDa8hkx77waJRNTEPG"}'
  ),
  { status: 400 }
);

describe("agentErrorMessage", () => {
  it("never leaks the provider payload, the vendor, or the request id", () => {
    const message = agentErrorMessage(CREDIT_BALANCE_ERROR, "The search agent");

    for (const leak of [
      "Anthropic",
      "credit balance",
      "Plans & Billing",
      "req_011Ce2hDa8hkx77waJRNTEPG",
      "invalid_request_error",
      "400",
    ]) {
      expect(message, `leaked ${leak}`).not.toContain(leak);
    }
  });

  it("tells the reader to wait when waiting is the right response", () => {
    for (const status of [429, 500, 502, 503]) {
      const err = Object.assign(new Error("boom"), { status });
      expect(agentErrorMessage(err, "The search agent")).toBe(
        "The search agent is busy right now. Try again in a moment."
      );
    }
  });

  it("does not tell the reader to wait when waiting will not help", () => {
    // 400 is the exhausted-balance case, 401 a missing key. Both need a
    // human on our side; "try again" would be a lie.
    for (const status of [400, 401, 403, 404]) {
      const err = Object.assign(new Error("boom"), { status });
      expect(agentErrorMessage(err, "The search agent")).toBe(
        "The search agent is unavailable. This has been logged — nothing you typed was lost."
      );
    }
  });

  it("handles errors that are not the SDK's shape at all", () => {
    for (const thrown of [
      new Error("ANTHROPIC_API_KEY is not set"),
      "a bare string",
      null,
      undefined,
      { status: "not-a-number" },
      {},
    ]) {
      const message = agentErrorMessage(thrown, "The search agent");
      expect(message).toContain("The search agent");
      // A thrown string must not end up inside the sentence.
      expect(message).not.toContain("bare string");
      expect(message).not.toContain("ANTHROPIC_API_KEY");
    }
  });

  it("uses the subject as a sentence subject", () => {
    expect(agentErrorMessage(new Error("x"), "The role analysis")).toMatch(
      /^The role analysis is /
    );
  });
});
