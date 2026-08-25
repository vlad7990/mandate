import "server-only";
import { escapeHtml, sendEmail, type EmailMessage, type EmailResult } from "@/lib/email/send";

// The provider adapter (spec §5.8): the ONLY file in the service that
// knows Resend exists, and it knows it only through lib/email/send.ts —
// the one door. Gmail / M365 / ATS connectors are FUTURE adapters
// behind this same shape; nothing else in src/lib/comms may assume a
// provider.

export type CommsProvider = (message: EmailMessage) => Promise<EmailResult>;

export const resendProvider: CommsProvider = (message) => sendEmail(message);

/** Plain composed text → simple, safe HTML (paragraphs + line breaks). */
export function renderTextAsHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map(
      (paragraph) =>
        `<p style="margin:0 0 1em 0; line-height:1.5;">${escapeHtml(paragraph).replace(/\n/g, "<br/>")}</p>`
    )
    .join("");
}
