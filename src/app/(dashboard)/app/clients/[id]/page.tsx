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
import { can, isExternalRole, parseRole } from "@/lib/auth/roles";
import { FEE_TERMS_COLUMNS, type FeeTermsRow } from "@/lib/fees/types";
import {
  CLIENT_CONTACT_COLUMNS,
  CLIENT_NOTE_COLUMNS,
  type ClientContactRow,
  type ClientNoteRow,
} from "@/lib/clients/contacts";
import { FeeTermsPanel } from "./fee-terms-panel";
import { ContactsPanel } from "./contacts-panel";
import { ClientNotesPanel } from "./client-notes-panel";
import {
  PortalPeoplePanel,
  type PanelExternal,
  type PanelInvitation,
  type PanelMandate,
} from "./portal-people-panel";
import { isSampleId } from "@/lib/sample";
import { SampleClientDetail } from "@/components/sample/sample-client-detail";

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

  // The `sample-` prefix is the whole routing contract — see `isSampleId`.
  // A uuid has no letters before its first hyphen, so a real client id can
  // never land here and a crafted `sample-` id never reaches a query.
  if (isSampleId(id)) {
    return <SampleClientDetail id={id} />;
  }

  const supabase = await createServerSupabaseClient();

  const { data: client, error } = await supabase
    .from("clients")
    .select(CLIENT_DETAIL_COLUMNS)
    .eq("id", id)
    .maybeSingle<ClientRow>();

  // RLS scopes by org, so "not visible" and "does not exist" are the same
  // answer here on purpose — see the note in the dashboard not-found page.
  if (error || !client) notFound();

  const [{ data: mandates }, { data: searches }, { data: contacts }, { data: notes }] =
    await Promise.all([
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
      supabase
        .from("client_contacts")
        .select(CLIENT_CONTACT_COLUMNS)
        .eq("client_id", id)
        .order("is_primary", { ascending: false })
        .order("full_name"),
      // Pinned first, then newest — the same order 020 gives candidate
      // notes. RLS drops the commercial rows for a reader without
      // `fees:read`, so this query needs no visibility clause of its own
      // and the panel has no restricted state to draw.
      supabase
        .from("client_notes")
        .select(CLIENT_NOTE_COLUMNS)
        .eq("client_id", id)
        .order("is_pinned", { ascending: false })
        .order("created_at", { ascending: false }),
    ]);

  const projectRows = (mandates ?? []) as MandateRow[];
  const searchRows = (searches ?? []) as SearchRow[];
  const contactRows = (contacts ?? []) as ClientContactRow[];
  const noteRows = (notes ?? []) as ClientNoteRow[];

  // The commercial agreement. RLS refuses the row without `fees:read`, so
  // a researcher gets null and the section is simply absent — there is no
  // "restricted" state to draw for terms, unlike a placement's fee, which
  // has an own-placement exception this table deliberately does not.
  const access = await getAccess();
  const seesFees = can(access?.role, "fees:read");

  // Contacts and notes take the mandate tier, the same one 049 gave the
  // client record itself: holding the client relationship is a recruiter
  // act. A researcher reads both and writes neither. RLS in 054 is what
  // enforces that; this decides whether the buttons are drawn.
  const canWriteClient = can(access?.role, "mandates:write");

  const { data: feeTerms } = seesFees
    ? await supabase
        .from("fee_terms")
        .select(FEE_TERMS_COLUMNS)
        .eq("client_id", id)
        .maybeSingle<FeeTermsRow>()
    : { data: null };

  // The portal relationship (067–069). The externals roster and the share
  // and grant sets are org-readable; the invitations table is RLS'd to
  // clients:share, so the query is only made when the reader could see
  // rows at all. Queried by ids rather than embeds — the post-060 rule.
  const canShare = can(access?.role, "clients:share");
  const [externalsQ, invitationsQ, sharesQ, grantsQ, orgQ] = await Promise.all([
    supabase
      .from("users")
      .select("id, full_name, email, role, status")
      .eq("client_id", id)
      .order("created_at", { ascending: true }),
    canShare
      ? supabase
          .from("invitations")
          .select("id, email, full_name, role, invited_by_label, expires_at")
          .eq("client_id", id)
          .is("accepted_at", null)
          .is("revoked_at", null)
          .gt("expires_at", new Date().toISOString())
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: null }),
    supabase.from("mandate_shares").select("project_id").eq("client_id", id),
    supabase.from("mandate_grants").select("project_id, user_id").eq("client_id", id),
    supabase.from("organizations").select("name").limit(1).maybeSingle<{ name: string }>(),
  ]);

  const sharedIds = new Set(
    ((sharesQ.data ?? []) as Array<{ project_id: string }>).map((s) => s.project_id)
  );
  const grantRows = (grantsQ.data ?? []) as Array<{ project_id: string; user_id: string }>;

  const panelMandates: PanelMandate[] = projectRows.map((p) => ({
    id: p.id,
    title: p.title,
    shared: sharedIds.has(p.id),
  }));

  const panelExternals: PanelExternal[] = (
    (externalsQ.data ?? []) as Array<{
      id: string;
      full_name: string | null;
      email: string;
      role: string;
      status: string;
    }>
  ).flatMap((u) => {
    const role = parseRole(u.role);
    if (!isExternalRole(role)) return [];
    return [
      {
        id: u.id,
        name: u.full_name?.trim() || u.email,
        email: u.email,
        role,
        status: u.status,
        grantedProjectIds: grantRows
          .filter((g) => g.user_id === u.id)
          .map((g) => g.project_id),
      },
    ];
  });

  const panelInvitations: PanelInvitation[] = (
    (invitationsQ.data ?? []) as Array<{
      id: string;
      email: string;
      full_name: string;
      role: string;
      invited_by_label: string;
      expires_at: string;
    }>
  ).flatMap((inv) => {
    const role = parseRole(inv.role);
    if (!isExternalRole(role)) return [];
    return [
      {
        id: inv.id,
        email: inv.email,
        fullName: inv.full_name,
        role,
        invitedByLabel: inv.invited_by_label,
        expiresAt: inv.expires_at,
      },
    ];
  });

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

      <ContactsPanel
        clientId={client.id}
        contacts={contactRows}
        canWrite={canWriteClient}
      />

      <PortalPeoplePanel
        clientId={client.id}
        clientName={client.name}
        organizationName={orgQ.data?.name ?? "your search firm"}
        mandates={panelMandates}
        externals={panelExternals}
        invitations={panelInvitations}
        canShare={canShare}
      />

      {seesFees && (
        <FeeTermsPanel
          clientId={client.id}
          terms={feeTerms ?? null}
          canWrite={canWriteClient}
        />
      )}

      <ClientNotesPanel
        clientId={client.id}
        notes={noteRows}
        // Every contact, archived included. The panel filters the *picker*
        // itself — a note cannot be filed against somebody who has left, but
        // one filed before they did must still say who it was with. Passing
        // the filtered list here instead turned every historical note at an
        // archived contact into "a former contact", which throws away a name
        // the row still holds.
        contacts={contactRows}
        canWrite={canWriteClient}
        canWriteCommercial={seesFees}
      />

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
