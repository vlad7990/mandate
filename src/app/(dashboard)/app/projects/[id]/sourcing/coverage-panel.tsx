"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  normalizeCoverageAnalysis,
  type CoverageAnalysis,
} from "@/lib/ai/coverage-analysis-agent";
import type { CoverageDimension } from "@/lib/sourcing/coverage";
import { IconAlert, IconRefresh, IconSpark, IconTarget } from "@/components/icons";
import { analyseRunCoverageAction, createSourcingRunAction } from "./runs/actions";
import { unwrap } from "@/lib/actions/result";

/**
 * Coverage findings for one executed run, and the refinement they argue for.
 *
 * The findings are only worth rendering if they lead somewhere, so the
 * suggested next version is a button that creates the branch pre-filled with
 * the agent's label and reasoning — rather than a paragraph the recruiter has
 * to retype into the refine dialog.
 */

const DIMENSION_LABEL: Record<CoverageDimension, string> = {
  titles: "Titles",
  companies: "Companies",
  industries: "Industries",
  geography: "Geography",
  seniority: "Seniority",
  exclusions: "Exclusions",
};

export function CoveragePanel({
  projectId,
  runId,
  runVersion,
  nextVersion,
  analysisJson,
  canAnalyse,
}: {
  projectId: string;
  runId: string;
  runVersion: number;
  nextVersion: number;
  analysisJson: unknown;
  /** False when the run returned too few rows to say anything about. */
  canAnalyse: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [queued, setQueued] = useState(false);

  const analysis: CoverageAnalysis = normalizeCoverageAnalysis(analysisJson);
  const hasAnalysis = analysis.coverage_findings.length > 0;

  const analyse = () => {
    if (pending) return;
    start(async () => {
      try {
        unwrap(await analyseRunCoverageAction(projectId, runId));
        setQueued(true);
        toast.success("Analysing coverage — findings appear here when ready");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not analyse.");
      }
    });
  };

  const refine = () => {
    const suggestion = analysis.suggested_next_version;
    if (!suggestion || pending) return;
    start(async () => {
      try {
        const result = unwrap(await createSourcingRunAction(projectId, {
          label: suggestion.label,
          // The agent's changes become the new version's rationale, so v(n+1)
          // records what it was trying to fix about v(n) — which is the whole
          // point of keeping both readable.
          rationale: `Refining v${runVersion}: ${suggestion.changes.join("; ")}.`,
          parentRunId: runId,
        }));
        toast.success(`Created v${result.version} — ${suggestion.label}`);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not create the run.");
      }
    });
  };

  if (!hasAnalysis) {
    return (
      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="button"
          onClick={analyse}
          disabled={pending || queued || !canAnalyse}
          title={
            canAnalyse
              ? undefined
              : "Too few results to analyse — a finding about a handful of rows describes the rows, not the strategy."
          }
          className="px-2 py-1 border border-outline-variant text-on-surface-variant font-mono-label text-mono-label uppercase tracking-widest hover:border-primary hover:text-primary transition-colors flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-outline-variant disabled:hover:text-on-surface-variant"
        >
          {pending ? (
            <IconRefresh size={12} className="animate-spin" />
          ) : (
            <IconSpark size={12} />
          )}
          {queued ? "Analysing…" : "Analyse coverage"}
        </button>
        {queued && (
          <span className="font-mono-data text-body-main text-on-surface-variant">
            Running in the background — refresh in a moment.
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2 bg-surface-container-lowest border border-outline-variant p-3">
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <span className="font-mono-label text-mono-label text-primary uppercase tracking-widest flex items-center gap-1.5">
          <IconTarget size={12} />
          Coverage · where this search could not reach
        </span>
        <button
          type="button"
          onClick={analyse}
          disabled={pending || queued}
          className="font-mono-label text-mono-label text-outline uppercase tracking-widest hover:text-primary transition-colors disabled:opacity-50"
        >
          {queued ? "Re-analysing…" : "Re-analyse"}
        </button>
      </div>

      <ul className="space-y-1.5">
        {analysis.coverage_findings.map((f, i) => (
          <li key={`${f.dimension}-${i}`} className="space-y-0.5">
            <span
              className={cn(
                "px-1.5 py-0 border border-tertiary/50 text-tertiary",
                "font-mono-label text-mono-label uppercase tracking-widest"
              )}
            >
              {DIMENSION_LABEL[f.dimension]}
            </span>
            <p className="font-mono-data text-body-main text-on-surface leading-snug">
              {f.finding}
            </p>
            {f.suggested_change && (
              <p className="font-mono-data text-body-main text-on-surface-variant leading-snug">
                → {f.suggested_change}
              </p>
            )}
          </li>
        ))}
      </ul>

      {analysis.suggested_next_version ? (
        <div className="pt-2 border-t border-outline-variant/40 space-y-1.5">
          <div className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
            Suggested next version
          </div>
          <p className="font-mono-data text-body-main text-on-surface">
            {analysis.suggested_next_version.label}
          </p>
          <ul className="space-y-0.5">
            {analysis.suggested_next_version.changes.map((c, i) => (
              <li
                key={i}
                className="font-mono-data text-body-main text-on-surface-variant leading-snug"
              >
                · {c}
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={refine}
            disabled={pending}
            className="px-2 py-1 bg-primary-container text-on-primary-container font-mono-label text-mono-label uppercase tracking-widest hover:brightness-110 active:scale-[0.98] transition-[filter,transform] flex items-center gap-1.5 disabled:opacity-60"
          >
            {pending ? (
              <IconRefresh size={12} className="animate-spin" />
            ) : (
              <IconSpark size={12} />
            )}
            Create v{nextVersion} from this
          </button>
        </div>
      ) : (
        <p className="pt-2 border-t border-outline-variant/40 font-mono-data text-body-main text-on-surface-variant flex items-start gap-1.5">
          <IconAlert size={12} className="mt-0.5 shrink-0" />
          No refinement suggested — this aperture is already wide enough that
          another version would not obviously help.
        </p>
      )}
    </div>
  );
}
