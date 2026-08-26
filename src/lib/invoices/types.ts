/**
 * The invoice domain — see `supabase/migrations/123_invoicing.sql`.
 *
 * An invoice is a SELECTION plus a SNAPSHOT. The fee tables (050)
 * computed every number first; the invoice copies the chosen lines'
 * label/amount/currency onto itself so the document a client received
 * never changes when a fee is later edited — the same frozen-copy rule
 * as the terms snapshot in 050 and `actor_label` in 053. There is no
 * new money math anywhere in this module.
 *
 * Client-safe data + pure functions only, on the notes-constants rule.
 */

export const INVOICE_STATUSES = ["draft", "issued", "void"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  draft: "Draft",
  issued: "Issued",
  void: "Void",
};

export function parseInvoiceStatus(value: unknown): InvoiceStatus | null {
  if (typeof value !== "string") return null;
  const normalised = value.trim().toLowerCase();
  return (INVOICE_STATUSES as readonly string[]).includes(normalised)
    ? (normalised as InvoiceStatus)
    : null;
}

/**
 * What `invoice_templates.structure` carries — the org's billing
 * identity and the document's furniture. This is where "from" lives,
 * because `organizations` is name+slug and there is nothing to join
 * (gate B.3). Every field optional: a template with only a name still
 * issues, it just prints a sparser header.
 */
export type TemplateStructure = {
  /** The legal name that bills — falls back to the org name on screen. */
  billing_name: string;
  /** Street / city / country, one line per entry, printed as given. */
  address_lines: string[];
  company_number: string;
  vat_number: string;
  /** Bank details, remittance instructions — free text, printed verbatim. */
  payment_instructions: string;
  /**
   * The address invoices are SENT FROM (126, gate D.1).
   *
   * Not `RESEND_FROM`: that is the product writing to its own users,
   * and an invoice is the agency billing its client. It lives here
   * because the template already carries the billing identity, and it
   * is per-template so an agency billing under two entities can send
   * as each. Blank means this template cannot send — the affordance is
   * absent and the refusal says why, rather than sending as Mandate.
   *
   * The domain must be verified with the email provider; an unverified
   * one comes back as the provider's own refusal sentence.
   */
  from_email: string;
  /** Where client replies should land. Falls back to `from_email`. */
  reply_to: string;
  header_text: string;
  footer_text: string;
  /** Prefix for minted numbers, e.g. "INV-2026-". */
  numbering_prefix: string;
  /** Fallback terms for new drafts on this template. */
  default_payment_terms_days: number;
};

export const DEFAULT_NUMBERING_PREFIX = "INV-";
export const DEFAULT_PAYMENT_TERMS_DAYS = 30;

/**
 * Read a template's structure out of jsonb. Anything malformed loses
 * the field rather than the screen — an unparseable template must not
 * take out the builder (the `parseInstalmentPlan` posture).
 */
export function parseTemplateStructure(value: unknown): TemplateStructure {
  const raw =
    typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};

  const text = (key: string): string =>
    typeof raw[key] === "string" ? (raw[key] as string).trim() : "";

  const addressLines = Array.isArray(raw.address_lines)
    ? raw.address_lines
        .filter((l): l is string => typeof l === "string")
        .map((l) => l.trim())
        .filter(Boolean)
    : [];

  const termsRaw = Number(raw.default_payment_terms_days);
  const terms =
    Number.isInteger(termsRaw) && termsRaw >= 0
      ? termsRaw
      : DEFAULT_PAYMENT_TERMS_DAYS;

  return {
    billing_name: text("billing_name"),
    address_lines: addressLines,
    company_number: text("company_number"),
    vat_number: text("vat_number"),
    payment_instructions: text("payment_instructions"),
    from_email: text("from_email"),
    reply_to: text("reply_to"),
    header_text: text("header_text"),
    footer_text: text("footer_text"),
    numbering_prefix: text("numbering_prefix") || DEFAULT_NUMBERING_PREFIX,
    default_payment_terms_days: terms,
  };
}

/**
 * The number `issue_invoice` will mint for a given counter value.
 * Kept in step with the SQL (`prefix || lpad(n, 4, '0')`) by a test,
 * so the studio's "next number" preview cannot lie about what issue
 * will do.
 */
