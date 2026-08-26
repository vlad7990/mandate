"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { requireActionContext } from "@/lib/auth/access";
import { recordActivity } from "@/lib/activity/record";
import { runAction } from "@/lib/actions/run";
import type { ActionResult } from "@/lib/actions/result";
import { FEE_LINE_COLUMNS, type FeeLineRow } from "@/lib/fees/types";
import {
  INVOICE_COLUMNS,
  INVOICE_LINE_COLUMNS,
  parseBillTo,
  parseTemplateStructure,
  type InvoiceLineRow,
  type InvoiceRow,
} from "@/lib/invoices/types";
import { evaluateInvoiceSendPolicy } from "@/lib/invoices/send-policy";
import {
  invoiceEmailHtml,
  invoiceEmailSubject,
  invoiceEmailText,
} from "@/lib/invoices/email";
import { sendEmail } from "@/lib/email/send";

/** Sentence subject for a failure this file did not author. See `runAction`. */
const SUBJECT = "The invoice change";

const LABEL_MAX = 200;
const NOTES_MAX = 2_000;
const NAME_MAX = 200;

/**
 * Invoice writes ride `mandates:write` (gate D.1 — 050's split: the
 * trio that writes placements and sees money). The route guard already
 * held `fees:read` for the page; RLS enforces both predicates on the
 * rows; and the trail door re-checks the pair before recording.
 */
async function requireWriter() {
  return requireActionContext("mandates:write");
}

function invoicePath(invoiceId: string): string {
  return `/app/placements/invoices/${invoiceId}`;
}

async function loadDraft(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  invoiceId: string
): Promise<InvoiceRow> {
  const { data: invoice } = await supabase
    .from("invoices")
    .select(INVOICE_COLUMNS)
    .eq("id", invoiceId)
    .maybeSingle<InvoiceRow>();
  if (!invoice) {
    throw new Error("The invoice no longer exists. Reload the page.");
  }
  if (invoice.status !== "draft") {
    throw new Error(`The invoice is ${invoice.status} and frozen — void and reissue to change it.`);
  }
  return invoice;
}

export async function createInvoiceAction(formData: FormData): Promise<ActionResult> {
  return runAction(SUBJECT, async () => {
    const auth = await requireWriter();
    const clientId = String(formData.get("client_id") ?? "").trim();
    const templateId = String(formData.get("template_id") ?? "").trim();
    if (!clientId) throw new Error("Pick the client this invoice bills.");
    if (!templateId) throw new Error("Pick a template — it carries the billing identity.");

    const supabase = await createServerSupabaseClient();

    const [{ data: client }, { data: template }, { data: org }] = await Promise.all([
      supabase
        .from("clients")
        .select("id, name")
        .eq("id", clientId)
        .maybeSingle<{ id: string; name: string }>(),
      supabase
        .from("invoice_templates")
        .select("id, structure")
        .eq("id", templateId)
        .maybeSingle<{ id: string; structure: unknown }>(),
      supabase
        .from("organizations")
        .select("base_currency")
        .eq("id", auth.organizationId)
        .maybeSingle<{ base_currency: string }>(),
    ]);

    if (!client) throw new Error("That client no longer exists.");
    if (!template) throw new Error("That template no longer exists.");

    const structure = parseTemplateStructure(template.structure);

    // The draft opens in the org's base currency; the first fee line
    // added re-anchors it to the line's own currency (gate §C: an
    // invoice bills in the fee line's currency, never converts).
    const { data: born, error } = await supabase
      .from("invoices")
      .insert({
        organization_id: auth.organizationId,
        created_by: auth.userId,
        client_id: client.id,
        template_id: template.id,
        currency: org?.base_currency ?? "USD",
        payment_terms_days: structure.default_payment_terms_days,
        bill_to: { name: client.name, address_lines: [] },
      })
      .select("id")
      .maybeSingle<{ id: string }>();

    if (error || !born) {
      throw new Error(`Failed to create the draft: ${error?.message ?? "nothing was saved"}`);
    }

    await recordActivity(supabase, {
      eventType: "invoice_created",
      clientId: client.id,
      detail: { client: client.name },
    });

    revalidatePath("/app/placements/invoices");
    redirect(invoicePath(born.id));
  });
}

