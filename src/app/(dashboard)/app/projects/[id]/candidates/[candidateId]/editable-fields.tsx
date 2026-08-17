"use client";

import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  IconClose,
  IconPencil,
  IconPlus,
} from "@/components/icons";
import {
  ARCHETYPES,
  type Archetype,
} from "@/lib/ai/cv-parsing";
import {
  updateCandidateField,
  type CandidateEditableField,
} from "./actions";
import { unwrap } from "@/lib/actions/result";

// Family of "click-to-edit" primitives shared across the candidate
// profile. Each component renders a display state, swaps to an input on
// click, and saves on blur or Enter. The recruiter never has to leave
// the page or hunt for an edit-mode toggle — the affordance is the
// content itself.

type SaveResult = void;

function useFieldSave(
  candidateId: string,
  projectId: string,
  field: CandidateEditableField
) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const save = (value: string | string[] | number | null): Promise<SaveResult> =>
    new Promise((resolve, reject) => {
      startTransition(async () => {
        try {
          unwrap(await updateCandidateField(candidateId, projectId, field, value));
          router.refresh();
          resolve();
        } catch (err) {
          reject(err);
        }
      });
    });
  return { save, pending };
}

// ────────────────────────────────────────────────────────────────────────
// EditableText — single-line click-to-edit
// ────────────────────────────────────────────────────────────────────────

export function EditableText({
  candidateId,
  projectId,
  field,
  value,
  placeholder,
  required,
  className,
  inputClassName,
  ariaLabel,
}: {
  candidateId: string;
  projectId: string;
  field: CandidateEditableField;
  value: string | null;
  placeholder?: string;
  required?: boolean;
  className?: string;
  inputClassName?: string;
  ariaLabel?: string;
}) {
  const { save, pending } = useFieldSave(candidateId, projectId, field);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (editing) {
      const t = setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 0);
      return () => clearTimeout(t);
    }
  }, [editing]);

  const beginEdit = () => {
    if (pending) return;
    setDraft(value ?? "");
    setEditing(true);
  };

  const commit = () => {
    if (pending) return;
    const next = draft.trim();
    if (required && next.length === 0) {
      toast.error("This field cannot be empty.");
      return;
    }
    if (next === (value ?? "")) {
      setEditing(false);
      return;
    }
    save(next.length > 0 ? next : null)
      .then(() => {
        setEditing(false);
        toast.success("Saved");
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : "Save failed.";
        toast.error(msg);
      });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setEditing(false);
    }
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={draft}
        disabled={pending}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        aria-label={ariaLabel ?? field}
        className={cn(
          "bg-surface-container-lowest border border-primary px-1 py-0 outline-none text-on-surface w-full max-w-full",
          inputClassName,
          className
        )}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={beginEdit}
      title="Click to edit"
      aria-label={`Edit ${ariaLabel ?? field}`}
      className={cn(
        "group inline-flex items-baseline gap-1 text-left max-w-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
        className
      )}
    >
      <span
        className={cn(
          "transition-colors hover:text-primary truncate",
          !value && "italic text-outline"
        )}
      >
        {value || placeholder || "—"}
      </span>
      <IconPencil
        size={12}
        className="shrink-0 text-outline opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
      />
    </button>
  );
}

// ────────────────────────────────────────────────────────────────────────
// EditableNumber — same as EditableText but coerced to a number
// ────────────────────────────────────────────────────────────────────────

export function EditableNumber({
  candidateId,
  projectId,
  field,
  value,
  unit,
  placeholder,
  className,
  ariaLabel,
}: {
  candidateId: string;
  projectId: string;
  field: CandidateEditableField;
  value: number | null;
  unit?: string;
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
}) {
  const { save, pending } = useFieldSave(candidateId, projectId, field);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (editing) {
      const t = setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 0);
      return () => clearTimeout(t);
    }
  }, [editing]);

  const beginEdit = () => {
    if (pending) return;
    setDraft(value != null ? String(value) : "");
    setEditing(true);
  };

  const commit = () => {
    if (pending) return;
    const trimmed = draft.trim();
    if (trimmed.length === 0) {
      if (value === null) {
        setEditing(false);
        return;
      }
      save(null)
        .then(() => {
          setEditing(false);
          toast.success("Cleared");
        })
        .catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : "Save failed.";
          toast.error(msg);
        });
      return;
    }
    const n = Number(trimmed);
    if (!Number.isFinite(n) || n < 0) {
      toast.error("Enter a non-negative number.");
      return;
    }
    if (n === value) {
      setEditing(false);
      return;
    }
    save(n)
      .then(() => {
        setEditing(false);
        toast.success("Saved");
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : "Save failed.";
        toast.error(msg);
      });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setEditing(false);
    }
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="number"
        min={0}
        value={draft}
        disabled={pending}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        aria-label={ariaLabel ?? field}
        className={cn(
          "bg-surface-container-lowest border border-primary px-1 py-0 outline-none text-on-surface w-20 tabular-nums",
          className
        )}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={beginEdit}
      title="Click to edit"
      aria-label={`Edit ${ariaLabel ?? field}`}
      className={cn(
        "group inline-flex items-baseline gap-1 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
        className
      )}
    >
      <span
        className={cn(
          "transition-colors hover:text-primary tabular-nums",
          value == null && "italic text-outline"
        )}
      >
        {value != null ? `${value}${unit ?? ""}` : placeholder ?? "—"}
      </span>
      <IconPencil
        size={12}
        className="shrink-0 text-outline opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
      />
    </button>
  );
}

