import Link from "next/link";
import { notFound } from "next/navigation";
import { SetBreadcrumbs } from "@/components/dashboard/breadcrumbs";
import { SampleBanner } from "@/components/sample/sample-banner";
import { PageShell, QUIET_ACTION } from "@/components/ui/page-shell";
import { MastHead } from "@/components/ui/mast-head";
import { StatusChip } from "@/components/ui/status-chip";
import { Panel, PanelMeta, PANEL_BODY } from "@/components/projects/panel";
import { getAccess } from "@/lib/auth/access";
import { can } from "@/lib/auth/roles";
import { CONTACT_TYPE_LABELS } from "@/lib/clients/contacts";
import {
  sampleClient,
  sampleClientLiveMandates,
  sampleClientMandateCount,
  type SampleClient,
  type SampleClientNote,
  type SampleContact,
} from "@/lib/sample";

/**
 * The sample client record.
 *
 * Reached only via a `sample-` id, so it never queries and never collides
 * with a real client. It exists because the client list's rows have to go
 * somewhere: a demo you cannot click through teaches the shape of one
 * screen rather than how the product works — the same argument
 * `sample-project-detail.tsx` makes.
 *
 * ## Two rules carried from elsewhere
 *
 * **Read-only, and no controls that cannot work.** No "Add contact", no
 * edit, no delete. These are not the reader's rows, and a button that
 * refuses is worse than the empty state it replaced — the call made for the
 * skills studio in `5107767` and applied here unchanged.
 *
 * **`fees:read` still gates the money.** The commercial terms panel and the
 * `commercial` notes are hidden from a researcher or a viewer here exactly
 * as RLS hides them on a real client. A sample that showed everyone the
 * rate card would teach the opposite of what the product does, which is
 * worse than teaching nothing — this is the one screen whose job is
 * teaching.
 */

function daysAgoLabel(days: number): string {
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  return months === 1 ? "1 month ago" : `${months} months ago`;
}

/** The profile grid, in the order `CLIENT_PROFILE_FIELDS` gives the real page. */
function profileFields(
  client: SampleClient
): ReadonlyArray<{ label: string; value: string }> {
  return [
    { label: "Industry", value: client.industry },
    { label: "Business model", value: client.businessModel },
    { label: "Revenue", value: client.revenueRange },
    { label: "Headcount", value: client.employeeCount },
    { label: "Funding stage", value: client.fundingStage },
    { label: "Ownership", value: client.ownershipStructure },
    { label: "Footprint", value: client.geographicFootprint },
    { label: "Regulatory", value: client.regulatoryEnvironment },
  ];
}

