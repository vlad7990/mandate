"use client";

import {
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { updateCandidateContact, type ContactField } from "./actions";

// Inline-editable contact rail. Each chip is its own controlled block so
// one failed save doesn't disturb the others. The recruiter clicks a
// chip → an input replaces it → blur or Enter commits → escape cancels.

type ContactFieldDef = {
  key: ContactField;
  label: string;
  /** Material symbol icon for the label / display chip. */
  icon: string;
  /** Type of input control to render in edit mode. */
  inputType: "url" | "email" | "tel" | "text";
  /** Placeholder text shown in the empty state and edit input. */
  placeholder: string;
  /**
   * When true, the display chip renders as an `<a>` linking out to the
   * URL / mailto / tel target. When false the chip is read-only text.
   */
  linkable: boolean;
};

const FIELDS: ContactFieldDef[] = [
  {
    key: "email",
    label: "Email",
    icon: "mail",
    inputType: "email",
    placeholder: "name@company.com",
    linkable: true,
  },
  {
    key: "phone",
    label: "Phone",
    icon: "call",
    inputType: "tel",
    placeholder: "+44 20 0000 0000",
    linkable: true,
  },
  {
    key: "location",
    label: "Location",
    icon: "place",
    inputType: "text",
    placeholder: "London, UK",
    linkable: false,
  },
  {
    key: "linkedin_url",
    label: "LinkedIn",
    icon: "link",
    inputType: "url",
    placeholder: "linkedin.com/in/jane",
    linkable: true,
  },
  {
    key: "twitter_url",
    label: "X / Twitter",
    icon: "alternate_email",
    inputType: "url",
    placeholder: "x.com/jane",
    linkable: true,
  },
  {
    key: "github_url",
    label: "GitHub",
    icon: "code",
    inputType: "url",
    placeholder: "github.com/jane",
    linkable: true,
  },
  {
    key: "website_url",
    label: "Website",
    icon: "public",
    inputType: "url",
    placeholder: "jane.dev",
    linkable: true,
  },
];

export type ContactFieldValues = Partial<Record<ContactField, string | null>>;

export function ContactFieldsRail({
  candidateId,
  projectId,
  initial,
}: {
  candidateId: string;
  projectId: string;
  initial: ContactFieldValues;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {FIELDS.map((def) => (
        <ContactChip
          key={def.key}
          candidateId={candidateId}
          projectId={projectId}
          def={def}
          initial={initial[def.key] ?? null}
        />
      ))}
    </div>
  );
}

function ContactChip({
  candidateId,
  projectId,
  def,
  initial,
}: {
  candidateId: string;
  projectId: string;
  def: ContactFieldDef;
  initial: string | null;
}) {
  const router = useRouter();
  // Display value comes straight from props. After a successful save we
  // call router.refresh() which re-runs the server component and pushes
  // the new value back through `initial`. There's a sub-100ms window
  // where the chip still shows the old value — acceptable trade-off for
  // not shadowing the prop with mirrored local state.
  const value = initial;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string>("");
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Autofocus when entering edit mode so the recruiter can type
  // immediately. select() so an existing value is replaced cleanly.
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

  const cancel = () => {
    setEditing(false);
  };

  const commit = () => {
    if (pending) return;
    const next = draft.trim();
    // No-op if unchanged — close without a server round-trip.
    if (next === (value ?? "")) {
      setEditing(false);
      return;
    }
    startTransition(async () => {
      try {
        await updateCandidateContact(candidateId, projectId, def.key, next);
        setEditing(false);
        toast.success(`${def.label} saved`);
        // Refresh so the new value flows back through `initial` and
        // every server-rendered chip on the page reflects it.
        router.refresh();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Save failed.";
        toast.error(msg);
      }
    });
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      commit();
    } else if (event.key === "Escape") {
      event.preventDefault();
      cancel();
    }
  };

  if (editing) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 px-2 py-0.5 border bg-surface-container-low font-mono-label text-mono-label uppercase tracking-wider text-on-surface",
          pending ? "border-tertiary" : "border-primary"
        )}
      >
        <span
          className="material-symbols-outlined text-primary text-[12px]"
          aria-hidden
        >
          {def.icon}
        </span>
        <input
          ref={inputRef}
          type={def.inputType}
          value={draft}
          disabled={pending}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={handleKeyDown}
          placeholder={def.placeholder}
          aria-label={`Edit ${def.label}`}
          className="bg-transparent border-none outline-none text-on-surface min-w-[12ch] max-w-[36ch] font-mono-label text-mono-label uppercase tracking-wider placeholder:text-outline placeholder:normal-case placeholder:tracking-normal"
        />
        {pending && (
          <span
            className="material-symbols-outlined text-tertiary text-[12px] animate-spin"
            aria-hidden
          >
            progress_activity
          </span>
        )}
      </span>
    );
  }

  // Empty state — small "+ Field" affordance the recruiter can click to
  // start filling in a missing field.
  if (!value) {
    return (
      <button
        type="button"
        onClick={beginEdit}
        className="inline-flex items-center gap-1.5 px-2 py-0.5 border border-dashed border-outline-variant bg-transparent font-mono-label text-mono-label uppercase tracking-wider text-outline hover:border-primary hover:text-primary transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary"
      >
        <span className="material-symbols-outlined text-[12px]" aria-hidden>
          add
        </span>
        {def.label}
      </button>
    );
  }

  // Filled state — display chip. We split the affordance in two so the
  // recruiter can either click the body to navigate (when linkable) or
  // click the pencil icon to edit. A wrapping `<a>` would prevent the
  // edit-icon click from working without preventDefault gymnastics.
  const displayContent = (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="material-symbols-outlined text-[12px] text-on-surface-variant group-hover:text-primary transition-colors"
        aria-hidden
      >
        {def.icon}
      </span>
      <span className="text-on-surface-variant group-hover:text-primary transition-colors truncate max-w-[28ch]">
        {displayLabel(def, value)}
      </span>
    </span>
  );

  const href = def.linkable ? buildHref(def, value) : null;

  return (
    <span className="group inline-flex items-stretch border border-outline-variant bg-surface-container-high hover:border-primary transition-colors">
      {href ? (
        <a
          href={href}
          target={def.inputType === "url" ? "_blank" : undefined}
          rel={def.inputType === "url" ? "noreferrer" : undefined}
          className="px-2 py-0.5 font-mono-label text-mono-label uppercase tracking-wider focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary"
        >
          {displayContent}
        </a>
      ) : (
        <span className="px-2 py-0.5 font-mono-label text-mono-label uppercase tracking-wider">
          {displayContent}
        </span>
      )}
      <button
        type="button"
        onClick={beginEdit}
        aria-label={`Edit ${def.label}`}
        className="px-1.5 border-l border-outline-variant text-outline opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 hover:text-primary hover:bg-surface-container-low transition-[opacity,color,background] focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary"
      >
        <span className="material-symbols-outlined text-[12px]" aria-hidden>
          edit
        </span>
      </button>
    </span>
  );
}

function displayLabel(def: ContactFieldDef, value: string): string {
  if (def.key === "email" || def.key === "phone" || def.key === "location") {
    return value;
  }
  // For URL fields strip the protocol and trailing slash so the chip
  // reads like a hostname/handle rather than a fully-qualified URL.
  return value
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./, "")
    .replace(/\/$/, "");
}

function buildHref(def: ContactFieldDef, value: string): string {
  if (def.inputType === "email") return `mailto:${value}`;
  if (def.inputType === "tel") return `tel:${value.replace(/\s+/g, "")}`;
  return value;
}
