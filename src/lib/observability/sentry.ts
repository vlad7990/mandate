import * as Sentry from "@sentry/nextjs";

/**
 * The one seam-side door to Sentry (NEXT-sentry D3/D7).
 *
 * Everything outside the init files and the two error boundaries goes
 * through this module, so the dependency stays removable: delete five
 * files and one config wrapper and the product is Sentry-ignorant
 * again. The 348 action throw sites and the seams' log sites never
 * import the SDK.
 *
 * ## A copy, not a replacement (D5)
 *
 * `captureSeamError` is a drop-in for `console.error`: it logs FIRST,
 * exactly as before, then copies the fault to Sentry. Sentry absent,
 * down, or DSN-less changes nothing — the SDK no-ops and the console
 * record stands, the same record the product has kept since day one.
 *
 * ## What may ride an event (D4)
 *
 * Tags carry the trail's vocabulary — seam labels, subjects, enums —
 * never free text. The PII boundary itself (length caps on provider
 * messages, no bodies, no emails) is enforced in `beforeSend` at the
 * init files, so nothing this module forwards can bypass it.
 */

/** Milliseconds are cheap; provider payloads are not. See D4. */
export const PROVIDER_MESSAGE_CAP = 500;

/**
 * Drop-in replacement for `console.error` at the agent seams' catch
 * sites. The seam tag is derived from the house log convention — the
 * leading `[label]` every seam line already carries.
 */
export function captureSeamError(...args: unknown[]): void {
  console.error(...args);

  const message = typeof args[0] === "string" ? args[0] : "seam error";
  const seam = /^\[([^\]]+)\]/.exec(message)?.[1] ?? "seam";
  const err =
    args.find((a): a is Error => a instanceof Error) ??
    new Error(message.slice(0, PROVIDER_MESSAGE_CAP));

  Sentry.withScope((scope) => {
    scope.setTag("seam", seam);
    Sentry.captureException(err);
  });
}

/**
 * runAction's fault branch (D3): the action's `subject` — a sentence
 * fragment like "The mandate workspace", never user data — rides as a
 * tag so the Sentry issue list reads like the product.
 */
export function captureActionFault(err: unknown, subject: string): void {
  Sentry.withScope((scope) => {
    scope.setTag("seam", "action");
    scope.setTag("subject", subject);
    Sentry.captureException(err);
  });
}

/**
 * A guard trip (D3): `ForbiddenError` is rethrown to the boundary, but
 * a caller reaching an action they hold no capability for is worth a
 * warning-level record under its own fingerprint.
 */
export function captureGuardTrip(err: unknown, subject: string): void {
  Sentry.withScope((scope) => {
    scope.setTag("seam", "guard");
    scope.setTag("subject", subject);
    scope.setLevel("warning");
    Sentry.captureException(err);
  });
}
