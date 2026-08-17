"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { IconCommit, IconRefresh } from "@/components/icons";
import { createSourcingRunAction } from "./runs/actions";
import { unwrap } from "@/lib/actions/result";

/**
 * Save the current Boolean set as a run, either as a new lineage or as a
 * refinement branching off an existing version.
 *
 * The rationale field is not decoration. A refinement is only comparable to its
 * parent if someone recorded what it was trying to change — six months later,
 * "Adjacent industries" alone does not say what v1 was missing.
 */
export function CreateRunButton({
  projectId,
  parentRunId,
  triggerLabel,
}: {
  projectId: string;
  parentRunId: string | null;
  triggerLabel: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [rationale, setRationale] = useState("");
  const [pending, start] = useTransition();

  const submit = () => {
    if (pending) return;
    if (!label.trim()) {
      toast.error("Give the strategy a name — it is how you will tell versions apart.");
      return;
    }
    start(async () => {
      try {
        const result = unwrap(await createSourcingRunAction(projectId, {
          label,
          rationale,
          parentRunId,
        }));
        toast.success(`Saved as v${result.version}`);
        setOpen(false);
        setLabel("");
        setRationale("");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not save the run.");
      }
    });
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="px-3 py-1.5 border border-outline-variant text-on-surface-variant font-mono-label text-mono-label uppercase tracking-widest hover:border-primary hover:text-primary transition-colors flex items-center gap-1.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <IconCommit size={14} />
        {triggerLabel}
      </button>
    );
  }

  return (
    <div className="w-full bg-surface-container border border-outline-variant p-4 space-y-3">
      <p className="font-mono-label text-mono-label text-on-surface-variant uppercase tracking-widest">
        {parentRunId
          ? "New version — branches off the selected run, which stays exactly as it is"
          : "New lineage — snapshots the Boolean set as it stands now"}
      </p>

      <label className="block space-y-1">
        <span className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
          Name
        </span>
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          disabled={pending}
          autoFocus
          placeholder="Conservative · Adjacent industries · Hidden talent"
          className="w-full px-3 py-2 bg-surface-container-lowest border border-outline-variant font-mono-data text-body-main text-on-surface placeholder:text-outline focus-visible:outline-none focus-visible:border-primary"
        />
      </label>

      <label className="block space-y-1">
        <span className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
          What is this version trying?
        </span>
        <textarea
          value={rationale}
          onChange={(e) => setRationale(e.target.value)}
          disabled={pending}
          rows={3}
          placeholder={
            parentRunId
              ? "Tier-1 banks only produced eight names. Adding buy-side and market infrastructure."
              : "Tight titles at direct competitors. Narrow by design — this is the baseline."
          }
          className="w-full px-3 py-2 bg-surface-container-lowest border border-outline-variant font-mono-data text-body-main text-on-surface placeholder:text-outline resize-y focus-visible:outline-none focus-visible:border-primary"
        />
      </label>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="px-3 py-1.5 bg-primary-container text-on-primary-container font-mono-label text-mono-label uppercase tracking-widest hover:brightness-110 active:scale-[0.98] transition-[filter,transform] flex items-center gap-1.5 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {pending ? <IconRefresh size={14} className="animate-spin" /> : <IconCommit size={14} />}
          {pending ? "Saving" : "Save run"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={pending}
          className="px-3 py-1.5 border border-outline-variant text-on-surface-variant font-mono-label text-mono-label uppercase tracking-widest hover:text-on-surface transition-colors disabled:opacity-60"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
