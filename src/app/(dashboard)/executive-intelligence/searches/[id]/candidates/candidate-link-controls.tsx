"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  EXEC_CANDIDATE_STAGES,
  EXEC_CANDIDATE_STAGE_LABELS,
  type ExecutiveCandidateStage,
} from "@/lib/executive/types";
import {
  linkCandidateAction,
  setCandidateStageAction,
  unlinkCandidateAction,
} from "./actions";

function useAction() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const run = (label: string, fn: () => Promise<void>) => {
    startTransition(async () => {
      try {
        await fn();
        router.refresh();
      } catch (e) {
        const msg = e instanceof Error ? e.message : `${label} failed.`;
        console.error(`[exec-candidates] ${label} failed:`, e);
        toast.error(msg);
      }
    });
  };

  return { isPending, run };
}

export function LinkCandidateButton({
  searchId,
  candidateId,
  candidateName,
}: {
  searchId: string;
  candidateId: string;
  candidateName: string;
}) {
  const { isPending, run } = useAction();

  return (
    <button
      type="button"
      disabled={isPending}
      aria-busy={isPending ? true : undefined}
      onClick={() =>
        run("Link", async () => {
          await linkCandidateAction(searchId, candidateId);
          toast.success(`${candidateName} linked to this search.`);
        })
      }
      className="px-3 py-1.5 bg-primary-container text-on-primary-container font-mono-label text-mono-label uppercase tracking-widest hover:brightness-110 transition-all flex items-center gap-1.5 disabled:opacity-60 disabled:cursor-not-allowed"
    >
      <span
        className={`material-symbols-outlined text-[15px] ${isPending ? "animate-spin" : ""}`}
      >
        {isPending ? "progress_activity" : "person_add"}
      </span>
      Link
    </button>
  );
}

export function CandidateStageSelect({
  searchId,
  candidateId,
  stage,
}: {
  searchId: string;
  candidateId: string;
  stage: ExecutiveCandidateStage;
}) {
  const { isPending, run } = useAction();

  return (
    <select
      value={stage}
      disabled={isPending}
      aria-label="Diligence stage"
      onChange={(e) =>
        run("Stage change", () =>
          setCandidateStageAction(
            searchId,
            candidateId,
            e.target.value as ExecutiveCandidateStage
          )
        )
      }
      className="bg-surface-container-lowest border border-outline-variant px-2 py-1.5 font-mono-label text-mono-label uppercase tracking-wider text-on-surface-variant outline-none focus:border-primary transition-colors disabled:opacity-60"
    >
      {EXEC_CANDIDATE_STAGES.map((s) => (
        <option key={s} value={s}>
          {EXEC_CANDIDATE_STAGE_LABELS[s]}
        </option>
      ))}
    </select>
  );
}

export function UnlinkCandidateButton({
  searchId,
  candidateId,
  candidateName,
}: {
  searchId: string;
  candidateId: string;
  candidateName: string;
}) {
  const { isPending, run } = useAction();

  const handleClick = () => {
    if (
      !window.confirm(
        `Remove ${candidateName} from this search? The candidate record itself is untouched, and the removal is recorded in the audit trail.`
      )
    ) {
      return;
    }
    run("Unlink", () => unlinkCandidateAction(searchId, candidateId));
  };

  return (
    <button
      type="button"
      disabled={isPending}
      aria-label={`Remove ${candidateName} from search`}
      onClick={handleClick}
      className="text-outline hover:text-error transition-colors disabled:opacity-60"
    >
      <span
        className={`material-symbols-outlined text-[18px] ${isPending ? "animate-spin" : ""}`}
      >
        {isPending ? "progress_activity" : "person_remove"}
      </span>
    </button>
  );
}
