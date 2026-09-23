"use client";

// §196 — the panel where an agent's proposal becomes a criterion, or
// doesn't.
//
// Two things this surface has to get right, because both are ways of
// asserting what the system does not know:
//
//   1. A PROPOSED dimension must never look like it is scoring. It is
//      rendered dimmed, badged, and its weight is shown as what it
//      WOULD be, not as a live number.
//   2. An APPROVED dimension that existing candidates were never
//      measured on must say so. Approving does not retroactively
//      assess anyone, and a clean-looking axis on a leaderboard where
//      half the pool is unscored would read as a measurement that
//      never happened.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { IconCheck, IconClose, IconPlus, IconSpark } from "@/components/icons";
import {
  PANEL_BODY,
  PANEL_BUTTON,
  PANEL_BUTTON_QUIET,
  Panel,
  PanelMeta,
} from "@/components/projects/panel";
import {
  CUSTOM_DEFINITION_MAX,
  CUSTOM_DIMENSIONS_MAX,
  CUSTOM_LABEL_MAX,
  DIMENSION_KEYS,
  type CustomDimension,
  type DimensionWeights,
} from "@/lib/ai/onboarding-analysis";
import {
  addCustomDimensionAction,
  approveCustomDimensionAction,
  removeCustomDimensionAction,
  setCustomDimensionWeightAction,
} from "./dimension-actions";
import { unwrap } from "@/lib/actions/result";

type Props = {
  projectId: string;
  initial: CustomDimension[];
  weights: DimensionWeights | null;
  /** Candidates on this mandate carrying no score for a given custom
   * dimension key. Drives the honest-absence line under each approved
   * axis. */
  unassessedByKey: Record<string, number>;
  /** Readers without mandates:write get the state, never the controls. */
  canWrite: boolean;
};

