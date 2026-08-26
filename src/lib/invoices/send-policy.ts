/**
 * Whether an invoice may leave the building — the pure ladder (126).
 *
 * ## Why this is not `comms/send-policy.ts`
 *
 * 099's ladder is CANDIDATE-scoped by design, and its heart is a pair
 * of caps: how many people the org may contact today, and how often one
 * candidate may be contacted. Those exist because a candidate never
 * asked to hear from us, and volume is the harm.
 *
 * A client who is owed three invoices should receive three invoices.
 * Applying a per-day cap to billing would mean the product silently
 * declining to bill, which is a worse failure than any it prevents
 * (gate D.2). So the caps do not cross over, and this is a separate
 * ladder rather than a flag on the old one — the two answer different
 * questions and will keep diverging.
 *
 * ## What DOES cross over
 *
 * Suppression. An address that hard-bounced or filed a complaint is
 * refused here exactly as it is for a candidate, because the damage is
 * not to the recipient — it is to the sending domain's reputation, and
 * that is shared by every email the agency sends, invoice or not.
 *
 * Order matters, as it does in 099: state of the document first (there
 * is no point checking an address for something that cannot be sent),
 * then the identity it would come from, then the recipient.
 */

export type InvoiceSendRefusal = {
  ok: false;
  code:
    | "not_issued"
    | "already_void"
    | "no_from_identity"
    | "no_recipient"
    | "invalid_recipient"
    | "suppressed";
  message: string;
};

export type InvoiceSendPolicyResult = { ok: true } | InvoiceSendRefusal;

export type InvoiceSendPolicyInput = {
  status: "draft" | "issued" | "void";
  /** The template's billing address, as of now. Null when unset. */
  fromEmail: string | null;
  /** The recipient the recruiter chose or typed. */
  toAddress: string | null;
  /** The address is on `email_suppressions`, with its reason. */
  suppressed: { reason: string } | null;
};

/**
 * Deliberately permissive about address shape beyond a single `@` with
 * something either side. Over-strict client-side validation rejects
 * real addresses (plus-tags, long TLDs, unicode domains) and the
 * provider is the real arbiter — a refused send comes back with the
 * provider's own sentence, which is more useful than a guess.
 */
function looksLikeAddress(value: string): boolean {
  const trimmed = value.trim();
  if (/\s/.test(trimmed)) return false;
  const at = trimmed.indexOf("@");
  return at > 0 && at < trimmed.length - 1 && trimmed.lastIndexOf("@") === at;
}

export function evaluateInvoiceSendPolicy(
  input: InvoiceSendPolicyInput
): InvoiceSendPolicyResult {
  if (input.status === "draft") {
    return {
      ok: false,
      code: "not_issued",
      message:
        "This is still a draft — issue it first. A draft has no number, and a document without a number is not an invoice.",
    };
  }

  if (input.status === "void") {
    return {
      ok: false,
      code: "already_void",
      message:
        "This invoice is void and cannot be sent. Reissue it and send the new one.",
    };
  }

  const from = input.fromEmail?.trim() ?? "";
  if (!from) {
    return {
      ok: false,
      code: "no_from_identity",
      message:
        "The template has no billing email address, so there is nothing to send this from. Add one under Settings → Invoice templates — it must be an address on a domain verified with the email provider.",
    };
  }

  const to = input.toAddress?.trim() ?? "";
  if (!to) {
    return {
      ok: false,
      code: "no_recipient",
      message: "Choose a contact or type an address to send this invoice to.",
    };
  }

  if (!looksLikeAddress(to)) {
    return {
      ok: false,
      code: "invalid_recipient",
      message: `"${to}" does not look like an email address.`,
    };
  }

  if (input.suppressed) {
    return {
      ok: false,
      code: "suppressed",
      message: `Mail to ${to} is suppressed (${input.suppressed.reason}). Sending to an address that has bounced or complained damages delivery for every other message the agency sends — use another contact.`,
    };
  }

  return { ok: true };
}
