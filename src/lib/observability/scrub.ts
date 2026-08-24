import type { Breadcrumb, ErrorEvent } from "@sentry/nextjs";

/**
 * The PII boundary (NEXT-sentry D4), in one testable place.
 *
 * Phase 1 wrote these rules inline in both init files. They are the
 * safety property that lets this product send telemetry to a third
 * party at all — so they belong where the rest of this codebase puts
 * its boundaries: behind a harness that fails loudly when someone
 * "simplifies" them. `scrub.test.ts` is that harness, and it is the
 * reason a UI eyeball is not the only proof D4 ever gets.
 *
 * ## Why a length cap is a PII control, not tidiness
 *
 * The agent seams serialise their model INPUT into the prompt, and a
 * provider error can quote that input back in its message. The input
 * is candidate CVs, hiring-manager feedback, and recruiter notes. So
 * an uncapped provider error message is a candidate-data leak wearing
 * a stack trace. `safeFailureMessage` already applies this paranoia to
 * what a reader sees; this applies it to what a vendor receives.
 */

/** Matches the reader-facing backstop's threshold. */
export const PROVIDER_MESSAGE_CAP = 500;

/**
 * Keys whose values are, in this product, always human material:
 * candidate identities and CVs, hiring-manager feedback, recruiter
 * notes, the one-line brief, recruiter-authored skill instructions.
 *
 * The list is drawn from the shapes our own seams serialise into
 * prompts (`SearchHealthInput`, `WeeklyReportInput`, the parser and
 * psychology inputs) — the exact payloads a provider can quote back
 * inside an error message.
 */
const PII_KEYS = [
  "full_name", "name", "email", "headline", "summary", "content",
  "cv", "cv_text", "cv_structured", "current_title", "current_company",
  "one_line_input", "instructions", "rationale", "action",
];

/**
 * Keys that introduce BULK human material — an array or object of the
 * above. Regex cannot balance brackets, and it does not need to: once
 * one of these appears, everything after it is payload, so the
 * message is cut there.
 */
const PII_CONTAINER_KEYS = [
  "candidates", "candidates_sourced", "top_candidates", "feedback",
  "recent_feedback", "feedback_summaries", "notes", "pipeline_moves",
  "rank_moves", "suggestions", "boolean_queries",
];

const PII_VALUE_RE = new RegExp(
  `"(${PII_KEYS.join("|")})"\\s*:\\s*"(?:[^"\\\\]|\\\\.)*"`,
  "gi"
);

const PII_CONTAINER_RE = new RegExp(
  `"(${PII_CONTAINER_KEYS.join("|")})"\\s*:\\s*[[{]`,
  "i"
);

/**
 * Redact human material from a provider payload while KEEPING the
 * diagnostic head of the message.
 *
 * Why not simply cut at the first `{`: the §57 defect — an API
 * refusing `additionalProperties: true` — was diagnosable only
 * because the provider's JSON error body survived intact. That body
 * carries no candidate data. Blanket-truncating structured content
 * would have hidden the one fault this slice was built in response
 * to. So the rule redacts what is human and preserves what is
 * mechanical.
 */
export function redactHumanMaterial(message: string): string {
  let out = message.replace(PII_VALUE_RE, (_m, key: string) => `"${key}":"[redacted]"`);

  const container = PII_CONTAINER_RE.exec(out);
  if (container) {
    out = `${out.slice(0, container.index)}… [structured input redacted]`;
  }
  return out;
}

function capAndRedact(value: string): string {
  const redacted = redactHumanMaterial(value);
  return redacted.length > PROVIDER_MESSAGE_CAP
    ? `${redacted.slice(0, PROVIDER_MESSAGE_CAP)}… [capped at ${PROVIDER_MESSAGE_CAP}]`
    : redacted;
}

/** Breadcrumb messages are context, never payload. */
export const BREADCRUMB_MESSAGE_CAP = 200;

/**
 * Breadcrumbs worth keeping. Navigation tells us where the fault
 * happened; console tells us what the seam logged. Everything else —
 * fetch and xhr especially — carries request and response bodies.
 */
const KEPT_BREADCRUMB_CATEGORIES = new Set(["navigation", "console"]);

export function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb | null {
  if (!breadcrumb.category || !KEPT_BREADCRUMB_CATEGORIES.has(breadcrumb.category)) {
    return null;
  }
  if (typeof breadcrumb.message === "string") {
    breadcrumb.message = breadcrumb.message.slice(0, BREADCRUMB_MESSAGE_CAP);
  }
  // `data` on a console breadcrumb carries the logged arguments —
  // which is exactly where a seam passes its provider payload.
  delete breadcrumb.data;
  return breadcrumb;
}

export function scrubEvent(event: ErrorEvent): ErrorEvent {
  // Never a body, never a cookie, never a header set: bodies carry
  // form fields, cookies carry the session, headers carry the bearer.
  if (event.request) {
    delete event.request.data;
    delete event.request.cookies;
    delete event.request.headers;
  }

  // No identity beyond what a tag says. sendDefaultPii is already
  // false; this is the belt to that braces, because a future
  // setUser() call elsewhere would otherwise silently start shipping
  // emails.
  delete event.user;

  for (const exception of event.exception?.values ?? []) {
    if (typeof exception.value === "string") {
      exception.value = capAndRedact(exception.value);
    }
  }

  if (typeof event.message === "string") {
    event.message = capAndRedact(event.message);
  }

  return event;
}