// ────────────────────────────────────────────────────────────────────────
// ArchetypeSelect — dropdown selector
// ────────────────────────────────────────────────────────────────────────

const ARCHETYPE_BLURB: Record<Archetype, string> = {
  Builder: "Built from zero",
  Operator: "Scaled mature systems",
  Transformer: "Drove change at pace",
  Infrastructure: "Platform / SRE focus",
};

export function ArchetypeSelect({
  candidateId,
  projectId,
  value,
}: {
  candidateId: string;
  projectId: string;
  value: Archetype | null;
}) {
  const { save, pending } = useFieldSave(candidateId, projectId, "archetype");

  const handleChange = (next: string) => {
    const cleaned = next.trim();
    if (cleaned === (value ?? "")) return;
    save(cleaned === "" ? null : cleaned)
      .then(() => toast.success("Archetype updated"))
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : "Save failed.";
        toast.error(msg);
      });
  };

  return (
    // `max-w-full min-w-0` on the label, not just on the select: an
    // `inline-flex` box sizes to its content and will not shrink below it,
    // so capping the select alone left the label at its intrinsic 400px.
    <label className="inline-flex max-w-full min-w-0 items-center gap-1">
      <span className="sr-only">Archetype</span>
      <select
        value={value ?? ""}
        disabled={pending}
        onChange={(e) => handleChange(e.target.value)}
        className={cn(
          // `max-w-full min-w-0`: a <select> sizes to its widest *option*,
          // and these options carry a sentence each ("BUILDER — Built
          // something from zero…"), so it claimed 400px inside a 297px
          // column at 360 and pushed the candidate header over. Same class
          // of bug as the `flex-1` ones fixed in the responsive pass — the
          // element has an intrinsic width nothing was allowing it to give
          // up. Found sweeping the placement tab; the select is older.
          "max-w-full min-w-0 truncate bg-surface-container-high border border-outline-variant px-2 py-0.5 font-mono-label text-mono-label uppercase tracking-wider text-on-surface-variant hover:border-primary focus:border-primary focus:outline-none transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        )}
      >
        <option value="">— ARCHETYPE —</option>
        {ARCHETYPES.map((a) => (
          <option key={a} value={a}>
            {a.toUpperCase()} — {ARCHETYPE_BLURB[a]}
          </option>
        ))}
      </select>
    </label>
  );
}

// ────────────────────────────────────────────────────────────────────────
// EditableTextarea — multi-line click-to-edit
// ────────────────────────────────────────────────────────────────────────

export function EditableTextarea({
  candidateId,
  projectId,
  field,
  value,
  placeholder,
  rows = 6,
  emptyState,
}: {
  candidateId: string;
  projectId: string;
  field: CandidateEditableField;
  value: string | null;
  placeholder?: string;
  rows?: number;
  /** Display text when there's no value. Defaults to `placeholder`. */
  emptyState?: ReactNode;
}) {
  const { save, pending } = useFieldSave(candidateId, projectId, field);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const ref = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (editing) {
      const t = setTimeout(() => {
        ref.current?.focus();
        ref.current?.select();
      }, 0);
      return () => clearTimeout(t);
    }
  }, [editing]);

  const beginEdit = () => {
    if (pending) return;
    setDraft(value ?? "");
    setEditing(true);
  };

  const commit = () => {
    if (pending) return;
    const next = draft.trim();
    if (next === (value ?? "")) {
      setEditing(false);
      return;
    }
    save(next.length > 0 ? next : null)
      .then(() => {
        setEditing(false);
        toast.success("Saved");
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : "Save failed.";
        toast.error(msg);
      });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Cmd+Enter / Ctrl+Enter to save; Escape to cancel. Plain Enter
    // inserts a newline because long-form text is the point of the
    // textarea.
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      commit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setEditing(false);
    }
  };

  if (editing) {
    return (
      <div className="space-y-2">
        <textarea
          ref={ref}
          value={draft}
          rows={rows}
          disabled={pending}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="w-full bg-surface-container-lowest border border-primary px-3 py-2 font-mono-data text-body-main text-on-surface focus:outline-none transition-colors resize-y leading-relaxed"
        />
        <div className="flex items-center justify-between font-mono-label text-mono-label text-outline uppercase tracking-widest">
          <span>⌘+Enter to save · Esc to cancel</span>
          {pending && <span className="text-tertiary">Saving…</span>}
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={beginEdit}
      className="group block text-left w-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      aria-label={`Edit ${field}`}
    >
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0 text-on-surface text-body-main leading-relaxed font-mono-data whitespace-pre-wrap">
          {value || (
            <span className="italic text-outline">
              {emptyState ?? placeholder ?? "Click to add."}
            </span>
          )}
        </div>
        <IconPencil
        size={12}
        className="shrink-0 text-outline opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 mt-1"
      />
      </div>
    </button>
  );
}

