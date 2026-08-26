import { SetBreadcrumbs } from "@/components/dashboard/breadcrumbs";
import { PageShell, TerminalTitle } from "@/components/ui/page-shell";
import { DEFAULT_PAYMENT_TERMS_DAYS } from "@/lib/invoices/types";
import { TemplateForm } from "../template-form";

export const metadata = { title: "New invoice template" };

export default function NewInvoiceTemplatePage() {
  return (
    <PageShell className="space-y-5">
      <SetBreadcrumbs
        crumbs={[
          { label: "Settings", href: "/app/settings" },
          { label: "Invoice templates", href: "/app/settings/invoice-templates" },
          { label: "New" },
        ]}
      />

      <div>
        <TerminalTitle>NEW_TEMPLATE</TerminalTitle>
        <p className="mt-2 max-w-[68ch] text-body-s leading-relaxed text-on-surface-variant">
          Everything here prints on the document. The billing identity is
          frozen into each invoice at the moment it issues, so editing a
          template later never rewrites an invoice a client already has.
        </p>
      </div>

      <TemplateForm
        initial={{
          id: null,
          name: "",
          billing_name: "",
          address_lines: "",
          company_number: "",
          vat_number: "",
          payment_instructions: "",
          header_text: "",
          footer_text: "",
          numbering_prefix: "INV-",
          default_payment_terms_days: DEFAULT_PAYMENT_TERMS_DAYS,
          numbering_next: 1,
          logo_url: null,
        }}
      />
    </PageShell>
  );
}
