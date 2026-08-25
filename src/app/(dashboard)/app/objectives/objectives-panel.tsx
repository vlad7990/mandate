"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { unwrap } from "@/lib/actions/result";
import { StatusChip, type ChipTone } from "@/components/ui/status-chip";
import { formatMoney } from "@/lib/fees/compute";
import {
  FINANCIAL_METRICS,
  KEY_RESULT_KIND_LABELS,
  KEY_RESULT_STATUS_LABELS,
  METRIC_LABELS,
  OBJECTIVE_STATUS_LABELS,
  QUANTITATIVE_METRICS,
  type KeyResultKind,
  type KeyResultRow,
  type KeyResultStatus,
  type ObjectiveStatus,
} from "@/lib/okrs/types";
import {
  abandonObjectiveAction,
  addKeyResultAction,
  attestKeyResultAction,
  closeObjectiveAction,
  createObjectiveAction,
} from "./actions";

const inputClass =
  "bg-surface-container-low border border-outline-variant px-3 py-2 text-body-main text-on-surface placeholder:text-outline focus:border-primary focus:ring-0 outline-none transition-colors";

const STATUS_TONE: Record<KeyResultStatus, ChipTone> = {
  on_track: "secondary",
  met: "primary",
  behind: "warn",
  at_risk: "danger",
  pending: "neutral",
};

const OBJECTIVE_TONE: Record<ObjectiveStatus, ChipTone> = {
  draft: "neutral",
  active: "secondary",
  closed: "primary",
  abandoned: "neutral",
};

export type KeyResultVM = Pick<
  KeyResultRow,
  "id" | "kind" | "label" | "metric_source" | "target_value" | "currency" | "direction"
> & {
  attestedLabel: string | null;
  /** Null for qualitative rows, and for financial rows RLS withheld nothing to compute. */
  current: number | null;
  status: KeyResultStatus;
};

export type ObjectiveVM = {
  id: string;
  title: string;
  detail: string;
  status: ObjectiveStatus;
  periodStart: string;
  periodEnd: string;
  ownerLabel: string;
  projectTitle: string | null;
  keyResults: KeyResultVM[];
};

/**
 * The objectives board (107): create, add key results, attest
 * milestones, close, abandon. Viewing is org-wide; every mutation is
 * behind `okrs:write` and the owner-or-desk RLS — a viewer gets the
 * list and none of the buttons.
 */
