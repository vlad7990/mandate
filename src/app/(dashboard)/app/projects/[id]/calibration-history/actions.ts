"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { computeAndStoreScores } from "@/lib/ranking/scoring-engine";
import { recordCalibrationSnapshot } from "@/lib/calibration/history";
import type { CalibrationModel } from "@/lib/ai/role-analysis";

async function requireActiveUser(): Promise<{
  userId: string;
  organizationId: string;
}> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthenticated.");
  const { data: profile, error } = await supabase
    .from("users")
    .select("organization_id, status")
    .eq("id", user.id)
    .single<{ organization_id: string | null; status: string }>();
  if (error || !profile?.organization_id || profile.status !== "active") {
    throw new Error("Account is not provisioned.");
  }
  return { userId: user.id, organizationId: profile.organization_id };
}

export async function restoreCalibrationSnapshotAction(
  projectId: string,
  snapshotId: string
): Promise<void> {
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
  // reflects the rollback. Movement chips will show why each candidate
  // moved, citing the restore as trigger.
  try {
    await computeAndStoreScores(projectId, undefined, {
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
}