export function ScoringDimensionsPanel({
  projectId,
  initial,
  weights,
  unassessedByKey,
  canWrite,
}: Props) {
  const router = useRouter();
  const [dimensions, setDimensions] = useState<CustomDimension[]>(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [, start] = useTransition();
  const [adding, setAdding] = useState(false);

  const proposed = dimensions.filter((d) => d.status === "proposed");
  const approved = dimensions.filter((d) => d.status === "approved");
  const atCap = dimensions.length >= CUSTOM_DIMENSIONS_MAX;

  /**
   * `work` returns the already-unwrapped dimensions rather than the
   * ActionResult: every call site below therefore reads
   * `unwrap(await someAction(...))` literally, which is what the
   * call-sites guard checks for and what the ActionResult contract
   * actually asks of a client component.
   */
  function run(
    key: string,
    work: () => Promise<CustomDimension[]>,
    success: string
  ) {
    setBusy(key);
    start(async () => {
      try {
        setDimensions(await work());
        toast.success(success);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "That didn't work.");
      } finally {
        setBusy(null);
      }
    });
  }

  return (
    <Panel
      title="Scoring dimensions"
      tone={proposed.length > 0 ? "notice" : "default"}
      meta={
        <PanelMeta>
          {approved.length === 0 && proposed.length === 0
            ? "5 core axes"
            : `${DIMENSION_KEYS.length + approved.length} scoring · ${
                proposed.length > 0 ? `${proposed.length} awaiting approval` : "none pending"
              }`}
        </PanelMeta>
      }
    >
      <div className={cn(PANEL_BODY, "space-y-5")}>
        {/* The five. Stated, not editable here — the weights are the
            Calibration Agent's and the optimizer's to move, and a second
            control for them on this panel would be a second source of
            truth for the same number. */}
        <div className="space-y-2">
          <div className="font-mono-label text-mono-label uppercase tracking-wider text-outline">
            Core dimensions
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
            {DIMENSION_KEYS.map((k) => (
              <div
                key={k}
                className="border border-outline-variant bg-surface-container-lowest px-3 py-2"
              >
                <div className="font-mono-label text-mono-label uppercase tracking-wider text-on-surface-variant">
                  {k}
                </div>
                <div className="text-on-surface text-body-main font-semibold">
                  {weights?.[k] ?? "—"}
                  <span className="text-outline text-mono-label font-mono-label">
                    /10
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Proposals. The agent's claim, awaiting a human. */}
        {proposed.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <IconSpark size={13} className="text-tertiary" />
              <span className="font-mono-label text-mono-label uppercase tracking-wider text-tertiary">
                Proposed by the Calibration Agent
              </span>
            </div>
            <p className="text-on-surface-variant text-body-main leading-snug">
              These are not scoring anything. Approve one and it joins the
              weighted average for every candidate assessed on it from that
              point on; dismiss it and it leaves the mandate.
            </p>
            {proposed.map((d) => (
              <DimensionRow
                key={d.key}
                dimension={d}
                unassessed={unassessedByKey[d.key] ?? 0}
                busy={busy === d.key}
                canWrite={canWrite}
                onApprove={() =>
                  run(
                    d.key,
                    async () =>
                      unwrap(await approveCustomDimensionAction(projectId, d.key)),
                    `"${d.label}" now counts toward the ranking.`
                  )
                }
                onRemove={() =>
                  run(
                    d.key,
                    async () =>
                      unwrap(await removeCustomDimensionAction(projectId, d.key)),
                    `"${d.label}" dismissed.`
                  )
                }
              />
            ))}
          </div>
        )}

        {/* Approved. These score. */}
        {approved.length > 0 && (
          <div className="space-y-2">
            <div className="font-mono-label text-mono-label uppercase tracking-wider text-outline">
              Custom dimensions · scoring
            </div>
            {approved.map((d) => (
              <DimensionRow
                key={d.key}
                dimension={d}
                unassessed={unassessedByKey[d.key] ?? 0}
                busy={busy === d.key}
                canWrite={canWrite}
                onWeight={(w) =>
                  run(
                    d.key,
                    async () =>
                      unwrap(
                        await setCustomDimensionWeightAction(projectId, d.key, w)
                      ),
                    `"${d.label}" re-weighted to ${w}/10.`
                  )
                }
                onRemove={() =>
                  run(
                    d.key,
                    async () =>
                      unwrap(await removeCustomDimensionAction(projectId, d.key)),
                    `"${d.label}" removed. It no longer contributes to any score.`
                  )
                }
              />
            ))}
          </div>
        )}

        {approved.length === 0 && proposed.length === 0 && (
          <p className="text-on-surface-variant text-body-main leading-snug">
            This mandate is scored on the five core dimensions. The
            Calibration Agent proposes an industry-specific axis only when
            the five can&apos;t honestly carry the signal — for most roles
            they can, so none here is the expected result, not a gap. You
            can add one by hand if you know of one it missed.
          </p>
        )}

        {canWrite &&
          (adding ? (
            <AddDimensionForm
              onCancel={() => setAdding(false)}
              busy={busy === "__add__"}
              onSubmit={(input) => {
                run(
                  "__add__",
                  async () =>
                    unwrap(await addCustomDimensionAction(projectId, input)),
                  `"${input.label}" added and scoring.`
                );
                setAdding(false);
              }}
            />
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              disabled={atCap}
              className={PANEL_BUTTON_QUIET}
              title={
                atCap
                  ? `A mandate carries at most ${CUSTOM_DIMENSIONS_MAX} custom dimensions.`
                  : undefined
              }
            >
              <IconPlus size={13} />
              {atCap ? `Limit ${CUSTOM_DIMENSIONS_MAX} reached` : "Add a dimension"}
            </button>
          ))}
      </div>
    </Panel>
  );
}

function DimensionRow({
  dimension,
  unassessed,
  busy,
  canWrite,
  onApprove,
  onWeight,
  onRemove,
}: {
  dimension: CustomDimension;
  unassessed: number;
  busy: boolean;
  canWrite: boolean;
  onApprove?: () => void;
  onWeight?: (weight: number) => void;
  onRemove?: () => void;
}) {
  const isProposed = dimension.status === "proposed";

  return (
    <div
      className={cn(
        "border px-3 py-3 space-y-2",
        isProposed
          ? "border-tertiary/40 bg-tertiary/5"
          : "border-outline-variant bg-surface-container-lowest"
      )}
    >
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-on-surface text-body-main font-semibold">
          {dimension.label}
        </span>
        <span className="font-mono-label text-mono-label uppercase tracking-wider text-outline">
          {/* A proposed weight is conditional, and says so. */}
          {isProposed
            ? `would weigh ${dimension.weight}/10`
            : `weight ${dimension.weight}/10`}
        </span>
        {dimension.origin === "recruiter" && (
          <span className="font-mono-label text-mono-label uppercase tracking-wider text-outline">
            · added by you
          </span>
        )}
      </div>

      <p className="text-on-surface-variant text-body-main leading-snug">
        {dimension.definition}
      </p>

      {dimension.rationale && isProposed && (
        <p className="text-outline text-body-main leading-snug italic">
          {dimension.rationale}
        </p>
      )}

      {/* Honest absence. Approving an axis does not measure anyone who
          was already parsed — they are excluded from it rather than
          scored zero, and the reader has to be told which. */}
      {!isProposed && unassessed > 0 && (
        <p className="font-mono-label text-mono-label uppercase tracking-wider text-warn">
          {unassessed} candidate{unassessed === 1 ? "" : "s"} not assessed on
          this axis — excluded from it, not scored zero
        </p>
      )}

      {canWrite && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {onApprove && (
            <button
              type="button"
              onClick={onApprove}
              disabled={busy}
              className={PANEL_BUTTON}
            >
              <IconCheck size={13} />
              Approve
            </button>
          )}
          {onWeight && (
            <label className="flex items-center gap-2 font-mono-label text-mono-label uppercase tracking-wider text-outline">
              Weight
              <input
                type="number"
                min={0}
                max={10}
                defaultValue={dimension.weight}
                disabled={busy}
                onBlur={(e) => {
                  const v = Number(e.currentTarget.value);
                  if (Number.isFinite(v) && v !== dimension.weight) onWeight(v);
                }}
                className="w-16 border border-outline-variant bg-surface-container-lowest px-2 py-1 text-on-surface"
              />
            </label>
          )}
          {onRemove && (
            <button
              type="button"
              onClick={onRemove}
              disabled={busy}
              className={PANEL_BUTTON_QUIET}
            >
              <IconClose size={13} />
              {isProposed ? "Dismiss" : "Remove"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function AddDimensionForm({
  onSubmit,
  onCancel,
  busy,
}: {
  onSubmit: (input: {
    label: string;
    definition: string;
    weight: number;
  }) => void;
  onCancel: () => void;
  busy: boolean;
}) {
  const [label, setLabel] = useState("");
  const [definition, setDefinition] = useState("");
  const [weight, setWeight] = useState(5);

  return (
    <div className="border border-outline-variant bg-surface-container-lowest px-3 py-3 space-y-3">
      <div className="font-mono-label text-mono-label uppercase tracking-wider text-outline">
        New dimension
      </div>
      <input
        value={label}
        maxLength={CUSTOM_LABEL_MAX}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="FX options market-making depth"
        className="w-full border border-outline-variant bg-surface-container-low px-3 py-2 text-on-surface text-body-main"
      />
      <textarea
        value={definition}
        maxLength={CUSTOM_DEFINITION_MAX}
        onChange={(e) => setDefinition(e.target.value)}
        rows={3}
        placeholder="What does a 10 look like, and what does a 0 look like? This is the text a CV gets scored against, so name the experience, instruments, scale or accountability that evidences it."
        className="w-full border border-outline-variant bg-surface-container-low px-3 py-2 text-on-surface text-body-main leading-snug"
      />
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 font-mono-label text-mono-label uppercase tracking-wider text-outline">
          Weight
          <input
            type="number"
            min={0}
            max={10}
            value={weight}
            onChange={(e) => setWeight(Number(e.target.value))}
            className="w-16 border border-outline-variant bg-surface-container-low px-2 py-1 text-on-surface"
          />
        </label>
        <button
          type="button"
          disabled={busy}
          onClick={() => onSubmit({ label, definition, weight })}
          className={PANEL_BUTTON}
        >
          <IconPlus size={13} />
          Add
        </button>
        <button type="button" onClick={onCancel} className={PANEL_BUTTON_QUIET}>
          Cancel
        </button>
      </div>
      <p className="text-outline text-mono-label font-mono-label leading-snug">
        Candidates already on this mandate have not been assessed on a new
        axis. They are excluded from it until re-parsed — never scored zero.
      </p>
    </div>
  );
}
