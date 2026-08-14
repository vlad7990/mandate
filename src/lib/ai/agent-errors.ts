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

  return `${subject} is unavailable. This has been logged — nothing you typed was lost.`;
}
