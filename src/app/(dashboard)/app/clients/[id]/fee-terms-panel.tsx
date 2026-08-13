"use client";

/**
 * The client's standard commercial agreement.
 *
 * Terms live here; amounts live on the placement. A placement snapshots
 * whatever was in force when it was priced, so editing this changes what
 * the *next* placement bills and never restates one already booked —
 * which is the same frozen-copy rule as `company_context` in 049.
 *
 * The panel is only rendered for roles that hold `fees:read`; RLS refuses
 * the row to everyone else regardless, so there is no "restricted" state
 * to draw here — the client page simply has one fewer section.
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
import { formatMoney } from "@/lib/fees/compute";
import {
  DEFAULT_RETAINER_PLAN,
  FEE_BASES,
  FEE_BASIS_LABELS,
  FEE_MODELS,
  FEE_MODEL_LABELS,
  FEE_TRIGGERS,
  FEE_TRIGGER_LABELS,
  parseInstalmentPlan,
  type FeeModel,
  type FeeTermsRow,
} from "@/lib/fees/types";
import { deleteFeeTermsAction, saveFeeTermsAction } from "./fee-terms-actions";

const FIELD =
  "w-full min-w-0 border border-outline-variant bg-surface px-3 py-2 font-mono-label text-mono-label uppercase tracking-wider text-on-surface tabular-nums focus:border-primary focus:outline-none";

const LABEL =
  "block font-mono-label text-[11px] uppercase tracking-[0.08em] text-outline";

export function FeeTermsPanel({
  clientId,
  terms,
  canWrite,
}: {
  clientId: string;
  terms: FeeTermsRow | null;
  canWrite: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [model, setModel] = useState<FeeModel>(terms?.fee_model ?? "contingent");
  const [pending, start] = useTransition();
  const router = useRouter();

  const plan = terms ? parseInstalmentPlan(terms.instalment_plan) : [];

  function run(action: (fd: FormData) => Promise<void>, fd: FormData, ok: string) {
    start(async () => {
      try {
        await action(fd);
        setEditing(false);
        router.refresh();
        toast.success(ok);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not save the agreement");
      }
    });
  }

  return (
    <Panel
      title="Commercial terms"
      meta={
        <PanelMeta>
          {terms ? `${FEE_MODEL_LABELS[terms.fee_model]} // ${terms.currency}` : "None on file"}
        </PanelMeta>
      }
      action={
        canWrite && !editing ? (
          <button
            type="button"
            className={terms ? PANEL_BUTTON_QUIET : PANEL_BUTTON}
            onClick={() => {
              setModel(terms?.fee_model ?? "contingent");
              setEditing(true);
            }}
          >
            {terms ? "Edit" : "Add terms"}
          </button>
        ) : null
      }
    >
      {!editing && (
        <div className={`${PANEL_BODY} space-y-4`}>
          {!terms ? (
            <p className="max-w-[68ch] text-body-s leading-relaxed text-on-surface-variant">
              No agreement on file. Placements at this client can still record a fee — the
              numbers are typed in and marked as entered manually. Recording the agreement
              here means every future placement is priced from it without retyping.
            </p>
          ) : (
            <>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
                <Field label="Model" value={FEE_MODEL_LABELS[terms.fee_model]} />
                <Field
                  label="Rate"
                  value={
                    terms.fee_model === "fixed"
                      ? terms.fixed_fee_amount != null
                        ? formatMoney(terms.fixed_fee_amount, terms.currency)
                        : "—"
                      : terms.fee_percentage != null
                        ? `${terms.fee_percentage}%`
                        : "—"
                  }
                />
                <Field label="Basis" value={FEE_BASIS_LABELS[terms.fee_basis]} />
                <Field label="Currency" value={terms.currency} />
                <Field label="Guarantee" value={`${terms.guarantee_days} days`} />
                <Field label="Payment terms" value={`Net ${terms.payment_terms_days}`} />
              </dl>

              {plan.length > 0 && (
                // `relative` on the scroll wrapper for the `sr-only` reason
                // documented on the placements table; `overflow-x-auto` because
                // three columns of label + trigger + share do not fit 257px at
                // 360, and a fee schedule should scroll rather than crush.
                <div className="relative overflow-x-auto border border-outline-variant/60">
                  <table className="w-full min-w-[320px] border-collapse text-left">
                    <thead>
                      <tr className="border-b border-outline-variant/60">
                        <th className={`${LABEL} px-3 py-2 font-normal`}>Instalment</th>
                        <th className={`${LABEL} px-3 py-2 font-normal`}>Trigger</th>
                        <th className={`${LABEL} px-3 py-2 text-right font-normal`}>Share</th>
                      </tr>
                    </thead>
                    <tbody>
                      {plan.map((stage, i) => (
                        <tr key={i} className="border-b border-outline-variant/30 last:border-0">
                          <td className="px-3 py-2 text-body-s text-on-surface">{stage.label}</td>
                          <td className="px-3 py-2 font-mono-label text-[11px] uppercase tracking-[0.08em] text-outline">
                            {FEE_TRIGGER_LABELS[stage.trigger]}
                          </td>
                          <td className="px-3 py-2 text-right font-mono-label text-mono-label text-on-surface tabular-nums">
                            {stage.percent_of_fee}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {terms.notes && (
                <p className="max-w-[68ch] border-l-2 border-outline-variant pl-3 text-body-s leading-relaxed text-on-surface-variant">
                  {terms.notes}
                </p>
              )}

              <p className="font-mono-label text-[11px] uppercase tracking-[0.08em] text-outline">
                Applies to placements priced from now on // booked fees keep their own copy
              </p>
            </>
          )}
        </div>
      )}

      {editing && (
        /*
         * `onSubmit` rather than `action`, because React resets a form once
         * its action returns — including when the action threw. The
         * agreement form validates server-side (the instalments must come
         * to 100%), so with `action` a rejected submit wiped what the user
         * had typed and silently reverted the controlled fee-model select
         * to its state value, which then posted the wrong model on the
         * retry. Handling submit ourselves keeps the form exactly as it
         * was, which is what the error message is asking them to correct.
         */
        <form
          className={`${PANEL_BODY} space-y-4`}
          onSubmit={(event) => {
            event.preventDefault();
            run(saveFeeTermsAction, new FormData(event.currentTarget), "Agreement saved");
          }}
        >
          <input type="hidden" name="clientId" value={clientId} />

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="space-y-1.5">
              <span className={LABEL}>Fee model</span>
              <select
                name="feeModel"
                value={model}
                onChange={(e) => setModel(e.target.value as FeeModel)}
                className={FIELD}
              >
                {FEE_MODELS.map((m) => (
                  <option key={m} value={m}>
                    {FEE_MODEL_LABELS[m]}
                  </option>
                ))}
              </select>
            </label>

            {model === "fixed" ? (
              <label className="space-y-1.5">
                <span className={LABEL}>Fixed amount</span>
                <input
                  name="fixedFeeAmount"
                  inputMode="decimal"
                  defaultValue={terms?.fixed_fee_amount ?? ""}
                  className={FIELD}
                />
              </label>
            ) : (
              <label className="space-y-1.5">
                <span className={LABEL}>Percentage</span>
                <input
                  name="feePercentage"
                  inputMode="decimal"
                  placeholder="25"
                  defaultValue={terms?.fee_percentage ?? ""}
                  className={FIELD}
                />
              </label>
            )}

            <label className="space-y-1.5">
              <span className={LABEL}>Currency</span>
              <input
                name="currency"
                maxLength={3}
                placeholder="USD"
                defaultValue={terms?.currency ?? "USD"}
                className={FIELD}
              />
            </label>

            <label className="space-y-1.5">
              <span className={LABEL}>Fee basis</span>
              <select
                name="feeBasis"
                defaultValue={terms?.fee_basis ?? "total_first_year_cash"}
                className={FIELD}
              >
                {FEE_BASES.map((b) => (
                  <option key={b} value={b}>
                    {FEE_BASIS_LABELS[b]}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1.5">
              <span className={LABEL}>Guarantee days</span>
              <input
                name="guaranteeDays"
                inputMode="numeric"
                defaultValue={terms?.guarantee_days ?? 90}
                className={FIELD}
              />
            </label>

            <label className="space-y-1.5">
              <span className={LABEL}>Payment terms days</span>
              <input
                name="paymentTermsDays"
                inputMode="numeric"
                defaultValue={terms?.payment_terms_days ?? 30}
                className={FIELD}
              />
            </label>
          </div>

          {model === "retained" && (
            <RetainerStages stages={plan.length > 0 ? plan : DEFAULT_RETAINER_PLAN} />
          )}

          <label className="space-y-1.5">
            <span className={LABEL}>Notes</span>
            <textarea
              name="notes"
              rows={2}
              defaultValue={terms?.notes ?? ""}
              className="w-full min-w-0 border border-outline-variant bg-surface px-3 py-2 text-body-s text-on-surface focus:border-primary focus:outline-none"
            />
          </label>

          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={pending} className={PANEL_BUTTON}>
              {pending ? "Saving…" : "Save agreement"}
            </button>
            <button
              type="button"
              className={PANEL_BUTTON_QUIET}
              onClick={() => setEditing(false)}
            >
              Cancel
            </button>
            {terms && (
              <button
                type="button"
                disabled={pending}
                className={`${PANEL_BUTTON_QUIET} ml-auto`}
                onClick={() => {
                  const fd = new FormData();
                  fd.set("feeTermsId", terms.id);
                  fd.set("clientId", clientId);
                  run(deleteFeeTermsAction, fd, "Agreement removed");
                }}
              >
                Remove
              </button>
            )}
          </div>
        </form>
      )}
    </Panel>
  );
}

