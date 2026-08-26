"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { requireActionContext } from "@/lib/auth/access";
import { runAction } from "@/lib/actions/run";
import type { ActionResult } from "@/lib/actions/result";
import {
  DEFAULT_PAYMENT_TERMS_DAYS,
  validateLogoFile,
  type TemplateStructure,
} from "@/lib/invoices/types";

/** Sentence subject for a failure this file did not author. See `runAction`. */
const SUBJECT = "The invoice template change";

// Document furniture, not prose — the caps keep a paste from becoming
// the header of every invoice the org prints.
const NAME_MAX = 120;
const LINE_MAX = 200;
const TEXT_MAX = 1_000;
const PREFIX_MAX = 24;

async function requireAdmin() {
  // Template authoring rides `org:manage` (gate D.1) — the template
  // carries the org's billing identity, which is Members-tier, not
  // recruiter-tier. RLS backs this with is_org_admin().
  return requireActionContext("org:manage");
}

type TemplateFormInput = {
  name: string;
  structure: TemplateStructure;
};

function parseTemplateForm(formData: FormData): TemplateFormInput {
  const text = (key: string, max: number, label: string): string => {
    const value = String(formData.get(key) ?? "").trim();
    if (value.length > max) {
      throw new Error(`The ${label} is over ${max} characters — shorten it.`);
    }
    return value;
  };

  const name = text("name", NAME_MAX, "template name");
  if (!name) throw new Error("The template needs a name.");

  const addressLines = String(formData.get("address_lines") ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (addressLines.some((l) => l.length > LINE_MAX)) {
    throw new Error(`An address line is over ${LINE_MAX} characters — shorten it.`);
  }
  if (addressLines.length > 8) {
    throw new Error("The address is over eight lines — it is a letterhead, not a letter.");
  }

  const termsRaw = String(formData.get("default_payment_terms_days") ?? "").trim();
  const terms = termsRaw === "" ? DEFAULT_PAYMENT_TERMS_DAYS : Number(termsRaw);
  if (!Number.isInteger(terms) || terms < 0 || terms > 365) {
    throw new Error("Payment terms must be a whole number of days between 0 and 365.");
  }

  const prefix = text("numbering_prefix", PREFIX_MAX, "numbering prefix");

  return {
    name,
    structure: {
      billing_name: text("billing_name", NAME_MAX, "billing name"),
      address_lines: addressLines,
      company_number: text("company_number", LINE_MAX, "company number"),
      vat_number: text("vat_number", LINE_MAX, "VAT number"),
      payment_instructions: text("payment_instructions", TEXT_MAX, "payment instructions"),
      from_email: text("from_email", LINE_MAX, "billing email address"),
      reply_to: text("reply_to", LINE_MAX, "reply-to address"),
      header_text: text("header_text", TEXT_MAX, "header text"),
      footer_text: text("footer_text", TEXT_MAX, "footer text"),
      numbering_prefix: prefix || "INV-",
      default_payment_terms_days: terms,
    },
  };
}

/**
 * Store the logo under the org-first path the bucket's RLS trio keys
 * on. Named by template id so replacing a logo replaces the object
 * rather than orphaning one per upload.
 */
async function storeLogo(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  organizationId: string,
  templateId: string,
  logo: File
): Promise<string> {
  const verdict = validateLogoFile(logo);
  if (!verdict.ok) throw new Error(verdict.reason);

  const path = `${organizationId}/templates/${templateId}.${verdict.extension}`;
  const { error } = await supabase.storage
    .from("invoice-assets")
    .upload(path, logo, { contentType: logo.type, upsert: true });
  if (error) {
    throw new Error(`The logo could not be stored: ${error.message}`);
  }
  return path;
}

/** Best-effort removal — an orphaned object must not fail the save. */
async function removeLogo(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  path: string
): Promise<void> {
  const { error } = await supabase.storage.from("invoice-assets").remove([path]);
  if (error) {
    console.error(`[invoice-templates] could not remove logo ${path}:`, error.message);
  }
}

export async function createTemplateAction(formData: FormData): Promise<ActionResult> {
  return runAction(SUBJECT, async () => {
    const auth = await requireAdmin();
    const input = parseTemplateForm(formData);
    const supabase = await createServerSupabaseClient();

    const { data: born, error } = await supabase
      .from("invoice_templates")
      .insert({
        organization_id: auth.organizationId,
        created_by: auth.userId,
        name: input.name,
        structure: input.structure,
      })
      .select("id")
      .maybeSingle<{ id: string }>();

    if (error || !born) {
      throw new Error(
        error?.code === "23505"
          ? "A template with that name already exists — pick another."
          : `Failed to create the template: ${error?.message ?? "nothing was saved"}`
      );
    }

    // Create-then-attach (the call-audio pattern): an upload failure
    // keeps the saved template and says so, rather than losing the form.
    const logo = formData.get("logo");
    if (logo instanceof File && logo.size > 0) {
      const path = await storeLogo(supabase, auth.organizationId, born.id, logo);
      await supabase.from("invoice_templates").update({ logo_path: path }).eq("id", born.id);
    }

    revalidatePath("/app/settings/invoice-templates");
    redirect("/app/settings/invoice-templates");
  });
}

export async function updateTemplateAction(
  templateId: string,
  formData: FormData
): Promise<ActionResult> {
  return runAction(SUBJECT, async () => {
    const auth = await requireAdmin();
    const input = parseTemplateForm(formData);
    const supabase = await createServerSupabaseClient();

    const { data: current } = await supabase
      .from("invoice_templates")
      .select("id, logo_path")
      .eq("id", templateId)
      .maybeSingle<{ id: string; logo_path: string | null }>();
    if (!current) {
      throw new Error("The template no longer exists. Reload the page.");
    }

    let logoPath = current.logo_path;
    const logo = formData.get("logo");
    if (logo instanceof File && logo.size > 0) {
      logoPath = await storeLogo(supabase, auth.organizationId, templateId, logo);
      // A re-upload under a new extension leaves the old object behind.
      if (current.logo_path && current.logo_path !== logoPath) {
        await removeLogo(supabase, current.logo_path);
      }
    } else if (formData.get("remove_logo") === "1" && current.logo_path) {
      await removeLogo(supabase, current.logo_path);
      logoPath = null;
    }

    const { data: landed, error } = await supabase
      .from("invoice_templates")
      .update({
        name: input.name,
        structure: input.structure,
        logo_path: logoPath,
        updated_at: new Date().toISOString(),
      })
      .eq("id", templateId)
      .select("id");

    if (error) {
      throw new Error(
        error.code === "23505"
          ? "A template with that name already exists — pick another."
          : `Failed to update the template: ${error.message}`
      );
    }
    if (!landed || landed.length === 0) {
      throw new Error("Nothing was saved — the template no longer exists or is not yours to edit.");
    }

    revalidatePath("/app/settings/invoice-templates");
    redirect("/app/settings/invoice-templates");
  });
}

export async function deleteTemplateAction(templateId: string): Promise<ActionResult> {
  return runAction(SUBJECT, async () => {
    await requireAdmin();
    const supabase = await createServerSupabaseClient();

    // Deletion hygiene (the call-audio lesson): storage deletes are
    // API-only — SQL deletes on storage.objects are trigger-blocked —
    // so the logo goes first, under the session's own delete policy.
    // Issued invoices are untouched: their FK is SET NULL and the
    // billing identity lives in from_snapshot.
    const { data: current } = await supabase
      .from("invoice_templates")
      .select("logo_path")
      .eq("id", templateId)
      .maybeSingle<{ logo_path: string | null }>();
    if (current?.logo_path) {
      await removeLogo(supabase, current.logo_path);
    }

    const { data: gone, error } = await supabase
      .from("invoice_templates")
      .delete()
      .eq("id", templateId)
      .select("id");

    if (error) {
      throw new Error(`Failed to delete the template: ${error.message}`);
    }
    if (!gone || gone.length === 0) {
      throw new Error("Nothing was deleted — the template no longer exists or is not yours to delete.");
    }

    revalidatePath("/app/settings/invoice-templates");
  });
}