export function formatInvoiceNumber(prefix: string, next: number): string {
  return `${prefix || DEFAULT_NUMBERING_PREFIX}${String(next).padStart(4, "0")}`;
}

/** The client's name and address AS TYPED on this document. */
export type BillTo = {
  name: string;
  address_lines: string[];
};

export function parseBillTo(value: unknown): BillTo {
  const raw =
    typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  return {
    name: typeof raw.name === "string" ? raw.name.trim() : "",
    address_lines: Array.isArray(raw.address_lines)
      ? raw.address_lines
          .filter((l): l is string => typeof l === "string")
          .map((l) => l.trim())
          .filter(Boolean)
      : [],
  };
}

export type InvoiceTemplateRow = {
  id: string;
  organization_id: string;
  name: string;
  logo_path: string | null;
  structure: unknown;
  numbering_next: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export const INVOICE_TEMPLATE_COLUMNS =
  "id, organization_id, name, logo_path, structure, numbering_next, created_by, created_at, updated_at";

export type InvoiceRow = {
  id: string;
  organization_id: string;
  client_id: string | null;
  template_id: string | null;
  status: InvoiceStatus;
  invoice_number: string | null;
  issue_date: string | null;
  due_date: string | null;
  payment_terms_days: number;
  currency: string;
  bill_to: unknown;
  /** The template's identity as of issue; null on drafts. */
  from_snapshot: unknown;
  total_amount: number;
  notes: string | null;
  voided_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export const INVOICE_COLUMNS =
  "id, organization_id, client_id, template_id, status, invoice_number, issue_date, due_date, payment_terms_days, currency, bill_to, from_snapshot, total_amount, notes, voided_at, created_by, created_at, updated_at";

export type InvoiceLineRow = {
  id: string;
  organization_id: string;
  invoice_id: string;
  /** Provenance, not data — the FK is SET NULL and the label/amount stay. */
  placement_id: string | null;
  fee_line_id: string | null;
  label: string;
  sequence: number;
  amount: number;
  currency: string;
  created_at: string;
};

export const INVOICE_LINE_COLUMNS =
  "id, organization_id, invoice_id, placement_id, fee_line_id, label, sequence, amount, currency, created_at";

/** Logo validation — mirrors the `invoice-assets` bucket's own limits. */
export const MAX_LOGO_BYTES = 2_097_152; // 2 MB — the bucket's limit

export const LOGO_EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

export const LOGO_ACCEPT = Object.keys(LOGO_EXTENSIONS).join(",");

export type LogoValidation =
  | { ok: true; extension: string }
  | { ok: false; reason: string };

export function validateLogoFile(file: {
  type: string;
  size: number;
}): LogoValidation {
  const extension = LOGO_EXTENSIONS[file.type];
  if (!extension) {
    return {
      ok: false,
      reason: "That file type is not a supported logo — use PNG, JPEG, or WebP.",
    };
  }
  if (file.size <= 0) {
    return { ok: false, reason: "The logo file is empty." };
  }
  if (file.size > MAX_LOGO_BYTES) {
    return { ok: false, reason: "The logo is over 2MB — resize it first." };
  }
  return { ok: true, extension };
}

/**
 * One send of one invoice (126). A record, not a stamp that moves
 * (gate D.4): "what did this client actually receive, and when" is an
 * audit question, and an invoice re-sent after a bounce has two
 * answers. Addresses and subject are SNAPSHOTS for the same reason
 * everything else in this family is.
 */
export const DELIVERY_STATUSES = [
  "sent",
  "delivered",
  "bounced",
  "complained",
  "failed",
] as const;
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

export const DELIVERY_STATUS_LABELS: Record<DeliveryStatus, string> = {
  sent: "Sent",
  delivered: "Delivered",
  bounced: "Bounced",
  complained: "Complained",
  failed: "Failed",
};

export type InvoiceDeliveryRow = {
  id: string;
  organization_id: string;
  invoice_id: string;
  to_address: string;
  to_label: string | null;
  from_address: string;
  subject: string;
  provider: string;
  provider_message_id: string | null;
  delivery_status: DeliveryStatus;
  failure_detail: string | null;
  sent_by: string | null;
  created_at: string;
};

export const INVOICE_DELIVERY_COLUMNS =
  "id, organization_id, invoice_id, to_address, to_label, from_address, subject, provider, provider_message_id, delivery_status, failure_detail, sent_by, created_at";
