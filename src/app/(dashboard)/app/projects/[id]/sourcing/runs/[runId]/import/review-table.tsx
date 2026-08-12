"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { MatchStatus } from "@/lib/sourcing/import";
import {
  defaultDecision,
  readProvenance,
  type PromoteAction,
  type PromoteDecision,
} from "@/lib/sourcing/runs";
import { IconCheckCircle, IconRefresh, IconLink } from "@/components/icons";
import { promoteResultsAction } from "../../actions";

export type StagedRow = {
  id: string;
  full_name: string;
  current_title: string | null;
  current_company: string | null;
  location: string | null;
  profile_url: string | null;
  email: string | null;
  source_platform: string;
  match_status: MatchStatus;
  matched_candidate_id: string | null;
  promoted_candidate_id: string | null;
  raw: unknown;
  created_at: string;
};

export type PoolCandidate = {
  id: string;
  full_name: string;
  current_title: string | null;
  current_company: string | null;
};

/** null = skip. A skipped row stays staged and visible; it is not deleted. */
type Choice = { action: PromoteAction | null; candidateId: string | null };

const STATUS_TONE: Record<MatchStatus, string> = {
  new: "border-outline-variant text-on-surface-variant",
  duplicate: "border-primary-container/40 text-primary",
  ambiguous: "border-tertiary/60 bg-tertiary/10 text-tertiary",
};

const STATUS_LABEL: Record<MatchStatus, string> = {
  new: "New",
  duplicate: "Already in pool",
  ambiguous: "Needs a decision",
};

/**
 * The review table. Every staged row gets a human verdict before it becomes a
 * person in the system.
 *
 * The rule that shapes this component: an `ambiguous` row — matched on name and
 * company alone — starts with NO selection. Same name at a large employer is a
 * genuine collision, and defaulting it either way turns "we could not tell"
 * into a silent merge or a silent duplicate. The recruiter chooses.
 */
export function ReviewTable({
  projectId,
  runId,
  rows,
  pool,
  pendingCount,
}: {
  projectId: string;
  runId: string;
  rows: StagedRow[];
  pool: PoolCandidate[];
  pendingCount: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [choices, setChoices] = useState<Record<string, Choice>>(() =>
    Object.fromEntries(
      rows
        .filter((r) => !r.promoted_candidate_id)
        .map((r) => [
          r.id,
          {
            action: defaultDecision(r.match_status, r.matched_candidate_id),
            candidateId: r.matched_candidate_id,
          },
        ])
    )
  );

  const unresolved = rows.filter((r) => !r.promoted_candidate_id);
  const promoted = rows.filter((r) => r.promoted_candidate_id);

  const decisions: PromoteDecision[] = useMemo(
    () =>
      unresolved.flatMap((row) => {
        const choice = choices[row.id];
        if (!choice?.action) return [];
        if (choice.action === "link" && !choice.candidateId) return [];
        return [
          {
            result_id: row.id,
            action: choice.action,
            candidate_id: choice.action === "link" ? choice.candidateId : null,
          },
        ];
      }),
    [unresolved, choices]
  );

  const undecided = unresolved.filter((r) => {
    const c = choices[r.id];
    return !c?.action || (c.action === "link" && !c.candidateId);
  }).length;

  const setChoice = (rowId: string, next: Partial<Choice>) => {
    setChoices((prev) => ({
      ...prev,
      [rowId]: { ...(prev[rowId] ?? { action: null, candidateId: null }), ...next },
    }));
  };

  const promote = () => {
    if (pending || decisions.length === 0) return;
    start(async () => {
      try {
        const summary = await promoteResultsAction(projectId, runId, decisions);
        toast.success(
          `${summary.created} added · ${summary.linked} linked to existing people`
        );
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Nothing was imported.");
      }
    });
  };

  if (rows.length === 0) {
    return (
      <div className="bg-surface-container-low border border-outline-variant p-6">
        <p className="text-body-main text-on-surface-variant">
          This run was executed but returned no rows. That is a real result — the
          strategy was tried and produced nothing usable.
        </p>
      </div>
    );
  }

  return (
    <section className="bg-surface-container-low border border-outline-variant">
      <header className="bg-surface-container-high px-4 py-2.5 border-b border-outline-variant flex items-center justify-between gap-3 flex-wrap">
        <span className="font-mono-label text-mono-label text-on-surface-variant uppercase tracking-widest tabular-nums">
          Review · {pendingCount} awaiting a decision · {promoted.length} already
          imported
        </span>
        <div className="flex items-center gap-3">
          {undecided > 0 && (
            <span className="font-mono-label text-mono-label text-tertiary uppercase tracking-widest tabular-nums">
              {undecided} undecided
            </span>
          )}
          <button
            type="button"
            onClick={promote}
            disabled={pending || decisions.length === 0}
            className="px-3 py-1.5 bg-primary-container text-on-primary-container font-mono-label text-mono-label uppercase tracking-widest hover:brightness-110 active:scale-[0.98] transition-[filter,transform] flex items-center gap-1.5 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {pending ? (
              <IconRefresh size={14} className="animate-spin" />
            ) : (
              <IconCheckCircle size={14} />
            )}
            Import {decisions.length} selected
          </button>
        </div>
      </header>

      <ul className="divide-y divide-outline-variant/40">
        {unresolved.map((row) => (
          <ReviewRow
            key={row.id}
            row={row}
            pool={pool}
            choice={choices[row.id] ?? { action: null, candidateId: null }}
            disabled={pending}
            onChange={(next) => setChoice(row.id, next)}
          />
        ))}
        {promoted.map((row) => (
          <PromotedRow key={row.id} projectId={projectId} row={row} />
        ))}
      </ul>

      <footer className="px-4 py-2.5 border-t border-outline-variant bg-surface-container-lowest">
        <p className="font-mono-data text-body-main text-on-surface-variant">
          Rows you leave undecided stay here, unimported. Skipping is a record of
          &ldquo;seen, not taken&rdquo; — nothing is deleted and nothing is merged
          on your behalf.
        </p>
      </footer>
    </section>
  );
}

