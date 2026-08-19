import "server-only";

/**
 * The one door to Resend.
 *
 * Promoted from the waitlist notifier's inline fetch when the External
 * Identity programme made email a product surface rather than a founder
 * ping: an invitation that silently fails to send is an external who was
 * promised access and never got it. So this module never throws and never
 * pretends — it returns what happened, and every caller is expected to
 * surface a failure to the person who initiated the send (the
 * delivery-honesty rule, same family as the §19 digest panel stating
 * where it does and does not deliver).
 *
 * No key configured is a *distinct* outcome from a refused send: local
 * dev has no RESEND_API_KEY and that is normal, while production getting
 * a 4xx from Resend (unverified domain, bad recipient) is something the
 * inviter must be told about.
 */

export type EmailResult =
  | { sent: true; id: string | null }
  | { sent: false; reason: "not-configured" | "refused" | "network"; detail: string };

export type EmailMessage = {
  to: string[];
  subject: string;
  html: string;
  /** Plain-text alternative. Always provide one for external recipients. */
  text?: string;
  replyTo?: string;
};

const DEFAULT_FROM = "Mandate <noreply@getmandate.io>";

export async function sendEmail(message: EmailMessage): Promise<EmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return {
      sent: false,
      reason: "not-configured",
      detail: "RESEND_API_KEY is not set in this environment.",
    };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM ?? DEFAULT_FROM,
        to: message.to,
        subject: message.subject,
        html: message.html,
        ...(message.text ? { text: message.text } : {}),
        ...(message.replyTo ? { reply_to: message.replyTo } : {}),
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      // Logged as well as returned: the caller's toast reaches one person
      // once, and a refused send is an operational fact worth finding in
      // the server logs after the toast is gone.
      console.error(
        `[email] Resend refused (${response.status}) for ${message.to.join(", ")}: ${detail.slice(0, 500)}`
      );
      return {
        sent: false,
        reason: "refused",
        detail: `Resend ${response.status}: ${detail.slice(0, 500)}`,
      };
    }

    const body = (await response.json().catch(() => null)) as { id?: string } | null;
    return { sent: true, id: body?.id ?? null };
  } catch (err) {
    return {
      sent: false,
      reason: "network",
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

export function siteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.VERCEL_URL ??
    "https://getmandate.io"
  );
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
