/**
 * What a person sees when an agent call fails.
 *
 * The rule is the one `live-simulator.tsx` already states for the marketing
 * page — **never surface the upstream body** — and it is worth restating
 * here because the reason is not the same one. On the marketing page the
 * argument is that a prospect must not learn our billing status. Inside the
 * product the argument is that a recruiter handed
 *
 *     400 {"type":"error","error":{"type":"invalid_request_error",
 *     "message":"Your credit balance is too low to access the Anthropic
 *     API. Please go to Plans & Billing to upgrade or purchase credits."},
 *     "request_id":"req_011Ce..."}
 *
 * is being told to fix a bill they cannot see, at a vendor they have no
 * account with, and is being given a request id they have nowhere to put.
 * It reads as the product breaking rather than as a service being down,
 * which is the difference between "try again later" and "this is broken".
 *
 * That payload is verbatim what `/app/candidates/search` rendered the first
 * time it was opened from the rail. It had been unreachable except by typing
 * the URL, so nobody had ever seen it fail.
 *
 * This decides what is *shown*. It deliberately does not log — the caller
 * still sends the real error to the server console, where the vendor's
 * request id is worth having.
 */

/** Anthropic's SDK errors carry an HTTP status; nothing else is assumed. */
function statusOf(err: unknown): number | undefined {
  if (typeof err === "object" && err !== null && "status" in err) {
    const raw = (err as { status: unknown }).status;
    const n = typeof raw === "number" ? raw : Number(raw);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

/**
 * `subject` names the thing that failed, in the product's own words — "The
 * search agent", "The role analysis". It is a sentence subject, so it is
 * capitalised and not a slug.
 *
 * Only two outcomes are distinguished, because only two lead to different
 * behaviour by the reader: wait and retry, or stop and tell someone. A
 * missing API key, an exhausted balance and a malformed request are all the
 * second, and separating them would only tell a recruiter which of our
 * problems it is.
 */
export function agentErrorMessage(err: unknown, subject: string): string {
  const status = statusOf(err);

  if (status === 429 || (status !== undefined && status >= 500)) {
    return `${subject} is busy right now. Try again in a moment.`;
  }

  return unavailable(subject);
}

function unavailable(subject: string): string {
  return `${subject} could not run. This has been logged — try again, and tell an admin if it keeps happening.`;
}

/**
 * Unmistakable markers of a provider payload. Deliberately narrow: a JSON
 * error envelope, a request id, or a bare HTTP status followed by a body.
 *
 * It does **not** try to detect "internal-looking" text in general. A
 * heuristic broad enough to catch a stray UUID would also eat
 * `"No approved success profile for this search."`, which is authored *for*
 * the reader and is the most useful sentence any of these views can show.
 * Deciding which is which is the call site's job; this only catches the
 * case where getting it wrong is unambiguous.
 */
const PROVIDER_PAYLOAD = /"request_id"|"type"\s*:\s*"(error|invalid_request_error)"|^\s*\d{3}\s*\{/;

/**
 * Backstop at a persistence boundary.
 *
 * The `generation_error` columns are written by one helper per generator and
 * rendered verbatim with a Retry CTA, so a raw message reaching one of them
 * is stored in Postgres and shown to a recruiter — worse than a transient
 * screen, because it outlives the request.
 *
 * Call sites are expected to have already chosen: authored text passes
 * through untouched, and anything from a `catch` should arrive via
 * `agentErrorMessage`. This exists so that the next generator someone adds
 * cannot leak a provider body by simply forgetting to.
 */
export function safeFailureMessage(message: string, subject: string): string {
  return PROVIDER_PAYLOAD.test(message) ? unavailable(subject) : message;
}
