"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { requireActionContext } from "@/lib/auth/access";
import { runRankerScoring } from "@/lib/ranking/agent-ranker";
import { recordCalibrationSnapshot } from "@/lib/calibration/history";
import type { CalibrationModel } from "@/lib/ai/role-analysis";
import { runAction } from "@/lib/actions/run";
import type { ActionResult } from "@/lib/actions/result";

/** Sentence subject for a failure this file did not author. See `runAction`. */
const SUBJECT = "The snapshot restore";

async function requireActiveUser(): Promise<{
  userId: string;
  organizationId: string;
}> {
  return requireActionContext("mandates:write");
}

export async function restoreCalibrationSnapshotAction(
  projectId: string,
  snapshotId: string
): Promise<ActionResult> {
  return runAction(SUBJECT, async () => {
    if (!projectId || !snapshotId) {
      throw new Error("Missing projectId or snapshotId.");
    }
    const auth = await requireActiveUser();
    const supabase = await createServerSupabaseClient();

    const { data: snap, error } = await supabase
      .from("calibration_history")
      .select("snapshot, project_id, organization_id")
      .eq("id", snapshotId)
      .single<{
        snapshot: Partial<CalibrationModel>;
        project_id: string;
        organization_id: string;
      }>();

    if (error || !snap) throw new Error("Snapshot not found.");
    if (snap.project_id !== projectId) {
      throw new Error("Snapshot does not belong to this project.");
    }
    if (snap.organization_id !== auth.organizationId) {
      throw new Error("Snapshot belongs to a different organisation.");
    }

    const { error: updateErr } = await supabase
      .from("projects")
      .update({
        calibration_model: snap.snapshot,
        updated_at: new Date().toISOString(),
      })
      .eq("id", projectId);
    if (updateErr) {
      throw new Error(`Failed to restore calibration: ${updateErr.message}`);
    }

    // Record the restore as its own snapshot so the timeline shows it
    // explicitly — and so a future restore can target the restore event
    // itself if the recruiter reverses course again.
    try {
      await recordCalibrationSnapshot(projectId, snap.snapshot, {
        change_type: "restore",
        change_reason: `Restored snapshot ${snapshotId.slice(0, 8)}`,
      });
    } catch (err) {
      console.error("[restore] history snapshot failed", err);
    }

    // Recompute scores under the restored weights so the leaderboard
    // reflects the rollback — under the RANKER's session (075), with
    // the restore named as the trigger. The restore itself is already
    // persisted above; a refused ranker skips with the reason logged
    // and the leaderboard catches up on the next lawful run.
    try {
      await runRankerScoring(projectId, {
        trigger: {
          trigger: "weights_edit",
          summary: "Restored from calibration history",
        },
      });
    } catch (err) {
      console.error("[restore] scoring re-run failed", err);
    }

    revalidatePath(`/app/projects/${projectId}/calibration-history`);
    revalidatePath(`/app/projects/${projectId}`);
    revalidatePath(`/app/projects/${projectId}/ranking`);
  });
}
