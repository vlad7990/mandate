/**
 * Post-authentication destinations, and the guard that validates them.
 *
 * Every product route lives under `/app`. That prefix is what keeps the
 * marketing and product URL spaces apart — `/executive-intelligence` is
 * a marketing page, `/app/executive-intelligence` is the workspace — so
 * neither can take the other's path by accident.
 */
export const DASHBOARD_HOME = "/app/home";

/**
 * Validate a `?next=` value before redirecting to it.
 *
 * `/auth/callback` used to do `redirect(`${origin}${next}`)` with the
 * raw query parameter. `next=//evil.com` produces `https://host//evil.com`,
 * which a browser resolves as protocol-relative — i.e. an open redirect
 * off the origin. Reaching it needs a valid auth code, so the attack is
 * a phishing chain rather than a drive-by: craft a sign-in link carrying
 * the hostile `next`, let the victim authenticate for real, and land
 * them on a convincing lookalike with a live session behind them.
 *
 * Accepts only a same-origin absolute path. Anything else falls back to
 * the dashboard rather than erroring — a bad `next` should not block a
 * legitimate sign-in.
 */
export function safeNextPath(
  next: string | null | undefined,
  fallback: string = DASHBOARD_HOME
): string {
  if (!next) return fallback;

  // Must be an absolute path on this origin.
  if (!next.startsWith("/")) return fallback;

  // `//host` and `/\host` are protocol-relative — the actual vector.
  // Backslash is checked because browsers normalise it to a slash.
  if (next.startsWith("//") || next.startsWith("/\\")) return fallback;

  // Control characters can be used to smuggle a newline past a naive
  // check and split the redirect header.
  if (/[\u0000-\u001f\u007f]/.test(next)) return fallback;

  return next;
}
