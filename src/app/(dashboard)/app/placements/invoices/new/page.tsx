import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { SetBreadcrumbs } from "@/components/dashboard/breadcrumbs";
import { PageShell, TerminalTitle } from "@/components/ui/page-shell";
import { NewInvoiceForm } from "./new-invoice-form";

export const metadata = { title: "New invoice" };

export default async function NewInvoicePage() {
  const supabase = await createServerSupabaseClient();

  const [{ data: clients }, { data: templates }] = await Promise.all([
    supabase
      .from("clients")
      .select("id, name")
      .order("name", { ascending: true })
      .returns<{ id: string; name: string }[]>(),
    supabase
      .from("invoice_templates")
      .select("id, name")
      .order("created_at", { ascending: true })
      .returns<{ id: string; name: string }[]>(),
  ]);

  return (
    <PageShell className="space-y-5">
      <SetBreadcrumbs
        crumbs={[
          { label: "Placements", href: "/app/placements" },
          { label: "Invoices", href: "/app/placements/invoices" },
          { label: "New" },
        ]}
      />

      <div>
        <TerminalTitle>NEW_INVOICE</TerminalTitle>
        <p className="mt-2 max-w-[68ch] text-body-s leading-relaxed text-on-surface-variant">
          Pick the client and the letterhead. The draft opens on the client&apos;s
          earned, un-invoiced fee lines — nothing is billed that the fee ledger
          has not already earned.
        </p>
      </div>

      {(templates ?? []).length === 0 ? (
        <div className="border border-outline-variant bg-surface-container-low px-[18px] py-4">
          <p className="font-mono-label text-mono-label uppercase tracking-widest text-primary">
            No template yet
          </p>
          <p className="mt-2 max-w-[68ch] text-body-s leading-relaxed text-on-surface-variant">
            An admin needs to create one under{" "}
            <Link
              href="/app/settings/invoice-templates"
              prefetch={false}
              className="text-primary hover:underline"
            >
              Settings → Invoice templates
            </Link>{" "}
            first — it carries the billing identity and the number sequence.
          </p>
        </div>
      ) : (
        <NewInvoiceForm clients={clients ?? []} templates={templates ?? []} />
      )}
    </PageShell>
  );
}
