// Opening a drafted email in the user's mail client — honestly (§128 F-2).
//
// mailto: URLs are handed to the OS, and common mail clients refuse or
// silently TRUNCATE long ones (ceilings cluster around ~2,000 characters —
// a modest evaluation draft measured 2,290 in drive 0fa). A clipped body
// looks like a finished email with its ending missing, which is the worst
// failure mode for a client-facing draft.
//
// So: when the full URL fits under a conservative ceiling, open it as-is.
// When it does not, copy the FULL body to the clipboard first and open the
// mail client with the subject plus a one-line pointer body — the user
// pastes, nothing is ever clipped behind their back. If the clipboard is
// unavailable too, refuse to open at all; the caller tells the user to use
// the Copy affordance instead.

export const MAILTO_URL_CEILING = 1900;

export const MAILTO_POINTER_BODY =
  "The full draft was too long for a mail link, so it is on your clipboard — paste it here.";

export type MailDraftOutcome = "opened" | "opened_body_on_clipboard" | "too_long_clipboard_unavailable";

export function buildMailtoUrl(opts: {
  to?: string;
  subject: string;
  body: string;
}): string {
  const recipient = opts.to ?? "";
  return `mailto:${recipient}?subject=${encodeURIComponent(opts.subject)}&body=${encodeURIComponent(opts.body)}`;
}

export async function openMailDraft(opts: {
  to?: string;
  subject: string;
  body: string;
}): Promise<MailDraftOutcome> {
  const full = buildMailtoUrl(opts);
  if (full.length <= MAILTO_URL_CEILING) {
    window.location.href = full;
    return "opened";
  }

  try {
    await navigator.clipboard.writeText(opts.body);
  } catch {
    return "too_long_clipboard_unavailable";
  }

  window.location.href = buildMailtoUrl({
    to: opts.to,
    subject: opts.subject,
    body: MAILTO_POINTER_BODY,
  });
  return "opened_body_on_clipboard";
}
