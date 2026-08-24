import { describe, expect, it } from "vitest";
import type { Breadcrumb, ErrorEvent } from "@sentry/nextjs";
import {
  BREADCRUMB_MESSAGE_CAP,
  PROVIDER_MESSAGE_CAP,
  scrubBreadcrumb,
  scrubEvent,
} from "./scrub";

/**
 * The D4 harness — the PII boundary's invariants, in the idiom the
 * migrations use: every rule that keeps candidate data out of a
 * third party's hands gets a test that fails loudly when the rule is
 * "simplified" away.
 *
 * The fixtures deliberately carry the shapes this product actually
 * leaks if unguarded: a provider error quoting a serialised model
 * input (candidate names, CV text, hiring-manager feedback), a
 * request with a session cookie and a bearer token, and a user
 * object with a real email.
 */

const CANDIDATE_NAME = "Perl Ashwood";
const HM_FEEDBACK = "the hiring manager thinks she is too regulatory";

function eventWithException(value: string): ErrorEvent {
  return { type: undefined, exception: { values: [{ type: "Error", value }] } } as ErrorEvent;
}

describe("scrubEvent — the D4 boundary", () => {
  it("caps a provider message that quotes the serialised model input", () => {
    // The real shape: an Anthropic 400 echoing the prompt back, and
    // the prompt is the candidate pool.
    const leak =
      `400 {"type":"error","error":{"message":"invalid schema for input ` +
      JSON.stringify({
        candidates: Array.from({ length: 40 }, (_, i) => ({
          name: `${CANDIDATE_NAME} ${i}`,
          cv: "Twenty years leading platform engineering at…",
          feedback: HM_FEEDBACK,
        })),
      }) +
      `"}}`;
    expect(leak.length).toBeGreaterThan(PROVIDER_MESSAGE_CAP);

    const scrubbed = scrubEvent(eventWithException(leak));
    const value = scrubbed.exception?.values?.[0]?.value ?? "";

    // NOT ONE candidate — the cap alone would have leaked the first
    // few, which is what drove the container rule.
    expect(value).not.toContain(CANDIDATE_NAME);
    expect(value).not.toContain(HM_FEEDBACK);
    expect(value).toContain("[structured input redacted]");
    // The diagnostic head survives: the fault must stay identifiable.
    expect(value).toContain("invalid schema");
  });

  it("keeps a provider's mechanical error body intact — the §57 defect stays diagnosable", () => {
    // The real 400 that had been failing silently for weeks. It
    // carries no human material, and redacting it would have hidden
    // the one fault this slice was built in response to.
    const real =
      `400 {"type":"error","error":{"type":"invalid_request_error","message":` +
      `"output_config.format.schema: For 'object' type, 'additionalProperties: true' ` +
      `is not supported. Please set 'additionalProperties' to false"},"request_id":"req_011CeFr2"}`;

    const value =
      scrubEvent(eventWithException(real)).exception?.values?.[0]?.value ?? "";

    expect(value).toContain("additionalProperties");
    expect(value).toContain("invalid_request_error");
    expect(value).not.toContain("redacted");
  });

  it("redacts a named human value wherever it appears", () => {
    const value =
      scrubEvent(
        eventWithException(`failed for {"full_name":"${CANDIDATE_NAME}","current_company":"Nortel Peak"}`)
      ).exception?.values?.[0]?.value ?? "";

    expect(value).not.toContain(CANDIDATE_NAME);
    expect(value).not.toContain("Nortel Peak");
    expect(value).toContain('"full_name":"[redacted]"');
  });

  it("leaves a short authored message intact", () => {
    const authored = "Project health is healthy — suggestions are only generated when stalled or at-risk.";
    const scrubbed = scrubEvent(eventWithException(authored));
    expect(scrubbed.exception?.values?.[0]?.value).toBe(authored);
  });

  it("caps a long top-level message too", () => {
    const long = "x".repeat(PROVIDER_MESSAGE_CAP + 250);
    const scrubbed = scrubEvent({ type: undefined, message: long } as ErrorEvent);
    expect(scrubbed.message?.length).toBeLessThanOrEqual(PROVIDER_MESSAGE_CAP + 40);
    expect(scrubbed.message).toContain("capped at");
  });

  it("strips the request body, cookies, and headers", () => {
    const scrubbed = scrubEvent({
      type: undefined,
      request: {
        url: "https://getmandate.io/app/projects/abc",
        method: "POST",
        data: { full_name: CANDIDATE_NAME, cv_text: "…" },
        cookies: { "sb-access-token": "eyJhbGciOi…" },
        headers: { authorization: "Bearer eyJhbGciOi…", cookie: "sb-access-token=…" },
      },
    } as ErrorEvent);

    expect(scrubbed.request?.data).toBeUndefined();
    expect(scrubbed.request?.cookies).toBeUndefined();
    expect(scrubbed.request?.headers).toBeUndefined();
    // The URL survives: it is where the fault happened, and it carries
    // ids, never names.
    expect(scrubbed.request?.url).toBe("https://getmandate.io/app/projects/abc");
  });

  it("drops the user object even when something upstream set one", () => {
    const scrubbed = scrubEvent({
      type: undefined,
      user: { id: "663dd605", email: "vbreygin@gmail.com", username: "Vladimir" },
    } as ErrorEvent);
    expect(scrubbed.user).toBeUndefined();
  });

  it("survives an event with nothing to scrub", () => {
    expect(() => scrubEvent({ type: undefined } as ErrorEvent)).not.toThrow();
  });
});

describe("scrubBreadcrumb — the D4 boundary", () => {
  it("drops fetch and xhr breadcrumbs, which carry bodies", () => {
    for (const category of ["fetch", "xhr", "http"]) {
      const crumb = {
        category,
        data: { url: "/api/x", body: { full_name: CANDIDATE_NAME } },
      } as Breadcrumb;
      expect(scrubBreadcrumb(crumb)).toBeNull();
    }
  });

  it("keeps navigation and console, capped and data-free", () => {
    const nav = scrubBreadcrumb({ category: "navigation", message: "/app/home" } as Breadcrumb);
    expect(nav).not.toBeNull();
    expect(nav?.message).toBe("/app/home");

    const noisy = scrubBreadcrumb({
      category: "console",
      message: `[search-health] failed ${"y".repeat(BREADCRUMB_MESSAGE_CAP + 100)}`,
      data: { arguments: [{ candidate: CANDIDATE_NAME }] },
    } as Breadcrumb);
    expect(noisy?.message?.length).toBe(BREADCRUMB_MESSAGE_CAP);
    expect(noisy?.data).toBeUndefined();
  });

  it("drops a breadcrumb with no category rather than guessing", () => {
    expect(scrubBreadcrumb({ message: "orphan" } as Breadcrumb)).toBeNull();
  });
});