export async function updateDraftAction(
  invoiceId: string,
  formData: FormData
): Promise<ActionResult> {
  return runAction(SUBJECT, async () => {
    await requireWriter();
    const supabase = await createServerSupabaseClient();
    await loadDraft(supabase, invoiceId);

    const billToName = String(formData.get("bill_to_name") ?? "").trim();
    const billToAddress = String(formData.get("bill_to_address") ?? "")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    const notes = String(formData.get("notes") ?? "").trim();
    const termsRaw = String(formData.get("payment_terms_days") ?? "").trim();
    const terms = Number(termsRaw);

    if (billToName.length > NAME_MAX) {
      throw new Error(`The bill-to name is over ${NAME_MAX} characters — shorten it.`);
    }
    if (billToAddress.length > 8) {
      throw new Error("The bill-to address is over eight lines.");
    }
    if (notes.length > NOTES_MAX) {
      throw new Error(`The notes are over ${NOTES_MAX} characters — shorten them.`);
    }
    if (!Number.isInteger(terms) || terms < 0 || terms > 365) {
      throw new Error("Payment terms must be a whole number of days between 0 and 365.");
    }

    const { error } = await supabase
      .from("invoices")
      .update({
        bill_to: { name: billToName, address_lines: billToAddress },
        notes: notes || null,
        payment_terms_days: terms,
        updated_at: new Date().toISOString(),
      })
      .eq("id", invoiceId);

    if (error) throw new Error(`Failed to save the draft: ${error.message}`);
    revalidatePath(invoicePath(invoiceId));
  });
}

export async function addFeeLineAction(
  invoiceId: string,
  feeLineId: string
): Promise<ActionResult> {
  return runAction(SUBJECT, async () => {
    const auth = await requireWriter();
    const supabase = await createServerSupabaseClient();
    const invoice = await loadDraft(supabase, invoiceId);

    const { data: feeLine } = await supabase
      .from("placement_fee_lines")
      .select(FEE_LINE_COLUMNS)
      .eq("id", feeLineId)
      .maybeSingle<FeeLineRow>();
    if (!feeLine) throw new Error("That fee line no longer exists.");
    if (feeLine.status !== "earned") {
      throw new Error("Only earned fee lines can be billed.");
    }

    // The builder's own no-double-billing rule (gate B.1): refuse a
    // line already on a live invoice. Void releases it.
    const { data: existing } = await supabase
      .from("invoice_lines")
      .select("invoice_id, invoices!inner(status)")
      .eq("fee_line_id", feeLineId);
    const onLive = (existing ?? []).some(
      (l) => (l.invoices as unknown as { status: string }).status !== "void"
    );
    if (onLive) {
      throw new Error("That fee line is already on a live invoice — void it first to rebill.");
    }

    // The candidate's name makes the printed line say what was billed;
    // the label stays editable on the draft.
    const { data: placement } = await supabase
      .from("placements")
      // FK named explicitly — the composite `_in_org` twin makes a bare
      // embed ambiguous (see the invoice page's placements query).
      .select("id, candidates!placements_candidate_id_fkey(full_name)")
      .eq("id", feeLine.placement_id)
      .maybeSingle<{ id: string; candidates: { full_name: string } | null }>();
    const candidate = placement?.candidates?.full_name;

    // A draft with no lines yet re-anchors to the fee line's currency —
    // the guard trigger refuses a mismatch after that.
    const { count } = await supabase
      .from("invoice_lines")
      .select("id", { count: "exact", head: true })
      .eq("invoice_id", invoiceId);
    if ((count ?? 0) === 0 && invoice.currency !== feeLine.currency) {
      const { error } = await supabase
        .from("invoices")
        .update({ currency: feeLine.currency, updated_at: new Date().toISOString() })
        .eq("id", invoiceId);
      if (error) throw new Error(`Failed to set the invoice currency: ${error.message}`);
    }

    const { data: maxRow } = await supabase
      .from("invoice_lines")
      .select("sequence")
      .eq("invoice_id", invoiceId)
      .order("sequence", { ascending: false })
      .limit(1)
      .maybeSingle<{ sequence: number }>();

    const { error } = await supabase.from("invoice_lines").insert({
      organization_id: auth.organizationId,
      invoice_id: invoiceId,
      placement_id: feeLine.placement_id,
      fee_line_id: feeLine.id,
      label: candidate ? `${feeLine.label} — ${candidate}` : feeLine.label,
      sequence: (maxRow?.sequence ?? 0) + 1,
      amount: feeLine.amount,
      currency: feeLine.currency,
    });

    if (error) throw new Error(`Failed to add the line: ${error.message}`);
    revalidatePath(invoicePath(invoiceId));
  });
}

