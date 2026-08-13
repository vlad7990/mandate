import Link from "next/link";
import { notFound } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { SetBreadcrumbs } from "@/components/dashboard/breadcrumbs";
import { PageShell, QUIET_ACTION } from "@/components/ui/page-shell";
import { MastHead } from "@/components/ui/mast-head";
import { StatusChip } from "@/components/ui/status-chip";
import {
  CLIENT_DETAIL_COLUMNS,
  CLIENT_PROFILE_FIELDS,
  type ClientRow,
} from "@/lib/clients/types";
import { getAccess } from "@/lib/auth/access";
import { can } from "@/lib/auth/roles";
import { FEE_TERMS_COLUMNS, type FeeTermsRow } from "@/lib/fees/types";
import { FeeTermsPanel } from "./fee-terms-panel";

/**
 * The client record: who they are, what we know about them, and everything
 * we have run for them.
 *
 * The mandate list here is the answer to "what have we done for RBC" — a
 * question the product could not answer at all before migration 049, because
 * the only link between two mandates at the same bank was a matching string
 * in `company_name`.
 */

type MandateRow = {
  id: string;
  title: string;
  status: string | null;
  created_at: string;
  updated_at: string;
};

type SearchRow = {
  id: string;
  role_title: string;
  status: string | null;
  created_at: string;
};

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();

  const { data: client, error } = await supabase
    .from("clients")
    .select(CLIENT_DETAIL_COLUMNS)
    .eq("id", id)
    .maybeSingle<ClientRow>();

  // RLS scopes by org, so "not visible" and "does not exist" are the same
  // answer here on purpose — see the note in the dashboard not-found page.
  if (error || !client) notFound();

  const [{ data: mandates }, { data: searches }] = await Promise.all([
    supabase
      .from("projects")
      .select("id, title, status, created_at, updated_at")
      .eq("client_id", id)
      .order("updated_at", { ascending: false }),
    supabase
      .from("executive_searches")
      .select("id, role_title, status, created_at")
      .eq("client_id", id)
      .order("created_at", { ascending: false }),
  ]);

  const projectRows = (mandates ?? []) as MandateRow[];
  const searchRows = (searches ?? []) as SearchRow[];

  // The commercial agreement. RLS refuses the row without `fees:read`, so
  // a researcher gets null and the section is simply absent — there is no
  // "restricted" state to draw for terms, unlike a placement's fee, which
  // has an own-placement exception this table deliberately does not.
  const access = await getAccess();
  const seesFees = can(access?.role, "fees:read");

  const { data: feeTerms } = seesFees
    ? await supabase
        .from("fee_terms")
        .select(FEE_TERMS_COLUMNS)
        .eq("client_id", id)
        .maybeSingle<FeeTermsRow>()
    : { data: null };

  const knownFields = CLIENT_PROFILE_FIELDS.filter((f) => client[f.key]);

  return (
    <PageShell className="space-y-6">
      <SetBreadcrumbs
        crumbs={[{ label: "Clients", href: "/app/clients" }, { label: client.name }]}
      />

      <header className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start">
        <div className="min-w-0 flex-1">
          <h1 className="font-h1 text-[26px] uppercase leading-tight tracking-tight text-on-surface sm:text-h1">
            {client.name}
          </h1>
          <p className="mt-2 font-mono-label text-mono-label uppercase leading-[1.5] tracking-widest text-on-surface-variant tabular-nums">
            {client.domain ? `${client.domain} // ` : ""}
            {String(projectRows.length).padStart(2, "0")}{" "}
            {projectRows.length === 1 ? "mandate" : "mandates"}
            {searchRows.length > 0 && (
              <>
                {" // "}
                {String(searchRows.length).padStart(2, "0")} executive
              </>
            )}
          </p>
        </div>
        <Link href="/app/clients" prefetch={false} className={`${QUIET_ACTION} h-9`}>
          {"←"} Clients
        </Link>
      </header>

      <section className="space-y-3">
        <MastHead
          tone="primary"
          label="Profile"
          meta={
            client.company_context_refreshed_at
              ? `Researched ${formatDate(client.company_context_refreshed_at)}`
              : "Not researched yet"
          }
        />

        {knownFields.length === 0 ? (
          <p className="border border-outline-variant bg-surface-container-low px-4 py-8 text-center font-mono-label text-mono-label uppercase leading-[1.6] tracking-widest text-outline">
            {/*
              An executive search intake fills these in; a standard mandate
              does not ask for them. Saying which is more useful than an
              empty grid.
            */}
            Nothing recorded yet // the executive search intake fills this in
          </p>
        ) : (
          <dl className="grid grid-cols-1 gap-px border border-outline-variant bg-outline-variant sm:grid-cols-2">
            {knownFields.map((f) => (
              <div key={f.key} className="bg-surface-container-low px-4 py-3">
                <dt className="font-mono-label text-mono-label uppercase tracking-widest text-outline">
                  {f.label}
                </dt>
                <dd className="mt-1 text-body-main text-on-surface">
                  {client[f.key]}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      {seesFees && (
        <FeeTermsPanel
          clientId={client.id}
          terms={feeTerms ?? null}
          canWrite={can(access?.role, "mandates:write")}
        />
      )}

      <section className="space-y-3">
        <MastHead
          tone="neutral"
          label="Mandates"
          meta={`${String(projectRows.length).padStart(2, "0")} total`}
        />

        {projectRows.length === 0 ? (
          <p className="border border-outline-variant bg-surface-container-low px-4 py-8 text-center font-mono-label text-mono-label uppercase tracking-widest text-outline">
            No mandates for this client
          </p>
        ) : (
          <ul className="divide-y divide-outline-variant/40 border border-outline-variant bg-surface-container-low">
            {projectRows.map((m) => (
              <li key={m.id}>
                <Link
                  href={`/app/projects/${m.id}`}
                  prefetch={false}
                  className="flex flex-wrap items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-container-high focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary"
                >
                  <span className="min-w-0 flex-1 basis-[200px] truncate text-body-main text-on-surface">
                    {m.title}
                  </span>
                  {m.status && (
                    <StatusChip tone="neutral" intensity="soft">
                      {m.status}
                    </StatusChip>
                  )}
                  <span className="font-mono-data text-xs tabular-nums text-outline">
                    {formatDate(m.updated_at)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {searchRows.length > 0 && (
        <section className="space-y-3">
          <MastHead
            tone="tertiary"
            label="Executive searches"
            meta={`${String(searchRows.length).padStart(2, "0")} total`}
          />
          <ul className="divide-y divide-outline-variant/40 border border-outline-variant bg-surface-container-low">
            {searchRows.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/app/executive-intelligence/searches/${s.id}`}
                  prefetch={false}
                  className="flex flex-wrap items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-container-high focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary"
                >
                  <span className="min-w-0 flex-1 basis-[200px] truncate text-body-main text-on-surface">
                    {s.role_title}
                  </span>
                  <span className="font-mono-data text-xs tabular-nums text-outline">
                    {formatDate(s.created_at)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </PageShell>
  );
}
