import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { SetBreadcrumbs } from "@/components/dashboard/breadcrumbs";
import { ListPanel, PageShell, TerminalTitle } from "@/components/ui/page-shell";
import { IconPlus } from "@/components/icons";
import { StatusChip } from "@/components/ui/status-chip";
import {
  formatInvoiceNumber,
  INVOICE_TEMPLATE_COLUMNS,
  parseTemplateStructure,
  type InvoiceTemplateRow,
} from "@/lib/invoices/types";
import { deleteTemplateAction } from "./actions";
import { DeleteTemplateButton } from "./delete-template-button";

export const metadata = { title: "Invoice templates" };

/**
 * The template studio — admin territory (gate D.1), the Skills-pattern
 * surface. A template is where the org's billing identity lives:
 * `organizations` is name+slug, so the from-address on every invoice
 * comes from here, frozen into the document at issue.
 *
 * The route guard (`org:manage` in route-access.ts) decides whether
 * this renders at all; RLS's admin-only writes are what actually
 * protect the rows.
 */
export default async function InvoiceTemplatesPage() {
  const supabase = await createServerSupabaseClient();

  const { data: templateRows } = await supabase
    .from("invoice_templates")
    .select(INVOICE_TEMPLATE_COLUMNS)
    .order("created_at", { ascending: true })
    .returns<InvoiceTemplateRow[]>();

  const templates = templateRows ?? [];

  return (
    <PageShell className="space-y-5">
      <SetBreadcrumbs
        crumbs={[
          { label: "Settings", href: "/app/settings" },
          { label: "Invoice templates" },
        ]}
      />

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 space-y-2">
          <TerminalTitle>INVOICE_TEMPLATES</TerminalTitle>
          <p className="font-mono-label text-mono-label uppercase tracking-widest text-on-surface-variant tabular-nums">
            {String(templates.length).padStart(2, "0")} template
            {templates.length === 1 ? "" : "s"} · carries the billing identity every
            invoice prints
          </p>
        </div>
        <Link
          href="/app/settings/invoice-templates/new"
          prefetch={false}
          className="flex items-center gap-2 btn-notch bg-primary-container px-3 py-1.5 font-mono-label text-mono-label uppercase tracking-widest text-on-primary-container transition-[filter,transform] hover:brightness-110 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <IconPlus size={14} />
          New template
        </Link>
      </header>

      {templates.length === 0 ? (
        <div className="border border-outline-variant bg-surface-container-low px-[18px] py-8">
          <p className="font-mono-label text-mono-label uppercase tracking-widest text-outline">
            No templates yet
          </p>
          <p className="mt-2 max-w-[68ch] text-body-s leading-relaxed text-on-surface-variant">
            A template is the letterhead of every invoice this org issues: the
            billing name and address, company and VAT numbers, payment
            instructions, a logo, and the number sequence. Invoices cannot issue
            without one — create the first and the builder under Placements
            picks it up.
          </p>
        </div>
      ) : (
        <ListPanel>
          <div className="divide-y divide-outline-variant/40">
            {templates.map((template) => {
              const structure = parseTemplateStructure(template.structure);
              return (
                <div
                  key={template.id}
                  className="flex flex-wrap items-center gap-x-4 gap-y-2 px-[18px] py-3"
                >
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/app/settings/invoice-templates/${template.id}`}
                      prefetch={false}
                      className="block truncate text-body-s text-on-surface hover:text-primary hover:underline"
                    >
                      {template.name}
                    </Link>
                    <p className="mt-0.5 truncate font-mono-label text-[11px] uppercase tracking-[0.08em] text-outline">
                      {structure.billing_name || "No billing name — org name prints"}
                      {structure.vat_number ? ` · VAT ${structure.vat_number}` : ""}
                    </p>
                  </div>
                  {template.logo_path && <StatusChip tone="secondary">Logo</StatusChip>}
                  <span className="font-mono-label text-mono-label tabular-nums text-on-surface-variant">
                    next{" "}
                    {formatInvoiceNumber(structure.numbering_prefix, template.numbering_next)}
                  </span>
                  <DeleteTemplateButton
                    templateId={template.id}
                    templateName={template.name}
                    action={deleteTemplateAction}
                  />
                </div>
              );
            })}
          </div>
        </ListPanel>
      )}
    </PageShell>
  );
}
