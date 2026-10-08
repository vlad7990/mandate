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
import { SelectField } from "@/components/ui/select";

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
      <SelectField
        aria-label="Pipeline stage"
        value={current}
        onValueChange={(stage) => handleChange(stage as PipelineStage)}
        disabled={isPending}
        options={PIPELINE_STAGES.map((s) => ({
          value: s,
          label: PIPELINE_LABELS[s],
        }))}
        className="w-auto min-w-40 px-3 tracking-widest"
      />
    </label>
  );
}
