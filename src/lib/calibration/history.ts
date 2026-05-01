import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import type { CalibrationModel } from "@/lib/ai/role-analysis";

export type CalibrationChangeType =
  | "initial"
  | "recalibration"
  | "manual_edit"
  | "restore";

export type CalibrationHistoryEntry = {
  id: string;
  project_id: string;
  organization_id: string;
  snapshot: Partial<CalibrationModel>;
  change_type: CalibrationChangeType;
  change_reason: string | null;
  feedback_id: string | null;
  changed_by: string | null;
  created_at: string;
};

export type RecordSnapshotInput = {
  change_type: CalibrationChangeType;
  change_reason?: string | null;
  feedback_id?: string | null;
};

/**
 * Append a calibration snapshot to calibration_history. Best-effort —
 * callers should treat failures as non-fatal. The recalibration and
 * onboarding paths catch + log instead of rolling back.
 *
 * organization_id is resolved from the project row server-side so the
 * RLS WITH CHECK passes regardless of caller. changed_by is filled
 * from auth.uid() when an authenticated client is provided.
 */
export async function recordCalibrationSnapshot(
  projectId: string,
  snapshot: Partial<CalibrationModel>,
  meta: RecordSnapshotInput,
  client?: SupabaseClient
): Promise<void> {
  const supabase = client ?? (await createServerSupabaseClient());

  const { data: project } = await supabase
    .from("projects")
    .select("organization_id")
    .eq("id", projectId)
    .single<{ organization_id: string }>();

  if (!project) {
    throw new Error("Cannot snapshot calibration: project not found.");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("calibration_history").insert({
    project_id: projectId,
    organization_id: project.organization_id,
    snapshot,
    change_type: meta.change_type,
    change_reason: meta.change_reason ?? null,
    feedback_id: meta.feedback_id ?? null,
    changed_by: user?.id ?? null,
  });

  if (error) {
    throw new Error(
      `Failed to record calibration snapshot: ${error.message}`
    );
  }
}

export async function loadCalibrationHistory(
  projectId: string
): Promise<CalibrationHistoryEntry[]> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("calibration_history")
    .select(
      "id, project_id, organization_id, snapshot, change_type, change_reason, feedback_id, changed_by, created_at"
    )
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(
      `Failed to load calibration history: ${error.message}`
    );
  }
  return (data ?? []) as CalibrationHistoryEntry[];
}

/**
 * Compute the per-dimension delta between two calibration snapshots.
 * Used by the History timeline to render +/- chips next to each entry.
 */
export function diffWeights(
  before: Partial<CalibrationModel>,
  after: Partial<CalibrationModel>
): Array<{ dimension: string; before: number; after: number; delta: number }> {
  const a = before.dimension_weights ?? {};
  const b = after.dimension_weights ?? {};
  const keys = Array.from(
    new Set([...Object.keys(a), ...Object.keys(b)])
  );
  const out: Array<{
    dimension: string;
    before: number;
    after: number;
    delta: number;
  }> = [];
  for (const k of keys) {
    const av = (a as Record<string, number>)[k] ?? 0;
    const bv = (b as Record<string, number>)[k] ?? 0;
    if (av === bv) continue;
    out.push({ dimension: k, before: av, after: bv, delta: bv - av });
  }
  return out;
}
