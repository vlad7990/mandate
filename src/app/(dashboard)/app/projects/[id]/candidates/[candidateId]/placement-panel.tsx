"use client";

/**
 * The placement record, on the candidate it belongs to.
 *
 * A recruiter is standing on this page when the offer lands, so this is
 * where the offer is recorded — not in a separate section they would have
 * to remember to visit. Everything the revenue screen reports is written
 * from here.
 *
 * ## What a viewer sees
 *
 * The placement and its dates, and where the fee would be, the word
 * "Restricted". Not a blank — a blank reads as "no fee recorded", and a
 * recruiter chasing an unrecorded fee has to be able to tell those two
 * apart. `canSeeFees` is decided on the server by `canReadPlacementFees`,
 * and RLS has already refused to send the numbers regardless, so this
 * component is never holding a figure it declines to draw.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  PANEL_BODY,
  PANEL_BUTTON,
  PANEL_BUTTON_QUIET,
  Panel,
  PanelMeta,
} from "@/components/projects/panel";
import { FEE_WITHHELD_LABEL } from "@/lib/fees/access";
import {
  formatMoney,
  guaranteeState,
  GUARANTEE_STATE_LABELS,
  pipelineValue,
} from "@/lib/fees/compute";
import {
  FEE_LINE_STATUS_LABELS,
  FEE_MODEL_LABELS,
  FEE_TRIGGER_LABELS,
  PLACEMENT_STATUS_LABELS,
  TERMS_SOURCE_LABELS,
  type FeeLineRow,
  type PlacementFeeRow,
  type PlacementRow,
  type PlacementStatus,
} from "@/lib/fees/types";
import {
  markFeeLineEarnedAction,
  recordPlacementAction,
  savePlacementFeeAction,
  updatePlacementStatusAction,
} from "./placement-actions";

const FIELD =
  "w-full min-w-0 border border-outline-variant bg-surface px-3 py-2 font-mono-label text-mono-label uppercase tracking-wider text-on-surface tabular-nums focus:border-primary focus:outline-none";

const LABEL =
  "block font-mono-label text-[11px] uppercase tracking-[0.08em] text-outline";

/** Status chips. Fell-through is the only one that should read as a problem. */
const STATUS_TONE: Record<PlacementStatus, string> = {
  offered: "border-outline-variant text-on-surface-variant",
  declined: "border-outline-variant text-outline",
  accepted: "border-primary/40 text-primary",
  started: "border-primary/40 text-primary",
  fell_through: "border-tertiary/50 text-tertiary",
};

export type PlacementPanelProps = {
  projectId: string;
  candidateId: string;
  candidateName: string;
  placement: PlacementRow | null;
  fee: PlacementFeeRow | null;
  lines: FeeLineRow[];
  /** Decided server-side — capability, or credit on this placement. */
  canSeeFees: boolean;
  /** Whether this caller may record and edit. `mandates:write`. */
  canWrite: boolean;
  /** Today, from the server, so server and client agree across midnight. */
  today: string;
  baseCurrency: string;
  /** Terms in force, for the "what will this bill" hint. Null when none. */
  termsSummary: string | null;
};

export function PlacementPanel(props: PlacementPanelProps) {
  const { placement, canWrite } = props;

  if (!placement) {
    return <NoPlacement {...props} />;
  }

  return <ExistingPlacement {...props} placement={placement} canWrite={canWrite} />;
}

