import { describe, expect, it } from "vitest";
import { safeFailureMessage } from "./agent-errors";
import {
  INTAKE_AGENT_UNAVAILABLE_SENTENCE,
  INTAKE_FAILED_SENTENCE,
  INTAKE_SUBJECT,
  INTAKE_TIMED_OUT_SENTENCE,
} from "./intake-failure";

/**
 * The 090 sentence boundary, pinned in both directions — the same
 * doctrine as the Sentry scrub's counter-case (§59): a filter that
 * would eat the authored reader sentences is as much a defect as one
 * that lets a provider body through.
 */

const SENTENCES = [
  INTAKE_FAILED_SENTENCE,
  INTAKE_AGENT_UNAVAILABLE_SENTENCE,
  INTAKE_TIMED_OUT_SENTENCE,
];

describe("the intake_error sentence boundary", () => {
  it("passes every authored sentence through untouched", () => {
    // These are rendered verbatim with the retry CTA. If
    // safeFailureMessage ever starts redacting them, the recruiter
    // gets the generic could-not-run line instead of the sentence that
    // says what actually happened — a silent regression this pins.
    for (const sentence of SENTENCES) {
      expect(safeFailureMessage(sentence, INTAKE_SUBJECT)).toBe(sentence);
    }
  });

  it("replaces a provider payload that reaches the column's boundary", () => {
    // The §57 shape: a structured-output 400 quoting the serialised
    // input. Nothing routes a raw catch to intake_error today — the
    // writers only pass the constants above — but the boundary exists
    // so the next writer someone adds cannot leak by forgetting to
    // choose.
    const providerBody =
      '400 {"type":"error","error":{"type":"invalid_request_error",' +
      '"message":"additionalProperties: true is not supported"},' +
      '"request_id":"req_0abc123"}';

    const stored = safeFailureMessage(providerBody, INTAKE_SUBJECT);
    expect(stored).not.toContain("request_id");
    expect(stored).not.toContain("invalid_request_error");
    expect(stored).toContain(INTAKE_SUBJECT);
  });

  it("keeps the sentences honest about what the reader can do", () => {
    // Every terminal state the block can show carries the one action
    // the surface offers. A sentence that stops mentioning the retry
    // is a sentence for a different surface.
    for (const sentence of SENTENCES) {
      expect(sentence.toLowerCase()).toContain("retry");
    }
  });
});
