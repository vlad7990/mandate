"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { unwrap } from "@/lib/actions/result";
import { mergeCandidatesAction } from "./merge-actions";
import {
  previewMerge,
  describeConfirm,
  type RecordSummary,
} from "@/lib/candidates/merge";
import { cn } from "@/lib/utils";

/**
 * The merge affordance on §201's identity-review notice.
 *
 * ## No default survivor, on purpose
 *
 * The product does not guess which of two people's records matters more.
 * Both sides are laid out with what they actually carry and the recruiter
 * presses "Keep this one" on the record they mean — which is also how they
 * choose which CV survives, since there is no multi-CV model and §073's D9
 * refused moving `cv_url` without a re-parse.
 *
 * ## `canMerge` is REQUIRED, not optional-with-a-default
 *
 * §199's rule: a disabled button is a promise the product cannot keep, and
 * `CapabilityGate` cannot reach inside a client component. The page reads
 * the capability once and passes it down; tsc then refuses any future
 * render site that forgets it.
 */
export function MergePanel({
  projectId,
  thisRecord,
  otherRecord,
  canMerge,
}: {
  projectId: string;
  thisRecord: RecordSummary;
  otherRecord: RecordSummary;
  canMerge: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);

  if (!canMerge) {
    // The flag still reads; the control does not appear. Silence would
    // look broken rather than restricted, so the reason is stated.
    return (
      <p className="mt-2 font-mono-label text-mono-label uppercase tracking-widest text-outline">
        Read-only · merging records is a recruiter&apos;s act
      </p>
    );
  }

  async function merge(keep: RecordSummary, discard: RecordSummary) {
    const preview = previewMerge(keep, discard);
    if (preview.refused) {
      toast.error(preview.refusal ?? "That merge cannot be made.");
      return;
    }
    if (!window.confirm(describeConfirm(keep, discard, preview))) return;

    setRunning(true);
    try {
      const { keptId, message } = unwrap(
        await mergeCandidatesAction(projectId, keep.id, discard.id)
      );
      toast.success(message, { duration: 15_000 });
      router.push(`/app/projects/${projectId}/candidates/${keptId}`);
      router.refresh();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "The merge did not happen."
      );
    } finally {
      setRunning(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2 border border-outline-variant px-3 py-1.5 font-mono-label text-[11px] uppercase tracking-[0.1em] text-on-surface-variant transition-colors hover:border-primary hover:text-primary"
      >
        Merge these records
      </button>
    );
  }

  return (
    <div className="mt-3 border border-outline-variant bg-surface-container-lowest p-3">
      <p className="text-[13px] leading-relaxed text-on-surface-variant">
        Choose the record to <strong className="text-on-surface">keep</strong>.
        Its CV, its score and its stage are the ones that survive; everything
        written about the other record — notes, feedback, history — moves
        across.
      </p>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <RecordCard
          record={thisRecord}
          label="This record"
          disabled={running}
          onKeep={() => merge(thisRecord, otherRecord)}
        />
        <RecordCard
          record={otherRecord}
          label="The other record"
          disabled={running}
          onKeep={() => merge(otherRecord, thisRecord)}
        />
      </div>

      <button
        type="button"
        onClick={() => setOpen(false)}
        disabled={running}
        className="mt-3 font-mono-label text-mono-label uppercase tracking-widest text-outline transition-colors hover:text-on-surface disabled:opacity-50"
      >
        Cancel
      </button>
    </div>
  );
}

function RecordCard({
  record,
  label,
  disabled,
  onKeep,
}: {
  record: RecordSummary;
  label: string;
  disabled: boolean;
  onKeep: () => void;
}) {
  // Every line is a fact read off the row. Absence is stated rather than
  // left blank, so "no score" cannot be mistaken for "not loaded".
  const facts: Array<[string, string]> = [
    ["Stage", record.stage ?? "—"],
    ["Score", record.score === null ? "not scored" : String(record.score)],
    ["Notes", String(record.notes)],
    ["CV", record.cvName ?? "none"],
    ["Email", record.email ?? "none"],
    ["Title", record.currentTitle ?? "none"],
  ];

  return (
    <div
      className={cn(
        "border border-outline-variant bg-surface p-3",
        record.hasPlacement && "border-warn/50"
      )}
    >
      <div className="font-mono-label text-mono-label uppercase tracking-widest text-outline">
        {label}
      </div>
      <div className="mt-0.5 truncate text-[13px] font-semibold text-on-surface">
        {record.fullName}
      </div>

      <dl className="mt-2 space-y-0.5">
        {facts.map(([k, v]) => (
          <div key={k} className="flex items-baseline gap-2 text-[12px]">
            <dt className="w-14 shrink-0 font-mono-label text-mono-label uppercase tracking-widest text-outline">
              {k}
            </dt>
            <dd className="min-w-0 truncate text-on-surface-variant">{v}</dd>
          </div>
        ))}
      </dl>

      {record.hasPlacement && (
        <p className="mt-2 text-[12px] leading-relaxed text-warn">
          Carries a placement — this record cannot be the one discarded.
        </p>
      )}

      <button
        type="button"
        onClick={onKeep}
        disabled={disabled}
        className="btn-notch mt-3 w-full bg-primary-container px-3 py-1.5 font-mono-label text-[11px] font-semibold uppercase tracking-[0.1em] text-on-primary-container transition-[filter,transform] hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
      >
        Keep this one
      </button>
    </div>
  );
}
