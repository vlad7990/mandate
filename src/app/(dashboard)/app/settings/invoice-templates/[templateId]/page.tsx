import { notFound } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { isSampleId } from "@/lib/sample";
import { SampleNotBuilt } from "@/components/sample/sample-not-built";
import { SetBreadcrumbs } from "@/components/dashboard/breadcrumbs";
import { PageShell, TerminalTitle } from "@/components/ui/page-shell";
import {
  INVOICE_TEMPLATE_COLUMNS,
  parseTemplateStructure,
  type InvoiceTemplateRow,
} from "@/lib/invoices/types";
import { TemplateForm } from "../template-form";

export const metadata = { title: "Edit invoice template" };

type Params = Promise<{ templateId: string }>;

export default async function EditInvoiceTemplatePage({
  params,
}: {
  params: Params;
}) {
  const { templateId } = await params;

  // Sample ids never touch the database (the routes.test.ts rule).
  if (isSampleId(templateId)) {
    return (
      <SampleNotBuilt
        title="Invoice template"
        context="Settings // Invoice templates"
        backHref="/app/settings/invoice-templates"
        backLabel="Invoice templates"
        scope="invoices"
      />
    );
  }

  const supabase = await createServerSupabaseClient();

  const { data: template } = await supabase
    .from("invoice_templates")
    .select(INVOICE_TEMPLATE_COLUMNS)
    .eq("id", templateId)
    .maybeSingle<InvoiceTemplateRow>();

  if (!template) notFound();

  const structure = parseTemplateStructure(template.structure);

  let logoUrl: string | null = null;
  if (template.logo_path) {
    const { data: signed } = await supabase.storage
      .from("invoice-assets")
      .createSignedUrl(template.logo_path, 3600);
    logoUrl = signed?.signedUrl ?? null;
  }

  return (
    <PageShell className="space-y-5">
      <SetBreadcrumbs
        crumbs={[
          { label: "Settings", href: "/app/settings" },
          { label: "Invoice templates", href: "/app/settings/invoice-templates" },
          { label: template.name },
        ]}
      />

      <div>
        <TerminalTitle>EDIT_TEMPLATE</TerminalTitle>
        <p className="mt-2 max-w-[68ch] text-body-s leading-relaxed text-on-surface-variant">
          Changes apply to future issues only — every already-issued invoice
          froze this identity the day it went out.
        </p>
      </div>

      <TemplateForm
        initial={{
          id: template.id,
          name: template.name,
          billing_name: structure.billing_name,
          address_lines: structure.address_lines.join("\n"),
          company_number: structure.company_number,
          vat_number: structure.vat_number,
          payment_instructions: structure.payment_instructions,
          header_text: structure.header_text,
          footer_text: structure.footer_text,
          numbering_prefix: structure.numbering_prefix,
          default_payment_terms_days: structure.default_payment_terms_days,
          numbering_next: template.numbering_next,
          logo_url: logoUrl,
        }}
      />
    </PageShell>
  );
}
