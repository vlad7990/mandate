import "server-only";
import { captureSeamError } from "@/lib/observability/sentry";

/**
 * Cloudflare Turnstile, server side (NEXT-rate-limiting D4).
 *
 * Env-gated end to end, the AGENT_* credential shape: no
 * TURNSTILE_SECRET_KEY means verification is OFF and this returns
 * ok — the widget is not rendered either (the form checks the
 * public site key), so nothing asks the visitor for a token nobody
 * will check. Provisioning both keys is founder-hand; remember
 * §59's trap — the SITE key must be added `--no-sensitive` or it
 * never reaches the browser.
 *
 * The D3 split applies here too: a Turnstile OUTAGE fails open with
 * a capture (a broken captcha must not close the only door a new
 * customer has); a token that VERIFIES AS WRONG is refused — that
 * is the check answering, not the check failing.
 */

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export type TurnstileVerdict =
  | { ok: true; mode: "verified" | "disabled" | "outage" }
  | { ok: false };

export async function verifyTurnstile(
  token: string | undefined,
  remoteIp: string
): Promise<TurnstileVerdict> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return { ok: true, mode: "disabled" };

  if (!token) {
    // The widget was rendered (the site key exists if the secret
    // does) and no token arrived: a scripted POST skipping the form.
    return { ok: false };
  }

  try {
    const res = await fetch(VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        secret,
        response: token,
        remoteip: remoteIp,
      }),
    });
    if (!res.ok) {
      captureSeamError(
        `[turnstile] siteverify answered ${res.status} — failing open`
      );
      return { ok: true, mode: "outage" };
    }
    const data = (await res.json()) as { success?: boolean };
    return data.success ? { ok: true, mode: "verified" } : { ok: false };
  } catch (err) {
    captureSeamError("[turnstile] siteverify unreachable — failing open", err);
    return { ok: true, mode: "outage" };
  }
}
