"use client";

/**
 * The people we deal with at a client.
 *
 * The answer to a question the product could not answer at all before
 * migration 054: who signed the offer off, and who is on the other end of
 * the portal link we sent. Both were free text living somewhere else.
 *
 * A contact is scoped to one client and does not fold across clients the
 * way the Network page folds candidates — see decision 1 in 054's header.
 * A hiring manager who moves banks is a new row at the new bank.
 */

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  PANEL_BODY,
  PANEL_BUTTON,
  PANEL_BUTTON_QUIET,
  Panel,
  PanelMeta,
} from "@/components/projects/panel";
import { StatusChip } from "@/components/ui/status-chip";
import {
  CONTACT_TYPES,
  CONTACT_TYPE_LABELS,
  sortContacts,
  type ClientContactRow,
  type ContactType,
} from "@/lib/clients/contacts";
import {
  createContactAction,
  deleteContactAction,
  setContactArchivedAction,
  updateContactAction,
} from "./contacts-actions";
import { unwrap, type ActionResult } from "@/lib/actions/result";

const FIELD =
  "w-full min-w-0 border border-outline-variant bg-surface px-3 py-2 text-body-s text-on-surface focus:border-primary focus:outline-none";

const LABEL =
  "block font-mono-label text-[11px] uppercase tracking-[0.08em] text-outline";

