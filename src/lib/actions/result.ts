/**
 * How a server action reports failure.
 *
 * ## The bug this exists to fix
 *
 * Next.js **redacts every error thrown out of a Server Action in a
 * production build**. The client receives an `Error` whose message is:
 *
 *     "An error occurred in the Server Components render. The specific
 *     message is omitted in production builds to avoid leaking sensitive
 *     details. A digest property is included on this error instance which
 *     may provide additional details about the nature of the error."
 *
 * The codebase's pattern was `throw new Error("...")` in the action and
 * `catch (err) { toast.error(err.message) }` in the panel — around ninety
 * call sites. Every one of them rendered that paragraph in production.
 * *"An organization must keep at least one active admin"* had never reached
 * a user. `next dev` renders the real message, which is exactly why it
 * survived: it looks correct locally forever.
 *
 * So a failure has to cross the boundary as a **value**. A returned value
 * is serialized like any other action result and is not redacted.
 *
 * ## What is deliberately *not* fixed here
 *
 * These toasts were never a **leak**. The redaction that made them useless
 * also meant no provider payload ever reached a browser through a Server
 * Action. The real leaks were elsewhere and were fixed elsewhere: server-
 * rendered page bodies (`9a1c65c`), database columns holding a provider
 * error (`fe37b55`), and API routes, which are not redacted either
 * (`650b24c`). Only the third class is a security bug.
 *
 * That distinction reverses on this change, and it is the reason
 * `runAction` exists rather than each action returning whatever string it
 * has to hand. **Returning the message removes the redaction that was
 * covering for us.** Every string that leaves an action now has to be safe
 * on its own merits — see `run.ts`.
 *
 * ## Why the client still throws
 *
 * `unwrap()` turns `{ ok: false }` back into an exception on the *client*,
 * where nothing is redacted. That is not a re-introduction of the bug: the
 * failure has already crossed the boundary as data by then.
 *
 * It is what keeps the change reviewable. Each of the ~90 call sites has
 * its own recovery — an optimistic list put back, a `<select>` reset to
 * what the server still says, a `finally` that clears a spinner — and all
 * of it hangs off `catch`. Rewriting ninety recovery blocks into early
 * returns would touch precisely the code that has already been debugged in
 * a browser, to no benefit. One token per call site touches none of it.
 *
 * This module is imported by client components, so it must stay free of
 * anything server-only. `runAction` lives in `run.ts` for that reason.
 */

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/**
 * A failure that has already crossed the server boundary as data.
 *
 * Distinguishable from a transport or programming error at the call site,
 * and — being a plain `Error` — rendered unchanged by the existing
 * `err instanceof Error ? err.message : "…"` blocks.
 */
export class ActionFailure extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ActionFailure";
  }
}

/**
 * Read an action's result, or throw its message locally.
 *
 * Every client invocation of a server action goes through this. Missing one
 * is worse than the bug being fixed — the action returns `{ ok: false }`,
 * the call site sees a resolved promise, and the UI reports success on a
 * mutation that did not happen. `src/lib/actions/call-sites.test.ts` fails
 * the build if a call site is added without it.
 */
export function unwrap<T>(result: ActionResult<T>): T {
  if (result.ok) return result.data;
  throw new ActionFailure(result.error);
}
