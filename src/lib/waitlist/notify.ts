import "server-only";

import { escapeHtml, sendEmail, siteUrl } from "@/lib/email/send";

/**
 * Founders to ping when a new waitlist request lands. Mirrors the
 * FOUNDER_EMAILS allowlist used in auth signup.
 */
const FOUNDER_EMAILS = [
  "vbreygin@gmail.com",
  "v.breygin7990@gmail.com",
  "filmreecon@gmail.com",
] as const;

export type WaitlistNotificationPayload = {
  full_name: string;
  email: string;
  company: string;
  role: string;
  referral_source: string;
  use_case: string;
};

/**
 * Notify the founder allowlist that a new waitlist request has been
 * submitted. Uses Resend when RESEND_API_KEY is present; otherwise
 * logs a structured notice the founder can find in server logs and
 * triages from /settings/waitlist directly.
 */
export async function notifyFoundersOfWaitlistRequest(
  payload: WaitlistNotificationPayload
): Promise<void> {
  const result = await sendEmail({
    to: [...FOUNDER_EMAILS],
    subject: `[Mandate] New access request — ${payload.full_name}`,
    html: renderHtml(payload),
  });

  if (result.sent) return;

  // No key is the normal local state; triage happens at /settings/waitlist
  // either way. A refused or failed send keeps throwing, as it always has,
  // so the caller's error path stays what it was.
  if (result.reason === "not-configured") {
    console.info(
      "[waitlist] new request (no RESEND_API_KEY set — triage at /settings/waitlist)",
      {
        from: payload.email,
        full_name: payload.full_name,
        company: payload.company,
      }
    );
    return;
  }

  throw new Error(result.detail);
}

function renderHtml(p: WaitlistNotificationPayload): string {
  const row = (label: string, value: string) =>
    value
      ? `<tr><td style="padding:6px 12px;color:#888;font-family:monospace;text-transform:uppercase;font-size:11px;">${label}</td><td style="padding:6px 12px;color:#222;">${escapeHtml(value)}</td></tr>`
      : "";
  return `<!doctype html>
<html><body style="font-family:-apple-system,sans-serif;background:#fafafa;padding:24px;">
  <h2 style="margin:0 0 12px;">New Mandate access request</h2>
  <table cellpadding="0" cellspacing="0" style="border:1px solid #ddd;border-collapse:collapse;background:#fff;">
    ${row("Name", p.full_name)}
    ${row("Email", p.email)}
    ${row("Company", p.company)}
    ${row("Role", p.role)}
    ${row("Heard about", p.referral_source)}
    ${row("Use case", p.use_case)}
  </table>
  <p style="margin-top:18px;font-size:13px;color:#555;">Triage at <a href="${siteUrl()}/settings/waitlist">/settings/waitlist</a>.</p>
</body></html>`;
}

