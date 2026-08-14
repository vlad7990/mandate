"use client";

/**
 * The qualitative log against a client.
 *
 * `candidate_notes` from 020 solved this once already and this is
 * deliberately the same shape — free text, a type, a pin, newest first with
 * pinned floated to the top. The one thing it adds is the visibility tier,
 * because some of what belongs here is commercially sensitive and a viewer
 * reading "they are squeezing us on the rate" would undo `fees:read`
 * through the side door.
 *
 * A reader without `fees:read` never receives a commercial note — RLS
 * refuses the row — so this component has no "restricted" state to draw.
 * That is different from a placement fee, where the row *is* sent and the
 * number is withheld, and the difference is deliberate: a fee that exists
 * and is hidden must be distinguishable from no fee at all, whereas a note
 * nobody told you about is simply not yours to know exists.
 */

import { useState, useTransition } from "react";
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
  CLIENT_NOTE_TYPES,
  CLIENT_NOTE_TYPE_LABELS,
  CLIENT_NOTE_VISIBILITIES,
  CLIENT_NOTE_VISIBILITY_HINTS,
  CLIENT_NOTE_VISIBILITY_LABELS,
  type ClientContactRow,
  type ClientNoteRow,
  type ClientNoteVisibility,
} from "@/lib/clients/contacts";
import {
  createClientNoteAction,
  deleteClientNoteAction,
  toggleClientNotePinAction,
  updateClientNoteAction,
} from "./client-notes-actions";

const FIELD =
  "w-full min-w-0 border border-outline-variant bg-surface px-3 py-2 text-body-s text-on-surface focus:border-primary focus:outline-none";

const LABEL =
  "block font-mono-label text-[11px] uppercase tracking-[0.08em] text-outline";