export async function addFreeLineAction(
  invoiceId: string,
  formData: FormData
): Promise<ActionResult> {
  return runAction(SUBJECT, async () => {
    const auth = await requireWriter();
    const supabase = await createServerSupabaseClient();
    const invoice = await loadDraft(supabase, invoiceId);

    const label = String(formData.get("label") ?? "").trim();
    const amount = Number(String(formData.get("amount") ?? "").trim());

    if (!label) throw new Error("The line needs a label.");
    if (label.length > LABEL_MAX) {
      throw new Error(`The label is over ${LABEL_MAX} characters — shorten it.`);
    }
    if (!Number.isFinite(amount)) {
      throw new Error("The amount must be a number.");
    }

    const { data: maxRow } = await supabase
      .from("invoice_lines")
      .select("sequence")
      .eq("invoice_id", invoiceId)
      .order("sequence", { ascending: false })
      .limit(1)
      .maybeSingle<{ sequence: number }>();

    const { error } = await supabase.from("invoice_lines").insert({
      organization_id: auth.organizationId,
      invoice_id: invoiceId,
      label,
      sequence: (maxRow?.sequence ?? 0) + 1,
      amount: Math.round(amount * 100) / 100,
      currency: invoice.currency,
    });

    if (error) throw new Error(`Failed to add the line: ${error.message}`);
    revalidatePath(invoicePath(invoiceId));
  });
}

export async function updateLineLabelAction(
  invoiceId: string,
  lineId: string,
  label: string
): Promise<ActionResult> {
  return runAction(SUBJECT, async () => {
    await requireWriter();
    const trimmed = label.trim();
    if (!trimmed) throw new Error("The line needs a label.");
    if (trimmed.length > LABEL_MAX) {
      throw new Error(`The label is over ${LABEL_MAX} characters — shorten it.`);
    }

    const supabase = await createServerSupabaseClient();
    await loadDraft(supabase, invoiceId);

    const { data: landed, error } = await supabase
      .from("invoice_lines")
      .update({ label: trimmed })
      .eq("id", lineId)
      .eq("invoice_id", invoiceId)
      .select("id");

    if (error) throw new Error(`Failed to rename the line: ${error.message}`);
    if (!landed || landed.length === 0) {
      throw new Error("Nothing was saved — the line no longer exists.");
    }
    revalidatePath(invoicePath(invoiceId));
  });
}

export async function removeLineAction(
  invoiceId: string,
  lineId: string
): Promise<ActionResult> {
  return runAction(SUBJECT, async () => {
    await requireWriter();
    const supabase = await createServerSupabaseClient();
    await loadDraft(supabase, invoiceId);

    const { data: gone, error } = await supabase
      .from("invoice_lines")
      .delete()
      .eq("id", lineId)
      .eq("invoice_id", invoiceId)
      .select("id");

    if (error) throw new Error(`Failed to remove the line: ${error.message}`);
    if (!gone || gone.length === 0) {
      throw new Error("Nothing was removed — the line no longer exists.");
    }
    revalidatePath(invoicePath(invoiceId));
  });
}

