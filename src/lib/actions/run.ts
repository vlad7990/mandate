import { ForbiddenError } from "@/lib/auth/access";
import { agentErrorMessage, safeFailureMessage } from "@/lib/ai/agent-errors";
import {
  captureActionFault,
  captureGuardTrip,
} from "@/lib/observability/sentry";
import { ActionFailure, type ActionResult } from "./result";

/**
 * The server half of the action contract. See `result.ts` for the bug.
 *
 * **Server-only.** It reaches `@/lib/auth/access`, which reaches the
 * Supabase server client. Client components import `result.ts`, never this.
 *
 * ## What may be returned to a reader
 *
 * Returning the message removes the redaction that used to cover for these
 * strings, so the rule has to be stated rather than assumed:
 *
 * - **A plain `Error`** is an outcome the action authored. Its message was
 *   written for the reader — *"an organization must keep at least one
 *   active admin"*, *"Founder accounts are managed by Mandate"* — and
 *   getting it in front of them is the entire point of this change. It
 *   passes through `safeFailureMessage()`, the same backstop the
 *   `generation_error` columns use, so an authored sentence survives and an
 *   unmistakable provider payload does not.
 *
 * - **Anything else** — an `Error` *subclass*, or a non-`Error` throw — is a
 *   fault, not an outcome. The Anthropic SDK throws subclasses; so do
 *   `TypeError` and friends. Those messages were written for us, not for a
 *   recruiter, so the reader gets `agentErrorMessage()`'s sentence and the
 *   real error goes to the server log.
 *
 * Discriminating on the constructor rather than on a bespoke `ActionError`
 * class is what let this land without editing 348 individual throw sites,
 * and it puts the default on the safe side: a new `throw` that nobody
 * thought about is only shown if somebody wrote `new Error("a sentence")`.
 *
 * ## What is rethrown, and why
 *
 * **`ForbiddenError`.** `assertCapability` is the guard layer, not an
 * outcome — the proxy and RLS are the boundary, and a caller who reaches an
 * action they hold no capability for is not a user who needs a friendly
 * sentence. A thrown error is the right shape for "you may not do this at
 * all", and it keeps the guard visible in logs and error boundaries.
 *
 * **`redirect()` and `notFound()`.** Both signal by throwing. Swallowing
 * one into `{ ok: false }` would turn every successful redirecting action —
 * `createSkillAction`, `createProjectAction` — into a silent failure toast.
 */
export async function runAction<T>(
  subject: string,
  body: () => Promise<T>
): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await body() };
  } catch (err) {
    if (isNextSignal(err)) throw err;
    if (err instanceof ForbiddenError) {
      captureGuardTrip(err, subject);
      throw err;
    }

    console.error(`[action] ${subject} failed:`, err);
    // Only FAULTS become Sentry events (NEXT-sentry D3): a plain
    // `Error` is an authored outcome sentence and stays between the
    // action and its reader.
    if (!(err instanceof Error && err.constructor === Error) && !(err instanceof ActionFailure)) {
      captureActionFault(err, subject);
    }
    return { ok: false, error: readerMessage(err, subject) };
  }
}

/**
 * `redirect()` / `notFound()` mark their throw with a `digest` string.
 *
 * Read by hand rather than through `next/dist/client/components/
 * redirect-error`, which is a private path that has moved between majors.
 * `skill-form.tsx` already does the same check on the client side.
 */
function isNextSignal(err: unknown): boolean {
  if (typeof err !== "object" || err === null || !("digest" in err)) return false;
  const digest = (err as { digest?: unknown }).digest;
  return (
    typeof digest === "string" &&
    (digest.startsWith("NEXT_REDIRECT") || digest === "NEXT_NOT_FOUND")
  );
}

function readerMessage(err: unknown, subject: string): string {
  // An action that reads another action's result with `unwrap` throws this.
  // The message has already been through the rule below once; putting it
  // through the subclass branch would replace a good sentence with a vague
  // one purely because it crossed one more frame.
  if (err instanceof ActionFailure) return err.message;

  // `constructor === Error` and not `name === "Error"`: a subclass that
  // forgets to set `name` inherits "Error", which would route a provider
  // error down the authored-sentence branch.
  if (err instanceof Error && err.constructor === Error) {
    return safeFailureMessage(err.message, subject);
  }
  return agentErrorMessage(err, subject);
}