function ReviewRow({
  row,
  pool,
  choice,
  disabled,
  onChange,
}: {
  row: StagedRow;
  pool: PoolCandidate[];
  choice: Choice;
  disabled: boolean;
  onChange: (next: Partial<Choice>) => void;
}) {
  const provenance = readProvenance(row.raw);

  return (
    <li className="px-4 py-3 space-y-2">
      <div className="flex items-start gap-3 flex-wrap">
        <div className="flex-1 min-w-[18rem] space-y-0.5">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-body-main text-on-surface font-semibold">
              {row.full_name}
            </span>
            <span
              className={cn(
                "px-1.5 py-0 border font-mono-label text-mono-label uppercase tracking-widest",
                STATUS_TONE[row.match_status]
              )}
            >
              {STATUS_LABEL[row.match_status]}
            </span>
            {provenance && (
              <span className="font-mono-label text-mono-label text-outline uppercase tracking-widest tabular-nums">
                line {provenance.row_number}
              </span>
            )}
          </div>
          <div className="font-mono-data text-body-main text-on-surface-variant">
            {row.current_title ?? "—"}
            {row.current_company ? ` @ ${row.current_company}` : ""}
            {row.location ? ` · ${row.location}` : ""}
          </div>
          {(row.email || row.profile_url) && (
            <div className="font-mono-data text-body-main text-outline break-all">
              {row.email ?? ""}
              {row.email && row.profile_url ? " · " : ""}
              {row.profile_url ?? ""}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <ChoiceButton
            active={choice.action === "create"}
            disabled={disabled}
            onClick={() => onChange({ action: "create" })}
            label="Create new"
          />
          <ChoiceButton
            active={choice.action === "link"}
            disabled={disabled}
            onClick={() => onChange({ action: "link" })}
            label="Link existing"
          />
          <ChoiceButton
            active={choice.action === null}
            disabled={disabled}
            onClick={() => onChange({ action: null })}
            label="Skip"
          />
        </div>
      </div>

      {choice.action === "link" && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
            Same person as
          </span>
          <select
            value={choice.candidateId ?? ""}
            disabled={disabled}
            onChange={(e) =>
              onChange({ candidateId: e.target.value || null })
            }
            className="px-2 py-1 bg-surface-container-lowest border border-outline-variant font-mono-data text-body-main text-on-surface max-w-full"
          >
            <option value="">— choose a person —</option>
            {pool.map((c) => (
              <option key={c.id} value={c.id}>
                {c.full_name}
                {c.current_company ? ` — ${c.current_company}` : ""}
              </option>
            ))}
          </select>
          {!choice.candidateId && (
            <span className="font-mono-label text-mono-label text-tertiary uppercase tracking-widest">
              Not counted until you pick someone
            </span>
          )}
        </div>
      )}

      {row.match_status === "ambiguous" && choice.action === null && (
        <p className="font-mono-data text-body-main text-tertiary">
          Matched on name and company only — that collides for common names at
          large employers, so this one is yours to call.
        </p>
      )}
    </li>
  );
}

function ChoiceButton({
  active,
  disabled,
  onClick,
  label,
}: {
  active: boolean;
  disabled: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={cn(
        "px-2 py-1 border font-mono-label text-mono-label uppercase tracking-widest transition-colors disabled:opacity-60",
        active
          ? "border-primary bg-primary-container text-on-primary-container"
          : "border-outline-variant text-on-surface-variant hover:border-primary hover:text-primary"
      )}
    >
      {label}
    </button>
  );
}

function PromotedRow({
  projectId,
  row,
}: {
  projectId: string;
  row: StagedRow;
}) {
  const provenance = readProvenance(row.raw);
  return (
    <li className="px-4 py-2.5 flex items-center gap-3 flex-wrap bg-surface-container-lowest">
      <IconCheckCircle size={14} className="text-secondary-fixed-dim shrink-0" />
      <span className="text-body-main text-on-surface">{row.full_name}</span>
      <span className="font-mono-data text-body-main text-on-surface-variant">
        {row.current_title ?? "—"}
        {row.current_company ? ` @ ${row.current_company}` : ""}
      </span>
      {provenance && (
        <span className="font-mono-label text-mono-label text-outline uppercase tracking-widest tabular-nums">
          line {provenance.row_number}
        </span>
      )}
      <Link
        href={`/app/projects/${projectId}/candidates/${row.promoted_candidate_id}`}
        prefetch={false}
        className="ml-auto font-mono-label text-mono-label text-primary uppercase tracking-widest hover:underline flex items-center gap-1.5"
      >
        <IconLink size={12} />
        Open candidate
      </Link>
    </li>
  );
}