export async function moveLineAction(
  invoiceId: string,
  lineId: string,
  direction: "up" | "down"
): Promise<ActionResult> {
  return runAction(SUBJECT, async () => {
    await requireWriter();
    const supabase = await createServerSupabaseClient();
    await loadDraft(supabase, invoiceId);

    const { data: lines } = await supabase
      .from("invoice_lines")
      .select("id, sequence")
      .eq("invoice_id", invoiceId)
      .order("sequence", { ascending: true })
      .returns<{ id: string; sequence: number }[]>();

    const ordered = lines ?? [];
    const index = ordered.findIndex((l) => l.id === lineId);
    if (index === -1) throw new Error("The line no longer exists.");
    const swapWith = direction === "up" ? index - 1 : index + 1;
    if (swapWith < 0 || swapWith >= ordered.length) return;

    const a = ordered[index];
    const b = ordered[swapWith];
    // Swap through a sequence no row holds, or equal sequences would
    // make the order a coin toss.
    const results = [
      await supabase.from("invoice_lines").update({ sequence: -1 }).eq("id", a.id),
      await supabase.from("invoice_lines").update({ sequence: a.sequence }).eq("id", b.id),
      await supabase.from("invoice_lines").update({ sequence: b.sequence }).eq("id", a.id),
    ];
    const failed = results.find((r) => r.error);
    if (failed?.error) throw new Error(`Failed to reorder: ${failed.error.message}`);

    revalidatePath(invoicePath(invoiceId));
  });
}

export async function issueInvoiceAction(invoiceId: string): Promise<ActionResult> {
  return runAction(SUBJECT, async () => {
    await requireWriter();
    const supabase = await createServerSupabaseClient();

    const { error } = await supabase.rpc("issue_invoice", { p_invoice_id: invoiceId });
    if (error) throw new Error(error.message);

    // The trail speaks after the door: the issued row is the fact.
    const { data: issued } = await supabase
      .from("invoices")
      .select("invoice_number, total_amount, currency, client_id, clients(name)")
      .eq("id", invoiceId)
      .maybeSingle<{
        invoice_number: string | null;
        total_amount: number;
        currency: string;
        client_id: string | null;
        clients: { name: string } | null;
      }>();

    await recordActivity(supabase, {
      eventType: "invoice_issued",
      clientId: issued?.client_id ?? null,
      detail: {
        invoice_number: issued?.invoice_number,
        client: issued?.clients?.name,
        total: issued?.total_amount,
        currency: issued?.currency,
      },
    });

    revalidatePath(invoicePath(invoiceId));
    revalidatePath("/app/placements/invoices");
  });
}

export async function voidInvoiceAction(invoiceId: string): Promise<ActionResult> {
  return runAction(SUBJECT, async () => {
    await requireWriter();
    const supabase = await createServerSupabaseClient();

    const { data: current } = await supabase
      .from("invoices")
      .select("invoice_number")
      .eq("id", invoiceId)
      .maybeSingle<{ invoice_number: string | null }>();

    const { error } = await supabase.rpc("void_invoice", { p_invoice_id: invoiceId });
    if (error) throw new Error(error.message);

    await recordActivity(supabase, {
      eventType: "invoice_voided",
      detail: { invoice_number: current?.invoice_number },
    });

    revalidatePath(invoicePath(invoiceId));
    revalidatePath("/app/placements/invoices");
  });
}

export async function deleteDraftAction(invoiceId: string): Promise<ActionResult> {
  return runAction(SUBJECT, async () => {
    await requireWriter();
    const supabase = await createServerSupabaseClient();
    await loadDraft(supabase, invoiceId);

    const { data: gone, error } = await supabase
      .from("invoices")
      .delete()
      .eq("id", invoiceId)
      .select("id");

    if (error) throw new Error(`Failed to delete the draft: ${error.message}`);
    if (!gone || gone.length === 0) {
      throw new Error("Nothing was deleted — the draft no longer exists.");
    }

    revalidatePath("/app/placements/invoices");
    redirect("/app/placements/invoices");
  });
}