function NoPlacement({
  projectId,
  candidateId,
  canWrite,
  today,
  termsSummary,
}: PlacementPanelProps) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();

  return (
    <Panel
      title="Placement"
      meta={<PanelMeta>No offer recorded</PanelMeta>}
      action={
        canWrite && !open ? (
          <button type="button" className={PANEL_BUTTON} onClick={() => setOpen(true)}>
            Record offer
          </button>
        ) : null
      }
    >
      {!open && (
        <div className={PANEL_BODY}>
          <p className="text-body-s text-on-surface-variant">
            {canWrite
              ? "Recording an offer starts the placement record — dates, guarantee, and the fee it earns."
              : "No offer has been recorded for this candidate."}
          </p>
        </div>
      )}

      {open && (
        <form
          className={`${PANEL_BODY} space-y-4`}
          action={(formData) =>
            start(async () => {
              try {
                await recordPlacementAction(formData);
                setOpen(false);
                router.refresh();
                toast.success("Offer recorded");
              } catch (error) {
                toast.error(error instanceof Error ? error.message : "Could not record the offer");
              }
            })
          }
        >
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="candidateId" value={candidateId} />

          {termsSummary && (
            <p className="font-mono-label text-[11px] uppercase tracking-[0.08em] text-outline">
              {`Terms in force // ${termsSummary}`}
            </p>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="space-y-1.5">
              <span className={LABEL}>Offer date</span>
              <input type="date" name="offerDate" defaultValue={today} className={FIELD} />
            </label>
            <label className="space-y-1.5">
              <span className={LABEL}>Base salary</span>
              <input
                name="baseSalary"
                inputMode="decimal"
                placeholder="250,000"
                className={FIELD}
              />
            </label>
            <label className="space-y-1.5">
              <span className={LABEL}>Guaranteed bonus</span>
              <input name="guaranteedBonus" inputMode="decimal" className={FIELD} />
            </label>
            <label className="space-y-1.5">
              <span className={LABEL}>Other cash</span>
              <input name="otherCash" inputMode="decimal" className={FIELD} />
            </label>
          </div>

          <p className="text-body-s text-on-surface-variant">
            The package is optional now — an offer often goes out before it is final. The
            fee is computed from it when you add it.
          </p>

          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={pending} className={PANEL_BUTTON}>
              {pending ? "Recording…" : "Record offer"}
            </button>
            <button
              type="button"
              className={PANEL_BUTTON_QUIET}
              onClick={() => setOpen(false)}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </Panel>
  );
}

function ExistingPlacement({
  projectId,
  candidateId,
  placement,
  fee,
  lines,
  canSeeFees,
  canWrite,
  today,
  baseCurrency,
}: PlacementPanelProps & { placement: PlacementRow }) {
  const [pending, start] = useTransition();
  const [editingFee, setEditingFee] = useState(false);
  const [fallingThrough, setFallingThrough] = useState(false);
  const router = useRouter();

  const guarantee = guaranteeState(placement, today);
  const outstanding = canSeeFees ? pipelineValue(lines) : 0;

  function run(action: (fd: FormData) => Promise<void>, fd: FormData, ok: string) {
    start(async () => {
      try {
        await action(fd);
        router.refresh();
        toast.success(ok);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Something went wrong");
      }
    });
  }

  return (
    <Panel
      title="Placement"
      meta={
        <span
          className={`border px-2 py-0.5 font-mono-label text-[11px] uppercase tracking-[0.08em] ${
            STATUS_TONE[placement.status]
          }`}
        >
          {PLACEMENT_STATUS_LABELS[placement.status]}
        </span>
      }
      action={
        canWrite ? (
          <StatusActions
            placement={placement}
            pending={pending}
            today={today}
            projectId={projectId}
            candidateId={candidateId}
            onRun={run}
            onFallThrough={() => setFallingThrough(true)}
          />
        ) : null
      }
    >
      <div className={`${PANEL_BODY} space-y-5`}>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
          <Field label="Offer" value={placement.offer_date} />
          <Field label="Accepted" value={placement.accepted_date} />
          <Field label="Start" value={placement.start_date} />
          <Field
            label="Guarantee"
            value={
              guarantee === "none"
                ? null
                : `${GUARANTEE_STATE_LABELS[guarantee]}${
                    placement.guarantee_ends_on ? ` · ${placement.guarantee_ends_on}` : ""
                  }`
            }
          />
        </dl>

        {placement.status === "fell_through" && placement.fell_through_reason && (
          <p className="border-l-2 border-tertiary/50 pl-3 text-body-s text-on-surface-variant">
            {placement.fell_through_reason}
          </p>
        )}

        {/* The fee. Restricted rather than blank — see the note at the top. */}
        {!canSeeFees && (
          <div className="border border-outline-variant/60 px-3 py-2.5">
            <p className="font-mono-label text-[11px] uppercase tracking-[0.08em] text-outline">
              {`Fee // ${FEE_WITHHELD_LABEL}`}
            </p>
            <p className="mt-1 text-body-s text-on-surface-variant">
              Fees are visible to admins and recruiters, and to whoever is credited on the
              placement.
            </p>
          </div>
        )}

        {canSeeFees && !fee && (
          <div className="border border-outline-variant/60 px-3 py-2.5">
            <p className="font-mono-label text-[11px] uppercase tracking-[0.08em] text-outline">
              No fee recorded
            </p>
            {canWrite && (
              <button
                type="button"
                className={`${PANEL_BUTTON_QUIET} mt-2.5`}
                onClick={() => setEditingFee(true)}
              >
                Add the fee
              </button>
            )}
          </div>
        )}

        {canSeeFees && fee && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="font-h1 text-[22px] tabular-nums text-on-surface">
                {formatMoney(fee.total_fee_amount, fee.currency)}
              </span>
              {fee.currency !== fee.base_currency && (
                <span className="font-mono-label text-[11px] uppercase tracking-[0.08em] text-outline tabular-nums">
                  {`${formatMoney(fee.total_fee_base_amount, fee.base_currency)} at ${fee.fx_rate} // fixed ${fee.fx_rate_fixed_on}`}
                </span>
              )}
            </div>

            <p className="font-mono-label text-[11px] uppercase tracking-[0.08em] text-outline tabular-nums">
              {[
                FEE_MODEL_LABELS[fee.fee_model],
                fee.fee_percentage != null ? `${fee.fee_percentage}%` : null,
                TERMS_SOURCE_LABELS[fee.terms_source],
                outstanding > 0
                  ? `${formatMoney(outstanding, baseCurrency)} outstanding`
                  : null,
              ]
                .filter(Boolean)
                .join(" // ")}
            </p>

            {lines.length > 0 && (
              <FeeLedger
                lines={lines}
                canWrite={canWrite}
                pending={pending}
                today={today}
                projectId={projectId}
                candidateId={candidateId}
                onRun={run}
              />
            )}

            {canWrite && !editingFee && (
              <button
                type="button"
                className={PANEL_BUTTON_QUIET}
                onClick={() => setEditingFee(true)}
              >
                Edit fee
              </button>
            )}
          </div>
        )}

        {canSeeFees && canWrite && editingFee && (
          <FeeForm
            placementId={placement.id}
            projectId={projectId}
            candidateId={candidateId}
            fee={fee}
            pending={pending}
            onCancel={() => setEditingFee(false)}
            onSubmit={(fd) => {
              setEditingFee(false);
              run(savePlacementFeeAction, fd, "Fee saved");
            }}
          />
        )}

        {canWrite && fallingThrough && (
          <form
            className="space-y-3 border border-tertiary/40 px-3 py-3"
            action={(fd) => {
              setFallingThrough(false);
              run(updatePlacementStatusAction, fd, "Placement marked as fallen through");
            }}
          >
            <input type="hidden" name="placementId" value={placement.id} />
            <input type="hidden" name="projectId" value={projectId} />
            <input type="hidden" name="candidateId" value={candidateId} />
            <input type="hidden" name="status" value="fell_through" />

            <p className="font-mono-label text-mono-label uppercase tracking-widest text-tertiary">
              Record a fallthrough
            </p>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="space-y-1.5">
                <span className={LABEL}>Date</span>
                <input type="date" name="effectiveDate" defaultValue={today} className={FIELD} />
              </label>
              <label className="space-y-1.5">
                <span className={LABEL}>Reason</span>
                <input name="reason" className={FIELD} placeholder="Left inside guarantee" />
              </label>
            </div>

            {canSeeFees && (
              <label className="flex items-start gap-2.5">
                <input
                  type="checkbox"
                  name="clawBack"
                  defaultChecked={guarantee === "running"}
                  className="mt-0.5 size-4 shrink-0 accent-[var(--color-primary)]"
                />
                <span className="text-body-s text-on-surface-variant">
                  Claw back the fee already billed. Pending instalments are cancelled either
                  way; this books a reversal dated today against what was earned, so the
                  quarter that billed it still reports having billed it.
                </span>
              </label>
            )}

            <div className="flex flex-wrap gap-2">
              <button type="submit" disabled={pending} className={PANEL_BUTTON}>
                {pending ? "Recording…" : "Record fallthrough"}
              </button>
              <button
                type="button"
                className={PANEL_BUTTON_QUIET}
                onClick={() => setFallingThrough(false)}
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </Panel>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="min-w-0">
      <dt className={LABEL}>{label}</dt>
      <dd className="mt-1 truncate font-mono-label text-mono-label uppercase tracking-wider text-on-surface tabular-nums">
        {value ?? "—"}
      </dd>
    </div>
  );
}

/**
 * The status buttons, which are the transitions that make sense from here.
 *
 * Only forward moves are offered. Going backwards is a correction rather
 * than a workflow step, and offering it beside the others would make
 * "Accepted" and "Un-accept" look like equal choices.
 */
function StatusActions({
  placement,
  pending,
  today,
  projectId,
  candidateId,
  onRun,
  onFallThrough,
}: {
  placement: PlacementRow;
  pending: boolean;
  today: string;
  projectId: string;
  candidateId: string;
  onRun: (action: (fd: FormData) => Promise<void>, fd: FormData, ok: string) => void;
  onFallThrough: () => void;
}) {
  const next: Array<{ status: PlacementStatus; label: string }> = [];

  if (placement.status === "offered") {
    next.push({ status: "accepted", label: "Accepted" });
    next.push({ status: "declined", label: "Declined" });
  }
  if (placement.status === "accepted") {
    next.push({ status: "started", label: "Started" });
  }

  const canFallThrough =
    placement.status === "accepted" || placement.status === "started";

  if (next.length === 0 && !canFallThrough) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {next.map((step) => (
        <button
          key={step.status}
          type="button"
          disabled={pending}
          className={PANEL_BUTTON_QUIET}
          onClick={() => {
            const fd = new FormData();
            fd.set("placementId", placement.id);
            fd.set("projectId", projectId);
            fd.set("candidateId", candidateId);
            fd.set("status", step.status);
            fd.set("effectiveDate", today);
            onRun(updatePlacementStatusAction, fd, `Marked ${step.label.toLowerCase()}`);
          }}
        >
          {step.label}
        </button>
      ))}
      {canFallThrough && (
        <button type="button" className={PANEL_BUTTON_QUIET} onClick={onFallThrough}>
          Fell through
        </button>
      )}
    </div>
  );
}

/**
 * The ledger.
 *
 * Instalments and reversals in one list, in the order they were billed,
 * because that is the order a person reconciles them in. A reversal reads
 * as negative because it is stored negative — no separate "credit"
 * column, and no sign flipping at display time that could disagree with
 * the sum.
 */
function FeeLedger({
  lines,
  canWrite,
  pending,
  today,
  projectId,
  candidateId,
  onRun,
}: {
  lines: FeeLineRow[];
  canWrite: boolean;
  pending: boolean;
  today: string;
  projectId: string;
  candidateId: string;
  onRun: (action: (fd: FormData) => Promise<void>, fd: FormData, ok: string) => void;
}) {
  return (
    <div className="border border-outline-variant/60">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-left">
          <thead>
            <tr className="border-b border-outline-variant/60">
              <th className={`${LABEL} px-3 py-2 font-normal`}>Instalment</th>
              <th className={`${LABEL} px-3 py-2 font-normal`}>Trigger</th>
              <th className={`${LABEL} px-3 py-2 text-right font-normal`}>Amount</th>
              <th className={`${LABEL} px-3 py-2 font-normal`}>Status</th>
              <th className={`${LABEL} px-3 py-2 font-normal`}>Earned</th>
              {canWrite && <th className="px-3 py-2" />}
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.id} className="border-b border-outline-variant/30 last:border-0">
                <td className="max-w-0 truncate px-3 py-2 text-body-s text-on-surface">
                  {line.label}
                </td>
                <td className="px-3 py-2 font-mono-label text-[11px] uppercase tracking-[0.08em] text-outline">
                  {line.trigger ? FEE_TRIGGER_LABELS[line.trigger] : "—"}
                </td>
                <td
                  className={`px-3 py-2 text-right font-mono-label text-mono-label tabular-nums ${
                    line.amount < 0 ? "text-tertiary" : "text-on-surface"
                  }`}
                >
                  {formatMoney(line.amount, line.currency)}
                </td>
                <td className="px-3 py-2 font-mono-label text-[11px] uppercase tracking-[0.08em] text-outline">
                  {FEE_LINE_STATUS_LABELS[line.status]}
                </td>
                <td className="px-3 py-2 font-mono-label text-[11px] tracking-[0.08em] text-outline tabular-nums">
                  {line.earned_on ?? "—"}
                </td>
                {canWrite && (
                  <td className="px-3 py-2 text-right">
                    {line.status === "pending" && (
                      <button
                        type="button"
                        disabled={pending}
                        className="font-mono-label text-[11px] uppercase tracking-[0.08em] text-primary hover:underline disabled:opacity-60"
                        onClick={() => {
                          const fd = new FormData();
                          fd.set("lineId", line.id);
                          fd.set("projectId", projectId);
                          fd.set("candidateId", candidateId);
                          fd.set("earnedOn", today);
                          onRun(markFeeLineEarnedAction, fd, "Instalment marked earned");
                        }}
                      >
                        Mark earned
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FeeForm({
  placementId,
  projectId,
  candidateId,
  fee,
  pending,
  onCancel,
  onSubmit,
}: {
  placementId: string;
  projectId: string;
  candidateId: string;
  fee: PlacementFeeRow | null;
  pending: boolean;
  onCancel: () => void;
  onSubmit: (fd: FormData) => void;
}) {
  return (
    <form className="space-y-4 border border-outline-variant/60 px-3 py-3" action={onSubmit}>
      <input type="hidden" name="placementId" value={placementId} />
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="candidateId" value={candidateId} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="space-y-1.5">
          <span className={LABEL}>Base salary</span>
          <input
            name="baseSalary"
            inputMode="decimal"
            defaultValue={fee?.base_salary ?? ""}
            className={FIELD}
          />
        </label>
        <label className="space-y-1.5">
          <span className={LABEL}>Guaranteed bonus</span>
          <input
            name="guaranteedBonus"
            inputMode="decimal"
            defaultValue={fee?.guaranteed_bonus ?? ""}
            className={FIELD}
          />
        </label>
        <label className="space-y-1.5">
          <span className={LABEL}>Other cash</span>
          <input
            name="otherCash"
            inputMode="decimal"
            defaultValue={fee?.other_cash ?? ""}
            className={FIELD}
          />
        </label>
        <label className="space-y-1.5">
          <span className={LABEL}>Fee %</span>
          <input
            name="feePercentage"
            inputMode="decimal"
            defaultValue={fee?.fee_percentage ?? ""}
            className={FIELD}
          />
        </label>
        <label className="space-y-1.5">
          <span className={LABEL}>Currency</span>
          <input
            name="currency"
            maxLength={3}
            defaultValue={fee?.currency ?? ""}
            className={FIELD}
          />
        </label>
        <label className="space-y-1.5">
          <span className={LABEL}>Rate to base</span>
          <input
            name="fxRate"
            inputMode="decimal"
            defaultValue={fee?.fx_rate ?? ""}
            className={FIELD}
          />
        </label>
      </div>

      <label className="space-y-1.5">
        <span className={LABEL}>Total fee — overrides the computed one</span>
        <input
          name="totalFeeAmount"
          inputMode="decimal"
          defaultValue={fee?.total_fee_amount ?? ""}
          className={FIELD}
        />
      </label>

      <p className="text-body-s text-on-surface-variant">
        Leave the total blank to compute it from the package and the percentage. Instalments
        already earned are never rewritten — if something has been billed, this changes the
        headline and leaves the ledger alone.
      </p>

      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={pending} className={PANEL_BUTTON}>
          {pending ? "Saving…" : "Save fee"}
        </button>
        <button type="button" className={PANEL_BUTTON_QUIET} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