export async function SampleClientDetail({ id }: { id: string }) {
  const client = sampleClient(id);
  if (!client) notFound();

  const access = await getAccess();
  const seesFees = can(access?.role, "fees:read");

  const live = sampleClientLiveMandates(client);
  const mandateCount = sampleClientMandateCount(client);

  // Mirrors what RLS does on `client_notes`: a reader without `fees:read`
  // is not sent the commercial rows at all, and — per §5c — is not told
  // they exist either. The count says "02 notes", never "03 // 1 restricted".
  const notes = client.notes.filter(
    (n) => seesFees || n.visibility === "org"
  );

  return (
    <PageShell className="space-y-6">
      <SetBreadcrumbs
        crumbs={[{ label: "Clients", href: "/app/clients" }, { label: client.name }]}
      />

      <SampleBanner scope="client" />

      <header className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start">
        <div className="min-w-0 flex-1">
          <h1 className="font-h1 text-[26px] uppercase leading-tight tracking-tight text-on-surface sm:text-h1">
            {client.name}
          </h1>
          <p className="mt-2 font-mono-label text-mono-label uppercase leading-[1.5] tracking-widest text-on-surface-variant tabular-nums">
            {client.domain}
            {" // "}
            {String(mandateCount).padStart(2, "0")}{" "}
            {mandateCount === 1 ? "mandate" : "mandates"}
            {" // sample data"}
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
            client.researchedDaysAgo === null
              ? "Not researched yet"
              : `Researched ${daysAgoLabel(client.researchedDaysAgo)}`
          }
        />

        {client.researchedDaysAgo === null ? (
          // Varela is deliberately the un-researched one. A demo in which
          // every record is complete teaches that the product arrives full,
          // and the first thing a new client actually looks like is this.
          <p className="border border-outline-variant bg-surface-container-low px-4 py-8 text-center font-mono-label text-mono-label uppercase leading-[1.6] tracking-widest text-outline">
            Not researched yet // taken from the intake call
          </p>
        ) : (
          <dl className="grid grid-cols-1 gap-px border border-outline-variant bg-outline-variant sm:grid-cols-2">
            {profileFields(client).map((f) => (
              <div key={f.label} className="bg-surface-container-low px-4 py-3">
                <dt className="font-mono-label text-mono-label uppercase tracking-widest text-outline">
                  {f.label}
                </dt>
                <dd className="mt-1 text-body-main text-on-surface">{f.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      <Panel
        title="Contacts"
        meta={
          <PanelMeta>
            {String(client.contacts.length).padStart(2, "0")}{" "}
            {client.contacts.length === 1 ? "person" : "people"}
          </PanelMeta>
        }
      >
        <div className={PANEL_BODY}>
          <ul className="divide-y divide-outline-variant/40 border border-outline-variant">
            {client.contacts.map((c) => (
              <li key={c.id} className="px-3 py-3">
                <ContactRow contact={c} />
              </li>
            ))}
          </ul>
        </div>
      </Panel>

      {seesFees && client.feeTerms && (
        <Panel
          title="Commercial terms"
          meta={<PanelMeta>{client.feeTerms.summary}</PanelMeta>}
        >
          <div className={`${PANEL_BODY} space-y-3`}>
            <dl className="grid grid-cols-1 gap-px border border-outline-variant bg-outline-variant sm:grid-cols-3">
              <Cell label="Model" value={FEE_MODEL_LABEL[client.feeTerms.model]} />
              <Cell label="Applied to" value={client.feeTerms.basis} />
              <Cell
                label="Guarantee"
                value={`${client.feeTerms.guaranteeDays} days`}
              />
            </dl>

            {client.feeTerms.instalments.length > 0 && (
              <ul className="divide-y divide-outline-variant/40 border border-outline-variant">
                {client.feeTerms.instalments.map((i) => (
                  <li
                    key={i.label}
                    className="flex items-center justify-between gap-3 px-3 py-2.5"
                  >
                    <span className="font-mono-label text-mono-label uppercase tracking-wider text-on-surface-variant">
                      {i.label}
                    </span>
                    <span className="font-mono-data text-[13px] tabular-nums text-on-surface">
                      {i.share}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {client.feeTerms.note && (
              <p className="text-body-main leading-relaxed text-on-surface-variant">
                {client.feeTerms.note}
              </p>
            )}
          </div>
        </Panel>
      )}

      <Panel
        title="Notes"
        meta={
          <PanelMeta>
            {notes.length === 0
              ? "None yet"
              : `${String(notes.length).padStart(2, "0")} ${
                  notes.length === 1 ? "note" : "notes"
                }`}
          </PanelMeta>
        }
      >
        <div className={`${PANEL_BODY} space-y-2`}>
          {notes.map((n) => (
            <NoteRow key={n.id} note={n} />
          ))}
        </div>
      </Panel>

      <section className="space-y-3">
        <MastHead
          tone="neutral"
          label="Mandates"
          meta={`${String(mandateCount).padStart(2, "0")} total`}
        />

        <ul className="divide-y divide-outline-variant/40 border border-outline-variant bg-surface-container-low">
          {live.map((m) => (
            <li key={m.id}>
              <Link
                href={`/app/projects/${m.id}`}
                prefetch={false}
                className="flex flex-wrap items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-container-high focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary"
              >
                <span className="min-w-0 flex-1 basis-[200px] truncate text-body-main text-on-surface">
                  {m.title}
                </span>
                <StatusChip tone="primary" intensity="soft">
                  {m.stage}
                </StatusChip>
                <span className="font-mono-data text-xs tabular-nums text-outline">
                  Day {m.dayOfSearch} of {m.searchLengthDays}
                </span>
              </Link>
            </li>
          ))}

          {/*
            Closed searches are rows here and not in `SAMPLE_MANDATES`,
            which holds only what is in flight. They are what makes the
            mandate count vary between clients, and they are the answer to
            the question this page exists for — see the header comment on
            the real route.
          */}
          {client.closedMandates.map((m) => (
            <li
              key={m.title}
              className="flex flex-wrap items-center gap-3 px-4 py-3 text-on-surface-variant"
            >
              <span className="min-w-0 flex-1 basis-[200px] truncate text-body-main">
                {m.title}
              </span>
              <StatusChip tone="neutral" intensity="soft">
                {m.outcome}
              </StatusChip>
              <span className="font-mono-data text-xs tabular-nums text-outline">
                Closed {daysAgoLabel(m.closedDaysAgo)}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </PageShell>
  );
}

const FEE_MODEL_LABEL: Record<"contingent" | "retained" | "fixed", string> = {
  contingent: "Contingent",
  retained: "Retained",
  fixed: "Fixed fee",
};

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface-container-low px-4 py-3">
      <dt className="font-mono-label text-mono-label uppercase tracking-widest text-outline">
        {label}
      </dt>
      <dd className="mt-1 text-body-main text-on-surface">{value}</dd>
    </div>
  );
}

/**
 * Deliberately the same three lines as the real `ContactRow`, minus the
 * Edit / Archive / Delete buttons: name and chips, title, then a mono line
 * of type // email // phone.
 *
 * An earlier version put email and phone in a right-hand column, which
 * looked tidier and taught the wrong screen — the point of a sample is that
 * moving to the real one is not a jump.
 */
function ContactRow({ contact }: { contact: SampleContact }) {
  return (
    // `flex-wrap` with a `basis`, for the reason §4 of the handoff gives:
    // `flex-1` shrinks but does not wrap, which crushes the name instead of
    // breaking the row.
    <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
      <div className="min-w-0 flex-1 basis-[220px]">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-body-main text-on-surface">
            {contact.fullName}
          </span>
          {contact.isPrimary && (
            <StatusChip tone="primary" intensity="soft">
              Primary
            </StatusChip>
          )}
        </div>

        <p className="mt-0.5 truncate text-body-s text-on-surface-variant">
          {contact.title}
        </p>

        <p className="mt-1 font-mono-label text-[11px] uppercase tracking-[0.08em] text-outline">
          {CONTACT_TYPE_LABELS[contact.contactType]}
          {` // ${contact.email}`}
          {contact.phone && ` // ${contact.phone}`}
        </p>
      </div>
    </div>
  );
}

const NOTE_TYPE_LABEL: Record<SampleClientNote["noteType"], string> = {
  general: "Note",
  call: "Call",
  meeting: "Meeting",
  email: "Email",
};

function NoteRow({ note }: { note: SampleClientNote }) {
  return (
    <article
      className={`border p-3 ${
        note.isPinned
          ? "border-primary/40 bg-primary/[0.04]"
          : "border-outline-variant bg-surface-container-low"
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <StatusChip tone="neutral" intensity="soft">
          {NOTE_TYPE_LABEL[note.noteType]}
        </StatusChip>
        {note.visibility === "commercial" && (
          <StatusChip tone="tertiary" intensity="soft">
            Commercial
          </StatusChip>
        )}
        {note.isPinned && (
          <StatusChip tone="primary" intensity="soft">
            Pinned
          </StatusChip>
        )}
        <span className="ml-auto font-mono-label text-[11px] uppercase tracking-[0.08em] tabular-nums text-outline">
          {note.author}
          {" // "}
          {daysAgoLabel(note.daysAgo)}
        </span>
      </div>

      <p className="mt-2 text-body-main leading-relaxed text-on-surface">
        {note.body}
      </p>

      {note.contactName && (
        <p className="mt-1.5 font-mono-label text-[11px] uppercase tracking-[0.08em] text-outline">
          With {note.contactName}
        </p>
      )}
    </article>
  );
}