/**
 * Send an issued invoice to the client (126, slice 2).
 *
 * The order is deliberate and is the 099 shape: decide, then send,
 * then record what happened — including when it failed. A send that
 * the provider refused still writes a `failed` delivery row, because
 * "we tried and it bounced" is a different fact from "nobody has ever
 * sent this", and only one of them is visible if failures are silent.
 *
 * The trail event is written ONLY on success: `invoice_sent` means the
 * invoice left the building, and a refused send did not.
 */
export async function sendInvoiceAction(
  invoiceId: string,
  formData: FormData
): Promise<ActionResult<{ status: string; detail?: string }>> {
  return runAction(SUBJECT, async () => {
    const auth = await requireWriter();
    const supabase = await createServerSupabaseClient();

    const toAddress = String(formData.get("to_address") ?? "").trim();
    const toLabel = String(formData.get("to_label") ?? "").trim() || null;

    const { data: invoice } = await supabase
      .from("invoices")
      .select(`${INVOICE_COLUMNS}, clients!invoices_client_id_fkey(name)`)
      .eq("id", invoiceId)
      .maybeSingle<InvoiceRow & { clients: { name: string } | null }>();
    if (!invoice) throw new Error("The invoice no longer exists. Reload the page.");

    // The identity comes from the FROZEN snapshot, not the live
    // template: an invoice sends as whoever issued it, even if the
    // template has been edited or deleted since.
    const structure = parseTemplateStructure(invoice.from_snapshot);
    const billTo = parseBillTo(invoice.bill_to);

    const { data: suppression } = await supabase
      .from("email_suppressions")
      .select("reason")
      .eq("address", toAddress.toLowerCase())
      .maybeSingle<{ reason: string }>();

    const verdict = evaluateInvoiceSendPolicy({
      status: invoice.status,
      fromEmail: structure.from_email || null,
      toAddress: toAddress || null,
      suppressed: suppression ?? null,
    });
    if (!verdict.ok) throw new Error(verdict.message);

    const { data: lineRows } = await supabase
      .from("invoice_lines")
      .select(INVOICE_LINE_COLUMNS)
      .eq("invoice_id", invoiceId)
      .order("sequence", { ascending: true })
      .returns<InvoiceLineRow[]>();

    const { data: org } = await supabase
      .from("organizations")
      .select("name")
      .eq("id", auth.organizationId)
      .maybeSingle<{ name: string }>();

    const input = {
      invoice,
      lines: lineRows ?? [],
      from: structure,
      billTo,
      orgName: org?.name ?? "",
    };
    const subject = invoiceEmailSubject(input);

    const result = await sendEmail({
      to: [toAddress],
      subject,
      html: invoiceEmailHtml(input),
      text: invoiceEmailText(input),
      from: structure.billing_name
        ? `${structure.billing_name} <${structure.from_email}>`
        : structure.from_email,
      replyTo: structure.reply_to || structure.from_email,
    });

    // Recorded either way — see the header.
    await supabase.from("invoice_deliveries").insert({
      organization_id: auth.organizationId,
      invoice_id: invoiceId,
      to_address: toAddress,
      to_label: toLabel,
      from_address: structure.from_email,
      subject,
      provider: "resend",
      provider_message_id: result.sent ? result.id : null,
      delivery_status: result.sent ? "sent" : "failed",
      failure_detail: result.sent ? null : `${result.reason}: ${result.detail}`.slice(0, 500),
      sent_by: auth.userId,
    });

    revalidatePath(invoicePath(invoiceId));

    if (!result.sent) {
      // The honest sentence, by reason. `not-configured` is a local /
      // unprovisioned environment and is not the sender's fault.
      throw new Error(
        result.reason === "not-configured"
          ? "Email is not configured in this environment, so nothing was sent. The attempt is on the record."
          : `The invoice could not be sent: ${result.detail.slice(0, 300)}`
      );
    }

    await recordActivity(supabase, {
      eventType: "invoice_sent",
      clientId: invoice.client_id,
      detail: {
        invoice_number: invoice.invoice_number,
        client: invoice.clients?.name,
        to: toAddress,
        total: invoice.total_amount,
        currency: invoice.currency,
      },
    });

    return { status: "sent" };
  });
}
