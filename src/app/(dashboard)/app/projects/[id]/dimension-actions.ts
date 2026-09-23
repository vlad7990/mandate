"use server";

// §196 — the approval seam for custom scoring dimensions.
//
// The Calibration Agent proposes; these four acts are the human's half.
// They live in their own file rather than in actions.ts because they
// share one shape — read the calibration model, transform the custom
// dimension list, write it back, re-score — and the shared half is
// worth writing once.
//
// EVERY act here changes what candidates are ranked ON. That is why all
// four re-score and all four snapshot the calibration history under the
// recruiter's own name: a change to the criteria that left the
// leaderboard showing scores computed against the old criteria would be
// the system asserting a ranking it no longer stands behind.

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { requireActionContext } from "@/lib/auth/access";
import { runAction } from "@/lib/actions/run";
import type { ActionResult } from "@/lib/actions/result";
import { recordCalibrationSnapshot } from "@/lib/calibration/history";
import { computeAndStoreScores } from "@/lib/ranking/scoring-engine";
import type { CalibrationModel } from "@/lib/ai/role-analysis";
import {
  CUSTOM_DIMENSIONS_MAX,
  type CustomDimension,
} from "@/lib/ai/onboarding-analysis";
import {
  buildManualDimension,
  customDimensionsOf,
} from "@/lib/calibration/custom-dimensions";

/** Sentence subject for a failure this file did not author. */
const SUBJECT = "The scoring dimension";

type ProjectRow = {
  id: string;
  organization_id: string | null;
  calibration_model: Partial<CalibrationModel> | null;
};

/**
 * The shared half. Loads the mandate under the caller's capability,
 * hands the current custom dimensions to `mutate`, persists what comes
 * back, re-scores, and snapshots.
 *
 * `mutate` returns null to mean "nothing to do" — an idempotent no-op
 * rather than an error, so a double-click on Approve is harmless.
 */
async function withCustomDimensions(
  projectId: string,
  reasonFor: (next: CustomDimension[]) => string,
  mutate: (current: CustomDimension[]) => CustomDimension[] | null
): Promise<CustomDimension[]> {
  if (!projectId) throw new Error("Missing projectId.");

  const auth = await requireActionContext("mandates:write");
  const supabase = await createServerSupabaseClient();

  const { data: project } = await supabase
    .from("projects")
    .select("id, organization_id, calibration_model")
    .eq("id", projectId)
    .maybeSingle<ProjectRow>();
  if (!project) throw new Error("Project not found.");
  if (
    project.organization_id &&
    project.organization_id !== auth.organizationId
  ) {
    throw new Error("Project belongs to a different organisation.");
  }

  const current = customDimensionsOf(project.calibration_model);
  const next = mutate(current);
  if (next === null) return current;

  const updated: Partial<CalibrationModel> = {
    ...(project.calibration_model ?? {}),
    custom_dimensions: next,
  };

  const { error: updateErr } = await supabase
    .from("projects")
    .update({
      calibration_model: updated,
      updated_at: new Date().toISOString(),
    })
    .eq("id", projectId);
  if (updateErr) {
    throw new Error(`Failed to save the dimension: ${updateErr.message}`);
  }

  const reason = reasonFor(next);

  // Re-score so the leaderboard is computed against the criteria that
  // are now in force. A failure here keeps the change — the next visit
  // to the ranking page scores anyway — matching the contract
  // applyRecalibration and the health-suggestion apply already use.
  try {
    await computeAndStoreScores(projectId, undefined, {
      trigger: { trigger: "weights_edit", summary: reason },
    });
  } catch (err) {
    console.error(
      "[custom-dimensions] scoring re-run failed (change kept)",
      err
    );
  }

  // The snapshot wears the RECRUITER's face: approving a dimension is
  // their decision, not the agent's — that is the whole point of the
  // gate. `recordCalibrationSnapshot` fills changed_by from auth.uid().
  try {
    await recordCalibrationSnapshot(projectId, updated, {
      change_type: "recalibration",
      change_reason: reason,
    });
  } catch (err) {
    console.error("[custom-dimensions] history snapshot failed", err);
  }

  revalidatePath(`/app/projects/${projectId}`);
  revalidatePath(`/app/projects/${projectId}/ranking`);
  revalidatePath(`/app/projects/${projectId}/comparison`);
  revalidatePath(`/app/projects/${projectId}/candidates`);

  return next;
}

