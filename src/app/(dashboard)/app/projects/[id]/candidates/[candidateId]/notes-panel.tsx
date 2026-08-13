"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  IconCheck,
  IconChevronDown,
  IconClose,
  IconPlus,
  IconRefresh,
} from "@/components/icons";
import {
  PANEL_BUTTON,
  PANEL_BUTTON_QUIET,
  Panel,
  PanelMeta,
} from "@/components/projects/panel";
import {
  createNoteAction,
  deleteNoteAction,
  togglePinAction,
  updateNoteAction,
} from "./notes-actions";
import { NOTE_TYPES, type NoteType } from "./notes-constants";

export type CandidateNote = {
  id: string;
  candidate_id: string;
  note_type: NoteType;
  content: string;
  is_pinned: boolean;
  call_duration_minutes: number | null;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
};

const NOTE_TYPE_META: Record<
  NoteType,
  { label: string; icon: string; chipClass: string }
> = {
  general: {
    label: "General",
    icon: "sticky_note_2",
    chipClass:
      "border-outline-variant bg-surface-container-high text-on-surface-variant",
  },
  call: {
    label: "Call",
    icon: "call",
    chipClass:
      "border-primary-container/60 bg-primary-container/10 text-primary",
  },
  meeting: {
    label: "Meeting",
    icon: "groups",
    chipClass:
      "border-secondary-fixed-dim/60 bg-secondary-fixed-dim/10 text-secondary-fixed-dim",
  },
  email: {
    label: "Email",
    icon: "mail",
    chipClass: "border-tertiary/60 bg-tertiary/10 text-tertiary",
  },
  interview: {
    label: "Interview",
    icon: "fact_check",
    chipClass: "border-error/60 bg-error/10 text-error",
  },
};

