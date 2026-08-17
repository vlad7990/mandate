"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  PIPELINE_LABELS,
  PIPELINE_STAGES,
  type PipelineStage,
} from "@/lib/ai/cv-parsing";
import { updatePipelineStage } from "../actions";
import { unwrap } from "@/lib/actions/result";

type Props = {
  candidateId: string;
  projectId: string;
  current: PipelineStage;
};

export function PipelineSelect({ candidateId, projectId, current }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleChange = (stage: PipelineStage) => {
    if (stage === current) return;
    startTransition(async () => {
      try {
        unwrap(await updatePipelineStage(candidateId, projectId, stage));
        toast.success(`Stage → ${PIPELINE_LABELS[stage]}`);
        router.refresh();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Update failed.";
        console.error("[candidates] stage update failed:", err);
        toast.error(msg);
      }
    });
  };

  return (
    <label className="flex items-center gap-2 font-mono-label text-mono-label text-outline uppercase tracking-widest">
      Pipeline
      <select
        value={current}
        onChange={(e) => handleChange(e.target.value as PipelineStage)}
        disabled={isPending}
        className="bg-surface-container-low border border-outline-variant px-3 py-1.5 font-mono-label text-mono-label text-on-surface uppercase tracking-widest focus:border-primary focus:ring-0 outline-none transition-colors disabled:opacity-60"
      >
        {PIPELINE_STAGES.map((s) => (
          <option key={s} value={s} className="bg-surface text-on-surface">
            {PIPELINE_LABELS[s]}
          </option>
        ))}
      </select>
    </label>
  );
}