export function ContactsPanel({
  clientId,
  contacts,
  canWrite,
}: {
  clientId: string;
  contacts: ClientContactRow[];
  canWrite: boolean;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();

  const sorted = useMemo(() => sortContacts(contacts), [contacts]);
  const archivedCount = sorted.filter((c) => c.is_archived).length;
  const visible = showArchived ? sorted : sorted.filter((c) => !c.is_archived);
  const activeCount = sorted.length - archivedCount;

  function run(action: (fd: FormData) => Promise<ActionResult>, fd: FormData, ok: string) {
    start(async () => {
      try {
        unwrap(await action(fd));
        setEditing(null);
        router.refresh();
        toast.success(ok);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not save the contact");
      }
    });
  }

  return (
    <Panel
      title="Contacts"
      meta={
        <PanelMeta>
          {activeCount === 0
            ? "None on file"
            : `${String(activeCount).padStart(2, "0")} ${activeCount === 1 ? "person" : "people"}`}
          {archivedCount > 0 && ` // ${archivedCount} archived`}
        </PanelMeta>
      }
      action={
        <>
          {archivedCount > 0 && (
            <button
              type="button"
              className={PANEL_BUTTON_QUIET}
              onClick={() => setShowArchived((v) => !v)}
            >
              {showArchived ? "Hide archived" : "Show archived"}
            </button>
          )}
          {canWrite && editing !== "new" && (
            <button
              type="button"
              className={PANEL_BUTTON}
              onClick={() => setEditing("new")}
            >
              Add contact
            </button>
          )}
        </>
      }
    >
      <div className={`${PANEL_BODY} space-y-4`}>
        {editing === "new" && (
          <ContactForm
            clientId={clientId}
            contact={null}
            pending={pending}
            onCancel={() => setEditing(null)}
            onSubmit={(fd) => run(createContactAction, fd, "Contact added")}
          />
        )}

        {visible.length === 0 && editing !== "new" && (
          <p className="border border-outline-variant bg-surface-container-low px-4 py-8 text-center font-mono-label text-mono-label uppercase leading-[1.6] tracking-widest text-outline">
            {/*
              Names the two things a contact is actually for, because
              "no contacts" alone does not tell anyone why they would add one.
            */}
            No contacts yet // who signs off, who gets the portal link
          </p>
        )}

        {visible.length > 0 && (
          <ul className="divide-y divide-outline-variant/40 border border-outline-variant">
            {visible.map((contact) =>
              editing === contact.id ? (
                <li key={contact.id} className="p-3">
                  <ContactForm
                    clientId={clientId}
                    contact={contact}
                    pending={pending}
                    onCancel={() => setEditing(null)}
                    onSubmit={(fd) => run(updateContactAction, fd, "Contact saved")}
                  />
                </li>
              ) : (
                <li key={contact.id} className="px-3 py-3">
                  <ContactRow
                    contact={contact}
                    canWrite={canWrite}
                    pending={pending}
                    onEdit={() => setEditing(contact.id)}
                    onArchive={() => {
                      const fd = new FormData();
                      fd.set("contactId", contact.id);
                      fd.set("clientId", clientId);
                      fd.set("archived", contact.is_archived ? "false" : "true");
                      run(
                        setContactArchivedAction,
                        fd,
                        contact.is_archived ? "Contact restored" : "Contact archived"
                      );
                    }}
                    onDelete={() => {
                      const fd = new FormData();
                      fd.set("contactId", contact.id);
                      fd.set("clientId", clientId);
                      run(deleteContactAction, fd, "Contact removed");
                    }}
                  />
                </li>
              )
            )}
          </ul>
        )}
      </div>
    </Panel>
  );
}

function ContactRow({
  contact,
  canWrite,
  pending,
  onEdit,
  onArchive,
  onDelete,
}: {
  contact: ClientContactRow;
  canWrite: boolean;
  pending: boolean;
  onEdit: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  return (
    // `flex-wrap` with a `basis` on the identity block: `flex-1` shrinks but
    // does not wrap, which is the recurring cause behind five of the nine
    // layout bugs in §4 of the handoff. The basis declares the width below
    // which wrapping beats crushing the name.
    <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
      <div className={`min-w-0 flex-1 basis-[220px] ${contact.is_archived ? "opacity-55" : ""}`}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-body-main text-on-surface">{contact.full_name}</span>
          {contact.is_primary && (
            <StatusChip tone="primary" intensity="soft">
              Primary
            </StatusChip>
          )}
          {contact.is_archived && (
            <StatusChip tone="neutral" intensity="soft">
              Archived
            </StatusChip>
          )}
        </div>

        {contact.title && (
          <p className="mt-0.5 truncate text-body-s text-on-surface-variant">{contact.title}</p>
        )}

        <p className="mt-1 font-mono-label text-[11px] uppercase tracking-[0.08em] text-outline">
          {CONTACT_TYPE_LABELS[contact.contact_type]}
          {contact.email && ` // ${contact.email}`}
          {contact.phone && ` // ${contact.phone}`}
        </p>
      </div>

      {canWrite && (
        <div className="flex flex-wrap items-center gap-2">
          {!contact.is_archived && (
            <button type="button" className={PANEL_BUTTON_QUIET} onClick={onEdit}>
              Edit
            </button>
          )}
          <button
            type="button"
            disabled={pending}
            className={PANEL_BUTTON_QUIET}
            onClick={onArchive}
          >
            {contact.is_archived ? "Restore" : "Archive"}
          </button>
          {contact.is_archived && (
            <button
              type="button"
              disabled={pending}
              className={PANEL_BUTTON_QUIET}
              onClick={onDelete}
            >
              Delete
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * The add/edit form.
 *
 * `onSubmit` with `preventDefault`, never `action` — React resets a form
 * once its action returns, *including when the action threw*, so a
 * server-side validation failure (a duplicate email, a malformed address)
 * would wipe everything typed and silently revert the controlled contact
 * type. That bug shipped once already; see §6 of the handoff.
 */
function ContactForm({
  clientId,
  contact,
  pending,
  onCancel,
  onSubmit,
}: {
  clientId: string;
  contact: ClientContactRow | null;
  pending: boolean;
  onCancel: () => void;
  onSubmit: (fd: FormData) => void;
}) {
  const [contactType, setContactType] = useState<ContactType>(
    contact?.contact_type ?? "hiring_manager"
  );

  return (
    <form
      className="space-y-3 border border-outline-variant bg-surface-container-high p-3"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(new FormData(event.currentTarget));
      }}
    >
      <input type="hidden" name="clientId" value={clientId} />
      {contact && <input type="hidden" name="contactId" value={contact.id} />}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="space-y-1.5">
          <span className={LABEL}>Name</span>
          <input
            name="fullName"
            required
            defaultValue={contact?.full_name ?? ""}
            placeholder="Jane Okafor"
            className={FIELD}
          />
        </label>

        <label className="space-y-1.5">
          <span className={LABEL}>Job title</span>
          <input
            name="title"
            defaultValue={contact?.title ?? ""}
            placeholder="MD, Markets Technology"
            className={FIELD}
          />
        </label>

        <label className="space-y-1.5">
          <span className={LABEL}>Relationship</span>
          <select
            name="contactType"
            value={contactType}
            onChange={(e) => setContactType(e.target.value as ContactType)}
            className={FIELD}
          >
            {CONTACT_TYPES.map((t) => (
              <option key={t} value={t}>
                {CONTACT_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1.5">
          <span className={LABEL}>Email</span>
          <input
            name="email"
            type="email"
            defaultValue={contact?.email ?? ""}
            placeholder="jane.okafor@example.com"
            className={FIELD}
          />
        </label>

        <label className="space-y-1.5">
          <span className={LABEL}>Phone</span>
          <input name="phone" defaultValue={contact?.phone ?? ""} className={FIELD} />
        </label>

        <label className="space-y-1.5">
          <span className={LABEL}>LinkedIn</span>
          <input
            name="linkedinUrl"
            defaultValue={contact?.linkedin_url ?? ""}
            className={FIELD}
          />
        </label>
      </div>

      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          name="isPrimary"
          defaultChecked={contact?.is_primary ?? false}
          className="size-4 accent-primary"
        />
        <span className="text-body-s text-on-surface-variant">
          Primary contact — the one we deal with by default
        </span>
      </label>

      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={pending} className={PANEL_BUTTON}>
          {pending ? "Saving…" : contact ? "Save contact" : "Add contact"}
        </button>
        <button type="button" className={PANEL_BUTTON_QUIET} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
