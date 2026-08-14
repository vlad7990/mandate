import { describe, expect, it } from "vitest";
import { agentErrorMessage, safeFailureMessage } from "./agent-errors";

const UNAVAILABLE =
  "The search agent could not run. This has been logged — try again, and tell an admin if it keeps happening.";

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
      expect(agentErrorMessage(err, "The search agent")).toBe(UNAVAILABLE);
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
      /^The role analysis /
    );
  });
});

describe("safeFailureMessage", () => {
  // The four generators write this column and it is rendered verbatim with a
  // Retry CTA, so what lands in it outlives the request.
  it("replaces a provider payload that reached the write boundary", () => {
    expect(
      safeFailureMessage(CREDIT_BALANCE_ERROR.message, "The search agent")
    ).toBe(UNAVAILABLE);
  });

  it.each([
    ['{"request_id":"req_abc"}'],
    ['{"type":"error","error":{}}'],
    ['429 {"type":"error"}'],
    ['  500 {"error":"upstream"}'],
  ])("catches %s", (payload) => {
    expect(safeFailureMessage(payload, "The search agent")).toBe(UNAVAILABLE);
  });

  // The whole reason this is narrow rather than a general "looks internal"
  // heuristic. This sentence is the most useful thing the interview-plan
  // view can show, and a broader rule would eat it.
  it("leaves a message authored for the reader completely alone", () => {
    const authored =
      "No approved success profile for this search. Approve a success profile before generating an interview plan.";
    expect(safeFailureMessage(authored, "Interview-plan generation")).toBe(
      authored
    );
  });

  it.each([
    ["Generation timed out. Please retry."],
    ["Generation failed during persistence (unrecoverable)."],
    ["Interview-plan generation is busy right now. Try again in a moment."],
  ])("passes through %s", (message) => {
    expect(safeFailureMessage(message, "Interview-plan generation")).toBe(
      message
    );
  });
});
