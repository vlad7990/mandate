"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { unwrap } from "@/lib/actions/result";
import { reassignMandateLeadAction } from "./actions";

type Member = { id: string; label: string };

/**
 * The one management action the desk carries. A select of capable members
 * plus Unassigned; applying calls the action and refreshes. Fast action —
 * no polling needed.
 */
export function ReassignControl({
  projectId,
  currentLeadId,
  members,
}: {
  projectId: string;
  currentLeadId: string | null;
  members: Member[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState(currentLeadId ?? "");
  const [isPending, startTransition] = useTransition();

  const dirty = selected !== (currentLeadId ?? "");

  const apply = () => {
    startTransition(async () => {
      try {
        unwrap(await reassignMandateLeadAction(projectId, selected || null));
        toast.success("Mandate reassigned.");
        router.refresh();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Reassignment failed.";
        console.error("[desk] reassignment failed:", err);
        toast.error(msg);
        setSelected(currentLeadId ?? "");
      }
    });
  };

  return (
    <span className="inline-flex items-center gap-2">
      <select
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
        disabled={isPending}
        aria-label="Lead recruiter"
        className="bg-surface-container-low border border-outline-variant px-2 py-1 font-mono-label text-mono-label text-on-surface focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
      >
        <option value="">Unassigned</option>
        {members.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label}
          </option>
        ))}
      </select>
      {dirty && (
        <button
          type="button"
          onClick={apply}
          disabled={isPending}
          className="px-2 py-1 font-mono-label text-mono-label uppercase tracking-widest text-primary border border-primary-container hover:bg-primary-container/10 transition-colors disabled:opacity-60"
        >
          {isPending ? "Moving…" : "Apply"}
        </button>
      )}
    </span>
  );
}