export function ObjectivesPanel({
  objectives,
  canWrite,
  ownerOptions,
  projects,
}: {
  objectives: ObjectiveVM[];
  canWrite: boolean;
  /** Active managers and recruiters — the only legal owners. Empty hides the picker. */
  ownerOptions: Array<{ id: string; label: string }>;
  projects: Array<{ id: string; title: string }>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);

  const run = (key: string, fn: () => Promise<unknown>, ok: string) => {
    if (busy) return;
    setBusy(key);
    start(async () => {
      try {
        await fn();
        toast.success(ok);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "The objective change failed.");
      } finally {
        setBusy(null);
      }
    });
  };

  const handleCreate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);
    start(async () => {
      try {
        unwrap(await createObjectiveAction(formData));
        toast.success("Objective created");
        form.reset();
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Create failed.");
      }
    });
  };

  return (
    <section aria-label="Objectives" className="space-y-4">
      {canWrite && (
        <form
          onSubmit={handleCreate}
          className="flex flex-wrap items-end gap-2 border border-outline-variant bg-surface-container-low px-4 py-3"
        >
          <label className="min-w-[220px] flex-1 space-y-1">
            <span className="font-mono-label text-mono-label uppercase tracking-widest text-outline">
              New objective *
            </span>
            <input
              name="title"
              required
              maxLength={140}
              placeholder="e.g. Close the fintech book by quarter-end"
              className={cn(inputClass, "w-full")}
            />
          </label>
          {ownerOptions.length > 0 && (
            <label className="space-y-1">
              <span className="font-mono-label text-mono-label uppercase tracking-widest text-outline">
                Owner
              </span>
              <select name="owner_user_id" defaultValue="" className={inputClass}>
                <option value="">Myself</option>
                {ownerOptions.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="space-y-1">
            <span className="font-mono-label text-mono-label uppercase tracking-widest text-outline">
              Mandate
            </span>
            <select name="project_id" defaultValue="" className={inputClass}>
              <option value="">Whole book</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="font-mono-label text-mono-label uppercase tracking-widest text-outline">
              From *
            </span>
            <input type="date" name="period_start" required className={inputClass} />
          </label>
          <label className="space-y-1">
            <span className="font-mono-label text-mono-label uppercase tracking-widest text-outline">
              To *
            </span>
            <input type="date" name="period_end" required className={inputClass} />
          </label>
          <button
            type="submit"
            disabled={pending}
            className="btn-notch bg-primary-container px-4 py-2 font-mono-label text-mono-label uppercase tracking-widest text-on-primary-container transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-60"
          >
            {pending ? "Saving…" : "Create"}
          </button>
        </form>
      )}

      {objectives.length === 0 ? (
        <p className="border border-outline-variant bg-surface-container-low px-4 py-3 text-body-main text-on-surface-variant">
          No objectives yet. An objective is a period-bound goal owned by a
          recruiter or manager — its key results are measured from the
          pipeline, the placements and the trail, or attested by hand.
          Closed and abandoned objectives keep their rows.
        </p>
      ) : (
        objectives.map((o) => (
          <ObjectiveCard
            key={o.id}
            objective={o}
            canWrite={canWrite}
            busy={busy}
            run={run}
          />
        ))
      )}
    </section>
  );
}

function ObjectiveCard({
  objective: o,
  canWrite,
  busy,
  run,
}: {
  objective: ObjectiveVM;
  canWrite: boolean;
  busy: string | null;
  run: (key: string, fn: () => Promise<unknown>, ok: string) => void;
}) {
  const open = o.status === "active" || o.status === "draft";

  return (
    <div className="border border-outline-variant">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-outline-variant/60 bg-surface-container-low px-4 py-3">
        <div className="min-w-0 flex-1">
          <span className="text-on-surface">{o.title}</span>
          <span className="ml-2 font-mono-label text-mono-label uppercase tracking-wider text-outline">
            {o.ownerLabel}
          </span>
          <span className="ml-2 font-mono-data text-mono-data tabular-nums text-outline">
            {o.periodStart} → {o.periodEnd}
          </span>
          <span className="ml-2 font-mono-label text-[11px] uppercase tracking-wider text-on-surface-variant">
            {o.projectTitle ?? "whole book"}
          </span>
        </div>
        <StatusChip tone={OBJECTIVE_TONE[o.status]}>
          {OBJECTIVE_STATUS_LABELS[o.status]}
        </StatusChip>
        {canWrite && open && (
          <>
            <button
              type="button"
              disabled={busy === o.id}
              onClick={() =>
                run(
                  o.id,
                  async () => unwrap(await closeObjectiveAction(o.id, "met")),
                  "Objective closed — met"
                )
              }
              className="font-mono-label text-mono-label uppercase tracking-widest text-outline transition-colors hover:text-primary disabled:opacity-60"
            >
              Close met
            </button>
            <button
              type="button"
              disabled={busy === o.id}
              onClick={() =>
                run(
                  o.id,
                  async () => unwrap(await closeObjectiveAction(o.id, "missed")),
                  "Objective closed — missed"
                )
              }
              className="font-mono-label text-mono-label uppercase tracking-widest text-outline transition-colors hover:text-warn disabled:opacity-60"
            >
              Close missed
            </button>
            <button
              type="button"
              disabled={busy === o.id}
              onClick={() => {
                if (!window.confirm(`Abandon "${o.title}"? The row stays, marked abandoned.`)) return;
                run(
                  o.id,
                  async () => unwrap(await abandonObjectiveAction(o.id)),
                  "Objective abandoned"
                );
              }}
              className="font-mono-label text-mono-label uppercase tracking-widest text-outline transition-colors hover:text-error disabled:opacity-60"
            >
              Abandon
            </button>
          </>
        )}
      </div>

      {o.keyResults.length === 0 ? (
        <p className="px-4 py-3 text-body-s text-on-surface-variant">
          No key results yet — an objective without commitments measures nothing.
        </p>
      ) : (
        <div className="divide-y divide-outline-variant/40">
          {o.keyResults.map((kr) => (
            <KeyResultLine key={kr.id} kr={kr} canWrite={canWrite && open} busy={busy} run={run} />
          ))}
        </div>
      )}

      {canWrite && open && <AddKeyResultForm objectiveId={o.id} />}
    </div>
  );
}

function KeyResultLine({
  kr,
  canWrite,
  busy,
  run,
}: {
  kr: KeyResultVM;
  canWrite: boolean;
  busy: string | null;
  run: (key: string, fn: () => Promise<unknown>, ok: string) => void;
}) {
  const measured = kr.kind !== "qualitative" && kr.target_value !== null;
  const currentShown =
    kr.current === null
      ? null
      : kr.kind === "financial"
        ? formatMoney(kr.current, kr.currency ?? "USD")
        : String(kr.current);
  const targetShown = measured
    ? kr.kind === "financial"
      ? formatMoney(kr.target_value ?? 0, kr.currency ?? "USD")
      : String(kr.target_value)
    : null;
  const fraction =
    measured && kr.current !== null && (kr.target_value ?? 0) > 0
      ? Math.min(1, kr.current / (kr.target_value ?? 1))
      : null;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
      <span className="font-mono-label text-[11px] uppercase tracking-[0.08em] text-outline">
        {KEY_RESULT_KIND_LABELS[kr.kind]}
      </span>
      <div className="min-w-0 flex-1">
        <span className="text-body-s text-on-surface">{kr.label}</span>
        {kr.metric_source && (
          <span className="ml-2 font-mono-label text-[11px] uppercase tracking-wider text-outline">
            {METRIC_LABELS[kr.metric_source]}
            {kr.direction === "at_most" ? " · at most" : ""}
          </span>
        )}
        {kr.attestedLabel && (
          <span className="ml-2 font-mono-label text-[11px] uppercase tracking-wider text-on-surface-variant">
            attested · {kr.attestedLabel}
          </span>
        )}
      </div>
      {measured && (
        <span className="font-mono-data text-mono-data tabular-nums text-on-surface">
          {currentShown ?? "—"}
          <span className="text-outline"> / {targetShown}</span>
        </span>
      )}
      {fraction !== null && (
        <span
          aria-hidden
          className="hidden h-1 w-24 shrink-0 bg-surface-container-high sm:block"
        >
          <span
            className={cn(
              "block h-1",
              kr.status === "at_risk"
                ? "bg-error"
                : kr.status === "behind"
                  ? "bg-warn"
                  : "bg-primary"
            )}
            style={{ width: `${Math.round(fraction * 100)}%` }}
          />
        </span>
      )}
      <StatusChip tone={STATUS_TONE[kr.status]}>
        {KEY_RESULT_STATUS_LABELS[kr.status]}
      </StatusChip>
      {kr.kind === "qualitative" && !kr.attestedLabel && canWrite && (
        <button
          type="button"
          disabled={busy === kr.id}
          onClick={() =>
            run(
              kr.id,
              async () => unwrap(await attestKeyResultAction(kr.id)),
              "Milestone attested"
            )
          }
          className="font-mono-label text-mono-label uppercase tracking-widest text-outline transition-colors hover:text-primary disabled:opacity-60"
        >
          Attest
        </button>
      )}
    </div>
  );
}

function AddKeyResultForm({ objectiveId }: { objectiveId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [kind, setKind] = useState<KeyResultKind>("quantitative");

  const metrics =
    kind === "financial" ? FINANCIAL_METRICS : kind === "quantitative" ? QUANTITATIVE_METRICS : [];

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);
    start(async () => {
      try {
        unwrap(await addKeyResultAction(formData));
        toast.success("Key result added");
        form.reset();
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Add failed.");
      }
    });
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-wrap items-end gap-2 border-t border-outline-variant/60 bg-surface-container-low px-4 py-3"
    >
      <input type="hidden" name="objective_id" value={objectiveId} />
      <label className="space-y-1">
        <span className="font-mono-label text-mono-label uppercase tracking-widest text-outline">
          Kind
        </span>
        <select
          name="kind"
          value={kind}
          onChange={(e) => setKind(e.target.value as KeyResultKind)}
          className={inputClass}
        >
          <option value="quantitative">Quantitative</option>
          <option value="financial">Financial</option>
          <option value="qualitative">Qualitative</option>
        </select>
      </label>
      <label className="min-w-[200px] flex-1 space-y-1">
        <span className="font-mono-label text-mono-label uppercase tracking-widest text-outline">
          Key result *
        </span>
        <input
          name="label"
          required
          maxLength={140}
          placeholder={
            kind === "qualitative"
              ? "e.g. Calibration signed off with the HM"
              : "e.g. Twelve submissions this quarter"
          }
          className={cn(inputClass, "w-full")}
        />
      </label>
      {kind !== "qualitative" && (
        <>
          <label className="space-y-1">
            <span className="font-mono-label text-mono-label uppercase tracking-widest text-outline">
              Metric
            </span>
            <select name="metric_source" defaultValue={metrics[0]} className={inputClass}>
              {metrics.map((m) => (
                <option key={m} value={m}>
                  {METRIC_LABELS[m]}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="font-mono-label text-mono-label uppercase tracking-widest text-outline">
              Target *
            </span>
            <input
              type="number"
              name="target_value"
              required
              min="0.01"
              step="0.01"
              className={cn(inputClass, "w-28 tabular-nums")}
            />
          </label>
          <label className="space-y-1">
            <span className="font-mono-label text-mono-label uppercase tracking-widest text-outline">
              Direction
            </span>
            <select name="direction" defaultValue="at_least" className={inputClass}>
              <option value="at_least">At least</option>
              <option value="at_most">At most</option>
            </select>
          </label>
        </>
      )}
      {kind === "financial" && (
        <label className="space-y-1">
          <span className="font-mono-label text-mono-label uppercase tracking-widest text-outline">
            Currency *
          </span>
          <input
            name="currency"
            required
            maxLength={3}
            placeholder="USD"
            className={cn(inputClass, "w-20 uppercase")}
          />
        </label>
      )}
      <button
        type="submit"
        disabled={pending}
        className="btn-notch bg-primary-container px-4 py-2 font-mono-label text-mono-label uppercase tracking-widest text-on-primary-container transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-60"
      >
        {pending ? "Saving…" : "Add"}
      </button>
    </form>
  );
}