// ────────────────────────────────────────────────────────────────────────
// EditableList — add / edit / remove items
// ────────────────────────────────────────────────────────────────────────

export function EditableList({
  candidateId,
  projectId,
  field,
  items,
  marker,
  markerClass,
  emptyLabel,
  addLabel,
  itemPlaceholder,
}: {
  candidateId: string;
  projectId: string;
  field: CandidateEditableField;
  items: string[];
  marker: string;
  markerClass: string;
  emptyLabel: string;
  addLabel: string;
  itemPlaceholder: string;
}) {
  const { save, pending } = useFieldSave(candidateId, projectId, field);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [newDraft, setNewDraft] = useState("");
  const [adding, setAdding] = useState(false);
  const editRef = useRef<HTMLInputElement | null>(null);
  const addRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (editingIndex !== null) {
      const t = setTimeout(() => {
        editRef.current?.focus();
        editRef.current?.select();
      }, 0);
      return () => clearTimeout(t);
    }
  }, [editingIndex]);

  useEffect(() => {
    if (adding) {
      const t = setTimeout(() => addRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
  }, [adding]);

  const persist = (next: string[], successMsg: string) => {
    save(next)
      .then(() => toast.success(successMsg))
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : "Save failed.";
        toast.error(msg);
      });
  };

  const beginEdit = (index: number) => {
    if (pending) return;
    setDraft(items[index] ?? "");
    setEditingIndex(index);
  };

  const commitEdit = () => {
    if (editingIndex === null) return;
    const next = draft.trim();
    if (next.length === 0) {
      // Empty after edit deletes the item — matches the "remove" affordance.
      const updated = items.filter((_, i) => i !== editingIndex);
      setEditingIndex(null);
      persist(updated, "Item removed");
      return;
    }
    if (next === items[editingIndex]) {
      setEditingIndex(null);
      return;
    }
    const updated = items.map((it, i) => (i === editingIndex ? next : it));
    setEditingIndex(null);
    persist(updated, "Item updated");
  };

  const remove = (index: number) => {
    if (pending) return;
    const updated = items.filter((_, i) => i !== index);
    persist(updated, "Item removed");
  };

  const commitAdd = () => {
    const next = newDraft.trim();
    if (next.length === 0) {
      setAdding(false);
      return;
    }
    const updated = [...items, next];
    setAdding(false);
    setNewDraft("");
    persist(updated, "Item added");
  };

  const handleEditKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commitEdit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setEditingIndex(null);
    }
  };

  const handleAddKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commitAdd();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setAdding(false);
      setNewDraft("");
    }
  };

  return (
    <ul className="space-y-2">
      {items.length === 0 && !adding && (
        <li className="text-body-main text-outline italic">{emptyLabel}</li>
      )}
      {items.map((item, i) => (
        <li
          key={i}
          className="group flex items-start gap-2 font-mono-data text-body-main text-on-surface-variant"
        >
          <span className={cn(markerClass, "shrink-0")} aria-hidden>
            {marker}
          </span>
          {editingIndex === i ? (
            <input
              ref={editRef}
              type="text"
              value={draft}
              disabled={pending}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitEdit}
              onKeyDown={handleEditKey}
              className="flex-1 min-w-0 bg-surface-container-lowest border border-primary px-1 py-0 outline-none text-on-surface"
            />
          ) : (
            <button
              type="button"
              onClick={() => beginEdit(i)}
              className="flex-1 min-w-0 text-left hover:text-primary transition-colors focus-visible:outline-none focus-visible:underline"
            >
              {item}
            </button>
          )}
          {editingIndex !== i && (
            <button
              type="button"
              onClick={() => remove(i)}
              disabled={pending}
              aria-label={`Remove "${item}"`}
              className="text-outline opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 hover:text-error transition-[opacity,color] disabled:opacity-30 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-error"
            >
              <IconClose size={12} />
            </button>
          )}
        </li>
      ))}
      {adding ? (
        <li className="flex items-start gap-2 font-mono-data text-body-main text-on-surface-variant">
          <span className={cn(markerClass, "shrink-0")} aria-hidden>
            {marker}
          </span>
          <input
            ref={addRef}
            type="text"
            value={newDraft}
            disabled={pending}
            onChange={(e) => setNewDraft(e.target.value)}
            onBlur={commitAdd}
            onKeyDown={handleAddKey}
            placeholder={itemPlaceholder}
            className="flex-1 min-w-0 bg-surface-container-lowest border border-primary px-1 py-0 outline-none text-on-surface"
          />
        </li>
      ) : (
        <li>
          <button
            type="button"
            onClick={() => setAdding(true)}
            disabled={pending}
            className="font-mono-label text-mono-label text-primary uppercase tracking-widest hover:brightness-110 transition-colors flex items-center gap-1 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <IconPlus size={12} />
            {addLabel}
          </button>
        </li>
      )}
    </ul>
  );
}