export function CandidateNotesPanel({
  candidateId,
  projectId,
  candidateName,
  notes,
}: {
  candidateId: string;
  projectId: string;
  candidateName: string;
  notes: CandidateNote[];
}) {
  const [composing, setComposing] = useState(false);
  const [callOpen, setCallOpen] = useState(false);

  const sorted = useMemo(() => {
    // Pinned first, then by created_at desc. Server already does this
    // via the index, but we re-sort defensively in case the recruiter
    // has just toggled a pin and we're rendering optimistically.
    const copy = [...notes];
    copy.sort((a, b) => {
      if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
      return b.created_at.localeCompare(a.created_at);
    });
    return copy;
  }, [notes]);

  const pinnedCount = notes.filter((n) => n.is_pinned).length;

  return (
    <Panel
      title="Notes"
      meta={
        <PanelMeta>
          <span className="tabular-nums">
            {notes.length} note{notes.length === 1 ? "" : "s"}
            {pinnedCount > 0 ? ` · ${pinnedCount} pinned` : ""}
          </span>
        </PanelMeta>
      }
      action={
        <>
          <button
            type="button"
            onClick={() => setCallOpen(true)}
            className={PANEL_BUTTON_QUIET}
          >
            Start call notes
          </button>
          <button
            type="button"
            onClick={() => setComposing((c) => !c)}
            className={PANEL_BUTTON}
          >
            {composing ? <IconClose size={14} /> : <IconPlus size={14} />}
            {composing ? "Cancel" : "Add note"}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-2 px-[18px] py-4">
      {composing && (
        <NoteComposer
          candidateId={candidateId}
          projectId={projectId}
          onDone={() => setComposing(false)}
        />
      )}

      {sorted.length === 0 && !composing ? (
        <p className="text-[13px] leading-relaxed text-outline">
          No notes yet for {candidateName}. Capture your first call, interview,
          or stray observation above.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {sorted.map((note) => (
            <NoteItem
              key={note.id}
              projectId={projectId}
              note={note}
            />
          ))}
        </ul>
      )}

      </div>

      {callOpen && (
        <LiveCallNotesModal
          candidateId={candidateId}
          projectId={projectId}
          candidateName={candidateName}
          onClose={() => setCallOpen(false)}
        />
      )}
    </Panel>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Composer
// ────────────────────────────────────────────────────────────────────────

function NoteComposer({
  candidateId,
  projectId,
  onDone,
}: {
  candidateId: string;
  projectId: string;
  onDone: () => void;
}) {
  const router = useRouter();
  const [noteType, setNoteType] = useState<NoteType>("general");
  const [content, setContent] = useState("");
  const [isPinned, setIsPinned] = useState(false);
  const [callDuration, setCallDuration] = useState<string>("");
  const [pending, start] = useTransition();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const t = setTimeout(() => textareaRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, []);

  const handleSave = () => {
    const trimmed = content.trim();
    if (trimmed.length === 0) {
      toast.error("Add some content before saving.");
      return;
    }
    let duration: number | null = null;
    if (noteType === "call" && callDuration.trim().length > 0) {
      const n = Number(callDuration);
      if (!Number.isFinite(n) || n < 0) {
        toast.error("Call duration must be a non-negative number.");
        return;
      }
      duration = Math.round(n);
    }
    start(async () => {
      try {
        await createNoteAction(candidateId, projectId, {
          noteType,
          content: trimmed,
          isPinned,
          callDurationMinutes: duration,
        });
        toast.success("Note saved");
        router.refresh();
        onDone();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Save failed.";
        toast.error(msg);
      }
    });
  };

  return (
    <article className="bg-surface-container-low border border-primary-container/60 p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        {NOTE_TYPES.map((type) => {
          const active = noteType === type;
          const meta = NOTE_TYPE_META[type];
          return (
            <button
              key={type}
              type="button"
              onClick={() => setNoteType(type)}
              className={cn(
                "px-2 py-0.5 border font-mono-label text-mono-label uppercase tracking-widest flex items-center gap-1 transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary",
                active
                  ? meta.chipClass
                  : "border-outline-variant text-outline hover:text-on-surface hover:border-outline"
              )}
            >
              {meta.label}
            </button>
          );
        })}
      </div>

      {noteType === "call" && (
        <label className="flex items-center gap-2 font-mono-label text-mono-label text-outline uppercase tracking-widest">
          Call duration
          <input
            type="number"
            min={0}
            value={callDuration}
            onChange={(e) => setCallDuration(e.target.value)}
            placeholder="min"
            className="w-20 bg-surface-container-lowest border border-outline-variant px-2 py-1 text-on-surface font-mono-data text-body-main tabular-nums focus:border-primary focus:outline-none transition-colors"
          />
          <span>minutes</span>
        </label>
      )}

      <textarea
        ref={textareaRef}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={6}
        placeholder="Capture the conversation. Headlines, decisions, follow-ups, anything you'd want to remember next month."
        className="w-full bg-surface-container-lowest border border-outline-variant px-3 py-2 font-mono-data text-body-main text-on-surface focus:border-primary focus:outline-none transition-colors resize-y leading-relaxed"
      />

      <footer className="flex items-center justify-between flex-wrap gap-3">
        <label className="flex items-center gap-2 font-mono-label text-mono-label text-outline uppercase tracking-widest cursor-pointer">
          <input
            type="checkbox"
            checked={isPinned}
            onChange={(e) => setIsPinned(e.target.checked)}
            className="accent-primary"
          />
          Pin to top
        </label>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onDone}
            disabled={pending}
            className="px-3 py-1.5 border border-outline-variant text-on-surface-variant font-mono-label text-mono-label uppercase tracking-widest hover:border-primary hover:text-primary transition-colors disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={pending || content.trim().length === 0}
            aria-busy={pending ? true : undefined}
            className="px-3 py-1.5 bg-primary-container text-on-primary-container font-mono-label text-mono-label uppercase tracking-widest hover:brightness-110 active:scale-[0.98] transition-[filter,transform] flex items-center gap-1.5 disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            {pending ? <IconRefresh size={14} className="animate-spin" /> : <IconCheck size={14} />}
            {pending ? "Saving" : "Save Note"}
          </button>
        </div>
      </footer>
    </article>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Note item
// ────────────────────────────────────────────────────────────────────────

const COLLAPSE_THRESHOLD = 400;

function NoteItem({
  projectId,
  note,
}: {
  projectId: string;
  note: CandidateNote;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note.content);
  const [expanded, setExpanded] = useState(
    note.content.length <= COLLAPSE_THRESHOLD
  );
  const [pending, start] = useTransition();
  const meta = NOTE_TYPE_META[note.note_type];

  // Entering edit mode pulls the latest server-side content into the
  // draft, so we never need a separate sync effect.
  const beginEdit = () => {
    setDraft(note.content);
    setEditing(true);
  };

  const handleSaveEdit = () => {
    const next = draft.trim();
    if (next.length === 0) {
      toast.error("Note cannot be empty.");
      return;
    }
    if (next === note.content) {
      setEditing(false);
      return;
    }
    start(async () => {
      try {
        await updateNoteAction(note.id, projectId, next);
        setEditing(false);
        toast.success("Note updated");
        router.refresh();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Save failed.";
        toast.error(msg);
      }
    });
  };

  const handleDelete = () => {
    if (!window.confirm("Delete this note? This cannot be undone.")) return;
    start(async () => {
      try {
        await deleteNoteAction(note.id, projectId);
        toast.success("Note deleted");
        router.refresh();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Delete failed.";
        toast.error(msg);
      }
    });
  };

  const handleTogglePin = () => {
    start(async () => {
      try {
        await togglePinAction(note.id, projectId);
        toast.success(note.is_pinned ? "Unpinned" : "Pinned");
        router.refresh();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Pin failed.";
        toast.error(msg);
      }
    });
  };

  const collapsed = !expanded && note.content.length > COLLAPSE_THRESHOLD;
  const visibleContent = collapsed
    ? note.content.slice(0, COLLAPSE_THRESHOLD).trim() + "…"
    : note.content;

  return (
    <li
      className={cn(
        "bg-surface-container-low border border-outline-variant transition-colors",
        note.is_pinned && "border-l-2 border-l-secondary-fixed-dim"
      )}
    >
      <header className="flex items-center justify-between gap-2 px-4 py-2 border-b border-outline-variant/40 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          {note.is_pinned && (
            <span className="font-mono-label text-[10px] font-bold uppercase tracking-[0.1em] text-secondary-fixed-dim" title="Pinned">Pinned</span>
          )}
          <span
            className={cn(
              "px-2 py-0.5 border font-mono-label text-mono-label uppercase tracking-widest flex items-center gap-1",
              meta.chipClass
            )}
          >
            {meta.label}
          </span>
          {note.note_type === "call" && note.call_duration_minutes != null && (
            <span className="font-mono-label text-mono-label text-outline uppercase tracking-widest tabular-nums">
              {note.call_duration_minutes} min
            </span>
          )}
          <span className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
            {note.created_by_name ?? "Unknown"} · {relativeTime(note.created_at)}
            {note.updated_at !== note.created_at && (
              <span className="ml-1 text-outline-variant">(edited)</span>
            )}
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <IconButton
            label={note.is_pinned ? "Unpin" : "Pin"}
            onClick={handleTogglePin}
            disabled={pending}
            active={note.is_pinned}
          />
          <IconButton
            label="Edit"
            onClick={beginEdit}
            disabled={pending}
          />
          <IconButton
            label="Delete"
            onClick={handleDelete}
            disabled={pending}
            danger
          />
        </div>
      </header>
      <div className="px-4 py-3 text-on-surface text-body-main leading-relaxed font-mono-data">
        {editing ? (
          <div className="space-y-2">
            <textarea
              value={draft}
              rows={Math.max(6, draft.split("\n").length + 1)}
              onChange={(e) => setDraft(e.target.value)}
              className="w-full bg-surface-container-lowest border border-primary px-3 py-2 font-mono-data text-body-main text-on-surface focus:outline-none transition-colors resize-y leading-relaxed"
            />
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setEditing(false);
                  setDraft(note.content);
                }}
                disabled={pending}
                className="px-3 py-1 border border-outline-variant text-on-surface-variant font-mono-label text-mono-label uppercase tracking-widest hover:border-primary hover:text-primary transition-colors disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                disabled={pending}
                className="px-3 py-1 bg-primary-container text-on-primary-container font-mono-label text-mono-label uppercase tracking-widest hover:brightness-110 active:scale-[0.98] transition-[filter,transform] flex items-center gap-1.5 disabled:opacity-60"
              >
                {pending ? <IconRefresh size={14} className="animate-spin" /> : <IconCheck size={14} />}
                {pending ? "Saving" : "Save"}
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="whitespace-pre-wrap break-words">{visibleContent}</p>
            {note.content.length > COLLAPSE_THRESHOLD && (
              <button
                type="button"
                onClick={() => setExpanded((e) => !e)}
                className="mt-2 font-mono-label text-mono-label text-primary uppercase tracking-widest flex items-center gap-1 hover:brightness-110 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                <IconChevronDown size={12} className={cn("transition-transform", expanded && "rotate-180")} />
                {expanded ? "Show less" : "Show more"}
              </button>
            )}
          </>
        )}
      </div>
    </li>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  active,
  danger,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        "w-7 h-7 flex items-center justify-center border border-outline-variant transition-colors disabled:opacity-30 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary",
        active
          ? "text-secondary-fixed-dim border-secondary-fixed-dim/40 bg-secondary-fixed-dim/10"
          : danger
            ? "text-outline hover:text-error hover:border-error"
            : "text-outline hover:text-primary hover:border-primary"
      )}
    >
      
    </button>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Live Call Notes modal
