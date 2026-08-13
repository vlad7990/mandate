import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { SetBreadcrumbs } from "@/components/dashboard/breadcrumbs";
import { ListPanel, PageHeader, PageShell } from "@/components/ui/page-shell";
import { CLIENT_LIST_COLUMNS } from "@/lib/clients/types";

/**
 * The client list.
 *
 * Deliberately not paginated yet, unlike Mandates and Candidates: a client
 * count is bounded by how many companies an agency works for, which is two
 * orders of magnitude below its candidate count. The moment that stops being
 * true this wants `parseListParams` like the others.
 */

type ClientListRow = {
  id: string;
  name: string;
  domain: string | null;
  industry: string | null;
  business_model: string | null;
  geographic_footprint: string | null;
  company_context_refreshed_at: string | null;
  created_at: string;
  updated_at: string;
};

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default async function ClientsPage() {
  const supabase = await createServerSupabaseClient();

  const [{ data, error }, { data: counts }] = await Promise.all([
    supabase.from("clients").select(CLIENT_LIST_COLUMNS).order("name"),
    // Mandate counts per client. One grouped read rather than a count per
    // row — the list is small, but N+1 on a list page is how it stops being.
    supabase.from("projects").select("client_id").not("client_id", "is", null),
  ]);

  const clients = (data ?? []) as ClientListRow[];

  const mandatesByClient = new Map<string, number>();
  for (const row of (counts ?? []) as Array<{ client_id: string | null }>) {
    if (!row.client_id) continue;
    mandatesByClient.set(row.client_id, (mandatesByClient.get(row.client_id) ?? 0) + 1);
  }

  return (
    <PageShell className="space-y-5">
      <SetBreadcrumbs crumbs={[{ label: "Clients" }]} />

      <PageHeader
        title="Clients"
        subtitle={
          clients.length === 0
            ? "No clients yet"
            : `${String(clients.length).padStart(2, "0")} ${
                clients.length === 1 ? "client" : "clients"
              } // opened from mandates and executive searches`
        }
      />

      {error && (
        <div
          role="alert"
          className="border border-error/60 bg-error/10 px-4 py-3 text-body-main text-error"
        >
          Could not load clients: {error.message}
        </div>
      )}

      <ListPanel>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse sm:min-w-[720px]">
            <caption className="sr-only">
              Clients with industry, footprint and mandate count.
            </caption>
            <thead>
              <tr className="border-b border-outline-variant">
                {["Client", "Industry", "Footprint", "Mandates", "Researched"].map(
                  (h, i) => (
                    <th
                      key={h}
                      scope="col"
                      className={`px-4 py-2.5 font-mono-label text-mono-label uppercase tracking-widest text-outline ${
                        i >= 3 ? "text-right" : "text-left"
                      }`}
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => (
                <tr
                  key={c.id}
                  className="border-b border-outline-variant/40 last:border-0"
                >
                  <td className="w-[34%] max-w-0 px-4 py-3">
                    <Link
                      href={`/app/clients/${c.id}`}
                      prefetch={false}
                      className="block focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                    >
                      <span className="block truncate text-[13px] font-medium text-on-surface">
                        {c.name}
                      </span>
                      <span className="block truncate font-mono-data text-xs text-outline">
                        {c.domain ?? "—"}
                      </span>
                    </Link>
                  </td>
                  <td className="px-4 py-3 font-mono-label text-mono-label uppercase tracking-wider text-on-surface-variant">
                    {c.industry ?? "—"}
                  </td>
                  <td className="px-4 py-3 font-mono-label text-mono-label uppercase tracking-wider text-on-surface-variant">
                    {c.geographic_footprint ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-right font-mono-data text-[13px] tabular-nums text-on-surface">
                    {String(mandatesByClient.get(c.id) ?? 0).padStart(2, "0")}
                  </td>
                  <td className="px-4 py-3 text-right font-mono-data text-[13px] tabular-nums text-on-surface-variant">
                    {formatDate(c.company_context_refreshed_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {clients.length === 0 && !error && (
          <p className="px-4 py-10 text-center font-mono-label text-mono-label uppercase leading-[1.6] tracking-widest text-outline">
            {/*
              Clients are created as a side effect of opening a mandate, not
              by a button here — so the empty state points at the thing that
              makes one rather than offering an action that does not exist.
            */}
            No clients yet // a client is created when a mandate resolves its
            company
          </p>
        )}
      </ListPanel>
    </PageShell>
  );
}
