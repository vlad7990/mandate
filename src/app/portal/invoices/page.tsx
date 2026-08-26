import Link from "next/link";
import { notFound } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { requirePortalAccess } from "@/lib/auth/portal-access";
import { formatMoney } from "@/lib/fees/compute";
import { INVOICE_STATUS_LABELS, type InvoiceStatus } from "@/lib/invoices/types";

/**
 * What this company has been billed (128, gate D4(b)/D5/D6(a)).
 *
 * Read-only, and `client_admin` only — the portal chrome does not even
 * name this route for anyone else, and `portal_list_invoices` refuses
 * it in-database regardless, which is the half that matters since the
 * RPC is reachable from a browser console.
 *
 * Drafts never appear. Void invoices do: a client who saw an invoice is
 * owed the fact that it was cancelled.
 */

export const metadata = { title: "Invoices" };

type InvoiceListRow = {
  id: string;
  invoice_number: string | null;
  status: InvoiceStatus;
  issue_date: string | null;
  due_date: string | null;
  currency: string;
  total_amount: number;
};

export default async function PortalInvoicesPage() {
  const access = await requirePortalAccess();

  // The chrome hides the link, but a typed URL still arrives. A hiring
  // manager who guesses this path gets the same 404 as a page that was
  // never built, rather than an empty list that confirms it exists.
  if (access.role !== "client_admin") {
    notFound();
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("portal_list_invoices");
  if (error) {
    console.error("[portal] invoice list failed", error);
  }
  const invoices = (data ?? []) as InvoiceListRow[];

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <p className="font-mono-label text-mono-label uppercase tracking-widest text-outline">
          {access.clientName}
          {" // "}billing
        </p>
        <h1 className="font-h1 text-h1 tracking-tight text-on-surface">
          Invoices
        </h1>
        <p className="text-body-main text-on-surface-variant">
          Everything {access.organizationName} has invoiced{" "}
          {access.clientName}. Open one to read it in full or save a PDF.
        </p>
      </header>

      {invoices.length === 0 ? (
        <EmptyState clientName={access.clientName} />
      ) : (
        <ul className="divide-y divide-outline-variant border border-outline-variant bg-surface-container">
          {invoices.map((inv) => (
            <li key={inv.id}>
              <Link
                href={`/portal/invoices/${inv.id}`}
                className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-5 py-4 transition-colors hover:bg-surface-container-high"
              >
                <span className="font-mono-data font-medium text-on-surface">
                  {inv.invoice_number ?? "—"}
                </span>
                <span
                  className={
                    "font-mono-label text-mono-label uppercase tracking-wider " +
                    (inv.status === "void" ? "text-error" : "text-outline")
                  }
                >
                  {INVOICE_STATUS_LABELS[inv.status]}
                </span>
                {inv.issue_date && (
                  <span className="font-mono-label text-mono-label uppercase tracking-wider text-on-surface-variant">
                    Issued {formatDate(inv.issue_date)}
                  </span>
                )}
                <span className="ml-auto font-mono-data tabular-nums text-on-surface">
                  {formatMoney(inv.total_amount, inv.currency)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * The pre-invoice state, with sample rows so a first visit shows what
 * the screen becomes — labelled at the point of display, per the house
 * rule that non-real data always says so.
 */
function EmptyState({ clientName }: { clientName: string }) {
  return (
    <div className="space-y-3">
      <div className="border border-outline-variant bg-surface-container px-5 py-4">
        <p className="text-body-main text-on-surface-variant">
          Nothing has been invoiced to {clientName} yet. When your search
          team issues an invoice it appears here, and you can read or print
          it from this page.
        </p>
      </div>
      <div className="relative border border-dashed border-outline-variant">
        <p className="border-b border-dashed border-outline-variant px-5 py-2 font-mono-label text-mono-label uppercase tracking-widest text-tertiary">
          Sample data — how invoices will appear
        </p>
        <ul className="divide-y divide-outline-variant opacity-60">
          {[
            { number: "INV-2026-0007", status: "Issued", when: "12 Aug 2026", total: "£42,000" },
            { number: "INV-2026-0004", status: "Void", when: "3 Jul 2026", total: "£18,500" },
          ].map((s) => (
            <li
              key={s.number}
              className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-5 py-4"
            >
              <span className="font-mono-data font-medium text-on-surface">
                {s.number}
              </span>
              <span className="font-mono-label text-mono-label uppercase tracking-wider text-outline">
                {s.status}
              </span>
              <span className="font-mono-label text-mono-label uppercase tracking-wider text-on-surface-variant">
                Issued {s.when}
              </span>
              <span className="ml-auto font-mono-data tabular-nums text-on-surface">
                {s.total}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
