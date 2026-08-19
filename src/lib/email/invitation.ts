import "server-only";

import { escapeHtml, siteUrl } from "./send";
import { ROLE_LABELS, type ExternalRole } from "@/lib/auth/roles";

/**
 * The invitation email — the first email Mandate has ever sent to a
 * person outside the recruiting org, which is why it says plainly who
 * invited them, on behalf of which firm, to which company's portal, and
 * when the link stops working. An invitation that reads like marketing
 * gets deleted; this one reads like the colleague who sent it.
 */

export type InvitationEmailInput = {
  inviteeName: string;
  inviterLabel: string;
  organizationName: string;
  clientName: string;
  role: ExternalRole;
  token: string;
  expiresAt: string;
};

export function renderInvitationEmail(input: InvitationEmailInput): {
  subject: string;
  html: string;
  text: string;
} {
  const url = `${siteUrl()}/invite/${input.token}`;
  const roleLabel = ROLE_LABELS[input.role];
  const expires = new Date(input.expiresAt).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const inviter = input.inviterLabel || input.organizationName;

  const subject = `${inviter} invited you to the ${input.clientName} portal on Mandate`;

  const text = [
    `Hi ${input.inviteeName},`,
    ``,
    `${inviter} at ${input.organizationName} invited you to ${input.clientName}'s portal on Mandate, as ${roleLabel}.`,
    ``,
    `You'll see the searches shared with ${input.clientName}, review candidate slates, and give feedback that reaches the search team directly.`,
    ``,
    `Accept the invitation and set your password here:`,
    url,
    ``,
    `This link is personal to you and expires on ${expires}. If you weren't expecting it, you can ignore this email — nothing happens without you.`,
  ].join("\n");

  const html = `<!doctype html>
<html><body style="font-family:-apple-system,sans-serif;background:#fafafa;padding:24px;color:#222;">
  <div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #ddd;padding:32px;">
    <p style="margin:0 0 4px;font-family:monospace;text-transform:uppercase;font-size:11px;letter-spacing:1px;color:#888;">Mandate</p>
    <h2 style="margin:0 0 16px;font-size:20px;">You're invited to the ${escapeHtml(input.clientName)} portal</h2>
    <p style="margin:0 0 12px;line-height:1.5;">Hi ${escapeHtml(input.inviteeName)},</p>
    <p style="margin:0 0 12px;line-height:1.5;">
      <strong>${escapeHtml(inviter)}</strong> at ${escapeHtml(input.organizationName)}
      invited you to <strong>${escapeHtml(input.clientName)}</strong>'s portal on Mandate,
      as <strong>${escapeHtml(roleLabel)}</strong>.
    </p>
    <p style="margin:0 0 20px;line-height:1.5;">
      You'll see the searches shared with ${escapeHtml(input.clientName)}, review candidate
      slates, and give feedback that reaches the search team directly.
    </p>
    <p style="margin:0 0 20px;">
      <a href="${url}" style="display:inline-block;background:#1a56ff;color:#fff;text-decoration:none;padding:10px 20px;font-weight:600;">Accept invitation</a>
    </p>
    <p style="margin:0;font-size:13px;color:#555;line-height:1.5;">
      This link is personal to you and expires on ${expires}. If you weren't expecting it,
      you can ignore this email — nothing happens without you.
    </p>
  </div>
</body></html>`;

  return { subject, html, text };
}