// ────────────────────────────────────────────────────────────────────────

function LiveCallNotesModal({
  candidateId,
  projectId,
  candidateName,
  onClose,
}: {
  candidateId: string;
  projectId: string;
  candidateName: string;
  onClose: () => void;
}) {
  const router = useRouter();
  // TODO: Connect to AI transcription service (Whisper/Assembly AI)
  const [content, setContent] = useState("");
  const [seconds, setSeconds] = useState(0);
  const [running, setRunning] = useState(true);
  const [pending, start] = useTransition();
  // lastResume = wall-clock at the start of the current run interval.
  // Lazily filled on first run-tick — initialising with `Date.now()` at
  // useRef-call time would be impure during render.
  const lastResume = useRef<number | null>(null);
  const accumulated = useRef<number>(0);

  // Tick the on-screen clock every second while running. We track the
  // "running" state separately from elapsed time so a pause/resume keeps
  // the underlying duration accurate.
  useEffect(() => {
    if (!running) return;
    lastResume.current = Date.now();
    const id = setInterval(() => {
      if (lastResume.current == null) return;
      const now = Date.now();
      const live = (now - lastResume.current) / 1000;
      setSeconds(Math.floor(accumulated.current + live));
    }, 1000);
    return () => clearInterval(id);
  }, [running]);

  // Lock background scroll while the modal is open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const handlePauseResume = () => {
    if (running) {
      // Pausing: bank the elapsed time.
      if (lastResume.current != null) {
        accumulated.current += (Date.now() - lastResume.current) / 1000;
      }
      setRunning(false);
    } else {
      // Resuming: reset the live anchor.
      lastResume.current = Date.now();
      setRunning(true);
    }
  };

  const computeDurationMinutes = (): number => {
    let total = accumulated.current;
    if (running && lastResume.current != null) {
      total += (Date.now() - lastResume.current) / 1000;
    }
    return Math.max(0, Math.round(total / 60));
  };

  const handleSave = () => {
    const trimmed = content.trim();
    if (trimmed.length === 0) {
      toast.error("Add some notes before saving.");
      return;
    }
    const minutes = computeDurationMinutes();
    start(async () => {
      try {
        await createNoteAction(candidateId, projectId, {
          noteType: "call",
          content: trimmed,
          isPinned: false,
          callDurationMinutes: minutes,
        });
        toast.success(
          `Call notes saved · ${minutes} min${minutes === 1 ? "" : "s"}`
        );
        router.refresh();
        onClose();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Save failed.";
        toast.error(msg);
      }
    });
  };

  const handleDiscard = () => {
    if (content.trim().length > 0) {
      if (
        !window.confirm(
          "Discard these call notes? Your typed content will be lost."
        )
      ) {
        return;
      }
    }
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="live-call-notes-title"
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-surface/80 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleDiscard();
      }}
    >
      <div className="w-full max-w-3xl bg-surface-container border border-outline-variant max-h-[92vh] flex flex-col overflow-hidden">
        <header className="px-5 py-3 border-b border-outline-variant bg-surface-container-high flex items-center justify-between gap-3 flex-wrap">
          <h3
            id="live-call-notes-title"
            className="font-mono-label text-mono-label text-primary uppercase tracking-widest flex items-center gap-2"
          >
            <span
              className={cn(
                "w-2 h-2",
                running ? "bg-error animate-pulse" : "bg-outline"
              )}
              aria-hidden
            />
            Live Call Notes · {candidateName}
          </h3>
          <div className="flex items-center gap-3">
            <span
              className="font-h2 text-h2 tabular-nums text-on-surface"
              aria-live="polite"
            >
              {formatDuration(seconds)}
            </span>
            <button
              type="button"
              onClick={handlePauseResume}
              disabled={pending}
              className="px-2 py-1 border border-outline-variant text-on-surface-variant font-mono-label text-mono-label uppercase tracking-widest hover:border-primary hover:text-primary transition-colors flex items-center gap-1 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary"
            >
              {running ? "Pause" : "Resume"}
            </button>
            <button
              type="button"
              onClick={handleDiscard}
              aria-label="Close"
              className="w-7 h-7 border border-outline-variant text-outline hover:text-error hover:border-error transition-colors flex items-center justify-center focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-error"
            >
            </button>
          </div>
        </header>

        <div className="px-5 py-4 flex-1 overflow-auto space-y-3">
          <p className="font-mono-label text-mono-label text-outline uppercase tracking-widest leading-snug">
            Capture the conversation as it happens. Headlines, decisions,
            objections, follow-ups. The timer runs while you type.
          </p>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            autoFocus
            rows={16}
            placeholder="Notes start typing here…"
            className="w-full bg-surface-container-lowest border border-outline-variant px-3 py-2 font-mono-data text-body-main text-on-surface focus:border-primary focus:outline-none transition-colors resize-y leading-relaxed min-h-[280px]"
          />
          <p className="font-mono-label text-mono-label text-outline uppercase tracking-widest leading-snug">
            Live transcription is on the roadmap — for now this is plain
            text. Hit <span className="text-primary">End Call &amp; Save</span>{" "}
            when you&rsquo;re done; the duration is captured automatically.
          </p>
        </div>

        <footer className="px-5 py-3 border-t border-outline-variant bg-surface-container-low flex items-center justify-between gap-2 flex-wrap">
          <span className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
            Saves as a Call note · duration {formatDuration(seconds)}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDiscard}
              disabled={pending}
              className="px-3 py-1.5 border border-outline-variant text-on-surface-variant font-mono-label text-mono-label uppercase tracking-widest hover:border-error hover:text-error transition-colors disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-error"
            >
              Discard
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={pending || content.trim().length === 0}
              className="px-3 py-1.5 bg-primary-container text-on-primary-container font-mono-label text-mono-label uppercase tracking-widest hover:brightness-110 active:scale-[0.98] transition-[filter,transform] flex items-center gap-1.5 disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              {pending ? <IconRefresh size={14} className="animate-spin" /> : <IconCheck size={14} />}
              {pending ? "Saving" : "End Call & Save Notes"}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

function formatDuration(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return iso;
  const delta = Date.now() - then;
  const sec = Math.round(delta / 1000);
  if (sec < 45) return "just now";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}d ago`;
  const month = Math.round(day / 30);
  if (month < 12) return `${month}mo ago`;
  const yr = Math.round(month / 12);
  return `${yr}y ago`;
}