function formatWhen(value: string): string {
  return new Date(value).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function ClientNotesPanel({
  clientId,
  notes,
  contacts,
  canWrite,
  canWriteCommercial,
}: {
  clientId: string;
  notes: ClientNoteRow[];
  /**
   * Every contact, archived included.
   *
   * The composer offers only the active ones — a note cannot be filed
   * against somebody who has left — but the list rendered above resolves
   * `contact_id` against all of them, so a note written before they left
   * still says who it was with rather than "a former contact".
   */
  contacts: ClientContactRow[];
  canWrite: boolean;
  /** Whether the author holds `fees:read`, and so may pick the commercial tier. */
  canWriteCommercial: boolean;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  function run(action: (fd: FormData) => Promise<void>, fd: FormData, ok: string) {
    start(async () => {
      try {
        await action(fd);
        setEditing(null);
        router.refresh();
        toast.success(ok);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not save the note");
      }
    });
  }

  const commercialCount = notes.filter((n) => n.visibility === "commercial").length;

  return (
    <Panel
      title="Notes"
      meta={
        <PanelMeta>
          {notes.length === 0
            ? "None yet"
            : `${String(notes.length).padStart(2, "0")} ${notes.length === 1 ? "note" : "notes"}`}
          {commercialCount > 0 && ` // ${commercialCount} commercial`}
        </PanelMeta>
      }
      action={
        canWrite && editing !== "new" ? (
          <button type="button" className={PANEL_BUTTON} onClick={() => setEditing("new")}>
            Add note
          </button>
        ) : null
      }
    >
      <div className={`${PANEL_BODY} space-y-4`}>
        {editing === "new" && (
          <NoteForm
            clientId={clientId}
            note={null}
            contacts={contacts}
            canWriteCommercial={canWriteCommercial}
            pending={pending}
            onCancel={() => setEditing(null)}
            onSubmit={(fd) => run(createClientNoteAction, fd, "Note saved")}
          />
        )}

        {notes.length === 0 && editing !== "new" && (
          <p className="border border-outline-variant bg-surface-container-low px-4 py-8 text-center font-mono-label text-mono-label uppercase leading-[1.6] tracking-widest text-outline">
            No notes yet // calls, meetings and what was actually said
          </p>
        )}

        {notes.length > 0 && (
          <ul className="space-y-2">
            {notes.map((note) =>
              editing === note.id ? (
                <li key={note.id}>
                  <NoteForm
                    clientId={clientId}
                    note={note}
                    contacts={contacts}
                    canWriteCommercial={canWriteCommercial}
                    pending={pending}
                    onCancel={() => setEditing(null)}
                    onSubmit={(fd) => run(updateClientNoteAction, fd, "Note saved")}
                  />
                </li>
              ) : (
                <li
                  key={note.id}
                  className={`border p-3 ${
                    note.visibility === "commercial"
                      ? "border-tertiary/40 bg-surface-container-low"
                      : "border-outline-variant bg-surface-container-low"
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                    <StatusChip tone="neutral" intensity="soft">
                      {CLIENT_NOTE_TYPE_LABELS[note.note_type]}
                    </StatusChip>

                    {note.visibility === "commercial" && (
                      // Marked on the row, not just chosen in the composer:
                      // the author needs to see at a glance which of these a
                      // colleague without `fees:read` is not being shown.
                      <StatusChip tone="tertiary" intensity="soft">
                        Commercial
                      </StatusChip>
                    )}

                    {note.is_pinned && (
                      <StatusChip tone="primary" intensity="soft">
                        Pinned
                      </StatusChip>
                    )}

                    <span className="ml-auto font-mono-label text-[11px] uppercase tracking-[0.08em] text-outline tabular-nums">
                      {note.author_label ? `${note.author_label} // ` : ""}
                      {formatWhen(note.created_at)}
                    </span>
                  </div>

                  <p className="mt-2 max-w-[80ch] whitespace-pre-wrap text-body-s leading-relaxed text-on-surface">
                    {note.content}
                  </p>

                  {note.contact_id && (
                    <p className="mt-1.5 font-mono-label text-[11px] uppercase tracking-[0.08em] text-outline">
                      With{" "}
                      {/*
                        "a deleted contact" only when the row is genuinely
                        gone — `client_notes.contact_id` is ON DELETE SET
                        NULL, so this branch is unreachable for a *deleted*
                        contact and is really the guard for a note pointing
                        at somebody at another client, which the action
                        refuses to write.
                      */}
                      {contacts.find((c) => c.id === note.contact_id)?.full_name ??
                        "a contact who is no longer on file"}
                    </p>
                  )}

                  {canWrite && (
                    <div className="mt-2.5 flex flex-wrap gap-2">
                      <button
                        type="button"
                        className={PANEL_BUTTON_QUIET}
                        onClick={() => setEditing(note.id)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        disabled={pending}
                        className={PANEL_BUTTON_QUIET}
                        onClick={() => {
                          const fd = new FormData();
                          fd.set("noteId", note.id);
                          fd.set("clientId", clientId);
                          fd.set("pinned", note.is_pinned ? "false" : "true");
                          run(
                            toggleClientNotePinAction,
                            fd,
                            note.is_pinned ? "Unpinned" : "Pinned"
                          );
                        }}
                      >
                        {note.is_pinned ? "Unpin" : "Pin"}
                      </button>
                      <button
                        type="button"
                        disabled={pending}
                        className={`${PANEL_BUTTON_QUIET} ml-auto`}
                        onClick={() => {
                          const fd = new FormData();
                          fd.set("noteId", note.id);
                          fd.set("clientId", clientId);
                          run(deleteClientNoteAction, fd, "Note removed");
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </li>
              )
            )}
          </ul>
        )}
      </div>
    </Panel>
  );
}

/**
 * The composer.
 *
 * `onSubmit` + `preventDefault` rather than `action`, for the reason
 * documented on the contacts form and in §6 of the handoff: React resets a
 * form once its action returns, including on a throw, so a rejected submit
 * would wipe a paragraph somebody had just typed.
 */
function NoteForm({
  clientId,
  note,
  contacts,
  canWriteCommercial,
  pending,
  onCancel,
  onSubmit,
}: {
  clientId: string;
  note: ClientNoteRow | null;
  contacts: ClientContactRow[];
  canWriteCommercial: boolean;
  pending: boolean;
  onCancel: () => void;
  onSubmit: (fd: FormData) => void;
}) {
  const [visibility, setVisibility] = useState<ClientNoteVisibility>(
    note?.visibility ?? "org"
  );

  const tiers = canWriteCommercial
    ? CLIENT_NOTE_VISIBILITIES
    : (["org"] as const satisfies readonly ClientNoteVisibility[]);

  return (
    <form
      className="space-y-3 border border-outline-variant bg-surface-container-high p-3"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(new FormData(event.currentTarget));
      }}
    >
      <input type="hidden" name="clientId" value={clientId} />
      {note && <input type="hidden" name="noteId" value={note.id} />}

      <label className="space-y-1.5">
        <span className={LABEL}>Note</span>
        <textarea
          name="content"
          required
          rows={4}
          defaultValue={note?.content ?? ""}
          placeholder="What was said, and what it means for the search."
          className={FIELD}
        />
      </label>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="space-y-1.5">
          <span className={LABEL}>Type</span>
          <select
            name="noteType"
            defaultValue={note?.note_type ?? "general"}
            className={FIELD}
          >
            {CLIENT_NOTE_TYPES.map((t) => (
              <option key={t} value={t}>
                {CLIENT_NOTE_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1.5">
          <span className={LABEL}>With</span>
          <select
            name="contactId"
            defaultValue={note?.contact_id ?? ""}
            className={FIELD}
          >
            <option value="">Nobody in particular</option>
            {/*
              Active contacts only. An archived person keeps their name on
              notes already written, but a new note should not be filed
              against somebody who has left — and if this note already names
              them, the edit form keeps that value because the option is
              rendered below.
            */}
            {contacts
              .filter((c) => !c.is_archived || c.id === note?.contact_id)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.full_name}
                  {c.is_archived ? " (archived)" : ""}
                </option>
              ))}
          </select>
        </label>

        <label className="space-y-1.5">
          <span className={LABEL}>Visible to</span>
          <select
            name="visibility"
            value={visibility}
            onChange={(e) => setVisibility(e.target.value as ClientNoteVisibility)}
            className={FIELD}
          >
            {tiers.map((v) => (
              <option key={v} value={v}>
                {CLIENT_NOTE_VISIBILITY_LABELS[v]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/*
        The hint changes with the selection rather than sitting under the
        select as static help text, because the cost of picking the wrong
        tier is a
        viewer reading a rate negotiation and the word "Commercial" alone
        does not say that.
      */}
      <p className="font-mono-label text-[11px] uppercase tracking-[0.08em] text-outline">
        {CLIENT_NOTE_VISIBILITY_HINTS[visibility]}
      </p>

      {!note && (
        <label className="flex items-center gap-2">
          <input type="checkbox" name="isPinned" className="size-4 accent-primary" />
          <span className="text-body-s text-on-surface-variant">
            Pin to the top of the list
          </span>
        </label>
      )}

      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={pending} className={PANEL_BUTTON}>
          {pending ? "Saving…" : note ? "Save note" : "Add note"}
        </button>
        <button type="button" className={PANEL_BUTTON_QUIET} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