/**
 * Sign for a proposed dimension. From this moment it scores: the parser
 * is handed the key on every subsequent CV, and the weighted average
 * counts it for every candidate who has a score on it.
 *
 * Candidates already on the mandate have NOT been assessed on it. They
 * are excluded from the axis rather than scored zero (see
 * `weightedOverall`), and the panel says so — approving must not
 * silently invent measurements that never happened.
 */
export async function approveCustomDimensionAction(
  projectId: string,
  key: string
): Promise<ActionResult<CustomDimension[]>> {
  return runAction(SUBJECT, async () =>
    withCustomDimensions(
      projectId,
      (next) => {
        const dim = next.find((d) => d.key === key);
        return `Custom dimension approved: ${dim?.label ?? key} (weight ${dim?.weight ?? 0}/10). Candidates are now ranked on this axis.`;
      },
      (current) => {
        const target = current.find((d) => d.key === key);
        if (!target) throw new Error("That dimension is no longer on this mandate.");
        if (target.status === "approved") return null; // idempotent
        return current.map((d) =>
          d.key === key ? { ...d, status: "approved" as const } : d
        );
      }
    )
  );
}

/**
 * Remove a dimension — whether proposed or approved.
 *
 * Removal is a delete, not an un-approve, and it is deliberately total:
 * the key stops being scored on the next run, and candidate rows keep
 * their stored score for it harmlessly, because the scoring engine reads
 * the mandate's approved list as authority rather than whatever the
 * profile happens to hold. Re-adding a dimension with the same label
 * mints a fresh key, so an old score can never silently reattach to a
 * new definition.
 */
export async function removeCustomDimensionAction(
  projectId: string,
  key: string
): Promise<ActionResult<CustomDimension[]>> {
  return runAction(SUBJECT, async () => {
    let removed: CustomDimension | undefined;
    return withCustomDimensions(
      projectId,
      () =>
        `Custom dimension removed: ${removed?.label ?? key}. It no longer contributes to any score.`,
      (current) => {
        removed = current.find((d) => d.key === key);
        if (!removed) return null; // idempotent
        return current.filter((d) => d.key !== key);
      }
    );
  });
}

/**
 * Re-weight an approved dimension. Proposed dimensions are not
 * re-weightable: tuning something that scores nothing is a control that
 * implies an effect it doesn't have.
 */
export async function setCustomDimensionWeightAction(
  projectId: string,
  key: string,
  weight: number
): Promise<ActionResult<CustomDimension[]>> {
  return runAction(SUBJECT, async () => {
    const clamped = Math.max(0, Math.min(10, Math.round(Number(weight))));
    if (!Number.isFinite(clamped)) throw new Error("Weight must be 0–10.");

    return withCustomDimensions(
      projectId,
      (next) => {
        const dim = next.find((d) => d.key === key);
        return `Custom dimension re-weighted: ${dim?.label ?? key} → ${clamped}/10.`;
      },
      (current) => {
        const target = current.find((d) => d.key === key);
        if (!target) throw new Error("That dimension is no longer on this mandate.");
        if (target.status !== "approved") {
          throw new Error("Approve the dimension before setting its weight.");
        }
        if (target.weight === clamped) return null;
        return current.map((d) =>
          d.key === key ? { ...d, weight: clamped } : d
        );
      }
    );
  });
}

/**
 * Author a dimension by hand. The escape hatch for what the agent
 * missed — never the expected path, which is why the panel puts it
 * behind a disclosure rather than in front of the proposals.
 *
 * Lands APPROVED: the gate exists to put a human between an agent's
 * invention and a candidate's rank, and here the human IS the author.
 */
export async function addCustomDimensionAction(
  projectId: string,
  input: { label: string; definition: string; weight: number }
): Promise<ActionResult<CustomDimension[]>> {
  return runAction(SUBJECT, async () => {
    let added: CustomDimension | undefined;
    return withCustomDimensions(
      projectId,
      () =>
        `Custom dimension added by the recruiter: ${added?.label} (weight ${added?.weight}/10).`,
      (current) => {
        if (current.length >= CUSTOM_DIMENSIONS_MAX) {
          throw new Error(
            `A mandate carries at most ${CUSTOM_DIMENSIONS_MAX} custom dimensions. Remove one first.`
          );
        }
        const built = buildManualDimension(input, current);
        if (!built.ok) throw new Error(built.error);
        added = built.dimension;
        return [...current, built.dimension];
      }
    );
  });
}