/**
 * The retainer stages.
 *
 * Three fixed rows rather than an add/remove list: every retained search
 * this product has seen bills in thirds, and a variable-length fieldset is
 * a lot of interaction for a case nobody has yet. A blank row is skipped
 * server-side, so two stages work by clearing the third.
 */
function RetainerStages({
  stages,
}: {
  stages: Array<{ label: string; trigger: string; percent_of_fee: number }>;
}) {
  const rows = [0, 1, 2].map((i) => stages[i] ?? { label: "", trigger: "start_date", percent_of_fee: "" });

  return (
    <div className="space-y-2">
      <p className={LABEL}>Instalments — must come to 100%</p>
      {rows.map((row, i) => (
        <div key={i} className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(140px,2fr)_minmax(160px,2fr)_minmax(90px,1fr)]">
          <input
            name="stageLabel"
            defaultValue={row.label}
            placeholder={`Stage ${i + 1}`}
            className={FIELD}
          />
          <select name="stageTrigger" defaultValue={row.trigger} className={FIELD}>
            {FEE_TRIGGERS.map((t) => (
              <option key={t} value={t}>
                {FEE_TRIGGER_LABELS[t]}
              </option>
            ))}
          </select>
          <input
            name="stagePercent"
            inputMode="decimal"
            defaultValue={String(row.percent_of_fee)}
            placeholder="33.333"
            className={FIELD}
          />
        </div>
      ))}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className={LABEL}>{label}</dt>
      <dd className="mt-1 truncate font-mono-label text-mono-label uppercase tracking-wider text-on-surface tabular-nums">
        {value}
      </dd>
    </div>
  );
}
